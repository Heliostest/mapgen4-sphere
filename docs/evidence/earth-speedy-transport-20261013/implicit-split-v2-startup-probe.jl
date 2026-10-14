# Measure reference capture on one unchanged V2 startup, without using shadow SI.
include("transport-v2-model.jl")
include("implicit-split-reference-v2.jl")
using JSON3, Dates, LinearAlgebra
BLAS.set_num_threads(1)
function main()
    sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
    m=transport_model(sg,"seasonal")
    sim=apply_frozen_initial!(initialize!(m;time=DateTime(2001,1,1)))
    SW.initialize!(sim;period=Day(3),output=false)
    v=sim.variables;register_mass!(v,m);register_sst!(m)
    shadow=SplitReferenceImplicit(sg);rows=Any[]
    for i in 1:3
        counter=v.prognostic.clock.step_counter;average=copy(v.dynamics.average_temperature_profile)
        dt=SW.time_step(m.time_stepping,v.prognostic.clock)
        SW.reinitialize!(shadow,m,v)
        SW.time_step!(sim)
        push!(rows,(;counter,dt,averageBeforeStep=average,originalReference=copy(m.implicit.temp_profile),
            shadowReference=copy(shadow.temp_profile),maxDifferenceK=maximum(abs,shadow.temp_profile-m.implicit.temp_profile)))
    end
    result=(;scope="One unchanged V2 trajectory. Shadow references are observed but never used in a model step.",rows)
    open(io->JSON3.write(io,result),"build/earth-speedy-transport/implicit-split-v2-startup-probe.json","w")
    println(JSON3.write(result))
end
main()
