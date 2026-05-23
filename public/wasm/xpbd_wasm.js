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
     * Configure solver parameters (16 positional args).
     *
     * **A2 Fase 2 § 2.3 + § 3.1 ratified.** Rust ABI is the cross-language
     * floor — adding/renaming a parameter requires touching this signature
     * + struct field + constructor default + WASM rebuild + sync of BOTH
     * `xpbd_wasm.js` + `xpbd_wasm_bg.wasm` to `public/wasm/` (CLAUDE.md
     * non-negotiable) + TS-side `WasmXpbdSolver` interface +
     * `AppliedSolverConfig` + `DEFAULT_SOLVER_CONFIG` + `applySolverConfig`
     * callsite (worker) + `WasmSolverConfig` (client).
     *
     * Rust constructor `XpbdSolver::new()` defaults are canonical for
     * cross-tier shared field defaults per `CLAUDE/methodology.md` § 15 —
     * TS `DEFAULT_SOLVER_CONFIG` const en `wasmSolverWorker.ts` and CPU
     * `ClothSimConfig` constructor defaults en `xpbdSolver.ts` MUST match
     * for shared fields.
     *
     * Cross-ref: `docs/reports/2026-05-02-drift-fase2-a2-cross-boundary-serialization.md`.
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
     * Get pointer to previous positions buffer (for JS-side collision correction).
     * @returns {number}
     */
    prev_positions_ptr() {
        const ret = wasm.xpbdsolver_prev_positions_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Set adjacency for self-collision.
     *
     * CSR (Compressed Sparse Row) representation of per-particle
     * triangle-shared neighbors. Used by `solve_self_collision` to skip
     * connected pairs (avoiding pushing apart particles that share an edge
     * in the mesh).
     *
     * # Arguments
     *
     * * `offsets` — Length `num_particles + 1`. `offsets[i]..offsets[i+1]`
     *   gives the slice of `neighbors` corresponding to particle `i`. Must
     *   be monotonic non-decreasing. `offsets[num_particles]` equals
     *   `neighbors.len()` (CSR sentinel).
     * * `neighbors` — Flat array of triangle-shared neighbor indices.
     *   Length equals `offsets[num_particles]`.
     *
     * # Example
     *
     * For a 3-particle mesh where every particle shares a triangle with
     * the other two:
     * - `offsets   = [0, 2, 4, 6]`
     * - `neighbors = [1, 2, 0, 2, 0, 1]`
     *
     * # Validation (#721)
     *
     * Validates the CSR shape via `CSRAdjacency::new` before storing.
     * Returns `Err` (surfaces as a JS exception via wasm-bindgen) with a
     * human-readable diagnostic if the shape is malformed; worker should
     * catch and log, then continue stepping with self-collision disabled
     * (the existing `Option::None` guard in `solve_self_collision` makes
     * this a no-op rather than tearing the mesh — same fail-loud-by-no-op
     * shape as the empty-offsets path from #717).
     *
     * # Empty CSR
     *
     * Calling with empty `offsets` (length 0) is also rejected — the CSR
     * invariant requires at least the sentinel entry. Worker happy-path
     * produces `offsets[num_particles + 1]` so this is never hit in normal
     * flow. Internal test fixtures use `[0; num_particles + 1]` to express
     * "no neighbors for any particle".
     * @param {Uint32Array} offsets
     * @param {Uint32Array} neighbors
     */
    set_adjacency(offsets, neighbors) {
        const ptr0 = passArray32ToWasm0(offsets, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(neighbors, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.xpbdsolver_set_adjacency(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Set bend constraints.
     * @param {Uint32Array} ids
     * @param {Float32Array} rest_distances
     */
    set_bend(ids, rest_distances) {
        const ptr0 = passArray32ToWasm0(ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_distances, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.xpbdsolver_set_bend(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * Set bend constraints with edge type classification.
     * edge_types: 0 = WARP, 1 = WEFT, 2 = SHEAR (SHEAR defaults to WEFT for bending)
     *
     * Persists `edge_types` so `configure()` can regenerate the
     * per-constraint compliance cache after global-field mutation
     * (#747). Routes through `recompute_bend_compliances` — single
     * source of truth for the cache derivation.
     * @param {Uint32Array} ids
     * @param {Float32Array} rest_distances
     * @param {Uint8Array} edge_types
     */
    set_bend_with_types(ids, rest_distances, edge_types) {
        const ptr0 = passArray32ToWasm0(ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_distances, wasm.__wbindgen_malloc);
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
     * Set seam constraints with per-constraint XPBD compliance.
     *
     * `compliances` is a per-seam alpha value: 0.0 = perfectly rigid seam,
     * larger values = more compliant (stretchy). Mirrors the
     * `set_stretch_with_types` / `set_bend_with_types` shape used elsewhere
     * in this crate.
     *
     * BUG-3 (#606): the previous 2-arg `set_seams(ids, target)` discarded
     * per-seam tension/strength data the JS side computes; the solver
     * hardcoded alpha=0 internally and treated every seam as rigid. The
     * fix moves the compliance into the API contract so JS-side data
     * flows through.
     * @param {Uint32Array} ids
     * @param {Float32Array} target_dist
     * @param {Float32Array} compliances
     */
    set_seams_with_compliance(ids, target_dist, compliances) {
        const ptr0 = passArray32ToWasm0(ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(target_dist, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF32ToWasm0(compliances, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        wasm.xpbdsolver_set_seams_with_compliance(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
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
     *
     * Persists `edge_types` so `configure()` can regenerate the
     * per-constraint compliance cache after global-field mutation
     * (#747). Routes through `recompute_stretch_compliances` —
     * single source of truth for the cache derivation.
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
     * Set wind direction and strength (world-space force vector).
     * @param {number} wx
     * @param {number} wy
     * @param {number} wz
     */
    set_wind(wx, wy, wz) {
        wasm.xpbdsolver_set_wind(this.__wbg_ptr, wx, wy, wz);
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
    /**
     * Get pointer to velocities buffer (for JS-side collision velocity correction).
     * @returns {number}
     */
    velocities_ptr() {
        const ret = wasm.xpbdsolver_velocities_ptr(this.__wbg_ptr);
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
        __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
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

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

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

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
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

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
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
