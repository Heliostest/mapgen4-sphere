include("../../docs/evidence/earth-compatible-momentum-20261014/common.jl")
include("../../docs/evidence/earth-compatible-momentum-20261014/coupled-core.jl")
include("reference-v1.jl")
using .CoupledCompatible

function main()
    c,lat,lon=small_core(ds=[.11,.32,.57]);omega=[-.18,.14,.22]
    rot=RotationMap(c,lat,lon,omega);t=CompatibleTransport(rot,lat,lon);m=CoupledCore(ModalCore(c),t;strength=.37)
    n=length(lat);ne=length(c.prefFace);nl=length(c.ds);rng=MersenneTwister(719)
    p=c.pref.*(1 .+.007randn(rng,n));j=.065randn(rng,ne,nl)
    initial=State(p,mass(c,p)*.012,j,0.)
    empty=independent(c,lat,lon,zeros(length(t.connection.from)))
    B=zeros(n,ne)
    for k in 1:ne;B[c.g.from[k],k]=1;B[c.g.to[k],k]=-1;end
    width=c.g.edgeLength/c.g.radius
    divergence=B*Diagonal(width);gradient=Diagonal(1 ./(c.g.radius*c.g.centerDistance))*B'
    press=c.c2*Diagonal(c.prefFace)*gradient*Diagonal(1 ./c.pref)
    x=hcat(cos.(lat).*cos.(lon),cos.(lat).*sin.(lon),sin.(lat));f=2x*omega
    J=kron(Matrix{Float64}(I,nl,nl),[zeros(n,n) Diagonal(f);-Diagonal(f) zeros(n,n)])
    coriolis=empty.P*J*empty.R
    function rhs(y)
        p=y[1:n];j=reshape(y[n+1:end],ne,nl)
        horizontal=width.*j.*c.ds';div=divergence*j
        pdot=-(div*c.ds)./c.g.area
        vertical=zeros(n,nl-1)
        for k in 1:nl-1
            vertical[:,k]=-sum(div[:,1:k].*c.ds[1:k]';dims=2)-sum(c.ds[1:k])*c.g.area.*pdot
        end
        F=vcat(vec(horizontal),vec(vertical))
        tend=independent(c,lat,lon,F).L*vec(j)
        vcat(pdot,vec(press*p .+ zeros(ne,nl))+coriolis*vec(j)+.37tend)
    end
    function rk4(h)
        y=vcat(initial.p,vec(initial.j))
        for _ in 1:round(Int,.4/h)
            a=rhs(y);b=rhs(y+h*a/2);d=rhs(y+h*b/2);e=rhs(y+h*d);y+=h*(a+2b+2d+e)/6
        end
        y
    end
    exact=rk4(.001);finer=rk4(.0005);referenceError=norm(exact-finer)
    @test referenceError<1e-10
    errors=[]
    for dt in (.1,.05,.025,.0125)
        s=deepcopy(initial)
        for _ in 1:round(Int,.4/dt);step!(m,s,dt);end
        push!(errors,norm(vcat(s.p,vec(s.j))-finer))
    end
    ratios=errors[1:end-1]./errors[2:end]
    @test all(>(1.7),ratios)
    files=["common.jl","coupled-core.jl","transport-core.jl"]
    hashes=Dict(f=>bytes2hex(sha256(read(joinpath("docs/evidence/earth-compatible-momentum-20261014",f)))) for f in files)
    result=(passed=true,strength=.37,referenceError=referenceError,errors=errors,ratios=ratios,sourceHashes=hashes)
    write(joinpath(@__DIR__,"ode-v1.json"),JSON3.write(result));println(JSON3.write(result))
end
@testset "Independent C7 fractional-strength ODE" begin;main();end
