# Parcel integration replacement for SpeedyWeather 0.23.0 BettsMillerConvection.
# Copyright (c) 2020 Milan Kloewer; (c) 2021 The SpeedyWeather.jl Contributors;
# (c) 2022 Fred Kucharski and Franco Molteni for SPEEDY parametrization schemes.
# Modified 2026-10-13. EUPL-1.2: convection-LICENSE.txt.
# The native Betts-Miller adjustment, rain accounting, RH, tau, entrainment,
# virtual-buoyancy test, and first-loss LZB rule are reused without modification.

export ConservativeParcelConvection, corrected_pseudo_adiabat!

"""Numerical parcel integrator marker; contains no prognostic state."""
struct CorrectedParcelEntrainment{E,NF} <: SW.AbstractEntrainment
    inner::E
    max_log_pressure_step::NF
end

struct ConservativeParcelConvection{C,K} <: SW.AbstractConvection
    inner::C
    kernel::K
end

function ConservativeParcelConvection(sg; max_log_pressure_step=0.1, kwargs...)
    max_log_pressure_step>0 || throw(ArgumentError("max_log_pressure_step must be positive"))
    inner=SW.BettsMillerConvection(sg;kwargs...)
    marker=CorrectedParcelEntrainment(inner.entrainment,sg.NF(max_log_pressure_step))
    kernel=SW.BettsMillerConvection(sg;
        time_scale=inner.time_scale,relative_humidity=inner.relative_humidity,
        entrainment=marker,snow=inner.snow,freezing_threshold=inner.freezing_threshold)
    ConservativeParcelConvection(inner,kernel)
end
SW.variables(c::ConservativeParcelConvection)=SW.variables(c.inner)
SW.initialize!(c::ConservativeParcelConvection,m::SW.PrimitiveEquation)=SW.initialize!(c.inner,m)
SW.parameterization!(ij,vars,c::ConservativeParcelConvection,m)=SW.convection!(ij,vars,c.kernel,m)

"""Solve latent heating and saturation together, never clipping humidity.

Tbase is the dry-lifted temperature. beta = Lv/cp times the pressure weight
of latent heating. Solve T-Tbase = beta*(qin-qs(T,p)) within the physical
temperature bracket [Tbase, Tsat(qin,p)]. The root has qout <= qin.
The same operation with beta=Lv/cp removes supersaturation after mixing,
preserving cp*T+Lv*q at the fixed destination pressure.
"""
@inline function parcel_condensation_adjustment(Tbase,qin,p,A,beta)
    qs=SW.saturation_humidity(Tbase,p,A)
    qin<=qs && return Tbase,qin
    # Exact inverse of this model's analytic, dilute Clausius-Clapeyron qsat.
    tsat=inv(inv(A.temperature_freezing)-A.R_vapor/A.latent_heat_condensation*
        log(qin*p/(A.mol_ratio*A.saturation_vapor_pressure)))
    lo,hi=Tbase,tsat
    t=Tbase
    tolerance=8eps(typeof(t))*max(one(t),abs(t))
    for iteration in 1:24
        qs=SW.saturation_humidity(t,p,A)
        f=t-Tbase-beta*(qin-qs)
        slope=one(t)+beta*qs*A.latent_heat_condensation/(A.R_vapor*t*t)
        abs(f)<=tolerance*slope && return t,qs
        if f>0
            hi=t
        else
            lo=t
        end
        proposal=t-f/slope
        # A safeguarded Newton step. Bisection is a root-solver fallback,
        # not a humidity limiter; it preserves the same physical equation.
        t=lo<proposal<hi ? proposal : (lo+hi)/2
    end
    error("Parcel condensation root did not converge")
end

"""Pressure of the LCL on the exact dry adiabat; q stays unchanged."""
@inline function parcel_lcl(T,q,pstart,pend,A)
    lo=log(pend/pstart);hi=zero(lo)
    x=(lo+hi)/2
    logq=log(q)
    for iteration in 1:20
        t=T*exp(A.κ*x)
        p=pstart*exp(x)
        f=log(SW.saturation_humidity(t,p,A))-logq
        abs(f)<=16eps(typeof(x)) && return p,t
        if f>0
            hi=x
        else
            lo=x
        end
        derivative=A.κ*A.latent_heat_condensation/(A.R_vapor*t)-one(t)
        proposal=x-f/derivative
        x=lo<proposal<hi ? proposal : (lo+hi)/2
    end
    # Pressure brackets are tiny by this point even near machine precision.
    x=(lo+hi)/2
    pstart*exp(x),T*exp(A.κ*x)
