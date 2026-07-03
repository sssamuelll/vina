//! XPBD Cloth Simulation — WebAssembly solver
//!
//! Implements Extended Position Based Dynamics for cloth simulation.
//! Designed to be called from JavaScript via wasm-bindgen.
//! Positions are stored in a flat f32 array accessible via shared memory.
//!
//! Based on Matthias Müller's "Ten Minute Physics" XPBD approach.

use wasm_bindgen::prelude::*;

// Hash multipliers — bit-exact match with TS reference
// (`src/utils/cloth/selfCollision.ts` `hashCoords`). Changing these breaks
// WASM↔CPU physics parity. See A4 § 2.4 + #608/#676 PR #717. Parity-pinned
// by the `hash_coords_bit_exact_with_ts_reference` test below (#720).
const HASH_MUL_X: i32 = 92_837_111;
const HASH_MUL_Y: i32 = 689_287_499;
const HASH_MUL_Z: i32 = 283_923_481;

/// Main XPBD cloth solver.
#[wasm_bindgen]
pub struct XpbdSolver {
    num_particles: usize,
    positions: Vec<f32>,      // [x,y,z, x,y,z, ...]
    prev_positions: Vec<f32>,
    velocities: Vec<f32>,
    inv_mass: Vec<f32>,

    // Stretch constraints: pairs of particle indices + rest length
    stretch_ids: Vec<u32>,      // [a,b, a,b, ...]
    stretch_rest: Vec<f32>,

    // Bend constraints (optional)
    bend_ids: Vec<u32>,         // [a,b,c,d, ...]
    bend_rest: Vec<f32>,        // rest distance (distance-based bending)

    // Seam constraints
    seam_ids: Vec<u32>,         // [a,b, a,b, ...]
    seam_target: Vec<f32>,      // target distance — decays per substep toward 0 (Fase 2 / BP-2)
    seam_compliance: Vec<f32>,  // XPBD compliance per seam (0 = rigid; larger = stretchy)
    // Seam target decay schedule (Fase 2 / BP-2). Mirrors CPU
    // `DEFAULT_SEAM_CONFIG` in `src/utils/cloth/seamAssembly.ts`:
    // each substep multiplies every target by `seam_shrink_factor`;
    // it clamps at max(seam_rest_length_floor, seam_sewed_threshold) —
    // the terminal seam gap ("fully sewn" = at the floor, A3).
    seam_shrink_factor: f32,
    seam_sewed_threshold: f32,
    // A3 (borrow-plan 2026-07-02): terminal seam rest length (m). Decay
    // clamps HERE instead of snapping to 0 — snap-to-0 dragged armscye seam
    // midpoints through the convex shoulder (skin-poke mechanism 2). 0.002
    // is the cross-tier canonical default (CPU DEFAULT_SEAM_CONFIG
    // .restLengthFloor, GPU seamRestLengthFloor uniform).
    seam_rest_length_floor: f32,

    // Self-collision
    self_collision: bool,
    thickness: f32,
    // CSR adjacency for `solve_self_collision`. `None` when never populated
    // (defensive fallback: self-collision no-ops rather than pushing all
    // triangle-shared pairs apart and tearing the mesh — see #717 reviewer
    // CRITICAL #3). `Some` only via `set_adjacency` which validates the CSR
    // shape (offsets monotonic, neighbors length matches sentinel) — #721.
    adjacency: Option<CSRAdjacency>,

    // Pinned vertices
    pin_indices: Vec<u32>,
    pin_positions: Vec<f32>,      // [x,y,z, x,y,z, ...] target positions
    original_inv_mass: Vec<f32>,  // Store original masses for unpinning

    // Config
    gravity_y: f32,
    damping: f32,
    substeps: u32,
    stretch_compliance: f32,
    /// Backport A7 STEP-4: cap rígido one-sided de elongación (espejo del
    /// default GPU 0.02 = 2% woven). 0 deshabilita.
    max_strain: f32,
    bend_compliance: f32,
    ground_y: f32,
    collision_margin: f32,
    drag_coefficient: f32,
    tri_ids: Vec<u32>,

    // Anisotropic stretch compliance
    stretch_compliance_warp: f32,
    stretch_compliance_weft: f32,
    stretch_compliance_shear: f32,
    stretch_compliances: Vec<f32>,  // Per-constraint compliance
    // Per-edge classification persisted so `configure()` can regenerate
    // `stretch_compliances` after JS-side compliance mutation. Without
    // this, `setConfig({ stretchComplianceWarp: ... })` was silently
    // dropped at runtime (#747). Mirrors `seam_compliance` regenerator
    // shape from BUG-3 #606.
    stretch_edge_types: Vec<u8>,

    // Anisotropic bend compliance
    bend_compliance_warp: f32,
    bend_compliance_weft: f32,
    bend_compliances: Vec<f32>,  // Per-constraint compliance
    bend_edge_types: Vec<u8>,

    // Internal damping
    internal_damping: f32,

    // Wind
    wind: [f32; 3],

    // Self-collision (#608, #676 per A7 § 3.1.1).
    // `spatial_hash` rebuilds per `solve_self_collision` call from current
    // positions. `collision_scratch` is a reusable candidate buffer kept
    // on the struct so disjoint-field borrows let the spatial-hash query
    // closure mutate it while `&self.spatial_hash` is held immutably.
    spatial_hash: SpatialHashGrid,
    collision_scratch: Vec<usize>,
}

#[wasm_bindgen]
impl XpbdSolver {
    /// Create a new solver with particle positions and inverse masses.
    #[wasm_bindgen(constructor)]
    pub fn new(positions: &[f32], inv_mass: &[f32]) -> XpbdSolver {
        // A3 ratified: install panic hook on first solver instantiation.
        // `set_once` is idempotent — safe to call multiple times. If Rust
        // code panics, browser console gets useful error message with
        // location and context, instead of opaque `WebAssembly.RuntimeError`.
        // Crate is defensively written (0 panic paths today); this is
        // preventive insurance for future regressions.
        console_error_panic_hook::set_once();

        let num_particles = inv_mass.len();
        let positions = positions.to_vec();
        let prev_positions = positions.clone();
        let velocities = vec![0.0; num_particles * 3];
        let inv_mass = inv_mass.to_vec();
        let original_inv_mass = inv_mass.clone();

        XpbdSolver {
            num_particles,
            positions,
            prev_positions,
            velocities,
            inv_mass,
            stretch_ids: Vec::new(),
            stretch_rest: Vec::new(),
            bend_ids: Vec::new(),
            bend_rest: Vec::new(),
            seam_ids: Vec::new(),
            seam_target: Vec::new(),
            seam_compliance: Vec::new(),
            seam_shrink_factor: 0.97,
            seam_sewed_threshold: 1e-6,
            seam_rest_length_floor: 0.002,
            self_collision: false,
            thickness: 0.002,
            adjacency: None,
            pin_indices: Vec::new(),
            pin_positions: Vec::new(),
            original_inv_mass,
            gravity_y: -9.81,
            damping: 0.99,
            substeps: 15,
            stretch_compliance: 0.0,
            max_strain: 0.02,
            bend_compliance: 1e4, // P1 dihedral: default ANGULAR calibrado contra el gate Cusick (banda [6e2,1e5]); lockstep GPU+CPU
            ground_y: 0.0,
            collision_margin: 0.005,
            drag_coefficient: 1.0,
            tri_ids: Vec::new(),
            stretch_compliance_warp: 0.0,
            stretch_compliance_weft: 0.0,
            stretch_compliance_shear: 0.001,
            stretch_compliances: Vec::new(),
            stretch_edge_types: Vec::new(),
            bend_compliance_warp: 1e4, // P1 angular (ver bend_compliance)
            bend_compliance_weft: 1e4,
            bend_compliances: Vec::new(),
            bend_edge_types: Vec::new(),
            internal_damping: 0.3,
            wind: [0.0, 0.0, 0.0],
            // `cell_size` is now supplied per-build inside
            // `solve_self_collision` (`2.0 * thickness`); the empty grid
            // starts with sentinel `inv_cell_size = 1.0` that gets
            // overwritten on the first build.
            spatial_hash: SpatialHashGrid::new(),
            collision_scratch: Vec::new(),
        }
    }

    /// Set stretch constraints (pairs of ids + rest lengths).
    pub fn set_stretch(&mut self, ids: &[u32], rest_lengths: &[f32]) {
        self.stretch_ids = ids.to_vec();
        self.stretch_rest = rest_lengths.to_vec();
    }

    /// Set stretch constraints with edge type classification.
    /// edge_types: 0 = WARP, 1 = WEFT, 2 = SHEAR
    ///
    /// Persists `edge_types` so `configure()` can regenerate the
    /// per-constraint compliance cache after global-field mutation
    /// (#747). Routes through `recompute_stretch_compliances` —
    /// single source of truth for the cache derivation.
    pub fn set_stretch_with_types(&mut self, ids: &[u32], rest_lengths: &[f32], edge_types: &[u8]) {
        self.stretch_ids = ids.to_vec();
        self.stretch_rest = rest_lengths.to_vec();
        self.stretch_edge_types = edge_types.to_vec();
        self.recompute_stretch_compliances();
    }

    /// Set bend constraints.
    /// P1 dihedral: `rest` son ÁNGULOS dihedral (radianes, signed, flat=0)
    /// del extractor compartido — ya NO distancias c-d.
    pub fn set_bend(&mut self, ids: &[u32], rest_angles: &[f32]) {
        self.bend_ids = ids.to_vec();
        self.bend_rest = rest_angles.to_vec();
    }

    /// Set bend constraints with edge type classification.
    /// edge_types: 0 = WARP, 1 = WEFT, 2 = SHEAR (SHEAR defaults to WEFT for bending)
    ///
    /// Persists `edge_types` so `configure()` can regenerate the
    /// per-constraint compliance cache after global-field mutation
    /// (#747). Routes through `recompute_bend_compliances` — single
    /// source of truth for the cache derivation.
    pub fn set_bend_with_types(&mut self, ids: &[u32], rest_angles: &[f32], edge_types: &[u8]) {
        self.bend_ids = ids.to_vec();
        self.bend_rest = rest_angles.to_vec();
        self.bend_edge_types = edge_types.to_vec();
        self.recompute_bend_compliances();
    }

    /// Set seam constraints with per-constraint XPBD compliance.
    ///
    /// `compliances` is a per-seam alpha value: 0.0 = perfectly rigid seam,
    /// larger values = more compliant (stretchy). Mirrors the
    /// `set_stretch_with_types` / `set_bend_with_types` shape used elsewhere
    /// in this crate.
    ///
    /// BUG-3 (#606): the previous 2-arg `set_seams(ids, target)` discarded
    /// per-seam tension/strength data the JS side computes; the solver
    /// hardcoded alpha=0 internally and treated every seam as rigid. The
    /// fix moves the compliance into the API contract so JS-side data
    /// flows through.
    pub fn set_seams_with_compliance(
        &mut self,
        ids: &[u32],
        target_dist: &[f32],
        compliances: &[f32],
    ) {
        self.seam_ids = ids.to_vec();
        self.seam_target = target_dist.to_vec();
        self.seam_compliance = compliances.to_vec();
    }

    /// Configure the seam target decay schedule (Fase 2 / BP-2).
    ///
    /// Mirrors the CPU shrink semantics in `solveSeamConstraints`
    /// (`src/utils/cloth/seamAssembly.ts`): each substep multiplies every
    /// seam target by `shrink_factor` and snaps it to 0 once it falls
    /// below `sewed_threshold`, so seams CLOSE instead of holding their
    /// init-time distance forever. The constructor defaults (0.97 / 1e-6)
    /// match `DEFAULT_SEAM_CONFIG` on the JS side; this setter keeps the
    /// values config-driven if that constant ever moves.
    ///
    /// Defensive (A3): non-finite inputs are ignored (current values kept);
    /// `shrink_factor` clamps to [0, 1] (a factor > 1 would GROW the gap
    /// every substep); negative thresholds clamp to 0.
    pub fn set_seam_shrink_params(&mut self, shrink_factor: f32, sewed_threshold: f32) {
        if shrink_factor.is_finite() {
            self.seam_shrink_factor = shrink_factor.clamp(0.0, 1.0);
        }
        if sewed_threshold.is_finite() {
            self.seam_sewed_threshold = sewed_threshold.max(0.0);
        }
    }

