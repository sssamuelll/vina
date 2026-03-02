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

    // SDF collision
    sdf_data: Vec<f32>,
    sdf_resolution: u32,
    sdf_min: [f32; 3],
    sdf_cell_size: f32,
    has_sdf: bool,

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
}

#[wasm_bindgen]
impl XpbdSolver {
    /// Create a new solver with particle positions and inverse masses.
    #[wasm_bindgen(constructor)]
    pub fn new(positions: &[f32], inv_mass: &[f32]) -> XpbdSolver {
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
            sdf_data: Vec::new(),
            sdf_resolution: 0,
            sdf_min: [0.0; 3],
            sdf_cell_size: 0.0,
            has_sdf: false,
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
            bend_compliance: 0.01,
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

    /// Set seam constraints.
    pub fn set_seams(&mut self, ids: &[u32], target_dist: &[f32]) {
        self.seam_ids = ids.to_vec();
        self.seam_target = target_dist.to_vec();
    }

    /// Set triangle indices for air drag calculation.
    pub fn set_triangles(&mut self, tri_ids: &[u32]) {
        self.tri_ids = tri_ids.to_vec();
    }

    /// Upload SDF volume for body collision.
    pub fn set_sdf(&mut self, data: &[f32], resolution: u32, min_x: f32, min_y: f32, min_z: f32, cell_size: f32) {
        self.sdf_data = data.to_vec();
        self.sdf_resolution = resolution;
        self.sdf_min = [min_x, min_y, min_z];
        self.sdf_cell_size = cell_size;
        self.has_sdf = true;
    }

    /// Set adjacency for self-collision.
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

    /// Configure solver parameters.
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

    /// Step the simulation forward one frame.
    pub fn step(&mut self, dt: f32) {
        let sdt = dt / self.substeps as f32;

        for _ in 0..self.substeps {
            self.enforce_pins();
            self.pre_solve(sdt);
            self.solve_stretch(sdt);
            self.solve_bend(sdt);
            self.solve_seams(sdt);
            if self.has_sdf {
                self.solve_sdf_collision();
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

    /// Get number of particles.
    pub fn num_particles(&self) -> usize {
        self.num_particles
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
        let alpha = 0.0 / (sdt * sdt); // zero compliance = rigid seams

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

    fn solve_sdf_collision(&mut self) {
        let res = self.sdf_resolution as usize;
        if res == 0 || self.sdf_data.is_empty() { return; }

        for i in 0..self.num_particles {
            if self.inv_mass[i] == 0.0 { continue; }
            let idx = i * 3;
            let px = self.positions[idx];
            let py = self.positions[idx + 1];
            let pz = self.positions[idx + 2];

            let dist = self.sample_sdf(px, py, pz);
            if dist < self.collision_margin {
                let (gx, gy, gz) = self.sdf_gradient(px, py, pz);
                let correction = self.collision_margin - dist;
                self.positions[idx] += gx * correction;
                self.positions[idx + 1] += gy * correction;
                self.positions[idx + 2] += gz * correction;
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

    fn sample_sdf(&self, px: f32, py: f32, pz: f32) -> f32 {
        let res = self.sdf_resolution as usize;
        let gx = (px - self.sdf_min[0]) / self.sdf_cell_size;
        let gy = (py - self.sdf_min[1]) / self.sdf_cell_size;
        let gz = (pz - self.sdf_min[2]) / self.sdf_cell_size;

        let fres = (res - 1) as f32;
        if gx < 0.0 || gx >= fres || gy < 0.0 || gy >= fres || gz < 0.0 || gz >= fres {
            return 1.0;
        }

        let x0 = gx as usize;
        let y0 = gy as usize;
        let z0 = gz as usize;
        let x1 = (x0 + 1).min(res - 1);
        let y1 = (y0 + 1).min(res - 1);
        let z1 = (z0 + 1).min(res - 1);

        let fx = gx - x0 as f32;
        let fy = gy - y0 as f32;
        let fz = gz - z0 as f32;

        let idx = |x: usize, y: usize, z: usize| -> usize { z * res * res + y * res + x };

        let c000 = self.sdf_data[idx(x0, y0, z0)];
        let c100 = self.sdf_data[idx(x1, y0, z0)];
        let c010 = self.sdf_data[idx(x0, y1, z0)];
        let c110 = self.sdf_data[idx(x1, y1, z0)];
        let c001 = self.sdf_data[idx(x0, y0, z1)];
        let c101 = self.sdf_data[idx(x1, y0, z1)];
        let c011 = self.sdf_data[idx(x0, y1, z1)];
        let c111 = self.sdf_data[idx(x1, y1, z1)];

        let c00 = c000 * (1.0 - fx) + c100 * fx;
        let c01 = c001 * (1.0 - fx) + c101 * fx;
        let c10 = c010 * (1.0 - fx) + c110 * fx;
        let c11 = c011 * (1.0 - fx) + c111 * fx;

        let c0 = c00 * (1.0 - fy) + c10 * fy;
        let c1 = c01 * (1.0 - fy) + c11 * fy;

        c0 * (1.0 - fz) + c1 * fz
    }

    fn sdf_gradient(&self, px: f32, py: f32, pz: f32) -> (f32, f32, f32) {
        let h = self.sdf_cell_size * 0.5;
        let dx = self.sample_sdf(px + h, py, pz) - self.sample_sdf(px - h, py, pz);
        let dy = self.sample_sdf(px, py + h, pz) - self.sample_sdf(px, py - h, pz);
        let dz = self.sample_sdf(px, py, pz + h) - self.sample_sdf(px, py, pz - h);
        let len = (dx * dx + dy * dy + dz * dz).sqrt();
        if len < 1e-12 {
            return (0.0, 1.0, 0.0);
        }
        (dx / len, dy / len, dz / len)
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

    fn post_solve(&mut self, sdt: f32) {
        let inv_sdt = 1.0 / sdt;

        // Coulomb friction coefficients
        let static_friction = 0.6_f32;  // μ_s - higher, prevents motion from starting
        let kinetic_friction = 0.4_f32; // μ_k - lower, applies when already moving
        let static_threshold = 0.01_f32; // velocity threshold for static friction
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
