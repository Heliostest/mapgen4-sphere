# Read-only verification of both saved carrier RAW memories, using explicit sums.
include("wet-carrier-prototype.jl")
using .NativeWetCarrier
using SpeedyWeather, JLD2, JSON3, SHA, Test, LinearAlgebra
BLAS.set_num_threads(1)
function main()
    input="build/earth-speedy-transport/wet-carrier-prototype-fields.jld2"
    d=JLD2.load(input);r=JSON3.read(read("build/earth-speedy-transport/wet-carrier-prototype-test.json",String))
    w=d["weights"];ds=d["thickness"];g=SpeedyWeather.DEFAULT_GRAVITY
    rows=Any[]
    @testset "independent saved two-memory carrier inventory" begin
        @test length(w)==3168
        @test length(ds)==8
        @test abs(sum(w)-1)<1e-14
        @test abs(sum(ds)-1)<1e-14
        for (name,c) in pairs(d["states"]), level in (:old,:current)
            M=getproperty(c,Symbol(level,:M));Q=getproperty(c,Symbol(level,:Q))
            air=sum(w[i]*M[i] for i in eachindex(w))/g
            water=sum(w[i]*ds[k]*Q[i,k] for k in eachindex(ds),i in eachindex(w))/g
            negative=-sum(w[i]*ds[k]*min(Q[i,k],0) for k in eachindex(ds),i in eachindex(w))/g
            initial=r.initial[string(name)]
            @test abs(air-initial.airKgM2)<1e-9
            @test abs(water-initial.waterMm)<1e-10
            @test all(isfinite,M) && all(isfinite,Q)
            @test minimum(M)>0
            name==:uniform && @test maximum(abs,Q./M.-.012)<1e-14
            push!(rows,(;name,level,airKgM2=air,waterMm=water,minM=minimum(M),minQ=minimum(Q),
                minq=minimum(Q./M),negativeWaterMm=negative,minLocation=Tuple(argmin(Q))))
        end
        real=d["states"].real
        @test abs(sum(w.*d["nativePressure"])/g-last(r.rows).native.totalKgM2)<1e-9
        bridge=maximum(abs,d["states"].uniform.currentQ./d["nativePressure"].-.012)
        @test bridge==last(r.rows).usingNativePressureConstantQError
        # These are expected counterexamples; no assertion presents them as passing positivity.
        @test minimum(d["states"].sharp.currentQ)<0
        @test bridge>1e-12
    end
    result=(;scope="Independent explicit-sum stock checks for both saved RAW memories; positivity remains an acceptance failure.",
        input,inputSHA=bytes2hex(sha256(read(input))),scriptSHA=bytes2hex(sha256(read(@__FILE__))),rows)
    open(io->JSON3.write(io,result),"build/earth-speedy-transport/wet-carrier-fields-verification.json","w")
    println(JSON3.write(result))
end
main()
