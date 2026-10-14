# Only diagnostic matrices, no integration. The included diagnostic supplies a
# kernel-verified RAW/implicit map and reruns its initial-column comparisons.
include("physics-implicit-candidates.jl")
windowSettings=[settings;[(;name="january2006GlobalMean",reference=collect(v["dynamics"].average_temperature_profile),stepS=1800.)]]
windows=[]
for label in ("thermal","all")
    path=joinpath(ROOT,"build/earth-speedy-transport/implicit-instability-$label-window.json")
    data=JSON3.read(read(path,String));rows=[]
    for r in data.rows
        columns=[]
        for col in r.columns
            T=Float64.(col.T);minimum(T)>0 || continue
            outputs=[]
            for s in [windowSettings;[(;name="instantaneousGlobalMean",reference=Float64.(r.average),stepS=1800.)]]
                zz=[candidate(T,l,s.reference,s.stepS) for l in 2:32]
                z=zz[argmax(getproperty.(zz,:rho))]
                push!(outputs,(;setting=s.name,z...,negativeRhoAll=maximum(getproperty.(zz,:negativeRho))))
            end
            push!(columns,(;ij=col.ij,T,q=collect(col.q),outputs))
        end
        push!(rows,(;time=String(r.time),instantaneousGlobalMean=collect(r.average),columns))
    end
    push!(windows,(;label,source=path,sourceSHA=bytes2hex(sha256(read(path))),rows))
end
output=(;scriptSHA=bytes2hex(sha256(read(@__FILE__))),candidateScriptSHA=bytes2hex(sha256(read(joinpath(@__DIR__,"physics-implicit-candidates.jl")))),
    settings=windowSettings,scope="Four fixed North Pacific columns over48h before each failure; full native checkpoint window matches original step extrema. Local dry flat resting-column analysis includes actual T but excludes actual q coupling, winds, vertical velocity and terrain. q is retained for inspection, not falsely included in dry matrix. All positive states evaluated, including late distorted states which are not used to infer initial cause.",windows)
open(io->JSON3.write(io,output),joinpath(ROOT,"build/earth-speedy-transport/physics-implicit-window-stability.json"),"w")
println("Fixed-column window stability diagnostic complete.")