end

"""Lift an isolated parcel. Dry segments conserve q and potential temperature.

Wet segments integrate d(theta) = -(Lv/cp)*(pref/p)^kappa*dq using
the log-pressure midpoint weight, and solve the end-state saturation/latent
heating equations simultaneously. max_log_pressure_step is an integration
accuracy limit, not a convection threshold. Entrainment is applied once per
native model level by corrected_pseudo_adiabat!, as in the original scheme.
"""
function corrected_parcel_lift(T,q,pstart,pend,A;max_log_pressure_step=0.1)
    pend<=pstart || throw(ArgumentError("Parcel lift requires decreasing pressure"))
    beta=A.latent_heat_condensation/A.heat_capacity
    T,q=parcel_condensation_adjustment(T,q,pstart,A,beta)
    pend==pstart && return T,q
    Tdry=T*(pend/pstart)^A.κ
    if q<=SW.saturation_humidity(Tdry,pend,A)
        return Tdry,q
    end
    if q<SW.saturation_humidity(T,pstart,A)*(1-16eps(typeof(T)))
        pstart,T=parcel_lcl(T,q,pstart,pend,A)
    end
    n=max(1,ceil(Int,abs(log(pend/pstart))/max_log_pressure_step))
    h=log(pend/pstart)/n
    dryfactor=exp(A.κ*h)
    latentfactor=exp(A.κ*h/2)
    p=pstart
    for step in 1:n
        p=step==n ? pend : pstart*exp(step*h)
        T,q=parcel_condensation_adjustment(T*dryfactor,q,p,A,beta*latentfactor)
    end
    T,q
end

function corrected_pseudo_adiabat!(ij,tr,qr,Tenv,qenv,geopotential,ps,sigma,A,rhref,e;
        max_log_pressure_step=0.1)
    n=length(sigma)
    tp=Tenv[ij,n];qp=qenv[ij,n]
    tr[ij,n]=tp
    qr[ij,n]=rhref*SW.saturation_humidity(tp,sigma[n]*ps,A)
    buoyant=true;lzb=1
    cloud_formed=qp>=SW.saturation_humidity(tp,sigma[n]*ps,A)
    for k in (n-1):-1:1
        if buoyant
            q_before_lift=qp
            tp,qp=corrected_parcel_lift(tp,qp,sigma[k+1]*ps,sigma[k]*ps,A;max_log_pressure_step)
            cloud_formed |= qp<q_before_lift
            if cloud_formed && SW.entraining(e)
                # Retain native per-level epsilon, independent of numerical substeps.
                epsilon=e(sigma[k])
                tp=(1-epsilon)*tp+epsilon*Tenv[ij,k]
                qp=(1-epsilon)*qp+epsilon*qenv[ij,k]
                tp,qp=parcel_condensation_adjustment(tp,qp,sigma[k]*ps,A,
                    A.latent_heat_condensation/A.heat_capacity)
            end
            buoyant=SW.virtual_temperature(tp,qp,A)>SW.virtual_temperature(Tenv[ij,k],qenv[ij,k],A)
            lzb=buoyant ? k : k+1
        end
        tr[ij,k]=buoyant ? tp : Tenv[ij,k]
        qr[ij,k]=buoyant ? rhref*SW.saturation_humidity(tp,sigma[k]*ps,A) : qenv[ij,k]
    end
    lzb
end

# Dispatch only the new marker; the installed package and ordinary native calls
# retain their original implementation. All final tendencies/rain are computed
# by the unchanged native convection! method using these reference profiles.
SW.pseudo_adiabat!(ij,tr,qr,Tenv,qenv,phi,ps,sigma,A,rhref,e::CorrectedParcelEntrainment)=
    corrected_pseudo_adiabat!(ij,tr,qr,Tenv,qenv,phi,ps,sigma,A,rhref,e.inner;
        max_log_pressure_step=e.max_log_pressure_step)
