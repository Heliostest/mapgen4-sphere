/** Boundary for the standalone replay. No solver/runtime objects are imported. */
export const DISPLAY_WIDTH=48,DISPLAY_HEIGHT=24,DISPLAY_COUNT=DISPLAY_WIDTH*DISPLAY_HEIGHT;
export const TEMPERATURE_MIN_K=193.15,TEMPERATURE_MAX_K=333.15;
export interface DisplayLayer {temperatureK:Float64Array;windEastMps:Float64Array;windNorthMps:Float64Array;}
export interface DisplayFrame {
    label:string;kind:'monthly-mean';month:number;timeS:number;layers:DisplayLayer[];
    surface:{pressurePa:Float64Array;seaIceConcentration:Float64Array;rainMmDay:Float64Array;};
}
export interface DisplayDocument {
    format:'speedyweather-earth-display';version:1;
    model:{name:'SpeedyWeather';version:'0.23.0';truncation:32;nlayers:8;precision:'Float64';statisticsStart:string;statisticsEnd:string;};
    grid:{width:48;height:24;layout:'equal-area-north-first';longitudeWestDeg:-180;};
    sigmaFull:number[];frames:DisplayFrame[];
    acceptance:{formalDefaultUnchanged:true;regionalClimateAccepted:false;};
}
function object(value:unknown,name:string):Record<string,unknown> {
    if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error(`${name} 必须是对象`);
    return value as Record<string,unknown>;
}
function exact(value:unknown,wanted:unknown,name:string):void {
    if(value!==wanted)throw new Error(`${name} 与本次 SpeedyWeather 月平均数据不符`);
}
function finite(value:unknown,name:string,min=-Infinity,max=Infinity):number {
    if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`${name} 含非有限或越界数值`);
    return value;
}
function sequence(value:unknown,length:number,name:string):unknown[] {
    if(!Array.isArray(value)||value.length!==length)throw new Error(`${name} 必须有 ${length} 项`);
    return value;
}
function field(value:unknown,name:string,min=-Infinity,max=Infinity):Float64Array {
    return Float64Array.from(sequence(value,DISPLAY_COUNT,name),v=>finite(v,name,min,max));
}

export function decodeDisplay(value:unknown):DisplayDocument {
    const d=object(value,'月平均数据');
    exact(d.format,'speedyweather-earth-display','数据格式');exact(d.version,1,'数据版本');
    const m=object(d.model,'模型'),g=object(d.grid,'网格'),a=object(d.acceptance,'验收状态');
    const expectedModel={name:'SpeedyWeather',version:'0.23.0',truncation:32,nlayers:8,precision:'Float64',statisticsStart:'2006-01-01T00:00:00Z',statisticsEnd:'2007-01-01T00:00:00Z'} as const;
    const expectedGrid={width:48,height:24,layout:'equal-area-north-first',longitudeWestDeg:-180} as const;
    for(const [key,wanted] of Object.entries(expectedModel))exact(m[key],wanted,`模型 ${key}`);
    for(const [key,wanted] of Object.entries(expectedGrid))exact(g[key],wanted,`网格 ${key}`);
    exact(a.formalDefaultUnchanged,true,'正式默认不变');exact(a.regionalClimateAccepted,false,'区域气候验收');
    let previous=0;
    const sigmaFull=sequence(d.sigmaFull,8,'sigmaFull').map(value=>{
        const sigma=finite(value,'sigmaFull',Number.MIN_VALUE,1);
        if(sigma<=previous)throw new Error('sigmaFull 必须从大气顶端向地表严格递增');
        previous=sigma;return sigma;
    });
    const frames=sequence(d.frames,12,'月平均帧').map((value,index):DisplayFrame=>{
        const f=object(value,`月份 ${index+1}`),s=object(f.surface,`月份 ${index+1} 地表`);
        exact(f.kind,'monthly-mean','月份统计类型');exact(f.month,index+1,'月份顺序');
        if(typeof f.label!=='string'||!f.label.trim()||f.label.length>100)throw new Error('缺少有效月平均标签');
        const layers=sequence(f.layers,8,`月份 ${index+1} 大气层`).map((value,level):DisplayLayer=>{
            const l=object(value,`大气层 ${level+1}`),prefix=`${index+1} 月第 ${level+1} 层`;
            return {temperatureK:field(l.temperatureK,`${prefix} temperatureK`,Number.MIN_VALUE),
                windEastMps:field(l.windEastMps,`${prefix} windEastMps；风速编码范围 ±100 m/s`,-100,100),
                windNorthMps:field(l.windNorthMps,`${prefix} windNorthMps；风速编码范围 ±100 m/s`,-100,100)};
        });
        return {label:f.label,kind:'monthly-mean',month:index+1,timeS:finite(f.timeS,'太阳相位时间',0,Number.MAX_SAFE_INTEGER),layers,
            surface:{pressurePa:field(s.pressurePa,'地表 pressurePa',Number.MIN_VALUE),seaIceConcentration:field(s.seaIceConcentration,'地表 seaIceConcentration',0,1),rainMmDay:field(s.rainMmDay,'地表 rainMmDay',0)}};
    });
    return {format:'speedyweather-earth-display',version:1,model:{...expectedModel},grid:{...expectedGrid},sigmaFull,frames,acceptance:{formalDefaultUnchanged:true,regionalClimateAccepted:false}};
}

export function decodeDisplayText(source:string):DisplayDocument {return decodeDisplay(JSON.parse(source));}

/** Pack for the existing Renderer. The original fields remain unchanged. */
export function packDisplayLayer(layer:{temperatureK:ArrayLike<number>;windEastMps:ArrayLike<number>;windNorthMps:ArrayLike<number>}):{pixels:Uint8Array;width:number;height:number;temperatureSaturated:number} {
    for(const [name,values] of Object.entries(layer))if(values.length!==DISPLAY_COUNT)throw new Error(`${name} 显示维度不符`);
    const pixels=new Uint8Array(4*DISPLAY_COUNT);let temperatureSaturated=0;
    for(let k=0;k<DISPLAY_COUNT;k++) {
        const t=finite(layer.temperatureK[k],'temperatureK',Number.MIN_VALUE),east=finite(layer.windEastMps[k],'windEastMps；风速编码范围 ±100 m/s',-100,100),north=finite(layer.windNorthMps[k],'windNorthMps；风速编码范围 ±100 m/s',-100,100);
        if(t<TEMPERATURE_MIN_K||t>TEMPERATURE_MAX_K)temperatureSaturated++;
        pixels[4*k]=Math.max(0,Math.min(255,Math.round(255*(t-TEMPERATURE_MIN_K)/(TEMPERATURE_MAX_K-TEMPERATURE_MIN_K))));
        pixels[4*k+1]=128+Math.round(1.27*east);pixels[4*k+2]=128+Math.round(1.27*north);pixels[4*k+3]=255;
    }
    return {pixels,width:DISPLAY_WIDTH,height:DISPLAY_HEIGHT,temperatureSaturated};
}

/** Picking UV uses latitude; the displayed data is uniform in sin(latitude). */
export function displayCell(u:number,v:number):number {
    finite(u,'经度');finite(v,'纬度',0,1);
    const x=Math.floor(((u%1+1)%1)*DISPLAY_WIDTH),sinLat=Math.sin((.5-v)*Math.PI);
    const y=Math.max(0,Math.min(DISPLAY_HEIGHT-1,Math.floor((1-sinLat)*.5*DISPLAY_HEIGHT)));
    return y*DISPLAY_WIDTH+x;
}
