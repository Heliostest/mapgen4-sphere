include("common.jl")
include("wave-core.jl")
@testset "C11 wave diagnostic" begin
    # Two equal cells, one unit edge: eigenvalue2, exactly soluble oscillator.
    c=TransportCore(Geometry([1.,1.],[1],[2],[1.],[1.],1.),ones(2),[1.];c2=1.)
    r=[1.,-1.];v=[0.];dt=.2
    r1,v1=wave_step(c,r,v,dt)
    @test r1≈[49/51,-49/51] rtol=1e-14
    @test v1≈[20/51] rtol=1e-14
    @test r==[1.,-1.]&&v==[0.]
    @test wave_step(c,r1,v1,-dt)[1]≈r rtol=1e-14
    @test maximum(abs,wave_step(c,r1,v1,-dt)[2]-v)<1e-14
    stationary=wave_step(c,ones(2),v,dt)
    @test norm(stationary[1]-ones(2))+norm(stationary[2])<1e-14
    for bad in (0.,NaN,Inf);@test_throws ArgumentError wave_step(c,r,v,bad);end
    for (rr,vv) in (([1.],v),(r,[0.,0.]),([NaN,1.],v),(r,[Inf]),(reshape(r,2,1),v))
        @test_throws ArgumentError wave_step(c,rr,vv,dt)
    end
    z,w=copy(r),copy(v);e0=wave_energy(c,z,w)
    for _ in 1:100;z,w=wave_step(c,z,w,dt);end
    theta=200atan(sqrt(2)*dt/2)
    @test norm(z-r*cos(theta))<2e-13
    @test abs(w[1]-sqrt(2)*sin(theta))<2e-13
    @test abs(wave_energy(c,z,w)/e0-1)<1e-13
    errors=[]
    pw=PressureWorkCore(c)
    for amplitude in (1e-3,1e-4)
        got=pressure_step(pw,c.pref.*(1 .+amplitude*r),reshape(amplitude*v,:,1),dt)
        push!(errors,norm((got.p-c.pref)./amplitude-r1)+norm(vec(got.v)/amplitude-v1))
    end
    @test errors[2]<errors[1]/5
end
write_result((passed=true,stage="oscillator and nonlinear limit"))
