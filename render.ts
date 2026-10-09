/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018, 2025 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module uses webgl to render the generated maps
 */

import {mat4} from 'gl-matrix';
import {SURFACE_WIDTH,SURFACE_HEIGHT} from './surface-grid.ts';
import colormap from "./colormap.ts";
import Geometry from "./geometry.ts";
import {atlasTriangles, SPHERE_RADIUS} from './sphere.ts';
import {sphereProjection, pickTerrain, pickTerrainHit, terrainPosition} from './sphere-view.ts';
import {planet_fragment, type PlanetView} from './planet-render.ts';
import {previewElevation,type TerrainPreview} from './terrain-preview.ts';
import type {Mesh} from "./types.d.ts";
import type {TerrainWaterView} from './terrain-water-view.ts';

//////////////////////////////////////////////////////////////////////
// WebGL wrappers

type Buffer = {
    bind(): void;
    vertexAttribPointer(index: GLuint, size: GLint, type: GLenum, normalized: GLboolean, stride: GLsizei, offset: GLintptr): void;
    subdata(offset: number, data: AllowSharedBufferSource): void;
}

type Program = {
    run(body: () => void): void;
    [name: `a_${string}`]: GLint;
    [name: `u_${string}`]: WebGLUniformLocation;
}

type Texture = {
    id: WebGLTexture;
    width: number;
    height: number;
    bind(): void;
    activate(register: GLint, uniform: WebGLUniformLocation): void;
}

type Framebuffer = {
    id: WebGLFramebuffer;
    texture: Texture | null;
    depth: boolean;
    bind(): void;
    viewport(): void;
    clear(r: number, g: number, b: number, a: number): void;
}

class WebGLWrapper {
    gl: WebGL2RenderingContext;

    constructor (canvas: HTMLCanvasElement) {
        this.gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
        if (!this.gl) { alert("This project requires WebGL 2."); return; }
        canvas.addEventListener('webglcontextlost', () => console.error("This project not handle WebGL context loss"));
        const ext_color_buffer_float = this.gl.getExtension('EXT_color_buffer_float'); // 99.93% support
        if (!ext_color_buffer_float) { alert("This project requires WebGL2 EXT_color_buffer_float"); }
    }

    createBuffer(options: {indices?: boolean, update: 'static' | 'dynamic', data: AllowSharedBufferSource}): Buffer {
        const {gl} = this;
        const target = options.indices ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
        const buffer = gl.createBuffer();
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, options.data, options.update === 'static'? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);
        return {
            bind() {
                gl.bindBuffer(target, buffer);
            },
            vertexAttribPointer(index, size, type, normalized, stride, offset) {
                this.bind();
                gl.enableVertexAttribArray(index);
                gl.vertexAttribPointer(index, size, type, normalized, stride, offset);
            },
            subdata(offset: number, data: AllowSharedBufferSource) {
                this.bind();
                gl.bufferSubData(target, offset, data);
            },
        };
    }

    createTexture(options: {width?: number, height?: number, mipmap?: boolean, image?: HTMLCanvasElement, data?: Uint8Array, internalFormat?: GLenum, format?: GLenum, filter: 'linear'|'nearest'}): Texture {
        const {gl} = this;
        const texture = gl.createTexture();
        const textureUnits=gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) as number;
        gl.bindTexture(gl.TEXTURE_2D, texture);

        if (options.image) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, options.image);
        } else if (options.width && options.height) {
            gl.texStorage2D(gl.TEXTURE_2D, 1, options.internalFormat ?? gl.RGBA8, options.width, options.height);
            if (options.data) {
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, options.width, options.height, options.format ?? gl.RGBA, gl.UNSIGNED_BYTE, options.data);
            }
        } else {
            throw "createTexture needs either an image or a width✕height";
        }

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.filter === 'linear'? gl.LINEAR : gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, options.filter === 'linear'? gl.LINEAR : gl.NEAREST);
        if (options.mipmap) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.filter === 'linear'? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST);
            gl.generateMipmap(gl.TEXTURE_2D);
        }

        gl.bindTexture(gl.TEXTURE_2D, null);
        return {
            id: texture,
            width: options.width ?? options.image.width,
            height: options.height ?? options.image.height,
            bind() {
                gl.bindTexture(gl.TEXTURE_2D, texture);
            },
            activate(register: GLint, uniform: WebGLUniformLocation) {
                if (register < gl.TEXTURE0 || register >= gl.TEXTURE0+textureUnits) throw "invalid texture register";
                gl.uniform1i(uniform, register - gl.TEXTURE0);
                gl.activeTexture(register);
                this.bind();
            }
        };
    }

    _createFramebufferWrapper(framebuffer: WebGLFramebuffer | null, texture: Texture | null, depth: boolean): Framebuffer {
        const {gl} = this;
        return {
            id: framebuffer,
            texture,
            depth,
            bind() {
                gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            },
            viewport() {
                this.bind();
                const image = this.texture ?? gl.canvas;
                gl.viewport(0, 0, image.width, image.height);
            },
            clear(r, g, b, a) {
                this.bind();
                gl.clearColor(r, g, b, a);
                gl.clear(gl.COLOR_BUFFER_BIT | (this.depth? gl.DEPTH_BUFFER_BIT : 0));
            },
        };
    }

    drawToScreen(): Framebuffer {
        return this._createFramebufferWrapper(null, null, true);
    }

    createFramebuffer(width: number, height: number, options: {depth?: boolean, internalFormat?: GLenum, format?: GLenum, filter: 'linear'|'nearest'}): Framebuffer {
        const {gl} = this;
        const texture = this.createTexture({width, height, internalFormat: options.internalFormat, format: options.format, filter: options.filter});
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture.id, 0);

        if (options.depth) {
            const depthBuffer = gl.createRenderbuffer();
            gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, texture.width, texture.height);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
        }

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error("Framebuffer is not complete:", status.toString(16));
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return this._createFramebufferWrapper(framebuffer, texture, options.depth ?? false);
    }

    createProgram(name: string, vert: string, frag: string, setup: (gl: WebGL2RenderingContext, program: Program) => void): Program {
        const {gl} = this;

        function createShader(type, source): WebGLShader {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, "#version 300 es\n" + source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(`Error compiling shader for program ${name}`);
                console.error(gl.getShaderInfoLog(shader));
            }
            return shader;
        }

        const vs = createShader(gl.VERTEX_SHADER, vert);
        const fs = createShader(gl.FRAGMENT_SHADER, frag);
        const pr = gl.createProgram();
        gl.attachShader(pr, vs);
        gl.attachShader(pr, fs);
        gl.linkProgram(pr);

        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
            console.error(`Error linking shaders for program ${name}`);
            console.error(gl.getProgramInfoLog(pr));
        }

        gl.validateProgram(pr);
        if (!gl.getProgramParameter(pr, gl.VALIDATE_STATUS)) {
            console.warn(`Warning while validating shaders for program ${name}`);
            console.warn(gl.getProgramInfoLog(pr));
        }

        gl.deleteShader(vs);
        gl.deleteShader(fs);

        const vao = gl.createVertexArray();

        let program: Program = {
            run(body) {
                gl.bindVertexArray(vao);
                gl.useProgram(pr);
                body();
                gl.bindVertexArray(null);
            },
        };

        for (let i = 0; i < gl.getProgramParameter(pr, gl.ACTIVE_ATTRIBUTES); i++) {
            let name = gl.getActiveAttrib(pr, i).name;
            program[name] = gl.getAttribLocation(pr, name);
        }
        for (let i = 0; i < gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS); i++) {
            let name = gl.getActiveUniform(pr, i).name;
            program[name] = gl.getUniformLocation(pr, name);
        }

        gl.bindVertexArray(vao);
        setup(gl, program);
        gl.bindVertexArray(null);

        return program;
    }
}


