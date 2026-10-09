import {STEFAN_BOLTZMANN} from './astronomy.ts';

// One-way visual ice potential, not mass/heat transferred by the water solver.
// Latent capacity prevents a warm day from instantly deleting winter ice.
const FREEZE_K=271.35,LATENT_J_M3=917*334000;
const MAX_ENERGY=2*LATENT_J_M3,COVER_ENERGY=.5*LATENT_J_M3;
const bounded=(energy:number)=>Math.max(0,Math.min(MAX_ENERGY,energy));

/** Linearized cooling potential around seawater freezing, W/m². This uses
 * the ice-free thermal estimate; it is not a resolved surface heat budget. */
export function seaIceCooling(temperatureK:number,emissivity:number) {
    return 4*emissivity*STEFAN_BOLTZMANN*FREEZE_K**3*(FREEZE_K-temperatureK);
}
export function advanceSeaIce(energyJm2:number,coolingWm2:number,dtS:number) {
    return bounded(energyJm2+coolingWm2*dtS);
}
export function seaIceFraction(energyJm2:number) {return Math.max(0,Math.min(1,energyJm2/COVER_ENERGY));}

/** Direct periodic reference from twelve midpoint monthly cooling estimates.
 * A composition of bounded translations is clamp(E + total, low, high).
 * Its fixed point is high for net cooling, low otherwise. Two endpoint
 * sweeps give that fixed point without running any hidden warmup years.
 * Then evaluate the selected date with partial-month energy, not color lerp. */
export function generateSeaIce(cooling:Float64Array,count:number,yearS:number,phaseRad:number) {
    const result=new Float64Array(count),monthS=yearS/12;
    const phase=((phaseRad/(2*Math.PI))%1+1)%1*12,month=Math.floor(phase),fraction=phase-month;
    for(let i=0;i<count;i++) {
        let low=0,high=MAX_ENERGY,total=0;
        for(let m=0;m<12;m++) {
            const delta=cooling[m*count+i]*monthS;total+=delta;
            low=bounded(low+delta);high=bounded(high+delta);
        }
        let energy=total>0?high:low;
        for(let m=0;m<month;m++)energy=advanceSeaIce(energy,cooling[m*count+i],monthS);
        result[i]=advanceSeaIce(energy,cooling[month*count+i],fraction*monthS);
    }
    return result;
}
