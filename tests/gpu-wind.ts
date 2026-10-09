import {planet_fragment} from '../planet-render.ts';

// Probe the production glyph at points on the shaft and arrowhead. The oracle
// converts a physical east/north tangent into equal-area cell coordinates;
// it does not copy the shader's direction calculation.
const output=document.querySelector('pre')!;
try {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const gl=canvas.getContext('webgl2',{antialias:false})!;
    if(!gl)throw new Error('WebGL2 unavailable');
    const compile=(type:number,source:string)=>{
        const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)!);
        return shader;
    };
    const program=gl.createProgram()!;
    gl.attachShader(program,compile(gl.VERTEX_SHADER,`#version 300 es
        void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}`));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`#version 300 es
        precision highp float;
        ${planet_fragment}
        uniform vec3 u_normal;
        out vec4 color;
        void main(){color=vec4(planet_color(vec3(0),u_normal),1);}`));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)!);
    gl.useProgram(program);gl.bindVertexArray(gl.createVertexArray());
    gl.uniform1i(gl.getUniformLocation(program,'u_planet_layer'),8);
    gl.uniform1i(gl.getUniformLocation(program,'u_temperature'),0);
    gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const failures:unknown[]=[],rows:unknown[]=[];let checks=0;
    const glyph=[.96,.93,.73];
    for(const [width,height] of [[48,24],[8,4]]) {
        const pixels=new Uint8Array(width*height*4);
        const sample=(u:number,v:number)=>{
            const sinLat=1-2*v,cosLat=Math.sqrt(1-sinLat*sinLat),longitude=2*Math.PI*(u-.5);
            gl.uniform3fv(gl.getUniformLocation(program,'u_normal'),[cosLat*Math.sin(longitude),sinLat,cosLat*Math.cos(longitude)]);
            gl.drawArrays(gl.TRIANGLES,0,3);
            const actual=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,actual);
            return actual;
        };
        for(const [east,north] of [[13,13],[13,-13],[-13,13],[-13,-13],[13,0],[-13,0],[0,13],[0,-13],[0,0]]) {
            for(let i=0;i<width*height;i++)pixels.set([130,128+east,128+north,255],4*i);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
            for(const row of [0,height/2-1,height/2,height-1])for(const column of [0,width-1]) {
                const centerU=(column+.5)/width,centerV=(row+.5)/height,sinLat=1-2*centerV,cosLat=Math.sqrt(1-sinLat*sinLat);
                // A unit arc east changes longitude by 1/cos(latitude). A
                // unit arc north changes sin(latitude) by cos(latitude).
                let dx=east/cosLat/(2*Math.PI)*width,dy=-north*cosLat/2*height;
                const magnitude=Math.hypot(dx,dy),speed=Math.hypot(east,north)/1.27;
                const background=[.08+.04*Math.min(1,speed/30),.16+.49*Math.min(1,speed/30),.30+.25*Math.min(1,speed/30)];
                let points=[{label:'calm center',x:0,y:0}];
                if(magnitude>0){
                    dx/=magnitude;dy/=magnitude;
                    points=[
                        {label:'forward shaft',x:.25*dx,y:.25*dy},
                        {label:'backward shaft',x:-.25*dx,y:-.25*dy},
                        {label:'left arrowhead',x:.18*dx-.075*dy,y:.18*dy+.075*dx},
                        {label:'right arrowhead',x:.18*dx+.075*dy,y:.18*dy-.075*dx},
                    ];
                }
                const expected=magnitude>0?glyph:background;
                for(const point of points) {
                    const actual=sample(centerU+point.x/width,centerV+point.y/height);checks++;
                    if(actual[3]!==255||expected.some((v,i)=>Math.abs(actual[i]-255*v)>1.1))failures.push({width,height,row,column,east,north,point:point.label,actual:Array.from(actual),expected:expected.map(v=>255*v)});
                }
                rows.push({width,height,row,column,eastMps:east/1.27,northMps:north/1.27,latitudeDegrees:Math.asin(sinLat)*180/Math.PI});
            }
        }
    }
    if(gl.getError()!==gl.NO_ERROR)throw new Error('WebGL error');
    output.textContent=JSON.stringify({status:failures.length?'FAIL':'PASS',checks,failedChecks:failures.length,failures:failures.slice(0,12),cases:rows},null,2);
}catch(error){output.textContent=JSON.stringify({status:'FAIL',error:String(error)},null,2);}
