import {chromium} from 'file:///C:/Users/helio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder='build/validation/initial-capture-isolate';await mkdir(folder,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1440,height:1300}});
await p.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.present=()=>new Promise(r=>raf(()=>raf(r)));let now=0,id=0;const cb=new Map();Object.defineProperty(performance,'now',{value:()=>now});window.requestAnimationFrame=f=>{cb.set(++id,f);return id};window.cancelAnimationFrame=id=>cb.delete(id);window.frames=()=>{for(let i=0;i<2;i++){now+=16;const batch=[...cb.values()];cb.clear();for(const f of batch)f(now)}};});
const frames=()=>p.evaluate(()=>window.frames());
const click=async id=>{await p.locator('#'+id).evaluate(e=>e.click());await frames();};
const input=async(id,value)=>{await p.locator('#'+id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('change',{bubbles:true}));},value);await frames();};
const shot=async name=>{const bytes=await p.locator('#mapgen4').screenshot({path:folder+'/'+name+'.png'});console.log(name,createHash('sha256').update(bytes).digest('hex'));};
try{
 await p.goto('http://localhost:8002/embed.html?mode=editor&preview=circulation');await p.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false',{},{polling:50});await frames();await shot('original');
 await click('planet-generate-climate');await click('environment-circulation');await input('planet-speed',864000);await click('environment-compare');await click('environment-capture');await click('environment-close');await input('planet-layer','wind');await frames();await p.evaluate(()=>window.present());await shot('native');
 await p.evaluate(()=>document.querySelector('#mapgen4').getContext('webgl2').finish());await p.evaluate(()=>window.present());await shot('finished');
 await input('planet-layer','wind');await p.evaluate(()=>window.present());await shot('redraw');
 console.log(await p.evaluate(()=>{const gl=document.querySelector('#mapgen4').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return {layer:document.querySelector('#planet-layer').value,play:document.querySelector('#planet-play').textContent,legend:document.querySelector('#planet-legend').textContent,renderer:gl.getParameter(e.UNMASKED_RENDERER_WEBGL),vendor:gl.getParameter(e.UNMASKED_VENDOR_WEBGL),dither:gl.isEnabled(gl.DITHER),version:gl.getParameter(gl.VERSION)}}));
}finally{await b.close();}
