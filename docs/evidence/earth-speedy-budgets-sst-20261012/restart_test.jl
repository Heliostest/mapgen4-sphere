using Test
include("run.jl")
@kwdef mutable struct RestartProbe <: SW.AbstractCallback
    mode::String
    path::String
    expected::Any=nothing
    expectedMass::Any=nothing
    expectedSst::Any=nothing
    initialFields::Any=nothing
end
function SW.initialize!(p::RestartProbe,v,m)
    p.initialFields=initial_field_comparison(v)
    register_mass!(v,m);p.mode=="seasonal"&&register_sst!(m)
end
function SW.callback!(p::RestartProbe,v,m)
    if v.prognostic.clock.time==DateTime(2001,1,2)
        checkpoint(p.path,v,m;mode=p.mode)
    elseif v.prognostic.clock.time==DateTime(2001,1,2,0,30)
        p.expected=Dict(k=>deepcopy(SW.materialize_views(getproperty(v,k))) for k in (:prognostic,:grid,:tendencies,:dynamics,:parameterizations))
        p.expectedMass=mass_ledger(MASS_CONTEXTS[m])
        p.expectedSst=haskey(SST_CONTEXTS,m) ? (SST_CONTEXTS[m].externalHeatJm2,SST_CONTEXTS[m].updates,SST_CONTEXTS[m].targetTime) : nothing
    end
end
SW.finalize!(::RestartProbe,v,m)=nothing
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
BLAS.set_num_threads(1);results=Any[]
@testset "Exact restored physical next step" begin
    for mode in ("slab","seasonal")
        sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
        p=RestartProbe(;mode,path=joinpath(OUT,mode*"-restart-probe.jld2"))
        m=experiment_model(sg,mode;callbacks=CallbackDict(:restart=>p))
        sim=apply_frozen_initial!(initialize!(m;time=BEGIN_TIME))
        run!(sim;period=Minute(1470),output=false)
        restored=restore(p.path);SW.time_step!(restored)
        errors=String[]
        for (k,v) in p.expected;same_arrays(v,getproperty(restored.variables,k),string(k),errors);end
        isequal(p.expectedMass,mass_ledger(MASS_CONTEXTS[restored.model]))||push!(errors,"massModeLedger")
        s=haskey(SST_CONTEXTS,restored.model) ? SST_CONTEXTS[restored.model] : nothing
        current=s===nothing ? nothing : (s.externalHeatJm2,s.updates,s.targetTime)
        isequal(p.expectedSst,current)||push!(errors,"sstExternalLedger")
        result=(;mode,savedTime="2001-01-02T00:00:00",restoredTime=string(restored.variables.prognostic.clock.time),exactNextStep=isempty(errors),mismatchPaths=errors,initialPhysicalFields=p.initialFields)
        push!(results,result);writejson(joinpath(OUT,"restart-verification.json"),results)
        @test result.exactNextStep
        @test result.restoredTime=="2001-01-02T00:30:00"
        println(JSON3.write(result))
    end
end
