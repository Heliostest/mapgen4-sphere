using SpeedyWeather, Dates, JSON3, Random
const SW=SpeedyWeather
Random.seed!(20261012)
sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
model=PrimitiveWetModel(sg;time_stepping=Leapfrog(sg;Δt_at_T32=Minute(30)))
println("Creating native T32 / 8-layer wet Earth model")
simulation=initialize!(model;time=DateTime(2001,1,1))
function describe(x)
    if x isa AbstractArray
        return (;type=string(typeof(x)),shape=size(x),minimum=minimum(x),maximum=maximum(x))
    end
    return (;type=string(typeof(x)))
end
function record(stage)
    v=simulation.variables
    summary=Dict("stage"=>stage,"julia"=>string(VERSION),"version"=>string(pkgversion(SpeedyWeather)),"time"=>string(v.prognostic.clock.time),"stepS"=>model.time_stepping.Δt,"truncation"=>sg.truncation,"nlayers"=>sg.nlayers,"npoints"=>sg.npoints,"nlat"=>sg.nlat,"geometry"=>string.(propertynames(model.geometry)),"grid"=>Dict(string(k)=>describe(getproperty(v.grid,k)) for k in propertynames(v.grid)),"parameterizations"=>Dict(string(k)=>describe(getproperty(v.parameterizations,k)) for k in propertynames(v.parameterizations)),"land"=>Dict(string(k)=>describe(getproperty(v.prognostic.land,k)) for k in propertynames(v.prognostic.land)),"ocean"=>Dict(string(k)=>describe(getproperty(v.prognostic.ocean,k)) for k in propertynames(v.prognostic.ocean)))
    mkpath("build/earth-speedyweather")
    open("build/earth-speedyweather/probe-"*stage*".json","w") do io
        JSON3.write(io,summary)
    end
    println(JSON3.write((;stage,time=summary["time"],stepS=summary["stepS"],npoints=sg.npoints,nlayers=sg.nlayers)))
end
record("initial")
run!(simulation;period=Day(1),output=false)
record("day1")
