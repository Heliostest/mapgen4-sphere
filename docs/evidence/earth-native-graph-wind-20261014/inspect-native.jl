using Serialization,JSON3,SHA
function main()
    path="build/earth-conservative-transport/candidate-c1-native-1800-import.bin"
    r=deserialize(path)
    rows=[]
    for key in keys(r)
        v=getproperty(r,key)
        push!(rows,(field=string(key),type=string(typeof(v)),shape=v isa AbstractArray ? size(v) : nothing,
                    minimum=v isa AbstractArray{<:Number} ? minimum(v) : nothing,
                    maximum=v isa AbstractArray{<:Number} ? maximum(v) : nothing))
    end
    out=(sha256=bytes2hex(sha256(read(path))),fields=rows)
    println(JSON3.write(out))
    write("build/earth-native-graph-wind/"*ENV["WIND_RUN_NAME"]*".json",JSON3.write(out))
end
main()