    /// A3: set the terminal seam rest-length floor (m). Defensive per
    /// set_seam_shrink_params: non-finite ignored, negative clamps to 0 (the
    /// sewed threshold then lower-bounds the effective floor in solve_seams,
    /// preserving the legacy near-zero terminal gap).
    pub fn set_seam_rest_length_floor(&mut self, floor: f32) {
        if floor.is_finite() {
            self.seam_rest_length_floor = floor.max(0.0);
        }
    }

    /// Set triangle indices for air drag calculation.
    pub fn set_triangles(&mut self, tri_ids: &[u32]) {
        self.tri_ids = tri_ids.to_vec();
    }

    /// Set adjacency for self-collision.
    ///
    /// CSR (Compressed Sparse Row) representation of per-particle
    /// triangle-shared neighbors. Used by `solve_self_collision` to skip
    /// connected pairs (avoiding pushing apart particles that share an edge
    /// in the mesh).
    ///
    /// # Arguments
    ///
    /// * `offsets` — Length `num_particles + 1`. `offsets[i]..offsets[i+1]`
    ///   gives the slice of `neighbors` corresponding to particle `i`. Must
    ///   be monotonic non-decreasing. `offsets[num_particles]` equals
    ///   `neighbors.len()` (CSR sentinel).
    /// * `neighbors` — Flat array of triangle-shared neighbor indices.
    ///   Length equals `offsets[num_particles]`.
    ///
    /// # Example
    ///
    /// For a 3-particle mesh where every particle shares a triangle with
    /// the other two:
    /// - `offsets   = [0, 2, 4, 6]`
    /// - `neighbors = [1, 2, 0, 2, 0, 1]`
    ///
    /// # Validation (#721)
    ///
    /// Validates the CSR shape via `CSRAdjacency::new` before storing.
    /// Returns `Err` (surfaces as a JS exception via wasm-bindgen) with a
    /// human-readable diagnostic if the shape is malformed; worker should
    /// catch and log, then continue stepping with self-collision disabled
    /// (the existing `Option::None` guard in `solve_self_collision` makes
    /// this a no-op rather than tearing the mesh — same fail-loud-by-no-op
    /// shape as the empty-offsets path from #717).
    ///
    /// # Empty CSR
    ///
    /// Calling with empty `offsets` (length 0) is also rejected — the CSR
    /// invariant requires at least the sentinel entry. Worker happy-path
    /// produces `offsets[num_particles + 1]` so this is never hit in normal
    /// flow. Internal test fixtures use `[0; num_particles + 1]` to express
    /// "no neighbors for any particle".
    pub fn set_adjacency(&mut self, offsets: &[u32], neighbors: &[u32]) -> Result<(), String> {
        let adj = CSRAdjacency::new(offsets.to_vec(), neighbors.to_vec())
            .map_err(|e| e.to_string())?;
        self.adjacency = Some(adj);
        Ok(())
    }

    /// Set pinned vertices with target positions.
    /// indices: flat array of vertex indices to pin
    /// positions: flat array [x,y,z, x,y,z, ...] of target positions
    pub fn set_pins(&mut self, indices: &[u32], positions: &[f32]) {
        // First, restore all previously pinned vertices to original mass
        for &idx in &self.pin_indices {
            let i = idx as usize;
            if i < self.num_particles {
                self.inv_mass[i] = self.original_inv_mass[i];
            }
        }

        // Store new pins
        self.pin_indices = indices.to_vec();
        self.pin_positions = positions.to_vec();

        // Set inv_mass = 0 for newly pinned vertices and set their positions
        for (p, &idx) in self.pin_indices.iter().enumerate() {
            let i = idx as usize;
            if i < self.num_particles && p * 3 + 2 < self.pin_positions.len() {
                self.inv_mass[i] = 0.0;
                let pos_idx = i * 3;
                self.positions[pos_idx] = self.pin_positions[p * 3];
                self.positions[pos_idx + 1] = self.pin_positions[p * 3 + 1];
                self.positions[pos_idx + 2] = self.pin_positions[p * 3 + 2];
            }
        }
    }

    /// Clear all pins, restoring original masses.
    pub fn clear_pins(&mut self) {
        for &idx in &self.pin_indices {
            let i = idx as usize;
            if i < self.num_particles {
                self.inv_mass[i] = self.original_inv_mass[i];
            }
        }
        self.pin_indices.clear();
        self.pin_positions.clear();
    }

    /// Configure solver parameters (16 positional args).
    ///
    /// **A2 Fase 2 § 2.3 + § 3.1 ratified.** Rust ABI is the cross-language
    /// floor — adding/renaming a parameter requires touching this signature
    /// + struct field + constructor default + WASM rebuild + sync of BOTH
    /// `xpbd_wasm.js` + `xpbd_wasm_bg.wasm` to `public/wasm/` (CLAUDE.md
    /// non-negotiable) + TS-side `WasmXpbdSolver` interface +
    /// `AppliedSolverConfig` + `DEFAULT_SOLVER_CONFIG` + `applySolverConfig`
    /// callsite (worker) + `WasmSolverConfig` (client).
    ///
    /// Rust constructor `XpbdSolver::new()` defaults are canonical for
    /// cross-tier shared field defaults per `CLAUDE/methodology.md` § 15 —
    /// TS `DEFAULT_SOLVER_CONFIG` const en `wasmSolverWorker.ts` and CPU
    /// `ClothSimConfig` constructor defaults en `xpbdSolver.ts` MUST match
    /// for shared fields.
    ///
    /// Cross-ref: `docs/reports/2026-05-02-drift-fase2-a2-cross-boundary-serialization.md`.
    //
    // 16 positional args ratified per A2 Fase 2 § 2.3 as the cross-language
    // ABI floor; mirrored field-by-field in TS `WasmSolverConfig` and CPU
    // `ClothSimConfig`. Refactoring to a struct would require touching every
    // caller across two languages and is intentionally deferred.
    #[allow(clippy::too_many_arguments)]
    pub fn configure(&mut self, substeps: u32, damping: f32, gravity_y: f32,
                     stretch_compliance: f32, bend_compliance: f32,
                     self_collision: bool, thickness: f32, collision_margin: f32,
                     ground_y: f32, drag_coefficient: f32,
                     stretch_compliance_warp: f32, stretch_compliance_weft: f32,
                     stretch_compliance_shear: f32,
                     bend_compliance_warp: f32, bend_compliance_weft: f32,
                     internal_damping: f32) {
        self.substeps = substeps;
        self.damping = damping;
        self.gravity_y = gravity_y;
        self.stretch_compliance = stretch_compliance;
        self.bend_compliance = bend_compliance;
        self.self_collision = self_collision;
        self.thickness = thickness;
        self.collision_margin = collision_margin;
        self.ground_y = ground_y;
        self.drag_coefficient = drag_coefficient;
        self.stretch_compliance_warp = stretch_compliance_warp;
        self.stretch_compliance_weft = stretch_compliance_weft;
        self.stretch_compliance_shear = stretch_compliance_shear;
        self.bend_compliance_warp = bend_compliance_warp;
        self.bend_compliance_weft = bend_compliance_weft;
        self.internal_damping = internal_damping;

        // #747: regenerate per-edge compliance caches from the new
        // global anisotropic fields. Without this, `setConfig` from JS
        // mutates the globals here but `solve_stretch`/`solve_bend`
        // keep reading stale values cached at `set_*_with_types` time.
        // Mirrors `seam_compliance` regenerator pattern from BUG-3 #606.
        self.recompute_stretch_compliances();
        self.recompute_bend_compliances();
    }

    /// Regenerate `stretch_compliances` from `stretch_edge_types` and the
    /// current anisotropic global fields. Single source of truth shared
    /// by `set_stretch_with_types` (init) and `configure()` (runtime
    /// mutation per #747).
    fn recompute_stretch_compliances(&mut self) {
        self.stretch_compliances = self.stretch_edge_types.iter().map(|&et| {
            match et {
                0 => self.stretch_compliance_warp,   // WARP
                1 => self.stretch_compliance_weft,   // WEFT
                _ => self.stretch_compliance_shear,  // SHEAR or default
            }
        }).collect();
    }

    /// Regenerate `bend_compliances` from `bend_edge_types` and the
    /// current anisotropic global fields. SHEAR maps to WEFT (matching
    /// the original `set_bend_with_types` semantics).
    fn recompute_bend_compliances(&mut self) {
        self.bend_compliances = self.bend_edge_types.iter().map(|&et| {
            match et {
                0 => self.bend_compliance_warp,   // WARP
                _ => self.bend_compliance_weft,   // WEFT or SHEAR (default to weft)
            }
        }).collect();
    }

    /// Set wind direction and strength (world-space force vector).
    pub fn set_wind(&mut self, wx: f32, wy: f32, wz: f32) {
        self.wind = [wx, wy, wz];
    }

    /// Step the simulation forward one frame.
    pub fn step(&mut self, dt: f32) {
        let sdt = dt / self.substeps as f32;

        for _ in 0..self.substeps {
            self.enforce_pins();
            self.pre_solve(sdt);
            self.solve_stretch(sdt);
            self.solve_bend(sdt);
            self.solve_seams(sdt);
            // Self-collision after soft constraints, before ground clamp —
            // mirrors CPU TS ordering (`xpbdSolver.ts` step(): self-collision
            // runs after `solveSeams`, before `solveGroundCollision`).
            if self.self_collision {
                self.solve_self_collision();
            }
            self.solve_ground_collision(); // Ground collision AFTER all constraints
            self.enforce_pins(); // Also enforce after constraints
            self.post_solve(sdt);
        }
    }

    /// Enforce pinned vertex positions.
    fn enforce_pins(&mut self) {
        for (p, &idx) in self.pin_indices.iter().enumerate() {
            let i = idx as usize;
            if i < self.num_particles && p * 3 + 2 < self.pin_positions.len() {
                let pos_idx = i * 3;
                self.positions[pos_idx] = self.pin_positions[p * 3];
                self.positions[pos_idx + 1] = self.pin_positions[p * 3 + 1];
                self.positions[pos_idx + 2] = self.pin_positions[p * 3 + 2];
            }
        }
    }

    /// Get pointer to positions buffer (for zero-copy JS access).
    pub fn positions_ptr(&self) -> *const f32 {
        self.positions.as_ptr()
    }

    /// Get pointer to velocities buffer (for JS-side collision velocity correction).
    pub fn velocities_ptr(&self) -> *const f32 {
        self.velocities.as_ptr()
    }

    /// Get pointer to previous positions buffer (for JS-side collision correction).
    pub fn prev_positions_ptr(&self) -> *const f32 {
        self.prev_positions.as_ptr()
    }

    /// Get number of particles.
    pub fn num_particles(&self) -> usize {
        self.num_particles
    }

    /// Pointer to stretch constraint indices [a,b, a,b, ...] for fit map computation.
    pub fn stretch_ids_ptr(&self) -> *const u32 {
        self.stretch_ids.as_ptr()
    }

    /// Pointer to stretch constraint rest lengths for fit map computation.
    pub fn stretch_rest_ptr(&self) -> *const f32 {
        self.stretch_rest.as_ptr()
    }

    /// Number of stretch constraints (each constraint = one edge = one pair of IDs).
    pub fn num_stretch_edges(&self) -> usize {
        self.stretch_rest.len()
    }

    // ─── Internal solver passes ─────────────────────────────────────────

