import {mat4} from 'gl-matrix';
import {sunState,type OrbitConfig} from './astronomy.ts';
import type {PlanetConfig} from './planet.ts';
import type {Direction} from './sphere.ts';
import type {ThermalTexture} from './thermal-runtime.ts';

export type PlanetLayer='original'|'day-night'|'insolation'|'temperature';
export type PlanetCamera='surface'|'space';
export interface PlanetView {
    timeS:number;
    layer:PlanetLayer;
    sunDirection:Direction;
    model:mat4|null;
    fluxWm2:number;
    thermal?:ThermalTexture|null;
}

export function makePlanetView(planet:PlanetConfig,orbit:OrbitConfig,timeS:number,layer:PlanetLayer,camera:PlanetCamera):PlanetView {
    const sun=sunState(planet,orbit,timeS);
    const model=camera==='space' ? mat4.create() : null;
    if(model) {
        mat4.rotateZ(model,model,-planet.obliquityRad);
        mat4.rotateY(model,model,sun.spinAngleRad);
    }
    return {timeS,layer,model,sunDirection:sun.direction,fluxWm2:sun.fluxWm2};
}

// This snippet is imported by the real drape pass and the GPU regression.
// The 18% night floor is an editing aid, never a heat/irradiance source.
export const planet_fragment=`
    uniform int u_planet_layer;
    uniform vec3 u_sun_direction;
    uniform sampler2D u_temperature;
    vec3 temperature_color(float t) {
        vec3 cold=vec3(0.12,0.20,0.65), mild=vec3(0.92,0.94,0.79), hot=vec3(0.80,0.15,0.06);
        return t<0.57142857 ? mix(cold,mild,t/0.57142857) : mix(mild,hot,(t-0.57142857)/0.42857143);
    }
    float planet_cosine(vec3 n) { return max(0.0,dot(normalize(n),u_sun_direction)); }
    vec3 planet_color(vec3 base,vec3 n) {
        if(u_planet_layer==0) return base;
        if(u_planet_layer==3) {
            vec3 body=normalize(n);
            vec2 uv=vec2(0.5+atan(body.x,body.z)/6.28318530718,(1.0-body.y)*0.5);
            return temperature_color(texture(u_temperature,uv).r);
        }
        float cosine=dot(normalize(n),u_sun_direction);
        if(u_planet_layer==1) return base*(0.18+0.82*smoothstep(-0.04,0.12,cosine));
        float q=clamp(cosine,0.0,1.0);
        vec3 cold=vec3(0.08,0.12,0.22), middle=vec3(0.20,0.65,0.70), hot=vec3(0.95,0.35,0.12);
        return q<0.5 ? mix(cold,middle,2.0*q) : mix(middle,hot,2.0*q-1.0);
    }
`;
