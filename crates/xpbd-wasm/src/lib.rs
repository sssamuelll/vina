//! XPBD Cloth Simulation — WebAssembly solver
//!
//! Implements Extended Position Based Dynamics for cloth simulation.
//! Designed to be called from JavaScript via wasm-bindgen.
//! Positions are stored in a flat f32 array accessible via shared memory.
//!
//! Based on Matthias Müller's "Ten Minute Physics" XPBD approach.

use wasm_bindgen::prelude::*;

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
    seam_target: Vec<f32>,      // target distance (usually 0)
    seam_compliance: Vec<f32>,  // XPBD compliance per seam (0 = rigid; larger = stretchy)

    // Self-collision
    self_collision: bool,
    thickness: f32,
    adjacency_offsets: Vec<u32>,
    adjacency_neighbors: Vec<u32>,

    // Pinned vertices
    pin_indices: Vec<u32>,
    pin_positions: Vec<f32>,      // [x,y,z, x,y,z, ...] target positions
    original_inv_mass: Vec<f32>,  // Store original masses for unpinning

    // Config
    gravity: [f32; 3],
    damping: f32,
    substeps: u32,
    stretch_compliance: f32,
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

    // Anisotropic bend compliance
    bend_compliance_warp: f32,
    bend_compliance_weft: f32,
    bend_compliances: Vec<f32>,  // Per-constraint compliance

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
            self_collision: false,
            thickness: 0.002,
            adjacency_offsets: Vec::new(),
            adjacency_neighbors: Vec::new(),
            pin_indices: Vec::new(),
            pin_positions: Vec::new(),
            original_inv_mass,
            gravity: [0.0, -9.81, 0.0],
            damping: 0.99,
            substeps: 15,
            stretch_compliance: 0.0,
            bend_compliance: 1.0,
            ground_y: 0.0,
            collision_margin: 0.005,
            drag_coefficient: 1.0,
            tri_ids: Vec::new(),
            stretch_compliance_warp: 0.0,
            stretch_compliance_weft: 0.0,
            stretch_compliance_shear: 0.001,
            stretch_compliances: Vec::new(),
            bend_compliance_warp: 1.0,
            bend_compliance_weft: 1.0,
            bend_compliances: Vec::new(),
            internal_damping: 0.3,
            wind: [0.0, 0.0, 0.0],
            // Initial cell size irrelevant — `solve_self_collision` calls
            // `set_cell_size(2.0 * thickness)` before each rebuild.
            spatial_hash: SpatialHashGrid::new(1.0),
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
    pub fn set_stretch_with_types(&mut self, ids: &[u32], rest_lengths: &[f32], edge_types: &[u8]) {
        self.stretch_ids = ids.to_vec();
        self.stretch_rest = rest_lengths.to_vec();

        // Compute per-constraint compliance based on edge types
        self.stretch_compliances = edge_types.iter().map(|&et| {
            match et {
                0 => self.stretch_compliance_warp,   // WARP
                1 => self.stretch_compliance_weft,   // WEFT
                _ => self.stretch_compliance_shear,  // SHEAR or default
            }
        }).collect();
    }

    /// Set bend constraints.
    pub fn set_bend(&mut self, ids: &[u32], rest_angles: &[f32]) {
        self.bend_ids = ids.to_vec();
        self.bend_rest = rest_angles.to_vec();
    }

    /// Set bend constraints with edge type classification.
    /// edge_types: 0 = WARP, 1 = WEFT, 2 = SHEAR (SHEAR defaults to WEFT for bending)
    pub fn set_bend_with_types(&mut self, ids: &[u32], rest_angles: &[f32], edge_types: &[u8]) {
        self.bend_ids = ids.to_vec();
        self.bend_rest = rest_angles.to_vec();

        // Compute per-constraint compliance based on edge types
        self.bend_compliances = edge_types.iter().map(|&et| {
            match et {
                0 => self.bend_compliance_warp,   // WARP
                _ => self.bend_compliance_weft,   // WEFT or SHEAR (default to weft)
            }
        }).collect();
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
    /// # Empty CSR
    ///
    /// Calling with empty `offsets` is treated as a no-op by
    /// `solve_self_collision` (defensive fallback — preferable to running
    /// with broken physics). New callers should populate the CSR before
    /// enabling self-collision.
    pub fn set_adjacency(&mut self, offsets: &[u32], neighbors: &[u32]) {
        self.adjacency_offsets = offsets.to_vec();
        self.adjacency_neighbors = neighbors.to_vec();
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
        self.gravity[1] = gravity_y;
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
            self.velocities[idx] += self.gravity[0] * sdt;
            self.velocities[idx + 1] += self.gravity[1] * sdt;
            self.velocities[idx + 2] += self.gravity[2] * sdt;

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

    fn solve_bend(&mut self, sdt: f32) {
        // Bend constraints use 4 particles [a, b, c, d] where a-b is the shared edge
        // and c, d are the opposite vertices. We use distance-based bending (rest distance between c and d).
        let num_constraints = self.bend_ids.len() / 4;

        for c in 0..num_constraints {
            // Use per-constraint compliance if available, else global
            let compliance = if c < self.bend_compliances.len() {
                self.bend_compliances[c]
            } else {
                self.bend_compliance
            };
            let alpha = compliance / (sdt * sdt);

            // Get the opposite vertices (indices 2 and 3) for distance-based bending
            // Layout: [a, b, c, d] where a-b is shared edge, c and d are opposite vertices
            let p0 = self.bend_ids[c * 4 + 2] as usize;  // opposite vertex c
            let p1 = self.bend_ids[c * 4 + 3] as usize;  // opposite vertex d

            // Inverse masses
            let w0 = self.inv_mass[p0];
            let w1 = self.inv_mass[p1];
            let w_sum = w0 + w1;
            if w_sum == 0.0 { continue; }

            // Position indices
            let i0 = p0 * 3;
            let i1 = p1 * 3;

            // Vector from p0 to p1
            let dx = self.positions[i1] - self.positions[i0];
            let dy = self.positions[i1 + 1] - self.positions[i0 + 1];
            let dz = self.positions[i1 + 2] - self.positions[i0 + 2];
            let dist = (dx * dx + dy * dy + dz * dz).sqrt();
            if dist < 1e-12 { continue; }

            // Rest distance stored in bend_rest
            let rest = self.bend_rest[c];
            let c_val = dist - rest;
            let s = -c_val / (w_sum + alpha);

            // Normalized direction
            let nx = dx / dist;
            let ny = dy / dist;
            let nz = dz / dist;

            // Apply position corrections
            self.positions[i0] -= nx * s * w0;
            self.positions[i0 + 1] -= ny * s * w0;
            self.positions[i0 + 2] -= nz * s * w0;
            self.positions[i1] += nx * s * w1;
            self.positions[i1 + 1] += ny * s * w1;
            self.positions[i1 + 2] += nz * s * w1;
        }
    }

    fn solve_seams(&mut self, sdt: f32) {
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
        // shared edge.
        if self.adjacency_offsets.is_empty() {
            return;
        }
        debug_assert_eq!(
            self.adjacency_offsets.len(),
            self.num_particles + 1,
            "CSR offsets must have num_particles + 1 entries (sentinel at end)"
        );

        let cell_size = 2.0 * self.thickness;
        self.spatial_hash.set_cell_size(cell_size);
        self.spatial_hash.build(&self.positions, self.num_particles);

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

            // Adjacency CSR slice for particle i. Empty range if
            // `set_adjacency` was never called (offsets stays empty)
            // or if particle i has no triangle-shared neighbors.
            let adj_start = self
                .adjacency_offsets
                .get(i)
                .copied()
                .unwrap_or(0) as usize;
            let adj_end = self
                .adjacency_offsets
                .get(i + 1)
                .copied()
                .unwrap_or(adj_start as u32) as usize;

            // Gather candidates via spatial hash. Disjoint-field borrow:
            // `&mut self.collision_scratch` and `&self.spatial_hash` are
            // independent fields — borrow checker accepts.
            self.collision_scratch.clear();
            {
                let scratch = &mut self.collision_scratch;
                self.spatial_hash.query(px, py, pz, |j| scratch.push(j));
            }

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
                for slot in adj_start..adj_end {
                    if self.adjacency_neighbors[slot] as usize == j {
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

            let (v0, v1, v2) = (i0 * 3, i1 * 3, i2 * 3);
            let (p0, p1, p2) = (i0 * 3, i1 * 3, i2 * 3);

            // Triangle velocity (average)
            let tri_vel = [
                (self.velocities[v0] + self.velocities[v1] + self.velocities[v2]) / 3.0,
                (self.velocities[v0 + 1] + self.velocities[v1 + 1] + self.velocities[v2 + 1]) / 3.0,
                (self.velocities[v0 + 2] + self.velocities[v1 + 2] + self.velocities[v2 + 2]) / 3.0,
            ];

            let speed = (tri_vel[0] * tri_vel[0] + tri_vel[1] * tri_vel[1] + tri_vel[2] * tri_vel[2]).sqrt();
            if speed < 0.001 {
                continue;
            }

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
                let gravity_mag = self.gravity[1].abs();

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

impl SpatialHashGrid {
    pub fn new(cell_size: f32) -> Self {
        Self {
            inv_cell_size: 1.0 / cell_size,
            table_size: 1,
            cell_start: Vec::new(),
            cell_entries: Vec::new(),
            cell_count: Vec::new(),
        }
    }

    /// Update the cell size in place. Cheap — just refreshes the inverse.
    /// Caller must `build` again before the next query (positions index changes).
    pub fn set_cell_size(&mut self, cell_size: f32) {
        self.inv_cell_size = 1.0 / cell_size;
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
        let a = xi.wrapping_mul(92_837_111);
        let b = yi.wrapping_mul(689_287_499);
        let c = zi.wrapping_mul(283_923_481);
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
    pub fn build(&mut self, positions: &[f32], num_particles: usize) {
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

    /// SpatialHashGrid port (#608, #676 per A7 § 3.1.1) smoke test.
    /// Mirrors the TS suite (`__tests__/selfCollision.test.ts`): particles in
    /// the same cell, and particles in 3³-adjacent cells, both surface in the
    /// query. (Hash collisions can return false positives at small table sizes;
    /// the distance filter in `solve_self_collision` handles those — same
    /// contract as the TS reference, which only asserts `.toContain`.)
    #[test]
    fn spatial_hash_query_finds_same_cell_neighbors() {
        let mut grid = SpatialHashGrid::new(1.0);
        let positions = [0.1, 0.1, 0.1, 0.2, 0.2, 0.2];
        grid.build(&positions, 2);

        let mut neighbors: Vec<usize> = Vec::new();
        grid.query(0.1, 0.1, 0.1, |i| neighbors.push(i));

        assert!(neighbors.contains(&0));
        assert!(neighbors.contains(&1));
    }

    #[test]
    fn spatial_hash_query_finds_adjacent_cell_neighbors() {
        let mut grid = SpatialHashGrid::new(1.0);
        // Particles in adjacent cells (within the 3³ neighborhood).
        let positions = [0.5, 0.5, 0.5, 1.5, 0.5, 0.5];
        grid.build(&positions, 2);

        let mut neighbors: Vec<usize> = Vec::new();
        grid.query(0.5, 0.5, 0.5, |i| neighbors.push(i));

        assert!(neighbors.contains(&0));
        assert!(neighbors.contains(&1));
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
        solver.set_adjacency(&[0, 0, 0], &[]);

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
        solver.set_adjacency(&offsets, &neighbors);

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
        solver.set_adjacency(&[0, 0, 0, 0], &[]);

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
        solver.set_adjacency(&[0, 0, 0], &[]);

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
    /// the mesh along every shared edge. Fail-loud-by-no-op.
    #[test]
    fn solve_self_collision_no_op_on_empty_csr() {
        let positions = vec![0.0, 0.0, 0.0, 0.05, 0.0, 0.0];
        let inv_mass = vec![1.0, 1.0];
        let mut solver = XpbdSolver::new(&positions, &inv_mass);
        configure_self_collision(&mut solver, 0.1);
        // Deliberately do NOT call `set_adjacency` — `adjacency_offsets`
        // stays empty.

        let pos_before = solver.positions.clone();
        solver.solve_self_collision();

        assert_eq!(solver.positions, pos_before);
    }
}
