// SPDX-License-Identifier: Apache-2.0
// Planet renderer for the Mapgen4 fork. Original map/river concepts: Red Blob Games.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {SphereMesh} from './mesh.ts';
import type {Terrain} from './terrain.ts';

export class PlanetRenderer {
    private renderer:THREE.WebGLRenderer;
    private scene=new THREE.Scene();
    private camera=new THREE.PerspectiveCamera(38,1,0.05,100);
    private controls:OrbitControls;
    private surface:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
    private rivers:THREE.Mesh;
    private grid=new THREE.Group();
    private cursor:THREE.LineLoop;
    private raycaster=new THREE.Raycaster();
    private geometry:SphereMesh;
    private result?:Terrain;
    private relief=0.06;
    private riverThreshold=0.6;
    private dirty=true;
    private rotation=false;
    private lastTime=0;
    readonly canvas:HTMLCanvasElement;

    constructor(canvas:HTMLCanvasElement,mesh:SphereMesh){
        this.canvas=canvas;this.geometry=mesh;
        this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
        this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
        this.renderer.outputColorSpace=THREE.SRGBColorSpace;
        this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure=1;
        this.camera.position.set(0.45,0.35,3.3);
        this.controls=new OrbitControls(this.camera,canvas);
        this.controls.enableDamping=true;this.controls.dampingFactor=0.09;
        this.controls.enablePan=false;this.controls.minDistance=1.35;this.controls.maxDistance=5.5;
        this.controls.rotateSpeed=0.65;this.controls.zoomSpeed=0.7;
        this.controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;
        this.controls.addEventListener('change',()=>{this.dirty=true;});
        const ambient=new THREE.HemisphereLight(0xcce5f2,0x5b6354,1.7);this.scene.add(ambient);
        const key=new THREE.DirectionalLight(0xfff2d7,1.8);key.position.set(-2,3,4);this.camera.add(key);
        const fill=new THREE.DirectionalLight(0x7fbeea,0.8);fill.position.set(3,0,1);this.camera.add(fill);
        this.scene.add(this.camera);
        const geometry=new THREE.BufferGeometry();
        geometry.setIndex(new THREE.BufferAttribute(mesh.triangles,1));
        geometry.setAttribute('position',new THREE.BufferAttribute(mesh.positions.slice(),3));
        geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(mesh.positions.length),3));
        this.surface=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.92}));
        this.scene.add(this.surface);
        this.rivers=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:0x78d5dd,side:THREE.DoubleSide,depthWrite:false}));
        this.rivers.renderOrder=1;this.scene.add(this.rivers);
        const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.025,64,32),new THREE.ShaderMaterial({
            vertexShader:'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
            fragmentShader:'varying vec3 n; varying vec3 v; void main(){float a=pow(1.0-abs(dot(normalize(n),normalize(v))),3.0)*0.32;gl_FragColor=vec4(0.24,0.61,0.79,a);}',
            side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
        }));this.scene.add(atmosphere);
        const material=new THREE.LineBasicMaterial({color:0x9cc4d5,transparent:true,opacity:0.18,depthWrite:false});
        for(let latitude=-60;latitude<=60;latitude+=30){
            const y=Math.sin(latitude*Math.PI/180),r=Math.cos(latitude*Math.PI/180),points=[];
            for(let j=0;j<180;j++){const a=j/180*Math.PI*2;points.push(new THREE.Vector3(r*Math.cos(a),y,r*Math.sin(a)).multiplyScalar(1.003));}
            this.grid.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),material));
        }
        for(let longitude=0;longitude<180;longitude+=30){
            const a=longitude*Math.PI/180,points=[];
            for(let j=0;j<180;j++){const b=j/180*Math.PI*2;points.push(new THREE.Vector3(Math.cos(b)*Math.cos(a),Math.sin(b),Math.cos(b)*Math.sin(a)).multiplyScalar(1.003));}
            this.grid.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),material));
        }
        this.grid.visible=false;this.scene.add(this.grid);
        this.cursor=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xf2d89f,transparent:true,opacity:0.9,depthTest:false}));
        this.cursor.visible=false;this.cursor.renderOrder=2;this.scene.add(this.cursor);
        new ResizeObserver(()=>this.resize()).observe(canvas.parentElement!);
        this.resize();
        this.renderer.setAnimationLoop((time:number)=>{
            const dt=Math.min((time-this.lastTime)/1000,0.05);this.lastTime=time;
            this.controls.autoRotate=this.rotation;this.controls.autoRotateSpeed=0.7;
            this.controls.update(dt);
            if(this.dirty){this.renderer.render(this.scene,this.camera);this.dirty=false;}
        });
    }
    private resize(){
        const {width,height}=this.canvas.parentElement!.getBoundingClientRect();
        this.renderer.setSize(width,height,false);this.camera.aspect=width/Math.max(height,1);
        // Fit the sphere to the shorter canvas dimension, including portrait phones.
        this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(40)/2)/Math.min(this.camera.aspect,1)));
        this.camera.updateProjectionMatrix();this.dirty=true;
    }
    update(result:Terrain){
        this.result=result;
        const positions=this.surface.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colors=this.surface.geometry.getAttribute('color') as THREE.BufferAttribute;
        const seaDeep=new THREE.Color('#133953'),seaShallow=new THREE.Color('#3d9fa9'),sand=new THREE.Color('#b4ae78');
        const forest=new THREE.Color('#52784b'),rock=new THREE.Color('#8b8e7c'),snow=new THREE.Color('#e0e8e4'),color=new THREE.Color();
        for(let i=0;i<result.elevation.length;i++){
            const e=result.elevation[i],m=result.moisture[i],y=this.geometry.positions[3*i+1];
            const radius=1+Math.max(0,e)*this.relief;
            positions.setXYZ(i,this.geometry.positions[3*i]*radius,y*radius,this.geometry.positions[3*i+2]*radius);
            if(e<=0)color.copy(seaShallow).lerp(seaDeep,Math.min(1,-e*5));
            else{
                color.copy(sand).lerp(forest,Math.min(1,m*1.7));
                color.lerp(rock,Math.min(0.8,e*1.4));
                const snowline=0.64-0.20*Math.pow(Math.abs(y),3);
                color.lerp(snow,THREE.MathUtils.smoothstep(e,snowline,snowline+0.14));
                if(e<0.018)color.lerp(sand,0.7);
            }
            colors.setXYZ(i,color.r,color.g,color.b);
        }
        positions.needsUpdate=true;colors.needsUpdate=true;
        this.surface.geometry.computeVertexNormals();this.surface.geometry.computeBoundingSphere();
        this.updateRivers();this.dirty=true;
    }
    private updateRivers(){
        if(!this.result)return;
        const {elevation,drainage,flow}=this.result,points:number[]=[];
        const a=new THREE.Vector3(),b=new THREE.Vector3(),mid=new THREE.Vector3(),side=new THREE.Vector3();
        for(let i=0;i<drainage.length;i++){
            const j=drainage[i];if(j<0 || elevation[i]<=0 || flow[i]<this.riverThreshold)continue;
            a.fromArray(this.geometry.positions,i*3);b.fromArray(this.geometry.positions,j*3);
            side.crossVectors(a,b).normalize();
            const width=Math.min(0.0028,0.00045+Math.sqrt(flow[i])*0.00022);
            // Interpolate the original triangle edge so the ribbon follows the displaced surface.
            a.multiplyScalar(1+Math.max(0,elevation[i])*this.relief+0.0009);
            b.multiplyScalar(1+Math.max(0,elevation[j])*this.relief+0.0009);
            const verts=[a.clone().addScaledVector(side,width),a.clone().addScaledVector(side,-width),b.clone().addScaledVector(side,width),b.clone().addScaledVector(side,-width)];
            for(const id of [0,1,2,2,1,3]){mid.copy(verts[id]);points.push(mid.x,mid.y,mid.z);}
        }
        this.rivers.geometry.dispose();
        this.rivers.geometry=new THREE.BufferGeometry();this.rivers.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    }
    pick(x:number,y:number):number[]|null{
        const rect=this.canvas.getBoundingClientRect();
        this.scene.updateMatrixWorld(true);
        this.raycaster.setFromCamera(new THREE.Vector2((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2),this.camera);
        const hit=this.raycaster.intersectObject(this.surface)[0];
        return hit?hit.point.normalize().toArray():null;
    }
    showBrush(center:number[]|null,radius:number){
        this.cursor.visible=!!center;
        if(center){
            const n=new THREE.Vector3().fromArray(center),u=new THREE.Vector3(0,1,0);
            if(Math.abs(n.y)>0.95)u.set(1,0,0);
            u.cross(n).normalize();const v=n.clone().cross(u),points=[];
            for(let i=0;i<64;i++){const a=i/64*Math.PI*2;points.push(n.clone().multiplyScalar(Math.cos(radius)).addScaledVector(u,Math.cos(a)*Math.sin(radius)).addScaledVector(v,Math.sin(a)*Math.sin(radius)).multiplyScalar(1.006));}
            this.cursor.geometry.dispose();this.cursor.geometry=new THREE.BufferGeometry().setFromPoints(points);
        }
        this.dirty=true;
    }
    setTool(paint:boolean){
        this.controls.mouseButtons.LEFT=paint?null:THREE.MOUSE.ROTATE;
        this.controls.touches.ONE=paint?null:THREE.TOUCH.ROTATE;
        this.canvas.style.cursor=paint?'crosshair':'grab';if(!paint)this.showBrush(null,0);
    }
    setRelief(value:number){this.relief=value;if(this.result)this.update(this.result);}
    setRivers(visible:boolean){this.rivers.visible=visible;this.dirty=true;}
    setGrid(visible:boolean){this.grid.visible=visible;this.dirty=true;}
    setRotation(value:boolean){this.rotation=value;this.dirty=true;}
    resetView(){this.camera.position.set(0.45,0.35,3.3);this.controls.target.set(0,0,0);this.controls.update();this.dirty=true;}
    exportImage(seed:number){
        this.renderer.render(this.scene,this.camera);
        this.canvas.toBlob(blob=>{
            if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');
            a.href=url;a.download=`mapgen4-planet-${seed}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        },'image/png');
    }
}
