include("../../docs/evidence/earth-pressure-waves-20261015/common.jl")
include("../../docs/evidence/earth-pressure-waves-20261015/wave-core.jl")
include("../../docs/evidence/earth-pressure-waves-20261015/wave-cases.jl")
Random.seed!(11015)
results=Dict{String,Any}()
@testset "Independent direct operator and nonlinear audit" begin
    c,lat,lon=small_core(ds=[.2,.3,.5],radius=1.7,c2=2.3)
    n=length(c.pref);ne=length(c.prefFace);g=c.g
    # Construct signs/weights directly from endpoints, independently of stored G/D/K.
    B=zeros(n,ne)
    for e in 1:ne;B[g.from[e],e]=1.;B[g.to[e],e]=-1.;end
    G=Diagonal(1 ./ (g.radius*g.centerDistance))*B'
    D=B*Diagonal(g.edgeLength/g.radius)
    pf=(c.pref[g.from]+c.pref[g.to])/2
    M=Diagonal(g.area.*c.pref);H=Diagonal(g.edgeLength.*g.centerDistance.*pf)
    K=D*Diagonal(pf)*G
    A=[zeros(n,n) -(M\(D*Diagonal(pf)));c.c2*G zeros(ne,ne)]
    W=cat(c.c2*M,H;dims=(1,2))
    @test norm(G-Matrix(c.gradient))<1e-14
    @test norm(D-Matrix(c.divergence))<1e-14
    @test norm(K-Matrix(c.stiffness))<1e-14
    @test norm(W*A+A'*W)<1e-13
    r=randn(n);v=randn(ne);y=vcat(r,v);dt=.07;T=1.12
    step=wave_step(c,r,v,dt)
    cayley=(I-dt*A/2)\((I+dt*A/2)*y)
    @test norm(vcat(step...)-cayley)<2e-14
    @test r==y[1:n]&&v==y[n+1:end]
    reverse=wave_step(c,step...,-dt)
    @test norm(vcat(reverse...)-y)<3e-14
    exact=exp(T*A)*y
    errors=[]
    for steps in (16,32,64)
        rr,vv=copy(r),copy(v);s=WaveStepper(c,T/steps)
        for _ in 1:steps;rr,vv=wave_step(s,rr,vv);end
        push!(errors,(pressure=norm(rr-exact[1:n]),velocity=norm(vv-exact[n+1:end])))
    end
    for key in (:pressure,:velocity)
        ee=[getproperty(e,key) for e in errors]
        @test 3.95<ee[2]/ee[3]<4.05
    end
    # Independently recover modal reference including arbitrary constant pressure and circulation.
    sm=sqrt.(diag(M));E=eigen(Symmetric(c.c2*Diagonal(1 ./sm)*K*Diagonal(1 ./sm)))
    null=findall(x->abs(x)<1e-11,E.values)
    @test length(null)==1&&abs(dot(E.vectors[:,null[1]],sm))/norm(sm)>1-1e-12
    a=E.vectors'*(sm.*r);b=E.vectors'*(-D*(pf.*v)./sm)
    rt=zeros(n);integ=zeros(n)
    for j in 1:n
        o=sqrt(max(E.values[j],0.));q=E.vectors[:,j]
        if j in null
            rt+=q*(a[j]+b[j]*T);integ+=q*(a[j]*T+b[j]*T^2/2)
        else
            rt+=q*(a[j]*cos(o*T)+b[j]*sin(o*T)/o)
            integ+=q*(a[j]*sin(o*T)/o+b[j]*(1-cos(o*T))/o^2)
        end
    end
    modal=vcat(rt./sm,v+c.c2*G*(integ./sm))
    @test norm(modal-exact)<4e-13
    stationary=wave_step(c,fill(2.4,n),zeros(ne),dt)
    @test norm(stationary[1].-2.4)+norm(stationary[2])<1e-14
    # Full frozen C9 splitting: omega=0, identical layers, centered finite derivative.
    full=VectorCore(PressureWorkCore(c),lat,lon,zeros(3))
    deriv=[]
    for eps0 in (1e-2,1e-3,1e-4)
        ys=[]
        for sign in (-1,1)
            p=c.pref.*(1 .+sign*eps0*r);velocity=repeat(sign*eps0*v,1,3)
            state=BarotropicState(p,.012mass(c,p),velocity,0.)
            step!(full,state,dt)
            push!(ys,vcat(state.p./c.pref.-1,state.v[:,1]))
        end
        der=(ys[2]-ys[1])/(2eps0)
        push!(deriv,(amplitude=eps0,pressure=norm(der[1:n]-cayley[1:n]),velocity=norm(der[n+1:end]-cayley[n+1:end])))
    end
    for key in (:pressure,:velocity)
        @test getproperty(deriv[1],key)>50getproperty(deriv[2],key)
        @test getproperty(deriv[2],key)>50getproperty(deriv[3],key)
        @test getproperty(deriv[3],key)<1e-7
    end
    # Standing phase uses -r_t/omega; traveling target has +g*sin and negative Gg velocity.
    simple=TransportCore(Geometry([1.,1.],[1],[2],[1.],[1.],1.),ones(2),[1.];c2=1.)
    angle=.71;f=[1.,-1.];om=sqrt(2.);ss=wave_measure(simple,f*cos(angle),[om*sin(angle)],f,zeros(2),om,"standing")
    @test abs(ss.phase-angle)<1e-14&&abs(ss.amplitude-1)<1e-14
    x,_,_=xyz_basis(lat,lon);w=wave_fields(c,x,3,AXES[1],"traveling")
    measured=wave_measure(c,w.f*cos(angle)+w.g*sin(angle),w.v,w.f,w.g,w.omega,"traveling")
    @test abs(measured.phase-angle)<1e-14&&abs(measured.amplitude-1)<1e-14
    @test norm(w.v+c.c2*G*w.g/w.omega)<1e-14
    @test unwrap_phase(3.12,-3.12)>3.12
    @test unwrap_phase(12.5,mod(12.6+pi,2pi)-pi)≈12.6
    for bad in (0.,NaN,Inf,-Inf,floatmax(Float64))
        @test_throws ArgumentError wave_step(c,r,v,bad)
    end
    for (rr,vv) in ((r[1:end-1],v),(r,v[1:end-1]),(reshape(r,:,1),v),(r,reshape(v,:,1)),(fill(NaN,n),v),(r,fill(Inf,ne)))
        @test_throws ArgumentError wave_step(c,rr,vv,dt)
    end
    results["directBlockErrors"]=errors;results["modalVsBlockError"]=norm(modal-exact);results["fullC9CenteredDerivative"]=deriv
    results["cayleyVsEliminatedError"]=norm(vcat(step...)-cayley);results["energySkewResidual"]=norm(W*A+A'*W)
end
write(joinpath("build/c11-independent-review",ENV["AUDIT_NAME"]*".json"),JSON3.write((passed=true,results=results)))
println(JSON3.write(results))
