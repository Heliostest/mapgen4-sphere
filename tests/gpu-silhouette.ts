import Renderer from '../render.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';
import {sphereProjection} from '../sphere-view.ts';

// Probe the real drape coverage and final composition, including pixels on
// the background side of a silhouette (where the drape shader never runs).
const output=document.querySelector('pre')!;
try {
    const renderer=new Renderer(makeSphereMesh(120,35,12345).mesh);
    const {webgl,fbo_drape}=renderer, {gl}=webgl;
    const checks: {name:string;pass:boolean}[]=[];
    const check=(name:string,pass:boolean)=>checks.push({name,pass});
    const params={x:500,y:500,rotate_deg:0,tilt_deg:0,zoom:.286,
        mountain_height:50,light_angle_deg:80,slope:2,flat:2.5,ambient:.25,overhead:30,
        outline_depth:1,outline_strength:15,outline_threshold:0,outline_coast:0,outline_water:13,biome_colors:1};
    const pixel=new Uint8Array(4);
    fbo_drape.bind(); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    check('background coverage is empty',pixel[3]===0);
    Object.assign(renderer,sphereProjection(params));
    // A sea-level triangle must count as coverage too; elevation zero is not
    // an empty-space marker. Exercise the actual production drape shader.
    renderer.buffer_quad_xy.subdata(0,new Float32Array([480,520,0,.5, 520,520,0,.5, 500,480,0,.5]));
    renderer.atlasVertexCount=3;
    renderer.drawDrape(params);
    gl.readPixels(1024,1024,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    check('sea-level terrain writes coverage',pixel[3]===255);

    const size=32, background=[77,77,89];
    function patch(sameColor:boolean) {
        const bytes=new Uint8Array(size*size*4);
        for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
            const covered=Math.abs(x-16)+Math.abs(y-16)<=8;
            bytes.set([...(covered && !sameColor?[200,180,120]:background),covered?255:0],4*(y*size+x));
        }
        gl.activeTexture(gl.TEXTURE0); fbo_drape.texture!.bind();
        gl.texSubImage2D(gl.TEXTURE_2D,0,100,100,size,size,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
        return bytes;
    }
    function render(values:typeof params) {
        gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.clear(gl.DEPTH_BUFFER_BIT);
        renderer.drawFinal([0,0],values);
        const bytes=new Uint8Array(size*size*4);
        gl.readPixels(100,100,size,size,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
        return bytes;
    }
    const at=(bytes:Uint8Array,x:number,y:number,k=0)=>bytes[4*(y*size+x)+k];
    const rims=[[25,16],[7,16],[16,25],[16,7],[21,21],[11,11],[21,11],[11,21]];
    for(const sameColor of [false,true]) {
        const original=patch(sameColor), outlined=render(params);
        for(const [x,y] of rims) check(`outer rim ${x},${y}, matching colors=${sameColor}`,at(outlined,x,y)<at(original,x,y)-10);
        check(`inner rim, matching colors=${sameColor}`,at(outlined,23,16)<at(original,23,16)-10);
        check(`interior preserved, matching colors=${sameColor}`,Math.abs(at(outlined,16,16)-at(original,16,16))<=1);
        check(`distant background preserved, matching colors=${sameColor}`,Math.abs(at(outlined,30,30)-77)<=1);
        check(`final image opaque, matching colors=${sameColor}`,outlined.every((v,i)=>i%4!==3 || v===255));
        for(const disabled of [{outline_strength:0},{outline_depth:0}]) {
            const plain=render({...params,...disabled});
            check(`disable ${Object.keys(disabled)[0]}, matching colors=${sameColor}`,
                plain.every((v,i)=>i%4===3 || Math.abs(v-original[i])<=1));
        }
    }
    if(gl.getError()!==gl.NO_ERROR) throw new Error('WebGL error during silhouette probe');
    output.textContent=JSON.stringify({status:checks.every(c=>c.pass)?'PASS':'FAIL',checks:checks.length,failed:checks.filter(c=>!c.pass)},null,2);
} catch(error) {
    output.textContent=`FAIL\n${error.stack || error}`;
}
