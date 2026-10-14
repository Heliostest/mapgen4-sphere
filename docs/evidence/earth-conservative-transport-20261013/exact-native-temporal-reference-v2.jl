# Independent modal evolution of the fixed spatial linear pressure subsystem.
# Does not change the candidate or rerun/rewrite any native evidence.
using JSON3,Serialization,LinearAlgebra,SparseArrays,SHA,Test
include("conservative-core.jl")
include("conservative-grid.jl")
include("mimetic-gradient.jl")
using .ConservativeCore,.ConservativeGrid,.MimeticGradient
BLAS.set_num_threads(1)
const OUT=joinpath(@__DIR__,"../../../build/earth-conservative-transport")
function main()
    names=["candidate-c1-native-1800","candidate-c1-native-900","candidate-c1-native-450"]
    paths=vcat([joinpath(OUT,n*".json") for n in names],[joinpath(OUT,n*"-real-final.bin") for n in names],[joinpath(OUT,names[1]*"-import.bin")], [joinpath(@__DIR__,"../../../build/earth-speedy-transport/split-reference-seasonal-geometry.json")])
    inputHashes=Dict(p=>bytes2hex(sha256(read(p))) for p in paths)
    runs=[JSON3.read(read(joinpath(OUT,n*".json"),String)) for n in names]
    states=[deserialize(joinpath(OUT,n*"-real-final.bin")).state for n in names]
    initial=deserialize(joinpath(OUT,names[1]*"-import.bin"))
    data=JSON3.read(read(last(paths),String))
    mesh=build_gaussian_mesh(data.latDegrees,data.lonDegrees,data.weights)
    D=reconstruction_gradient(mesh);H=mesh.edgeLength.*mesh.centerDistance;R=Float64(data.radiusM)
    pf=(initial.pref[mesh.from]+initial.pref[mesh.to])/2
    # Assemble from D/H directly, without using the core's factor, B, divergence,
    # stiffness, or pressure_step. This is a distinct modal solution algorithm.
    K=(D'*spdiagm(0=>H.*pf)*D)/R^2
    massdiag=mesh.area.*initial.pref;sqrtmass=sqrt.(massdiag)
    normalized=runs[1].c2*(spdiagm(0=>1 ./sqrtmass)*K*spdiagm(0=>1 ./sqrtmass))
    asymmetry=norm(normalized-normalized')/norm(normalized)
    @test asymmetry<1e-13
    println("Eigendecomposing ",length(massdiag)," native pressure modes");flush(stdout)
    eig=eigen(Symmetric(Matrix(normalized)))
    eigenResidual=norm(normalized*eig.vectors-eig.vectors*Diagonal(eig.values))/norm(normalized)
    orthogonalityResidual=norm(eig.vectors'*eig.vectors-I)/sqrt(length(massdiag))
    @test eigenResidual<1e-12
    @test orthogonalityResidual<1e-12
    scale=maximum(abs,eig.values);negative=minimum(eig.values)
    @test negative>=-1e-12*scale
    # The constant ratio is an exact known null mode. Treat only roundoff-sized
    # eigenvalues as null; never alter the authoritative simulation inventory.
    threshold=1e-12*scale;null=findall(abs.(eig.values).<=threshold)
    @test length(null)==1
    omega=sqrt.(max.(eig.values,0.))
    j=zeros(length(mesh.from),length(initial.ds))
    for k in eachindex(initial.ds)
        j[:,k]=(initial.pressure[mesh.from]+initial.pressure[mesh.to])/2 .* sample_native_velocity(mesh,initial.u[:,k],initial.v[:,k])
    end
    rbar=sum(mesh.area.*initial.pressure)/sum(massdiag)
    y0=sqrtmass.*(initial.pressure./initial.pref.-rbar)
    derivative0=-(D'*(H.*(j*initial.ds)))/R./sqrtmass
    coeff0=eig.vectors'*y0;deriv0=eig.vectors'*derivative0
    T=3*86400.
    function modal(dt)
        a=similar(coeff0);integrated=similar(coeff0)
        for k in eachindex(a)
            if k in null
                a[k]=coeff0[k]+T*deriv0[k]
                integrated[k]=T*coeff0[k]+(dt==0 ? T^2/2 : (T^2+T*dt)/2)*deriv0[k]
            elseif dt==0
                a[k]=cos(omega[k]*T)*coeff0[k]+sin(omega[k]*T)/omega[k]*deriv0[k]
                integrated[k]=sin(omega[k]*T)/omega[k]*coeff0[k]+(1-cos(omega[k]*T))/omega[k]^2*deriv0[k]
            else
                z=(1+im*omega[k]*dt)^(-round(Int,T/dt))
                a[k]=real(z)*coeff0[k]-imag(z)/omega[k]*deriv0[k]
                integrated[k]=-imag(z)/omega[k]*coeff0[k]+(1-real(z))/omega[k]^2*deriv0[k]
            end
        end
        pressure=initial.pref.*(rbar.+(eig.vectors*a)./sqrtmass)
        momentum=j.+runs[1].c2*pf.*(D*((eig.vectors*integrated)./sqrtmass))/R
        (pressure=pressure,momentum=momentum)
    end
    reference=modal(0.).pressure;normP(p)=sqrt(sum(mesh.area.*p.^2)/sum(mesh.area))
    @test minimum(reference)>0
    rows=[]
    for (k,dt) in enumerate((1800.,900.,450.))
        prediction=modal(dt);predicted=prediction.pressure;actual=states[k].p
        velocityError=sqrt(sum(H.*vec(sum(((states[k].j-prediction.momentum)./pf).^2 .* transpose(initial.ds),dims=2)))/sum(H))
        item=(dt=dt,rmsDifferenceFromExactBackwardEulerPa=normP(actual-predicted),linearVelocityDifferenceFromExactBackwardEulerMps=velocityError,rmsTemporalErrorPa=normP(actual-reference),maxTemporalErrorPa=maximum(abs,actual-reference),backwardEulerReferenceTemporalErrorPa=normP(predicted-reference),maxOmegaDt=maximum(omega)*dt)
        push!(rows,item);println(JSON3.write(item));flush(stdout)
        @test item.rmsDifferenceFromExactBackwardEulerPa<1e-6
        @test velocityError<1e-7
    end
    # Independent modal dt-refinement curve also separates asymptotic behavior
    # from adjacent coarse-step differences; it is cheap and changes no state.
    curve=[(dt=dt,errorPa=normP(modal(dt).pressure-reference)) for dt in (1800.,900.,450.,225.,112.5,56.25,28.125,14.0625)]
    exactMonotone=all(curve[i+1].errorPa<curve[i].errorPa for i in 1:length(curve)-1)
    @test exactMonotone
    all(p->bytes2hex(sha256(read(p)))==inputHashes[p],paths) || error("analysis inputs changed")
    result=(scope="exact modal time evolution of the SAME fixed spatial variational pressure system, not continuum-sphere or full-atmosphere truth",inputHashes=inputHashes,matrixRelativeAsymmetry=asymmetry,eigenResidual=eigenResidual,orthogonalityResidual=orthogonalityResidual,referenceMinimumPressurePa=minimum(reference),lowestEigenvalue=negative,highestEigenvalue=maximum(eig.values),knownNullModes=length(null),modeCount=length(massdiag),rows=rows,modalTimeRefinement=curve,temporalErrorMonotone=exactMonotone,adjacentStepDifferenceGatePassed=false,reference="dense symmetric eigendecomposition; exact sin/cos evolution and exact BE rational amplification for pressure/momentum pair")
    name=get(ENV,"CORE_RUN_NAME","native-temporal-reference")
    write(joinpath(OUT,name*".json"),JSON3.write(result))
end
@testset "native pressure against independent exact modal time evolution" begin
    main()
end
