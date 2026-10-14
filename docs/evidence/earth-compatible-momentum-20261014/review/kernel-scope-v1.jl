include("../../docs/evidence/earth-compatible-momentum-20261014/common.jl")
include("../../docs/evidence/earth-compatible-momentum-20261014/coupled-core.jl")
include("reference-v1.jl")
using .CoupledCompatible
function main()
    c,lat,lon=small_core(ds=[.013,.187,.8]);rot=RotationMap(c,lat,lon,[.17,-.21,.31]);t=CompatibleTransport(rot,lat,lon)
    d=independent(c,lat,lon,zeros(length(t.connection.from)));sh=sqrt.(d.H)
    sv=svd(Diagonal(sh)*d.P;full=true);rankp=count(>(1e-12*maximum(sv.S)),sv.S);Q=sv.U[:,rankp+1:end]
    rng=MersenneTwister(788);j=.08randn(rng,length(c.prefFace),3);p=c.pref.*(1 .+.02randn(rng,length(c.pref)))
    initial=State(p,mass(c,p)*.012,j,0.);s=deepcopy(initial);m=CoupledCore(ModalCore(c),t)
    step!(m,s,.1)
    change=norm(Q'*(sh.*vec(s.j-initial.j)))/norm(sh.*vec(initial.j))
    @test change>1e-6
    result=(passed=true,completeStepKernelChangeRelative=change,note="Kernel preservation applies to compatible transport increments, not all acoustic changes.")
    write(joinpath(@__DIR__,"kernel-scope-v1.json"),JSON3.write(result));println(JSON3.write(result))
end
@testset "C7 kernel scope" begin;main();end
