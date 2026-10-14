using LinearAlgebra, Random, SHA, JSON3
include("conservative-core.jl")
using .ConservativeCore
BLAS.set_num_threads(1)
const before=bytes2hex(sha256(read(joinpath(@__DIR__,"conservative-core.jl"))))
function probe()
    Random.seed!(62013)
    for trial in 1:100
        n=8;a=.5 .+ rand(n);pref=.5 .+ rand(n);p=pref.*(.9 .+ .2rand(n))
        L=.5 .+ rand(n);d=.5 .+ rand(n)
        g=Geometry(a,collect(1:n),circshift(collect(1:n),-1),L,d,1.)
        c=TransportCore(g,pref,[.1,.3,.6];c2=1.)
        j=repeat(.01randn(n),1,3);q=hcat(ones(n),zeros(n),zeros(n))
        s=State(p,mass(c,p).*q,j,0.)
        led=step!(c,s,.1)
        dry=minimum(mass(c,s.p)-s.W)
        if dry<0
            followup=try step!(c,s,.1);"accepted" catch e;string(typeof(e),": ",sprint(showerror,e)) end
            return (trial=trial,minimumDryMass=dry,qmax=led.qmax,followup=followup,fixture=(area=a,pref=pref,p=p,L=L,d=d,j=j,q=q))
        end
    end
    nothing
end
result=probe()
after=bytes2hex(sha256(read(joinpath(@__DIR__,"conservative-core.jl"))))
before==after || error("source changed during review")
path=joinpath(@__DIR__,"../../../build/earth-conservative-transport/review-mixed-bound-v1.json")
isfile(path) && error("review output exists")
write(path,JSON3.write((sourceBefore=before,sourceAfter=after,result=result)))
println(JSON3.write(result))
