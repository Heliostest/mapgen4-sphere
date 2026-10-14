module GraphWind
using LinearAlgebra,SparseArrays
using ..ConservativeCore
export WindMap,import_wind,hodge_split
# Deliberately incomplete RED fixture: the native graph import does not exist yet.
struct WindMap
    c::TransportCore
end
WindMap(c,lat,lon)=WindMap(c)
import_wind(m,p,u,v)=zeros(length(m.c.g.from),length(m.c.ds))
end
