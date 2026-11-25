import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreMap} from './prepare.ts';
import {defaultTerrainParameters} from '../../terrain-parameters.ts';
import {SphericalConstraints} from '../../spherical-constraints.ts';
import {makeSphereMesh} from '../../sphere-mesh.ts';
import {validateSupportedWorld} from './data.ts';

test('ordinary generated terrain keeps the same carved river beds as production loading',()=>{
 const parameters=defaultTerrainParameters(),c=new SphericalConstraints();c.setElevationParam(parameters.elevation);
 const {mesh,t_peaks}=makeSphereMesh(2000,35,12345);
 const terrain:any={parameters,constraints:{size:c.size,values:Array.from(c.elevation)},offsets:null,report:null};
 const generated=restoreMap(mesh,t_peaks,terrain);
 const imported=restoreMap(mesh,t_peaks,{...terrain,report:{importedFrom:'test fixture'}});
 let carved=0,max=0;
 for(let k=0;k<mesh.numTriangles;k++){const d=imported.elevation_t[k]-generated.elevation_t[k];if(d>0){carved++;max=Math.max(max,d);}}
 assert.equal(carved,164);assert.ok(Math.abs(max-.09017734229564667)<1e-9);
});
test('unsupported input configurations fail before running a model year',()=>{
 const value={mesh:{spacing:2.75},runtime:{enabled:true,waterEnabled:true,grid:{width:48,height:24}}};
 assert.doesNotThrow(()=>validateSupportedWorld(value));
 for(const bad of [{...value,runtime:{...value.runtime,enabled:false}},{...value,runtime:{...value.runtime,waterEnabled:false}},{...value,runtime:{...value.runtime,grid:{width:64,height:32}}},{...value,mesh:{spacing:3}}])assert.throws(()=>validateSupportedWorld(bad));
});
