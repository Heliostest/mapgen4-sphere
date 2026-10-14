import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const path=process.argv[2]??'build/earth-speedy-transport/implicit-split-startup-probe.json';
const result=JSON.parse(readFileSync(path,'utf8'));
assert.equal(result.rows.length,3);
for(const row of result.rows)assert.equal(row.maxDifferenceK,0,
 `Dynamics reference capture must match V2 at counter ${row.counter}, span ${row.dt}s`);
console.log(JSON.stringify({passed:true,path,checks:4}));
