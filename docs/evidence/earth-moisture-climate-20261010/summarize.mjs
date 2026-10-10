import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const directory=new URL('./',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,directory),'utf8'));
for(const label of ['before','after']){
 const d=await read(`${label}-continuous.json`),s=d.samples.at(-1);
 console.log(JSON.stringify({label,day:s.modelDay,steps:s.steps,inputSha256:d.inputSha256,bundledCodeSha256:d.bundledCodeSha256,terrainHashes:d.terrainHashes,budget:s.budget,points:s.points.map(p=>({name:p.name,rainMm:p.cumulativeRainMm,evapMm:p.cumulativeEvapMm,referenceRainMm:p.referenceRainMmYear,soilMm:p.soilMm,meanSoilMm:p.meanSoilMm,biome:p.biome,airC:p.annualMeanAirC,landC:p.annualMeanLandC,oceanC:p.annualMeanOceanC,summerRainMm:p.monthlyRainMm.slice(3,6).reduce((a,b)=>a+b,0),winterRainMm:p.monthlyRainMm.slice(9,12).reduce((a,b)=>a+b,0)}))},null,2));
}
const r=await read('reference-validation.json');
console.log(JSON.stringify({normal:r.normal,half:r.half,inputMatches:r.inputSha256===createHash('sha256').update(await readFile(new URL('../../../build/earth-moisture-climate/experimental-input.json',directory))).digest('hex'),points:r.points.map(p=>[p.name,p.normalRainMmYear,p.halfRainMmYear])},null,2));
