import {execFileSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='e3222280a0ceddd597245f3c45d75f75d2def9f5',out='build/earth-seaice-p1';
await mkdir(out,{recursive:true});
const bindings=[];
for(const file of ['geometry.ts','terrain-water-view.ts']){
 const bytes=execFileSync('git',['show',`${base}:${file}`]),sha256=createHash('sha256').update(bytes).digest('hex');
 let s=bytes.toString('utf8').replaceAll('"./','"../../').replaceAll("'./","'../../");
 if(file==='terrain-water-view.ts')s=s.replace("'../../geometry.ts'","'./geometry-before.ts'");
 await writeFile(`${out}/${file.replace('.ts','-before.ts')}`,s);bindings.push({base,file,sha256});
}
await writeFile('docs/evidence/earth-seaice-p1-20261011/performance-baseline.json',JSON.stringify(bindings,null,2)+'\n');
