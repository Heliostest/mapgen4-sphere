# Read-only decomposition of the numerical reference-temperature split.
# No model time advance, global method replacement, or reference selection.
using LinearAlgebra, JSON3, JLD2, SHA
include("transport-v2-model.jl")
BLAS.set_num_threads(1)
const ROOT=normpath(joinpath(@__DIR__,"../../.."))
const SOURCE=joinpath(ROOT,"build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics-start.jld2")
saved=JLD2.load(SOURCE)
sg=SW.SpectralGrid(NF=Float64,truncation=32,nlayers=8)
m=transport_model(sg,"seasonal");v=SW.Variables(m)
for (key,data) in saved["containers"];SW.copy_variables!(getproperty(v,Symbol(key)),data);end
p=deepcopy(SW.get_step(v.prognostic.pressure,2))
div=deepcopy(SW.get_step(v.prognostic.divergence,2))
vor=deepcopy(SW.get_step(v.prognostic.vorticity,2))
R=v.prognostic.scale[]
old=saved["components"]["implicit"].temp_profile
delta=288 .- old
function describe(x,S;power=1)
    data=x.data;li=x.spectrum.l_indices;physical=li.<=32;aux=li.==33
    filtered=deepcopy(x);filtered.data[aux,:].=0
    grid=SW.transform(filtered,S)
    ii=argmax(abs.(data))
    (;spectralMax=maximum(abs,data),physicalMax=maximum(abs,data[physical,:]),
       auxiliaryMax=maximum(abs,data[aux,:]),maxIndex=Tuple(CartesianIndices(data)[ii]),
       maxLIndex=li[Tuple(CartesianIndices(data)[ii])[1]],
       physicalGridMax=maximum(abs,grid.data),physicalGridPerDay=maximum(abs,grid.data)*86400/R^power)
end
function pres_operator(p,S,geometry)
    px,py=SW.∇(p,S)
    gx=SW.transform(px,S;unscale_coslat=true)
    gy=SW.transform(py,S;unscale_coslat=true)
    c=geometry.coslat⁻¹[gx.grid.whichring]
    gx.data .*= c;gy.data .*= c
    sx=SW.transform(gx,S);sy=SW.transform(gy,S)
    curl=SW.curl(sx,sy,S);divergence=SW.divergence(sx,sy,S)
    lap=SW.∇²(p,S)
    residual=deepcopy(divergence);residual.data .-= lap.data
    (;curl,divergence,lap,residual)
end
function wind_operator(u,v,D,S,geometry)
    x=deepcopy(u);y=deepcopy(v)
    c=geometry.coslat⁻¹[x.grid.whichring]
    x.data .*= c;y.data .*= c
    dx=SW.transform(x,S);dy=SW.transform(y,S)
    d=SW.divergence(dx,dy,S)
    original=SW.transform(D,S)
    d.data .-= original.data
    d
end
records=[];predicted=Dict()
for Grid in (SW.OctahedralGaussianGrid,SW.FullGaussianGrid)
    sg2=SW.SpectralGrid(NF=Float64,truncation=32,nlayers=8,Grid=Grid)
    m2=transport_model(sg2,"seasonal");S=m2.spectral_transform
    po=pres_operator(p,S,m2.geometry)
    U=zero(div);V=zero(div);SW.UV_from_vordiv!(U,V,vor,div,S)
    ur=SW.transform(U,S;unscale_coslat=true);vr=SW.transform(V,S;unscale_coslat=true)
    D=SW.transform(div,S)
    winderr=wind_operator(ur,vr,D,S,m2.geometry)
    fullgrid=string(Grid)
    push!(records,(;grid=fullgrid,pressureCurl=describe(po.curl,S;power=2),
        pressureDivMinusLap=describe(po.residual,S;power=2),reconstructedWindDivError=describe(winderr,S)))
    if Grid==SW.OctahedralGaussianGrid
        println(JSON3.write((;pressureInput=describe(p,S),pressureAuxMax=maximum(abs,p.data[p.spectrum.l_indices.==33]),
            divAuxMax=maximum(abs,div.data[div.spectrum.l_indices.==33,:]),vorAuxMax=maximum(abs,vor.data[vor.spectrum.l_indices.==33,:]))))
        for selection in ("physical", "auxiliary_only")
            pp=deepcopy(p)
            mask=selection=="physical" ? pp.spectrum.l_indices.==33 : pp.spectrum.l_indices.<=32
            pp.data[mask].=0
            ppout=pres_operator(pp,S,m2.geometry)
            push!(records,(;grid=selection,pressureCurl=describe(ppout.curl,S;power=2),
                pressureDivMinusLap=describe(ppout.residual,S;power=2)))
        end
        uf=SW.get_step(v.grid.u,2);vf=SW.get_step(v.grid.v,2);Df=SW.get_step(v.grid.divergence,2)
        we=wind_operator(uf,vf,Df,S,m2.geometry)
        println(JSON3.write((;fixtureUminusReconstructed=maximum(abs,uf.data-ur.data),
            fixtureVminusReconstructed=maximum(abs,vf.data-vr.data),fixtureDminusReconstructed=maximum(abs,Df.data-D.data))))
        for (key,operator) in (("temperature",we),("vorticity",po.curl),("divergence",po.residual))
            result=deepcopy(div)
            result.data .= operator.data .* delta'
            key!="temperature" && (result.data .*= m.atmosphere.R_dry)
            predicted[key]=copy(result.data)
            println(JSON3.write((;prediction=key,stats=describe(result,S;power=key=="temperature" ? 1 : 2))))
        end
        push!(records,(;grid="saved Octahedral fixture",windDivError=describe(we,S)))
    end
end
matches=[]
rawfile=joinpath(ROOT,"build/earth-speedy-transport/physics-implicit-reference-raw.jld2")
if isfile(rawfile)
    raw=JLD2.load(rawfile)["raws"]
    for key in keys(predicted)
        actual=raw["isothermal288"][key]-raw["old"][key]
        if size(actual)==size(predicted[key])
            residual=actual-predicted[key]
            rx=deepcopy(div);rx.data .= residual
            push!(matches,(;variable=key,actualMax=maximum(abs,actual),predictedMax=maximum(abs,predicted[key]),
                unexplainedMax=maximum(abs,residual),relativeUnexplained=maximum(abs,residual)/max(1.,maximum(abs,actual)),
                unexplained=describe(rx,m.spectral_transform;power=key=="temperature" ? 1 : 2)))
        else
            push!(matches,(;variable=key,actualSize=size(actual),expectedSize=size(predicted[key])))
        end
    end
end
record=(;sourceSHA=bytes2hex(sha256(read(SOURCE))),scriptSHA=bytes2hex(sha256(read(@__FILE__))),
    radiusScale=R,truncation=sg.truncation,spectrumLmax=p.spectrum.lmax,lIndexExtrema=extrema(p.spectrum.l_indices),
    physicalMask="l_index <= 32 (degree <= 31); l_index 33 is auxiliary",records,matches)
println(JSON3.write(record))
open(io->JSON3.write(io,record),joinpath(ROOT,"build/earth-speedy-transport/readonly-reference-operators.json"),"w")
JLD2.jldsave(joinpath(ROOT,"build/earth-speedy-transport/readonly-reference-predictions.jld2");predicted)