    fn pre_solve(&mut self, sdt: f32) {
        // Compute total damping with internal damping factor
        let internal_damping_factor = 1.0 - self.internal_damping * 0.1;
        let total_damping = self.damping * internal_damping_factor;

        for i in 0..self.num_particles {
            if self.inv_mass[i] == 0.0 { continue; }
            let idx = i * 3;

            // Save previous position
            self.prev_positions[idx] = self.positions[idx];
            self.prev_positions[idx + 1] = self.positions[idx + 1];
            self.prev_positions[idx + 2] = self.positions[idx + 2];

            // Apply gravity
            self.velocities[idx + 1] += self.gravity_y * sdt;

            // Damping (using total_damping which includes internal damping)
            self.velocities[idx] *= total_damping;
            self.velocities[idx + 1] *= total_damping;
            self.velocities[idx + 2] *= total_damping;

            // Integrate
            self.positions[idx] += self.velocities[idx] * sdt;
            self.positions[idx + 1] += self.velocities[idx + 1] * sdt;
            self.positions[idx + 2] += self.velocities[idx + 2] * sdt;
        }

        // Apply air drag after gravity integration
        self.apply_air_drag(sdt);

        // Apply wind force
        self.apply_wind_force(sdt);
    }

    fn solve_stretch(&mut self, sdt: f32) {
        let num_constraints = self.stretch_ids.len() / 2;

        for c in 0..num_constraints {
            // Use per-constraint compliance if available, else global
            let compliance = if c < self.stretch_compliances.len() {
                self.stretch_compliances[c]
            } else {
                self.stretch_compliance
            };
            let alpha = compliance / (sdt * sdt);

            let a = self.stretch_ids[c * 2] as usize;
            let b = self.stretch_ids[c * 2 + 1] as usize;
            let wa = self.inv_mass[a];
            let wb = self.inv_mass[b];
            let w_sum = wa + wb;
            if w_sum == 0.0 { continue; }

            let ai = a * 3;
            let bi = b * 3;
            let dx = self.positions[bi] - self.positions[ai];
            let dy = self.positions[bi + 1] - self.positions[ai + 1];
            let dz = self.positions[bi + 2] - self.positions[ai + 2];
            let dist = (dx * dx + dy * dy + dz * dz).sqrt();
            if dist < 1e-12 { continue; }

            let rest = self.stretch_rest[c];
            let c_val = dist - rest;
            // P1-A (B5): ONE-SIDED — solo tensión; compresión libre (el
            // pandeo lo gobierna el dihedral). Espejo CPU solveStretching.
            if c_val > 0.0 {
                let s = -c_val / (w_sum + alpha);

                let nx = dx / dist;
                let ny = dy / dist;
                let nz = dz / dist;

                self.positions[ai] -= nx * s * wa;
                self.positions[ai + 1] -= ny * s * wa;
                self.positions[ai + 2] -= nz * s * wa;
                self.positions[bi] += nx * s * wb;
                self.positions[bi + 1] += ny * s * wb;
                self.positions[bi + 2] += nz * s * wb;
            }

            // Cap rígido one-sided fusionado (backport A7 STEP-4, espejo CPU
            // solveStretching / TSL makeDistanceConstraintFn): si tras el
            // solve compliant el edge sigue sobre rest·(1+max_strain),
            // proyección RÍGIDA (alpha=0) de vuelta al cap.
            if self.max_strain > 0.0 {
                let dx2 = self.positions[bi] - self.positions[ai];
                let dy2 = self.positions[bi + 1] - self.positions[ai + 1];
                let dz2 = self.positions[bi + 2] - self.positions[ai + 2];
                let dist2 = (dx2 * dx2 + dy2 * dy2 + dz2 * dz2).sqrt();
                let max_len = rest * (1.0 + self.max_strain);
                if dist2 > max_len && dist2 > 1e-7 {
                    let s_cap = -(dist2 - max_len) / w_sum;
                    let nx2 = dx2 / dist2;
                    let ny2 = dy2 / dist2;
                    let nz2 = dz2 / dist2;
                    self.positions[ai] -= nx2 * s_cap * wa;
                    self.positions[ai + 1] -= ny2 * s_cap * wa;
                    self.positions[ai + 2] -= nz2 * s_cap * wa;
                    self.positions[bi] += nx2 * s_cap * wb;
                    self.positions[bi + 1] += ny2 * s_cap * wb;
                    self.positions[bi + 2] += nz2 * s_cap * wb;
                }
            }
        }
    }

    fn solve_bend(&mut self, sdt: f32) {
        // P1 dihedral (spec 2026-07-02-dihedral-bend-design.md §4): proyección
        // XPBD angular C = φ − φ* sobre el quad completo [a,b,c,d] (arista
        // a-b, alas c,d). Transcripción línea-a-línea de dihedral.ts
        // `solveDihedralQuad` — ESA es la verdad compartida; si esto diverge,
        // la paridad CPU↔WASM se rompe. bend_rest ahora guarda ÁNGULOS
        // (radianes, signed, flat=0), no distancias c-d (BUG-1 invertido:
        // computeBendRestDistances borrado). Gradientes PBD (n/|n|² baka
        // 1/(2·área)); ángulo por atan2 (Tissu) — estable cerca de plano.
        // Guards load-bearing (A3 + one-sided stretch hace slivers más
        // probables): |e|², |n|², denom. Corrección = +w·λ·d (el flip de
        // signo del acos de PBD queda absorbido por el φ signed).
        const EPS_EDGE_SQ: f32 = 1e-12;
        const EPS_NORMAL_SQ: f32 = 1e-12;
        let num_constraints = self.bend_ids.len() / 4;

        for c in 0..num_constraints {
            let compliance = if c < self.bend_compliances.len() {
                self.bend_compliances[c]
            } else {
                self.bend_compliance
            };
            let alpha_tilde = compliance / (sdt * sdt);

            let a = self.bend_ids[c * 4] as usize;
            let b = self.bend_ids[c * 4 + 1] as usize;
            let cc = self.bend_ids[c * 4 + 2] as usize;
            let d = self.bend_ids[c * 4 + 3] as usize;

            let wa = self.inv_mass[a];
            let wb = self.inv_mass[b];
            let wc = self.inv_mass[cc];
            let wd = self.inv_mass[d];
            if wa + wb + wc + wd == 0.0 { continue; }

            let (ax, ay, az) = (self.positions[a * 3], self.positions[a * 3 + 1], self.positions[a * 3 + 2]);
            let (bx, by, bz) = (self.positions[b * 3], self.positions[b * 3 + 1], self.positions[b * 3 + 2]);
            let (cx, cy, cz) = (self.positions[cc * 3], self.positions[cc * 3 + 1], self.positions[cc * 3 + 2]);
            let (px, py, pz) = (self.positions[d * 3], self.positions[d * 3 + 1], self.positions[d * 3 + 2]);

            let (ex, ey, ez) = (bx - ax, by - ay, bz - az);
            let elen_sq = ex * ex + ey * ey + ez * ez;
            if elen_sq < EPS_EDGE_SQ { continue; }
            let elen = elen_sq.sqrt();
            let inv_elen = 1.0 / elen;

            // n1 = (a−c)×(b−c), n2 = (b−d)×(a−d)
            let (acx, acy, acz) = (ax - cx, ay - cy, az - cz);
            let (bcx, bcy, bcz) = (bx - cx, by - cy, bz - cz);
            let mut n1x = acy * bcz - acz * bcy;
            let mut n1y = acz * bcx - acx * bcz;
            let mut n1z = acx * bcy - acy * bcx;

            let (bdx, bdy, bdz) = (bx - px, by - py, bz - pz);
            let (adx, ady, adz) = (ax - px, ay - py, az - pz);
            let mut n2x = bdy * adz - bdz * ady;
            let mut n2y = bdz * adx - bdx * adz;
            let mut n2z = bdx * ady - bdy * adx;

            let n1sq = n1x * n1x + n1y * n1y + n1z * n1z;
            let n2sq = n2x * n2x + n2y * n2y + n2z * n2z;
            if n1sq < EPS_NORMAL_SQ || n2sq < EPS_NORMAL_SQ { continue; }

            let inv1 = 1.0 / n1sq.sqrt();
            let inv2 = 1.0 / n2sq.sqrt();
            let (u1x, u1y, u1z) = (n1x * inv1, n1y * inv1, n1z * inv1);
            let (u2x, u2y, u2z) = (n2x * inv2, n2y * inv2, n2z * inv2);
            let cos_t = (u1x * u2x + u1y * u2y + u1z * u2z).clamp(-1.0, 1.0);
            let crx = u1y * u2z - u1z * u2y;
            let cry = u1z * u2x - u1x * u2z;
            let crz = u1x * u2y - u1y * u2x;
            let sin_t = (crx * ex + cry * ey + crz * ez) * inv_elen;
            let phi = sin_t.atan2(cos_t);

            // Gradientes con n/|n|².
            n1x /= n1sq; n1y /= n1sq; n1z /= n1sq;
            n2x /= n2sq; n2y /= n2sq; n2z /= n2sq;

            let (dcx, dcy, dcz) = (elen * n1x, elen * n1y, elen * n1z);
            let (ddx, ddy, ddz) = (elen * n2x, elen * n2y, elen * n2z);
            let cb_dot_e = ((cx - bx) * ex + (cy - by) * ey + (cz - bz) * ez) * inv_elen;
            let db_dot_e = ((px - bx) * ex + (py - by) * ey + (pz - bz) * ez) * inv_elen;
            let dax = cb_dot_e * n1x + db_dot_e * n2x;
            let day = cb_dot_e * n1y + db_dot_e * n2y;
            let daz = cb_dot_e * n1z + db_dot_e * n2z;
            let ac_dot_e = ((ax - cx) * ex + (ay - cy) * ey + (az - cz) * ez) * inv_elen;
            let ad_dot_e = ((ax - px) * ex + (ay - py) * ey + (az - pz) * ez) * inv_elen;
            let dbx = ac_dot_e * n1x + ad_dot_e * n2x;
            let dby = ac_dot_e * n1y + ad_dot_e * n2y;
            let dbz = ac_dot_e * n1z + ad_dot_e * n2z;

            let denom = wa * (dax * dax + day * day + daz * daz)
                + wb * (dbx * dbx + dby * dby + dbz * dbz)
                + wc * (dcx * dcx + dcy * dcy + dcz * dcz)
                + wd * (ddx * ddx + ddy * ddy + ddz * ddz)
                + alpha_tilde;
            if denom <= EPS_NORMAL_SQ { continue; }

            let rest = self.bend_rest[c];
            let lambda = (phi - rest) / denom;

            self.positions[a * 3] += wa * lambda * dax;
            self.positions[a * 3 + 1] += wa * lambda * day;
            self.positions[a * 3 + 2] += wa * lambda * daz;
            self.positions[b * 3] += wb * lambda * dbx;
            self.positions[b * 3 + 1] += wb * lambda * dby;
            self.positions[b * 3 + 2] += wb * lambda * dbz;
            self.positions[cc * 3] += wc * lambda * dcx;
            self.positions[cc * 3 + 1] += wc * lambda * dcy;
            self.positions[cc * 3 + 2] += wc * lambda * dcz;
            self.positions[d * 3] += wd * lambda * ddx;
            self.positions[d * 3 + 1] += wd * lambda * ddy;
            self.positions[d * 3 + 2] += wd * lambda * ddz;
        }
    }

