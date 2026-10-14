# Source-free native-field research. The carrier never writes the native model.
include("transport-v3-model.jl")
include("scalar-initial-projection.jl")
include("wet-carrier-prototype.jl")
using .ScalarInitialProjection, .NativeWetCarrier
using Dates, JSON3, LinearAlgebra, Test, JLD2
BLAS.set_num_threads(1)

function assert_flux_auxiliary_zero(A,v,m)
    field=similar(SW.get_step(v.grid.humidity,2));field.data .= A
    spec=similar(SW.get_step(v.prognostic.humidity,2))
    SW.flux_divergence!(spec,field,v,m;add=false,flipsign=true,
        uA=similar(spec),vA=similar(spec),uA_grid=similar(field),vA_grid=similar(field))
    aux=spec.spectrum.l_indices.==maximum(spec.spectrum.l_indices)
    @test all(iszero,spec.data[aux,:])
end

function candidate_inventory(v,m,w)
    span=SW.time_step(m.time_stepping,v.prognostic.clock)/v.prognostic.scale[]
    startup=v.prognostic.clock.step_counter<=1
    w2=startup ? 0. : m.time_stepping.robert_filter*(1-m.time_stepping.williams_filter)/2
    fields=Any[]
    for key in (:pressure,:humidity)
        grid=SW.get_step(getproperty(v.grid,key),2)
        a=similar(grid);b=similar(grid);t=similar(grid)
        SW.transform!(a,SW.get_step(getproperty(v.prognostic,key),1),m.spectral_transform)
        SW.transform!(b,SW.get_step(getproperty(v.prognostic,key),2),m.spectral_transform)
        SW.transform!(t,SW.get_step(getproperty(v.tendencies,key)),m.spectral_transform)
        provisional=a.data.+span.*t.data
        reference=startup ? a.data : b.data
        push!(fields,provisional.-w2.*(a.data.-2reference.+provisional))
    end
    p=exp.(vec(fields[1]));q=fields[2];g=m.planet.gravity;ds=m.geometry.σ_levels_thick
    (;airKgM2=dot(w,p)/g,waterMm=dot(w,p.*(q*ds))/g,minq=minimum(q))
end
function native_staged_step!(sim,w)
    v=sim.variables;m=sim.model;ts=m.time_stepping
    SW.reinitialize!(m,v);SW.reset_tendencies!(v,ts)
    SW.dynamics_tendencies!(v,m);explicit=candidate_inventory(v,m,w)
    SW.implicit_correction!(v,m.implicit,ts,m);implicit=candidate_inventory(v,m,w)
    SW.horizontal_diffusion!(v,m);diffusion=candidate_inventory(v,m,w)
    SW.update_prognostic!(v,m);SW.transform!(v,m);SW.particle_advection!(v,m);SW.time_step!(v.prognostic.clock,ts)
    (;explicit,implicit,diffusion,
        implicitPressureWaterEffectMm=implicit.waterMm-explicit.waterMm,
        horizontalDiffusionWaterEffectMm=diffusion.waterMm-implicit.waterMm)
end

