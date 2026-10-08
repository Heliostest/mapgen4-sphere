import {DEFAULT_PLANET,finiteInRange,type PlanetConfig} from './planet.ts';
import {deriveOrbit,STEFAN_BOLTZMANN as SIGMA,type OrbitConfig} from './astronomy.ts';

export interface ThermalConfig {emissivity:number;landHeatCapacity:number;oceanDepthM:number;diffusion:number;}
export const DEFAULT_THERMAL:Readonly<ThermalConfig>=Object.freeze({
    emissivity:.61,landHeatCapacity:2e6,oceanDepthM:10,diffusion:.55,
});
export interface ThermalGrid {
    width:number;height:number;count:number;solidAngle:number;
    sinLat:Float64Array;edges:{a:number;b:number;geometry:number}[];
}
export function makeThermalGrid(width=48,height=24):ThermalGrid {
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<4||height<2||width*height>16384) throw new RangeError('Invalid thermal grid');
    const count=width*height,dx=2/height,dl=2*Math.PI/width;
    const sinLat=Float64Array.from({length:height},(_,j)=>1-(j+.5)*dx);
    const edges:ThermalGrid['edges']=[];
    for(let j=0;j<height;j++) for(let i=0;i<width;i++) {
        const a=j*width+i;
        edges.push({a,b:j*width+(i+1)%width,geometry:dx/((1-sinLat[j]**2)*dl)});
        if(j+1<height) edges.push({a,b:a+width,geometry:(1-(1-(j+1)*dx)**2)*dl/dx});
    }
    return {width,height,count,solidAngle:dx*dl,sinLat,edges};
}

/** Body-coordinate equal-area cell, north first; periodic at the date line. */
export function thermalCell(grid:ThermalGrid,u:number,v:number) {
    const i=Math.floor(((u%1+1)%1)*grid.width);
    const j=Math.max(0,Math.min(grid.height-1,Math.floor((1-Math.cos(v*Math.PI))/2*grid.height)));
    return j*grid.width+i;
}
export function landFractions(grid:ThermalGrid,directions:ArrayLike<number>,elevation:ArrayLike<number>) {
    const n=directions.length/3;
    if(n<1 || !Number.isInteger(n) || elevation.length<n) throw new RangeError('Missing terrain snapshot');
    const count=new Uint32Array(grid.count),land=new Float64Array(grid.count);
    for(let r=0;r<n;r++) {
        const u=.5+Math.atan2(directions[3*r],directions[3*r+2])/(2*Math.PI);
        const j=Math.max(0,Math.min(grid.height-1,Math.floor((1-directions[3*r+1])/2*grid.height)));
        const k=j*grid.width+Math.floor(((u%1+1)%1)*grid.width);
        count[k]++;land[k]+=elevation[r]>0?1:0;
    }
    for(let k=0;k<grid.count;k++) {
        if(count[k]) {land[k]/=count[k];continue;}
        // Only needed on sparse inputs: classify the nearest authored region.
        const y=grid.sinLat[Math.floor(k/grid.width)],lon=((k%grid.width+.5)/grid.width-.5)*2*Math.PI;
        const x=Math.sqrt(1-y*y)*Math.sin(lon),z=Math.sqrt(1-y*y)*Math.cos(lon);
        let best=-Infinity,nearest=0;
        for(let r=0;r<n;r++) {
            const dot=x*directions[3*r]+y*directions[3*r+1]+z*directions[3*r+2];
            if(dot>best){best=dot;nearest=r;}
        }
        land[k]=elevation[nearest]>0?1:0;
    }
    return land;
}

/** Exact daily mean at fixed declination, including polar day and night. */
export function dailyMeanInsolation(sinLat:number,declination:number,flux:number) {
    const a=sinLat*Math.sin(declination),b=Math.sqrt(Math.max(0,1-sinLat*sinLat))*Math.cos(declination);
    if(b<1e-14) return flux*Math.max(0,a);
    const h=Math.acos(Math.max(-1,Math.min(1,-a/b)));
    return flux*Math.max(0,(h*a+b*Math.sin(h))/Math.PI);
}
export function heatTransport(grid:ThermalGrid,temperature:ArrayLike<number>,diffusion:number,out:Float64Array=new Float64Array(grid.count)) {
    out.fill(0);
    for(const e of grid.edges) {
        const q=diffusion*e.geometry*(temperature[e.b]-temperature[e.a])/grid.solidAngle;
        out[e.a]+=q;out[e.b]-=q;
    }
    return out;
}
export type ThermalCheckpoint={temperatureK:Float64Array;steps:number;radiationJm2:number};

