using SpeedyWeather, JSON3, Dates, LinearAlgebra, Statistics
const SW=SpeedyWeather
BLAS.set_num_threads(1)
include("convection-corrected.jl")
const A=SW.EarthAtmosphere(Float64)
const ROOT=normpath(joinpath(@__DIR__,"../../.."))

function endpoint(n;maxstep=.1)
    p=exp.(range(log(93750.),log(31250.);length=n+1))
    t=300.;q=.8*SW.saturation_humidity(t,p[1],A)
    for k in 1:n
        t,q=corrected_parcel_lift(t,q,p[k],p[k+1],A;max_log_pressure_step=maxstep)
    end
    (;temperatureK=t,humidity=q)
end
reference=endpoint(1024;maxstep=.001)
convergence=[]
for maxstep in (.2,.1,.05,.025)
    for n in (8,16,32)
        r=endpoint(n;maxstep)
        push!(convergence,(;maxstep,n,r...,temperatureErrorK=r.temperatureK-reference.temperatureK,
            humidityError=r.humidity-reference.humidity))
    end
end

# Use all 3168 actual columns from one frozen 2006 January monthly mean field.
# This is a representative throughput fixture, not an instantaneous activation census.
j=JSON3.read(read(joinpath(ROOT,"build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics.json"),String))
g=JSON3.read(read(joinpath(ROOT,"build/earth-speedy-moisture-monsoon/coupled-seasonal-geometry.json"),String))
n=Int(g.npoints);nl=Int(g.nlayers);sigma=Float64.(g.sigmaFull)
month=j.monthly[1]
T=reshape(Float64.(month.layers.temperatureK),n,nl)
q=reshape(Float64.(month.layers.specificHumidity),n,nl)
ps=Float64.(month.surface.pressurePa)
phi=zeros(n,nl);tr=similar(T);qr=similar(q)
half=collect(range(0.,1.;length=nl+1))
for ij in 1:n
    tv=SW.virtual_temperature(T[ij,nl],q[ij,nl],A)
    phi[ij,nl]=A.R_dry*tv*log(1/sigma[nl])
    for k in (nl-1):-1:1
        tvb=tv;tv=SW.virtual_temperature(T[ij,k],q[ij,k],A)
        phi[ij,k]=phi[ij,k+1]+A.R_dry*(tvb*log(sigma[k+1]/half[k+1])+tv*log(half[k+1]/sigma[k]))
    end
end
e=SW.LinearEntrainment(Float64)
function allcolumns!(f,tr,qr,T,q,phi,ps,sigma,A,e)
    for ij in eachindex(ps)
        f(ij,tr,qr,T,q,phi,ps[ij],sigma,A,.7,e)
    end
end
times=[]
nativeTimes=[]
for (label,f) in (("native",SW.pseudo_adiabat!),
        ("corrected-0.2",(args...)->corrected_pseudo_adiabat!(args...;max_log_pressure_step=.2)),
        ("corrected-0.1",(args...)->corrected_pseudo_adiabat!(args...;max_log_pressure_step=.1)),
        ("corrected-0.05",(args...)->corrected_pseudo_adiabat!(args...;max_log_pressure_step=.05)))
    allcolumns!(f,tr,qr,T,q,phi,ps,sigma,A,e)
    samples=[@elapsed allcolumns!(f,tr,qr,T,q,phi,ps,sigma,A,e) for _ in 1:7]
    push!(times,(;label,columns=n,medianSeconds=median(samples),minimumSeconds=minimum(samples),samples))
end
record=(;reference,convergence,times,fixture="Frozen coupled-seasonal 2006 January monthly-mean native 3168 columns; no model integration")
open(joinpath(ROOT,"build/earth-speedy-transport/convection-bench.json"),"w") do io
    JSON3.write(io,record)
end
println(JSON3.write(record))