function main()
    sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8);m=transport_model(sg,"seasonal")
    sim=apply_frozen_initial!(initialize!(m;time=DateTime(2001,1,1)))
    projection=project_scalar_initial!(sim.variables,m;source_sha=bytes2hex(sha256(read(INITIAL_PATH))),
        stationary_history_fields=(:temperature,:pressure,:vorticity,:divergence),
        stationary_history_evidence="readonly-scalar-auxiliary.json stationary auxiliary provenance",matching_history_fields=(:humidity,))
    SW.initialize!(sim;period=Day(3),output=false);m.dynamics_only=true
    v=sim.variables;w=native_weights(m);ds=m.geometry.σ_levels_thick;g=m.planet.gravity
    @assert !haskey(MASS_CONTEXTS,m) && !haskey(SST_CONTEXTS,m)
    @assert assert_scalar_auxiliary_zero(v,m)
    initialSHA=stock_hash(v);M=exp.(vec(SW.get_step(v.grid.pressure,2).data))
    q=copy(SW.get_step(v.grid.humidity,2).data);q0=.012
    real=CarrierState(M,M.*q);uniform=CarrierState(M,M.*fill(q0,size(q)))
    sharpq=zeros(size(q));sharpq[m.geometry.londs.<180,:].=.02
    sharp=CarrierState(M,M.*sharpq)
    states=(;real,uniform,sharp)
    initial=Dict(string(k)=>carrier_stock(c,w,ds,g) for(k,c) in pairs(states))
    baseline=JSON3.read(read("build/earth-speedy-transport/wet-carrier-projected-native-red.json",String))
    @test initialSHA==baseline.initialSHA
    control=SW.Simulation(deepcopy(v),deepcopy(m));SW.time_step!(control)
    rows=Any[]
    @testset "native spherical shared carrier and native RAW conservation" begin
        for step in 1:3
            counter=v.prognostic.clock.step_counter;span=SW.time_step(m.time_stepping,v.prognostic.clock)
            tendencies=Dict{String,Any}()
            for (name,c) in pairs(states)
                assert_flux_auxiliary_zero(repeat(c.currentM,1,length(ds)),v,m)
                assert_flux_auxiliary_zero(c.currentQ,v,m)
                tendency=carrier_tendency(c,v,m)
                tendencies[string(name)]=(;airRateGlobalKgM2S=dot(w,tendency.M)/g,
                    waterRateGlobalKgM2S=dot(w,tendency.Q*ds)/g,
                    maxLayerContinuityError=tendency.maxLayerContinuityError,
                    maxBottomClosurePaS=maximum(abs,tendency.bottomClosure),
                    maxNativeSpanVerticalCourant=maximum(abs,tendency.G[:,2:end]./c.currentM.*span./ds'))
                @test abs(dot(w,tendency.M)/g)<1e-13
                @test abs(dot(w,tendency.Q*ds)/g)<1e-13
                @test tendency.maxLayerContinuityError<1e-12
                @test maximum(abs,tendency.bottomClosure)<1e-12
                advance_carrier!(c,tendency,v.prognostic.clock,m.time_stepping)
            end
            staged=native_staged_step!(sim,w)
            @test assert_scalar_auxiliary_zero(v,m)
            if step==1
                for key in (:pressure,:humidity,:temperature,:vorticity,:divergence)
                    @test getproperty(v.prognostic,key).data==getproperty(control.variables.prognostic,key).data
                end
            end
            native=air_stocks(v,m,w);nativeM=exp.(vec(SW.get_step(v.grid.pressure,2).data))
            # RED reconstructs pressure separately; the batched native inverse
            # and this separate inverse differ at summation roundoff only.
            lpRaw=similar(SW.get_step(v.grid.pressure,2))
            SW.transform!(lpRaw,SW.get_step(v.prognostic.pressure,2),m.spectral_transform)
            nativeRawAir=dot(w,exp.(vec(lpRaw.data)))/g
            @test nativeRawAir==baseline.rows[step].airKgM2
            @test abs(native.waterKgM2-baseline.rows[step].gridWaterMm)<1e-12
            stock=Dict(string(k)=>carrier_stock(c,w,ds,g) for(k,c) in pairs(states))
            for name in keys(stock)
                @test abs(stock[name].airKgM2-initial[name].airKgM2)<1e-9
                @test abs(stock[name].waterMm-initial[name].waterMm)<1e-10
            end
            ownError=maximum(abs,uniform.currentQ./uniform.currentM.-q0)
            @test ownError<1e-14
            @test maximum(abs,real.currentQ-M.*q)>1e-4 # Q really transported, not frozen cellwise
            bridgeError=maximum(abs,uniform.currentQ./nativeM.-q0)
            loc=Tuple(argmin(sharp.currentQ));ij,k=loc
            pdiag=projection_diagnostics(real,v,m,w;truncate=false)
            pdiagClean=projection_diagnostics(real,v,m,w;truncate=true)
            push!(rows,(;step,counter,span,time=string(v.prognostic.clock.time),native,nativeRawAir,staged,
                stock,tendencies,ownConstantQError=ownError,usingNativePressureConstantQError=bridgeError,
                maxCarrierNativePressureDifferencePa=maximum(abs,real.currentM-nativeM),
                projection=pdiag,scalarTruncatedProjection=pdiagClean,
                sharpMinimum=(;ij,k,lat=m.geometry.latds[ij],lon=m.geometry.londs[ij],Q=sharp.currentQ[ij,k]),
                scalarAuxiliaryExactlyZero=true))
        end
    end
    result=(;scope="Source-free shared M/Q spectral-flux shadow on three true native projected-state velocity snapshots; native simulation is unchanged. No physics, no HD on carrier, no clipping, no M/Q feedback into model.",
        initialSHA,projection,initial,rows,
        conservedMechanism=true,
        compatibleWithNativePressure=all(r.usingNativePressureConstantQError<1e-12 for r in rows),
        positiveForSharpTracer=all(r.stock["sharp"].minQ>=-1e-14 for r in rows),
        projectionConservesWater=all(abs(r.scalarTruncatedProjection.waterProjectionErrorMm)<1e-10 for r in rows))
    open(io->JSON3.write(io,result),"build/earth-speedy-transport/wet-carrier-prototype-test.json","w")
    JLD2.jldsave("build/earth-speedy-transport/wet-carrier-prototype-fields.jld2";states,
        nativePressure=exp.(vec(SW.get_step(v.grid.pressure,2).data)),weights=w,thickness=ds)
    println(JSON3.write((;result.conservedMechanism,result.compatibleWithNativePressure,result.positiveForSharpTracer,
        result.projectionConservesWater,summary=[(;r.step,r.ownConstantQError,r.usingNativePressureConstantQError,
            stock=r.stock,projection=r.scalarTruncatedProjection,staged=r.staged) for r in rows])))
end
main()
