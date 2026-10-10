import Renderer from '../render.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';
import {makePlanetView} from '../planet-render.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {defaultTerrainParameters} from '../terrain-parameters.ts';
import {sphereProjection} from '../sphere-view.ts';

// Exercise the real drape pass. Hold the rendered surface and its colors fixed
// while changing only the elevation atlas used by slope lighting.
const output=document.querySelector('pre')!;
try {
    const {mesh}=makeSphereMesh(120,35,12345),r=new Renderer(mesh),{gl}=r.webgl;
    const params={...defaultTerrainParameters().render,x:500,y:500,zoom:.25,
        biome_colors:0,outline_strength:0,outline_depth:0,outline_coast:0,outline_water:0};
    const camera=sphereProjection(params);r.projection=camera.projection;r.rotation=camera.rotation;
    for(let s=0;s<mesh.numSolidSides;s++)r.quad_elements.set([mesh.r_begin_s(s),mesh.r_begin_s(mesh.s_opposite_s(s)),mesh.numRegions+mesh.t_inner_s(s)],3*s);
    r.fbo_river.clear(0,0,0,0);r.fbo_depth.clear(0,0,0,1);r.fbo_lakes.clear(0,0,0,0);
    const atlas=r.webgl.createProgram('lighting-elevation-fixture',`
        precision highp float;
        void main(){gl_Position=vec4(gl_VertexID==1?3.0:-1.0,gl_VertexID==2?3.0:-1.0,0,1);}
    `,`
        precision highp float;
        uniform vec2 u_size;
        uniform float u_height,u_ripple;
        uniform bool u_coast;
        out vec4 color;
        void main(){
            vec2 uv=gl_FragCoord.xy/u_size;
            float height=u_height+u_ripple*sin(uv.x*800.0)*sin(uv.y*500.0);
            // Coast fixture: the center is positive, westward neighbors are sea.
            if(u_coast && uv.x<0.5)height=u_height;
            if(u_coast && uv.x>=0.5)height=0.6;
            color=vec4(height,0,0,1);
        }
    `,()=>{});
    function geometry(height:number|((u:number,v:number)=>number)){
        r.physicalElevation=new Float32Array(mesh.numRegions+mesh.numTriangles);
        for(let v=0;v<r.physicalElevation.length;v++){
            const e=typeof height==='number'?height:height(r.a_quad_xy[2*v],r.a_quad_xy[2*v+1]);
            r.physicalElevation[v]=e;r.a_quad_em[2*v]=e;r.a_quad_em[2*v+1]=.5;
        }
        r.updateMap();
    }
    function elevation(height:number,ripple:number,coast=false){
        r.drawGeneric(atlas,r.fbo_land,()=>{
            gl.uniform2f(atlas.u_size,r.fbo_land.texture!.width,r.fbo_land.texture!.height);
            gl.uniform1f(atlas.u_height,height);gl.uniform1f(atlas.u_ripple,ripple);
            gl.uniform1i(atlas.u_coast,coast?1:0);gl.drawArrays(gl.TRIANGLES,0,3);
        });
    }
    function frame(layer:'surface'|'original',ice:number,biome=0,color=[80,120,160],outlined=false){
        const pixels=Uint8Array.from(Array.from({length:12},()=>[...color,Math.round(ice*255)]).flat());
        r.updatePlanet({...makePlanetView(DEFAULT_PLANET,DEFAULT_ORBIT,0,layer,'surface'),surface:{width:4,height:3,timeS:0,pixels}});
        r.fbo_drape.clear(0,0,0,0);r.drawDrape({...params,biome_colors:biome,
            outline_strength:outlined?3:0,outline_depth:outlined?1:0});
        // Include off-center radial outline taps, which vanish at globe center.
        const size=640,tex=r.fbo_drape.texture!,bytes=new Uint8Array(size*size*4);
        gl.readPixels(tex.width/2-size/2,tex.height/2-size/2,size,size,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
        return bytes;
    }
    function difference(a:Uint8Array,b:Uint8Array){
        let max=0,changed=0;for(let p=0;p<a.length;p+=4)for(let c=0;c<3;c++){
            const d=Math.abs(a[p+c]-b[p+c]);max=Math.max(max,d);if(d>1)changed++;
        }return {max,changed};
    }
    const checks:{name:string;pass:boolean;detail:unknown}[]=[];
    const check=(name:string,pass:boolean,detail:unknown)=>checks.push({name,pass,detail});
    geometry(-.2);
    for(const [layer,ice] of [['original',0],['surface',0],['surface',.45],['surface',1]] as const){
        elevation(.2,0);const flat=frame(layer,ice);
        elevation(.2,.19);const ridges=frame(layer,ice),d=difference(flat,ridges);
        check(`${layer}, sea ice ${ice}: seabed does not shade the sea surface`,d.max<=1,d);
        check(`${layer}, sea ice ${ice}: surface remains visible`,flat.every((v,i)=>i%4!==3||v===255),null);
    }
    // A negative fine-mesh elevation still means sea when the filtered atlas
    // footprint crosses land. It must use the same flat surface normal.
    elevation(.2,0);const open=frame('surface',1);
    elevation(.2,0,true);const nearCoast=frame('surface',1),coastSea=difference(open,nearCoast);
    check('sea-ice edge uses fine terrain coastline for its normal',coastSea.max<=1,coastSea);
    geometry(0);elevation(.2,.19);const seaLevel=difference(open,frame('surface',1));
    check('exactly zero elevation is a sea surface',seaLevel.max<=1,seaLevel);
    // Keep water-depth color diagnostics, independent of the lighting fix.
    elevation(.1,0);const deep=frame('original',0,1);
    elevation(.45,0);const shallow=frame('original',0,1),depth=difference(deep,shallow);
    check('original terrain retains bathymetric color',depth.changed>100,depth);
    // A second path carries the screen-space height used by ridge outlines.
    // Vary the physical sea bed while keeping sea-level geometry unchanged.
    function outlinedGeometry(height:number|((u:number,v:number)=>number)){
        geometry(height);r.drawLand(0);r.fbo_depth.clear(0,0,0,1);r.drawDepth(params);
    }
    for(const [layer,ice] of [['surface',1],['surface',.45],['original',0]] as const){
        outlinedGeometry((u,v)=>-.3+.25*Math.sin(u*.15)*Math.sin(v*.10));
        const ridges=frame(layer,ice,0,[80,120,160],true);
        outlinedGeometry(-.2);const flat=frame(layer,ice,0,[80,120,160],true);
        const d=difference(flat,ridges);
        check(`${layer}, sea ice ${ice}: ridge outlines use the sea surface`,d.max<=1,d);
    }
    r.fbo_depth.clear(0,0,0,1);
    geometry(.1);
    for(const [layer,color] of [['original',[80,120,160]],['surface',[80,120,160]],['surface',[190,200,205]]] as const){
        elevation(.65,0);const flat=frame(layer,0,0,Array.from(color));
        elevation(.65,.14);const mountains=frame(layer,0,0,Array.from(color)),d=difference(flat,mountains);
        check(`${layer}, land color ${color}: land/snow retain slope lighting`,d.changed>100&&d.max>10,d);
    }
    elevation(.6,0);const flatLand=frame('surface',0);
    elevation(.2,0,true);const coastLand=difference(flatLand,frame('surface',0));
    check('coastal land retains its terrain slope lighting',coastLand.changed>100&&coastLand.max>10,coastLand);
    check('lighting does not mutate physical DEM',r.physicalElevation.every(v=>v===Math.fround(.1)),null);
    check('WebGL reports no error',gl.getError()===gl.NO_ERROR,null);
    output.textContent=JSON.stringify({status:checks.every(c=>c.pass)?'PASS':'FAIL',checks:checks.length,failed:checks.filter(c=>!c.pass),results:checks},null,2);
}catch(error){output.textContent=JSON.stringify({status:'FAIL',error:String(error)},null,2);}
