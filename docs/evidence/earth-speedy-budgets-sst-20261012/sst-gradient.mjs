/** Weighted regional plane fit, gradients of actual native monthly SST. */
export function sstGradient(temperature,latitude,longitude,weights,radius) {
 const total=weights.reduce((s,w)=>s+w,0);if(!(total>0))throw Error('Empty marine gradient support');
 const avg=a=>a.reduce((s,v,i)=>s+v*weights[i],0)/total;
 const lat=avg(latitude),lon=avg(longitude),T=avg(temperature);
 let xx=0,yy=0,xy=0,xT=0,yT=0;
 for(let i=0;i<weights.length;i++){
  const x=longitude[i]-lon,y=latitude[i]-lat,t=temperature[i]-T,w=weights[i];
  xx+=w*x*x;yy+=w*y*y;xy+=w*x*y;xT+=w*x*t;yT+=w*y*t;
 }
 const det=xx*yy-xy*xy;if(!(det>0))throw Error('Degenerate marine gradient support');
 const east=(xT*yy-yT*xy)/det,north=(yT*xx-xT*xy)/det,metresPerDeg=radius*Math.PI/180;
 return {meanLatitudeDeg:lat,meanLongitudeDeg:lon,meanSstK:T,eastKPerDegree:east,northKPerDegree:north,eastKPer1000Km:east*1e6/(metresPerDeg*Math.cos(lat*Math.PI/180)),northKPer1000Km:north*1e6/metresPerDeg};
}
