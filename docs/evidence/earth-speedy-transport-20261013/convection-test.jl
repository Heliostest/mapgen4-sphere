using SpeedyWeather, Dates, Test, JSON3, LinearAlgebra
const SW = SpeedyWeather
BLAS.set_num_threads(1)
const IMPLEMENTATION = get(ENV, "CONVECTION_IMPLEMENTATION", "native")
IMPLEMENTATION == "fixed" && include("convection-corrected.jl")
const ATM = SW.EarthAtmosphere(Float64)
const SIG = collect(0.0625:0.125:0.9375)
const RH = 0.7
const PS = 100000.0

function hydrostatic_column(T, q, sigma=SIG)
    n = length(sigma)
    half = collect(range(0.,1.;length=n+1))
    phi = zeros(1,n)
    tv = SW.virtual_temperature(T[1,n],q[1,n],ATM)
    phi[1,n] = ATM.R_dry*tv*log(1/sigma[n])
    for k in (n-1):-1:1
        tvb=tv
        tv=SW.virtual_temperature(T[1,k],q[1,k],ATM)
        phi[1,k]=phi[1,k+1]+ATM.R_dry*(tvb*log(sigma[k+1]/half[k+1])+tv*log(half[k+1]/sigma[k]))
    end
    phi
end

if IMPLEMENTATION=="fixed"
@testset "Isolated ascent preserves water, dry potential temperature and latent heat" begin
    for NF in (Float32,Float64)
        a=SW.EarthAtmosphere(NF)
        atol=NF===Float32 ? 3e-4 : 3e-10
        for t0 in NF.((240,270,290,310)),p0 in NF.((40000,100000)),rh in NF.((0,.2,.6,1,1.2)),ratio in NF.((.99,.86,.6))
            q0=rh*SW.saturation_humidity(t0,p0,a)
            t1,q1=corrected_parcel_lift(t0,q0,p0,p0*ratio,a)
            @test isfinite(t1)&&isfinite(q1)
            @test t1>0
            @test -atol<=q1<=q0+atol*max(q0,NF(1e-3))
            @test q1<=SW.saturation_humidity(t1,p0*ratio,a)+atol*max(q0,NF(1e-3))
            tdry=t0*ratio^a.κ
            @test t1>=tdry-atol
            if q0<=SW.saturation_humidity(tdry,p0*ratio,a)
                @test t1≈tdry atol=atol
                @test q1==q0
            end
        end
        # Saturation adjustment at fixed pressure has no pressure work.
        t0=NF(290);p0=NF(90000);q0=NF(1.3)*SW.saturation_humidity(t0,p0,a)
        t1,q1=parcel_condensation_adjustment(t0,q0,p0,a,a.latent_heat_condensation/a.heat_capacity)
        @test q1<q0
        @test t1>t0
        @test abs(a.heat_capacity*(t1-t0)+a.latent_heat_condensation*(q1-q0)) < (NF===Float32 ? .4 : 1e-6)
        # An initially saturated short ascent: pressure-weighted latent heating.
        t0=NF(300);p0=NF(95000);p1=NF(90000)
        q0=SW.saturation_humidity(t0,p0,a)
        t1,q1=corrected_parcel_lift(t0,q0,p0,p1,a)
        r=(p1/p0)^a.κ
        heatResidual=a.heat_capacity*(t1-t0*r)+a.latent_heat_condensation*sqrt(r)*(q1-q0)
        @test abs(heatResidual)<(NF===Float32 ? .4 : 1e-6)
        @test q1<q0
        # Entrainment can make a previously saturated parcel unsaturated.
        # A sufficiently short subsequent lift must again be exactly dry.
        tm=NF(.5)*t1+NF(.5)*NF(290)
        qm=NF(.5)*q1+NF(.5)*NF(.001)
        nextp=p1*NF(.995)
        tdry=tm*(nextp/p1)^a.κ
        @test qm<SW.saturation_humidity(tdry,nextp,a)
        t2,q2=corrected_parcel_lift(tm,qm,p1,nextp,a)
        @test t2≈tdry atol=atol
        @test q2==qm
    end
end

