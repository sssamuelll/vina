/* @ts-self-types="./xpbd_wasm.d.ts" */

/**
 * Main XPBD cloth solver.
 */
export class XpbdSolver {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        XpbdSolverFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_xpbdsolver_free(ptr, 0);
    }
    /**
     * Clear all pins, restoring original masses.
     */
    clear_pins() {
        wasm.xpbdsolver_clear_pins(this.__wbg_ptr);
    }
    /**
     * Configure solver parameters.
     * @param {number} substeps
     * @param {number} damping
     * @param {number} gravity_y
     * @param {number} stretch_compliance
     * @param {number} bend_compliance
     * @param {boolean} self_collision
     * @param {number} thickness
     * @param {number} collision_margin
     * @param {number} ground_y
     * @param {number} drag_coefficient
     * @param {number} stretch_compliance_warp
     * @param {number} stretch_compliance_weft
     * @param {number} stretch_compliance_shear
     * @param {number} bend_compliance_warp
     * @param {number} bend_compliance_weft
     * @param {number} internal_damping
     */
    configure(substeps, damping, gravity_y, stretch_compliance, bend_compliance, self_collision, thickness, collision_margin, ground_y, drag_coefficient, stretch_compliance_warp, stretch_compliance_weft, stretch_compliance_shear, bend_compliance_warp, bend_compliance_weft, internal_damping) {
        wasm.xpbdsolver_configure(this.__wbg_ptr, substeps, damping, gravity_y, stretch_compliance, bend_compliance, self_collision, thickness, collision_margin, ground_y, drag_coefficient, stretch_compliance_warp, stretch_compliance_weft, stretch_compliance_shear, bend_compliance_warp, bend_compliance_weft, internal_damping);
    }
    /**
     * Create a new solver with particle positions and inverse masses.
     * @param {Float32Array} positions
     * @param {Float32Array} inv_mass
     */
    constructor(positions, inv_mass) {
        const ptr0 = passArrayF32ToWasm0(positions, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(inv_mass, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.xpbdsolver_new(ptr0, len0, ptr1, len1);
        this.__wbg_ptr = ret >>> 0;
        XpbdSolverFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Get number of particles.
     * @returns {number}
     */
    num_particles() {
        const ret = wasm.xpbdsolver_num_particles(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of stretch constraints (each constraint = one edge = one pair of IDs).
     * @returns {number}
     */
    num_stretch_edges() {
        const ret = wasm.xpbdsolver_num_stretch_edges(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get pointer to positions buffer (for zero-copy JS access).
     * @returns {number}
     */
    positions_ptr() {
        const ret = wasm.xpbdsolver_positions_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Set adjacency for self-collision.
     * @param {Uint32Array} offsets
     * @param {Uint32Array} neighbors
     */
    set_adjacency(offsets, neighbors) {
        const ptr0 = passArray32ToWasm0(offsets, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(neighbors, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.xpbdsolver_set_adjacency(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * Set bend constraints.
     * @param {Uint32Array} ids
     * @param {Float32Array} rest_angles
     */
    set_bend(ids, rest_angles) {
        const ptr0 = passArray32ToWasm0(ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_angles, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.xpbdsolver_set_bend(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * Set bend constraints with edge type classification.
     * edge_types: 0 = WARP, 1 = WEFT, 2 = SHEAR (SHEAR defaults to WEFT for bending)
     * @param {Uint32Array} ids
     * @param {Float32Array} rest_angles
     * @param {Uint8Array} edge_types
     */
    set_bend_with_types(ids, rest_angles, edge_types) {
        const ptr0 = passArray32ToWasm0(ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_angles, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(edge_types, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        wasm.xpbdsolver_set_bend_with_types(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
    }
    /**
     * Set pinned vertices with target positions.
     * indices: flat array of vertex indices to pin
     * positions: flat array [x,y,z, x,y,z, ...] of target positions
     * @param {Uint32Array} indices
     * @param {Float32Array} positions
     */
    set_pins(indices, positions) {
        const ptr0 = passArray32ToWasm0(indices, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(positions, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.xpbdsolver_set_pins(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * Set seam constraints.
     * @param {Uint32Array} ids
     * @param {Float32Array} target_dist
     */
    set_seams(ids, target_dist) {
        const ptr0 = passArray32ToWasm0(ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(target_dist, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.xpbdsolver_set_seams(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * Set stretch constraints (pairs of ids + rest lengths).
     * @param {Uint32Array} ids
     * @param {Float32Array} rest_lengths
     */
    set_stretch(ids, rest_lengths) {
        const ptr0 = passArray32ToWasm0(ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_lengths, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.xpbdsolver_set_stretch(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * Set stretch constraints with edge type classification.
     * edge_types: 0 = WARP, 1 = WEFT, 2 = SHEAR
     * @param {Uint32Array} ids
     * @param {Float32Array} rest_lengths
     * @param {Uint8Array} edge_types
     */
    set_stretch_with_types(ids, rest_lengths, edge_types) {
        const ptr0 = passArray32ToWasm0(ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_lengths, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(edge_types, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        wasm.xpbdsolver_set_stretch_with_types(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
    }
    /**
     * Set triangle indices for air drag calculation.
     * @param {Uint32Array} tri_ids
     */
    set_triangles(tri_ids) {
        const ptr0 = passArray32ToWasm0(tri_ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.xpbdsolver_set_triangles(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Step the simulation forward one frame.
     * @param {number} dt
     */
    step(dt) {
        wasm.xpbdsolver_step(this.__wbg_ptr, dt);
    }
    /**
     * Pointer to stretch constraint indices [a,b, a,b, ...] for fit map computation.
     * @returns {number}
     */
    stretch_ids_ptr() {
        const ret = wasm.xpbdsolver_stretch_ids_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Pointer to stretch constraint rest lengths for fit map computation.
     * @returns {number}
     */
    stretch_rest_ptr() {
        const ret = wasm.xpbdsolver_stretch_rest_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) XpbdSolver.prototype[Symbol.dispose] = XpbdSolver.prototype.free;

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_39bc967c0e5a9b58: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./xpbd_wasm_bg.js": import0,
    };
}

const XpbdSolverFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_xpbdsolver_free(ptr >>> 0, 1));

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('xpbd_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
