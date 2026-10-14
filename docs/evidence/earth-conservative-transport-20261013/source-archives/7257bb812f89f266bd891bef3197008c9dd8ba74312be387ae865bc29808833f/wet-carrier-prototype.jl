"""Source-free research operator. Does not replace native pressure or humidity.

M=ps [Pa] and Q=ps*q [Pa] are independent authoritative grid stocks with both
Leapfrog/RAW memory levels. Native spherical spectral flux divergence is used;
this is not a neighboring-cell finite-volume or positivity-preserving operator.
No physical source, hyperdiffusion, clipping, or residual compensation is added.
"""
module NativeWetCarrier
using SpeedyWeather, LinearAlgebra
const SW=SpeedyWeather
export CarrierState, carrier_tendency, advance_carrier!, carrier_stock, projection_diagnostics

struct CarrierState{V,M}
    oldM::V
    currentM::V
    oldQ::M
    currentQ::M
end
CarrierState(M,Q)=CarrierState(copy(M),copy(M),copy(Q),copy(Q))

function horizontal_flux_tendency(A,v,m)
    field=similar(SW.get_step(v.grid.humidity,2));field.data .= A
    spec=similar(SW.get_step(v.prognostic.humidity,2))
    uA=similar(spec);vA=similar(spec);ug=similar(field);vg=similar(field)
    SW.flux_divergence!(spec,field,v,m;add=false,flipsign=true,
        uA,vA,uA_grid=ug,vA_grid=vg)
    out=similar(field);SW.transform!(out,spec,m.spectral_transform)
    out.data ./ v.prognostic.scale[]
end

function carrier_tendency(c::CarrierState,v,m;thickness=m.geometry.σ_levels_thick)
    ds=thickness;nz=length(ds);n=length(c.currentM)
    all(>(0),c.currentM) || throw(ArgumentError("carrier pressure must remain positive"))
    length(ds)==size(c.currentQ,2) || throw(DimensionMismatch())
    H=horizontal_flux_tendency(repeat(c.currentM,1,nz),v,m)
    Mdot=H*ds
    # Air mass flux at sigma interfaces, Pa/s. Both boundaries prescribed zero.
    G=zeros(eltype(H),n,nz+1)
    for k in 1:nz-1
        G[:,k+1].=G[:,k].+ds[k].*(H[:,k].-Mdot)
    end
    bottomClosure=G[:,nz].+ds[nz].*(H[:,nz].-Mdot)
    q=c.currentQ./c.currentM
    wetG=zeros(eltype(H),n,nz+1)
    for k in 1:nz-1
        wetG[:,k+1].=G[:,k+1].*(q[:,k].+q[:,k+1])./2
    end
    Qdot=horizontal_flux_tendency(c.currentQ,v,m)
    for k in 1:nz
        Qdot[:,k].-=(wetG[:,k+1].-wetG[:,k])./ds[k]
    end
    (;M=Mdot,Q=Qdot,H,G,bottomClosure,
        maxLayerContinuityError=maximum(abs,H.-diff(G,dims=2)./ds'.-Mdot))
end

function native_raw!(old,current,tendency,span,w1,w2,startup)
    reference=startup ? old : current
    SW.launch!(SW.CPU(),SW.LinearWorkOrder,(length(old),),SW.leapfrog_kernel!,
        old,current,reference,tendency,span,w1,w2)
    nothing
end
function advance_carrier!(c::CarrierState,tendency,clock,ts)
    span=SW.time_step(ts,clock) # seconds; tendencies already divided by radius
    startup=clock.step_counter<=1
    w1=startup ? 0. : ts.robert_filter*ts.williams_filter/2
    w2=startup ? 0. : ts.robert_filter*(1-ts.williams_filter)/2
    native_raw!(c.oldM,c.currentM,tendency.M,span,w1,w2,startup)
    native_raw!(c.oldQ,c.currentQ,tendency.Q,span,w1,w2,startup)
    nothing
end
function carrier_stock(c,w,ds,g;old=false)
    M=old ? c.oldM : c.currentM;Q=old ? c.oldQ : c.currentQ
    (;airKgM2=dot(w,M)/g,waterMm=dot(w,Q*ds)/g,
        minM=minimum(M),minQ=minimum(Q),minq=minimum(Q./M),maxq=maximum(Q./M),
        negativeWaterMm=-dot(w,min.(Q,0)*ds)/g)
end

"""Independent copy-only tests of native scalar representation; never writes c/v.

Both untrimmed native transform and declared scalar truncation are reported.
Clipping is only evaluated on copies, with its full water addition recorded.
"""
function projection_diagnostics(c,v,m,w;truncate=false)
    ds=m.geometry.σ_levels_thick;g=m.planet.gravity;S=m.spectral_transform
    q=c.currentQ./c.currentM
    qgrid=similar(SW.get_step(v.grid.humidity,2));qgrid.data .= q
    qspec=similar(SW.get_step(v.prognostic.humidity,2));SW.transform!(qspec,qgrid,S)
    aux=qspec.spectrum.l_indices.==maximum(qspec.spectrum.l_indices)
    maxQAuxiliary=maximum(abs,qspec.data[aux,:])
    truncate && SW.SpeedyTransforms.spectral_truncation!(qspec)
    qback=similar(qgrid);SW.transform!(qback,qspec,S)
    lp=similar(SW.get_step(v.grid.pressure,2));lp.data .= log.(c.currentM)
    pspec=similar(SW.get_step(v.prognostic.pressure,2));SW.transform!(pspec,lp,S)
    truncate && SW.SpeedyTransforms.spectral_truncation!(pspec)
    lpback=similar(lp);SW.transform!(lpback,pspec,S);Mback=exp.(vec(lpback.data))
    qwater=dot(w,c.currentM.*(qback.data*ds))/g
    clipped=dot(w,c.currentM.*(max.(qback.data,0)*ds))/g
    water=dot(w,c.currentQ*ds)/g
    location=Tuple(argmax(abs.(qback.data.-q)))
    (;truncate,maxQAuxiliary,maxLocalQProjectionError=maximum(abs,qback.data.-q),
        maxLocalQProjectionLocation=location,projectedMinq=minimum(qback),
        waterProjectionErrorMm=qwater-water,clipWaterAdditionMm=clipped-qwater,
        airLogProjectionErrorKgM2=dot(w,Mback-c.currentM)/g,
        maxLocalLogPressureRoundtripPa=maximum(abs,Mback-c.currentM),
        combinedPressureAndHumidityProjectionErrorMm=dot(w,Mback.*(qback.data*ds))/g-water)
end
end
