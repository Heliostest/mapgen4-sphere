using LinearAlgebra, Random, Test, SHA, JSON3
include("../../docs/evidence/earth-conservative-transport-20261013/conservative-core.jl")
include("../../docs/evidence/earth-covariant-momentum-20261014/momentum.jl")
using .ConservativeCore, .CovariantMomentum
rng=MersenneTwister(20261014)
basis(lat,lon)=(hcat(cos.(lat).*cos.(lon),cos.(lat).*sin.(lon),sin.(lat)),hcat(-sin.(lon),cos.(lon),zero.(lat)),hcat(-sin.(lat).*cos.(lon),-sin.(lat).*sin.(lon),cos.(lat)))
worstDense=0.;worstEnergy=0.;worstSpeed=0.;accepted=0
@testset "Independent dense and geometric momentum probes" begin
 for test in 1:60
  n=rand(rng,3:16);lat=asin.(2rand(rng,n).-1);lon=2pi*rand(rng,n)
  a=Int[];b=Int[];F=Float64[]
  for i=1:n,j=i+1:n
   if rand(rng)<.5;push!(a,i);push!(b,j);push!(F,.05randn(rng));end
  end
  isempty(a)&&continue
  x,e,z=basis(lat,lon);mo=1 .+rand(rng,n);mn=copy(mo)
  for (i,j,f) in zip(a,b,F);mn[i]-=f;mn[j]+=f;end
  minimum(mn)>0||continue
  u=randn(rng,n,2);old=copy(u);g=ConnectionGeometry(lat,lon,a,b)
  A=Matrix(Diagonal(repeat(mn,2)));Tlist=[]
  for (i,j,f) in zip(a,b,F)
   if f<0;i,j=j,i;f=-f;end
   axis=normalize(cross(x[i,:],x[j,:]));theta=acos(clamp(dot(x[i,:],x[j,:]),-1,1))
   skew=[0. -axis[3] axis[2];axis[3] 0. -axis[1];-axis[2] axis[1] 0.]
   rotation=exp(theta*skew);T=hcat(e[j,:],z[j,:])'*rotation*hcat(e[i,:],z[i,:]);push!(Tlist,(i,j,f,T))
   for k=1:2
    A[i+(k-1)*n,i+(k-1)*n]+=f
    for l=1:2;A[j+(k-1)*n,i+(l-1)*n]-=f*T[k,l];end
   end
  end
  ref=reshape(A\vec(mo.*u),n,2);r=transport_momentum(g,mo,mn,F,u)
  err=norm(r.velocity-ref)/norm(ref)
  ko=sum(mo.*u.^2)/2;kn=sum(mn.*r.velocity.^2)/2
  loss=sum(mo.*(r.velocity-u).^2)/2+sum(f*sum(abs2,r.velocity[j,:]-T*r.velocity[i,:])/2 for (i,j,f,T) in Tlist)
  residual=abs(kn-ko+loss)/ko;ratio=maximum(sqrt.(sum(r.velocity.^2;dims=2)))/maximum(sqrt.(sum(u.^2;dims=2)))
  @test err<5e-12
  @test residual<5e-12
  @test kn<=ko*(1+1e-12)
  @test ratio<=1+1e-12
  @test old==u
  global worstDense=max(worstDense,err);global worstEnergy=max(worstEnergy,residual);global worstSpeed=max(worstSpeed,ratio);global accepted+=1
 end
 # Pole/coincident-coordinate frame change is an isometry, even if longitudes differ.
 gp=ConnectionGeometry([pi/2,pi/2],[0.,1.3],[1],[2]);up=[2. -3.;-1. 4.]
 rp=transport_momentum(gp,[1.,1.],[.7,1.3],[.3],up)
 @test rp.energyRelative<5e-12
 # Large circulating transfers preserve mass but legitimately exhaust fixed iteration budget.
 gc=ConnectionGeometry([.4,.4,.4],[1.,1.,1.],[1,2,3],[2,3,1]);uc=[1. 3.;-2. 4.;3. -2.]
 @test_throws StepRejected transport_momentum(gc,ones(3),ones(3),fill(1e5,3),uc)
 rc=transport_momentum(gc,ones(3),ones(3),fill(3.,3),uc)
 @test rc.energyRelative<5e-12
 @test sum(rc.velocity;dims=1)≈sum(uc;dims=1) rtol=5e-12
 # Explicitly test zero velocities and no links.
 gz=ConnectionGeometry([.1],[.2],Int[],Int[])
 @test transport_momentum(gz,[1.],[1.],Float64[],zeros(1,2)).velocity==zeros(1,2)
end
sources=["momentum.jl","advection-core.jl","common.jl","analytic.jl","native-run.jl","compare-time.jl","test-momentum.jl","test-advection.jl","test-covariance.jl"]
hashes=Dict("docs/evidence/earth-covariant-momentum-20261014/"*p=>bytes2hex(sha256(read("docs/evidence/earth-covariant-momentum-20261014/"*p))) for p in sources)
result=(passed=true,randomCases=accepted,worstDenseRelative=worstDense,worstEnergyRelative=worstEnergy,maxSpeedRatio=worstSpeed,sourceHashes=hashes)
write("build/c6-independent-review/probes.json",JSON3.write(result));println(JSON3.write(result))