    fn solve_seams(&mut self, sdt: f32) {
        // Fase 2 (BP-2): decay seam targets toward zero each substep,
        // mirroring CPU `solveSeamConstraints` — shrink BEFORE solving,
        // snap to 0 below the threshold. Without this, the target stayed
        // at its init-time distance (buildSeamConstraints seeds
        // restLength = current distance) and seams never closed on the
        // WASM tier: pieces hovered at exactly the gap they were placed.
        let shrink = self.seam_shrink_factor;
        // A3: clamp at the rest-length floor (fabric-thickness spacing), NOT
        // snap to 0. The sewed threshold lower-bounds the effective floor so
        // a floor of 0 degrades to the legacy near-zero terminal gap.
        let floor = self.seam_rest_length_floor.max(self.seam_sewed_threshold);
        for t in self.seam_target.iter_mut() {
            if *t > floor {
                *t = (*t * shrink).max(floor);
            }
        }

        let num = self.seam_ids.len() / 2;
        let inv_dt2 = 1.0 / (sdt * sdt);

        for c in 0..num {
            let a = self.seam_ids[c * 2] as usize;
            let b = self.seam_ids[c * 2 + 1] as usize;
            let wa = self.inv_mass[a];
            let wb = self.inv_mass[b];
            let w_sum = wa + wb;
            if w_sum == 0.0 { continue; }

            let ai = a * 3;
            let bi = b * 3;
            let dx = self.positions[bi] - self.positions[ai];
            let dy = self.positions[bi + 1] - self.positions[ai + 1];
            let dz = self.positions[bi + 2] - self.positions[ai + 2];
            let dist = (dx * dx + dy * dy + dz * dz).sqrt();
            if dist < 1e-12 { continue; }

            // BUG-3 (#606): per-seam alpha derived from the compliance array
            // populated by `set_seams_with_compliance`. compliance=0 still
            // means rigid (alpha=0); non-zero values now actually take
            // effect instead of being silently ignored.
            let compliance = if c < self.seam_compliance.len() {
                self.seam_compliance[c]
            } else {
                0.0
            };
            let alpha = compliance * inv_dt2;
            let target = self.seam_target[c];
            let c_val = dist - target;
            let s = -c_val / (w_sum + alpha);

            let nx = dx / dist;
            let ny = dy / dist;
            let nz = dz / dist;

            self.positions[ai] -= nx * s * wa;
            self.positions[ai + 1] -= ny * s * wa;
            self.positions[ai + 2] -= nz * s * wa;
            self.positions[bi] += nx * s * wb;
            self.positions[bi + 1] += ny * s * wb;
            self.positions[bi + 2] += nz * s * wb;
        }
    }

    /// Particle-vs-particle self-collision (#608, #676 per A7 § 3.1.1).
    ///
    /// Bit-exact port of `solveSelfCollision` in
    /// `src/utils/cloth/selfCollision.ts`. Cell size = `2.0 * thickness`
    /// matches CPU heuristic. Adjacency consumed from the CSR pair
    /// (`adjacency_offsets`, `adjacency_neighbors`) populated via
    /// `set_adjacency` from `wasmSolverWorker.ts` post-`set_triangles`
    /// init.
    ///
    /// # Defensive fallbacks
    ///
    /// - `thickness <= 0.0` or `num_particles == 0` → no-op return.
    /// - `adjacency_offsets` empty → no-op return. Worker happy-path always
    ///   populates the CSR; this guard catches future re-init reordering /
    ///   test harness / hot-swap bugs from silently running broken physics
    ///   (every triangle-connected neighbor would be treated as
    ///   non-adjacent → cloth tearing). Fail-loud-by-no-op is preferable to
    ///   garbage output.
    /// - Per-pair NaN distance² → `continue`. Matches A3 § 3.3 NaN-guard
    ///   parity with the CPU side; upstream constraint solvers
    ///   (stretch/bend/seam/elastic) producing NaN must not propagate
    ///   through self-collision corrections.
    fn solve_self_collision(&mut self) {
        if self.thickness <= 0.0 || self.num_particles == 0 {
            return;
        }

        // CSR must be populated for correct triangle-shared neighbor skip.
        // Early return is preferable to running self-collision against an
        // empty adjacency: every connected pair would be treated as
        // non-adjacent and pushed apart, tearing the mesh along every
        // shared edge. #721: `Option::None` now models the never-populated
        // state (was `.is_empty()` against a pair of parallel Vecs).
        if self.adjacency.is_none() {
            return;
        }
        debug_assert_eq!(
            self.positions.len(),
            self.num_particles * 3,
            "positions length must equal num_particles * 3 (x, y, z per particle)"
        );
        debug_assert_eq!(
            self.inv_mass.len(),
            self.num_particles,
            "inv_mass length must equal num_particles"
        );

        self.spatial_hash
            .build(&self.positions, self.num_particles, 2.0 * self.thickness);

        let thickness = self.thickness;
        let thickness_sq = thickness * thickness;

        for i in 0..self.num_particles {
            if self.inv_mass[i] == 0.0 {
                continue;
            }
            let ix = i * 3;
            let px = self.positions[ix];
            let py = self.positions[ix + 1];
            let pz = self.positions[ix + 2];

            // Gather candidates via spatial hash. Disjoint-field borrow:
            // `&mut self.collision_scratch` and `&self.spatial_hash` are
            // independent fields — borrow checker accepts.
            self.collision_scratch.clear();
            {
                let scratch = &mut self.collision_scratch;
                self.spatial_hash.query(px, py, pz, |j| scratch.push(j));
            }

            // Snapshot the adjacency slice for particle `i` as a `Vec<u32>`
            // copy. Avoids holding a `&CSRAdjacency` borrow across the
            // inner loop's `self.positions[ix] += ...` mutation (would
            // alias the same `&mut self`). Per-particle slice is 4-6
            // entries on a triangle mesh; allocation is amortised.
            let adj_neighbors: Vec<u32> = self
                .adjacency
                .as_ref()
                .expect("adjacency: None case returned at top of function")
                .neighbors_of(i)
                .to_vec();

            for k in 0..self.collision_scratch.len() {
                let j = self.collision_scratch[k];
                if j <= i {
                    continue; // avoid duplicate pair processing
                }
                if self.inv_mass[j] == 0.0 {
                    continue; // skip pinned partner
                }

                // Adjacency skip (linear scan; per-particle CSR slice is
                // typically 4-6 entries for a triangle mesh).
                let mut is_adjacent = false;
                for &neighbor in &adj_neighbors {
                    if neighbor as usize == j {
                        is_adjacent = true;
                        break;
                    }
                }
                if is_adjacent {
                    continue;
                }

                let jx = j * 3;
                let dx = self.positions[ix] - self.positions[jx];
                let dy = self.positions[ix + 1] - self.positions[jx + 1];
                let dz = self.positions[ix + 2] - self.positions[jx + 2];
                let dist2 = dx * dx + dy * dy + dz * dz;

                // NaN guard — A3 § 3.3 parity with CPU side. Upstream
                // constraint solvers can leave NaN positions; without this
                // check `dist2 >= thickness_sq` and `dist2 == 0.0` both
                // fall false on NaN, the `sqrt` and `1.0/dist` propagate
                // NaN, and the position update infects two more particles
                // per pair (silent NaN cascade across the mesh).
                if !dist2.is_finite() {
                    continue;
                }

                if dist2 >= thickness_sq || dist2 == 0.0 {
                    continue;
                }

                let dist = dist2.sqrt();
                let inv_dist = 1.0 / dist;

                let nx = dx * inv_dist;
                let ny = dy * inv_dist;
                let nz = dz * inv_dist;

                let wi = self.inv_mass[i];
                let wj = self.inv_mass[j];
                let w_sum = wi + wj;

                let corr = (thickness - dist) / w_sum;

                self.positions[ix] += nx * corr * wi;
                self.positions[ix + 1] += ny * corr * wi;
                self.positions[ix + 2] += nz * corr * wi;

                self.positions[jx] -= nx * corr * wj;
                self.positions[jx + 1] -= ny * corr * wj;
                self.positions[jx + 2] -= nz * corr * wj;
            }
        }
    }

    /// Ground plane collision - clamps particles to ground plane
    /// Friction is handled separately in post_solve at velocity level
    fn solve_ground_collision(&mut self) {
        for i in 0..self.num_particles {
            if self.inv_mass[i] == 0.0 { continue; }
            let idx = i * 3;

            if self.positions[idx + 1] < self.ground_y {
                // Clamp to ground plane
                self.positions[idx + 1] = self.ground_y;
            }
        }
    }

