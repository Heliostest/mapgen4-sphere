# Measure the complete update matrix through real wrapper/diffusion/RAW kernels.
ENV["STABILITY_OUTPUT"]=normpath(joinpath(@__DIR__,"../../../build/earth-speedy-transport/physics-split-amplification-base-v2.json"))
include("physics-implicit-stability.jl")
include("implicit-split-reference-v2.jl")
split=SplitReferenceImplicit(sg)
md=SW.PrimitiveDryModel(sg;implicit=split,horizontal_diffusion=diff,time_stepping=ts,feedback=nothing)
SW.initialize!(md.geopotential,md);SW.initialize!(md.adiabatic_conversion,md)
vars=SW.Variables(md);vars.prognostic.scale[]=radius;vars.prognostic.clock.step_counter=2
SW.initialize!(split,tau,old.temp_profile,md.geometry,md.geopotential,md.atmosphere,md.adiabatic_conversion)
path=joinpath(ROOT,"build/earth-speedy-transport/implicit-instability-thermal-window.json")
window=JSON3.read(read(path,String));col=only(filter(x->x.ij==412,window.rows[1].columns));T=Float64.(col.T)
l=21;p=split.inner;Aa=operator(Lactual(T;fixed=true),-md.atmosphere.R_dry*T,l)
Ar=operator(p.L,p.U,l);Adyn=operator(c.L,c.U,l)
Q=inv(E-tau*Ar);ex=[diff.expl_div[l,:];diff.expl[l,:];0.];im=[diff.impl_div[l,:];diff.impl[l,:];1.]
B=E+tau*Diagonal(im)*(Q*Ar+Diagonal(ex));C=tau*Diagonal(im)*Q*(Aa-Ar)
w1=ts.robert_filter*ts.williams_filter/2;w2=ts.robert_filter*(1-ts.williams_filter)/2
G=[w1*(E+B) E+w1*(C-2E);B-w2*(E+B) C-w2*(C-2E)]
observed=zeros(2N,2N);lm=findfirst(==(l),SW.get_step(vars.prognostic.divergence).spectrum.l_indices)
@testset "split v2 measured SI + HyperDiffusion + RAW amplification" begin
 for j in 1:2N
    state=zeros(2N);state[j]=1;xo=state[1:N];xc=state[N+1:2N]
    raw=Aa*xc+Adyn*(xo-xc);raw[n+1:2n].-=c.L*(xo[1:n]-xc[1:n])
    for a in (vars.prognostic.temperature,vars.prognostic.divergence,vars.prognostic.pressure,
        vars.prognostic.vorticity,vars.tendencies.temperature,vars.tendencies.divergence,
        vars.tendencies.pressure,vars.tendencies.vorticity);fill!(a,0);end
    fill!(vars.dynamics.w,0)
    for (step,x) in ((1,xo),(2,xc))
        SW.get_step(vars.prognostic.divergence,step).data[lm,:].=x[1:n]
        SW.get_step(vars.prognostic.temperature,step).data[lm,:].=x[n+1:2n]
        SW.get_step(vars.prognostic.pressure,step).data[lm]=x[end]
    end
    SW.get_step(vars.tendencies.divergence).data[lm,:].=raw[1:n]
    SW.get_step(vars.tendencies.temperature).data[lm,:].=raw[n+1:2n]
    SW.get_step(vars.tendencies.pressure).data[lm]=raw[end]
    SW.implicit_correction!(vars,split,ts,md)
    SW.horizontal_diffusion!(vars,md.horizontal_diffusion,md)
    tendency=[SW.get_step(vars.tendencies.divergence).data[lm,:];SW.get_step(vars.tendencies.temperature).data[lm,:];SW.get_step(vars.tendencies.pressure).data[lm]]
    @test maximum(abs,imag.(tendency))==0
    actualold=copy(xo);actualcurrent=copy(xc)
    SW.launch!(SW.CPU(),SW.LinearWorkOrder,(N,),SW.leapfrog_kernel!,actualold,actualcurrent,actualcurrent,real.(tendency),tau,w1,w2)
    observed[:,j]=[actualold;actualcurrent]
 end
 @test observed≈G rtol=3e-12 atol=2e-9
 @test maximum(abs,eigvals(observed))≈maximum(abs,eigvals(G)) atol=1e-10
end
record=(;source=path,sourceSHA=bytes2hex(sha256(read(path))),scriptSHA=bytes2hex(sha256(read(@__FILE__))),
 implementationSHA=bytes2hex(sha256(read(joinpath(@__DIR__,"implicit-split-reference-v2.jl")))),
 profile=T,l,maxAbsError=maximum(abs,observed-G),relativeError=maximum(abs,observed-G)/maximum(abs,G),
 analyticRho=maximum(abs,eigvals(G)),measuredRho=maximum(abs,eigvals(observed)),
 scope="34 basis perturbations through actual new SI wrapper, actual native horizontal_diffusion!, and actual native RAW kernel. Local dry flat resting linearization of real failure-column positive48h-before profile; no climate integration.")
open(io->JSON3.write(io,record),joinpath(ROOT,"build/earth-speedy-transport/physics-split-amplification-v2.json"),"w")
println(JSON3.write(record))
