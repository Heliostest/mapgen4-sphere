import {readFile,writeFile} from 'node:fs/promises';
import {matchedSupport} from '../../../climate-diagnostics.ts';
const d=JSON.parse(await readFile('scenes/earth-land-sea/earth-simulation.json','utf8')).runtime;
const grid={...d.grid,count:d.grid.width*d.grid.height};
const obs=JSON.parse(await readFile('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','utf8'));
const old=JSON.parse(await readFile('docs/evidence/earth-east-asia-mechanisms-20261015/shared-core.json','utf8'));
const support=old.gpcc.map(r=>({name:r.name,bounds:r.bounds,weights:Array.from(matchedSupport(grid,d.state.land,r.bounds,obs.cells).weights)}));
await writeFile('build/earth-monsoon-forcing/support.json',JSON.stringify({land:d.state.land,support}));