@testset "Native Betts-Miller wrapper water and enthalpy budgets" begin
    sg=SW.SpectralGrid(NF=Float64,truncation=32,nlayers=8)
    scheme=ConservativeParcelConvection(sg)
    m=SW.PrimitiveWetModel(sg;convection=scheme,time_stepping=SW.Leapfrog(sg;Δt_at_T32=Minute(30)),feedback=nothing)
    sim=SW.initialize!(m);v=sim.variables
    @test scheme.inner.time_scale==Hour(4)
    @test scheme.inner.relative_humidity==.7
    @test scheme.inner.entrainment.surface_entrainment==.5
    @test SW.variables(scheme)==SW.variables(scheme.inner)
    flags=Set{String}()
    results=[]
    for (label,temps,rh) in (
        ("dry",[205.,215.,230.,242.,255.,267.,280.,300.],.1),
        ("moderate",[205.,215.,230.,242.,255.,267.,280.,300.],.6),
        ("wet",[205.,215.,230.,242.,255.,267.,280.,300.],1.),
        ("deep",[215.,232.,247.,262.,276.,286.,294.,300.],1.),
        ("stable",fill(290.,8),.6))
        T=SW.get_prognostic_step(v.grid.temperature,m.time_stepping,scheme)
        q=SW.get_prognostic_step(v.grid.humidity,m.time_stepping,scheme)
        for k in 1:8
            T[1,k]=temps[k]
            q[1,k]=rh*SW.saturation_humidity(temps[k],SIG[k]*PS,m.atmosphere)
        end
        v.parameterizations.surface_pressure[1]=PS
        phi=hydrostatic_column(reshape(temps,1,8),reshape(copy(q.data[1,:]),1,8))
        for k in 1:8;v.dynamics.geopotential[1,k]=phi[1,k];end
        tr,qr=zeros(1,8),zeros(1,8)
        lzb=corrected_pseudo_adiabat!(1,tr,qr,T,q,v.dynamics.geopotential,PS,SIG,m.atmosphere,RH,scheme.inner.entrainment)
        pq=sum((q.data[1,:].-vec(qr)).*.125)
        pt=sum((vec(tr).-T.data[1,:]).*.125)
        kind=pt<=0 ? "none" : pq>0 ? "deep" : "shallow"
        push!(flags,kind)
        SW.reset_tendencies!(v,m.time_stepping);SW.reset_variables!(v)
        SW.parameterization!(1,v,scheme,m)
        dq=SW.get_tendency_step(v.tendencies.grid.humidity,m.time_stepping,scheme).data[1,:]
        dt=SW.get_tendency_step(v.tendencies.grid.temperature,m.time_stepping,scheme).data[1,:]
        rain=v.parameterizations.rain_rate_convection[1]*m.atmosphere.water_density
        snow=v.parameterizations.snow_rate_convection[1]*m.atmosphere.water_density
        mass=PS*.125/m.planet.gravity
        water=mass*sum(dq)+rain+snow
        enthalpy=mass*sum(m.atmosphere.heat_capacity.*dt.+m.atmosphere.latent_heat_condensation.*dq)
        @test abs(water)<1e-12
        @test abs(enthalpy)<1e-8
        @test rain>=0&&snow==0
        @test kind=="deep" ? rain>0 : rain==0
        push!(results,(;label,kind,lzb,pq,pt,rainKgM2S=rain,waterResidualKgM2S=water,enthalpyResidualWm2=enthalpy))
        reference_dq=copy(dq);reference_dt=copy(dt);reference_rain=rain
        for timestep in (900.,1800.,3600.)
            # These isolated parameterization calls vary only the accumulation
            # interval; this is not a leapfrog integration stability test.
            m.time_stepping.Δt=timestep
            SW.reset_tendencies!(v,m.time_stepping);SW.reset_variables!(v)
            SW.parameterization!(1,v,scheme,m)
            dq2=SW.get_tendency_step(v.tendencies.grid.humidity,m.time_stepping,scheme).data[1,:]
            dt2=SW.get_tendency_step(v.tendencies.grid.temperature,m.time_stepping,scheme).data[1,:]
            rain2=v.parameterizations.rain_rate_convection[1]*m.atmosphere.water_density
            @test dq2==reference_dq
            @test dt2==reference_dt
            @test rain2≈reference_rain atol=1e-16
            @test abs(mass*sum(dq2)+rain2)<1e-12
        end
    end
    @test flags==Set(["deep","shallow","none"])
    println(JSON3.write((;implementation=IMPLEMENTATION,test="wrapper-column-budgets",results)))
end
end

function profile(T,q,e;ps=PS,sigma=SIG)
    tr,qr=similar(T),similar(q)
    phi=hydrostatic_column(T,q,sigma)
    f=IMPLEMENTATION=="fixed" ? corrected_pseudo_adiabat! : SW.pseudo_adiabat!
    lzb=f(1,tr,qr,T,q,phi,ps,sigma,ATM,RH,e)
    (;tr,qr,phi,lzb)
end

@testset "Parcel cannot gain water crossing LCL" begin
    T=reshape([210.,220.,235.,250.,262.,273.,280.,290.74],1,8)
    q=reshape([.8*SW.saturation_humidity(T[1,k],SIG[k]*PS,ATM) for k in 1:8],1,8)
    q[1,8]=.008619
    r=profile(T,q,SW.NoEntrainment())
    @test r.lzb<=7
    # At the first newly saturated level, q_ref/RH is the undiluted parcel q.
    @test r.qr[1,7]/RH <= q[1,8]+1e-13
    e=SW.LinearEntrainment(Float64)
    r=profile(T,q,e)
    @test r.lzb<=7
    epsilon=e(SIG[7])
    # Invert the actual temperature mixing to expose saturated pre-mixing q.
    t_lifted=(r.tr[1,7]-epsilon*T[1,7])/(1-epsilon)
    q_lifted=SW.saturation_humidity(t_lifted,SIG[7]*PS,ATM)
    q_mixed=(1-epsilon)*q_lifted+epsilon*q[1,7]
    @test q_mixed<=max(q[1,8],q[1,7])+1e-13
    println(JSON3.write((;implementation=IMPLEMENTATION,test="crossing-LCL",qInput=q[1,8],qLifted=q_lifted,qMixed=q_mixed,TReference=r.tr[1,7])))
end
