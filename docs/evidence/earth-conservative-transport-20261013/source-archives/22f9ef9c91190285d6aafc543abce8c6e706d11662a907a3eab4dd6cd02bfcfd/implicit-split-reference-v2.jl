# Optional CPU Leapfrog candidate: separate the frozen dynamics reference from
# the semi-implicit solver reference. Requires implicit-corrected.jl first.
# Uses SpeedyWeather 0.23.0 kernels, EUPL-1.2. Modified 2026-10-13.
# Copyright (c) 2020 Milan Kloewer; (c) 2021 The SpeedyWeather.jl Contributors;
# (c) 2022 Fred Kucharski and Franco Molteni.
# License: ../earth-speedy-moisture-monsoon-20261013/LICENSE-SpeedyWeather.txt.
struct SplitReferenceImplicit{I,V} <: SW.AbstractImplicit
    inner::I
    dynamics_profile::V
    initialized::Base.RefValue{Bool}
end
function SplitReferenceImplicit(sg;centering=1.0,enabled=true)
    inner=ConsistentImplicitPrimitiveEquation(sg;centering,enabled)
    SplitReferenceImplicit(inner,fill!(similar(inner.temp_profile),0),Ref(false))
end
function Base.getproperty(c::SplitReferenceImplicit,s::Symbol)
    s in (:inner,:dynamics_profile,:initialized) && return getfield(c,s)
    s==:temp_profile && return getfield(c,:dynamics_profile)
    getproperty(getfield(c,:inner),s)
end
Base.propertynames(c::SplitReferenceImplicit,private::Bool=false)=
    (:inner,:dynamics_profile,:initialized,propertynames(getfield(c,:inner),private)...)
SW.variables(c::SplitReferenceImplicit)=SW.variables(c.inner)
SW.initialize!(c::SplitReferenceImplicit,m::SW.PrimitiveEquation)=SW.initialize!(c.inner,m)

function SW.initialize!(c::SplitReferenceImplicit,dt::Real,Tdyn::AbstractVector,
        g::SW.AbstractGeometry,geopot::SW.AbstractGeopotential,A::SW.AbstractAtmosphere,
        adiab::SW.AbstractAdiabaticConversion)
    all(isfinite,Tdyn) && all(>(0),Tdyn) || throw(ArgumentError("positive finite dynamics reference required"))
    isfinite(A.reference_temperature) && A.reference_temperature>0 ||
        throw(ArgumentError("positive finite solver reference required"))
    c.dynamics_profile .= Tdyn
    Tsi=fill(eltype(c.dynamics_profile)(A.reference_temperature),length(Tdyn))
    SW.initialize!(c.inner,dt,Tsi,g,geopot,A,adiab)
    c.initialized[]=true
    nothing
end
function SW.reinitialize!(c::SplitReferenceImplicit,m::SW.PrimitiveEquation,v::SW.Variables)
    dt=SW.time_step(m.time_stepping,v.prognostic.clock)
    c.initialized[] && c.Δt[]==dt && return nothing
    SW.initialize!(c,m)
    # Match native/V2 capture: refresh only when the native step span changes.
    # A restored checkpoint supplies both its reference and dt, so same-dt resume
    # returns above without replacing its frozen dynamics reference.
    Tdyn=v.dynamics.average_temperature_profile
    SW.initialize!(c,dt/v.prognostic.scale[],Tdyn,m.geometry,m.geopotential,m.atmosphere,m.adiabatic_conversion)
    c.Δt[]=dt
    nothing
end

function add_background_temperature_advection!(v,c::SplitReferenceImplicit,m)
    background=v.scratch.grid.implicit_background_temperature
    tendency=v.scratch.grid.implicit_background_tendency
    spectral=v.scratch.implicit_background_tendency
    background.data .= c.temp_profile'
    fill!(tendency,0)
    SW._vertical_advection!(tendency,1,v.dynamics.w,background,1,m.geometry.σ_levels_thick,m.vertical_advection)
    SW.transform!(spectral,tendency,m.spectral_transform)
    target=SW.get_tendency_step(v.tendencies.temperature,m.time_stepping,c)
    target .+= spectral
    nothing
end

"""Move only the pressure-gradient linear split from U_dyn to U_si.

Native dynamics already includes lambda*U_dyn*(p_old-p_current). Therefore add
lambda*(U_si-U_dyn)*(p_old-p_current) before the SI block solve. There is no
extra dt or radius factor: this is a radius-scaled native tendency. R and W
are reference-independent, and the native SI kernel shifts L itself.
"""
function shift_divergence_reference!(v,c::SplitReferenceImplicit,m)
    ts=m.time_stepping
    old=SW.get_prognostic_step(v.prognostic.pressure,ts,SW.LinearDynamicalCore())
    current=SW.get_prognostic_step(v.prognostic.pressure,ts,SW.DynamicalCore())
    target=SW.get_tendency_step(v.tendencies.divergence,ts,c)
    ls=target.spectrum.l_indices
    for k in 1:c.nlayers,lm in eachindex(old)
        l=ls[lm];lambda=-l*(l-1)
        deltaU=c.U[k]+m.atmosphere.R_dry*c.temp_profile[k]
        target[lm,k]+=lambda*deltaU*(old[lm]-current[lm])
    end
    nothing
end
function SW.implicit_correction!(v::SW.Variables,c::SplitReferenceImplicit,
        ts::SW.AbstractLeapfrog,m::SW.PrimitiveEquation)
    add_background_temperature_advection!(v,c,m)
    if c.enabled && c.centering!=0
        shift_divergence_reference!(v,c,m)
        # Call native inner directly: the Consistent wrapper would add background twice.
        SW.implicit_correction!(v,c.inner.inner,ts,m)
    end
    nothing
end