    /// Apply aerodynamic drag force per triangle.
    fn apply_air_drag(&mut self, sdt: f32) {
        if self.drag_coefficient <= 0.0 || self.tri_ids.is_empty() {
            return;
        }

        let air_density = 1.225_f32;
        let num_tris = self.tri_ids.len() / 3;

        for t in 0..num_tris {
            let i0 = self.tri_ids[t * 3] as usize;
            let i1 = self.tri_ids[t * 3 + 1] as usize;
            let i2 = self.tri_ids[t * 3 + 2] as usize;

            // Skip if all pinned
            if self.inv_mass[i0] == 0.0 && self.inv_mass[i1] == 0.0 && self.inv_mass[i2] == 0.0 {
                continue;
            }

            let (i0_3, i1_3, i2_3) = (i0 * 3, i1 * 3, i2 * 3);

            // Triangle velocity (average)
            let tri_vel = [
                (self.velocities[i0_3] + self.velocities[i1_3] + self.velocities[i2_3]) / 3.0,
                (self.velocities[i0_3 + 1] + self.velocities[i1_3 + 1] + self.velocities[i2_3 + 1]) / 3.0,
                (self.velocities[i0_3 + 2] + self.velocities[i1_3 + 2] + self.velocities[i2_3 + 2]) / 3.0,
            ];

            let speed = (tri_vel[0] * tri_vel[0] + tri_vel[1] * tri_vel[1] + tri_vel[2] * tri_vel[2]).sqrt();
            if speed < 0.001 {
                continue;
            }

            // Edge vectors
            let e0 = [
                self.positions[i1_3] - self.positions[i0_3],
                self.positions[i1_3 + 1] - self.positions[i0_3 + 1],
                self.positions[i1_3 + 2] - self.positions[i0_3 + 2],
            ];
            let e1 = [
                self.positions[i2_3] - self.positions[i0_3],
                self.positions[i2_3 + 1] - self.positions[i0_3 + 1],
                self.positions[i2_3 + 2] - self.positions[i0_3 + 2],
            ];

            // Normal = cross(e0, e1)
            let normal = [
                e0[1] * e1[2] - e0[2] * e1[1],
                e0[2] * e1[0] - e0[0] * e1[2],
                e0[0] * e1[1] - e0[1] * e1[0],
            ];

            let normal_len = (normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]).sqrt();
            if normal_len < 1e-10 {
                continue;
            }

            let area = normal_len * 0.5;
            let normal_normalized = [normal[0] / normal_len, normal[1] / normal_len, normal[2] / normal_len];
            let vel_dir = [tri_vel[0] / speed, tri_vel[1] / speed, tri_vel[2] / speed];

            // Facing factor
            let facing = (normal_normalized[0] * vel_dir[0] + normal_normalized[1] * vel_dir[1] + normal_normalized[2] * vel_dir[2]).abs();

            // Drag magnitude: F = 1/2 * rho * v^2 * Cd * A * facing
            let drag_mag = 0.5 * air_density * speed * speed * self.drag_coefficient * area * facing;

            // Drag force opposes velocity
            let drag_force = [-vel_dir[0] * drag_mag, -vel_dir[1] * drag_mag, -vel_dir[2] * drag_mag];

            // Distribute to vertices
            let force_per_vertex = 1.0 / 3.0;
            for &idx in &[i0, i1, i2] {
                if self.inv_mass[idx] == 0.0 {
                    continue;
                }
                let vi = idx * 3;
                let scale = force_per_vertex * self.inv_mass[idx] * sdt;
                self.velocities[vi] += drag_force[0] * scale;
                self.velocities[vi + 1] += drag_force[1] * scale;
                self.velocities[vi + 2] += drag_force[2] * scale;
            }
        }
    }

    /// Apply wind force per triangle based on facing area.
    fn apply_wind_force(&mut self, sdt: f32) {
        let wind = self.wind;
        if wind[0] == 0.0 && wind[1] == 0.0 && wind[2] == 0.0 {
            return;
        }
        if self.tri_ids.is_empty() {
            return;
        }

        let num_tris = self.tri_ids.len() / 3;

        for t in 0..num_tris {
            let i0 = self.tri_ids[t * 3] as usize;
            let i1 = self.tri_ids[t * 3 + 1] as usize;
            let i2 = self.tri_ids[t * 3 + 2] as usize;

            // Skip if all pinned
            if self.inv_mass[i0] == 0.0 && self.inv_mass[i1] == 0.0 && self.inv_mass[i2] == 0.0 {
                continue;
            }

            let (p0, p1, p2) = (i0 * 3, i1 * 3, i2 * 3);

            // Edge vectors
            let e0 = [
                self.positions[p1] - self.positions[p0],
                self.positions[p1 + 1] - self.positions[p0 + 1],
                self.positions[p1 + 2] - self.positions[p0 + 2],
            ];
            let e1 = [
                self.positions[p2] - self.positions[p0],
                self.positions[p2 + 1] - self.positions[p0 + 1],
                self.positions[p2 + 2] - self.positions[p0 + 2],
            ];

            // Normal = cross(e0, e1)
            let normal = [
                e0[1] * e1[2] - e0[2] * e1[1],
                e0[2] * e1[0] - e0[0] * e1[2],
                e0[0] * e1[1] - e0[1] * e1[0],
            ];

            let normal_len = (normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]).sqrt();
            if normal_len < 1e-8 {
                continue;
            }

            let area = normal_len * 0.5;
            let inv_len = 1.0 / normal_len;
            let normal_normalized = [normal[0] * inv_len, normal[1] * inv_len, normal[2] * inv_len];

            // Wind force projected onto triangle normal
            let dot = wind[0] * normal_normalized[0] + wind[1] * normal_normalized[1] + wind[2] * normal_normalized[2];
            let force_per_vertex = dot * area * self.drag_coefficient / 3.0;

            // Distribute to vertices along the normal direction
            for &idx in &[i0, i1, i2] {
                if self.inv_mass[idx] == 0.0 {
                    continue;
                }
                let vi = idx * 3;
                let scale = force_per_vertex * self.inv_mass[idx] * sdt;
                self.velocities[vi] += normal_normalized[0] * scale;
                self.velocities[vi + 1] += normal_normalized[1] * scale;
                self.velocities[vi + 2] += normal_normalized[2] * scale;
            }
        }
    }

    fn post_solve(&mut self, sdt: f32) {
        let inv_sdt = 1.0 / sdt;

        // Coulomb friction coefficients. The static-regime branch zeros the
        // tangent velocity outright (effectively μ_s = ∞), so no static
        // coefficient variable is needed; only the threshold for switching
        // between static and kinetic regimes.
        let kinetic_friction = 0.4_f32; // μ_k - applies when already moving
        let static_threshold = 0.01_f32; // velocity threshold for static regime
        let ground_tolerance = 0.001_f32; // distance from ground to apply friction

        for i in 0..self.num_particles {
            if self.inv_mass[i] == 0.0 { continue; }
            let idx = i * 3;

            // Compute velocity from position change (Verlet integration)
            let vx = (self.positions[idx] - self.prev_positions[idx]) * inv_sdt;
            let vy = (self.positions[idx + 1] - self.prev_positions[idx + 1]) * inv_sdt;
            let vz = (self.positions[idx + 2] - self.prev_positions[idx + 2]) * inv_sdt;

            // Check if particle is on or near ground
            if self.positions[idx + 1] <= self.ground_y + ground_tolerance {
                // Calculate tangent (horizontal) velocity
                let tangent_speed = (vx * vx + vz * vz).sqrt();

                // Normal force = mass * gravity (pointing up against gravity)
                // For unit mass with gravity -9.81, normal force ≈ 9.81
                let gravity_mag = self.gravity_y.abs();

                if tangent_speed < static_threshold {
                    // Static friction: stop horizontal motion completely
                    self.velocities[idx] = 0.0;
                    self.velocities[idx + 2] = 0.0;
                } else {
                    // Kinetic friction: decelerate tangent velocity
                    // F_friction = μ_k * F_normal = μ_k * m * g
                    // a_friction = F_friction / m = μ_k * g
                    // Δv = a_friction * dt
                    let friction_decel = kinetic_friction * gravity_mag * sdt;
                    let new_tangent_speed = (tangent_speed - friction_decel).max(0.0);

                    if new_tangent_speed > 0.0 {
                        let scale = new_tangent_speed / tangent_speed;
                        self.velocities[idx] = vx * scale;
                        self.velocities[idx + 2] = vz * scale;
                    } else {
                        // Friction stopped the particle
                        self.velocities[idx] = 0.0;
                        self.velocities[idx + 2] = 0.0;
                    }
                }

                // Vertical velocity: prevent bouncing below ground, allow upward motion
                self.velocities[idx + 1] = if vy < 0.0 { 0.0 } else { vy };
            } else {
                // Not on ground - normal velocity update
                self.velocities[idx] = vx;
                self.velocities[idx + 1] = vy;
                self.velocities[idx + 2] = vz;
            }
        }
    }
}

// ─── CSR adjacency (self-collision) ─────────────────────────────────────────
//
// Compressed Sparse Row representation of per-particle triangle-shared
// neighbours, consumed by `solve_self_collision`. Introduced in #721 to
// replace the pair of parallel `Vec<u32>` fields (`adjacency_offsets`,
// `adjacency_neighbors`) with a typed value that *cannot* be constructed
// with a malformed shape: `CSRAdjacency::new` validates the invariants at
// construction time (offsets non-empty, monotonic non-decreasing, neighbors
// length matches the CSR sentinel) so every downstream consumer can rely on
// `neighbors_of(i)` returning a well-formed slice without re-checking.
//
// Cross-ref: `set_adjacency` (XpbdSolver public API) for the JS-side
// validation contract — invalid input surfaces as a JS exception rather
// than silently corrupting the next `solve_self_collision` call.

/// CSR (Compressed Sparse Row) representation of per-particle
/// triangle-shared neighbours.
///
/// # Invariants
///
/// - `offsets.len() >= 1` (CSR sentinel at the end requires this).
/// - `offsets` is monotonic non-decreasing.
/// - `neighbors.len() == *offsets.last().unwrap()` (sentinel matches).
///
/// All three are checked by `CSRAdjacency::new`; downstream consumers (e.g.
/// `neighbors_of`) rely on them.
#[derive(Debug)]
pub struct CSRAdjacency {
    offsets: Vec<u32>,
    neighbors: Vec<u32>,
}

impl CSRAdjacency {
    /// Construct a validated CSR. Returns `Err` with a diagnostic string if
    /// the input shape is malformed. The same error string is surfaced to
    /// JS via `XpbdSolver::set_adjacency` (wasm-bindgen `Result<(), String>`
    /// → JS exception); worker callsite catches and logs.
    pub fn new(offsets: Vec<u32>, neighbors: Vec<u32>) -> Result<Self, &'static str> {
        if offsets.is_empty() {
            return Err("CSRAdjacency: offsets must have at least one entry (CSR sentinel)");
        }
        let total = *offsets.last().expect("non-empty checked above") as usize;
        if neighbors.len() != total {
            return Err("CSRAdjacency: neighbors.len() must equal offsets[last] (CSR sentinel mismatch)");
        }
        for window in offsets.windows(2) {
            if window[0] > window[1] {
                return Err("CSRAdjacency: offsets must be monotonic non-decreasing");
            }
        }
        Ok(Self { offsets, neighbors })
    }

    /// Number of particles indexed (CSR has one offset slot per particle
    /// plus the sentinel).
    pub fn num_particles(&self) -> usize {
        self.offsets.len() - 1
    }

    /// Slice of triangle-shared neighbours for particle `i`. Empty when
    /// particle `i` has no neighbours (e.g. isolated vertex). Panics if `i`
    /// is out of range (caller should respect `num_particles()`).
    pub fn neighbors_of(&self, particle: usize) -> &[u32] {
        let start = self.offsets[particle] as usize;
        let end = self.offsets[particle + 1] as usize;
        &self.neighbors[start..end]
    }

    /// `true` when no particle has any triangle-shared neighbour. Distinct
    /// from "never populated" (which is `Option::None` on the solver field).
    pub fn is_empty(&self) -> bool {
        self.neighbors.is_empty()
    }
}

// ─── Spatial Hash Grid (self-collision) ─────────────────────────────────────
//
// Counting-sort flat hash for particle-vs-particle collision detection
// (cloth ↔ itself). Bit-exact port of CPU TS reference
// `src/utils/cloth/selfCollision.ts` (#608, #676 per A7 RFC § 3.1.1).
//
// Role separation vs `TriangleSpatialHash` (kinematic body collision in
// `triangleCollision.ts`): different domain (particle-vs-particle vs
// triangle-vs-particle), different lifecycle (rebuild-per-frame vs
// immutable-per-body), different storage (counting-sort flat vs per-bucket
// `Map<key, Int32Array>`). Orthogonal, not mergeable. See A4 § 2.4
// (`docs/reports/2026-05-02-drift-fase2-a4-cross-language-geometry-mesh.md`).

/// Find a prime ≥ n. Mirrors `nextPrime` in `selfCollision.ts`.
fn next_prime(n: usize) -> usize {
    if n <= 2 {
        return 2;
    }
    let mut candidate = if n % 2 == 0 { n + 1 } else { n };
    loop {
        let mut is_prime = true;
        let limit = (candidate as f64).sqrt() as usize;
        let mut d = 3;
        while d <= limit {
            if candidate % d == 0 {
                is_prime = false;
                break;
            }
            d += 2;
        }
        if is_prime {
            return candidate;
        }
        candidate += 2;
    }
}

/// Particle-vs-particle spatial hash grid.
///
/// Counting-sort flat `Vec<i32>` cellStart + cellEntries. O(n) rebuild,
/// O(1) amortized neighbor queries over a 3³ cell neighborhood.
///
/// Bit-exact port of CPU TS `SpatialHashGrid`. Hash multipliers preserved
/// verbatim; `i32::wrapping_mul` matches JS bitwise ToInt32 coercion
/// semantics (TS `*` then `^` truncates to signed 32-bit, wraps mod 2^32).
pub struct SpatialHashGrid {
    inv_cell_size: f32,
    table_size: usize,
    cell_start: Vec<i32>,
    cell_entries: Vec<i32>,
    cell_count: Vec<i32>,
}

impl Default for SpatialHashGrid {
    fn default() -> Self {
        Self::new()
    }
}

impl SpatialHashGrid {
    /// Construct an empty grid. `cell_size` is supplied to `build()` so the
    /// invariant "inv_cell_size matches the positions just hashed" is enforced
    /// by the call shape (was previously a separate `set_cell_size` step the
    /// caller had to remember between every rebuild). Initial sentinel uses
    /// `inv_cell_size = 1.0`; the value is overwritten on the first `build`.
    pub fn new() -> Self {
        Self {
            inv_cell_size: 1.0,
            table_size: 1,
            cell_start: Vec::new(),
            cell_entries: Vec::new(),
            cell_count: Vec::new(),
        }
    }

    /// Test-only setter: pin `table_size` to a deterministic value so the
    /// `hash_coords` bit-exact parity fixture (#720) can assert identical
    /// outputs against the TS reference without depending on `next_prime`
    /// behaviour. Production builds use `build()` to derive `table_size`
    /// from particle count.
    #[cfg(test)]
    fn set_table_size_for_test(&mut self, n: usize) {
        self.table_size = n;
    }

