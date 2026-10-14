import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createRemap,remapScalar} from '../earth-speedyweather-20261012/remap.mjs';

const source=fileURLToPath(new URL('.',import.meta.url)),root=resolve(source,'../../..'),out=resolve(root,'build/earth-speedy-moisture-monsoon');
const {decodeComparisonText}=await import(pathToFileURL(resolve(out,'comparison-contract.mjs')).href);
const text=await readFile(resolve(out,'comparison-display.json'),'utf8'),document=decodeComparisonText(text);
const specs=[['build/earth-speedy-budgets-sst','seasonal'],['build/earth-speedy-moisture-monsoon','moisture-seasonal'],['build/earth-speedy-moisture-monsoon','coupled-slab'],['build/earth-speedy-moisture-monsoon','coupled-seasonal']];
const sourceBindings=[];let exactValuesChecked=0;
const same=(actual,expected,label)=>{assert.equal(actual.length,expected.length,label);for(let i=0;i<actual.length;i++){assert(Number.isFinite(actual[i]),label);assert.equal(actual[i],expected[i],`${label}[${i}]`);exactValuesChecked++;}};
for(let ci=0;ci<document.cases.length;ci++){
    const [base,id]=specs[ci],paths=[`${base}/${id}-statistics.json`,`${base}/${id}-geometry.json`],buffers=await Promise.all(paths.map(p=>readFile(resolve(root,p))));
    sourceBindings.push(...buffers.map((b,i)=>({path:paths[i],sha256:createHash('sha256').update(b).digest('hex')})));
    const [j,g]=buffers.map(b=>JSON.parse(b)),map=createRemap(g),n=g.npoints;
    assert.equal(j.mode,['seasonal','seasonal','slab','seasonal'][ci]);
    assert.equal(g.stepS,1800);assert.equal(j.version,'0.23.0');assert.deepEqual(g.sigmaFull,[.0625,.1875,.3125,.4375,.5625,.6875,.8125,.9375]);assert.equal(j.statisticsStart,'2006-01-01T00:00:00');
    assert.equal(j.initialAtmLandSHA,document.initialAtmLandSHA);assert.equal(j.calls,105169);assert.equal(j.actualEnd,'2007-01-01T00:00:00');
    for(let k=0;k<12;k++){
        const m=j.monthly[k],f=document.cases[ci].data.frames[k];assert.equal(f.month,m.month);
        for(let l=0;l<8;l++)for(const [target,native]of [['temperatureK','temperatureK'],['windEastMps','u'],['windNorthMps','v']])same(f.layers[l][target],remapScalar(map,m.layers[native].slice(l*n,(l+1)*n)).values,`${id}/${k}/${l}/${target}`);
        same(f.surface.pressurePa,remapScalar(map,m.surface.pressurePa).values,`${id}/${k}/pressure`);
        same(f.surface.rainMmDay,Array.from(remapScalar(map,m.precipitationMm).values,v=>v/m.seconds*86400),`${id}/${k}/rain`);
        same(f.surface.seaIceConcentration,remapScalar(map,m.surface.seaIceConcentration,g.landFraction.map(v=>1-v)).values,`${id}/${k}/ice`);
    }
}
const cases=document.cases.map(scenario=>{
    let temperatureMinK=Infinity,temperatureMaxK=-Infinity,maxAbsWindComponentMps=0,temperatureOutsideColorRange=0;
    for(const frame of scenario.data.frames)for(const air of frame.layers)for(let k=0;k<air.temperatureK.length;k++){
        const temperature=air.temperatureK[k];
        temperatureMinK=Math.min(temperatureMinK,temperature);temperatureMaxK=Math.max(temperatureMaxK,temperature);
        maxAbsWindComponentMps=Math.max(maxAbsWindComponentMps,Math.abs(air.windEastMps[k]),Math.abs(air.windNorthMps[k]));
        if(temperature<193.15||temperature>333.15)temperatureOutsideColorRange++;
    }
    return {id:scenario.id,label:scenario.label,months:scenario.data.frames.map(f=>f.month),sigmaFull:scenario.data.sigmaFull,
        statisticsStart:scenario.data.model.statisticsStart,statisticsEnd:scenario.data.model.statisticsEnd,
        temperatureMinK,temperatureMaxK,maxAbsWindComponentMps,temperatureOutsideColorRange};
});
const verifierSHA256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
const report={status:'PASS',schemaValidated:true,realMonthlyDataChecked:true,exactValuesChecked,sourceBindings,verifierSHA256,browserChecked:false,input:'build/earth-speedy-moisture-monsoon/comparison-display.json',
    inputSHA256:createHash('sha256').update(text).digest('hex'),initialAtmLandSHA:document.initialAtmLandSHA,initialStockYear:2001,statisticsYear:2006,cases};
await writeFile(resolve(out,'viewer-display-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
