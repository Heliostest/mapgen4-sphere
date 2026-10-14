import {decodeDisplay,DISPLAY_WIDTH,DISPLAY_HEIGHT,DISPLAY_COUNT,type DisplayDocument,type DisplayFrame,type DisplayLayer} from '../earth-speedyweather-20261012/display-contract.ts';

/** Frozen independent experiment identity. This is the 2001 initial stock, not the 2006 stock. */
export const INITIAL_ATM_LAND_SHA='4c665c83b08918fad6f8b67968fae472539c8796515afc93a22099d682b44a68';
export const CASE_IDENTITIES=[
    {id:'reference',label:'原配置 · 50 m 混合层',description:'原始独立实验，预算未修正。'},
    {id:'slab',label:'修复后 · 自由海温',description:'排水记账和干空气质量约束，海温自由演化。'},
    {id:'seasonal',label:'修复后 · 规定季节海温',description:'相同修复；海温边界外部热量单独记账。'},
] as const;
const SIGMA_FULL=[.0625,.1875,.3125,.4375,.5625,.6875,.8125,.9375] as const;
export type CaseId=typeof CASE_IDENTITIES[number]['id'];
export interface ComparisonCase {id:CaseId;label:string;description:string;data:DisplayDocument;}
export interface ComparisonDocument {
    format:'speedyweather-sst-comparison';version:1;initialAtmLandSHA:typeof INITIAL_ATM_LAND_SHA;cases:ComparisonCase[];
}
export interface ReplaySelection {caseId:CaseId;frameIndex:number;levelIndex:number;layer:'wind'|'temperature';}
export interface ActiveReplay {case:ComparisonCase;frame:DisplayFrame;air:DisplayLayer;sigma:number;}

function object(value:unknown,name:string):Record<string,unknown>{
    if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error(`${name} 必须是对象`);
    return value as Record<string,unknown>;
}
function exact(value:unknown,wanted:unknown,name:string):void{
    if(value!==wanted)throw new Error(`${name} 与冻结的 SST 对照合同不符`);
}

/** Reuse the proven display boundary; never instantiate a solver to validate replay data. */
export function decodeComparison(value:unknown):ComparisonDocument{
    const d=object(value,'SST 对照数据');
    exact(d.format,'speedyweather-sst-comparison','数据格式');exact(d.version,1,'数据版本');
    exact(d.initialAtmLandSHA,INITIAL_ATM_LAND_SHA,'2001 初始大气与陆地库存 SHA');
    if(!Array.isArray(d.cases)||d.cases.length!==3)throw new Error('SST 对照必须有 reference、slab、seasonal 三组');
    const cases=d.cases.map((value,index):ComparisonCase=>{
        const c=object(value,`配置 ${index+1}`),identity=CASE_IDENTITIES[index];
        for(const key of ['id','label','description'] as const)exact(c[key],identity[key],`配置 ${identity.id} ${key}`);
        try{
            const data=decodeDisplay(c.data);
            for(let level=0;level<8;level++)exact(data.sigmaFull[level],SIGMA_FULL[level],`sigmaFull 第 ${level+1} 层`);
            return {...identity,data};
        }catch(error){throw new Error(`${identity.id}: ${error instanceof Error?error.message:String(error)}`);}
    });
    return {format:'speedyweather-sst-comparison',version:1,initialAtmLandSHA:INITIAL_ATM_LAND_SHA,cases};
}
export function decodeComparisonText(source:string):ComparisonDocument{return decodeComparison(JSON.parse(source));}
export function createReplaySelection():ReplaySelection{return {caseId:'seasonal',frameIndex:0,levelIndex:7,layer:'wind'};}

export function activeReplay(document:ComparisonDocument,selection:ReplaySelection):ActiveReplay{
    const scenario=document.cases.find(c=>c.id===selection.caseId);
    if(!scenario)throw new Error(`未知配置 ${selection.caseId}`);
    if(!Number.isInteger(selection.frameIndex)||selection.frameIndex<0||selection.frameIndex>=12)throw new Error('月份索引必须在 0–11');
    if(!Number.isInteger(selection.levelIndex)||selection.levelIndex<0||selection.levelIndex>=8)throw new Error('大气层索引必须在 0–7');
    if(selection.layer!=='wind'&&selection.layer!=='temperature')throw new Error('只读回放仅支持风场或气温');
    const frame=scenario.data.frames[selection.frameIndex];
    return {case:scenario,frame,air:frame.layers[selection.levelIndex],sigma:scenario.data.sigmaFull[selection.levelIndex]};
}

/** Camera state belongs to navigation and is deliberately absent from this transition. */
export function switchReplayCase(document:ComparisonDocument,selection:ReplaySelection,id:CaseId):ReplaySelection{
    const next={...selection,caseId:id};activeReplay(document,next);return next;
}
/** A switch may reuse a texture only from the same case, month and sigma layer. */
export function packedReplayKey(selection:ReplaySelection):string{return `${selection.caseId}:${selection.frameIndex}:${selection.levelIndex}`;}

export interface ReplayProbe {
    caseId:CaseId;month:number;levelIndex:number;sigma:number;cell:number;longitudeDeg:number;latitudeDeg:number;
    temperatureK:number;windEastMps:number;windNorthMps:number;windSpeedMps:number;
    pressurePa:number;surfacePressurePa:number;seaIceConcentration:number;rainMmDay:number;
}
/** Probe reads raw Float64 fields; color and wind packing never feed these numbers. */
export function readReplayProbe(document:ComparisonDocument,selection:ReplaySelection,cell:number):Readonly<ReplayProbe>{
    if(!Number.isInteger(cell)||cell<0||cell>=DISPLAY_COUNT)throw new Error('探针格点索引超出 48×24 网格');
    const {case:scenario,frame,air,sigma}=activeReplay(document,selection),surface=frame.surface;
    const windEastMps=air.windEastMps[cell],windNorthMps=air.windNorthMps[cell],surfacePressurePa=surface.pressurePa[cell];
    return Object.freeze({caseId:scenario.id,month:frame.month,levelIndex:selection.levelIndex,sigma,cell,
        longitudeDeg:-180+(cell%DISPLAY_WIDTH+.5)*360/DISPLAY_WIDTH,
        latitudeDeg:Math.asin(1-2*(Math.floor(cell/DISPLAY_WIDTH)+.5)/DISPLAY_HEIGHT)*180/Math.PI,
        temperatureK:air.temperatureK[cell],windEastMps,windNorthMps,windSpeedMps:Math.hypot(windEastMps,windNorthMps),
        pressurePa:sigma*surfacePressurePa,surfacePressurePa,seaIceConcentration:surface.seaIceConcentration[cell],rainMmDay:surface.rainMmDay[cell]});
}