//////////////////////////////////////////////////////////////////////
// Shaders

const vert_lakes = `
    precision highp float;
    in vec2 a_xy;
    in vec3 a_water;
    uniform mat4 u_projection;
    out vec3 v_water;
    void main(){v_water=a_water;gl_Position=u_projection*vec4(a_xy,0,1);}`;
const frag_lakes = `
    precision highp float;
    in vec3 v_water;
    out vec4 out_fragcolor;
    void main(){
        float depth=v_water.y-v_water.x;
        float lake=smoothstep(0.0,max(0.02,fwidth(depth)),depth)*step(0.001,v_water.x);
        out_fragcolor=vec4(lake,v_water.z,0,1);
    }`;

const vert_river = `
    precision highp float;
    uniform mat4 u_projection;
    in vec4 a_xyww; // x, y, width1, width2 (widths are constant across vertices)
    in vec3 a_barycentric;
    out vec2 v_riverwidth;
    out vec3 v_barycentric;
    void main() {
        v_riverwidth = a_xyww.ba;
        v_barycentric = a_barycentric;
        gl_Position = u_projection * vec4(a_xyww.xy, 0, 1);
    }`;

const frag_river = `
    precision mediump float;
    in vec2 v_riverwidth;
    in vec3 v_barycentric;
    out vec4 out_fragcolor;
    const vec3 blue = vec3(0.2, 0.5, 0.7);
    void main() {
        float xt = v_barycentric.r / (v_barycentric.b + v_barycentric.r);
        float dist = sqrt(v_barycentric.b*v_barycentric.b + v_barycentric.r*v_barycentric.r + v_barycentric.b*v_barycentric.r);
        float pos = 0.5;
        float width = 0.35 * mix(v_riverwidth.x, v_riverwidth.y, xt); // variable width from r side to b side
        // NOTE: I've tried using screen space derivatives to make widths consistent between adjacent triangles,
        // but it ended up looking worse, so I reverted it. I multiplied the width by 2.0 * fwidth(v_barycentric.g)
        // and removed the divide by / s_length[s] in setRiverGeometry().
        // NOTE: the smoothstep is from w + minwidth to w - antialias thickness, but antialias thickness should
        // be calculated based on the matrix transform because we want it to be roughly 1 pixel; the min width should
        // probably also be 1 pixel
        float in_river = smoothstep(width + 0.025, max(0.0, width - 0.05), abs(dist - pos));
        vec4 river_color = in_river * vec4(blue, 1);
        // HACK: for debugging - if (min(v_barycentric.r, min(v_barycentric.g, v_barycentric.b)) < 0.05) river_color = vec4(0, 0, 0, 1);
        out_fragcolor = river_color;
    }`;

const vert_land = `
    precision highp float;
    uniform mat4 u_projection;
    in vec2 a_xy;
    in vec2 a_em; // NOTE: moisture channel unused
    out float v_e;
    out vec2 v_xy;
    void main() {
        vec4 pos = u_projection * vec4(a_xy, 0, 1);
        v_xy = (1.0 + pos.xy) * 0.5;
        v_e = a_em.x;
        gl_Position = pos;
    }`;

 const frag_land = `
    precision highp float;
    uniform sampler2D u_water;
    uniform float u_outline_water;
    in float v_e;
    in vec2 v_xy;
    out vec4 out_elevation;
    void main() {
        float e = 0.5 * (1.0 + v_e);
        float river = texture(u_water, v_xy).a;
        if (e >= 0.5) {
            float bump = u_outline_water / 256.0;
            float L1 = e + bump;
            float L2 = (e - 0.5) * (bump * 100.0) + 0.5;
            // TODO: simplify equation
            e = min(L1, mix(L1, L2, river));
        }
        out_elevation = vec4(e, 0, 0, 1);
    }`;

