/** SI diagnostics for a spherical, spherically symmetric planet.
 * Constants/preset: https://ssd.jpl.nasa.gov/astro_par.html
 * https://ssd.jpl.nasa.gov/planets/phys_par.html
 * The physical radius never replaces the renderer's scene-unit radius. */
export const G = 6.67430e-11;
export const TAU = 2*Math.PI;

export interface PlanetConfig {
    schemaVersion: 1;
    radiusM: number;
    densityKgM3: number;
    reliefM: number;
    oceanDepthM: number;
    siderealPeriodS: number;
    retrograde: boolean;
    obliquityRad: number;
}

export const DEFAULT_PLANET: Readonly<PlanetConfig> = Object.freeze({
    schemaVersion:1, radiusM:6371008.4, densityKgM3:5513.4,
    reliefM:10000, oceanDepthM:11000, siderealPeriodS:86164.09054,
    retrograde:false, obliquityRad:23.43928*Math.PI/180,
});

export function finiteInRange(value:number, name:string, min:number, max=Number.MAX_VALUE) {
    if(!Number.isFinite(value) || value<min || value>max) throw new RangeError(`${name} is outside its supported range`);
}

export function derivePlanet(config:PlanetConfig) {
    if(config.schemaVersion!==1) throw new RangeError('Unsupported planet configuration');
    for(const key of ['radiusM','densityKgM3','reliefM','oceanDepthM','siderealPeriodS'] as const) {
        finiteInRange(config[key],key,Number.MIN_VALUE);
    }
    finiteInRange(config.obliquityRad,'obliquity',0,Math.PI/2);
    const volumeM3=4*Math.PI/3*config.radiusM**3;
    const massKg=volumeM3*config.densityKgM3, muM3s2=G*massKg;
    const surfaceAreaM2=4*Math.PI*config.radiusM**2;
    const gravityMps2=muM3s2/config.radiusM**2;
    const escapeMps=Math.sqrt(2*muM3s2/config.radiusM);
    const angularSpeedRadS=TAU/config.siderealPeriodS;
    const rotationRatio=angularSpeedRadS**2*config.radiusM/gravityMps2;
    for(const v of [volumeM3,massKg,muM3s2,surfaceAreaM2,gravityMps2,escapeMps,rotationRatio]) {
        if(!Number.isFinite(v)) throw new RangeError('Planet diagnostics overflow');
    }
    return {massKg,muM3s2,surfaceAreaM2,gravityMps2,escapeMps,rotationRatio};
}

/** Elevation is the generator's pre-decoration dimensionless field. */
export function physicalHeight(elevation:number, config:PlanetConfig):number {
    finiteInRange(elevation,'elevation',-1,1);
    return elevation*(elevation>=0 ? config.reliefM : config.oceanDepthM);
}

export function displayExaggeration(config:PlanetConfig, sceneRadius:number, mountainHeight:number):number {
    finiteInRange(sceneRadius,'scene radius',Number.MIN_VALUE);
    finiteInRange(mountainHeight,'display height',0);
    return mountainHeight*config.radiusM/(sceneRadius*config.reliefM);
}
