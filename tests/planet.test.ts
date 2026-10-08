import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSphere} from '../planet/mesh.ts';
import {defaultParams,generateTerrain,routeDrainage,paintTerrain} from '../planet/terrain.ts';
import {PlanetSession} from '../planet/session.ts';
import {PaintGesture,onPageExit} from '../planet/interaction.ts';

test('sphere is a closed outward-facing manifold including both poles', () => {
    const mesh = makeSphere(3);
    assert.equal(mesh.positions.length / 3, 642);
    assert.equal(mesh.triangles.length / 3, 1280);
    const edges = new Map<string, number>();
    for (let i = 0; i < mesh.triangles.length; i += 3) {
        const ids = Array.from(mesh.triangles.slice(i, i + 3));
        const [a,b,c] = ids.map(id => Array.from(mesh.positions.slice(id*3,id*3+3)));
        const u = b.map((v,k)=>v-a[k]), v = c.map((v,k)=>v-a[k]);
        const n = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
        assert.ok(n.reduce((s,v,k)=>s+v*a[k],0)>0, 'face must point outwards');
        for (let j=0;j<3;j++) {
            const x=ids[j], y=ids[(j+1)%3], key=[Math.min(x,y),Math.max(x,y)].join(':');
            edges.set(key,(edges.get(key)??0)+1);
            assert.ok(mesh.neighbors[x].includes(y));
        }
    }
    for (const count of edges.values()) assert.equal(count, 2, 'no unstitched edge');
    assert.equal(mesh.neighbors.length - edges.size + mesh.triangles.length/3, 2);
    for (let i=0;i<mesh.positions.length;i+=3) assert.ok(Math.abs(Math.hypot(...mesh.positions.slice(i,i+3))-1)<1e-6);
});

test('sphere resolution is bounded', () => {
    assert.throws(()=>makeSphere(-1));
    assert.throws(()=>makeSphere(9));
    assert.throws(()=>makeSphere(1.5));
});

test('seeded worlds are repeatable, finite, varied and have both land and sea', () => {
    const mesh=makeSphere(3), a=generateTerrain(mesh,defaultParams), b=generateTerrain(mesh,defaultParams);
    assert.deepEqual(a,b);
    assert.notDeepEqual(a.elevation,generateTerrain(mesh,{...defaultParams,seed:188}).elevation);
    for (const values of [a.elevation,a.moisture,a.flow]) for(const v of values) assert.ok(Number.isFinite(v));
    assert.ok(a.elevation.some(v=>v>0.1)); assert.ok(a.elevation.some(v=>v<-0.1));
    const wet=generateTerrain(mesh,{...defaultParams,rainfall:1.5});
    assert.ok(wet.flow.reduce((a,b)=>a+b,0)>a.flow.reduce((a,b)=>a+b,0));
});

test('raising the sea level reduces land coverage', () => {
    const mesh=makeSphere(3);
    const low=generateTerrain(mesh,{...defaultParams,seaLevel:0.2}), high=generateTerrain(mesh,{...defaultParams,seaLevel:0.8});
    assert.ok(low.elevation.filter(v=>v>0).length>high.elevation.filter(v=>v>0).length*2);
});

test('drainage terminates at water, has adjacent downstream links and never runs uphill', () => {
    const mesh=makeSphere(3), result=generateTerrain(mesh,defaultParams);
    for(let i=0;i<mesh.neighbors.length;i++) {
        let at=i,steps=0;
        while(result.drainage[at]>=0 && steps++<mesh.neighbors.length) {
            const next=result.drainage[at]; assert.ok(mesh.neighbors[at].includes(next));
            assert.ok(result.elevation[next]<=result.elevation[at]+1e-6);
            at=next;
        }
        assert.ok(steps<mesh.neighbors.length,'drainage cycle');
        assert.ok(result.elevation[at]<=0,'river must terminate at an ocean');
    }
});

