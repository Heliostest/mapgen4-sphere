# Isolated import-projection tests. RED mode tests the native frozen states.
using Test, LinearAlgebra, JSON3, JLD2, SHA
include("transport-v2-model.jl")
BLAS.set_num_threads(1)
const ROOT = normpath(joinpath(@__DIR__, "../../.."))
const OUT = joinpath(ROOT, "build/earth-speedy-transport")
const RED = get(ENV, "SCALAR_PROJECTION_TEST", "green") == "native-red"
const FIELDS = (:temperature, :humidity, :pressure, :vorticity, :divergence)
const SOURCES = ("build/earth-speedyweather/annual-initial.jld2",
    "build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics-start.jld2")
const SOURCE_HASHES = ("8e88991dde3af2877bd248cb1e30b0e7235fa6ee792fa705db5b65da0d237be8",
    "5e540be4025e75984cd1ab414fb36daccf95e66f5a309306523b63c9704ea6f1")
sha_file(p) = bytes2hex(sha256(read(p)))
sg = SW.SpectralGrid(NF=Float64, truncation=32, nlayers=8)
m = repaired_model(sg, "seasonal")
SW.initialize!(m.geopotential, m)
SW.initialize!(m.orography, m)

if RED
    @testset "Native scalar import must not carry auxiliary degrees" begin
        for (path, expected) in zip(SOURCES, SOURCE_HASHES)
            full = joinpath(ROOT, path)
            @test sha_file(full) == expected
            saved = JLD2.load(full)
            v = SW.Variables(m)
            SW.copy_variables!(v.prognostic, saved["containers"]["prognostic"])
            for key in FIELDS
                x = getproperty(v.prognostic, key)
                mask = x.spectrum.l_indices .> sg.truncation
                @test iszero(maximum(abs, x.data[mask, :, :]))
            end
        end
    end
