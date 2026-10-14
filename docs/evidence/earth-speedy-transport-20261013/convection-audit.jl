# Independent diagnostics only. No source replacement or model integration.
# Derived trace of SpeedyWeather 0.23.0 convection.jl, EUPL-1.2.
# Copyright (c) 2020 Milan Kloewer; (c) 2021 The SpeedyWeather.jl Contributors;
# (c) 2022 Fred Kucharski and Franco Molteni for SPEEDY parametrization schemes.
# Modified 2026-10-13. Licence: convection-LICENSE.txt.
using SpeedyWeather, Dates, JSON3, Test, SHA
const SW = SpeedyWeather
const ROOT = normpath(joinpath(@__DIR__, "../../.."))
const OUT = joinpath(ROOT, "build/earth-speedy-transport")
mkpath(OUT)
const A = SW.EarthAtmosphere(Float64)
const SIGMA = collect(0.0625:0.125:0.9375)
const HALF = collect(0.0:0.125:1.0)
const RHREF = 0.7

function hydrostatic(T, q)
    # Same two-half-layer hydrostatic quadrature as the native SigmaCoordinates path.
    phi = zeros(1, length(SIGMA))
    tv = SW.virtual_temperature(T[1, 8], q[1, 8], A)
    phi[1, 8] = A.R_dry * tv * log(1 / SIGMA[8])
    for k in 7:-1:1
        tvbelow = tv
        tv = SW.virtual_temperature(T[1, k], q[1, k], A)
        phi[1, k] = phi[1, k+1] + A.R_dry * (
            tvbelow * log(SIGMA[k+1] / HALF[k+1]) + tv * log(HALF[k+1] / SIGMA[k]))
    end
    phi
end

function trace_native(label, temperatures, humidities, entrainment; ps=100000.0)
    T = reshape(copy(temperatures), 1, 8)
    q = reshape(copy(humidities), 1, 8)
    phi = hydrostatic(T, q)
    tr, qr = zeros(1, 8), zeros(1, 8)
    lzb = SW.pseudo_adiabat!(1, tr, qr, T, q, phi, ps, SIGMA, A, RHREF, entrainment)
    # Trace the native intermediate parcel, verifying every retained native reference
    # value against the public routine. This instrumentation does not replace it.
    tp, qp = T[1,8], q[1,8]
    tvp = SW.virtual_temperature(tp, qp, A)
    saturated, buoyant = false, true
    steps = []
    for k in 7:-1:1
        buoyant || break
        tprev, qprev, phiprev = tp, qp, phi[1,k+1]
        first_saturation = false
        t_dry, qs_dry = nothing, nothing
        if !saturated
            t_dry = tp * (SIGMA[k] / SIGMA[k+1])^A.κ
            qs_dry = SW.saturation_humidity(t_dry, SIGMA[k]*ps, A)
            saturated = qp >= qs_dry
            first_saturation = saturated
        end
        q_before_entrainment = qp
        epsilon = 0.0
        if saturated
            aa = qp*A.latent_heat_condensation / ((1-qp)^2*A.R_dry)
            bb = qp*A.latent_heat_condensation^2 / ((1-qp)^2*A.heat_capacity*A.R_vapor)
            gamma = (1+aa/tvp) / (1+bb/tp^2)
            tp -= (phi[1,k]-phiprev)/A.heat_capacity*gamma
            qp = SW.saturation_humidity(tp, SIGMA[k]*ps, A)
            qs = qp
            q_before_entrainment = qp
            if SW.entraining(entrainment)
                epsilon = entrainment(SIGMA[k])
                tp = (1-epsilon)*tp + epsilon*T[1,k]
                qp = (1-epsilon)*qp + epsilon*q[1,k]
                qs = SW.saturation_humidity(tp, SIGMA[k]*ps, A)
            end
        else
            tp = t_dry
            qs = qs_dry
        end
        tvp = SW.virtual_temperature(tp, qp, A)
        buoyant = tvp > SW.virtual_temperature(T[1,k], q[1,k], A)
        if buoyant
            @test tr[1,k] ≈ tp atol=1e-12
            @test qr[1,k] ≈ RHREF*qs atol=1e-14
        end
        # Condensation + convex entrainment cannot exceed either input humidity.
        water_bound = max(qprev, q[1,k])
        push!(steps, (;k,firstSaturation=first_saturation,wasSaturated=saturated,
            inputTemperatureK=tprev,inputHumidity=qprev,environmentHumidity=q[1,k],
            dryTemperatureK=t_dry,drySaturationHumidity=qs_dry,
            humidityBeforeEntrainment=q_before_entrainment,entrainmentFraction=epsilon,
            outputTemperatureK=tp,outputHumidity=qp,waterBound=water_bound,
            waterBoundExcess=qp-water_bound,parcelRH=qp/qs,
            buoyancyVirtualK=tvp-SW.virtual_temperature(T[1,k],q[1,k],A),buoyant))
    end
    pq = sum((q-qr).*0.125)
    pt = sum((tr-T).*0.125)
    (;label,entrainment=string(typeof(entrainment)),ps,temperatureK=vec(T),humidity=vec(q),
        geopotentialM2S2=vec(phi),lzb,pq,pt,deep=pq>0&&pt>0,shallow=pq<=0&&pt>0,
        temperatureReferenceK=vec(tr),humidityReference=vec(qr),steps)
