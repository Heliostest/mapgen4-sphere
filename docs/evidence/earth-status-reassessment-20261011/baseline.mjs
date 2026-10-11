import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='docs/evidence/earth-status-reassessment-20261011';
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const browser=JSON.parse(fs.readFileSync(`${dir}/browser-audit.json`,'utf8'))[0];
const files=['build/_bundle.js','build/_worker.js','build/version.json','scenes/earth-land-sea/earth-simulation.json','scenes/earth-land-sea/earth-terrain.json','scenes/earth-land-sea/scene-config.json'];
const hashes=files.map(path=>{const b=fs.readFileSync(path),browserHash=browser.hashes['/'+path];return {path,bytes:b.length,sha256:sha(b),...(browserHash?{browserHash,browserBytesMatch:sha(b)===browserHash.sha256}:{} )};});
if(hashes.some(f=>f.browserBytesMatch===false))throw Error('Browser/server bytes differ from workspace');
const ancestors=['D:/AGENTS.md','D:/ws/AGENTS.md','D:/ws/app/AGENTS.md','D:/ws/app/mapgen4/AGENTS.md','D:/ws/app/mapgen4/mapgen4-sphere/AGENTS.md'];
let subAgentFiles='';
try {subAgentFiles=execFileSync('rg',['--files','--hidden','-g','AGENTS.md','-g','!node_modules','-g','!.git'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
catch(error){if(error.status!==1)throw error;}
const baseline={createdAtUtc:new Date().toISOString(),cwd:process.cwd(),head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),remotes:git('remote','-v'),liveOriginMain:git('ls-remote','origin','refs/heads/main'),initialWorkingTree:'Clean main...origin/main observed before evidence creation; no tracked files modified by this reassessment.',currentStatus:git('status','--short'),agentInstructions:{ancestorPaths:ancestors.map(path=>({path,exists:fs.existsSync(path)})),repositoryFiles:subAgentFiles},service:{port:8002,initial:'No listener observed; first real Chrome request ERR_CONNECTION_REFUSED.',started:'npm run build; PORT=8002 node scripts/serve.mjs from actual repository',host:'127.0.0.1',cacheControl:'no-store',ports8000And8001:'No listener observed at initial inspection; neither started, stopped nor modified.'},buildVersion:JSON.parse(fs.readFileSync('build/version.json','utf8')),hashes,initialBrowserControls:browser.inputs,viewport:browser.viewport,userAgent:browser.userAgent};
fs.writeFileSync(`${dir}/baseline.json`,JSON.stringify(baseline,null,2)+'\n');
console.log(JSON.stringify({head:baseline.head,originMain:baseline.liveOriginMain,browserBytesMatch:true,status:baseline.currentStatus}));
