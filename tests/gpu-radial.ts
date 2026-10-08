import {mat4, vec3} from 'gl-matrix';
import {sphere_vertex} from '../render.ts';
import {sphereProjection, terrainPosition} from '../sphere-view.ts';

// Exercise the actual shader shared by the depth and drape passes, rather
// than a second implementation of displacement in test code.
const output=document.querySelector('pre')!;
try {
    const gl=document.createElement('canvas').getContext('webgl2');
    if (!gl) throw new Error('WebGL2 unavailable');
    function shader(type: number, source: string) {
        const s=gl!.createShader(type)!;
        gl!.shaderSource(s,source); gl!.compileShader(s);
        if (!gl!.getShaderParameter(s,gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s)!);
        return s;
    }
    const program=gl.createProgram()!;
    gl.attachShader(program,shader(gl.VERTEX_SHADER,`#version 300 es
        precision highp float;
        ${sphere_vertex}
        uniform mat4 u_projection;
        in vec3 a_sample;
        out vec3 captured;
        void main() {
            gl_Position=u_projection*vec4(sphere_position(a_sample.xy,a_sample.z),1);
            captured=gl_Position.xyz;
        }`));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`#version 300 es
        precision highp float; out vec4 color; void main(){color=vec4(1);}`));
    gl.transformFeedbackVaryings(program,['captured'],gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)!);
    gl.useProgram(program);
    const samples=[
        {xy:[500,500],n:[0,0,1],e:.8}, {xy:[750,500],n:[1,0,0],e:.8},
        {xy:[500,0],n:[0,1,0],e:.8}, {xy:[500,1000],n:[0,-1,0],e:.8},
        {xy:[0,500],n:[0,0,-1],e:.8}, {xy:[500,500],n:[0,0,1],e:-.4},
    ];
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER,Float32Array.from(samples.flatMap(s=>[...s.xy,s.e])),gl.STATIC_DRAW);
    const a=gl.getAttribLocation(program,'a_sample');
    gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,3,gl.FLOAT,false,0,0);
    const feedback=gl.createBuffer();
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,feedback);
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,samples.length*3*4,gl.STREAM_READ);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,feedback);
    gl.enable(gl.RASTERIZER_DISCARD);
    const cameras=[
        {x:500,y:500,rotate_deg:0,tilt_deg:0},
        {x:650,y:300,rotate_deg:45,tilt_deg:0},
        {x:100,y:800,rotate_deg:-90,tilt_deg:30},
        {x:1000,y:0,rotate_deg:180,tilt_deg:0},
    ];
    const radii=[100,300,1000];
    let checks=0, maxError=0;
    for (const radius of radii) for (const camera of cameras) for (const height of [0,50,150]) {
        const {projection,rotation}=sphereProjection({...camera,zoom:.4});
        gl.uniformMatrix4fv(gl.getUniformLocation(program,'u_projection'),false,projection);
        gl.uniformMatrix4fv(gl.getUniformLocation(program,'u_rotation'),false,rotation);
        gl.uniform1f(gl.getUniformLocation(program,'u_mountain_height'),height);
        gl.uniform1f(gl.getUniformLocation(program,'u_sphere_radius'),radius);
        gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS,0,samples.length); gl.endTransformFeedback();
        const captured=new Float32Array(samples.length*3);
        gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,captured);
        const inverse=mat4.invert(mat4.create(),projection)!;
        for (let i=0;i<samples.length;i++) {
            const s=samples[i], world=vec3.transformMat4(vec3.create(),captured.subarray(3*i,3*i+3),inverse);
            const expected=s.n.map(n=>n*(radius+height*Math.max(0,s.e)));
            const cpu=terrainPosition(s.n,s.e,height,radius);
            const error=Math.max(...expected.map((v,k)=>Math.max(Math.abs(world[k]-v),Math.abs(world[k]-cpu[k]))));
            maxError=Math.max(maxError,error);
            if (error>.001) throw new Error(`Non-radial or mismatched peak: ${JSON.stringify({radius,camera,height,sample:i,expected,actual:Array.from(world),error})}`);
            checks++;
        }
    }
    if(gl.getError()!==gl.NO_ERROR) throw new Error('WebGL error');
    output.textContent=JSON.stringify({status:'PASS',checks,radii,cameras:cameras.length,maxError},null,2);
} catch(error) {
    output.textContent=`FAIL\n${error.stack || error}`;
}