    /// Hash three integer cell coords. TS reference:
    /// `((xi*92837111) ^ (yi*689287499) ^ (zi*283923481)) % tableSize`,
    /// then negative-modulo correction. `wrapping_mul` matches JS implicit
    /// ToInt32 wraparound (mod 2^32, signed reinterpretation).
    ///
    /// # Bit-exactness precondition
    ///
    /// Bit-exact match with the TS reference (`selfCollision.ts:hashCoords`)
    /// holds for `|xi|, |yi|, |zi| < ~2^25`. Beyond that, individual
    /// products like `xi * 92837111` exceed `Number.MAX_SAFE_INTEGER`
    /// (`2^53`) in JS, where TS double-precision arithmetic diverges from
    /// Rust's `i32::wrapping_mul`. Realistic cell coords (positions in
    /// metres / cell size `2 * thickness ≈ 0.004 m`) yield `|coord| < 2^15`
    /// for any practical garment scene — precondition satisfied by
    /// construction. A future caller passing extreme integer coords (e.g.
    /// from a mis-scaled mesh in millimetres) could drift silently.
    fn hash_coords(&self, xi: i32, yi: i32, zi: i32) -> usize {
        debug_assert!(
            xi.abs() < (1 << 25) && yi.abs() < (1 << 25) && zi.abs() < (1 << 25),
            "hash_coords precondition violated: |coord| must be < 2^25 \
             for bit-exact JS parity. Got xi={xi}, yi={yi}, zi={zi}. \
             Likely a mesh-scale bug (positions in mm vs m?)."
        );
        let a = xi.wrapping_mul(HASH_MUL_X);
        let b = yi.wrapping_mul(HASH_MUL_Y);
        let c = zi.wrapping_mul(HASH_MUL_Z);
        let mixed = a ^ b ^ c;
        let table = self.table_size as i32;
        let h = mixed % table;
        let h = if h < 0 { h + table } else { h };
        h as usize
    }

    fn int_coord(&self, v: f32) -> i32 {
        (v * self.inv_cell_size).floor() as i32
    }

    /// Rebuild the hash from current positions. O(n).
    ///
    /// `cell_size` is consumed here (was previously a separate
    /// `set_cell_size` step) so the inverse-cell-size used to bucket
    /// positions can never drift from the value the caller intended. Use
    /// `2.0 * thickness` for `solve_self_collision`'s overlap radius.
    pub fn build(&mut self, positions: &[f32], num_particles: usize, cell_size: f32) {
        debug_assert_eq!(
            positions.len(),
            num_particles * 3,
            "positions length must equal num_particles * 3 (x, y, z per particle)"
        );
        self.inv_cell_size = 1.0 / cell_size;
        self.table_size = next_prime(num_particles * 2);

        if self.cell_count.len() < self.table_size {
            self.cell_count = vec![0; self.table_size];
            self.cell_start = vec![0; self.table_size];
        } else {
            self.cell_count[..self.table_size].fill(0);
        }

        if self.cell_entries.len() < num_particles {
            self.cell_entries = vec![0; num_particles];
        }

        // Count particles per cell
        for i in 0..num_particles {
            let h = self.hash_coords(
                self.int_coord(positions[i * 3]),
                self.int_coord(positions[i * 3 + 1]),
                self.int_coord(positions[i * 3 + 2]),
            );
            self.cell_count[h] += 1;
        }

        // Prefix sum → cell_start; reset cell_count to use as scatter cursor.
        let mut start = 0i32;
        for i in 0..self.table_size {
            self.cell_start[i] = start;
            start += self.cell_count[i];
            self.cell_count[i] = 0;
        }

        // Scatter particles into entries
        for i in 0..num_particles {
            let h = self.hash_coords(
                self.int_coord(positions[i * 3]),
                self.int_coord(positions[i * 3 + 1]),
                self.int_coord(positions[i * 3 + 2]),
            );
            let idx = (self.cell_start[h] + self.cell_count[h]) as usize;
            self.cell_entries[idx] = i as i32;
            self.cell_count[h] += 1;
        }
    }

