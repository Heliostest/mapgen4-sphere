# Source-free native V3 conservation requirements, without a global mass constraint.
include("transport-v3-model.jl")
using Dates, JSON3, LinearAlgebra, Test
BLAS.set_num_threads(1)
function raw_stock(v,m,w)
    lp=similar(SW.get_step(v.grid.pressure,2));q=similar(SW.get_step(v.grid.humidity,2))
    SW.transform!(lp,SW.get_step(v.prognostic.pressure,2),m.spectral_transform)
    SW.transform!(q,SW.get_step(v.prognostic.humidity,2),m.spectral_transform)
    p=exp.(vec(lp.data));ds=m.geometry.σ_levels_thick;g=m.planet.gravity
    (;airKgM2=dot(w,p)/g,rawWaterMm=dot(w,p.*(q.data*ds))/g,
        gridWaterMm=air_stocks(v,m,w).waterKgM2,
        rawMinQ=minimum(q),clipWaterMm=dot(w,p.*(max.(q.data,0)*ds))/g-dot(w,p.*(q.data*ds))/g)
end
function main()
    sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
    m=transport_model(sg,"seasonal")
    sim=apply_frozen_initial!(initialize!(m;time=DateTime(2001,1,1)))
    SW.initialize!(sim;period=Day(3),output=false)
    m.dynamics_only=true
    v=sim.variables;w=native_weights(m);initial=raw_stock(v,m,w);initialSHA=stock_hash(v)
    @assert !haskey(MASS_CONTEXTS,m) && !haskey(SST_CONTEXTS,m)
    rows=Any[]
    for step in 1:3
        counter=v.prognostic.clock.step_counter;span=SW.time_step(m.time_stepping,v.prognostic.clock)
        SW.time_step!(sim)
        s=raw_stock(v,m,w)
        push!(rows,(;step,counter,span,time=string(v.prognostic.clock.time),s...,
            airResidualKgM2=s.airKgM2-initial.airKgM2,
            rawWaterResidualMm=s.rawWaterMm-initial.rawWaterMm,
            gridWaterResidualMm=s.gridWaterMm-initial.gridWaterMm))
    end
    result=(;scope="Frozen 2001 initial state, V3 native dynamics-only, no physics, no global mass or SST constraint; nominal 30 min, both startup spans and first full leapfrog span.",initialSHA,initial,rows)
    open(io->JSON3.write(io,result),"build/earth-speedy-transport/wet-carrier-native-red.json","w")
    println(JSON3.write(result))
    @testset "closed native air and water inventory at every startup span" begin
        for r in rows
            @test abs(r.airResidualKgM2)<1e-9
            @test abs(r.rawWaterResidualMm)<1e-10
            @test abs(r.gridWaterResidualMm)<1e-10
        end
    end
end
main()
