# Diagnostic only: no integration, package overrides or model source edits.
ENV["STABILITY_OUTPUT"]=normpath(joinpath(@__DIR__,"../../../build/earth-speedy-transport/physics-implicit-candidates-base.json"))
include("physics-implicit-stability.jl")
function candidate(T,l,reference,stepS)
    span=2stepS/radius
    Lref=background_advection_matrix(reference,half,ds)+m.atmosphere.κ*Diagonal(reference)*Jadia
    Ar=operator(Lref,-m.atmosphere.R_dry*reference,l)
    Aa=operator(Lactual(T;fixed=true),-m.atmosphere.R_dry*T,l)
    Q=inv(E-span*Ar)
    ex=[diff.expl_div[l,:];diff.expl[l,:];0.];im=1 ./(1 .-span.*ex)
    B=E+span*Diagonal(im)*(Q*Ar+Diagonal(ex));C=span*Diagonal(im)*Q*(Aa-Ar)
    w1=ts.robert_filter*ts.williams_filter/2;w2=ts.robert_filter*(1-ts.williams_filter)/2
    G=[w1*(E+B) E+w1*(C-2E);B-w2*(E+B) C-w2*(C-2E)]
    ev=eigvals(G);z=ev[argmax(abs.(ev))]
    neg=[abs(e) for e in ev if real(e)<0]
    physicalGrowthPerDay=max(0.,maximum(real,eigvals(Aa)))/radius*86400
    (;l,rho=abs(z),eigenReal=real(z),eigenImag=imag(z),negativeRho=maximum(neg;init=0.),physicalGrowthPerDay)
end
settings=[(;name="original1800",reference=collect(old.temp_profile),stepS=1800.),
    (;name="original900",reference=collect(old.temp_profile),stepS=900.),
    (;name="original450",reference=collect(old.temp_profile),stepS=450.),
    (;name="isothermal280",reference=fill(280.,8),stepS=1800.),
    (;name="isothermal288",reference=fill(m.atmosphere.reference_temperature,8),stepS=1800.),
    (;name="isothermal300",reference=fill(300.,8),stepS=1800.)]
started=time();initial=[];degrees=[8,12,16,18,20,24,28,32]
for s in settings
    rows=[]
    for ij in axes(Tgrid,1)
        zz=[candidate(vec(Tgrid[ij,:]),l,s.reference,s.stepS) for l in degrees]
        z=zz[argmax(getproperty.(zz,:rho))]
        negative=max(getproperty.(zz,:negativeRho)...)
        push!(rows,(;ij,lat=m.geometry.latds[ij],lon=m.geometry.londs[ij],z...,negativeRhoAll=negative))
    end
    neutral=filter(r->r.physicalGrowthPerDay<1e-8,rows)
    push!(initial,(;setting=s.name,total=length(rows),neutralCount=length(neutral),
        numericallyUnstableCount=count(r->r.rho>1+1e-8,neutral),
        computationallyUnstableCount=count(r->r.negativeRhoAll>1+1e-8,rows),
        worstNeutral=neutral[argmax(getproperty.(neutral,:rho))],worst=rows[argmax(getproperty.(rows,:rho))],rows))
end
actual=[];bindings=[]
for label in ("thermal","all")
    path=joinpath(ROOT,"build/earth-speedy-transport/implicit-instability-$label-v2.json")
    data=JSON3.read(read(path,String));push!(bindings,(;path,sha=bytes2hex(sha256(read(path)))))
    records=[]
    for (i,r) in enumerate(data.records)
        # Entire last 48h including the positive state before the first negative update.
        i<length(data.records)-96 && continue
        T=Float64.(r.atMinimumColumn.beforeT);minimum(T)>0 || continue
        outputs=[]
        for s in settings
            zz=[candidate(T,l,s.reference,s.stepS) for l in 2:32]
            z=zz[argmax(getproperty.(zz,:rho))]
            push!(outputs,(;setting=s.name,z...,negativeRhoAll=maximum(getproperty.(zz,:negativeRho))))
        end
        push!(records,(;time=String(r.time),beforeT=T,ij=r.ij,lat=r.lat,lon=r.lon,
            maxVerticalCourant=r.maxVerticalCourant,minAfterT=r.minTemperatureK,outputs))
    end
    push!(actual,(;label,records))
end
record=(;scriptSHA=bytes2hex(sha256(read(@__FILE__))),coreScriptSHA=bytes2hex(sha256(read(joinpath(@__DIR__,"physics-implicit-stability.jl")))),
    initialSourceSHA=bytes2hex(sha256(read(SOURCE))),bindings,elapsedS=time()-started,settings,initial,actual,
    scope="Flat dry resting-column linearizations of real instantaneous profiles, RAW plus installed hyperdiffusion. All3168initial columns at8degrees; saved minimum-temperature columns over last48hours at all31degrees. Location can change per record. Positive state before update used, not post-failure column. Separate continuous physical growth from computational negative-eigenvalue instability. This is not a nonlinear stability proof or a model fix.")
open(io->JSON3.write(io,record),joinpath(ROOT,"build/earth-speedy-transport/physics-implicit-candidates.json"),"w")
println(JSON3.write((;elapsedS=record.elapsedS,initial=[(;setting=r.setting,total=r.total,neutralCount=r.neutralCount,numericallyUnstableCount=r.numericallyUnstableCount,computationallyUnstableCount=r.computationallyUnstableCount,worstNeutral=r.worstNeutral) for r in initial])))
