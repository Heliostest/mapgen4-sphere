include("common.jl")
include("vector-core.jl")
include("dense-reference.jl")
using .VectorInvariant
function main()
    rows=[];Random.seed!(9031)
    for ds in ([1.],[.3,.7],[.1,.25,.65]),amp in (.01,.15,1.)
        c,lat,lon=small_core(;ds=ds);pw=PressureWorkCore(c)
        omega=[.03,-.04,.07];m=VectorCore(pw,lat,lon,omega)
        p=c.pref.*exp.(.17sin.(collect(1:length(c.pref))));v=amp*randn(length(c.prefFace),length(ds))
        got=neutral_tendency(m,p,v);want=oracle(c,lat,lon,omega,p,v)
        H=(pw.h.*(pw.S*p/2))*transpose(ds);work(z)=sum(H.*v.*z)
        for key in (:total,:rotation,:vorticity,:layerGradient,:vertical,:curl,:verticalFlux)
            a=getproperty(got,key);b=getproperty(want,key)
            @test norm(a-b)<=3e-13*max(norm(b),norm(v))
        end
        @test abs(work(got.rotation))<1e-13*sum(H.*v.^2)
        @test abs(work(got.vorticity))<1e-13*max(sum(H.*abs.(v).^3),sum(H.*v.^2))
        @test abs(work(got.layerGradient)+work(got.vertical))<2e-13*max(sum(H.*abs.(v).^3),sum(H.*v.^2))
        if length(ds)>1
            @test norm(got.vertical)>1e-8*amp^2
            @test abs(work(got.layerGradient))>1e-8*amp^3
            @test work(got.layerGradient)*work(got.vertical)<0
        end
        @test maximum(abs,got.verticalFlux[:,end])<1e-13*max(amp,1.)
        push!(rows,(layers=length(ds),amplitude=amp,error=norm(got.total-want.total),layerWork=work(got.layerGradient),verticalWork=work(got.vertical),totalWork=work(got.total)))
    end
    write_result((passed=true,rows=rows))
end
@testset "C9 vector-invariant and vertical work oracle" begin;main();end
