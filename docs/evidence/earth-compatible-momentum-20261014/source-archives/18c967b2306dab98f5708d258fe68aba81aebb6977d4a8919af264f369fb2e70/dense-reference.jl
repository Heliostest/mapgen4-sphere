# Independent dense Cartesian/Rodrigues reference, used only in tests.
function dense_reference(m,F)
    c=m.rotation.c;n=length(c.pref);nl=length(c.ds);g=m.connection
    N=zeros(2n*nl,2n*nl);x,e,z=xyz_basis(g.lat,g.lon)
    ix(a,k)=div(a-1,n)*2n+mod(a-1,n)+1+(k-1)*n
    for k in eachindex(F)
        a,b=F[k]>=0 ? (g.from[k],g.to[k]) : (g.to[k],g.from[k]);f=abs(F[k])
        v=cross(x[a,:],x[b,:]);d=dot(x[a,:],x[b,:])
        K=[0. -v[3] v[2];v[3] 0. -v[1];-v[2] v[1] 0.]
        Q=I+K+K*K/(1+d);T=hcat(e[b,:],z[b,:])'*Q*hcat(e[a,:],z[a,:])
        for p in 1:2
            N[ix(a,p),ix(a,p)]-=f/2;N[ix(b,p),ix(b,p)]-=f/2
            for q in 1:2;N[ix(b,p),ix(a,q)]+=f*T[p,q];end
        end
    end
    P=kron(Matrix{Float64}(I,nl,nl),Matrix(m.rotation.P));R=kron(Matrix{Float64}(I,nl,nl),Matrix(m.rotation.R))
    M=vcat([repeat(c.g.area.*c.pref*c.ds[k],2) for k in 1:nl]...)
    H=vec((c.g.edgeLength.*c.g.centerDistance./c.prefFace)*transpose(c.ds))
    (L=P*Diagonal(1 ./M)*N*R,N=N,P=P,R=R,M=M,H=H)
end
