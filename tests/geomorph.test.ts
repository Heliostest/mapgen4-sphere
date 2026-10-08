import test from 'node:test';
import assert from 'node:assert/strict';
import {makeThermalGrid} from '../thermal.ts';
import {GeomorphModel,DEFAULT_GEOMORPH} from '../geomorph.ts';
import {previewElevation} from '../terrain-preview.ts';
import {GeomorphRuntime} from '../geomorph-runtime.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
const grid=makeThermalGrid(16,8),n=grid.count,field=(x:number)=>new Float64Array(n).fill(x);
const near=(a:number,b:number,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const model=(height=field(1000),land=field(1),flow=field(1000),config={},radius=6371008.4)=>new GeomorphModel(grid,radius,land,height,flow,{...DEFAULT_GEOMORPH,...config});

test('uniform dry land is stationary, inputs are copied and invalid values rejected',()=>{
    const h=field(1000),m=model(h,field(1),field(0));h[0]=1;m.advance(100000);
    assert.ok(m.heightM.every(x=>x===1000));near(m.diagnostics().residualMm,0);
    assert.throws(()=>model(h,field(1),field(0),{diffusivityM2Yr:-1}),RangeError);
    assert.throws(()=>model(h,field(1),field(NaN)),RangeError);
});
test('dry hillslope smoothing lowers peaks, raises neighbors and conserves solid volume',()=>{
    const h=field(100);h[0]=2000;const m=model(h,field(1),field(0));m.advance(100000);
    assert.ok(m.heightM[0]<2000);assert.ok(m.heightM[15]>100);assert.ok(m.heightM.every(x=>x>=100&&x<=2000));
    near(m.diagnostics().residualMm,0,1e-6);near(m.oceanSedimentM,0);
});
test('runoff cuts downhill rock into mobile sediment and all-land retains every solid',()=>{
    const h=field(100);h[0]=2000;const m=model(h,field(1),field(1000),{diffusivityM2Yr:0});m.step();
    assert.ok(m.heightM[0]<h[0]);assert.ok(m.mobileM.some(x=>x>0));
    for(let i=0;i<500;i++)m.step();near(m.diagnostics().residualMm,0,1e-6);near(m.oceanSedimentM,0);
    assert.ok(m.heightM.every(x=>x>=0));assert.ok(m.mobileM.every(x=>x>=0));
});
test('closed basin sediment settles locally without a carved outlet',()=>{
    const h=field(1000);h[20]=0;const m=model(h,field(1),field(1000),{diffusivityM2Yr:0,erodibilityMYr:0});
    m.mobileM[20]=10;const before=m.diagnostics().totalM;m.step();
    assert.ok(m.heightM[20]>0);assert.ok(m.mobileM[20]<10);near(m.oceanSedimentM,0);near(m.diagnostics().totalM,before);
});
test('ocean sediment is retained and coastal sea outlets do not lift solids onto high land',()=>{
    const h=field(10000),land=field(1);h[0]=100;land[1]=.5;
    const m=model(h,land,field(1000),{diffusivityM2Yr:0});m.mobileM[0]=10;
    const before=m.diagnostics().totalM;m.step();
    assert.ok(m.oceanSedimentM>0);assert.ok(m.heightM[1]<=h[1]);near(m.diagnostics().totalM,before,1e-9);
    const sea=model(field(0),field(0));sea.advance(100000);assert.ok(sea.heightM.every(x=>x===0));near(sea.diagnostics().totalM,0);
});
test('fixed steps converge with refinement and restore all history',()=>{
    const h=Float64Array.from({length:n},(_,i)=>500+200*Math.sin(i)),a=model(h),b=model(h),c=model(h);
    b.stepYears/=2;c.stepYears/=4;
    for(const [m,count] of [[a,50],[b,100],[c,200]] as const)for(let i=0;i<count;i++)m.step();
    const error=(m:GeomorphModel)=>m.heightM.reduce((s,x,i)=>s+Math.abs(x-c.heightM[i]),0);
    assert.ok(error(b)<error(a));const saved=a.checkpoint();a.step();a.restore(saved);assert.deepEqual(a.checkpoint(),saved);
});
test('small radius/extreme transport cap work and report only advanced years',()=>{
    const m=model(field(1000),field(.01),field(1e8),{erodibilityMYr:100,diffusivityM2Yr:1e7,settlingYears:1},10000);
    const result=m.advance(1e8);assert.equal(result.steps,32);assert.equal(result.limited,true);near(m.years,32*m.stepYears,1e-10);
    assert.ok(m.heightM.every(Number.isFinite)&&m.mobileM.every(x=>Number.isFinite(x)&&x>=0));
    near(m.diagnostics().residualMm,0,1e-6);
});
test('preview preserves authored ocean and detail, is periodic, finite at poles and exactly reversible',()=>{
    const p={grid,land:field(1),baseHeightM:field(1000),heightM:field(500)};
    near(previewElevation(.8,.25,.5,p),.4);near(previewElevation(-.8,.25,.5,p),-.8);
    for(const v of [0,.5,1])near(previewElevation(.8,0,v,p),previewElevation(.8,1,v,p));
    p.heightM=field(1000);near(previewElevation(.8,.333,.17,p),.8,1e-15);
    p.land.fill(0);near(previewElevation(.8,0,0,p),.8);near(previewElevation(.8,0,0,null),.8);
});
test('runtime freezes copied runoff, undoes entire steps and invalidates replaced climate sources',()=>{
    const rt=new ThermalRuntime(grid);rt.enabled=rt.waterEnabled=true;rt.setTerrain(field(1),Float64Array.from({length:n},(_,i)=>i%4/4));
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);rt.water!.dischargeM3S.fill(1000);
    const g=new GeomorphRuntime();g.capture(rt);const source=rt.water!.checkpoint(),initial=g.model!.checkpoint();
    g.advance(100000);assert.ok(g.model!.years>0);assert.deepEqual(rt.water!.checkpoint(),source);
    g.undo();assert.deepEqual(g.model!.checkpoint(),initial);assert.equal(g.canUndo,false);
    rt.water!.dischargeM3S.fill(5000);g.reconcile(rt);assert.ok(g.model!.dischargeM3S.every(x=>x===1000));
    g.setPreview(false);assert.equal(g.view!.preview,null);g.setPreview(true);assert.ok(g.view!.preview);
    rt.invalidate();rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,100,100);g.reconcile(rt);assert.equal(g.model,null);assert.equal(g.view,null);
});
