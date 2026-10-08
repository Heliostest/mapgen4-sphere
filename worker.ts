/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module runs the worker thread that calculates the map data.
 */

import {SphereMesh} from "./sphere-mesh.ts";
import Map      from "./map.ts";
import Geometry from "./geometry.ts";
import type {Mesh} from "./types.d.ts";

// NOTE: Typescript workaround https://github.com/Microsoft/TypeScript/issues/20595
const worker: Worker = self as any;

// This handler is for the initial message
let handler = (event) => {
    // NOTE: web worker messages only include the data; to
    // reconstruct the full object I call the constructor again
    // and then copy the data over
    const mesh = new SphereMesh(event.data.mesh);
    const map = new Map(mesh as Mesh, event.data.t_peaks, event.data.param);

    // TODO: placeholder - calculating elevation+biomes takes 35% of
    // the time on my laptop, and seeing the elevation change is the
    // most important thing to do every frame, so it might be worth
    // splitting this work up into multiple frames where
    // elevation+biomes happen every frame but rivers happen every N
    // frames. To do this I could either put the logic on the caller
    // side to decide on partial vs full update, or have the code here
    // decide. The advantage of deciding here is that we have the
    // timing information and can do full updates on faster machines
    // and partial updates on slower machines. But the advantage of
    // deciding in the caller is that it knows whether there's
    // painting going on, and can sneak in river updates while the
    // user has stopped painting.
    const run = {biomes: true, rivers: true};
    
    // This handler is for all subsequent messages
    handler = (event) => {
        let {param, constraints, offsets, revision, quad_elements_buffer, a_quad_em_buffer, a_river_xyww_buffer} = event.data;

        let numRiverTriangles = 0;
        let start_time = performance.now();
        
        if (run.biomes) {
            map.assignElevation(param.elevation, constraints, offsets);
            map.assignRainfall(param.biomes);
        }
        if (run.rivers) {
            map.assignRivers(param.rivers);
        }
        if (run.biomes || run.rivers) {
            Geometry.setMapGeometry(map, param.elevation.mountain_folds, new Int32Array(quad_elements_buffer), new Float32Array(a_quad_em_buffer));
        }
        if (run.rivers) {
            numRiverTriangles = Geometry.setRiverGeometry(map, param.spacing, param.rivers, new Float32Array(a_river_xyww_buffer));
        }
        let elapsed = performance.now() - start_time;
        // Snapshot the generated surface BEFORE decorative mountain folds.
        // Keep it paired with this geometry, never transfer the map's own state.
        const terrainElevation=new Float32Array(mesh.numRegions+mesh.numTriangles);
        terrainElevation.set(map.elevation_r);
        terrainElevation.set(map.elevation_t,mesh.numRegions);
        const baseline=map.baseElevation_t.slice();

        worker.postMessage(
            {elapsed,revision,
             numRiverTriangles,
             quad_elements_buffer,
             a_quad_em_buffer,
             a_river_xyww_buffer,
             terrain_elevation_buffer:terrainElevation.buffer,
             base_triangle_elevation_buffer:baseline.buffer,
            },
            [
                quad_elements_buffer,
                a_quad_em_buffer,
                a_river_xyww_buffer,
                terrainElevation.buffer,
                baseline.buffer,
            ]
        );
    };
};


onmessage = event => handler(event);
