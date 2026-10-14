/** Coarse diagnostic only: monthly transport, spherical equal-area cells. */
export function moistureConvergence(east,north,{width:W,height:H},radius) {
 if(east.length!==W*H||north.length!==W*H||!(radius>0))throw Error('Invalid transport grid');
 const dλ=2*Math.PI/W,dμ=2/H,area=radius**2*dλ*dμ,result=new Float64Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const k=y*W+x,φ=Math.asin(1-(y+.5)*dμ),cN=Math.sqrt(Math.max(0,1-(1-y*dμ)**2)),cS=Math.sqrt(Math.max(0,1-(1-(y+1)*dμ)**2));
  const e=(east[k]+east[y*W+(x+1)%W])/2,w=(east[k]+east[y*W+(x+W-1)%W])/2;
  const n=y===0?0:(north[k]+north[k-W])/2,s=y===H-1?0:(north[k]+north[k+W])/2;
  result[k]=-86400*radius*(dμ/Math.cos(φ)*(e-w)+dλ*(cN*n-cS*s))/area;
 }
 return result;
}
