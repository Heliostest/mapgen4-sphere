module ExperimentDiagnostics
export column_water, weighted_mean, ocean_heat_ledger
weighted_mean(values,weights)=sum(values .* weights)
function column_water(q,pressure,thickness,gravity)
    size(q,1)==length(pressure)&&size(q,2)==length(thickness)||error("Column dimensions mismatch")
    all(isfinite,q)&&all(x->isfinite(x)&&x>0,pressure)&&gravity>0||error("Invalid finite column")
    all(x->x>0,thickness)&&abs(sum(thickness)-1)<1e-10||error("Invalid sigma thickness")
    return (q*thickness).*pressure./gravity
end
function ocean_heat_ledger(before,after,flux,dt,C,freezing,weights,land)
    n=length(before)
    all(x->length(x)==n,(after,flux,weights,land))||error("Ocean dimensions mismatch")
    all(isfinite,before)&&all(isfinite,after)&&all(isfinite,flux)&&dt>=0&&C>0||error("Invalid ocean ledger")
    stock=0.0;input=0.0;adjustment=0.0
    for i in eachindex(before)
        weight=weights[i]*(1-land[i])
        predicted=before[i]+flux[i]*dt/C
        stock+=weight*C*(after[i]-before[i])
        input+=weight*flux[i]*dt
        adjustment+=weight*C*max(freezing-predicted,0)
    end
    return (;stockChangeJm2=stock,surfaceInputJm2=input,freezingAdjustmentJm2=adjustment,residualJm2=stock-input-adjustment)
end
end
