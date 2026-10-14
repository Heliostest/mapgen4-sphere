# Optional import-only projection for the pinned SpeedyWeather scalar spectrum.
# Native transform conventions are from SpeedyWeather (EUPL-1.2), qRu16.
# This file does not replace any native method or change a running time step.
module ScalarInitialProjection
using SpeedyWeather, SHA
const SW=SpeedyWeather
export project_scalar_initial!, assert_scalar_auxiliary_zero,
    scalar_projection_inventory, scalar_projection_state_sha
const SCALARS=(:temperature,:humidity,:pressure,:vorticity,:divergence)

function digest_part!(h,x,name)
    SHA.update!(h,codeunits(name*":"*string(typeof(x))*";"))
    if x isa AbstractArray
        a=hasproperty(x,:data) ? x.data : x
        SHA.update!(h,codeunits(string(size(a))))
        SHA.update!(h,reinterpret(UInt8,vec(copy(a))))
    elseif x isa NamedTuple
        for k in keys(x);digest_part!(h,getproperty(x,k),string(k));end
    elseif x isa Ref
        SHA.update!(h,codeunits(repr(x[])))
    elseif x isa SW.Clock
        for k in fieldnames(typeof(x));SHA.update!(h,codeunits(string(k)*"="*repr(getfield(x,k))*";"));end
    else
        SHA.update!(h,codeunits(repr(x)))
    end
    return h
end

"""Content fingerprint of atmosphere/grid plus prognostic land/ocean/clock.
This is not a JLD2 file SHA. Hash a saved derivative separately."""
function scalar_projection_state_sha(v)
    h=SHA.SHA2_256_CTX()
    digest_part!(h,v.prognostic,"prognostic");digest_part!(h,v.grid,"grid")
    return bytes2hex(SHA.digest!(h))
end
data_sha(x)=bytes2hex(sha256(reinterpret(UInt8,vec(copy(x)))))

"""Exact invariant check for BOTH time levels; no state mutation and no tolerance."""
function assert_scalar_auxiliary_zero(v,m)
    cutoff=m.spectral_grid.truncation
    for key in SCALARS,step in 1:2
        x=SW.get_step(getproperty(v.prognostic,key),step)
        mask=x.spectrum.l_indices.>cutoff
        @assert all(iszero,x.data[mask,:]) "Nonzero scalar auxiliary state: $key step $step"
    end
    return true
end

function scalar_projection_inventory(v,m)
    solid=SW.RingGrids.get_solid_angles(m.spectral_grid.Grid,m.spectral_grid.nlat_half)
    w=Float64[solid[r]/(4pi) for r in m.geometry.whichring]
    function at(step)
        p=exp.(vec(SW.get_step(v.grid.pressure,step).data))
        q=SW.get_step(v.grid.humidity,step).data
        t=SW.get_step(v.grid.temperature,step).data
        total=sum(w.*p)/m.planet.gravity
        water=sum(w.*p.*(q*m.geometry.σ_levels_thick))/m.planet.gravity
        sensible=sum(w.*p.*(t*m.geometry.σ_levels_thick))/m.planet.gravity*m.atmosphere.heat_capacity
        return (;totalKgM2=total,waterKgM2=water,dryKgM2=total-water,sensibleHeatProxyJm2=sensible)
    end
    return (;time=string(v.prognostic.clock.time),previous=at(1),current=at(2))
end

