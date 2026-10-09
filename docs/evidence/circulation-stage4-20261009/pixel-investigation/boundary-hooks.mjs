export function initBoundary() {
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
}
