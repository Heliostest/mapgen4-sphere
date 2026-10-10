import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeIceInventory} from '../ice-inventory.ts';

const samples=JSON.parse(readFileSync('scenes/earth-land-sea/ice-samples.json','utf8'));
const source=JSON.parse(readFileSync('scenes/earth-land-sea/ice-source.json','utf8'));
const point=(name:string)=>source.checks.find((p:{name:string})=>p.name===name);

test('Earth observations supply separate finite grounded and shelf inventories with recorded source masks',()=>{
    const seed=decodeIceInventory(samples)!;
    assert.equal(seed.groundedThicknessM.length,96*49);
    assert.equal(samples.missing.some(Boolean),false);
    for(let i=0;i<seed.groundedThicknessM.length;i++) {
        const mask=samples.rawMask[i],grounded=seed.groundedThicknessM[i],shelf=seed.shelfThicknessM[i];
        assert.ok(Number.isFinite(grounded)&&Number.isFinite(shelf));
        if(mask===3||mask===5) {
            assert.equal(samples.class[i],'grounded');assert.ok(grounded>0);assert.equal(shelf,0);
            assert.ok(Number.isFinite(seed.bedrockM[i]));
        } else if(mask===4) {
            assert.equal(samples.class[i],'shelf');assert.ok(shelf>0);assert.equal(grounded,0);
            assert.ok(Number.isFinite(seed.bedrockM[i]));
        } else {
            assert.equal(samples.class[i],'noIce');assert.equal(grounded,0);assert.equal(shelf,0);
            assert.equal(seed.bedrockM[i],null,'Unsampled bed is explicit, not a fabricated sea-level elevation');
        }
    }
});

test('source checkpoints distinguish polar ice sheets, floating shelves and ice-free controls',()=>{
    for(const name of ['Antarctic inland','South Pole','Greenland inland','Greenland summit']) {
        assert.equal(point(name).class,'grounded');assert.ok(point(name).thicknessM>1000);
    }
    for(const name of ['Ross Ice Shelf','Filchner-Ronne Ice Shelf']) {
        const p=point(name);assert.equal(p.class,'shelf');assert.ok(p.thicknessM>50&&p.thicknessM<1500);
        assert.ok(p.productBedrockM<p.productSurfaceM-p.thicknessM-10,'Shelf water cavity is not counted as ice thickness');
    }
    for(const name of ['North Pole ocean','Arctic Ocean','Southern Ocean','Tibetan Plateau','Himalaya']) {
        assert.equal(point(name).class,'noIce');assert.equal(point(name).thicknessM,0);
    }
});

test('official sampled source bytes, licensing, units and differing surface datums remain explicit',()=>{
    assert.equal(source.license,'CC BY 4.0');
    assert.match(source.doi,/10\.5880\/GFZ\.1\.2\.2024\.002/);
    assert.equal(source.downloadResolutionArcSeconds,60);
    assert.match(source.verticalDatum,/EIGEN-6C4/);
    assert.match(source.surfaceComparison.label,/EGM2008.*EIGEN-6C4/);
    assert.ok(source.byteRanges.length>100);
    assert.equal(createHash('sha256').update(readFileSync('scenes/earth-land-sea/ice-samples.json')).digest('hex'),source.samplesSha256);
    for(const range of source.byteRanges) {
        assert.match(range.url,/^https:\/\/datapub\.gfz-potsdam\.de\//);
        assert.match(range.sha256,/^[0-9a-f]{64}$/);
        assert.ok(range.start>=0&&range.length>0&&range.start+range.length<=range.sourceFileBytes);
    }
});