export class ThermalModel {
    readonly temperatureK:Float64Array;
    readonly capacity:Float64Array;
    readonly initialEnergyJm2:number;
    readonly yearS:number;
    readonly fluxWm2:number;
    readonly transport:number;
    readonly planet:PlanetConfig;
    readonly orbit:OrbitConfig;
    readonly config:ThermalConfig;
    private readonly tendency:Float64Array;
    stepS:number;
    steps=0;
    radiationJm2=0;
    constructor(planet:PlanetConfig,orbit:OrbitConfig,config:ThermalConfig,land:ArrayLike<number>,readonly epochS=0,readonly grid=makeThermalGrid()) {
        const derived=deriveOrbit(planet,orbit);
        finiteInRange(epochS,'thermal epoch',0);
        finiteInRange(config.emissivity,'effective emissivity',.1,1);
        finiteInRange(config.landHeatCapacity,'land heat capacity',1e5,1e8);
        finiteInRange(config.oceanDepthM,'ocean mixed-layer depth',.1,100);
        finiteInRange(config.diffusion,'heat transport coefficient',0,5);
        if(land.length!==grid.count) throw new RangeError('Thermal land grid mismatch');
        this.planet={...planet};this.orbit={...orbit};this.config={...config};
        this.yearS=derived.yearS;this.fluxWm2=derived.fluxWm2;
        this.transport=config.diffusion*(DEFAULT_PLANET.radiusM/planet.radiusM)**2;
        const initial=derived.equilibriumK/Math.pow(config.emissivity,.25);
        this.temperatureK=new Float64Array(grid.count).fill(initial);
        this.capacity=Float64Array.from(land,f=>{
            finiteInRange(f,'land fraction',0,1);
            return f*config.landHeatCapacity+(1-f)*config.oceanDepthM*4.2e6;
        });
        this.tendency=new Float64Array(grid.count);
        const loss=new Float64Array(grid.count);
        for(const e of grid.edges) {const k=this.transport*e.geometry/grid.solidAngle;loss[e.a]+=k;loss[e.b]+=k;}
        const maxT=Math.max(initial,Math.pow((1-orbit.bondAlbedo)*this.fluxWm2/(config.emissivity*SIGMA),.25));
        const radiativeDerivative=4*config.emissivity*SIGMA*maxT**3;
        let stable=Infinity;
        for(let i=0;i<grid.count;i++) stable=Math.min(stable,.45*this.capacity[i]/(loss[i]+radiativeDerivative));
        this.stepS=Math.min(1800,this.yearS/720,stable);
        this.initialEnergyJm2=this.energy();
    }
    get timeS() {return this.epochS+this.steps*this.stepS;}
    private energy() {return this.temperatureK.reduce((sum,t,i)=>sum+this.capacity[i]*t,0)/this.grid.count;}
    checkpoint():ThermalCheckpoint {return {temperatureK:this.temperatureK.slice(),steps:this.steps,radiationJm2:this.radiationJm2};}
    restore(state:ThermalCheckpoint) {this.temperatureK.set(state.temperatureK);this.steps=state.steps;this.radiationJm2=state.radiationJm2;}
    advanceTo(targetS:number,maxSteps=32) {
        finiteInRange(targetS,'thermal time',this.epochS);
        const targetSteps=Math.floor((targetS-this.epochS)/this.stepS+1e-8);
        const end=Math.min(targetSteps,this.steps+maxSteps);
        for(;this.steps<end;this.steps++) this.step();
        return this.steps>=targetSteps;
    }
    private step() {
        const {grid,temperatureK:t,config}=this;
        const phase=this.orbit.orbitPhaseRad+2*Math.PI*(((this.timeS+this.stepS/2)%this.yearS)/this.yearS);
        const declination=Math.asin(Math.sin(this.planet.obliquityRad)*Math.sin(phase));
        const q=new Float64Array(grid.height);
        // Four midpoint quadrature samples per equal-area band, then enforce
        // the known global spherical interception S/4 (small quadrature error).
        for(let j=0;j<grid.height;j++) for(let k=0;k<4;k++) q[j]+=dailyMeanInsolation(1-2*(j+(k+.5)/4)/grid.height,declination,this.fluxWm2)/4;
        const normalizer=this.fluxWm2*.25*grid.height/q.reduce((a,b)=>a+b,0);
        heatTransport(grid,t,this.transport,this.tendency);
        let radiation=0;
        for(let i=0;i<grid.count;i++) {
            const net=(1-this.orbit.bondAlbedo)*q[Math.floor(i/grid.width)]*normalizer-config.emissivity*SIGMA*t[i]**4;
            radiation+=net;
            t[i]+=this.stepS*(net+this.tendency[i])/this.capacity[i];
        }
        this.radiationJm2+=radiation/grid.count*this.stepS;
    }
    diagnostics() {
        let mean=0,min=Infinity,max=-Infinity;
        for(const t of this.temperatureK) {mean+=t;min=Math.min(min,t);max=Math.max(max,t);}
        return {meanK:mean/this.grid.count,minK:min,maxK:max,timeS:this.timeS,
            budgetResidualJm2:this.energy()-this.initialEnergyJm2-this.radiationJm2};
    }
}
