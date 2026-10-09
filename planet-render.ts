import {mat4} from 'gl-matrix';
import {sunState,type OrbitConfig} from './astronomy.ts';
import type {PlanetConfig} from './planet.ts';
import type {Direction} from './sphere.ts';
import type {ThermalTexture} from './thermal-runtime.ts';
import type {GeomorphView} from './geomorph-runtime.ts';

export type PlanetLayer='original'|'day-night'|'insolation'|'temperature'|'precipitation'|'soil-moisture'|'runoff'|'erosion'|'wind'|'surface';
export type PlanetCamera='surface'|'space';
export interface PlanetView {
    timeS:number;
    layer:PlanetLayer;
    sunDirection:Direction;
    model:mat4|null;
    fluxWm2:number;
    thermal?:ThermalTexture|null;
    water?:ThermalTexture|null;
    surface?:ThermalTexture|null;
    geomorph?:GeomorphView|null;
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
    uniform sampler2D u_hydrology;
    uniform sampler2D u_geomorph;
    uniform sampler2D u_surface;
    uniform vec4 u_surface_north, u_surface_south;
    vec3 surface_color(vec3 base,vec3 n,float elevation) {
        if(u_planet_layer!=9) return base;
        vec3 body=normalize(n);
        vec2 uv=vec2(0.5+atan(body.x,body.z)/6.28318530718,(1.0-body.y)*0.5);
        vec4 cover=texture(u_surface,uv);
        // The last row is centered away from the pole. Clamping that row all
        // the way to ±90° creates one differently colored wedge per longitude.
        float edge=1.0-1.0/float(textureSize(u_surface,0).y);
        float polar=smoothstep(edge,1.0,abs(body.y));
        cover=mix(cover,body.y>0.0?u_surface_north:u_surface_south,polar);
        // Use fine terrain for the coastline, never the coarse climate land fraction.
        return elevation>0.0 ? cover.rgb : mix(base,vec3(0.79,0.88,0.90),cover.a);
    }
    vec3 temperature_color(float t) {
        vec3 cold=vec3(0.12,0.20,0.65), mild=vec3(0.92,0.94,0.79), hot=vec3(0.80,0.15,0.06);
        return t<0.57142857 ? mix(cold,mild,t/0.57142857) : mix(mild,hot,(t-0.57142857)/0.42857143);
    }
    float planet_cosine(vec3 n) { return max(0.0,dot(normalize(n),u_sun_direction)); }
    float wind_segment(vec2 p,vec2 a,vec2 b) {
        vec2 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
    }
    vec3 planet_color(vec3 base,vec3 n) {
        if(u_planet_layer==0 || u_planet_layer==9) return base;
        if(u_planet_layer>=3) {
            vec3 body=normalize(n);
            vec2 uv=vec2(0.5+atan(body.x,body.z)/6.28318530718,(1.0-body.y)*0.5);
            if(u_planet_layer==3) return temperature_color(texture(u_temperature,uv).r);
            if(u_planet_layer==8) {
                vec2 cells=vec2(48.0,24.0),center=(floor(uv*cells)+0.5)/cells;
                vec2 wind=(texture(u_temperature,center).gb*255.0-128.0)/1.27;
                float speed=length(wind);vec2 d=vec2(wind.x,-wind.y)/max(speed,0.001),p=fract(uv*cells)-0.5;
                p=vec2(dot(p,d),dot(p,vec2(-d.y,d.x)));
                float line=min(wind_segment(p,vec2(-0.28,0.0),vec2(0.28,0.0)),min(wind_segment(p,vec2(0.28,0.0),vec2(0.08,0.15)),wind_segment(p,vec2(0.28,0.0),vec2(0.08,-0.15))));
                vec3 background=mix(vec3(0.08,0.16,0.30),vec3(0.12,0.65,0.55),clamp(speed/30.0,0.0,1.0));
                return mix(background,vec3(0.96,0.93,0.73),(1.0-smoothstep(0.02,0.05,line))*step(0.4,speed));
            }
            if(u_planet_layer==7) {
                vec4 g=texture(u_geomorph,uv);
                vec3 change=g.r<0.5?mix(vec3(0.12,0.25,0.75),vec3(0.93,0.92,0.82),g.r*2.0):mix(vec3(0.93,0.92,0.82),vec3(0.80,0.20,0.08),g.r*2.0-1.0);
                return mix(vec3(0.08,0.20,0.35),change,g.a);
            }
            vec4 water=texture(u_hydrology,uv);
            vec3 dry=vec3(0.08,0.12,0.22), wet=vec3(0.20,0.75,0.80), rain=vec3(0.96,0.95,0.72);
            if(u_planet_layer==4) return water.r<0.5 ? mix(dry,wet,2.0*water.r) : mix(wet,rain,2.0*water.r-1.0);
            if(u_planet_layer==5) return mix(vec3(0.08,0.20,0.35),mix(vec3(0.55,0.31,0.12),vec3(0.12,0.65,0.40),water.g),water.a);
            return mix(dry,wet,water.b);
        }
        float cosine=dot(normalize(n),u_sun_direction);
        if(u_planet_layer==1) return base*(0.18+0.82*smoothstep(-0.04,0.12,cosine));
        float q=clamp(cosine,0.0,1.0);
        vec3 cold=vec3(0.08,0.12,0.22), middle=vec3(0.20,0.65,0.70), hot=vec3(0.95,0.35,0.12);
        return q<0.5 ? mix(cold,middle,2.0*q) : mix(middle,hot,2.0*q-1.0);
    }
`;