export const sphere_vertex = `
    uniform float u_mountain_height;
    uniform float u_sphere_radius;
    vec3 sphere_direction(vec2 xy) {
        float lon = (xy.x / 1000.0 - 0.5) * 6.28318530718;
        float lat = (0.5 - xy.y / 1000.0) * 3.14159265359;
        return vec3(cos(lat)*sin(lon), sin(lat), cos(lat)*cos(lon));
    }
    vec3 sphere_position(vec2 xy, float e) {
        vec3 n=sphere_direction(xy);
        float height=u_mountain_height*max(0.0,e);
        return n*(u_sphere_radius+height);
    }
`;

const vert_depth = `
    precision highp float;
    ${sphere_vertex}
    uniform mat4 u_projection;
    in vec2 a_xy;
    in vec2 a_em;
    out float v_z;
    void main() {
        vec4 pos = u_projection * vec4(sphere_position(a_xy, a_em.x), 1);
        v_z = a_em.x;
        gl_Position = pos;
    }`;

const frag_depth = `
    precision highp float;
    in float v_z;
    out vec4 out_depth;
    void main() {
        out_depth = vec4(v_z, 0, 0, 1);
    }`;

const vert_drape = `
    precision highp float;
    ${sphere_vertex}
    uniform mat4 u_projection;
    in vec2 a_xy;
    in vec2 a_em;
    out vec2 v_em, v_uv, v_xy;
    out float v_z;
    void main() {
        v_em = a_em;
        v_z = max(0.0, a_em.x); // sea stays on the base sphere
        vec4 pos = u_projection * vec4(sphere_position(a_xy, a_em.x), 1);
        v_uv = a_xy / 1000.0;
        v_xy = (1.0 + pos.xy) * 0.5;
        gl_Position = pos;
    }`;

const frag_drape = `
    precision highp float;
    ${planet_fragment}
    uniform sampler2D u_colormap;
    uniform sampler2D u_elevation;
    uniform sampler2D u_water;
    uniform sampler2D u_depth;
    uniform vec2 u_light_angle, u_inverse_texture_size, u_inverse_screen_size;
    uniform mat4 u_rotation;
    uniform float u_sphere_radius;
    uniform float u_slope, u_flat,
                  u_ambient, u_overhead,
                  u_outline_strength, u_outline_coast, u_outline_water,
                  u_outline_depth, u_outline_threshold,
                  u_biome_colors;
    in vec2 v_uv, v_xy, v_em;
    in float v_z;
    out vec4 out_fragcolor;

    const vec3 neutral_land_biome = vec3(0.9, 0.8, 0.7);
    const vec3 neutral_water_biome = 0.8 * neutral_land_biome;

    void main() {
        vec2 sample_offset = 0.5 * u_inverse_texture_size;
        vec2 pos = v_uv + sample_offset;
        vec2 dx = vec2(u_inverse_texture_size.x, 0),
             dy = vec2(0, u_inverse_texture_size.y);

        float z  = texture(u_elevation, pos).x;
        float zE = texture(u_elevation, pos + dx).x;
        float zN = texture(u_elevation, pos - dy).x;
        float zW = texture(u_elevation, pos - dx).x;
        float zS = texture(u_elevation, pos + dy).x;
        // Same artist-controlled Mapgen4 slope lighting, with derivatives
        // measured in equal surface distances instead of stretched atlas pixels.
        float lat = (0.5-v_uv.y)*3.14159265359;
        float lon = (v_uv.x-0.5)*6.28318530718;
        float metric_y = 3.14159265359 * u_sphere_radius / 1000.0;
        float metric_x = 2.0 * metric_y * max(0.035, cos(lat));
        vec3 slope_vector = normalize(vec3((zS-zN)/(2.0*dy.y*metric_y),
                                          (zE-zW)/(2.0*dx.x*metric_x), max(0.001,u_overhead)));
        vec3 east = mat3(u_rotation)*vec3(cos(lon),0,-sin(lon));
        vec3 south = mat3(u_rotation)*vec3(sin(lat)*sin(lon),-cos(lat),sin(lat)*cos(lon));
        vec2 screen_light = vec2(u_light_angle.y,-u_light_angle.x);
        vec2 local_light = vec2(dot(screen_light,south.xy),dot(screen_light,east.xy));
        local_light /= max(0.001,length(local_light));
        vec3 light_vector = normalize(vec3(local_light, mix(u_slope, u_flat, slope_vector.z)));
        float light = u_ambient + max(0.0, dot(light_vector, slope_vector));
        vec3 neutral_biome_color = neutral_land_biome;
        vec4 water_color = texture(u_water, pos);
        if (z >= 0.5 && v_z >= 0.0) {
            // on land, lower the elevation around rivers
            z -= u_outline_water / 256.0 * (1.0 - water_color.a);
        } else {
            // in the ocean, or underground, don't draw rivers
            water_color.a = 0.0; neutral_biome_color = neutral_water_biome;
        }
        vec3 biome_color = texture(u_colormap, vec2(z, v_em.y)).rgb;
        water_color = mix(vec4(neutral_water_biome * (1.2 - water_color.a), water_color.a), water_color, u_biome_colors);
        biome_color = mix(neutral_biome_color, biome_color, u_biome_colors);
        if (v_z < 0.0) {
            // at the exterior boundary, we'll draw soil or water underground
            float land_or_water = smoothstep(0.0, -0.001, v_em.x - v_z);
            vec3 soil_color = vec3(0.4, 0.3, 0.2);
            vec3 underground_color = mix(soil_color, mix(neutral_water_biome, vec3(0.1, 0.1, 0.2), u_biome_colors), land_or_water) * smoothstep(-0.7, -0.1, v_z);
            vec3 highlight_color = mix(vec3(0, 0, 0), mix(vec3(0.8, 0.8, 0.8), vec3(0.4, 0.5, 0.7), u_biome_colors), land_or_water);
            biome_color = mix(underground_color, highlight_color, 0.5 * smoothstep(-0.025, 0.0, v_z));
            light = 1.0 - 0.3 * smoothstep(0.8, 1.0, fract((v_em.x - v_z) * 20.0)); // add horizontal lines
        }
        // if (fract(z * 10.0) < 10.0 * fwidth(z)) { biome_color = vec3(0,0,0); } // contour lines

        // TODO: add noise texture based on biome

        vec2 screen_dx=vec2(u_inverse_screen_size.x,0), screen_dy=vec2(0,u_inverse_screen_size.y);
        float depth0 = texture(u_depth, v_xy).x,
              depth1 = max(max(texture(u_depth, v_xy + u_outline_depth*(-screen_dy-screen_dx)).x,
                               texture(u_depth, v_xy + u_outline_depth*(-screen_dy+screen_dx)).x),
                           texture(u_depth, v_xy + u_outline_depth*(-screen_dy)).x),
              depth2 = max(max(texture(u_depth, v_xy + u_outline_depth*(screen_dy-screen_dx)).x,
                               texture(u_depth, v_xy + u_outline_depth*(screen_dy+screen_dx)).x),
                           texture(u_depth, v_xy + u_outline_depth*(screen_dy)).x);
        // Ridge profiles follow the projected local vertical. Its length
        // naturally fades toward the globe center, where relief is top-down.
        // Keep the symmetric screen-space samples above for coast outlines.
        vec3 radial = mat3(u_rotation)*vec3(cos(lat)*sin(lon),sin(lat),cos(lat)*cos(lon));
        vec2 profile_dy = radial.xy*u_inverse_screen_size;
        vec2 profile_dx = vec2(radial.y,-radial.x)*u_inverse_screen_size;
        float profile_depth = max(max(texture(u_depth, v_xy + u_outline_depth*(-profile_dy-profile_dx)).x,
                                      texture(u_depth, v_xy + u_outline_depth*(-profile_dy+profile_dx)).x),
                                  texture(u_depth, v_xy - u_outline_depth*profile_dy).x);
        float outline = 1.0 + u_outline_strength * (max(u_outline_threshold, profile_depth-depth0) - u_outline_threshold);

        // Add coast outline, but avoid it if there's a river nearby
        float neighboring_river = max(
            max(
                texture(u_water, pos + u_outline_depth * dx).a,
                texture(u_water, pos - u_outline_depth * dx).a
            ),
            max(
                texture(u_water, pos + u_outline_depth * dy).a,
                texture(u_water, pos - u_outline_depth * dy).a
            )
        );
        if (z <= 0.5 && max(depth1, depth2) > 1.0/256.0 && neighboring_river <= 0.2) { outline += u_outline_coast * 256.0 * (max(depth1, depth2) - 2.0*(z - 0.5)); }

        vec3 body_normal=vec3(cos(lat)*sin(lon),sin(lat),cos(lat)*cos(lon));
        biome_color=surface_color(biome_color,body_normal,v_em.x);
        vec3 base_color=mix(biome_color, water_color.rgb, water_color.a);
        out_fragcolor = vec4(planet_color(base_color,body_normal) * light / outline, 1);
    }`;

