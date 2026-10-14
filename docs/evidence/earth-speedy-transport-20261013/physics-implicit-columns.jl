# Additional local dry-column stability scan; no model integration or source edits.
ENV["STABILITY_OUTPUT"]=normpath(joinpath(@__DIR__,"../../../build/earth-speedy-transport/physics-implicit-columns-base.json"))
include("physics-implicit-stability.jl")
degrees=[8,12,16,18,20,24,28,32]
rows=[];started=time()
for ij in axes(Tgrid,1)
    T=vec(Tgrid[ij,:]);zs=[amplification(T,l;fixed=true,diffuse=true) for l in degrees]
    idx=argmax(getproperty.(zs,:rho));z=zs[idx]
    push!(rows,(;ij,lat=m.geometry.latds[ij],lon=m.geometry.londs[ij],l=degrees[idx],
        z.rho,z.physicalGrowthPerDay,z.eFoldDays,z.eigenReal,z.eigenImag))
end
ranked=sort(rows;by=x->x.rho,rev=true)
top=[merge(r,(;T=vec(Tgrid[r.ij,:]))) for r in ranked[1:20]]
regions=[(;name=String(r.name),numericallyUnstableFraction=sum(Float64.(r.weights).*
    [x.rho>1+1e-8 && x.physicalGrowthPerDay<1e-8 for x in rows])) for r in weights.regions]

function alternate(T,l,reference,stepS)
    tau=2stepS/radius
    Lref=background_advection_matrix(reference,half,ds)+m.atmosphere.κ*Diagonal(reference)*Jadia
    Ar=operator(Lref,-m.atmosphere.R_dry*reference,l)
    Aa=operator(Lactual(T;fixed=true),-m.atmosphere.R_dry*T,l)
    Q=inv(E-tau*Ar)
    ex=[diff.expl_div[l,:];diff.expl[l,:];0.]
    im=1 ./(1 .-tau.*ex)
    B=E+tau*Diagonal(im)*(Q*Ar+Diagonal(ex));C=tau*Diagonal(im)*Q*(Aa-Ar)
    w1=ts.robert_filter*ts.williams_filter/2;w2=ts.robert_filter*(1-ts.williams_filter)/2
    G=[w1*(E+B) E+w1*(C-2E);B-w2*(E+B) C-w2*(C-2E)]
    ev=eigvals(G);z=ev[argmax(abs.(ev))];rho=abs(z)
    (;rho,eigenReal=real(z),eigenImag=imag(z),eFoldDays=log(rho)>1e-12 ? stepS/86400/log(rho) : nothing)
end
@testset "alternate-state map reduces exactly to current reference case" begin
 for l in degrees
    expected=amplification(profiles[2].T,l;fixed=true,diffuse=true)
    a=alternate(profiles[2].T,l,old.temp_profile,ts.Δt)
    @test a.rho≈expected.rho atol=1e-12
    @test diff.impl[l,:]≈1 ./(1 .-tau.*diff.expl[l,:]) atol=1e-15
 end
end
selected=[profiles;[(;name="native column $(r.ij)",T=r.T) for r in top]]
comparisons=[]
for ref in ((;name="original",T=collect(old.temp_profile)),(;name="isothermal280",T=fill(280.,8)),
    (;name="isothermal300",T=fill(300.,8)),(;name="isothermal320",T=fill(320.,8))),stepS in (1800.,900.,450.)
    records=[]
    for p in selected
        zs=[alternate(p.T,l,ref.T,stepS) for l in 2:32];idx=argmax(getproperty.(zs,:rho));z=zs[idx]
        push!(records,(;name=p.name,l=idx+1,z...))
    end
    push!(comparisons,(;reference=ref.name,profile=ref.T,stepS,worst=records[argmax(getproperty.(records,:rho))],records))
end
record=(;source=SOURCE,sourceSHA=bytes2hex(sha256(read(SOURCE))),scriptSHA=bytes2hex(sha256(read(@__FILE__))),
    coreScriptSHA=bytes2hex(sha256(read(joinpath(@__DIR__,"physics-implicit-stability.jl")))),
    interpretation="3168 actual instantaneous columns treated as separate flat dry resting profiles. Original-reference scan at 8 degrees with RAW and native hyperdiffusion; alternate reference/time-step comparisons at all degrees2:32 on regional means and top20 columns. Shorter step recomputes implicit diffusion coefficients from unchanged damping frequencies. No rainfall-based selection; no nonlinear run or frozen-source modification.",
    elapsedS=time()-started,degrees,rows,top,regions,comparisons)
path=joinpath(ROOT,"build/earth-speedy-transport/physics-implicit-columns.json")
open(io->JSON3.write(io,record),path,"w")
println(JSON3.write((;elapsedS=record.elapsedS,top=top[1:3],regions,
    comparisons=[(;reference=r.reference,stepS=r.stepS,worst=r.worst) for r in comparisons])))