end

records = []
@testset "Native pseudo-adiabat evidence" begin
    # Eight-level, unsaturated surface parcel and colder, drier environment.
    temps = [210.,220.,235.,250.,262.,273.,282.,290.74]
    humid = [0.6*SW.saturation_humidity(temps[k],SIGMA[k]*100000,A) for k in 1:8]
    humid[8] = 0.008619
    for entrainment in (SW.NoEntrainment(),SW.LinearEntrainment(Float64))
        r = trace_native("unsaturated-crossing-LCL",temps,humid,entrainment)
        push!(records,r)
        first = r.steps[1]
        @test first.firstSaturation
        @test first.buoyant
        # A detected counterexample, not a passing physics invariant:
        @test first.waterBoundExcess > 1e-5
        @test r.lzb < 8
    end
    # Native enthalpy/moisture adjustment needs separate testing. Monthly
    # regional profiles only screen sensitivity; they are not instantaneous rates.
    previous = JSON3.read(read(joinpath(ROOT,
        "docs/evidence/earth-speedy-moisture-monsoon-20261013/acceptance.json"),String))
    coupled = only(filter(c->c.id=="coupled-seasonal",previous.cases))
    india = only(filter(r->r.name=="India",coupled.regions))
    for month in 1:12
        temps = [Float64(india.profiles[k].temperatureK[month]) for k in 1:8]
        humid = [Float64(india.profiles[k].specificHumidity[month]) for k in 1:8]
        ps = Float64(india.surface.pressurePa[month])
        push!(records,trace_native("India-regional-monthly-mean-$(month)",temps,humid,SW.LinearEntrainment(Float64);ps))
    end
end

sources = ["src/parameterizations/convection.jl","src/parameterizations/entrainment.jl",
    "src/dynamics/atmosphere.jl","src/parameterizations/radiation/radiation.jl"]
pkg = joinpath(ROOT,"build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16")
output = (;schema="independent-convection-audit-v1",juliaVersion=string(VERSION),
    packageVersion=string(pkgversion(SW)),sigma=SIGMA,records,
    sourceSHA256=Dict(p=>bytes2hex(sha256(read(joinpath(pkg,p)))) for p in sources),
    interpretation="Detected native parcel-water counterexample. No integration, climate attribution, or candidate repair was performed. Monthly regional mean columns are nonlinear screening only.")
open(joinpath(OUT,"convection-audit.json"),"w") do io
    JSON3.write(io,output)
end
for r in records
    println(JSON3.write((;label=r.label,lzb=r.lzb,pq=r.pq,pt=r.pt,deep=r.deep,shallow=r.shallow,
        maxParcelWaterExcess=maximum(s.waterBoundExcess for s in r.steps))))
end
