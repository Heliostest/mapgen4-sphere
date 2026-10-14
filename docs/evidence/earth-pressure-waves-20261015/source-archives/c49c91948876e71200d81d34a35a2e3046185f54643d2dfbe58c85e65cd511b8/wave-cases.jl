const AXES=[normalize([.37,.53,.76]),normalize([.81,-.47,.19])]
function wave_fields(c,x,degree,axis,kind)
    omega=sqrt(c.c2*degree*(degree+1))/c.g.radius
    if kind=="standing"
        t=x*axis;p0=ones(length(t));f=t
        for l in 2:degree;p0,f=f,((2l-1)*t.*f-(l-1)*p0)/l;end
        g=zeros(length(f))
    elseif kind=="traveling"
        e=normalize(cross(axis,[0.,0.,1.]));n=cross(axis,e);z=(x*e+im*(x*n)).^degree
        f=real(z);g=imag(z)
    else
        throw(ArgumentError("unknown wave kind"))
    end
    (f=f,g=g,v=-(c.c2/omega)*(c.gradient*g),omega=omega,period=2pi/omega)
end
function wave_measure(c,r,v,f,g,omega,kind)
    a=c.g.area;ff=sum(a.*f.^2);rp=sum(a.*f.*r)/ff
    if kind=="standing"
        rd=-(c.divergence*(c.prefFace.*v))./(a.*c.pref)
        speed=sum(a.*f.*rd)/ff;imaginary=-speed/omega
        amplitude=hypot(rp,imaginary);phase=atan(imaginary,rp);projected=rp*f
    else
        Gram=[ff sum(a.*f.*g);sum(a.*f.*g) sum(a.*g.^2)]
        coeff=Gram\[sum(a.*f.*r),sum(a.*g.*r)]
        amplitude=norm(coeff);phase=atan(coeff[2],coeff[1]);projected=coeff[1]*f+coeff[2]*g
    end
    (phase=phase,amplitude=amplitude,leakage=sqrt(sum(a.*(r-projected).^2)/ff))
end
unwrap_phase(previous,wrapped)=previous+mod(wrapped-previous+pi,2pi)-pi
function wave_errors(c,r,v,rr,vv,initialr,initialv)
    A=c.g.area.*c.pref;H=c.g.edgeLength.*c.g.centerDistance.*c.prefFace
    scaleR=sqrt(sum(A.*initialr.^2));scaleV=sqrt(c.c2*sum(A.*initialr.^2)+sum(H.*initialv.^2))
    (pressure=sqrt(sum(A.*(r-rr).^2))/scaleR,velocity=sqrt(sum(H.*(v-vv).^2))/scaleV)
end
