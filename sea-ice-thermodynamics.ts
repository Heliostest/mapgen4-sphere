import {STEFAN_BOLTZMANN as SIGMA} from './astronomy.ts';

export const SEA_ICE_FREEZE_K=271.35;
// Zero-layer ice: diagnostic skin, no extra sensible-heat reservoir.
// MITgcm SEAICE reference conductivity; thickness is inferred from inventory.
// https://mitgcm.readthedocs.io/en/latest/phys_pkgs/seaice.html#thermodynamics
const ICE_CONDUCTIVITY=2.1656,ICE_DENSITY=917,COVER_THICKNESS_M=.5,EXCHANGE=10;
export interface IceSurfaceInput {
    wetArea:number;marineArea:number;iceKgM2:number;waterK:number;airK:number;
    waterCapacity:number;airCapacity:number;absorbedWm2:number;emissivity:number;dt:number;
    waterAlbedo?:number;iceAlbedo?:number;
}
/** Fluxes are per whole parent cell, except skinK. Radiation is external;
 * sensible exchange is internal. Their difference enters the ocean reservoir
 * and the existing finite, conservative phase solver supplies fusion heat.
 * Cold ice loses heat through K/h, rather than radiating at mixed-layer T.
 * No sea-snow or independent concentration state is inferred here. */
export function seaIceSurfaceExchange(x:IceSurfaceInput) {
    const cover=x.marineArea>0?Math.min(1,x.iceKgM2/(ICE_DENSITY*COVER_THICKNESS_M*x.marineArea)):0;
    const iceArea=x.marineArea*cover,openArea=x.wetArea-iceArea;
    // Preserve the externally assigned whole-column sunshine, but allocate
    // it by surface absorptivity. A lead must not reflect at the ice albedo.
    const waterAbsorptivity=1-(x.waterAlbedo??0),iceAbsorptivity=1-(x.iceAlbedo??0);
    const absorbedWeight=openArea*waterAbsorptivity+iceArea*iceAbsorptivity;
    const openShortwaveWm2=absorbedWeight>0?x.wetArea*x.absorbedWm2*openArea*waterAbsorptivity/absorbedWeight:0;
    const iceShortwaveWm2=x.wetArea*x.absorbedWm2-openShortwaveWm2;
    const iceSunshine=iceArea>0?iceShortwaveWm2/iceArea:0;
    let waterK=x.waterK,airK=x.airK;
    const openRadiation=openShortwaveWm2-openArea*x.emissivity*SIGMA*waterK**4;
    waterK+=x.dt*openRadiation/x.waterCapacity;
    const rate=EXCHANGE*openArea*(1/x.airCapacity+1/x.waterCapacity);
    const openHeat=(waterK-airK)*(-Math.expm1(-x.dt*rate))/(1/x.airCapacity+1/x.waterCapacity);
    waterK-=openHeat/x.waterCapacity;airK+=openHeat/x.airCapacity;
    if(iceArea===0)return {waterK,airK,radiationWm2:openRadiation,openShortwaveWm2,iceShortwaveWm2,iceArea,skinK:SEA_ICE_FREEZE_K,conductiveWm2:0,iceAirWm2:0,iceOceanWm2:0,balanceResidualWm2:0};
    const thickness=x.iceKgM2/(ICE_DENSITY*iceArea),conductance=ICE_CONDUCTIVITY/thickness;
    // Phase change maintains the freezing boundary only while liquid is
    // available. A cold/exhausted mixed layer cannot supply heat at 271.35 K.
    const bottomK=Math.min(SEA_ICE_FREEZE_K,waterK);
    const balance=(t:number)=>conductance*(bottomK-t)+iceSunshine-x.emissivity*SIGMA*t**4-EXCHANGE*(t-airK);
    let skinK=SEA_ICE_FREEZE_K;
    if(balance(skinK)<0) {
        let lo=0,hi=skinK;skinK=Math.min(skinK,Math.max(lo,airK));
        for(let j=0;j<20;j++) {
            const residual=balance(skinK);if(Math.abs(residual)<1e-10)break;
            if(residual>0)lo=skinK;else hi=skinK;
            const next=skinK+residual/(conductance+4*x.emissivity*SIGMA*skinK**3+EXCHANGE);
            skinK=next>lo&&next<hi?next:(lo+hi)/2;
        }
    }
    const iceRadiation=iceShortwaveWm2-iceArea*x.emissivity*SIGMA*skinK**4;
    const iceAirWm2=iceArea*EXCHANGE*(skinK-airK),iceOceanWm2=iceRadiation-iceAirWm2;
    waterK+=x.dt*iceOceanWm2/x.waterCapacity;airK+=x.dt*iceAirWm2/x.airCapacity;
    const conductiveWm2=iceArea*conductance*(bottomK-skinK);
    return {waterK,airK,radiationWm2:openRadiation+iceRadiation,openShortwaveWm2,iceShortwaveWm2,iceArea,skinK,conductiveWm2,iceAirWm2,iceOceanWm2,
        balanceResidualWm2:skinK<SEA_ICE_FREEZE_K?iceOceanWm2+conductiveWm2:0};
}