    /// Iterate particles in the 3³ neighborhood of (x, y, z) via callback.
    /// Zero-allocation; callers may filter (j > i, adjacency, distance) inside `f`.
    pub fn query<F: FnMut(usize)>(&self, x: f32, y: f32, z: f32, mut f: F) {
        let xi0 = self.int_coord(x) - 1;
        let yi0 = self.int_coord(y) - 1;
        let zi0 = self.int_coord(z) - 1;

        for dx in 0..3 {
            for dy in 0..3 {
                for dz in 0..3 {
                    let h = self.hash_coords(xi0 + dx, yi0 + dy, zi0 + dz);
                    let s = self.cell_start[h] as usize;
                    let e = s + self.cell_count[h] as usize;
                    for k in s..e {
                        f(self.cell_entries[k] as usize);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// BUG-3 (#606) regression: solve_seams must read per-constraint compliance
    /// from `seam_compliance` rather than hardcoding alpha=0. With compliance=0
    /// the seam is rigid (legacy behavior); with compliance>0 the seam should
    /// resist the constraint correction proportionally.
    #[test]
    fn solve_seams_respects_per_constraint_compliance() {
        // Two particles 2.0 metres apart on the x-axis, both unit inverse mass.
        // Seam target = 0 (pull together). One sub-step.
        let positions = vec![0.0, 0.0, 0.0, 2.0, 0.0, 0.0];
        let inv_mass = vec![1.0, 1.0];

        let make_solver = |compliance: f32| {
            let mut s = XpbdSolver::new(&positions, &inv_mass);
            s.set_seams_with_compliance(&[0u32, 1u32], &[0.0f32], &[compliance]);
            s
        };

        let sdt = 1.0 / 60.0;

        // compliance=0 → alpha=0 → s = -dist / w_sum = -2.0 / 2.0 = -1.0.
        // Each particle moves by 1.0, ending at x=1.0. Rigid.
        let mut rigid = make_solver(0.0);
        rigid.solve_seams(sdt);
        let rigid_a = rigid.positions[0];
        let rigid_b = rigid.positions[3];
        let rigid_dist = rigid_b - rigid_a;
        assert!(rigid_dist.abs() < 1e-5, "compliance=0 should make seam rigid (dist→0); got {}", rigid_dist);

        // Large compliance → alpha large → small correction; particles barely move.
        let mut compliant = make_solver(1.0);
        compliant.solve_seams(sdt);
        let comp_a = compliant.positions[0];
        let comp_b = compliant.positions[3];
        let comp_dist = comp_b - comp_a;
        // alpha = 1.0 / sdt² = 3600. s = -2 / (2 + 3600) ≈ -0.000555.
        // Particles end at x≈0.000555 and x≈1.999444. Distance ≈ 1.9989.
        assert!(
            comp_dist > 1.99,
            "large compliance should leave seam mostly slack; got dist={}",
            comp_dist
        );
    }

    /// BUG-3 defensive check: if the compliance array is shorter than the
    /// constraint count (caller mismatch), missing entries default to 0
    /// (rigid) rather than panicking with index-out-of-bounds.
    #[test]
    fn solve_seams_tolerates_short_compliance_array() {
        let positions = vec![0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 4.0, 0.0, 0.0];
        let inv_mass = vec![1.0, 1.0, 1.0];
        let mut s = XpbdSolver::new(&positions, &inv_mass);

        // Two seams declared, only one compliance entry — second seam should
        // fall back to compliance=0 (rigid) without panicking.
        s.set_seams_with_compliance(&[0u32, 1u32, 1u32, 2u32], &[0.0f32, 0.0f32], &[1.0f32]);

        s.solve_seams(1.0 / 60.0);
        // No panic = pass; behavior verification below is just a sanity check.
        // Second seam (1↔2) had compliance=0 → should pull them together.
        let dist_12 = (s.positions[6] - s.positions[3]).abs();
        assert!(dist_12 < 1e-5, "second seam should be rigid (compliance fallback to 0)");
    }

    /// Fase 2 (BP-2): seam targets must decay per substep with a floor,
    /// mirroring CPU `solveSeamConstraints` (`seamAssembly.ts`) — shrink
    /// BEFORE the solve, snap to 0 once below `sewed_threshold`. The
    /// pre-Fase-2 solver kept the target static at its init distance, so
    /// pieces hovered apart forever instead of sewing shut.
    #[test]
    fn solve_seams_decays_target_per_substep() {
        // Rigid seam whose target equals the current distance — exactly
        // how `buildSeamConstraints` seeds restLength on the JS side.
        let positions = vec![0.0, 0.0, 0.0, 2.0, 0.0, 0.0];
        let inv_mass = vec![1.0, 1.0];
        let mut s = XpbdSolver::new(&positions, &inv_mass);
        s.set_seams_with_compliance(&[0u32, 1u32], &[2.0f32], &[0.0f32]);

        let sdt = 1.0 / 60.0 / 15.0;
        s.solve_seams(sdt);

        // One decay tick: 2.0 × 0.97. The rigid solve then moves the pair
        // exactly to the decayed target.
        assert!(
            (s.seam_target[0] - 1.94).abs() < 1e-5,
            "target should decay ×0.97 per substep; got {}",
            s.seam_target[0]
        );
        let dist = s.positions[3] - s.positions[0];
        assert!(
            (dist - 1.94).abs() < 1e-4,
            "rigid seam should track the decayed target; got dist={dist}"
        );

        // 2.0 × 0.97^n < 0.002 at n ≈ 227 → after 600 more substeps the
        // target must have clamped at the rest-length floor (A3: fabric
        // thickness spacing, default 2mm), NOT snapped to literal 0 —
        // snap-to-0 dragged armscye seam midpoints through the body.
        for _ in 0..600 {
            s.solve_seams(sdt);
        }
        assert_eq!(
            s.seam_target[0], 0.002,
            "target must clamp at the default rest-length floor (2mm), not 0"
        );
    }

    /// P1-A (B5): stretch ONE-SIDED — la compresión es libre (el pandeo lo
    /// gobierna el dihedral); la tensión sigue resistiendo. Espejo del test
    /// CPU oneSidedStretch.test.ts.
    #[test]
    fn stretch_is_one_sided_compression_free() {
        // Par a 0.5 con rest 1.0 (COMPRIMIDO): no debe expandirse.
        let positions = vec![0.0, 0.0, 0.0, 0.5, 0.0, 0.0];
        let inv_mass = vec![1.0, 1.0];
        let mut s = XpbdSolver::new(&positions, &inv_mass);
        s.set_stretch(&[0u32, 1u32], &[1.0f32]);
        let sdt = 1.0 / 60.0 / 15.0;
        for _ in 0..50 {
            s.solve_stretch(sdt);
        }
        let dist = s.positions[3] - s.positions[0];
        assert!(
            (dist - 0.5).abs() < 1e-6,
            "compressed edge must stay compressed (one-sided); got {dist}"
        );

        // Par a 1.5 con rest 1.0 (ESTIRADO): la tensión sí corrige.
        let positions = vec![0.0, 0.0, 0.0, 1.5, 0.0, 0.0];
        let mut s = XpbdSolver::new(&positions, &inv_mass);
        s.set_stretch(&[0u32, 1u32], &[1.0f32]);
        for _ in 0..50 {
            s.solve_stretch(sdt);
        }
        let dist = s.positions[3] - s.positions[0];
        assert!(
            (dist - 1.0).abs() < 1e-3,
            "stretched edge must pull back to rest; got {dist}"
        );
    }

    /// Backport A7 STEP-4: cap rígido one-sided de elongación (espejo del
    /// GPU makeDistanceConstraintFn fusionado y del CPU solveStretching).
    /// Con compliance ALTA el solve compliant apenas corrige — el cap rígido
    /// debe clavar el edge en rest·(1+max_strain) en un solo pase. A
    /// max_strain=0 el cap queda deshabilitado.
    #[test]
    fn stretch_hard_cap_at_max_strain() {
        // Par a 1.5 con rest 1.0, compliance enorme (solve compliant ~no-op).
        let positions = vec![0.0, 0.0, 0.0, 1.5, 0.0, 0.0];
        let inv_mass = vec![1.0, 1.0];
        let mut s = XpbdSolver::new(&positions, &inv_mass);
        s.set_stretch(&[0u32, 1u32], &[1.0f32]);
        s.stretch_compliances = vec![1e6];
        let sdt = 1.0 / 60.0 / 15.0;
        s.solve_stretch(sdt);
        let dist = s.positions[3] - s.positions[0];
        assert!(
            (dist - 1.02).abs() < 1e-4,
            "edge must be rigidly capped at rest*(1+0.02); got {dist}"
        );

        // max_strain = 0 → cap deshabilitado: el edge queda casi sin corregir.
        let positions = vec![0.0, 0.0, 0.0, 1.5, 0.0, 0.0];
        let mut s = XpbdSolver::new(&positions, &inv_mass);
        s.set_stretch(&[0u32, 1u32], &[1.0f32]);
        s.stretch_compliances = vec![1e6];
        s.max_strain = 0.0;
        s.solve_stretch(sdt);
        let dist = s.positions[3] - s.positions[0];
        assert!(
            dist > 1.4,
            "with max_strain=0 the cap is off and huge compliance leaves the edge stretched; got {dist}"
        );
    }

    /// Borrow-plan A3: the seam target decay clamps at `seam_rest_length_floor`
    /// (terminal seam gap = fabric-thickness spacing) instead of snapping to 0.
    /// The setter is backward-compatible: default 0.002 when never called,
    /// non-finite input ignored, negative clamps to 0 (and the sewed
    /// threshold lower-bounds the effective floor, preserving the legacy
    /// near-zero snap for floor=0).
    #[test]
    fn seam_target_decay_clamps_at_rest_length_floor() {
        let positions = vec![0.0, 0.0, 0.0, 2.0, 0.0, 0.0];
        let inv_mass = vec![1.0, 1.0];
        let mut s = XpbdSolver::new(&positions, &inv_mass);
        assert_eq!(
            s.seam_rest_length_floor, 0.002,
            "constructor default must be 0.002 (backward-compatible when the setter is never called)"
        );

        // Custom (thick-fabric) floor: decay must clamp exactly there.
        s.set_seams_with_compliance(&[0u32, 1u32], &[2.0f32], &[0.0f32]);
        s.set_seam_rest_length_floor(0.1);
        let sdt = 1.0 / 60.0 / 15.0;
        for _ in 0..600 {
            s.solve_seams(sdt);
        }
        assert_eq!(
            s.seam_target[0], 0.1,
            "decay must clamp at the configured floor"
        );
        let dist = s.positions[3] - s.positions[0];
        assert!(
            (dist - 0.1).abs() < 1e-4,
            "rigid seam must hold the floored target as its gap; got {dist}"
        );

        // Defensive: NaN ignored, negative clamps to 0 (effective floor then
        // falls back to the sewed threshold — legacy near-zero behavior).
        s.set_seam_rest_length_floor(f32::NAN);
        assert_eq!(s.seam_rest_length_floor, 0.1, "NaN floor must keep the current value");
        s.set_seam_rest_length_floor(-1.0);
        assert_eq!(s.seam_rest_length_floor, 0.0, "negative floor must clamp to 0");
    }

    /// Fase 2 done-criterion: with the standard-seam compliance from
    /// `DEFAULT_SEAM_CONFIG` (1e-4) and constructor-default substeps (15),
    /// a seam starting 10 cm apart must close below 1 mm within 2 s of
    /// sim-time (120 frames @ 60 fps).
    #[test]
    fn seam_closes_within_two_seconds_sim_time() {
        // y=1.0 keeps the pair clear of the ground plane (ground_y = 0);
        // gravity is zeroed via `configure` to isolate seam closure from
        // free-fall (all other values are the constructor defaults).
        let positions = vec![0.0, 1.0, 0.0, 0.1, 1.0, 0.0];
        let inv_mass = vec![1.0, 1.0];
        let mut s = XpbdSolver::new(&positions, &inv_mass);
        s.configure(
            15, 0.99, 0.0, // substeps, damping, gravity_y (off)
            0.0, 1.0, // stretch/bend compliance
            false, 0.002, 0.005, // self-collision, thickness, margin
            0.0, 1.0, // ground_y, drag
            0.0, 0.0, 0.001, // stretch warp/weft/shear
            1.0, 1.0, // bend warp/weft
            0.3, // internal damping
        );
        s.set_seams_with_compliance(&[0u32, 1u32], &[0.1f32], &[0.0001f32]);

        for _ in 0..120 {
            s.step(1.0 / 60.0);
        }

        let dx = s.positions[3] - s.positions[0];
        let dy = s.positions[4] - s.positions[1];
        let dz = s.positions[5] - s.positions[2];
        let dist = (dx * dx + dy * dy + dz * dz).sqrt();
        // A3: "closed" now means AT the rest-length floor (2mm fabric
        // spacing), not below 1mm — the pre-A3 done-criterion of <1mm only
        // held because the target snapped to literal 0.
        assert!(
            dist < 0.003,
            "seam should close to the 2mm floor (+compliance slack) within 2 s of sim-time; got {dist}"
        );
        assert_eq!(
            s.seam_target[0], 0.002,
            "target should have decayed to the rest-length floor (2mm)"
        );
    }

    /// Defensive (A3): non-finite or out-of-range shrink params must not
    /// poison the decay schedule — NaN/Inf are ignored, a factor > 1
    /// (which would GROW the gap every substep) clamps to 1, and negative
    /// thresholds clamp to 0.
    #[test]
    fn set_seam_shrink_params_is_defensive() {
        let positions = vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        let inv_mass = vec![1.0, 1.0];
        let mut s = XpbdSolver::new(&positions, &inv_mass);

        s.set_seam_shrink_params(f32::NAN, f32::INFINITY);
        assert_eq!(s.seam_shrink_factor, 0.97, "NaN factor must keep the default");
        assert_eq!(s.seam_sewed_threshold, 1e-6, "Inf threshold must keep the default");

        s.set_seam_shrink_params(1.5, -3.0);
        assert_eq!(s.seam_shrink_factor, 1.0, "factor > 1 must clamp to 1");
        assert_eq!(s.seam_sewed_threshold, 0.0, "negative threshold must clamp to 0");

        s.set_seam_shrink_params(0.9, 1e-5);
        assert_eq!(s.seam_shrink_factor, 0.9);
        assert_eq!(s.seam_sewed_threshold, 1e-5);
    }

    /// SpatialHashGrid port (#608, #676 per A7 § 3.1.1) smoke test.
    /// Mirrors the TS suite (`__tests__/selfCollision.test.ts`): particles in
    /// the same cell, and particles in 3³-adjacent cells, both surface in the
    /// query. (Hash collisions can return false positives at small table sizes;
    /// the distance filter in `solve_self_collision` handles those — same
    /// contract as the TS reference, which only asserts `.toContain`.)
    #[test]
    fn spatial_hash_query_finds_same_cell_neighbors() {
        let mut grid = SpatialHashGrid::new();
        let positions = [0.1, 0.1, 0.1, 0.2, 0.2, 0.2];
        grid.build(&positions, 2, 1.0);

        let mut neighbors: Vec<usize> = Vec::new();
        grid.query(0.1, 0.1, 0.1, |i| neighbors.push(i));

        assert!(neighbors.contains(&0));
        assert!(neighbors.contains(&1));
    }

    #[test]
    fn spatial_hash_query_finds_adjacent_cell_neighbors() {
        let mut grid = SpatialHashGrid::new();
        // Particles in adjacent cells (within the 3³ neighborhood).
        let positions = [0.5, 0.5, 0.5, 1.5, 0.5, 0.5];
        grid.build(&positions, 2, 1.0);

        let mut neighbors: Vec<usize> = Vec::new();
        grid.query(0.5, 0.5, 0.5, |i| neighbors.push(i));

        assert!(neighbors.contains(&0));
        assert!(neighbors.contains(&1));
    }

    /// #755: `hash_coords` documents a bit-exact precondition (`|coord| < 2^25`)
    /// for parity with the TS reference. A `debug_assert!` enforces it in debug
    /// builds so a mis-scaled mesh (e.g. positions in mm vs m) surfaces loudly
    /// instead of silently diverging from CPU output.
    #[test]
    #[should_panic(expected = "hash_coords precondition violated")]
    fn hash_coords_asserts_coord_magnitude() {
        let grid = SpatialHashGrid::new();
        grid.hash_coords(1 << 26, 0, 0);
    }

    /// Helper: configure a solver with self-collision enabled and the
    /// argument shape that mirrors the TS test fixtures.
    fn configure_self_collision(solver: &mut XpbdSolver, thickness: f32) {
        solver.configure(
            1, 0.99, 0.0,        // substeps, damping, gravity_y
            0.0, 0.0,            // stretch_compliance, bend_compliance
            true, thickness, 0.005, // self_collision, thickness, collision_margin
            0.0, 0.0,            // ground_y, drag_coefficient
            0.0, 0.0, 0.0,       // anisotropic stretch
            0.0, 0.0,            // anisotropic bend
            0.0,                 // internal_damping
        );
    }

    /// Mirrors TS `__tests__/selfCollision.test.ts` "pushes overlapping
    /// non-connected particles apart". Two close non-adjacent particles
    /// should be pushed to ≥thickness apart in one solver pass.
    #[test]
    fn solve_self_collision_pushes_overlapping_apart() {
        let positions = vec![0.0, 0.0, 0.0, 0.05, 0.0, 0.0]; // dist = 0.05
        let inv_mass = vec![1.0, 1.0];
        let mut solver = XpbdSolver::new(&positions, &inv_mass);
        configure_self_collision(&mut solver, 0.1);
        // Empty CSR (numParticles+1 zero offsets) → no adjacency skip.
        solver.set_adjacency(&[0, 0, 0], &[]).expect("valid CSR");

        solver.solve_self_collision();

        let dx = solver.positions[0] - solver.positions[3];
        let dy = solver.positions[1] - solver.positions[4];
        let dz = solver.positions[2] - solver.positions[5];
        let dist = (dx * dx + dy * dy + dz * dz).sqrt();
        assert!(
            (dist - 0.1).abs() < 1e-5,
            "expected dist ≈ thickness 0.1, got {}",
            dist
        );
    }

    /// Mirrors TS "does NOT push connected particles apart". Particles
    /// sharing a triangle (adjacency CSR includes them) must be skipped.
    #[test]
    fn solve_self_collision_respects_adjacency() {
        let positions = vec![0.0, 0.0, 0.0, 0.05, 0.0, 0.0, 0.0, 0.5, 0.0];
        let inv_mass = vec![1.0, 1.0, 1.0];
        let mut solver = XpbdSolver::new(&positions, &inv_mass);
        configure_self_collision(&mut solver, 0.1);
        // Adjacency from triangle (0,1,2): every particle shares with the
        // other two. CSR offsets length = numParticles + 1.
        let offsets: Vec<u32> = vec![0, 2, 4, 6];
        let neighbors: Vec<u32> = vec![1, 2, 0, 2, 0, 1];
        solver.set_adjacency(&offsets, &neighbors).expect("valid CSR");

        let pos_before = solver.positions.clone();
        solver.solve_self_collision();

        // Particles 0 and 1 are adjacent → no push despite dist=0.05<thickness.
        assert_eq!(solver.positions[0], pos_before[0]);
        assert_eq!(solver.positions[3], pos_before[3]);
    }

    /// Pinned particle (`inv_mass==0`) is skipped by the outer loop and
    /// therefore never moved. Verified against a 3-particle setup so the
    /// collision pair (0, 2) is independently processable — proves both
    /// the outer-loop pin skip *and* that adjacent free particles still
    /// resolve correctly with a pinned bystander present.
    #[test]
    fn solve_self_collision_skips_pinned_in_outer_loop() {
        let positions = vec![
            0.0, 0.0, 0.0,    // p0 free
            10.0, 0.0, 0.0,   // p1 pinned, far from action
            0.05, 0.0, 0.0,   // p2 free, close to p0
        ];
        let inv_mass = vec![1.0, 0.0, 1.0];
        let mut solver = XpbdSolver::new(&positions, &inv_mass);
        configure_self_collision(&mut solver, 0.1);
        solver.set_adjacency(&[0, 0, 0, 0], &[]).expect("valid CSR");

        solver.solve_self_collision();

        // Pinned particle untouched.
        assert_eq!(solver.positions[3], 10.0);
        assert_eq!(solver.positions[4], 0.0);
        assert_eq!(solver.positions[5], 0.0);

        // Pair (0, 2): both free, dist 0.05 < thickness 0.1 → push to thickness.
        let dx = solver.positions[6] - solver.positions[0];
        let dist_02 = dx.abs();
        assert!(
            (dist_02 - 0.1).abs() < 1e-5,
            "expected dist(p0, p2) ≈ thickness 0.1, got {}",
            dist_02
        );
    }

    /// NaN guard regression (reviewer pre-merge HIGH #2). Upstream constraint
    /// solvers can leave a NaN position in the buffer; without the
    /// `is_finite` check inside `solve_self_collision` the corruption would
    /// cascade across every pair the NaN particle is hashed near.
    #[test]
    fn solve_self_collision_handles_nan_position() {
        let positions = vec![
            f32::NAN, 0.0, 0.0,   // p0 corrupted
            0.05, 0.0, 0.0,       // p1 healthy partner inside thickness
        ];
        let inv_mass = vec![1.0, 1.0];
        let mut solver = XpbdSolver::new(&positions, &inv_mass);
        configure_self_collision(&mut solver, 0.1);
        // Empty CSR slice (2 particles → offsets length 3) — adjacency check
        // is a no-op range, every candidate falls through to the distance
        // filter where the NaN guard must catch the corruption.
        solver.set_adjacency(&[0, 0, 0], &[]).expect("valid CSR");

        // Must not panic.
        solver.solve_self_collision();

        // Healthy partner stays put — NaN must NOT propagate via correction.
        assert_eq!(solver.positions[3], 0.05);
        assert_eq!(solver.positions[4], 0.0);
        assert_eq!(solver.positions[5], 0.0);
    }

    /// Empty-CSR fallback regression (reviewer pre-merge CRITICAL #3). Worker
    /// happy-path always populates adjacency before enabling self-collision,
    /// but a future re-init reordering / hot-swap / test harness bug could
    /// leave the CSR empty. Without the guard, every triangle-shared
    /// neighbor would be treated as non-adjacent and pushed apart, tearing
    /// the mesh along every shared edge. Fail-loud-by-no-op. #721: the
    /// guard is now `self.adjacency.is_none()` (was `.is_empty()` on the
    /// legacy parallel `Vec<u32>` fields).
    #[test]
    fn solve_self_collision_no_op_on_empty_csr() {
        let positions = vec![0.0, 0.0, 0.0, 0.05, 0.0, 0.0];
        let inv_mass = vec![1.0, 1.0];
        let mut solver = XpbdSolver::new(&positions, &inv_mass);
        configure_self_collision(&mut solver, 0.1);
        // Deliberately do NOT call `set_adjacency` — `self.adjacency`
        // stays `None`.

        let pos_before = solver.positions.clone();
        solver.solve_self_collision();

        assert_eq!(solver.positions, pos_before);
    }

    /// #747 regression: after `set_stretch_with_types` populates the
    /// per-edge compliance cache from the global anisotropic fields,
    /// a subsequent `configure()` call MUST regenerate that cache from
    /// the new global values. Without the regen path, JS-side
    /// `setConfig({ stretchComplianceWarp: ... })` is silently dropped
    /// and `solve_stretch` keeps using the cached init values.
    #[test]
    fn configure_regenerates_anisotropic_stretch_compliance_cache() {
        let positions = vec![0.0; 9];
        let inv_mass = vec![1.0; 3];
        let mut s = XpbdSolver::new(&positions, &inv_mass);

        // Init: two warp-edge stretch constraints with default warp = 0.
        s.set_stretch_with_types(&[0u32, 1, 1, 2], &[1.0, 1.0], &[0u8, 0]);
        // Sanity: cache populated from defaults.
        assert!(s.stretch_compliances.iter().all(|&c| c == 0.0));

        // Change warp compliance via configure — cache MUST regenerate.
        s.configure(
            1, 0.99, 0.0,
            0.0, 1.0, false, 0.002, 0.005, 0.0, 1.0,
            /* warp = */ 0.05, 0.0, 0.001,
            1.0, 1.0, 0.3,
        );

        assert!(
            s.stretch_compliances.iter().all(|&c| (c - 0.05).abs() < 1e-9),
            "configure() must regenerate stretch_compliances cache from new warp value"
        );
    }

    /// #747 regression for the bend twin. Same shape as the stretch
    /// case: SHEAR maps to WEFT (per `set_bend_with_types` semantics),
    /// so two warp-edge bend constraints fed `warp = 1.0` initially
    /// must reflect a `configure()`-mutated `warp = 0.25`.
    #[test]
    fn configure_regenerates_bend_compliance_cache() {
        // Need 4 particles for a single 4-tuple bend constraint
        // ([a, b, c, d]); test exercises two such constraints to prove
        // cache regen is per-entry, not just length-aware.
        let positions = vec![0.0; 12];
        let inv_mass = vec![1.0; 4];
        let mut s = XpbdSolver::new(&positions, &inv_mass);

        // Two warp-edge bend constraints, default warp = 1e4 (P1 angular).
        s.set_bend_with_types(
            &[0u32, 1, 2, 3, 0, 1, 2, 3],
            &[1.0, 1.0],
            &[0u8, 0],
        );
        assert!(
            s.bend_compliances.iter().all(|&c| (c - 1e4).abs() < 1e-2),
            "init: bend cache should reflect default warp=1e4 (P1 angular)"
        );

        // Mutate warp via configure — cache MUST regenerate.
        s.configure(
            1, 0.99, 0.0,
            0.0, 1.0, false, 0.002, 0.005, 0.0, 1.0,
            0.0, 0.0, 0.001,
            /* bend warp = */ 0.25, 1.0,
            0.3,
        );

        assert!(
            s.bend_compliances.iter().all(|&c| (c - 0.25).abs() < 1e-9),
            "configure() must regenerate bend_compliances cache from new warp value"
        );
    }

    // ─── CSRAdjacency validation (#721) ─────────────────────────────────

    /// CSR with the canonical 3-particle triangle (every particle shares
    /// with the other two) constructs cleanly and `neighbors_of` returns
    /// the right per-particle slices.
    #[test]
    fn csr_adjacency_accepts_valid_triangle() {
        let adj = CSRAdjacency::new(vec![0, 2, 4, 6], vec![1, 2, 0, 2, 0, 1])
            .expect("triangle CSR is well-formed");
        assert_eq!(adj.num_particles(), 3);
        assert_eq!(adj.neighbors_of(0), &[1, 2]);
        assert_eq!(adj.neighbors_of(1), &[0, 2]);
        assert_eq!(adj.neighbors_of(2), &[0, 1]);
        assert!(!adj.is_empty());
    }

    /// CSR with only the sentinel offset (no neighbours for any particle)
    /// is the canonical "0-particle / no-adjacency" shape and must
    /// construct. `is_empty` returns `true`.
    #[test]
    fn csr_adjacency_accepts_sentinel_only() {
        let adj = CSRAdjacency::new(vec![0], vec![])
            .expect("sentinel-only CSR is well-formed");
        assert_eq!(adj.num_particles(), 0);
        assert!(adj.is_empty());
    }

    /// Per-particle empty slices are allowed (isolated vertex case).
    #[test]
    fn csr_adjacency_allows_isolated_particles() {
        // 3 particles, particle 1 has no neighbours.
        let adj = CSRAdjacency::new(vec![0, 1, 1, 2], vec![2, 0])
            .expect("CSR with one isolated particle is well-formed");
        assert_eq!(adj.neighbors_of(0), &[2]);
        assert_eq!(adj.neighbors_of(1), &[] as &[u32]);
        assert_eq!(adj.neighbors_of(2), &[0]);
    }

    /// Empty offsets is rejected (no sentinel entry).
    #[test]
    fn csr_adjacency_rejects_empty_offsets() {
        let err = CSRAdjacency::new(vec![], vec![]).expect_err("empty offsets must be rejected");
        assert!(err.contains("at least one entry"), "got: {err}");
    }

    /// Neighbour length mismatch with the CSR sentinel is rejected.
    #[test]
    fn csr_adjacency_rejects_sentinel_mismatch() {
        let err = CSRAdjacency::new(vec![0, 2], vec![1, 2, 3])
            .expect_err("sentinel mismatch must be rejected");
        assert!(err.contains("sentinel mismatch"), "got: {err}");
    }

    /// Non-monotonic offsets are rejected.
    #[test]
    fn csr_adjacency_rejects_non_monotonic_offsets() {
        let err = CSRAdjacency::new(vec![0, 2, 1, 6], vec![0, 0, 0, 0, 0, 0])
            .expect_err("non-monotonic offsets must be rejected");
        assert!(err.contains("monotonic"), "got: {err}");
    }

    /// Solver's `set_adjacency` forwards validation errors as a `Result`
    /// (surfaces as a JS exception via wasm-bindgen at the boundary).
    #[test]
    fn set_adjacency_propagates_csr_validation_error() {
        let mut solver = XpbdSolver::new(&[0.0; 6], &[1.0, 1.0]);
        let err = solver
            .set_adjacency(&[0, 2], &[1, 2, 3])
            .expect_err("bad CSR must surface as Err");
        assert!(err.contains("sentinel mismatch"), "got: {err}");
        // Solver-side adjacency remains None on failure → solve_self_collision no-ops.
        assert!(solver.adjacency.is_none());
    }

    /// Bit-exact parity fixture (#720). `hash_coords` is the single arithmetic
    /// surface that has to match the TS reference (`selfCollision.ts` —
    /// `hashCoords`) byte-for-byte across language boundaries — otherwise
    /// WASM and CPU tiers route particles to different cells and silently
    /// diverge in self-collision detection.
    ///
    /// The TS half of this fixture lives in
    /// `src/utils/cloth/__tests__/selfCollision.test.ts` (`hashCoords
    /// bit-exact reference`). The 8 cases below MUST match value-for-value;
    /// any change in one half requires updating the other.
    ///
    /// Cases pinned: identity, unit basis (x/y/z), all-negative-1, typical
    /// realistic cell, wrap-zone exercise (1_000_000 → wrapping_mul kicks
    /// in but stays under the `|coord| < 2^25` JS parity bound), and a
    /// large-negative-coords case.
    #[test]
    fn hash_coords_bit_exact_with_ts_reference() {
        let mut grid = SpatialHashGrid::new();
        grid.set_table_size_for_test(10007);
        // (xi, yi, zi, expected_hash). Keep in sync with the TS fixture in
        // `src/utils/cloth/__tests__/selfCollision.test.ts`.
        let cases: [(i32, i32, i32, usize); 8] = [
            (0, 0, 0, 0),
            (1, 0, 0, 2172),
            (0, 1, 0, 5339),
            (0, 0, 1, 4877),
            (-1, -1, -1, 1731),
            (100, 200, 300, 2436),
            (1_000_000, 0, 0, 2616),
            (-1000, -2000, -3000, 8204),
        ];
        for (xi, yi, zi, expected) in cases {
            let actual = grid.hash_coords(xi, yi, zi);
            assert_eq!(
                actual, expected,
                "hash_coords({xi}, {yi}, {zi}) bit-exact parity broke: \
                 got {actual}, expected {expected}. \
                 If you changed HASH_MUL_X/Y/Z or the hashing formula, you \
                 must update the TS fixture in selfCollision.test.ts AND \
                 this Rust fixture in lockstep — they pin WASM↔CPU parity."
            );
        }
    }
}