const vert_final = `
    precision highp float;
    in vec2 a_uv;
    out vec2 v_uv;
    void main() {
        v_uv = a_uv;
        gl_Position = vec4(2.0 * v_uv - 1.0, 0.0, 1.0);
    }`;

const frag_final = `
    precision highp float;
    uniform sampler2D u_texture;
    uniform vec2 u_offset;
    uniform float u_outline_radius, u_outline_strength;
    in vec2 v_uv;
    out vec4 out_fragcolor;
    const vec2 outline_taps[8] = vec2[8](
        vec2(1,0), vec2(-1,0), vec2(0,1), vec2(0,-1),
        vec2(0.70710678,0.70710678), vec2(-0.70710678,0.70710678),
        vec2(0.70710678,-0.70710678), vec2(-0.70710678,-0.70710678)
    );
    void main() {
        vec2 uv = v_uv + u_offset;
        vec4 color = texture(u_texture, uv);
        // Drape alpha records terrain coverage, including sea-level water.
        // The full-screen pass can ink both sides of the silhouette, even
        // where no terrain fragment exists to carry the internal ridge line.
        if (u_outline_radius > 0.0 && u_outline_strength > 0.0) {
            vec2 step_uv = u_outline_radius / vec2(textureSize(u_texture, 0));
            float lo = color.a, hi = color.a;
            for (int i=0; i<8; i++) {
                float coverage = texture(u_texture, uv + step_uv*outline_taps[i]).a;
                lo = min(lo, coverage);
                hi = max(hi, coverage);
            }
            color.rgb /= 1.0 + 0.2*u_outline_strength*(hi-lo);
        }
        // Coverage is internal metadata; the displayed background stays opaque.
        out_fragcolor = vec4(color.rgb, 1);
    }`;

//////////////////////////////////////////////////////////////////////
// Mapgen4 renderer

const fbo_texture_size: number = 2048;

export default class Renderer {
    numRiverTriangles: number = 0;

    mesh: Mesh;
    atlas: Float32Array;
    atlasVertexCount = 0;
    rotation = mat4.create();
    pickPositions: Float32Array;
    pickDirections: Float32Array;
    pickElements = new Int32Array(0);
    pickElevation = new Float32Array(0);
    physicalElevation = new Float32Array(0);
    baseTriangleElevation = new Float32Array(0);
    private sourceElevation = new Float32Array(0);
    private terrainPreview:TerrainPreview|null=null;
    planetView:PlanetView|null=null;
    presentedPlanetTimeS:number|null=null;
    private mapDirty=true;
    private pickingDirty=true;
    private pickedHeight=NaN;
    private pickedRadius=NaN;
    private landOutlineWater=NaN;
    topdown: mat4;
    projection: mat4;
    inverse_projection: mat4;

    a_quad_xy: Float32Array;
    a_quad_em: Float32Array;
    quad_elements_length: number; // have to store the original size because the worker thread borrows the actual array
    quad_elements: Int32Array;
    a_river_xyww: Float32Array;

