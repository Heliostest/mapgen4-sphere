# Read-only local linear stability diagnostic. No model time integration or overrides.
using LinearAlgebra, JSON3, Test
include("transport-v2-model.jl")
BLAS.set_num_threads(1)
const ROOT=normpath(joinpath(@__DIR__,"../../.."))
const SOURCE=get(ENV,"STABILITY_CHECKPOINT",joinpath(ROOT,"build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics-start.jld2"))
const OUT=get(ENV,"STABILITY_OUTPUT",joinpath(ROOT,"build/earth-speedy-transport/physics-implicit-stability.json"))
saved=JLD2.load(SOURCE);v=saved["containers"];old=saved["components"]["implicit"]
old=hasproperty(old,:inner) ? old.inner : old
sg=SW.SpectralGrid(NF=Float64,truncation=32,nlayers=8)
m=transport_model(sg,"seasonal")
SW.initialize!(m.geopotential,m);SW.initialize!(m.adiabatic_conversion,m)
c=ConsistentImplicitPrimitiveEquation(sg)
radius=v["prognostic"].scale[];ts=saved["components"]["time_stepping"];tau=2ts.Δt/radius
SW.initialize!(c,tau,old.temp_profile,m.geometry,m.geopotential,m.atmosphere,m.adiabatic_conversion)
diff=saved["components"]["horizontal_diffusion"]
n=8;N=17;E=Matrix{Float64}(I,N,N);ds=m.geometry.σ_levels_thick;half=m.geometry.σ_levels_half
SumAbove=[r<k ? ds[r] : 0. for k in 1:n,r in 1:n]
Jadia=Diagonal(m.adiabatic_conversion.σ_lnp_A)*SumAbove+Diagonal(m.adiabatic_conversion.σ_lnp_B)
Vref=background_advection_matrix(old.temp_profile,half,ds)
Lactual(T;fixed=true)=background_advection_matrix(T,half,ds)-(fixed ? zeros(n,n) : Vref)+m.atmosphere.κ*Diagonal(T)*Jadia
function operator(L,U,l)
    A=zeros(N,N);lambda=-l*(l-1)
    A[1:n,n+1:2n]=lambda*c.R;A[1:n,end]=lambda*U
    A[n+1:2n,1:n]=L;A[end,1:n]=c.W
    return A
end
function amplification(T,l;fixed=true,diffuse=true)
    ref=fixed ? c : old
    Aref=operator(ref.L,ref.U,l)
    Aact=operator(Lactual(T;fixed),-m.atmosphere.R_dry*T,l)
    Q=inv(E-ref.centering*tau*Aref)
    Kold=Q*Aref;Kcur=Q*(Aact-Aref)
    if diffuse
        ex=[diff.expl_div[l,:];diff.expl[l,:];0.]
        im=[diff.impl_div[l,:];diff.impl[l,:];1.]
        Kold=Diagonal(im)*(Kold+Diagonal(ex));Kcur=Diagonal(im)*Kcur
    end
    B=E+tau*Kold;C=tau*Kcur
    w1=ts.robert_filter*ts.williams_filter/2
    w2=ts.robert_filter*(1-ts.williams_filter)/2
    G=[w1*(E+B) E+w1*(C-2E); B-w2*(E+B) C-w2*(C-2E)]
    ev=eigvals(G);idx=argmax(abs.(ev));rho=abs(ev[idx])
    physical=max(0.,maximum(real,eigvals(Aact)))/radius*86400
    (;rho,amplificationPerDay=exp(log(rho)*86400/ts.Δt),physicalGrowthPerDay=physical,
        eFoldDays=log(rho)>1e-12 ? ts.Δt/86400/log(rho) : nothing,
        eigenReal=real(ev[idx]),eigenImag=imag(ev[idx]),G,Aref,Aact)
end

