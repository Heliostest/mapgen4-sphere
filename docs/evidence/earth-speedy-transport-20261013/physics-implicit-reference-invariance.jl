# Same-time-level complete wet nonlinear RHS under different reference splits.
# Does not run the time integrator, change model sources or replace global methods.
using LinearAlgebra, Test, JSON3
include("transport-v2-model.jl")
BLAS.set_num_threads(1)
const ROOT=normpath(joinpath(@__DIR__,"../../.."))
const SOURCE=joinpath(ROOT,"build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics-start.jld2")
saved=JLD2.load(SOURCE)
sg=SW.SpectralGrid(NF=Float64,truncation=32,nlayers=8)
m=transport_model(sg,"seasonal")
SW.initialize!(m.geopotential,m);SW.initialize!(m.adiabatic_conversion,m)
SW.initialize!(m.coriolis,m);SW.initialize!(m.orography,m)
refs=(("old",saved["components"]["implicit"].temp_profile),
    ("current_mean",saved["containers"]["dynamics"].average_temperature_profile),
    ("isothermal280",fill(280.,8)),("isothermal288",fill(288.,8)),("isothermal300",fill(300.,8)),("isothermal320",fill(320.,8)))
records=[];baseline=nothing;raws=Dict()
for (name,Tref) in refs
    vars=SW.Variables(m)
    for (key,data) in saved["containers"];SW.copy_variables!(getproperty(vars,Symbol(key)),data);end
    # This tests the complete instantaneous RHS, not equality of different SI discretizations.
    for key in (:temperature,:vorticity,:divergence,:pressure,:humidity)
        SW.get_step(getproperty(vars.prognostic,key),1).=SW.get_step(getproperty(vars.prognostic,key),2)
        SW.get_step(getproperty(vars.grid,key),1).=SW.get_step(getproperty(vars.grid,key),2)
    end
    for key in (:u,:v);SW.get_step(getproperty(vars.grid,key),1).=SW.get_step(getproperty(vars.grid,key),2);end
    SW.initialize!(m.implicit,3600/vars.prognostic.scale[],Tref,m.geometry,m.geopotential,m.atmosphere,m.adiabatic_conversion)
    SW.reset_tendencies!(vars,m.time_stepping)
    SW.dynamics_tendencies!(vars,m)
    add_background_temperature_advection!(vars,m.implicit,m)
    tendencies=Dict(string(k)=>copy(SW.get_tendency_step(getproperty(vars.tendencies,k),m.time_stepping,m.implicit).data)
        for k in (:temperature,:pressure,:divergence,:vorticity,:humidity))
    global baseline=baseline===nothing ? tendencies : baseline
    raws[name]=tendencies
    diff=[]
    for (key,x) in tendencies
        field=SW.get_tendency_step(getproperty(vars.tendencies,Symbol(key)),m.time_stepping,m.implicit)
        delta=x-baseline[key];li=field.spectrum.l_indices
        valid=li .<= m.implicit.truncation  # auxiliary row is truncation+1
        mx=argmax(abs.(delta));validMax=maximum(abs,delta[valid,:])
        scratch=deepcopy(field);scratch.data .= delta
        scratch.data[.!valid,:] .= 0
        grid=SW.transform(scratch,m.spectral_transform)
        unitScale=key in ("vorticity","divergence") ? vars.prognostic.scale[]^2 : vars.prognostic.scale[]
        push!(diff,(;variable=key,maxAbs=maximum(abs,delta),maxRelative=maximum(abs,delta)/max(1.,maximum(abs,baseline[key])),
            maxIndex=Tuple(mx),maxDegreeIndex=li[mx[1]],validMax,gridMaxAbs=maximum(abs,grid),
            validRelative=validMax/max(1.,maximum(abs,baseline[key][valid,:])),
            gridMaxPerDay=maximum(abs,grid)*86400/unitScale,
            gridDayUnits=key=="temperature" ? "K/day" : key in ("divergence","vorticity") ? "s^-1/day" : key=="humidity" ? "kg/kg/day" : "log(Pa)/day"))
    end
    push!(records,(;name,profile=collect(Tref),differences=diff))
    println(JSON3.write(last(records)))
end
record=(;source=SOURCE,sourceSHA=bytes2hex(sha256(read(SOURCE))),scriptSHA=bytes2hex(sha256(read(@__FILE__))),
    interpretation="Full native wet nonlinear dynamics on actual2006 fields/orography, with old=current for instantaneous RHS. Restore exactly the missing reference vertical advection, no SI correction/diffusion/time advance. Reference invariance here does not assert finite-time SI trajectories are equal.",records)
open(io->JSON3.write(io,record),joinpath(ROOT,"build/earth-speedy-transport/physics-implicit-reference-invariance.json"),"w")
println(JSON3.write(record))
JLD2.jldsave(joinpath(ROOT,"build/earth-speedy-transport/physics-implicit-reference-raw.jld2");raws)
@test all(d.validRelative<1e-10 for r in records for d in r.differences)
