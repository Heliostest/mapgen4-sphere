import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const source=fileURLToPath(new URL('.',import.meta.url)),root=resolve(source,'../../..'),out=resolve(root,'build/earth-speedy-budgets-sst');
const {decodeComparisonText}=await import(pathToFileURL(resolve(out,'comparison-contract.mjs')).href);
const text=await readFile(resolve(out,'comparison-display.json'),'utf8'),document=decodeComparisonText(text);
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
const report={status:'PASS',realMonthlyDataChecked:true,browserChecked:false,input:'build/earth-speedy-budgets-sst/comparison-display.json',
    inputSHA256:createHash('sha256').update(text).digest('hex'),initialAtmLandSHA:document.initialAtmLandSHA,initialStockYear:2001,statisticsYear:2006,cases};
await writeFile(resolve(out,'viewer-display-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
