# Inspect scalar auxiliary-row provenance and projection; no climate integration.
using LinearAlgebra, JSON3, JLD2, SHA
include("transport-v2-model.jl")
BLAS.set_num_threads(1)
const ROOT=normpath(joinpath(@__DIR__,"../../.."))
sg=SW.SpectralGrid(NF=Float64,truncation=32,nlayers=8)
m=transport_model(sg,"seasonal")
SW.initialize!(m.geopotential,m);SW.initialize!(m.adiabatic_conversion,m)
SW.initialize!(m.orography,m)
const FIELDS=(:temperature,:humidity,:pressure,:vorticity,:divergence)
const PATHS=("build/earth-speedyweather/annual-initial.jld2",
 "build/earth-speedy-moisture-monsoon/coupled-seasonal-initial.jld2",
 "build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics-start.jld2",
 "build/earth-speedy-moisture-monsoon/coupled-seasonal-final.jld2")
hashdata(x)=bytes2hex(sha256(reinterpret(UInt8,vec(copy(x)))))
function unpack(path)
    saved=JLD2.load(joinpath(ROOT,path));v=SW.Variables(m)
    for key in ("prognostic","grid");SW.copy_variables!(getproperty(v,Symbol(key)),saved["containers"][key]);end
    saved,v
end
function rows(v)
    result=[]
    for key in FIELDS,step in 1:2
        x=SW.get_step(getproperty(v.prognostic,key),step)
        mask=x.spectrum.l_indices.==33
        push!(result,(;field=string(key),step,auxiliaryMax=maximum(abs,x.data[mask,:]),
            auxiliarySHA=hashdata(x.data[mask,:]),physicalSHA=hashdata(x.data[.!mask,:])))
    end
    result
end
records=[];projections=[]
for path in PATHS
    saved,v=unpack(path)
    push!(records,(;path,sourceSHA=bytes2hex(sha256(read(joinpath(ROOT,path)))),clock=string(v.prognostic.clock.time),
        radiusScale=v.prognostic.scale[],rows=rows(v)))
    println(JSON3.write(last(records)))
    weights=native_weights(m)
    before=Dict();after=Dict();changes=[]
    for key in FIELDS
        x=SW.get_step(getproperty(v.prognostic,key),2);y=deepcopy(x)
        y.data[y.spectrum.l_indices.==33,:].=0
        a=SW.transform(x,m.spectral_transform);b=SW.transform(y,m.spectral_transform)
        before[key]=copy(a.data);after[key]=copy(b.data)
        valid=x.spectrum.l_indices.<=32
        push!(changes,(;field=string(key),physicalCoefficientsExactlyUnchanged=isequal(x.data[valid,:],y.data[valid,:]),
            beforeSHA=hashdata(x.data),projectedSHA=hashdata(y.data),gridMaxChange=maximum(abs,b.data-a.data),
            gridRmsChange=sqrt(sum(weights.*vec(sum(abs2,b.data-a.data;dims=2)))/size(b.data,2)),
            stateUnits=key in (:vorticity,:divergence) ? "radius-scaled s^-1; divide reported difference by radius" : string(key)))
    end
    rawwater(a)=sum(weights.*exp.(vec(a[:pressure])).*(a[:humidity]*m.geometry.σ_levels_thick))/m.planet.gravity
    rawtotal(a)=sum(weights.*exp.(vec(a[:pressure])))/m.planet.gravity
    qa=SW.transform(SW.get_step(v.prognostic.humidity,2),m.spectral_transform)
    qb=deepcopy(qa);qb.data .=after[:humidity]
    # Native hole filling alters grid humidity only, not spectral humidity.
    qspec=copy(SW.get_step(v.prognostic.humidity,2).data)
    SW.hole_filling!(qa,m.hole_filling,m);SW.hole_filling!(qb,m.hole_filling,m)
    nativeWaterBefore=sum(weights.*exp.(vec(before[:pressure])).*(qa.data*m.geometry.σ_levels_thick))/m.planet.gravity
    nativeWaterAfter=sum(weights.*exp.(vec(after[:pressure])).*(qb.data*m.geometry.σ_levels_thick))/m.planet.gravity
    push!(projections,(;path,changes,rawWaterBeforeMm=rawwater(before),rawWaterAfterMm=rawwater(after),
        rawWaterChangeMm=rawwater(after)-rawwater(before),nativeClippedWaterBeforeMm=nativeWaterBefore,
        nativeClippedWaterAfterMm=nativeWaterAfter,nativeClippedWaterChangeMm=nativeWaterAfter-nativeWaterBefore,
        totalMassChangeKgM2=rawtotal(after)-rawtotal(before),
        holeFillingSpectralExactlyUnchanged=isequal(qspec,SW.get_step(v.prognostic.humidity,2).data)))
end
# Native initialization alone: non-linear PressureOnOrography -> set!(grid) -> SHT.
vi=SW.Variables(m)
SW.initialize!(vi,SW.PressureOnOrography(sg),m)
pi=SW.get_step(vi.prognostic.pressure,1)
initialization=(;pressureAuxiliaryMax=maximum(abs,pi.data[pi.spectrum.l_indices.==33]),
    pressureAuxiliarySHA=hashdata(pi.data[pi.spectrum.l_indices.==33]))
# A single native leapfrog prognostic update with zero tendency preserves equal
# old/current auxiliary state, showing no scalar-state cleanup is performed.
saved,v=unpack(PATHS[3]);v.prognostic.clock.step_counter=10
SW.reset_tendencies!(v,m.time_stepping)
updates=[]
for key in FIELDS
    x=getproperty(v.prognostic,key);t=getproperty(v.tendencies,key)
    SW.get_step(x,1).data .=SW.get_step(x,2).data
    original=copy(SW.get_step(x,2).data)
    SW.update_prognostic!(x,t,v.prognostic.clock,m.time_stepping,m.implicit,m,v.prognostic.scale[])
    push!(updates,(;field=string(key),exactlyUnchanged=isequal(original,SW.get_step(x,2).data),
        auxiliaryMax=maximum(abs,SW.get_step(x,2).data[SW.get_step(x,2).spectrum.l_indices.==33,:])))
end
# Frozen dry-mass constraint touches pressure's constant mode only.
saved,v=unpack(PATHS[3]);weights=native_weights(m)
before=copy(v.prognostic.pressure.data)
c=register_mass!(v,m;target=air_stocks(v,m,weights).dryKgM2*(1+1e-6))
constrain_mass!(v,m,c)
pressureChange=v.prognostic.pressure.data-before
mask=v.prognostic.pressure.spectrum.l_indices.==33
mass=(;deltaLogPressure=c.lastDeltaLogPressure,auxiliaryChangeMax=maximum(abs,pressureChange[mask,:]),
    nonconstantChangeMax=maximum(abs,pressureChange[2:end,:]))
record=(;scriptSHA=bytes2hex(sha256(read(@__FILE__))),records,projections,initialization,zeroTendencyNativeUpdates=updates,mass,
    note="Projection is diagnostic in memory only, changes physical fields and water stocks; no derived checkpoint was written and no source checkpoint SHA is reused as a projected-state identity.")
println(JSON3.write(record))
open(io->JSON3.write(io,record),joinpath(ROOT,"build/earth-speedy-transport/readonly-scalar-auxiliary.json"),"w")
