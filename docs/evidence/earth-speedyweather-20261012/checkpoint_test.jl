using SpeedyWeather, Dates, JLD2, JSON3, Test, LinearAlgebra
include("restore-audited.jl")
const SW=SpeedyWeather
const PATH="build/earth-speedyweather/restart-probe.jld2"
@kwdef mutable struct RestartProbe <: SW.AbstractCallback
    expected::Any=nothing
    time::Any=nothing
end
SW.initialize!(::RestartProbe,vars,model)=nothing
function SW.callback!(probe::RestartProbe,vars,model)
    t=vars.prognostic.clock.time
    if t==DateTime(2001,1,2)
        checkpoint(PATH,vars,model)
    elseif t==DateTime(2001,1,2,0,30)
        probe.expected=Dict(k=>deepcopy(SW.materialize_views(getproperty(vars,k))) for k in (:prognostic,:grid,:parameterizations))
        probe.time=t
    end
end
SW.finalize!(::RestartProbe,vars,model)=nothing
function same_arrays(a,b,path="",errors=String[])
    if a isa AbstractArray
        isequal(Array(a),Array(b))||push!(errors,path)
    elseif a isa NamedTuple
        for k in keys(a);same_arrays(getproperty(a,k),getproperty(b,k),path*"/"*string(k),errors);end
    elseif a isa Ref
        isequal(a[],b[])||push!(errors,path)
    elseif a isa SW.Clock
        for k in fieldnames(typeof(a));isequal(getfield(a,k),getfield(b,k))||push!(errors,path*"/"*string(k));end
    end
    return errors
end
BLAS.set_num_threads(1)
sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
probe=RestartProbe()
model=PrimitiveWetModel(sg;time_stepping=Leapfrog(sg;Δt_at_T32=Minute(30)),feedback=nothing,callbacks=CallbackDict(:restart=>probe))
sim=initialize!(model;time=DateTime(2001,1,1))
run!(sim;period=Minute(1470),output=false)
restored=restore_audited(PATH)
SW.time_step!(restored)
errors=String[]
for (k,v) in probe.expected
    same_arrays(v,getproperty(restored.variables,k),string(k),errors)
end
result=(;savedTime="2001-01-02T00:00:00",continuedTime=string(probe.time),restoredTime=string(restored.variables.prognostic.clock.time),exactNextStep=isempty(errors),mismatchPaths=errors)
open(io->JSON3.write(io,result),"build/earth-speedyweather/restart-verification.json","w")
@test result.exactNextStep
@test result.restoredTime==result.continuedTime
println(JSON3.write(result))