else
    include("scalar-initial-projection.jl")
    using .ScalarInitialProjection
    results = Any[]
    # Initialize only once to prepare a real native two-step continuation.
    sim = SW.initialize!(m; time=DateTime(2001, 1, 1))
    m.output.active = false
    @testset "Initial scalar projection preserves valid spectra and physical history" begin
        for (index, path) in enumerate(SOURCES)
            full = joinpath(ROOT, path)
            @test sha_file(full) == SOURCE_HASHES[index]
            saved = JLD2.load(full)
            v = sim.variables
            index == 1 ? apply_frozen_initial!(sim) :
                foreach(kv -> SW.copy_variables!(getproperty(v, Symbol(first(kv))), last(kv)), saved["containers"])
            before = deepcopy(SW.materialize_views(v.prognostic))
            history = Dict((k,s)=>copy(SW.get_step(getproperty(v.grid,k),s).data) for k in (FIELDS...,:u,:v) for s in 1:2)
            spectral_before = Dict((k,s)=>deepcopy(SW.get_step(getproperty(v.prognostic,k),s)) for k in FIELDS for s in 1:2)
            @test_throws AssertionError assert_scalar_auxiliary_zero(v,m)
            ledger = project_scalar_initial!(v,m;
                source_sha=SOURCE_HASHES[index],
                stationary_history_fields=(:temperature,:pressure,:vorticity,:divergence),
                stationary_history_evidence="readonly-scalar-auxiliary.json: frozen 2001/2006/2007 identical auxiliary SHA; native diffusion zeros auxiliary tendencies; native UV ignores scalar auxiliary row",
                matching_history_fields=index == 1 ? (:humidity,) : ())
            @test assert_scalar_auxiliary_zero(v,m)
            @test ledger.beforeStateSHA != ledger.afterStateSHA
            @test isequal(before.land,SW.materialize_views(v.prognostic.land))
            @test isequal(before.ocean,SW.materialize_views(v.prognostic.ocean))
            @test all(k -> isequal(getfield(before.clock,k),getfield(v.prognostic.clock,k)), fieldnames(typeof(before.clock)))
            @test isequal(before.scale[],v.prognostic.scale[])
            for key in FIELDS, step in 1:2
                old=spectral_before[(key,step)]
                now=SW.get_step(getproperty(v.prognostic,key),step)
                valid=old.spectrum.l_indices .<=sg.truncation
                @test isequal(old.data[valid,:],now.data[valid,:])
            end
            for key in (:temperature,:pressure,:vorticity,:divergence)
                old=spectral_before[(key,1)]
                auxiliary=deepcopy(old);auxiliary.data[auxiliary.spectrum.l_indices.<=sg.truncation,:].=0
                contribution=SW.transform(auxiliary,m.spectral_transform)
                expected=history[(key,1)] .-contribution.data
                @test isequal(expected,SW.get_step(getproperty(v.grid,key),1).data)
            end
            for key in (:u,:v)
                @test isequal(history[(key,1)],SW.get_step(getproperty(v.grid,key),1).data)
            end
            if index==2
                @test isequal(history[(:humidity,1)],SW.get_step(v.grid.humidity,1).data)
                @test :humidity in ledger.deferredHistoryFields
                # Its RAW-filtered spectral history is observably different; do not rebuild it.
                old_spec=SW.transform(spectral_before[(:temperature,1)],m.spectral_transform)
                @test maximum(abs,old_spec.data-history[(:temperature,1)])>0.006
            else
                @test isempty(ledger.deferredHistoryFields)
            end
            @test maximum(abs,v.parameterizations.surface_pressure.data-exp.(SW.get_step(v.grid.pressure,1).data))==0
            for key in FIELDS
                expected=SW.transform(SW.get_step(getproperty(v.prognostic,key),2),m.spectral_transform)
                key==:humidity&&SW.hole_filling!(expected,m.hole_filling,m)
                @test isequal(expected.data,SW.get_step(getproperty(v.grid,key),2).data)
            end
            @test abs(ledger.afterInventory.current.waterKgM2-ledger.beforeInventory.current.waterKgM2)<0.0001
            @test abs(ledger.afterInventory.current.totalKgM2-ledger.beforeInventory.current.totalKgM2)<0.001
            # The source checkpoint is never overwritten. The derivative has a new explicit SHA.
            derived=joinpath(OUT,"scalar-initial-projection-"*(index==1 ? "2001" : "2006")*".jld2")
            containers=Dict(string(k)=>SW.materialize_views(getproperty(v,k)) for k in (:prognostic,:grid,:tendencies,:dynamics,:parameterizations))
            JLD2.jldopen(derived,"w") do f
                for(k,x) in saved; f[k]=k=="containers" ? containers : x;end
                f["scalar_initial_projection"]=ledger
            end
            @test sha_file(full)==SOURCE_HASHES[index]
            @test sha_file(derived)!=SOURCE_HASHES[index]
            step_records=Any[]
            if index==2
                for(k,c) in saved["components"];setproperty!(m,Symbol(k),c);end
                mc=register_mass!(v,m;target=saved["mass"].targetDryKgM2)
                for k in keys(saved["mass"]);k==:targetDryKgM2||setproperty!(mc,k,getproperty(saved["mass"],k));end
                sc=register_sst!(m)
                sc.externalHeatJm2=saved["sst"].externalHeatJm2
                sc.updates=saved["sst"].updates;sc.targetTime=saved["sst"].targetTime
                for n in 1:2
                    previous=Dict(k=>copy(SW.get_step(getproperty(v.grid,k),2).data) for k in (FIELDS...,:u,:v))
                    inventory_before=scalar_projection_inventory(v,m)
                    mass_before=mass_ledger(mc)
                    precipitation_before=1000 .* (v.parameterizations.rain_convection.data.+v.parameterizations.rain_large_scale.data.+v.parameterizations.snow_convection.data.+v.parameterizations.snow_large_scale.data)
                    clock_before=v.prognostic.clock.time
                    SW.time_step!(sim) # real native physics, dynamics, diffusion, SI, RAW, grids, clock
                    @test assert_scalar_auxiliary_zero(v,m) # never project inside the step
                    @test v.prognostic.clock.time==clock_before+Minute(30)
                    for key in (FIELDS...,:u,:v)
                        @test isequal(previous[key],SW.get_step(getproperty(v.grid,key),1).data)
                    end
                    mismatches=Dict{String,Float64}()
                    for key in FIELDS
                        expected=SW.transform(SW.get_step(getproperty(v.prognostic,key),2),m.spectral_transform)
                        key==:humidity&&SW.hole_filling!(expected,m.hole_filling,m)
                        difference=maximum(abs,expected.data-SW.get_step(getproperty(v.grid,key),2).data)
                        mismatches[string(key)]=difference
                        @test difference<1e-11
                    end
                    U=deepcopy(SW.get_step(v.prognostic.vorticity,2));V=similar(U)
                    SW.UV_from_vordiv!(U,V,SW.get_step(v.prognostic.vorticity,2),SW.get_step(v.prognostic.divergence,2),m.spectral_transform)
                    for(key,x) in ((:u,U),(:v,V))
                        expected=SW.transform(x,m.spectral_transform;unscale_coslat=true)
                        difference=maximum(abs,expected.data-SW.get_step(getproperty(v.grid,key),2).data)
                        mismatches[string(key)]=difference
                        @test difference<1e-11
                    end
                    @test all(isfinite,SW.get_step(v.grid.temperature,2).data)
                    @test minimum(SW.get_step(v.grid.temperature,2).data)>100
                    inventory_after=scalar_projection_inventory(v,m)
                    @test abs(inventory_after.current.dryKgM2/mc.targetDryKgM2-1)<1e-12
                    precipitation_after=1000 .* (v.parameterizations.rain_convection.data.+v.parameterizations.rain_large_scale.data.+v.parameterizations.snow_convection.data.+v.parameterizations.snow_large_scale.data)
                    precipitationMm=sum(mc.weights.*(precipitation_after.-precipitation_before))
                    evaporationMm=1800*sum(mc.weights.*v.parameterizations.surface_humidity_flux.data)
                    waterResidualMm=inventory_after.current.waterKgM2-inventory_before.current.waterKgM2-evaporationMm+precipitationMm-(mc.waterCorrectionMm-mass_before.waterCorrectionMm)
                    @test abs(waterResidualMm)<0.05
                    push!(step_records,(;step=n,time=string(v.prognostic.clock.time),inventory_before,inventory_after,
                        mass_before,mass_after=mass_ledger(mc),currentGridMismatch=mismatches,
                        precipitationMm,evaporationMm,waterResidualMm,
                        allOldGridsExactlyPreviousCurrent=true,scalarAuxiliaryExactlyZero=true))
                end
            end
            push!(results,(;source=path,sourceSHA=SOURCE_HASHES[index],derived,derivedSHA=sha_file(derived),ledger,steps=step_records))
        end
    end
    result=(;testSHA=sha_file(@__FILE__),sourceSHA=sha_file(joinpath(@__DIR__,"scalar-initial-projection.jl")),results)
    open(io->JSON3.write(io,result),joinpath(OUT,"scalar-initial-projection-verification.json"),"w")
    println(JSON3.write(result))
end