test('all-land and all-ocean worlds have finite terminating drainage', () => {
    const mesh=makeSphere(2), n=mesh.neighbors.length;
    for(const h of [-1,0.4]) {
        const elevation=new Float32Array(n).fill(h), moisture=new Float32Array(n).fill(1);
        const {drainage,flow}=routeDrainage(mesh,elevation,moisture);
        for(let i=0;i<n;i++) {
            let at=i,steps=0; while(drainage[at]>=0 && steps++<n) at=drainage[at];
            assert.ok(steps<n); assert.ok(Number.isFinite(flow[i]));
        }
        if(h>0) assert.equal(drainage.filter(x=>x<0).length,1);
        else assert.ok(flow.every(x=>x===0));
    }
});

test('spherical brush crosses longitude wrap and the pole without reaching the back', () => {
    const mesh={positions:Float32Array.from([-1,0,0.01, -1,0,-0.01, 1,0,0, 0,1,0]), triangles:new Uint32Array(),neighbors:[[],[],[],[]]};
    const e=new Float32Array(4), edits=new Float32Array(4).fill(NaN);
    paintTerrain(mesh,e,edits,[-1,0,0],0.1,1,1);
    assert.ok(edits[0]>0.9 && edits[1]>0.9); assert.ok(Number.isNaN(edits[2]));
    paintTerrain(mesh,e,edits,[0,1,0],0.1,1,1); assert.equal(edits[3],1);
});

test('paint overrides generation and reset reproduces the original world', () => {
    const mesh=makeSphere(2), edits=new Float32Array(mesh.neighbors.length).fill(NaN), original=generateTerrain(mesh,defaultParams);
    paintTerrain(mesh,original.elevation,edits,Array.from(mesh.positions.slice(0,3)),0.2,0.9,1);
    const edited=generateTerrain(mesh,defaultParams,edits);
    assert.notDeepEqual(edited.elevation,original.elevation);
    assert.deepEqual(generateTerrain(mesh,defaultParams),original);
});

test('worker session retains multiple strokes, resets and changes seeds in order', () => {
    const mesh=makeSphere(2),session=new PlanetSession(mesh), params={...defaultParams};
    const first=session.apply({id:1,params});
    const strokes=[0,3].map(i=>({center:Array.from(mesh.positions.slice(i*3,i*3+3)),radius:0.3,target:-0.8,strength:1}));
    const a=session.apply({id:2,params,strokes:[strokes[0]]});
    assert.ok(a.elevation[0]<-0.7);
    const b=session.apply({id:3,params,strokes:[strokes[1]]});
    assert.ok(b.elevation[0]<-0.7 && b.elevation[3]<-0.7);
    assert.deepEqual(session.apply({id:4,params,reset:true}),first);
    assert.deepEqual(session.apply({id:5,params:{...params,seed:99}}),generateTerrain(mesh,{...params,seed:99}));
});

test('pinching cancels painting until every touch is lifted', () => {
    const gesture=new PaintGesture();
    assert.equal(gesture.begin(1,'touch',0,true),true);
    assert.equal(gesture.begin(2,'touch',0,true),false);
    assert.equal(gesture.active,null);
    gesture.end(2,'touch');assert.equal(gesture.active,null);
    gesture.end(1,'touch');assert.equal(gesture.begin(3,'touch',0,true),true);
    gesture.cancel();assert.equal(gesture.active,null);
});

test('BFCache pagehide preserves editing resources, permanent exit releases them', () => {
    const target=new EventTarget();let alive=true;
    onPageExit(target,()=>{alive=false;});
    const frozen=new Event('pagehide');Object.defineProperty(frozen,'persisted',{value:true});target.dispatchEvent(frozen);
    assert.equal(alive,true);
    const exited=new Event('pagehide');Object.defineProperty(exited,'persisted',{value:false});target.dispatchEvent(exited);
    assert.equal(alive,false);
});
