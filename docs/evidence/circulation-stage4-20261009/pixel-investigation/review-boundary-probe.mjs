import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=process.env.CIRCULATION_FOLDER||'build/validation/circulation';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:1300}}),errors=[],checks=[],pixelChecks=[];
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const rawCaptures={};
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(({gpuProbe,noDither})=>{
    let now=0,id=0;const callbacks=new Map();Object.defineProperty(performance,'now',{value:()=>now});
    window.requestAnimationFrame=cb=>{callbacks.set(++id,cb);return id;};window.cancelAnimationFrame=id=>callbacks.delete(id);
    window.advanceFrames=(n,dt)=>{for(let i=0;i<n;i++){now+=dt;const batch=[...callbacks.values()];callbacks.clear();for(const cb of batch)cb(now);}};
    if(gpuProbe||noDither){const draw=WebGL2RenderingContext.prototype.drawArrays;WebGL2RenderingContext.prototype.drawArrays=function(...args){if(noDither)this.disable(this.DITHER);draw.apply(this,args);if(gpuProbe&&this.getParameter(this.FRAMEBUFFER_BINDING)===null&&document.querySelector('#planet-play')?.textContent==='Play'){window.lastDrapeTexture=this.getParameter(this.TEXTURE_BINDING_2D);if(gpuProbe==='1'){const data=new Uint8Array(this.canvas.width*this.canvas.height*4);this.readPixels(0,0,this.canvas.width,this.canvas.height,this.RGBA,this.UNSIGNED_BYTE,data);window.lastPausedGPU=data;}}};}
},{gpuProbe:process.env.CIRCULATION_GPU_PROBE||'',noDither:process.env.CIRCULATION_NO_DITHER==='1'});
await page.addInitScript(function initBoundary() {
    const proto=WebGL2RenderingContext.prototype,original={},meta=new WeakMap();let serial=0;
    const state={context:null,program:null,vao:null,buffer:null,active:0,textures:new Map(),framebuffer:null,draws:0,lastDrape:null,lastFinal:null};
    const object=o=>{if(!o)return null;if(!meta.has(o))meta.set(o,{id:++serial});return meta.get(o);};
    const bytes=data=>typeof data==='number'?new Uint8Array(data):data?new Uint8Array(data.buffer??data,data.byteOffset??0,data.byteLength??data.length).slice():null;
    function hook(name,callback){original[name]=proto[name];proto[name]=function(...args){const result=original[name].apply(this,args);callback.call(this,args,result);return result;};}
    for(const name of ['createTexture','createFramebuffer','copyTexSubImage2D','readPixels','deleteFramebuffer','deleteTexture'])original[name]=proto[name];
    hook('bindTexture',([target,value])=>{if(target===3553)state.textures.set(state.active,value);});
    hook('activeTexture',([value])=>{state.active=value-33984;});
    hook('texStorage2D',([target,levels,format,width,height])=>Object.assign(object(state.textures.get(state.active)),{format,width,height,bytes:new Uint8Array(width*height*(format===33325?2:4))}));
    hook('texSubImage2D',args=>{
        const [target,level,x,y,width,height,format,type,data]=args,t=object(state.textures.get(state.active));
        if(data&&ArrayBuffer.isView(data)){const dataBytes=bytes(data),stride=t.width*4,updated=t.bytes.slice();for(let row=0;row<height;row++)updated.set(dataBytes.subarray(row*width*4,(row+1)*width*4),(y+row)*stride+x*4);t.bytes=updated;}
    });
    hook('bindBuffer',([target,value])=>{if(target===34962)state.buffer=value;});
    hook('bufferData',([target,data])=>{if(target===34962)object(state.buffer).bytes=bytes(data);});
    hook('bufferSubData',([target,offset,data])=>{if(target===34962){const m=object(state.buffer),updated=m.bytes.slice();updated.set(bytes(data),offset);m.bytes=updated;}});
    hook('bindVertexArray',([value])=>{state.vao=value;});
    hook('vertexAttribPointer',([index,size,type,normalized,stride,offset])=>{const v=object(state.vao);(v.attributes??={})[index]={buffer:state.buffer,size,type,normalized,stride,offset};});
    hook('useProgram',([value])=>{state.program=value;});
    hook('getUniformLocation',([program,name],location)=>{if(location)Object.assign(object(location),{program,name});});
    for(const name of ['uniform1f','uniform1i','uniform2fv','uniform3fv','uniformMatrix4fv'])hook(name,args=>{
        const location=object(args[0]);if(!location)return;const value=args.at(-1),u=object(location.program);(u.uniforms??={})[location.name]=ArrayBuffer.isView(value)||Array.isArray(value)?Array.from(value,Math.fround):name==='uniform1i'?value:Math.fround(value);
    });
    hook('bindFramebuffer',([target,value])=>{if(target===36160||target===36009)state.framebuffer=value;});
    hook('framebufferTexture2D',([target,attachment,textarget,texture])=>{if(attachment===36064)object(state.framebuffer).texture=texture;});
    hook('drawArrays',function(args){
        state.context=this;state.draws++;const p=object(state.program),f=object(state.framebuffer);
        if(p?.uniforms?.u_surface!==undefined&&f){
            const uniforms=structuredClone(p.uniforms),attributes=Object.values(object(state.vao).attributes??{}).map(a=>({...a,bufferId:object(a.buffer).id,bytes:object(a.buffer).bytes}));
            const textures=Object.fromEntries(Object.entries(uniforms).filter(([key,value])=>key.startsWith('u_')&&Number.isInteger(value)&&state.textures.has(value)).map(([key,value])=>{const texture=state.textures.get(value),m=object(texture);return [key,{texture,id:m.id,width:m.width,height:m.height,format:m.format,bytes:m.bytes}];}));
            state.lastDrape={counter:state.draws,programId:p.id,mode:uniforms.u_planet_layer,uniforms,attributes,textures,outputTexture:f.texture};
        }else if(!f)state.lastFinal={counter:state.draws,uniforms:structuredClone(p.uniforms??{})};
    });
    const captures=new Map(),hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
    window.boundaryCapture=async name=>{
        const frame=state.lastDrape,gl=state.context,snapshot={counter:frame.counter,finalCounter:state.lastFinal?.counter,mode:frame.mode,programId:frame.programId,uniforms:frame.uniforms,attributes:[],textures:{},copies:{}};
        for(const a of frame.attributes){const {bytes,buffer,...other}=a;snapshot.attributes.push({...other,hash:await hash(bytes)});}
        for(const [key,t] of Object.entries(frame.textures)){if(!['u_temperature','u_hydrology','u_surface','u_elevation','u_water','u_depth'].includes(key))continue;snapshot.textures[key]={id:t.id,width:t.width,height:t.height,format:t.format,uploadHash:t.bytes?await hash(t.bytes):null};}
        if(['saved','restored','uninterrupted','resumed'].includes(name)){
            const entries=[['land',frame.textures.u_elevation],['rivers',frame.textures.u_water],['depth',frame.textures.u_depth],['surface',frame.textures.u_surface],['drape',{texture:frame.outputTexture,...object(frame.outputTexture)}]],bound=state.textures.get(state.active),previous=state.framebuffer;
            for(const [key,t] of entries){const fb=original.createFramebuffer.call(gl),copy=original.createTexture.call(gl);original.bindFramebuffer.call(gl,gl.FRAMEBUFFER,fb);original.framebufferTexture2D.call(gl,gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.texture,0);original.bindTexture.call(gl,gl.TEXTURE_2D,copy);original.texStorage2D.call(gl,gl.TEXTURE_2D,1,t.format,t.width,t.height);original.copyTexSubImage2D.call(gl,gl.TEXTURE_2D,0,0,0,0,0,t.width,t.height);original.deleteFramebuffer.call(gl,fb);snapshot.copies[key]={texture:copy,width:t.width,height:t.height,format:t.format};}
            original.bindTexture.call(gl,gl.TEXTURE_2D,bound);original.bindFramebuffer.call(gl,gl.FRAMEBUFFER,previous);
        }
        captures.set(name,snapshot);return {...snapshot,copies:Object.fromEntries(Object.entries(snapshot.copies).map(([key,{texture,...v}])=>[key,v]))};
    };
    window.boundaryPair=async names=>{
        const gl=state.context,previous=state.framebuffer,report={names,inputs:names.map(name=>{const s=captures.get(name);return {counter:s.counter,finalCounter:s.finalCounter,mode:s.mode,programId:s.programId,uniforms:s.uniforms,attributes:s.attributes,textures:s.textures};}),outputs:{}};
        for(const key of Object.keys(captures.get(names[0]).copies)){
            const fields=[];
            for(const name of names){const t=captures.get(name).copies[key],fb=original.createFramebuffer.call(gl);original.bindFramebuffer.call(gl,gl.FRAMEBUFFER,fb);original.framebufferTexture2D.call(gl,gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.texture,0);const field=t.format===gl.R16F?new Float32Array(t.width*t.height):new Uint8Array(t.width*t.height*4);original.readPixels.call(gl,0,0,t.width,t.height,t.format===gl.R16F?gl.RED:gl.RGBA,t.format===gl.R16F?gl.FLOAT:gl.UNSIGNED_BYTE,field);fields.push(field);original.deleteFramebuffer.call(gl,fb);}
            let changed=0,max=0;const points=[];for(let i=0;i<fields[0].length;i++){const d=Math.abs(fields[0][i]-fields[1][i]);if(d){changed++;max=Math.max(max,d);if(points.length<12)points.push({index:i,a:fields[0][i],b:fields[1][i]});}}
            report.outputs[key]={hashes:await Promise.all(fields.map(field=>hash(field.buffer))),changed,max,points};
        }
        original.bindFramebuffer.call(gl,gl.FRAMEBUFFER,previous);return report;
    };
});
const frames=(n=2,dt=16)=>page.evaluate(([n,dt])=>window.advanceFrames(n,dt),[n,dt]);
const click=async id=>{await page.locator('#'+id).evaluate(e=>e.click());await frames();};
const input=async(id,value)=>{await page.locator('#'+id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event(e.type==='range'?'input':'change',{bubbles:true}));},value);await frames();};
const save=async name=>{const pending=page.waitForEvent('download');pending.catch(()=>{});await click('simulation-save');assert.doesNotMatch(await page.locator('#terrain-file-status').textContent(),/Save failed/);await (await pending).saveAs(`${folder}/${name}.json`);return JSON.parse(await readFile(`${folder}/${name}.json`,'utf8'));};
const load=async d=>{await page.locator('#terrain-load').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await page.waitForFunction(()=>!/Reading|Preparing/.test(document.querySelector('#terrain-file-status').textContent),{},{polling:50});await frames();return page.locator('#terrain-file-status').textContent();};
const officialGlobe=async name=>{
    await frames();const png=await page.locator('#mapgen4').screenshot({path:`${folder}/${name}.png`});
    if(process.env.CIRCULATION_GPU_PROBE){rawCaptures[name]=await page.evaluate(async mode=>{
        const c=document.querySelector('#mapgen4'),r=c.getBoundingClientRect(),gl=c.getContext('webgl2');let data=window.lastPausedGPU;
        if(mode==='copy'){const previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),bound=gl.getParameter(gl.TEXTURE_BINDING_2D),source=gl.createFramebuffer(),texture=gl.createTexture();gl.bindFramebuffer(gl.FRAMEBUFFER,source);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,window.lastDrapeTexture,0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.copyTexImage2D(gl.TEXTURE_2D,0,gl.RGBA,0,0,c.width,c.height,0);gl.bindTexture(gl.TEXTURE_2D,bound);gl.bindFramebuffer(gl.FRAMEBUFFER,previous);gl.deleteFramebuffer(source);(window.gpuCopies??=[]).push({texture,width:c.width,height:c.height});return {stage:'drape copied after PNG; no CPU readback',canvas:[c.width,c.height],rect:{x:r.x,y:r.y,width:r.width,height:r.height}};}
        if(mode==='drape'){const previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,window.lastDrapeTexture,0);data=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.bindFramebuffer(gl.FRAMEBUFFER,previous);gl.deleteFramebuffer(fb);}
        const hash=await crypto.subtle.digest('SHA-256',data);return {stage:mode==='drape'?'drape after PNG':'paused default framebuffer',gpuHash:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join(''),canvas:[c.width,c.height],rect:{x:r.x,y:r.y,width:r.width,height:r.height},scroll:[scrollX,scrollY]};
    },process.env.CIRCULATION_GPU_PROBE);await writeFile(`${folder}/gpu-captures.json`,JSON.stringify(rawCaptures,null,2));}
    return png;
};
const boundaryCaptures={};
const globe=async name=>{const png=await officialGlobe(name);boundaryCaptures[name]=await page.evaluate(name=>window.boundaryCapture(name),name);await writeFile(folder+'/boundary-captures.json',JSON.stringify(boundaryCaptures,null,2));return png;};
// Retain both original PNGs, decoded statistics and scheduling state on failure.
// PNG byte equality remains the acceptance requirement; decoding is diagnostic.
const officialExactPixels=async(label,a,b)=>{
    const diff=await page.evaluate(async images=>{
        const pixels=[];let width=0,height=0;
        for(const data of images){const img=await createImageBitmap(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'}));const c=document.createElement('canvas');c.width=width=img.width;c.height=height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);pixels.push(ctx.getImageData(0,0,width,height).data);img.close();}
        let channels=0,max=0;for(let i=0;i<pixels[0].length;i++){const d=Math.abs(pixels[0][i]-pixels[1][i]);if(d)channels++;max=Math.max(max,d);}
        return {width,height,channels,max};
    },[a.toString('base64'),b.toString('base64')]);
    pixelChecks.push({label,pngEqual:a.equals(b),sha256:[a,b].map(v=>createHash('sha256').update(v).digest('hex')),decoded:diff,ui:await page.evaluate(()=>({now:performance.now(),age:document.querySelector('#thermal-age').dataset.days,play:document.querySelector('#planet-play').textContent,layer:document.querySelector('#planet-layer').value,status:document.querySelector('#terrain-file-status').textContent}))});
    if(process.env.CIRCULATION_GPU_PROBE==='copy'){
        const names=label==='49-day restore'?['saved','restored']:label==='98-day continuation'?['uninterrupted','resumed']:['original','original-restored'],keys=Object.keys(rawCaptures),indices=names.map(n=>keys.indexOf(n));
        pixelChecks.at(-1).drapeSha256=await page.evaluate(async indices=>{const gl=document.querySelector('#mapgen4').getContext('webgl2'),previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),result=[];for(const i of indices){const {texture,width,height}=window.gpuCopies[i],fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);const data=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);const hash=await crypto.subtle.digest('SHA-256',data);result.push(Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join(''));gl.deleteFramebuffer(fb);}gl.bindFramebuffer(gl.FRAMEBUFFER,previous);return result;},indices);
    }
    await writeFile(`${folder}/pixel-checks.json`,JSON.stringify(pixelChecks,null,2));
    assert.ok(a.equals(b),`${label}: ${JSON.stringify(pixelChecks.at(-1))}`);
};
const exactPixels=async(label,a,b)=>{const names=label==='49-day restore'?['saved','restored']:label==='98-day continuation'?['uninterrupted','resumed']:null;if(names){const report=await page.evaluate(names=>window.boundaryPair(names),names);await writeFile(folder+'/boundary-'+(label.startsWith('49')?'49':'98')+'.json',JSON.stringify(report,null,2));}return officialExactPixels(label,a,b);};
const evolve=async()=>{await click('planet-play');await frames(120,50);await click('planet-play');};
try {
    await page.goto((process.env.BASE_URL||'http://localhost:8002')+'/embed.html?mode=editor&preview=circulation');await page.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false',{},{polling:50});await frames();
    const original=await globe('original');await click('planet-generate-climate');await click('environment-circulation');await input('planet-speed',864000);
    await click('environment-compare');await click('environment-capture');await click('environment-close');
    await input('planet-layer','wind');await globe('initial-wind');await input('planet-layer','surface');
    const initial=await save('initial');assert.ok(initial.runtime.state.circulation.ocean.circulationMps.every(v=>v===0));
    await evolve();const saved=await save('saved'),pixels=await globe('saved'),state=saved.runtime.state.circulation;
    assert.ok(state.atmosphere.eastMps.some(v=>Math.abs(v)>.01));assert.ok(state.ocean.circulationMps.some(v=>Math.abs(v)>.00001));
    assert.notDeepEqual(saved.runtime.state.water.windEastMps,initial.runtime.state.water.windEastMps);
    const diagnostics=await page.locator('#environment-wind-state').textContent(),budgets={water:Number(await page.locator('#water-budget').getAttribute('data-value')),energy:Number(await page.locator('#environment-energy').getAttribute('data-value'))};
    assert.ok(Math.abs(budgets.water)<1e-6);assert.ok(Math.abs(budgets.energy)<1e-4,JSON.stringify(budgets));
    checks.push('Actual wind perturbations and closed ocean-loop memory evolve for 49 days with finite conserved water and enthalpy');
    await input('planet-layer','wind');await globe('evolved-wind');await input('planet-layer','surface');
    await evolve();const uninterrupted=await save('uninterrupted'),future=await globe('uninterrupted');
    await click('environment-circulation');assert.match(await load(saved),/Complete simulation restored/);assert.equal(await page.locator('#environment-circulation').isChecked(),true);
    assert.deepEqual((await save('restored')).runtime,saved.runtime);await exactPixels('49-day restore',pixels,await globe('restored'));
    await evolve();const resumed=await save('resumed');assert.deepEqual(resumed.runtime,uninterrupted.runtime);await exactPixels('98-day continuation',future,await globe('resumed'));
    checks.push('Downloaded and uploaded wind/ocean memory resumes to identical fields and globe pixels after 98 days');
    for(const mutate of [d=>d.runtime.state.circulation.ocean.circulationMps[0]=99,d=>d.runtime.state.circulation.atmosphere.eastMps.pop(),d=>delete d.runtime.state.circulation]) {
        const bad=structuredClone(saved);mutate(bad);assert.match(await load(bad),/Load failed/);assert.deepEqual((await save('after-invalid')).runtime,resumed.runtime);
    }
    await click('environment-compare');await input('environment-map','currents');await page.screenshot({path:`${folder}/comparison.png`});await click('environment-close');
    await input('planet-layer','wind');await globe('wind');await input('planet-layer','original');await exactPixels('Original',original,await globe('original-restored'));
    checks.push('Invalid enabled circulation is rejected atomically; current comparison, wind map and Original remain available');
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${folder}/mobile.png`});
    await click('water-enabled');const dry=await save('thermal-only');assert.equal(dry.runtime.state.circulation,null);assert.match(await load(dry),/Complete simulation restored/);assert.deepEqual((await save('thermal-only-restored')).runtime,dry.runtime);
    checks.push('Mobile controls fit; disabling water removes active circulation while thermal-only save still restores');
    assert.deepEqual(errors,[]);const report={status:'PASS',sourceCommit,checks,errors,budgets,diagnostics,steps:[saved.runtime.state.thermal.steps,resumed.runtime.state.thermal.steps],pixelChecks};await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){await writeFile(`${folder}/failure.json`,JSON.stringify({status:'FAIL',sourceCommit,error:e.stack,checks,errors,pixelChecks},null,2));throw e;
}finally{if(errors.length)console.log(JSON.stringify({errors}));await browser.close();}
