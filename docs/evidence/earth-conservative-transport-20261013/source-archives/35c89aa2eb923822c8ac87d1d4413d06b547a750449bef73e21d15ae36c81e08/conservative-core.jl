# Deliberately explicit baseline for the first behavioral RED run.
# This version will be archived by run-core-julia.mjs before implementation.
module ConservativeCore
export Geometry,Core,State,step!,mass,energy,StepRejected,save_checkpoint,load_checkpoint
struct Geometry
 area;from;to;edgeLength;centerDistance;radius
end
struct Core
 g;pref;ds;c2
end
Core(g,pref,ds;c2=1.)=Core(g,pref,ds,c2)
mutable struct State
 p;W;j;time
end
mass(c,p)=(c.g.area.*p)*transpose(c.ds)
function step!(c,s,dt)
 for e in eachindex(c.g.from)
  i,j=c.g.from[e],c.g.to[e]
  s.j[e,:].+=dt*c.c2*(s.p[i]-s.p[j])
  f=dt*sum(s.j[e,:].*c.ds)
  s.p[i]-=f/c.g.area[i];s.p[j]+=f/c.g.area[j]
 end
 s.time+=dt
 (airResidual=0.,waterResidual=0.)
end
end
