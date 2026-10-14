module BudgetCorrections
using Dates
export mass_mode_shift,audited_filter!,monthly_bracket
function mass_mode_shift(logp,q,w,target,g)
    length(logp)==length(q)==length(w)||error("Mass dimensions mismatch")
    all(isfinite,logp)&&all(x->isfinite(x)&&0<=x<1,q)||error("Invalid physical humidity/pressure")
    all(x->isfinite(x)&&x>0,w)&&abs(sum(w)-1)<1e-10&&target>0&&g>0||error("Invalid mass weights/target")
    rawTotal=sum(w.*exp.(logp))/g;rawWater=sum(w.*exp.(logp).*q)/g
    dry=rawTotal-rawWater
    isfinite(dry)&&dry>0||error("Non-finite dry air mass")
    return (;deltaLogPressure=log(target/dry),rawDryKgM2=dry,rawTotalKgM2=rawTotal,rawWaterKgM2=rawWater)
end
function audited_filter!(soil,runoff,deep,source,land,f1,f2,infiltration)
    nsteps=size(soil,3)
    size(soil,2)==2&&size(soil,1)==length(land)||error("Soil dimensions mismatch")
    all(isfinite,soil)&&f1>0&&f2>0&&0<=infiltration<=1||error("Invalid soil capacity or state")
    for step in 1:nsteps,i in eachindex(land)
        if land[i]>0
            excess=max(soil[i,1,step]-1,0)
            soil[i,1,step]-=excess;soil[i,2,step]+=infiltration*excess*f1/f2
            step==nsteps&&(runoff[i]+=(1-infiltration)*excess*f1)
        end
        if step==nsteps&&land[i]>0
            deep[i]+=max(soil[i,2,step]-1,0)*f2
            source[i]+=max(-soil[i,1,step],0)*f1+max(-soil[i,2,step],0)*f2
        end
        soil[i,1,step]=clamp(soil[i,1,step],0,1)
        soil[i,2,step]=clamp(soil[i,2,step],0,1)
    end
end
function monthly_bracket(t)
    start=DateTime(year(t),month(t),1)
    center(s)=s+Millisecond(daysinmonth(s)*86400000÷2)
    if t<center(start)
        left=start-Month(1);right=start
    else
        left=start;right=start+Month(1)
    end
    weight=Dates.value(t-center(left))/Dates.value(center(right)-center(left))
    return (;leftMonth=month(left),rightMonth=month(right),weight)
end
end
