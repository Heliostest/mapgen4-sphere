import {derivePlanet, finiteInRange, TAU, type PlanetConfig} from './planet.ts';
import type {Direction} from './sphere.ts';

// Solar preset: JPL solar GM; IAU nominal luminosity. No N-body integration.
export const AU_M = 149597870700;
const SOLAR_GM = 1.32712440041279419e20;
const SOLAR_LUMINOSITY_W = 3.828e26;
export const STEFAN_BOLTZMANN = 5.670374419e-8;

export interface OrbitConfig {
    distanceM:number;
    bondAlbedo:number;
    spinPhaseRad:number;
    orbitPhaseRad:number;
}
export const DEFAULT_ORBIT:Readonly<OrbitConfig>=Object.freeze({
    distanceM:AU_M,bondAlbedo:.3,spinPhaseRad:0,orbitPhaseRad:0,
});

export function deriveOrbit(planet:PlanetConfig, orbit:OrbitConfig) {
    const p=derivePlanet(planet);
    finiteInRange(orbit.distanceM,'orbital distance',Number.MIN_VALUE);
    finiteInRange(orbit.bondAlbedo,'Bond albedo',0,1);
    if(!Number.isFinite(orbit.spinPhaseRad) || !Number.isFinite(orbit.orbitPhaseRad)) throw new RangeError('Invalid phase');
    const yearS=TAU*Math.sqrt(orbit.distanceM**3/(SOLAR_GM+p.muM3s2));
    const fluxWm2=SOLAR_LUMINOSITY_W/(4*Math.PI*orbit.distanceM**2);
    const equilibriumK=Math.pow((1-orbit.bondAlbedo)*fluxWm2/(4*STEFAN_BOLTZMANN),.25);
    const spinRate=(planet.retrograde ? -1 : 1)/planet.siderealPeriodS, orbitRate=1/yearS;
    const relativeRate=Math.abs(spinRate-orbitRate);
    const solarDayS=relativeRate<=1e-12*Math.max(Math.abs(spinRate),orbitRate) ? Infinity : 1/relativeRate;
    if(!Number.isFinite(yearS) || yearS<=0 || !Number.isFinite(fluxWm2) || !Number.isFinite(equilibriumK)) throw new RangeError('Orbit diagnostics overflow');
    return {yearS,fluxWm2,equilibriumK,solarDayS};
}

export function wrapAngle(angle:number):number { return ((angle%TAU)+TAU)%TAU; }

/** Body +Y is north and longitude zero is +Z. Epoch is northern equinox.
 * Body-to-inertial = Rz(-obliquity) Ry(spin). The sun follows +Ry(orbit).
 * This keeps sidereal spin, annual motion and the navigation camera separate. */
export function sunState(planet:PlanetConfig, orbit:OrbitConfig, timeS:number) {
    finiteInRange(timeS,'simulation time',0);
    const {yearS,fluxWm2}=deriveOrbit(planet,orbit);
    const spinAngleRad=wrapAngle(orbit.spinPhaseRad+(planet.retrograde ? -1 : 1)*TAU*((timeS%planet.siderealPeriodS)/planet.siderealPeriodS));
    const orbitAngleRad=wrapAngle(orbit.orbitPhaseRad+TAU*((timeS%yearS)/yearS));
    const x=Math.cos(planet.obliquityRad)*Math.sin(orbitAngleRad);
    const y=Math.sin(planet.obliquityRad)*Math.sin(orbitAngleRad);
    const z=Math.cos(orbitAngleRad),c=Math.cos(spinAngleRad),s=Math.sin(spinAngleRad);
    const direction:Direction=[c*x-s*z,y,s*x+c*z];
    return {direction,spinAngleRad,orbitAngleRad,declinationRad:Math.asin(Math.max(-1,Math.min(1,y))),fluxWm2};
}

/** Top-of-atmosphere irradiance; artist lighting does not enter this value. */
export function incidentFlux(normal:ArrayLike<number>, sun:ArrayLike<number>, fluxWm2:number):number {
    return fluxWm2*Math.max(0,Math.min(1,normal[0]*sun[0]+normal[1]*sun[1]+normal[2]*sun[2]));
}

export function localSolarHour(normal:ArrayLike<number>,sun:ArrayLike<number>):number|null {
    if(Math.hypot(normal[0],normal[2])<1e-8 || Math.hypot(sun[0],sun[2])<1e-8) return null;
    return (12+(Math.atan2(normal[0],normal[2])-Math.atan2(sun[0],sun[2]))*12/Math.PI+24)%24;
}
