using Dates, JSON3, Test, LinearAlgebra, NCDatasets
include("components.jl")
BLAS.set_num_threads(1)
const OUT="build/earth-speedy-budgets-sst"
mkpath(OUT)
writejson(p,x)=open(io->JSON3.write(io,x),p,"w")
function land_stock(v,m,w)
    H=m.land.geometry.layer_thickness;γ=m.land.thermodynamics.field_capacity;l=m.land_sea_mask.land_fraction.data
    soil=SW.get_step(v.prognostic.land.soil_moisture).data
    snow=vec(SW.get_step(v.prognostic.land.snow_depth).data)
    return sum(w.*l.*(1000γ.*(soil*H).+1000 .*snow))
end
function land_counters(v,m,w)
    p=v.parameterizations.land;l=m.land_sea_mask.land_fraction.data
    return Dict(string(k)=>1000sum(w.*l.*getproperty(p,k).data) for k in (:river_runoff,:deep_drainage,:soil_clipping_source,:snow_cap_outflow,:snow_clipping_source))
end
saved=JLD2.load(INITIAL_PATH);referenceSHA=stock_hash((;prognostic=saved["containers"]["prognostic"]))
records=[]
@testset "real native fields and conservative constraints" begin
for mode in ("slab","seasonal")
    sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
    model=experiment_model(sg,mode);sim=apply_frozen_initial!(initialize!(model;time=DateTime(2001,1,1)))
    @test stock_hash(sim.variables)==referenceSHA
    if mode=="slab"
        # Check audited bucket against the actual package filter, including a
        # mixed land cell and overflow, with identical physical arrays.
        v=sim.variables;w=native_weights(model);land=model.land_sea_mask.land_fraction.data
        k=findfirst(x->x>0,land);v.prognostic.land.soil_moisture.data[k,1,1]=1.5;v.prognostic.land.soil_moisture.data[k,2,1]=1.2
        raw=copy(v.prognostic.land.soil_moisture.data);R=copy(v.parameterizations.land.river_runoff.data)
        filter!(v,model.land.soil_moisture.inner,model)
        expected=copy(v.prognostic.land.soil_moisture.data);expectedR=copy(v.parameterizations.land.river_runoff.data)
        v.prognostic.land.soil_moisture.data.=raw;v.parameterizations.land.river_runoff.data.=R
        filter!(v,model.land.soil_moisture,model)
        @test v.prognostic.land.soil_moisture.data==expected
        @test v.parameterizations.land.river_runoff.data==expectedR
        apply_frozen_initial!(sim)
        for key in (:deep_drainage,:soil_clipping_source,:snow_cap_outflow,:snow_clipping_source);fill!(getproperty(v.parameterizations.land,key),0);end
    end
    SW.initialize!(sim;period=Day(3),output=false)
    initialSHA=stock_hash(sim.variables)
    @test initialSHA==referenceSHA
    v=sim.variables;w=native_weights(model);initialAir=air_stocks(v,model,w);initialLand=land_stock(v,model,w)
    c=register_mass!(v,model);mode=="seasonal"&&register_sst!(model);E=0.0;P=0.0;El=0.0;Pl=0.0
    oldP=zeros(length(w));t=v.prognostic.clock.time
    for _ in 1:v.prognostic.clock.n_steps
        SW.time_step!(sim)
        now=v.prognostic.clock.time;dt=Dates.value(now-t)/1000;t=now
        params=v.parameterizations
        precip=1000 .* (params.rain_convection.data.+params.rain_large_scale.data.+params.snow_convection.data.+params.snow_large_scale.data)
        ΔP=precip.-oldP;oldP.=precip
        E+=dt*sum(w.*params.surface_humidity_flux.data);P+=sum(w.*ΔP)
        l=model.land_sea_mask.land_fraction.data
        El+=dt*sum(w.*l.*params.land.surface_humidity_flux.data);Pl+=sum(w.*l.*ΔP)
    end
    finalAir=air_stocks(v,model,w);finalLand=land_stock(v,model,w);lc=land_counters(v,model,w)
    rawLand=finalLand-initialLand-Pl+El+lc["river_runoff"]
    # Snow's negative candidate is over-melt that was already excluded from
    # the actual melt flux to soil. Its clipping is not a physical water source.
    landResidual=rawLand+lc["deep_drainage"]+lc["snow_cap_outflow"]-lc["soil_clipping_source"]
    rawAir=finalAir.waterKgM2-initialAir.waterKgM2-E+P
    @test c.maxPostDryRelative<1e-10
    @test c.maxRawDryRelative>1e-6
    @test abs(landResidual)<1e-6
    waterLimit=max(0.05,0.001*(abs(E)+P))
    record=(;mode,initialSHA,time=string(t),initialAir,finalAir,rawLandResidualMm=rawLand,landResidualMm=landResidual,landCountersMm=lc,evaporationMm=E,precipitationMm=P,airWaterLimitMm=waterLimit,airWaterPassed=abs(rawAir-c.waterCorrectionMm)<=waterLimit,airWaterRawResidualMm=rawAir,airWaterExcludingModeCorrectionMm=rawAir-c.waterCorrectionMm,massMode=mass_ledger(c))
    push!(records,record);println(JSON3.write(record))
end
end
asset="build/earth-speedyweather/depot/artifacts/ad8ffe0ca625b95d5b20ffab31dbdd3ae4734530/sea_surface_temperature.nc"
metadata=NCDataset(asset,"r") do ds
    (;globalAttributes=Dict(ds.attrib),sstAttributes=Dict(ds["sst"].attrib),dimensionNames=String.(keys(ds.dim)),variables=String.(keys(ds)))
end
writejson(joinpath(OUT,"sst-source-metadata.json"),metadata)
writejson(joinpath(OUT,"probe-results.json"),(;referenceSHA,records))
