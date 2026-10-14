function independent(c,lat,lon,F)
    n=length(lat);nl=length(c.ds);ne=length(c.g.from)
    x=hcat(cos.(lat).*cos.(lon),cos.(lat).*sin.(lon),sin.(lat))
    e=hcat(-sin.(lon),cos.(lon),zeros(n));v=hcat(-sin.(lat).*cos.(lon),-sin.(lat).*sin.(lon),cos.(lat))
    P=zeros(ne,2n)
    for k in 1:ne
        a,b=c.g.from[k],c.g.to[k];delta=x[b,:]-x[a,:]
        for t in (a,b)
            P[k,t]=c.pref[t]*dot(delta,e[t,:])/(2c.g.centerDistance[k])
            P[k,t+n]=c.pref[t]*dot(delta,v[t,:])/(2c.g.centerDistance[k])
        end
    end
    P=kron(Matrix{Float64}(I,nl,nl),P)
    H=vec((c.g.edgeLength.*c.g.centerDistance./c.prefFace)*c.ds')
    M=reduce(vcat,[repeat(c.g.area.*c.pref*c.ds[k],2) for k in 1:nl])
    R=Diagonal(1 ./M)*P'*Diagonal(H)
    a=vcat([c.g.from.+n*(k-1) for k in 1:nl]...,[collect(1:n).+n*(k-1) for k in 1:nl-1]...)
    b=vcat([c.g.to.+n*(k-1) for k in 1:nl]...,[collect(1:n).+n*k for k in 1:nl-1]...)
    idx(t,q)=2n*div(t-1,n)+mod(t-1,n)+1+(q-1)*n
    N=zeros(2n*nl,2n*nl)
    losses=[]
    for k in eachindex(F)
        aa,bb=F[k]>=0 ? (a[k],b[k]) : (b[k],a[k]);f=abs(F[k]);na=mod(aa-1,n)+1;nb=mod(bb-1,n)+1
        axis=cross(x[na,:],x[nb,:]);s=norm(axis);angle=atan(s,dot(x[na,:],x[nb,:]))
        Q=Matrix{Float64}(I,3,3)
        if s>1e-14
            axis/=s;K=[0. -axis[3] axis[2];axis[3] 0. -axis[1];-axis[2] axis[1] 0.]
            Q=cos(angle)*I+(1-cos(angle))*(axis*axis')+sin(angle)*K
        end
        T=hcat(e[nb,:],v[nb,:])'*Q*hcat(e[na,:],v[na,:])
        ia=[idx(aa,q) for q in 1:2];ib=[idx(bb,q) for q in 1:2]
        N[ia,ia]-=f/2*I;N[ib,ib]-=f/2*I;N[ib,ia]+=f*T
        push!(losses,(ia,ib,f,T))
    end
    (P=P,R=R,M=M,H=H,N=N,L=P*Diagonal(1 ./M)*N*R,losses=losses)
end
