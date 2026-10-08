import Renderer from '../render.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';

// Use the renderer's real outline texture, including its format and sampler.
// A smooth change of fractional sample position must not snap to a new texel:
// radial/diagonal outline taps otherwise create stationary diamond boundaries.
const output=document.querySelector('pre')!;
try {
    const renderer=new Renderer(makeSphereMesh(120,35,12345).mesh);
    const {webgl,fbo_depth}=renderer, {gl}=webgl;
    gl.activeTexture(gl.TEXTURE0);
    fbo_depth.texture!.bind();
    const ramp=Float32Array.from({length:16},(_,i)=>.1+.1*(i%4)+.1*Math.floor(i/4));
    gl.texSubImage2D(gl.TEXTURE_2D,0,100,100,4,4,gl.RED,gl.FLOAT,ramp);

    const samples=257;
    const result=webgl.createFramebuffer(samples,1,{internalFormat:gl.R32F,filter:'nearest'});
    const probe=webgl.createProgram('outline-continuity-test',`
        precision highp float;
        void main() {
            vec2 p=vec2(gl_VertexID==1?3.0:-1.0,gl_VertexID==2?3.0:-1.0);
            gl_Position=vec4(p,0,1);
        }`,`
        precision highp float;
        uniform sampler2D u_depth;
        uniform vec2 u_axis;
        out vec4 color;
        void main() {
            float t=(gl_FragCoord.x-0.5)/256.0;
            vec2 uv=(vec2(100.5)+u_axis*t)/vec2(textureSize(u_depth,0));
            color=vec4(texture(u_depth,uv).x,0,0,1);
        }`,()=>{});
    const report=[];
    for (const axis of [[1,0],[0,1],[1,1]]) {
        renderer.drawGeneric(probe,result,()=>{
            fbo_depth.texture!.activate(gl.TEXTURE0,probe.u_depth);
            gl.uniform2fv(probe.u_axis,axis);
            gl.drawArrays(gl.TRIANGLES,0,3);
        });
        const values=new Float32Array(samples);
        gl.readPixels(0,0,samples,1,gl.RED,gl.FLOAT,values);
        let maxJump=0,maxError=0;
        for(let i=0;i<samples;i++) {
            const expected=.1+.1*(axis[0]+axis[1])*i/(samples-1);
            maxError=Math.max(maxError,Math.abs(values[i]-expected));
            if(i) maxJump=Math.max(maxJump,Math.abs(values[i]-values[i-1]));
        }
        report.push({axis,maxJump,maxError});
    }
    if(gl.getError()!==gl.NO_ERROR) throw new Error('WebGL error during outline probe');
    const pass=report.every(r=>r.maxJump<.002 && r.maxError<.001);
    output.textContent=JSON.stringify({status:pass?'PASS':'FAIL',samples:samples*report.length,report},null,2);
} catch(error) {
    output.textContent=`FAIL\n${error.stack || error}`;
}
