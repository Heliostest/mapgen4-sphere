import {SPHERE_RADIUS} from './sphere.ts';
import {MIN_ZOOM,MAX_ZOOM} from './sphere-view.ts';
// each parameter is [initial value, low, high]
export const initialParams: Record<string, [string, number, number, number][]> = {
    elevation: [
        ['seed', 187, 1, 1 << 30],
        ['island', 0.5, 0, 1],
        ['noisy_coastlines', 0.01, 0, 0.1],
        ['hill_height', 0.02, 0, 0.1],
        ['mountain_jagged', 0, 0, 1],
        ['mountain_sharpness', 9.8, 9.1, 12.5],
        ['mountain_folds', 0.05, 0.0, 0.5],
        ['ocean_depth', 1.40, 1, 3],
    ],
    biomes: [
        ['wind_angle_deg', 0, 0, 360],
        ['raininess', 0.9, 0, 2],
        ['rain_shadow', 0.5, 0.1, 2],
        ['evaporation', 0.5, 0, 1],
    ],
    rivers: [
        ['lg_min_flow', 2.7, -5, 5],
        ['lg_river_width', -2.4, -5, 5],
        ['flow', 0.2, 0, 1],
    ],
    render: [
        ['sphere_radius', SPHERE_RADIUS, 100, 1000],
        ['zoom', 100/350, MIN_ZOOM, MAX_ZOOM],
        ['x', 500, 0, 1000],
        ['y', 500, 0, 1000],
        ['light_angle_deg', 80, 0, 360],
        ['slope', 2, 0, 5],
        ['flat', 2.5, 0, 5],
        ['ambient', 0.25, 0, 1],
        ['overhead', 30, 0, 60],
        ['tilt_deg', 0, 0, 90],
        ['rotate_deg', 0, -180, 180],
        ['mountain_height', 50, 0, 250],
        ['outline_depth', 1, 0, 2],
        ['outline_strength', 15, 0, 30],
        ['outline_threshold', 0, 0, 100],
        ['outline_coast', 0, 0, 1],
        ['outline_water', 13.0, 0, 20], // things start going wrong when this is high
        ['biome_colors', 1, 0, 1],
    ],
};


export function defaultTerrainParameters() {
    return Object.fromEntries(Object.entries(initialParams).map(([phase,fields])=>[phase,Object.fromEntries(fields.map(([key,value])=>[key,value]))]));
}
