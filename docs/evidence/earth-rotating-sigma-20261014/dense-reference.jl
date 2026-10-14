# Independent scalar-loop oracle. It does not call the candidate tendency,
# its reconstruction, or C8 discrete_gradient; also used by the RK4 reference.
function oracle(c,lat,lon,omega,p,v)
    n=length(p);ne,nl=size(v);T=eltype(p);g=c.g
    x,ee,nn=xyz_basis(lat,lon);U=zeros(T,n,nl,2);K=zeros(T,n,nl)
    dirs=zeros(T,ne,2,2);pf=zeros(T,ne);h=g.edgeLength.*g.centerDistance
    for e in 1:ne
        a,b=g.from[e],g.to[e];pf[e]=(p[a]+p[b])/2
        for (side,i) in enumerate((a,b))
            dirs[e,side,1]=dot(x[b,:]-x[a,:],ee[i,:])/(2g.centerDistance[e])
            dirs[e,side,2]=dot(x[b,:]-x[a,:],nn[i,:])/(2g.centerDistance[e])
            for k in 1:nl
                for d in 1:2;U[i,k,d]+=dirs[e,side,d]*h[e]*pf[e]*v[e,k]/(g.area[i]*p[i]);end
                K[i,k]+=h[e]*v[e,k]^2/(4g.area[i])
            end
        end
    end
    curl=zeros(T,n,nl);L=zeros(T,n,nl)
    for e in 1:ne,k in 1:nl
        a,b=g.from[e],g.to[e];jr=zero(T)
        for (side,i) in enumerate((a,b));jr+=dirs[e,side,1]*U[i,k,2]-dirs[e,side,2]*U[i,k,1];end
        rate=h[e]/(g.radius*g.centerDistance[e])
        curl[a,k]+=rate*jr/g.area[a];curl[b,k]-=rate*jr/g.area[b]
        L[a,k]+=rate*pf[e]*v[e,k]*c.ds[k];L[b,k]-=rate*pf[e]*v[e,k]*c.ds[k]
    end
    pdot=[-sum(L[i,k] for k in 1:nl)/g.area[i] for i in 1:n]
    F=zeros(T,n,nl+1)
    for i in 1:n,k in 1:nl;F[i,k+1]=F[i,k]-L[i,k]-g.area[i]*c.ds[k]*pdot[i];end
    rotation=zeros(T,ne,nl);vorticity=similar(rotation);fill!(vorticity,0)
    layer=zeros(T,ne,nl);vertical=zeros(T,ne,nl);pressure=zeros(T,ne,nl)
    kbar=[sum(c.ds[k]*K[i,k] for k in 1:nl) for i in 1:n]
    for e in 1:ne
        a,b=g.from[e],g.to[e];rd=g.radius*g.centerDistance[e]
        for k in 1:nl
            for (side,i) in enumerate((a,b))
                crossv=dirs[e,side,1]*U[i,k,2]-dirs[e,side,2]*U[i,k,1]
                rotation[e,k]+=2dot(omega,x[i,:])*crossv
                vorticity[e,k]+=curl[i,k]*crossv
            end
            layer[e,k]=(K[a,k]-kbar[a]-K[b,k]+kbar[b])/rd
            pressure[e,k]=(c.c2*(log(p[a]/c.pref[a])-log(p[b]/c.pref[b]))+kbar[a]-kbar[b])/rd
        end
        for k in 1:nl-1
            q=h[e]/2*(F[a,k+1]/g.area[a]+F[b,k+1]/g.area[b])
            change=q*(v[e,k]-v[e,k+1])/2
            vertical[e,k]+=change/(h[e]*pf[e]*c.ds[k])
            vertical[e,k+1]+=change/(h[e]*pf[e]*c.ds[k+1])
        end
    end
    neutral=rotation+vorticity+layer+vertical
    (pdot=pdot,vdot=pressure+neutral,total=neutral,rotation=rotation,vorticity=vorticity,
     layerGradient=layer,vertical=vertical,curl=curl,verticalFlux=F,U=U,K=K)
end
function reference_rk4(c,lat,lon,omega,p,v,dt,steps)
    p=copy(p);v=copy(v)
    for _ in 1:steps
        a=oracle(c,lat,lon,omega,p,v)
        b=oracle(c,lat,lon,omega,p+dt/2*a.pdot,v+dt/2*a.vdot)
        d=oracle(c,lat,lon,omega,p+dt/2*b.pdot,v+dt/2*b.vdot)
        e=oracle(c,lat,lon,omega,p+dt*d.pdot,v+dt*d.vdot)
        p+=dt/6*(a.pdot+2b.pdot+2d.pdot+e.pdot)
        v+=dt/6*(a.vdot+2b.vdot+2d.vdot+e.vdot)
    end
    p,v
end
