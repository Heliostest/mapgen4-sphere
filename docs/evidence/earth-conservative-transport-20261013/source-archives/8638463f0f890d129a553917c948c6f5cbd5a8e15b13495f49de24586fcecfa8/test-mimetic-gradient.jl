using Test,LinearAlgebra,SparseArrays,JSON3,SHA
const ADAPTER=joinpath(@__DIR__,"mimetic-gradient.jl")
@testset "Mimetic gradient adapter exists" begin
    @test isfile(ADAPTER)
end
include(ADAPTER)
using .MimeticGradient

function pair_divergence(n,pairs,j)
    out=zeros(n)
    for e in eachindex(pairs.from)
        f=pairs.coefficient[e]*j[pairs.quadrature[e]]
        out[pairs.from[e]]+=f;out[pairs.to[e]]-=f
    end
    out
end

@testset "Hand-computed three cells and one quadrature" begin
    D=sparse([0.5 0.5 -1.0]);H=[2.];R=4.
    pairs=pair_decomposition(D,H,R)
    @test pairs.from==[1,2]
    @test pairs.to==[3,3]
    @test pairs.quadrature==[1,1]
    @test pairs.coefficient==[0.25,0.25]
    @test pair_divergence(3,pairs,[3.])==[0.75,0.75,-1.5]
    @test pair_divergence(3,pairs,[-3.])==[-0.75,-0.75,1.5]
    @test pair_divergence(3,pairs,[3.])==D'*(H.*[3.])./R
    # Variable reference and pressure impulse are a complete BE pair.
    A=[1.,2.,3.];pref=[2.,3.,4.];pf=[5.];c=2.;dt=0.2
    M=A.*pref;r=[1.03,0.99,1.01];j=[0.07]
    matrix=Diagonal(M)+dt^2*c^2/R^2*(D'*Diagonal(H.*pf)*D)
    rn=matrix\(M.*r-dt/R*(D'*(H.*j)))
    jn=j+dt*c^2/R*(pf.*(D*rn))
    @test maximum(abs,M.*(rn-r)+dt*pair_divergence(3,pairs,jn))<1e-14
    energy(r,j)=(c^2*sum(M.*r.^2)+sum(H./pf.*j.^2))/2
    loss=(c^2*sum(M.*(rn-r).^2)+sum(H./pf.*(jn-j).^2))/2
    @test abs(energy(rn,jn)-energy(r,j)+loss)<3e-14
    @test energy(rn,jn)<=energy(r,j)
end

@testset "Invalid decomposition inputs fail without coefficient repair" begin
    @test_throws ArgumentError pair_decomposition(sparse([0.5 0.5 -0.9]),[2.],4.)
    @test_throws ArgumentError pair_decomposition(sparse([0.5 NaN -1.]),[2.],4.)
    @test_throws ArgumentError pair_decomposition(sparse([0.5 0.5 -1.]),[-2.],4.)
    @test_throws ArgumentError pair_decomposition(sparse([0.5 0.5 -1.]),[2.],0.)
    @test_throws ArgumentError pair_decomposition(sparse([0.5 0.5 -1.]),[2.,3.],4.)
end

include(joinpath(@__DIR__,"conservative-grid.jl"))
using .ConservativeGrid
root=normpath(joinpath(@__DIR__,"../../.."))
input=joinpath(root,"build/earth-speedy-transport/split-reference-seasonal-geometry.json")
data=JSON3.read(read(input,String));mesh=build_gaussian_mesh(data.latDegrees,data.lonDegrees,data.weights)
D=reconstruction_gradient(mesh);H=mesh.edgeLength.*mesh.centerDistance
pairs=pair_decomposition(D,H,Float64(data.radiusM))
j=sin.(collect(1:size(D,1)))
me=findall(==(:meridional),mesh.edgeKind)
constres=maximum(abs,D*ones(length(mesh.area)))
pairres=maximum(abs,pair_divergence(length(mesh.area),pairs,j)-(D'*(H.*j))./data.radiusM)
K=D'*Diagonal(H)*D
x=cos.(mesh.lat).*cos.(mesh.lon)
relativeError=sqrt(sum(mesh.area.*((K*x)./mesh.area-2x).^2)/sum(mesh.area.*(2x).^2))
@testset "Native mesh reconstruction and exact shared transfers" begin
    @test size(D)==(length(mesh.from),length(mesh.area))
    @test constres<1e-12
    @test maximum(abs,(D*mesh.lat)[me].+1)<1e-12
    @test all(>(0),pairs.coefficient)
    @test all(pairs.from.!=pairs.to)
    @test all(1 .<=pairs.quadrature.<=size(D,1))
    @test pairres<1e-20
    # Independent archived operator probe, not a claim that strong error is small.
    @test abs(relativeError-0.08273851136577652)<1e-11
end
result=(scope="adapter unit checks; exact three-cell pressure/momentum energy fixture plus native gradient and shared-pair algebra",sourceSha256=bytes2hex(sha256(read(@__FILE__))),adapterSha256=bytes2hex(sha256(read(ADAPTER))),geometrySha256=bytes2hex(sha256(read(input))),ncell=length(mesh.area),nquadrature=size(D,1),npair=length(pairs.from),constantGradientResidual=constres,pairDivergenceResidual=pairres,strongXRelativeError=relativeError)
out=joinpath(root,"build/earth-conservative-transport/mimetic-gradient-test.json")
isfile(out) && error("preserve prior test output")
write(out,JSON3.write(result));println("MIMETIC_ADAPTER_RESULT ",JSON3.write(result))
