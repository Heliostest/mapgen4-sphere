import {planet_fragment} from '../planet-render.ts';

// Use the actual production shader, with literal expected colors/irradiance.
const output=document.querySelector('pre')!;
try {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const gl=canvas.getContext('webgl2',{antialias:false})!;
    if(!gl) throw new Error('WebGL2 unavailable');
    const compile=(type:number,source:string)=>{
        const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)!);
        return shader;
    };
    const program=gl.createProgram()!;
    gl.attachShader(program,compile(gl.VERTEX_SHADER,`#version 300 es
        void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}`));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`#version 300 es
        precision highp float;
        ${planet_fragment}
        uniform vec3 u_normal; uniform int u_test_flux;
        out vec4 color;
        void main(){color=vec4(u_test_flux==1 ? vec3(planet_cosine(u_normal)) : planet_color(vec3(.4,.6,.8),u_normal),1);}`));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)!);
    gl.useProgram(program);gl.bindVertexArray(gl.createVertexArray());
    gl.uniform3fv(gl.getUniformLocation(program,'u_sun_direction'),[0,0,1]);
    let checks=0;
    const check=(mode:number,normal:number[],flux:boolean,expected:number[])=>{
        gl.uniform1i(gl.getUniformLocation(program,'u_planet_layer'),mode);
        gl.uniform1i(gl.getUniformLocation(program,'u_test_flux'),+flux);
        gl.uniform3fv(gl.getUniformLocation(program,'u_normal'),normal);
        gl.drawArrays(gl.TRIANGLES,0,3);
        const actual=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,actual);
        expected.forEach((v,i)=>{if(Math.abs(actual[i]-v*255)>1.1) throw new Error(`Mode ${mode}, normal ${normal}, expected ${expected}, actual ${actual}`);});
        if(actual[3]!==255) throw new Error('Coverage alpha changed');
        checks++;
    };
    check(0,[0,0,-1],false,[.4,.6,.8]);
    check(0,[1,0,0],false,[.4,.6,.8]);
    check(1,[0,0,1],false,[.4,.6,.8]);
    check(1,[0,0,-1],false,[.072,.108,.144]);
    check(0,[0,0,1],true,[1,1,1]);
    check(0,[0,0,-1],true,[0,0,0]);
    check(0,[1,0,0],true,[0,0,0]);
    check(0,[Math.sqrt(.75),0,.5],true,[.5,.5,.5]);
    check(2,[0,0,1],false,[.95,.35,.12]);
    check(2,[0,0,-1],false,[.08,.12,.22]);
    if(gl.getError()!==gl.NO_ERROR) throw new Error('WebGL error');
    output.textContent=JSON.stringify({status:'PASS',checks},null,2);
} catch(error) { output.textContent=`FAIL\n${error.stack || error}`; }
