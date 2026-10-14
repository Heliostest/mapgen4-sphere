const rad=Math.PI/180,tau=2*Math.PI;
function segments(west,east){const span=east-west,w=((west+180)%360+360)%360-180;return w+span<=180?[[w,w+span]]:[[w,180],[-180,w+span-360]];}
/** Reconstruct constant footprints whose areas equal native Gaussian
 * quadrature weights. This preserves totals, not unresolved subgrid structure. */
export function createRemap(grid,width=48,height=24) {
 const {latDegrees:lat,lonDegrees:lon,weights}=grid,n=lat?.length;
 if(!n||lon?.length!==n||weights?.length!==n||!Number.isInteger(width)||width<2||!Number.isInteger(height)||height<2)throw Error('Invalid grid length');
 if(weights.some(v=>!Number.isFinite(v)||v<=0)||Math.abs(weights.reduce((s,v)=>s+v,0)-1)>1e-10)throw Error('Native weights must be positive and normalized');
 const rings=new Map();
 for(let i=0;i<n;i++){
  if(!Number.isFinite(lat[i])||Math.abs(lat[i])>90||!Number.isFinite(lon[i]))throw Error('Invalid finite coordinates');
  if(!rings.has(lat[i]))rings.set(lat[i],[]);rings.get(lat[i]).push(i);
 }
 const footprints=[];let top=1;
 for(const [phi,indices] of [...rings].sort((a,b)=>b[0]-a[0])){
  const ringWeight=indices.reduce((s,i)=>s+weights[i],0),bottom=Math.max(-1,top-2*ringWeight),step=360/indices.length;
  const ordered=indices.slice().sort((a,b)=>((lon[a]%360+360)%360)-((lon[b]%360+360)%360));
  for(let k=0;k<ordered.length;k++){
   const i=ordered[k],next=ordered[(k+1)%ordered.length];
   if(Math.abs(weights[i]-ringWeight/indices.length)>1e-12)throw Error('Unequal ring weight');
   if(indices.length>1&&Math.abs(((lon[next]-lon[i])%360+360)%360-step)>1e-8)throw Error('Nonuniform ring longitude spacing');
   footprints.push({i,top,bottom,segments:segments(lon[i]-step/2,lon[i]+step/2)});
  }
  top=bottom;
 }
 const count=width*height,area=tau*2/count,overlaps=Array.from({length:count},()=>[]),sourceAreas=new Float64Array(n);
 for(const f of footprints)for(let y=0;y<height;y++){
  const ds=Math.min(f.top,1-2*y/height)-Math.max(f.bottom,1-2*(y+1)/height);if(ds<=0)continue;
  for(let x=0;x<width;x++){
   const west=-180+x*360/width,east=west+360/width;
   const dl=f.segments.reduce((s,[a,b])=>s+Math.max(0,Math.min(east,b)-Math.max(west,a)),0);
   if(dl>0){const solidAngle=ds*dl*rad;overlaps[y*width+x].push([f.i,solidAngle]);sourceAreas[f.i]+=solidAngle;}
  }
 }
 for(const row of overlaps)if(Math.abs(row.reduce((s,p)=>s+p[1],0)-area)>1e-11)throw Error('Target area coverage mismatch');
 for(let i=0;i<n;i++)if(Math.abs(sourceAreas[i]-4*Math.PI*weights[i])>1e-11)throw Error('Source quadrature area mismatch');
 return {width,height,count,sourceCount:n,area,overlaps};
}
/** Mask-normalized means keep land rain and marine ice on distinct supports. */
export function remapScalar(map,field,mask) {
 if(field.length!==map.sourceCount||mask&&mask.length!==map.sourceCount)throw Error('Field length mismatch');
 if(Array.from(field).some(v=>!Number.isFinite(v)))throw Error('Field must be finite');
 if(mask&&Array.from(mask).some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Invalid area mask');
 const values=new Float64Array(map.count),coverage=new Float64Array(map.count);
 for(let k=0;k<map.count;k++){
  let numerator=0,denominator=0;
  for(const [i,a] of map.overlaps[k]){const weight=a*(mask?mask[i]:1);numerator+=weight*field[i];denominator+=weight;}
  values[k]=denominator>0?numerator/denominator:0;coverage[k]=denominator/map.area;
 }
 return {values,coverage};
}