# Confirm the derived 2N amplification map against installed correction and RAW kernels.
@testset "derived mismatched-profile RAW map matches installed kernels" begin
  T=Array(v["dynamics"].average_temperature_profile);l=16
  for fixed in (false,true),diffuse in (false,true)
    ref=fixed ? c : old;z=amplification(T,l;fixed,diffuse)
    xo=collect(range(-.2,.5,length=N));xc=collect(range(.3,-.4,length=N))
    raw=z.Aref*xo+(z.Aact-z.Aref)*xc
    raw[n+1:2n]+=ref.L*(xc[1:n]-xo[1:n]) # kernel adds the opposite old/current move
    tt=reshape(copy(raw[n+1:2n]),1,n,1);pp=reshape([raw[end]],1,1);dd=reshape(copy(raw[1:n]),1,n,1)
    div=reshape([xo[1:n];xc[1:n]],1,n,2)
    SW.launch!(SW.CPU(),SW.LinearWorkOrder,(1,),SW.implicit_primitive_leapfrog_kernel!,
      tt,pp,dd,div,1,1,1,ref.S⁻¹,ref.R,ref.U,ref.L,ref.W,[l],ref.centering*tau,Val(n))
    tendency=[vec(dd);vec(tt);pp[1]]
    if diffuse;tendency=(tendency+[diff.expl_div[l,:];diff.expl[l,:];0.].*xo).*[diff.impl_div[l,:];diff.impl[l,:];1.];end
    actualold=copy(xo);actualcurrent=copy(xc)
    SW.launch!(SW.CPU(),SW.LinearWorkOrder,(N,),SW.leapfrog_kernel!,actualold,actualcurrent,actualcurrent,
      tendency,tau,ts.robert_filter*ts.williams_filter/2,ts.robert_filter*(1-ts.williams_filter)/2)
    @test [actualold;actualcurrent]≈z.G*[xo;xc] atol=1e-10 rtol=1e-12
  end
end

reference=[]
for (label,ref) in (("native",old),("corrected",c))
 B=ref.R*ref.L+ref.U*ref.W'
 vals=eigvals(B)
 push!(reference,(;label,profile=collect(ref.temp_profile),B_eigenReal=real.(vals),B_eigenImag=imag.(vals),
    degrees=[(;l,condition=cond(E[1:n,1:n]-ref.centering^2*tau^2*(-l*(l-1))*B),
       minRealEigen=minimum(real,eigvals(E[1:n,1:n]-ref.centering^2*tau^2*(-l*(l-1))*B))) for l in 2:32]))
end
Tgrid=Array(SW.get_step(v["grid"].temperature,2))
weights=JSON3.read(read(joinpath(ROOT,"build/earth-speedy-transport/diagnostic-weights.json"),String))
profiles=[(;name="frozen reference",T=collect(old.temp_profile)),(;name="actual global mean",T=collect(v["dynamics"].average_temperature_profile))]
for r in weights.regions
 push!(profiles,(;name=String(r.name),T=vec(Float64.(r.weights)'*Tgrid)))
end
results=[]
for p in profiles,fixed in (false,true),diffuse in (false,true)
 rows=[]
 for l in 2:32
    z=amplification(p.T,l;fixed,diffuse)
    push!(rows,(;l,z.rho,z.amplificationPerDay,z.physicalGrowthPerDay,z.eFoldDays,z.eigenReal,z.eigenImag))
 end
 push!(results,(;name=p.name,T=p.T,fixed,diffuse,worst=rows[argmax(getproperty.(rows,:rho))],degrees=rows))
end
record=(;source=SOURCE,sourceSHA=bytes2hex(sha256(read(SOURCE))),scriptSHA=bytes2hex(sha256(read(@__FILE__))),
 implementationSHA=bytes2hex(sha256(read(joinpath(@__DIR__,"implicit-corrected.jl")))),
 clock=string(v["prognostic"].clock.time),physicalStepS=ts.Δt,implicitSpanS=2ts.Δt,radius,
 robertFilter=ts.robert_filter,williamsFilter=ts.williams_filter,
 scope="Dry flat resting column linearization; actual T varies vertically. Includes exact native old/current semi-implicit and RAW update; optional stored native hyperdiffusion. No Coriolis, horizontal advection, terrain, moisture, physics or nonlinear time evolution. A local numerical counterexample is not a diagnosed nonlinear crash cause.",reference,results)
open(io->JSON3.write(io,record),OUT,"w")
println(JSON3.write((;reference,results=[(;name=r.name,fixed=r.fixed,diffuse=r.diffuse,worst=r.worst) for r in results])))