"""
    project_scalar_initial!(vars,model; source_sha,
        stationary_history_fields=(),stationary_history_evidence="",
        matching_history_fields=())

Call once AFTER checkpoint containers have been copied and BEFORE recording the
new experiment's initial inventories. Clears auxiliary scalar rows in both
spectral time levels without changing any valid coefficient. Rebuilds current
grid scalars/u/v and the diagnostics updated by the native grid transform, but
does NOT invoke that transform's history rotation or initialize a time step.

Old grids have RAW history, not the inverse transform of old filtered spectra.
By default all old scalar grids are preserved, with deferred fields recorded.
`stationary_history_fields` requires external provenance that their auxiliary
coefficients have stayed unchanged in the physical history. Their old grid is
changed only by subtracting the known auxiliary contribution. Humidity cannot
use this route because native clipping is nonlinear. `matching_history_fields`
requires actual old-grid/native-reconstruction agreement (roundoff tolerance)
and removes only the exact before/after reconstruction difference, including
humidity clipping. Unprovable old humidity is left until natural grid rotation.
Old u/v are always retained: native UV inversion ignores scalar auxiliary rows.

No parameter, land/ocean state, clock, filter history, or mass target is reset.
The returned ledger measures import changes before any mass constraint. Attach
`assert_scalar_auxiliary_zero` to subsequent steps; never repeatedly project.
"""
function project_scalar_initial!(v,m;source_sha::AbstractString,
        stationary_history_fields=(),stationary_history_evidence::AbstractString="",
        matching_history_fields=())
    m.time_stepping isa SW.Leapfrog||throw(ArgumentError("Only the pinned two-level Leapfrog contract is verified"))
    occursin(r"^[a-fA-F0-9]{64}$",source_sha)||throw(ArgumentError("A source checkpoint SHA-256 is required"))
    all(k->k in SCALARS,(stationary_history_fields...,matching_history_fields...))||throw(ArgumentError("Unknown scalar history field"))
    isempty(intersect(stationary_history_fields,matching_history_fields))||throw(ArgumentError("History policies must not overlap"))
    isempty(stationary_history_fields)||!isempty(stationary_history_evidence)||throw(ArgumentError("Stationary auxiliary history requires cited provenance"))
    :humidity in stationary_history_fields&&throw(ArgumentError("Clipped humidity cannot use stationary linear subtraction"))
    S=m.spectral_transform;cutoff=m.spectral_grid.truncation
    beforeStateSHA=scalar_projection_state_sha(v)
    beforeInventory=scalar_projection_inventory(v,m)
    beforeSpectral=Dict((key,step)=>deepcopy(SW.get_step(getproperty(v.prognostic,key),step)) for key in SCALARS for step in 1:2)
    # Validate ALL history claims before mutating any state.
    matching=Dict{Symbol,Any}()
    for key in matching_history_fields
        reconstructed=SW.transform(beforeSpectral[(key,1)],S)
        key==:humidity&&SW.hole_filling!(reconstructed,m.hole_filling,m)
        old=SW.get_step(getproperty(v.grid,key),1)
        delta=maximum(abs,reconstructed.data-old.data)
        tolerance=64eps(eltype(old))*max(one(eltype(old)),maximum(abs,old.data))
        delta<=tolerance||throw(ArgumentError("$key old grid is not its stored old spectrum: maximum mismatch $delta > $tolerance"))
        matching[key]=(;reconstructed,delta,tolerance)
    end
    for key in stationary_history_fields
        a=beforeSpectral[(key,1)];b=beforeSpectral[(key,2)]
        mask=a.spectrum.l_indices.>cutoff
        isequal(a.data[mask,:],b.data[mask,:])||throw(ArgumentError("$key auxiliary levels differ; stationary history claim cannot apply"))
    end
    rows=Any[];history=Any[];currentReconstruction=Any[]
    for key in SCALARS,step in 1:2
        x=SW.get_step(getproperty(v.prognostic,key),step)
        mask=x.spectrum.l_indices.>cutoff
        before=beforeSpectral[(key,step)]
        x.data[mask,:].=0
        @assert isequal(before.data[.!mask,:],x.data[.!mask,:])
        push!(rows,(;field=string(key),step,beforeSHA=data_sha(before.data),afterSHA=data_sha(x.data),
            validSHA=data_sha(x.data[.!mask,:]),validCoefficientsBitwiseUnchanged=true,
            removedAuxiliaryMax=maximum(abs,before.data[mask,:])))
    end
    for key in SCALARS
        old=SW.get_step(getproperty(v.grid,key),1)
        beforeOld=copy(old.data)
        if key in stationary_history_fields
            auxiliary=beforeSpectral[(key,1)]
            auxiliary.data[auxiliary.spectrum.l_indices.<=cutoff,:].=0
            old.data .-=SW.transform(auxiliary,S).data
            action="subtract_proven_stationary_auxiliary_only"
        elseif key in matching_history_fields
            projected=SW.transform(SW.get_step(getproperty(v.prognostic,key),1),S)
            key==:humidity&&SW.hole_filling!(projected,m.hole_filling,m)
            old.data .+=projected.data.-matching[key].reconstructed.data
            action="subtract_verified_native_reconstruction_difference"
        else
            action="retain_untraceable_history_until_natural_rotation"
        end
        push!(history,(;field=string(key),action,maxGridChange=maximum(abs,old.data-beforeOld),
            beforeSHA=data_sha(beforeOld),afterSHA=data_sha(old.data),
            oldReconstructionMismatch=haskey(matching,key) ? matching[key].delta : nothing))
        current=SW.get_step(getproperty(v.grid,key),2)
        oldCurrent=copy(current.data)
        original=SW.transform(beforeSpectral[(key,2)],S)
        key==:humidity&&SW.hole_filling!(original,m.hole_filling,m)
        projected=SW.transform(SW.get_step(getproperty(v.prognostic,key),2),S)
        key==:humidity&&SW.hole_filling!(projected,m.hole_filling,m)
        current.data .=projected.data
        push!(currentReconstruction,(;field=string(key),preexistingStoredGridMismatch=maximum(abs,original.data-oldCurrent),
            maxGridChange=maximum(abs,current.data-oldCurrent),beforeSHA=data_sha(oldCurrent),afterSHA=data_sha(current.data)))
    end
    U=deepcopy(SW.get_step(v.prognostic.vorticity,2));V=similar(U)
    SW.UV_from_vordiv!(U,V,SW.get_step(v.prognostic.vorticity,2),SW.get_step(v.prognostic.divergence,2),S)
    for(key,spectrum) in ((:u,U),(:v,V))
        current=SW.get_step(getproperty(v.grid,key),2)
        original=copy(current.data)
        current.data .=SW.transform(spectrum,S;unscale_coslat=true).data
        push!(currentReconstruction,(;field=string(key),preexistingStoredGridMismatch=maximum(abs,current.data-original),
            maxGridChange=maximum(abs,current.data-original),beforeSHA=data_sha(original),afterSHA=data_sha(current.data)))
    end
    v.parameterizations.surface_pressure .=exp.(SW.get_step(v.grid.pressure,1))
    SW.temperature_average!(v,SW.get_step(v.prognostic.temperature,2),S)
    SW.geopotential!(v,m)
    assert_scalar_auxiliary_zero(v,m)
    deferredHistoryFields=Tuple(k for k in SCALARS if !(k in stationary_history_fields||k in matching_history_fields))
    return (;sourceSHA=String(source_sha),beforeStateSHA,afterStateSHA=scalar_projection_state_sha(v),
        beforeInventory,afterInventory=scalar_projection_inventory(v,m),rows,history,currentReconstruction,
        stationaryHistoryEvidence=String(stationary_history_evidence),deferredHistoryFields,
        historyLimitation=isempty(deferredHistoryFields) ? "All historical scalar changes have verified provenance; old u/v retained" :
            "Listed historical grids retain untraceable auxiliary contribution until natural rotation; its amplitude is not inferred from RAW-filtered old spectra",
        massConstraintApplied=false,clockLandOceanReset=false)
end
end
