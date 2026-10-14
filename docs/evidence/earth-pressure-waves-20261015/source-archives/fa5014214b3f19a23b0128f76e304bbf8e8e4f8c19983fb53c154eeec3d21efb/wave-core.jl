struct WaveStepper{F}
    c::TransportCore
    dt::Float64
    factor::F
    right::SparseMatrixCSC{Float64,Int}
end
function WaveStepper(c,dt::Real)
    isfinite(dt)&&dt!=0||throw(ArgumentError("finite nonzero timestep required"))
    a=c.g.area.*c.pref;term=(dt^2*c.c2/4)*c.stiffness
    all(isfinite,term.nzval)||throw(ArgumentError("timestep scale overflow"))
    M=spdiagm(0=>a)
    WaveStepper(c,Float64(dt),cholesky(Symmetric(M+term)),M-term)
end
function wave_step(s::WaveStepper,r,v)
    c=s.c
    r isa AbstractVector&&v isa AbstractVector&&length(r)==length(c.pref)&&length(v)==length(c.prefFace)||throw(ArgumentError("wave state shape mismatch"))
    all(isfinite,r)&&all(isfinite,v)||throw(ArgumentError("finite wave state required"))
    rr=s.factor\(s.right*r-s.dt*(c.divergence*(c.prefFace.*v)))
    vv=v+(s.dt*c.c2/2)*(c.gradient*(r+rr))
    all(isfinite,rr)&&all(isfinite,vv)||throw(ArgumentError("nonfinite wave output"))
    rr,vv
end
wave_step(c,r,v,dt)=wave_step(WaveStepper(c,dt),r,v)
wave_energy(c,r,v)=(c.c2*sum(c.g.area.*c.pref.*r.^2)+sum(c.g.edgeLength.*c.g.centerDistance.*c.prefFace.*v.^2))/2
