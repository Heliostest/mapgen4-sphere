import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const records=[];
for(const [hemisphere,letter] of [['north','N'],['south','S']])for(let month=1;month<=12;month++){
 const url=`https://noaadata.apps.nsidc.org/NOAA/G02135/${hemisphere}/monthly/data/${letter}_${String(month).padStart(2,'0')}_extent_v4.0.csv`;
 const r=await fetch(url);assert(r.ok,`${r.status}: ${url}`);const csv=await r.text(),lines=csv.trim().split(/\r?\n/);
 const rows=lines.slice(1).map(line=>line.split(',').map(s=>s.trim())).filter(a=>+a[0]>=1981&&+a[0]<=2010);
 assert.equal(rows.length,30);assert(rows.every(a=>+a[1]===month));
 const valid=rows.filter(a=>Number.isFinite(+a[4])&&+a[4]>=0&&Number.isFinite(+a[5])&&+a[5]>=0);assert(valid.length>=28);
 records.push({hemisphere,month,years:valid.length,missingYears:rows.filter(a=>!valid.includes(a)).map(a=>+a[0]),url,sha256:createHash('sha256').update(csv).digest('hex'),header:lines[0],extentMillionKm2:valid.reduce((s,a)=>s+(+a[4]),0)/valid.length,areaMillionKm2:valid.reduce((s,a)=>s+(+a[5]),0)/valid.length});
}
await writeFile('docs/evidence/earth-seaice-p1-20261011/nsidc-1981-2010.json',JSON.stringify({product:'NOAA/NSIDC Sea Ice Index, G02135 Version 4',doi:'https://doi.org/10.7265/a98x-0f50',citation:'Fetterer et al. (2025), Sea Ice Index, Version 4. Accessed 2026-10-11. Subset: January–December monthly hemispheric extent and area, years 1981–2010.',method:'Arithmetic monthly mean across valid years in the fixed 1981–2010 period; -9999 missing values excluded and listed. Extent/area are native hemispheric statistics. No remap to the model marine/shelf mask; this comparison cannot establish same-grid acceptance.',records},null,2)+'\n');
