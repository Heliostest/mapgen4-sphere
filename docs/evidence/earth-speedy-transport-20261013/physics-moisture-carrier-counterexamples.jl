# Independent scheme review. No model advance, method override, or frozen-file writes.
# Actual native Leapfrog/RAW kernel is exercised below; idealized examples are not
# measurements of the coupled model's three-day water residual.
using SpeedyWeather, Test, JSON3, SHA, Dates
const SW=SpeedyWeather
const ROOT=normpath(joinpath(@__DIR__,"../../.."))
const W1=.1*.53/2
const W2=.1*(1-.53)/2
const RECORDS=Dict{String,Any}()
function raw(old,current,tendency;span=3600.,startup=false)
    a=Float64.(old);b=Float64.(current);f=Float64.(tendency)
    reference=startup ? a : b
    SW.launch!(SW.CPU(),SW.LinearWorkOrder,size(f),SW.leapfrog_kernel!,
        a,b,reference,f,span,startup ? 0. : W1,startup ? 0. : W2)
    return a,b
end

@testset "common mass and carrier preserve constant mixing ratio" begin
    c=.017
    M0=[100000.,99000.,98000.];M1=[100500.,99100.,97400.]
    dM=[.1,-.03,-.07]
    a,b=raw(M0,M1,dM);qa,qb=raw(c.*M0,c.*M1,c.*dM)
    @test minimum(a)>0 && minimum(b)>0
    @test maximum(abs.(qa.-c.*a))<1e-12
    @test maximum(abs.(qb.-c.*b))<1e-12
    @test sum(b)≈sum(M0) atol=1e-10
    # Equal global stocks in both retained states make a zero-sum flux preserve
    # the global stock despite local RAW changes. Source quadrature is separate.
    native_pressure=b.*[1.01,.99,1.]
    overwritten_q=qb./native_pressure
    @test maximum(abs.(overwritten_q.-c))>1e-4
    RECORDS["constantTracer"]=Dict("commonMassMaxError"=>maximum(abs.(qb./b.-c)),
        "differentPressureMaxError"=>maximum(abs.(overwritten_q.-c)))
end

@testset "independent native log pressure and humidity RAW do not preserve their product" begin
    oldP=100000.;currentP=90000.;Q=1000.
    aP,bP=raw([log(oldP)],[log(currentP)],[0.])
    aq,bq=raw([Q/oldP],[Q/currentP],[0.])
    aQ,bQ=raw([Q],[Q],[0.])
    reconstructed=exp(bP[1])*bq[1]
    @test bQ[1]==Q
    @test abs(reconstructed-Q)>.1
    @test abs(exp(aP[1])*aq[1]-Q)>.1
    RECORDS["productFilter"]=Dict("waterBeforePa"=>Q,"waterAfterIndependentRAWPa"=>reconstructed,
        "waterAfterCarrierRAWPa"=>bQ[1],"equivalentLayerMmAtGravity9p81"=>(reconstructed-Q)/9.81)
end

@testset "centered transport and RAW are not positivity preserving" begin
    # Three periodic cells, uniform M, centered q-face flux. In units with M=1,
    # a*span/dx=.2 and q=(0,1,0), the local flux derivative creates a negative.
    Q=[0.,1.,0.];f=[-.1,0.,.1]./3600
    a,b=raw(Q,Q,f)
    @test abs(sum(b)-sum(Q))<1e-14
    @test minimum(b)<-.09
    # RAW alone can create a negative even when old/current/unfiltered-new >= 0.
    a2,b2=raw([1.],[0.],[-1/3600])
    @test b2[1]≈-W2 atol=1e-15
    # Apply the real default native hole-filling implementation to a copied field.
    sg=SW.SpectralGrid(NF=Float64,truncation=8,nlayers=1)
    model=SW.PrimitiveWetModel(sg;feedback=nothing)
    vars=SW.Variables(model);grid=SW.get_step(vars.grid.humidity,2)
    fill!(grid,-1e-6)
    qBefore=copy(grid.data)
    SW.hole_filling!(grid,SW.ClipNegatives())
    @test all(iszero,grid.data)
    waterCreated=100000/9.81*sum(grid.data.-qBefore)/length(qBefore)
    @test waterCreated≈100000e-6/9.81 atol=1e-15
    RECORDS["positivity"]=Dict("centeredMinAfterNativeRAW"=>minimum(b),
        "centeredConservedSum"=>sum(b),"nativeRAWOnlyNegative"=>b2[1],
        "nativeClipUniformMinusOnePpmWaterCreatedMm"=>waterCreated)
end

@testset "mass source convention and mass-weighted diffusion are additional choices" begin
    M=100000.;q=.02;s=1.;dt=1800.
    native_q=q+dt*s/M
    exact_source_q=(M*q+dt*s)/(M+dt*s)
    keep_native_q_water=(M+dt*s)*native_q
    @test exact_source_q<native_q
    @test keep_native_q_water-(M*q+dt*s)>0
    # Illustrative conservative-in-q diffusion across equal-area cells is not
    # conservative in pressure-weighted water when M differs between the cells.
    mass=[100000.,80000.];dq=[-1e-6,1e-6]
    @test sum(dq)==0
    weightedSource=sum(mass.*dq)/2/9.81
    @test weightedSource != 0
    RECORDS["sourceConventions"]=Dict("nativeFixedMassQ"=>native_q,
        "specificHumidityWithExactWaterAndTotalMassSource"=>exact_source_q,
        "waterExcessIfPreservingNativeQPa"=>keep_native_q_water-(M*q+dt*s),
        "illustrativeQDiffusionWaterSourceKgM2S"=>weightedSource)
end

nativeRoot=joinpath(ROOT,"build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src")
bindings=Dict(relpath(p,ROOT)=>bytes2hex(sha256(read(p))) for p in [@__FILE__,
    joinpath(nativeRoot,"time_stepping/steppers/leapfrog.jl"),
    joinpath(nativeRoot,"dynamics/hole_filling.jl")])
result=(;scope="Independent idealized counterexamples with actual native RAW and clip; no coupled simulation",
    passed=true,records=RECORDS,sourceSHA=bindings)
out=joinpath(ROOT,"build/earth-speedy-transport/physics-moisture-carrier-counterexamples.json")
isfile(out) && error("Refusing to overwrite existing review output")
open(io->JSON3.write(io,result),out,"w")
println(JSON3.write(result))