    screenshotCanvas: HTMLCanvasElement;
    screenshotCallback: () => void;
    renderParam: any;

    webgl: WebGLWrapper;

    texture_colormap: Texture;
    texture_temperature: Texture;
    private temperaturePixels:Uint8Array|null=null;
    texture_hydrology: Texture;
    private waterPixels:Uint8Array|null=null;
    texture_geomorph: Texture;
    private geomorphPixels:Uint8Array|null=null;
    texture_surface: Texture;
    private surfacePixels:Uint8Array|null=null;
    private activeTerrainWater:TerrainWaterView|null=null;
    private originalRivers=new Float32Array(0);
    private buffer_lakes:Buffer;
    private fbo_lakes:Framebuffer;
    private program_lakes:Program;

    fbo_river: Framebuffer;
    fbo_land: Framebuffer;
    fbo_depth: Framebuffer;
    fbo_drape: Framebuffer;

    program_river: Program;
    program_land: Program;
    program_depth: Program;
    program_drape: Program;
    program_final: Program;

    buffer_fullscreen: Buffer;
    buffer_quad_xy: Buffer;
    buffer_river_xyww: Buffer;

    constructor (mesh: Mesh) {
        this.mesh = mesh;
        const canvas = document.getElementById('mapgen4') as HTMLCanvasElement;
        this.webgl = new WebGLWrapper(canvas);

        this.resizeCanvas();

        this.topdown = mat4.create();
        mat4.translate(this.topdown, this.topdown, [-1, -1, 0]);
        mat4.scale(this.topdown, this.topdown, [1/500, 1/500, 1]);

        this.projection = mat4.create();
        this.inverse_projection = mat4.create();

        this.a_quad_xy = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.a_quad_em = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.quad_elements_length = 3 * mesh.numSolidSides;
        this.quad_elements = new Int32Array(this.quad_elements_length);
        /* NOTE: The maximum number of river triangles will be when
         * there's a single binary tree that has every node filled.
         * Each of the N/2 leaves will produce 1 output triangle and
         * each of the N/2 nodes will produce 2 triangles. On average
         * there will be 1.5 output triangles per input triangle.
         * Double that capacity for atlas seam copies and polar caps. */
        const numRiverVertices = 3 * 3 * mesh.numSolidTriangles;
        this.a_river_xyww = new Float32Array(numRiverVertices * 7);

        Geometry.setMeshGeometry(mesh, this.a_quad_xy);

        this.atlas = new Float32Array(this.quad_elements_length * 2 * 4);
        this.pickPositions = new Float32Array(3*(mesh.numRegions+mesh.numTriangles));
        this.pickDirections = new Float32Array(this.pickPositions.length);
        this.pickDirections.set(mesh.xyz_r);
        this.pickDirections.set(mesh.xyz_t,mesh.xyz_r.length);
        this.buffer_quad_xy = this.webgl.createBuffer({update: 'dynamic', data: this.atlas});

        this.buffer_fullscreen = this.webgl.createBuffer({update: 'static', data: new Float32Array([-2, 0, 0, -2, 2, 2])});
        this.buffer_river_xyww = this.webgl.createBuffer({update: 'dynamic', data: this.a_river_xyww});
        this.buffer_lakes=this.webgl.createBuffer({update:'dynamic',data:new Float32Array(mesh.numSolidTriangles*180)});

        this.texture_colormap = this.webgl.createTexture({data: colormap.data, width: colormap.width, height: colormap.height, filter: 'nearest'});
        this.texture_temperature = this.webgl.createTexture({width:48,height:24,filter:'linear'});
        this.texture_temperature.bind();
        this.webgl.gl.texParameteri(this.webgl.gl.TEXTURE_2D,this.webgl.gl.TEXTURE_WRAP_S,this.webgl.gl.REPEAT);
        this.texture_hydrology = this.webgl.createTexture({width:48,height:24,filter:'linear'});
        this.texture_hydrology.bind();
        this.webgl.gl.texParameteri(this.webgl.gl.TEXTURE_2D,this.webgl.gl.TEXTURE_WRAP_S,this.webgl.gl.REPEAT);
        this.texture_geomorph = this.webgl.createTexture({width:48,height:24,filter:'linear'});
        this.texture_geomorph.bind();
        this.webgl.gl.texParameteri(this.webgl.gl.TEXTURE_2D,this.webgl.gl.TEXTURE_WRAP_S,this.webgl.gl.REPEAT);
        this.texture_surface = this.webgl.createTexture({width:SURFACE_WIDTH,height:SURFACE_HEIGHT,filter:'linear'});
        this.texture_surface.bind();
        this.webgl.gl.texParameteri(this.webgl.gl.TEXTURE_2D,this.webgl.gl.TEXTURE_WRAP_S,this.webgl.gl.REPEAT);

        this.fbo_land  = this.webgl.createFramebuffer(2*fbo_texture_size, fbo_texture_size, {depth: false, internalFormat: this.webgl.gl.R16F, filter: 'linear'});
        // Radial outline taps move by fractional texels. Nearest sampling
        // snaps along fixed diagonal boundaries as terrain rotates beneath it.
        this.fbo_depth = this.webgl.createFramebuffer(fbo_texture_size, fbo_texture_size, {depth: true, internalFormat: this.webgl.gl.R16F, filter: 'linear'});
        this.fbo_river = this.webgl.createFramebuffer(2*fbo_texture_size, fbo_texture_size, {depth: false, filter: 'linear'}); // linear makes rivers look better
        this.fbo_lakes=this.webgl.createFramebuffer(2*fbo_texture_size,fbo_texture_size,{depth:false,filter:'linear'});
        this.fbo_drape = this.webgl.createFramebuffer(fbo_texture_size, fbo_texture_size, {depth: true, filter: 'linear'}); // linear to smooth out edges

        // Both surface atlases wrap only longitude; latitude clamps at poles.
        for (const fbo of [this.fbo_land,this.fbo_river,this.fbo_lakes]) {
            fbo.texture.bind();
            this.webgl.gl.texParameteri(this.webgl.gl.TEXTURE_2D,this.webgl.gl.TEXTURE_WRAP_S,this.webgl.gl.REPEAT);
        }
        this.program_river = this.webgl.createProgram('river', vert_river, frag_river, (gl, program) => {
            this.buffer_river_xyww.vertexAttribPointer(program.a_xyww, 4, gl.FLOAT, false, 28, 0);
            this.buffer_river_xyww.vertexAttribPointer(program.a_barycentric, 3, gl.FLOAT, false, 28, 16);
        });
        this.program_lakes=this.webgl.createProgram('lakes',vert_lakes,frag_lakes,(gl,program)=>{
            this.buffer_lakes.vertexAttribPointer(program.a_xy,2,gl.FLOAT,false,20,0);
            this.buffer_lakes.vertexAttribPointer(program.a_water,3,gl.FLOAT,false,20,8);
        });
        this.program_land  = this.webgl.createProgram('land', vert_land,  frag_land, (gl, program) => {
            this.buffer_quad_xy.vertexAttribPointer(program.a_xy, 2, gl.FLOAT, false, 16, 0);
            this.buffer_quad_xy.vertexAttribPointer(program.a_em, 2, gl.FLOAT, false, 16, 8);
        });
        this.program_depth = this.webgl.createProgram('depth', vert_depth, frag_depth, (gl, program) => {
            this.buffer_quad_xy.vertexAttribPointer(program.a_xy, 2, gl.FLOAT, false, 16, 0);
            this.buffer_quad_xy.vertexAttribPointer(program.a_em, 2, gl.FLOAT, false, 16, 8);
        });
        this.program_drape = this.webgl.createProgram('drape', vert_drape, frag_drape, (gl, program) => {
            this.buffer_quad_xy.vertexAttribPointer(program.a_xy, 2, gl.FLOAT, false, 16, 0);
            this.buffer_quad_xy.vertexAttribPointer(program.a_em, 2, gl.FLOAT, false, 16, 8);
        });
        this.program_final = this.webgl.createProgram('final', vert_final, frag_final, (gl, program) => {
            this.buffer_fullscreen.vertexAttribPointer(program.a_uv, 2, gl.FLOAT, false, 0, 0);
        });

        this.screenshotCanvas = document.createElement('canvas');
        this.screenshotCanvas.width = fbo_texture_size;
        this.screenshotCanvas.height = fbo_texture_size;
        this.screenshotCallback = null;

        this.renderParam = undefined;
        this.startDrawingLoop();
    }

