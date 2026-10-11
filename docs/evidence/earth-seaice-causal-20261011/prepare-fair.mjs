import {readFile,writeFile} from 'node:fs/promises';
const file='build/earth-seaice-causal/integrate-factorial.mjs';
const s=await readFile(file,'utf8'),old='this.underIce ? Math.max(0, 1 - w2.land[i] - w2.inlandWaterFraction[i])';
if(s.split(old).length!==2)throw Error('Frozen baseline wet-mask pattern changed');
// Hold the pre-shortwave physical kernel fixed; repair just the confounding
// wet-mask difference discovered during independent review. Retain the
// original bundle and all original output files as rejected probe evidence.
await writeFile('build/earth-seaice-causal/integrate-factorial-sharedmask.mjs',s.replace(old,'this.underIce ? 1 - w2.land[i]'));
