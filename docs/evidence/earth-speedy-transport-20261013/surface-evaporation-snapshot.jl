using SpeedyWeather, JLD2, JSON3, SHA
const SW=SpeedyWeather
const ROOT=normpath(joinpath(@__DIR__,"../../.."))
const OUT=joinpath(ROOT,"build/earth-speedy-transport")
const WF=joinpath(OUT,"diagnostic-weights.json")
w=JSON3.read(read(WF,String));a=SW.EarthAtmosphere(Float64)
sources=("diagnostic-july-start.jld2","baseline-sensitivity-v2-final.jld2",
    "parcel-sensitivity-final.jld2","combined-sensitivity-final.jld2")
results=[]
for filename in sources
    path=joinpath(OUT,filename)
    c=JLD2.jldopen(path,"r") do f;f["containers"];end
    p=c["parameterizations"];pg=c["prognostic"]
    q=Array(SW.get_step(c["grid"].humidity,1))[:,end]
    T=Array(SW.get_step(c["grid"].temperature,1))[:,end]
    Ts=Array(SW.get_step(pg.land.soil_temperature,1))[:,1]
    soil=Array(SW.get_step(pg.land.soil_moisture,1))
    snow=vec(Array(SW.get_step(pg.land.snow_depth,1)))
    ps=vec(p.surface_pressure.data);alpha=vec(p.land.soil_moisture_availability.data)
    qs=[SW.saturation_humidity(t,pr,a) for (t,pr) in zip(Ts,ps)]
    coeff=vec(p.surface_air_density.data).*vec(p.boundary_layer_drag.data).*vec(p.surface_wind_speed.data)./(1 .+snow./.05)
    native=coeff.*(alpha.*qs.-q)
    corrected=coeff.*ifelse.(q.>qs,qs.-q,max.(alpha.*qs.-q,0))
    stored=vec(p.land.surface_humidity_flux.data)
    high=vec(p.land.vegetation_high.data);low=vec(p.land.vegetation_low.data)
    veg=max.(0,high .+ 0.8 .* low)
    atop=0.2 .* soil[:,1] .* 0.3 ./ 0.32
    aroot=veg .* 2 .* max.(soil[:,2] .* 0.3 .- 0.17,0) ./ 0.32
    regions=[]
    for r in w.regions
        endswith(String(r.name),"native land") || continue
        rw=Float64.(r.weights);sel=rw.>0
        mean(x)=sum(rw[sel].*x[sel]) # mask structural NaNs at zero support
        push!(regions,(;name=String(r.name),support=String(r.support),
            topWaterMm=mean(soil[:,1] .* 0.3 .* 0.2 .* 1000),rootWaterMm=mean(soil[:,2] .* 0.3 .* 2 .* 1000),
            rootAboveWiltingMm=mean(max.(soil[:,2] .* 0.3 .- 0.17,0) .* 2000),
            rootBelowWiltingArea=mean(soil[:,2] .* 0.3 .< 0.17),
            vegetationFraction=mean(veg),storedAvailability=mean(alpha),recomputedAvailability=mean(atop.+aroot),
            topAvailability=mean(atop),rootAvailability=mean(aroot),
            skinK=mean(Ts),lowestAirK=mean(T),surfaceAirK=mean(T.*Float64(w.sigma[end])^(-a.κ)),
            surfaceSaturationRatio=mean(q./qs),storedLandEMmDay=mean(stored.*86400),
            sameInputNativeEMmDay=mean(native.*86400),sameInputCorrectedEMmDay=mean(corrected.*86400),
            nativePositiveEMmDay=mean(max.(native,0).*86400),nativeNegativeEMmDay=mean(min.(native,0).*86400),
            negativeArea=mean(native.<0),negativeUnsaturatedArea=mean((native.<0).&(q.<qs)),
            negativeWarmUnsaturatedArea=mean((native.<0).&(q.<qs).&(Ts.>T.*Float64(w.sigma[end])^(-a.κ))),
            latentSoilHeatingRemovedWm2=mean((corrected.-native).*a.latent_heat_condensation)))
    end
    push!(results,(;source=filename,sha256=bytes2hex(sha256(read(path))),clock=string(pg.clock.time),regions))
end
record=(;interpretation="Read-only instantaneous algebraic counterfactual on checkpoint grid step 1, current land step 1 and stored surface pressure/drag/density/availability. Stored fluxes precede the last land update; current-land formula is coherent but not bitwise replay of stored E. Monthly/seasonal changes require new integration. No model step or checkpoint write.",
    scriptSHA256=bytes2hex(sha256(read(@__FILE__))),weightsSHA256=bytes2hex(sha256(read(WF))),results)
open(joinpath(OUT,"surface-evaporation-snapshot.json"),"w") do io;JSON3.write(io,record);end
println(JSON3.write(record))