    screenToWorld(coords: number[]): [number,number] | null {
        return pickTerrain(coords,this.inverse_projection,this.pickPositions,this.pickElements,this.pickDirections);
    }

    sampleTerrain(coords:number[]):{uv:[number,number];elevation:number}|null {
        const hit=pickTerrainHit(coords,this.inverse_projection,this.pickPositions,this.pickElements,this.pickDirections);
        if(!hit || this.physicalElevation.length===0) return null;
        const elevation=hit.weights.reduce((sum,w,i)=>{
            const v=hit.indices[i];return sum+w*previewElevation(this.physicalElevation[v],this.a_quad_xy[2*v]/1000,this.a_quad_xy[2*v+1]/1000,this.terrainPreview);
        },0);
        return {uv:hit.uv,elevation};
    }

    updatePlanet(view:PlanetView) {
        this.planetView=view;
        const terrainWater=view.terrainWater??null;
        if(terrainWater!==this.activeTerrainWater) {
            this.activeTerrainWater=terrainWater;
            this.buffer_river_xyww.subdata(0,terrainWater?.rivers??this.originalRivers);
            if(terrainWater)this.buffer_lakes.subdata(0,terrainWater.lakes);
            this.mapDirty=true;
        }
        if(view.surface && view.surface.pixels!==this.surfacePixels) {
            const {gl}=this.webgl,t=view.surface;
            if(t.width!==this.texture_surface.width||t.height!==this.texture_surface.height) {
                gl.deleteTexture(this.texture_surface.id);
                this.texture_surface=this.webgl.createTexture({width:t.width,height:t.height,filter:'linear'});
                this.texture_surface.bind();gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
            }
            this.texture_surface.bind();
            gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,t.width,t.height,gl.RGBA,gl.UNSIGNED_BYTE,t.pixels);this.surfacePixels=t.pixels;
        }
        const preview=view.geomorph?.preview??null;
        if(preview!==this.terrainPreview){this.terrainPreview=preview;this.rebuildSurface();}
        if(view.thermal && view.thermal.pixels!==this.temperaturePixels) {
            const {gl}=this.webgl;
            this.texture_temperature.bind();
            gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,view.thermal.width,view.thermal.height,gl.RGBA,gl.UNSIGNED_BYTE,view.thermal.pixels);
            this.temperaturePixels=view.thermal.pixels;
        }
        if(view.water && view.water.pixels!==this.waterPixels) {
            const {gl}=this.webgl;this.texture_hydrology.bind();
            gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,view.water.width,view.water.height,gl.RGBA,gl.UNSIGNED_BYTE,view.water.pixels);
            this.waterPixels=view.water.pixels;
        }
        if(view.geomorph&&view.geomorph.texture.pixels!==this.geomorphPixels){
            const {gl}=this.webgl,t=view.geomorph.texture;this.texture_geomorph.bind();
            gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,t.width,t.height,gl.RGBA,gl.UNSIGNED_BYTE,t.pixels);this.geomorphPixels=t.pixels;
        }
    }

    updateMap() {
        // Own immutable source copies: live buffers can be detached while the
        // worker generates a new map. Preview must never write into them.
        this.sourceElevation=this.a_quad_em.slice();this.pickElements=this.quad_elements.slice();
        this.rebuildSurface();
        this.originalRivers=this.a_river_xyww.slice(0,7*3*this.numRiverTriangles);this.activeTerrainWater=null;
        this.buffer_river_xyww.subdata(0,this.originalRivers);
    }

    private rebuildSurface() {
        if(!this.sourceElevation.length)return;
        this.pickElevation=this.sourceElevation.slice();
        if(this.terrainPreview)for(let v=0;v<this.pickElevation.length/2;v++){
            this.pickElevation[2*v]=previewElevation(this.sourceElevation[2*v],this.a_quad_xy[2*v]/1000,this.a_quad_xy[2*v+1]/1000,this.terrainPreview);
        }
        let p=0;
        for (let i=0;i<this.pickElements.length;i+=3) {
            const points=[];
            for (let j=0;j<3;j++) {
                const v=this.pickElements[i+j];
                points.push([this.a_quad_xy[2*v],this.a_quad_xy[2*v+1],this.pickElevation[2*v],this.pickElevation[2*v+1]]);
            }
            for (const tri of atlasTriangles(points)) for (const v of tri) for (const value of v) this.atlas[p++]=value;
        }
        if (p>this.atlas.length) throw new Error('Terrain atlas buffer overflow');
        this.atlasVertexCount=p/4;
        this.buffer_quad_xy.subdata(0,this.atlas.subarray(0,p));
        this.mapDirty=true;this.pickingDirty=true;
    }

    updatePicking(height: number, sphereRadius=SPHERE_RADIUS) {
        if(!this.pickingDirty && this.pickedHeight===height && this.pickedRadius===sphereRadius) return;
        const {numRegions,xyz_r,xyz_t}=this.mesh;
        for (let v=0;v<this.pickPositions.length/3;v++) {
            const a=v<numRegions ? xyz_r : xyz_t, index=v<numRegions ? v : v-numRegions;
            const p=terrainPosition(a.subarray(3*index,3*index+3),this.pickElevation[2*v],height,sphereRadius);
            this.pickPositions.set(p,3*v);
        }
        this.pickingDirty=false;this.pickedHeight=height;this.pickedRadius=sphereRadius;
    }

    /* Allow drawing at a different resolution than the internal texture size */
    resizeCanvas() {
        let canvas = document.getElementById('mapgen4') as HTMLCanvasElement;
        let size = canvas.clientWidth;
        size = 2048; /* could be smaller to increase performance */
        if (canvas.width !== size || canvas.height !== size) {
            console.log(`Resizing canvas from ${canvas.width}x${canvas.height} to ${size}x${size}`);
            canvas.width = canvas.height = size;
            this.webgl.gl.viewport(0, 0, canvas.width, canvas.height);
        }
    }

    /* wrapper function to make the other drawing functions more convenient */
    drawGeneric(program: Program, fb: Framebuffer | null, draw: (gl: WebGL2RenderingContext, program: Program) => void) {
        const {gl} = this.webgl;
        fb = fb ?? this.webgl.drawToScreen();
        fb.viewport();
        program.run(() => {
            if (fb.depth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
            draw(gl, program);
            if (fb.depth) gl.disable(gl.DEPTH_TEST);
        });
    }

    drawRivers() {
        this.drawGeneric(this.program_river, this.fbo_river, (gl, program) => {
            gl.uniformMatrix4fv(program.u_projection, false, this.topdown);

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.blendEquation(gl.FUNC_ADD);

            gl.drawArrays(gl.TRIANGLES, 0, 3 * (this.activeTerrainWater?.riverTriangles??this.numRiverTriangles));
            gl.disable(gl.BLEND);
        });
    }

    drawLand(outline_water: number) {
        this.drawGeneric(this.program_land, this.fbo_land, (gl, program) => {
            gl.uniformMatrix4fv(program.u_projection, false, this.topdown);
            gl.uniform1f(program.u_outline_water, outline_water);
            this.fbo_river.texture.activate(gl.TEXTURE0, program.u_water);

            gl.drawArrays(gl.TRIANGLES, 0, this.atlasVertexCount);
        });
    }

    drawDepth(renderParam: any) {
        this.drawGeneric(this.program_depth, this.fbo_depth, (gl, program) => {
            gl.uniformMatrix4fv(program.u_projection, false, this.projection);
            gl.uniform1f(program.u_mountain_height, renderParam.mountain_height);
            gl.uniform1f(program.u_sphere_radius, renderParam.sphere_radius ?? SPHERE_RADIUS);

            gl.drawArrays(gl.TRIANGLES, 0, this.atlasVertexCount);
        });
    }

    drawDrape(renderParam: any) {
        const light_angle_rad = Math.PI / 180 * renderParam.light_angle_deg;
        this.drawGeneric(this.program_drape, this.fbo_drape, (gl, program) => {
            gl.uniformMatrix4fv(program.u_projection, false, this.projection);
            gl.uniform1f(program.u_mountain_height, renderParam.mountain_height);
            gl.uniform1f(program.u_sphere_radius, renderParam.sphere_radius ?? SPHERE_RADIUS);
            gl.uniform2fv(program.u_light_angle, [Math.cos(light_angle_rad), Math.sin(light_angle_rad)]);
            gl.uniform2fv(program.u_inverse_texture_size, [1.5 / this.fbo_land.texture.width, 1.5 / this.fbo_land.texture.height]);
            gl.uniform2fv(program.u_inverse_screen_size, [1.5/fbo_texture_size,1.5/fbo_texture_size]);
            gl.uniformMatrix4fv(program.u_rotation,false,this.rotation);
            gl.uniform1f(program.u_slope, renderParam.slope);
            gl.uniform1f(program.u_flat, renderParam.flat);
            gl.uniform1f(program.u_ambient, renderParam.ambient);
            gl.uniform1f(program.u_overhead, renderParam.overhead);
            gl.uniform1f(program.u_outline_depth, renderParam.outline_depth * 5 * renderParam.zoom);
            gl.uniform1f(program.u_outline_coast, renderParam.outline_coast);
            gl.uniform1f(program.u_outline_water, renderParam.outline_water);
            gl.uniform1f(program.u_outline_strength, renderParam.outline_strength);
            gl.uniform1f(program.u_outline_threshold, renderParam.outline_threshold / 1000);
            gl.uniform1f(program.u_biome_colors, renderParam.biome_colors);
            const view=this.planetView;
            gl.uniform1i(program.u_planet_layer, view?.layer==='surface'&&view.surface?9:view?.layer==='wind'&&view.thermal?8:view?.layer==='erosion'&&view.geomorph?7:view?.layer==='day-night'?1:view?.layer==='insolation'?2:view?.layer==='temperature'&&view.thermal?3:
                view?.water?view.layer==='precipitation'?4:view.layer==='soil-moisture'?5:view.layer==='runoff'?6:0:0);
            gl.uniform3fv(program.u_sun_direction, this.planetView?.sunDirection ?? [0,0,1]);
            gl.uniform1i(program.u_terrain_water,this.activeTerrainWater?1:0);

            this.texture_colormap.activate(gl.TEXTURE0, program.u_colormap);
            this.fbo_land.texture.activate(gl.TEXTURE1, program.u_elevation);
            this.fbo_river.texture.activate(gl.TEXTURE2, program.u_water);
            this.fbo_depth.texture.activate(gl.TEXTURE3, program.u_depth);
            this.texture_temperature.activate(gl.TEXTURE4, program.u_temperature);
            this.texture_hydrology.activate(gl.TEXTURE5, program.u_hydrology);
            this.texture_geomorph.activate(gl.TEXTURE6, program.u_geomorph);
            this.texture_surface.activate(gl.TEXTURE7, program.u_surface);
            this.fbo_lakes.texture.activate(gl.TEXTURE8,program.u_lakes);

            gl.drawArrays(gl.TRIANGLES, 0, this.atlasVertexCount);
        });
    }

    drawFinal(offset: [number, number], renderParam: any) {
        this.drawGeneric(this.program_final, null, (gl, program) => {
            gl.uniform2fv(program.u_offset, offset);
            gl.uniform1f(program.u_outline_radius, 1.5 * renderParam.outline_depth * 5 * renderParam.zoom);
            gl.uniform1f(program.u_outline_strength, renderParam.outline_strength);
            this.fbo_drape.texture.activate(gl.TEXTURE0, program.u_texture);

            gl.drawArrays(gl.TRIANGLES, 0, 3);
        });
    }

    startDrawingLoop() {
        const {gl} = this.webgl;

        const clearBuffers = () => {
            this.fbo_river.clear(0, 0, 0, 0);
            this.fbo_lakes.clear(0,0,0,0);
            this.fbo_land.clear(0,0,0,1);
            this.fbo_depth.clear(0, 0, 0, 1);
            this.fbo_drape.clear(0.3, 0.3, 0.35, 0);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        };

        /* Only draw when render parameters have been passed in;
         * otherwise skip the render and wait for the next tick */
        clearBuffers();
        const renderLoop = () => {
            requestAnimationFrame(renderLoop);
            const renderParam = this.renderParam;
            if (!renderParam) { return; }
            this.renderParam = undefined;

            if(this.mapDirty) {
                this.fbo_river.clear(0,0,0,0);
                if ((this.activeTerrainWater?.riverTriangles??this.numRiverTriangles) > 0) this.drawRivers();
                this.fbo_lakes.clear(0,0,0,0);
                if(this.activeTerrainWater)this.drawGeneric(this.program_lakes,this.fbo_lakes,(gl,program)=>{
                    gl.uniformMatrix4fv(program.u_projection,false,this.topdown);
                    gl.drawArrays(gl.TRIANGLES,0,this.activeTerrainWater!.lakes.length/5);
                });
            }
            if(this.mapDirty || this.landOutlineWater!==renderParam.outline_water) {
                this.fbo_land.clear(0,0,0,1);
                this.drawLand(renderParam.outline_water);
                this.landOutlineWater=renderParam.outline_water;
            }
            this.mapDirty=false;

            const view=sphereProjection(renderParam,this.planetView?.model);
            this.projection=view.projection;
            this.rotation=view.rotation;
            this.updatePicking(renderParam.mountain_height,renderParam.sphere_radius ?? SPHERE_RADIUS);

            /* Keep track of the inverse matrix for mapping mouse to world coordinates */
            mat4.invert(this.inverse_projection, this.projection);

            this.fbo_depth.clear(0,0,0,1);
            this.fbo_drape.clear(0.3,0.3,0.35,0);
            if (renderParam.outline_depth > 0) {
                this.drawDepth(renderParam);
            }

            this.drawDrape(renderParam);

            /* Draw the final texture to the canvas; this slightly blurs the outlines */
            this.drawFinal([0.5 / fbo_texture_size, 0.5 / fbo_texture_size], renderParam);
            this.presentedPlanetTimeS=this.planetView?.timeS??null;

            if (this.screenshotCallback) {
                const ctx = this.screenshotCanvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, this.screenshotCanvas.width, this.screenshotCanvas.height);
                const bytesPerRow = 4 * this.screenshotCanvas.width;
                const buffer = new Uint8Array(bytesPerRow * this.screenshotCanvas.height);
                gl.readPixels(0, 0, this.screenshotCanvas.width, this.screenshotCanvas.height, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

                /* Flip row order from WebGL to Canvas */
                for (let y = 0; y < this.screenshotCanvas.height; y++) {
                    const rowBuffer = new Uint8Array(buffer.buffer, y * bytesPerRow, bytesPerRow);
                    imageData.data.set(rowBuffer, (this.screenshotCanvas.height-y-1) * bytesPerRow);
                }
                ctx.putImageData(imageData, 0, 0);

                this.screenshotCallback();
                this.screenshotCallback = null;
            }

        };

        renderLoop();
    }

    updateView(renderParam: any) {
        this.renderParam = renderParam;
    }
}
