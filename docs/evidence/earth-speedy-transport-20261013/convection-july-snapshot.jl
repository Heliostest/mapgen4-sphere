using SpeedyWeather, JLD2, JSON3, SHA, LinearAlgebra
const SW=SpeedyWeather
BLAS.set_num_threads(1)
include("convection-corrected.jl")
const ROOT=normpath(joinpath(@__DIR__,"../../.."))
const OUT=joinpath(ROOT,"build/earth-speedy-transport")
const SOURCE=joinpath(OUT,"diagnostic-july-start.jld2")
const WEIGHTFILE=joinpath(OUT,"diagnostic-weights.json")
containers=JLD2.jldopen(SOURCE,"r") do f
    f["containers"]
end
w=JSON3.read(read(WEIGHTFILE,String))
sigma=Float64.(w.sigma);n=Int(w.npoints);nl=length(sigma)
A=SW.EarthAtmosphere(Float64)
T=Array(SW.get_step(containers["grid"].temperature,1))
q=Array(SW.get_step(containers["grid"].humidity,1))
phi=containers["dynamics"].geopotential.data
ps=containers["parameterizations"].surface_pressure.data
@assert size(T)==size(q)==size(phi)==(n,nl)
e=SW.LinearEntrainment(Float64)
result=[]
for (label,f) in (("native",SW.pseudo_adiabat!),("corrected",corrected_pseudo_adiabat!))
    tr=similar(T);qr=similar(q);pq=zeros(n);pt=zeros(n);lzb=zeros(Int,n)
    for ij in 1:n
        lzb[ij]=f(ij,tr,qr,T,q,phi,ps[ij],sigma,A,.7,e)
        pq[ij]=sum((q[ij,:].-qr[ij,:])./nl)
        pt[ij]=sum((tr[ij,:].-T[ij,:])./nl)
    end
    deep=(pt.>0).&(pq.>0);shallow=(pt.>0).&(pq.<=0);none=pt.<=0
    regions=[]
    for r in w.regions
        rw=Float64.(r.weights);@assert isapprox(sum(rw),1;atol=1e-12)
        push!(regions,(;name=String(r.name),support=String(r.support),
            deepAreaFraction=sum(rw.*deep),shallowAreaFraction=sum(rw.*shallow),
            noBuoyancyAreaFraction=sum(rw.*none),meanPqKgKg=sum(rw.*pq),meanPTK=sum(rw.*pt),
            lowestLayerTemperatureK=sum(rw.*T[:,nl]),lowestLayerHumidity=sum(rw.*q[:,nl])))
    end
    push!(result,(;label,regions,columns=(;pq,pt,lzb,deep,shallow,none)))
end
record=(;clock=string(containers["prognostic"].clock.time),sigma,
    interpretation="Same on-disk physics-input grid step 1 and stored pressure/geopotential; instantaneous counterfactual first-guess criteria only, not rainfall or seasonal frequency. No model steps or checkpoint writes.",
    checkpointSHA256=bytes2hex(sha256(read(SOURCE))),weightsSHA256=bytes2hex(sha256(read(WEIGHTFILE))),
    implementationSHA256=bytes2hex(sha256(read(joinpath(@__DIR__,"convection-corrected.jl")))),result)
open(joinpath(OUT,"convection-july-snapshot.json"),"w") do io
    JSON3.write(io,record)
end
println(JSON3.write((;clock=record.clock,summary=[(;label=r.label,regions=r.regions) for r in result])))
