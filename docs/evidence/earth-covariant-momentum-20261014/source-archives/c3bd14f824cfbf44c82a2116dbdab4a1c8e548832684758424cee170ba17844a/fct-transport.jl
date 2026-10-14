module FluxCorrectedTransport
using SparseArrays,LinearAlgebra
using ..ConservativeCore
export transport_fct

# Row-preconditioned restarted GMRES. The centered operator has a positive
# diagonal and skew off-diagonals; native sparse LU causes avoidable fill-in.
# Every return is checked against the original equation; no residual injection.
function centered_solve(A,rhs,start)
    d=diag(A);all(>(0),d)||throw(StepRejected("nonpositive centered diagonal"))
    invd=1 ./d;b=rhs.*invd;x=copy(start);n=length(x)
    apply(v)=(A*v).*invd
    tol=2e-14*max(norm(b),1e-30);width=min(32,n)
    iterations=0
    for cycle in 1:20
        r=b-apply(x);beta=norm(r)
        beta<=tol && return (solution=x,iterations=iterations)
        V=zeros(n,width+1);H=zeros(width+1,width);cs=zeros(width);sn=zeros(width);g=zeros(width+1)
        V[:,1]=r/beta;g[1]=beta;used=width
        for j in 1:width
            v=apply(view(V,:,j))
            # Two MGS passes avoid losing orthogonality near convergence.
            for pass in 1:2,i in 1:j
                h=dot(view(V,:,i),v);H[i,j]+=h
                v.-=h.*view(V,:,i)
            end
            H[j+1,j]=norm(v);breakdown=H[j+1,j]<=eps(Float64)
            !breakdown&&(V[:,j+1]=v/H[j+1,j])
            for i in 1:j-1
                t=cs[i]*H[i,j]+sn[i]*H[i+1,j]
                H[i+1,j]=-sn[i]*H[i,j]+cs[i]*H[i+1,j];H[i,j]=t
            end
            h=hypot(H[j,j],H[j+1,j]);h>0||throw(StepRejected("centered Krylov breakdown"))
            cs[j]=H[j,j]/h;sn[j]=H[j+1,j]/h;H[j,j]=h;H[j+1,j]=0.
            g[j+1]=-sn[j]*g[j];g[j]*=cs[j];iterations+=1
            if abs(g[j+1])<=tol||breakdown;used=j;break;end
        end
        x+=view(V,:,1:used)*(UpperTriangular(H[1:used,1:used])\g[1:used])
    end
    norm(b-apply(x))<=tol||throw(StepRejected("centered Krylov solve did not converge"))
    (solution=x,iterations=iterations)
end

"""Conservative flux correction of an implicit-upwind low-order state.
The high candidate is centered Crank-Nicolson using the SAME integrated air
transfers. Limit antidiffusive edge transfers against global old-q bounds.
This enforces a global range; it does not assert TVD or local-extremum control.
Final cells are never clipped and inventories are never normalized.
"""
function transport_fct(oldmass,newmass,from,to,F,water;centered_solver=:iterative)
    low=transport_tracer(oldmass,newmass,from,to,F,water)
    mo,mn,w=vec(oldmass),vec(newmass),vec(water);n=length(w);ne=length(F)
    qo=w./mo;ql=vec(low.water)./mn
    rows=Int[];cols=Int[];values=Float64[];rhs=copy(w)
    lowFlux=zeros(ne)
    for e in eachindex(F)
        a,b=from[e],to[e];f=F[e]/4
        push!(rows,a,a,b,b);push!(cols,a,b,a,b);push!(values,f,f,-f,-f)
        v=f*(qo[a]+qo[b]);rhs[a]-=v;rhs[b]+=v
        lowFlux[e]=F[e]*(F[e]>=0 ? ql[a] : ql[b])
    end
    append!(rows,1:n);append!(cols,1:n);append!(values,mn)
    matrix=sparse(rows,cols,values,n,n)
    if centered_solver==:iterative
        solve=centered_solve(matrix,rhs,ql);qh=solve.solution;iterations=solve.iterations
    elseif centered_solver==:direct
        qh=matrix\rhs;iterations=0
    else
        throw(ArgumentError("unknown centered solver"))
    end
    all(isfinite,qh) || throw(StepRejected("nonfinite centered transport"))
    anti=zeros(ne);plus=zeros(n);minus=zeros(n)
    for e in eachindex(F)
        a,b=from[e],to[e]
        anti[e]=F[e]/4*(qo[a]+qo[b]+qh[a]+qh[b])-lowFlux[e]
        if anti[e]>=0;minus[a]+=anti[e];plus[b]+=anti[e]
        else;plus[a]-=anti[e];minus[b]-=anti[e];end
    end
    qmin=minimum(qo);qmax=maximum(qo);wl=vec(low.water)
    roomPlus=max.(0.,mn.*qmax-wl);roomMinus=max.(0.,wl-mn.*qmin)
    rplus=ones(n);rminus=ones(n)
    for i in 1:n
        plus[i]>0&&(rplus[i]=min(1.,roomPlus[i]/plus[i]))
        minus[i]>0&&(rminus[i]=min(1.,roomMinus[i]/minus[i]))
    end
    correction=zeros(n);finalFlux=copy(lowFlux);limited=0;minimumLimiter=1.
    for e in eachindex(F)
        a,b=from[e],to[e];v=anti[e]
        alpha=v>=0 ? min(rminus[a],rplus[b]) : min(rplus[a],rminus[b])
        # Leave a rounding margin only on limited FLUXES, not on output cells.
        if alpha<1;alpha*=1-32eps(Float64);limited+=1;end
        minimumLimiter=min(minimumLimiter,alpha)
        v*=alpha;correction[a]-=v;correction[b]+=v;finalFlux[e]+=v
    end
    wn=similar(w)
    for i in 1:n
        wet=wl[i]+correction[i];dry=(mn[i]-wl[i])-correction[i]
        wn[i]=wet<=dry ? wet : mn[i]-dry
    end
    all(isfinite,wn)&&all(0 .<=wn.<=mn) || throw(StepRejected("corrected wet/dry bound violated"))
    q=wn./mn
    minimum(q)>=qmin-2e-11*max(qmax,1e-30)&&maximum(q)<=qmax+2e-11*max(qmax,1e-30) || throw(StepRejected("corrected old-range bound violated"))
    netAir=zeros(n);netWater=zeros(n)
    for e in eachindex(F)
        a,b=from[e],to[e];netAir[a]-=F[e];netAir[b]+=F[e];netWater[a]-=finalFlux[e];netWater[b]+=finalFlux[e]
    end
    air=mn-mo-netAir;wet=wn-w-netWater;scale=max.(mo,mn)
    (water=reshape(wn,size(water)),waterTransfers=finalFlux,localAirRelativeResidual=maximum(abs.(air)./scale),localWaterRelativeResidual=maximum(abs.(wet)./scale),localDryRelativeResidual=maximum(abs.(air-wet)./scale),limitedEdges=limited,minimumLimiter=minimumLimiter,unlimitedMin=minimum(qh),unlimitedMax=maximum(qh),centeredIterations=iterations,centeredRelativeResidual=maximum(abs.(matrix*qh-rhs)./scale))
end
end
