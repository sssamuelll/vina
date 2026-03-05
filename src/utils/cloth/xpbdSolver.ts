/**
 * XPBD Cloth Solver — Pure TypeScript implementation
 *
 * Based on Matthias Müller's "Ten Minute Physics" Tutorial #14 — Cloth Simulation
 * https://github.com/matthias-research/pages (MIT license)
 *
 * Extended Position-Based Dynamics (XPBD) with distance constraints (stretching)
 * and bending constraints for realistic cloth simulation.
 *
 * @module xpbdSolver
 */

import { type SDFData, sampleSDF, sdfGradient } from './sdfGenerator';
import { type SeamConstraintSet, solveSeamConstraints } from './seamAssembly';
import { SpatialHashGrid, buildAdjacency, solveSelfCollision } from './selfCollision';
import { type LRAConstraint, buildLRAConstraints, solveLRA } from './longRangeAttachments';
import { EdgeType, classifyEdgeType } from './gpu/gpuBuffers';
import type { CollisionMeshData } from './collisionMesh';
import { TriangleSpatialHash, solveTriangleCollision } from './triangleCollision';

// ─── Vector Math on Float32Array ────────────────────────────────────────────

/** Set particle `anr` to zero in array `a`. */
function vecSetZero(a: Float32Array, anr: number): void {
  const i = anr * 3;
  a[i] = 0.0;
  a[i + 1] = 0.0;
  a[i + 2] = 0.0;
}

/** Scale particle `anr` in place by `scale`. */
function vecScale(a: Float32Array, anr: number, scale: number): void {
  const i = anr * 3;
  a[i] *= scale;
  a[i + 1] *= scale;
  a[i + 2] *= scale;
}

/** Copy particle `bnr` from `b` into particle `anr` of `a`. */
function vecCopy(a: Float32Array, anr: number, b: Float32Array, bnr: number): void {
  const ai = anr * 3;
  const bi = bnr * 3;
  a[ai] = b[bi];
  a[ai + 1] = b[bi + 1];
  a[ai + 2] = b[bi + 2];
}

/** Add `b[bnr] * scale` to `a[anr]`. */
function vecAdd(a: Float32Array, anr: number, b: Float32Array, bnr: number, scale: number = 1.0): void {
  const ai = anr * 3;
  const bi = bnr * 3;
  a[ai] += b[bi] * scale;
  a[ai + 1] += b[bi + 1] * scale;
  a[ai + 2] += b[bi + 2] * scale;
}

/** Set `dst[dnr] = (a[anr] - b[bnr]) * scale`. */
function vecSetDiff(
  dst: Float32Array, dnr: number,
  a: Float32Array, anr: number,
  b: Float32Array, bnr: number,
  scale: number = 1.0,
): void {
  const di = dnr * 3;
  const ai = anr * 3;
  const bi = bnr * 3;
  dst[di] = (a[ai] - b[bi]) * scale;
  dst[di + 1] = (a[ai + 1] - b[bi + 1]) * scale;
  dst[di + 2] = (a[ai + 2] - b[bi + 2]) * scale;
}

/** Return squared length of particle `anr` in `a`. */
function vecLengthSquared(a: Float32Array, anr: number): number {
  const i = anr * 3;
  const x = a[i], y = a[i + 1], z = a[i + 2];
  return x * x + y * y + z * z;
}

/** Return squared distance between particles `anr` and `bnr`. */
function vecDistSquared(a: Float32Array, anr: number, b: Float32Array, bnr: number): number {
  const ai = anr * 3;
  const bi = bnr * 3;
  const dx = a[ai] - b[bi];
  const dy = a[ai + 1] - b[bi + 1];
  const dz = a[ai + 2] - b[bi + 2];
  return dx * dx + dy * dy + dz * dz;
}

/** Set `a[anr] = cross(b[bnr], c[cnr])`. */
function vecSetCross(
  a: Float32Array, anr: number,
  b: Float32Array, bnr: number,
  c: Float32Array, cnr: number,
): void {
  const ai = anr * 3;
  const bi = bnr * 3;
  const ci = cnr * 3;
  a[ai] = b[bi + 1] * c[ci + 2] - b[bi + 2] * c[ci + 1];
  a[ai + 1] = b[bi + 2] * c[ci] - b[bi] * c[ci + 2];
  a[ai + 2] = b[bi] * c[ci + 1] - b[bi + 1] * c[ci];
}

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Configuration for the XPBD cloth simulation.
 */
export interface ClothSimConfig {
  /** Number of XPBD substeps per frame (more = stiffer, default 15) */
  numSubsteps: number;
  /** Gravity vector [x, y, z] in m/s² */
  gravity: [number, number, number];
  /** Time step per frame in seconds (default 1/60) */
  dt: number;
  /** Velocity damping factor per frame 0-1 (default 0.99) */
  damping: number;
  /** Stretching compliance (0 = perfectly stiff, default 0.0) */
  stretchingCompliance: number;
  /** Bending compliance (higher = more flexible, default 1.0) */
  bendingCompliance: number;
  /** Ground plane Y coordinate (default 0.0) */
  groundY: number;
  /** Friction coefficient for ground contact (default 0.5) */
  groundFriction: number;
  /** Enable self-collision detection (default true) */
  selfCollision: boolean;
  /** Cloth thickness for self-collision in meters (default 0.002 = 2mm) */
  clothThickness: number;
  /** Enable adaptive substepping (default true) */
  adaptiveSubsteps: boolean;
  /** Minimum substeps for adaptive mode (default 10) */
  minSubsteps: number;
  /** Maximum substeps for adaptive mode (default 30) */
  maxSubsteps: number;
  /** Max velocity threshold in m/s for adaptive substeps and velocity clamping (default 5.0) */
  maxVelocity: number;
  /** Enable Long Range Attachments (default true) */
  enableLRA: boolean;
  /** Air drag coefficient (0 = no drag, 1.0 = normal, 2.0 = heavy drag) */
  dragCoefficient: number;
  /** Stretch compliance in warp direction (vertical, 0° in UV) */
  stretchComplianceWarp: number;
  /** Stretch compliance in weft direction (horizontal, 90° in UV) */
  stretchComplianceWeft: number;
  /** Stretch compliance in shear direction (diagonal, 45° in UV) */
  stretchComplianceShear: number;
  /** Bending compliance in warp direction (vertical in UV) */
  bendComplianceWarp: number;
  /** Bending compliance in weft direction (horizontal in UV) */
  bendComplianceWeft: number;
  /** Internal damping (0.0 = fluid/oscillates, 1.0 = heavy/settles quickly). Default: 0.3 */
  internalDamping: number;
}

/**
 * A collider sphere for avatar collision approximation.
 */
export interface SphereCollider {
  /** Center position [x, y, z] in meters */
  center: [number, number, number];
  /** Radius in meters */
  radius: number;
}

/**
 * A collider capsule (two sphere endpoints + radius).
 */
export interface CapsuleCollider {
  /** Start position [x, y, z] in meters */
  start: [number, number, number];
  /** End position [x, y, z] in meters */
  end: [number, number, number];
  /** Radius in meters */
  radius: number;
}

/**
 * Mesh data input for creating a cloth simulation.
 */
export interface ClothMeshData {
  /** Flat vertex positions [x0,y0,z0, x1,y1,z1, ...] */
  vertices: Float32Array;
  /** Triangle indices [i0,i1,i2, i3,i4,i5, ...] */
  triIds: Int32Array;
  /** Optional UV coordinates [u0,v0, u1,v1, ...] for anisotropic stretch */
  uvs?: Float32Array;
}

/**
 * Read-only snapshot of the simulation state.
 */
export interface ClothSnapshot {
  /** Current particle positions (flat Float32Array) */
  positions: Float32Array;
  /** Number of particles */
  numParticles: number;
  /** Triangle indices for rendering */
  triIds: Int32Array;
}

// ─── Neighbor Finding ───────────────────────────────────────────────────────

interface EdgeInfo {
  id0: number;
  id1: number;
  edgeNr: number;
}

/**
 * Find adjacent triangles sharing edges. Returns a Float32Array where
 * `neighbors[edgeNr]` is the edgeNr of the neighboring half-edge, or -1.
 *
 * @param triIds - Flat triangle index buffer
 * @returns Neighbor map indexed by half-edge
 */
function findTriNeighbors(triIds: Int32Array): Float32Array {
  const edges: EdgeInfo[] = [];
  const numTris = triIds.length / 3;

  for (let i = 0; i < numTris; i++) {
    for (let j = 0; j < 3; j++) {
      const id0 = triIds[3 * i + j];
      const id1 = triIds[3 * i + (j + 1) % 3];
      edges.push({
        id0: Math.min(id0, id1),
        id1: Math.max(id0, id1),
        edgeNr: 3 * i + j,
      });
    }
  }

  edges.sort((a, b) =>
    a.id0 < b.id0 ? -1 :
    a.id0 > b.id0 ? 1 :
    a.id1 < b.id1 ? -1 :
    a.id1 > b.id1 ? 1 : 0
  );

  const neighbors = new Float32Array(3 * numTris);
  neighbors.fill(-1);

  let nr = 0;
  while (nr < edges.length) {
    const e0 = edges[nr];
    nr++;
    if (nr < edges.length) {
      const e1 = edges[nr];
      if (e0.id0 === e1.id0 && e0.id1 === e1.id1) {
        neighbors[e0.edgeNr] = e1.edgeNr;
        neighbors[e1.edgeNr] = e0.edgeNr;
        nr++; // skip matched partner; unmatched boundary edges only advance by 1
      }
    }
  }

  return neighbors;
}

// ─── XPBDClothSolver Class ──────────────────────────────────────────────────

/**
 * XPBD cloth simulation solver.
 *
 * Creates a particle system from triangle mesh data and solves distance (stretch)
 * and bending constraints using Extended Position-Based Dynamics.
 *
 * Usage:
 * ```ts
 * const solver = new XPBDClothSolver(meshData, config);
 * // Each frame:
 * solver.step();
 * const snap = solver.getSnapshot();
 * ```
 */
export class XPBDClothSolver {
  /** Number of particles */
  readonly numParticles: number;

  /** Current positions [x0,y0,z0, ...] */
  pos: Float32Array;
  /** Previous positions (for velocity derivation) */
  prevPos: Float32Array;
  /** Rest positions (initial layout) */
  restPos: Float32Array;
  /** Velocities */
  vel: Float32Array;
  /** Inverse mass per particle (0 = pinned) */
  invMass: Float32Array;

  /** Stretching constraint edge pairs [id0, id1, ...] */
  private stretchingIds: Int32Array;
  /** Rest lengths for stretching constraints */
  private stretchingLengths: Float32Array;

  /** Bending constraint quad [edgeId0, edgeId1, oppId0, oppId1, ...] */
  private bendingIds: Int32Array;
  /** Rest lengths for bending constraints */
  private bendingLengths: Float32Array;

  /** Per-constraint compliance for anisotropic stretch */
  private stretchCompliances!: Float32Array;

  /** Per-constraint compliance for anisotropic bending */
  private bendCompliances!: Float32Array;

  /** Optional UV coordinates for edge classification */
  private uvs: Float32Array | undefined;

  /** Triangle index buffer */
  readonly triIds: Int32Array;

  /** Temporary vectors for constraint solving */
  private grads: Float32Array;

  /** Simulation configuration */
  config: ClothSimConfig;

  /** Sphere colliders for avatar approximation */
  private sphereColliders: SphereCollider[] = [];

  /** Capsule colliders for avatar approximation */
  private capsuleColliders: CapsuleCollider[] = [];

  /** SDF data for accurate avatar body collision */
  private sdfData: SDFData | null = null;

  /** Triangle collision mesh data (replaces SDF) */
  private collisionMesh: CollisionMeshData | null = null;
  /** Spatial hash over collision mesh triangles */
  private collisionHash: TriangleSpatialHash | null = null;

  /** Seam constraints for multi-piece sewing */
  private seamConstraints: SeamConstraintSet | null = null;

  /** Spatial hash grid for self-collision */
  private spatialHash: SpatialHashGrid;
  /** Triangle adjacency for self-collision neighbor skipping */
  private adjacency: Set<number>[];

  /** Long Range Attachment constraints */
  private lraConstraints: LRAConstraint[] | null = null;

  /**
   * Create a new XPBD cloth solver.
   *
   * @param meshData - Triangle mesh (positions + indices)
   * @param config - Simulation parameters (partial, defaults applied)
   */
  constructor(meshData: ClothMeshData, config?: Partial<ClothSimConfig>) {
    this.config = {
      numSubsteps: 15,
      gravity: [0.0, -9.81, 0.0],
      dt: 1.0 / 60.0,
      damping: 0.99,
      stretchingCompliance: 0.0,
      bendingCompliance: 1.0,
      groundY: 0.0,
      groundFriction: 0.5,
      selfCollision: true,
      clothThickness: 0.002,
      adaptiveSubsteps: true,
      minSubsteps: 10,
      maxSubsteps: 30,
      maxVelocity: 5.0,
      enableLRA: true,
      dragCoefficient: 1.0,
      stretchComplianceWarp: 0.0,
      stretchComplianceWeft: 0.0,
      stretchComplianceShear: 0.001,
      bendComplianceWarp: 1.0,
      bendComplianceWeft: 1.0,
      internalDamping: 0.3,
      ...config,
    };

    this.numParticles = meshData.vertices.length / 3;
    this.pos = new Float32Array(meshData.vertices);
    this.prevPos = new Float32Array(meshData.vertices);
    this.restPos = new Float32Array(meshData.vertices);
    this.vel = new Float32Array(3 * this.numParticles);
    this.invMass = new Float32Array(this.numParticles);
    this.triIds = new Int32Array(meshData.triIds);
    this.uvs = meshData.uvs;

    // Build constraints from mesh topology
    const neighbors = findTriNeighbors(this.triIds);
    const numTris = this.triIds.length / 3;
    const edgeIdsList: number[] = [];
    const triPairIdsList: number[] = [];

    for (let i = 0; i < numTris; i++) {
      for (let j = 0; j < 3; j++) {
        const id0 = this.triIds[3 * i + j];
        const id1 = this.triIds[3 * i + (j + 1) % 3];

        // Each edge only once
        const n = neighbors[3 * i + j];
        if (n < 0 || id0 < id1) {
          edgeIdsList.push(id0);
          edgeIdsList.push(id1);
        }

        // Triangle pair for bending
        if (n >= 0) {
          const ni = Math.floor(n / 3);
          const nj = n % 3;
          const id2 = this.triIds[3 * i + (j + 2) % 3];
          const id3 = this.triIds[3 * ni + (nj + 2) % 3];
          triPairIdsList.push(id0);
          triPairIdsList.push(id1);
          triPairIdsList.push(id2);
          triPairIdsList.push(id3);
        }
      }
    }

    this.stretchingIds = new Int32Array(edgeIdsList);
    this.bendingIds = new Int32Array(triPairIdsList);
    this.stretchingLengths = new Float32Array(this.stretchingIds.length / 2);
    this.bendingLengths = new Float32Array(this.bendingIds.length / 4);

    this.grads = new Float32Array(4 * 3);

    this.initPhysics();

    // Self-collision setup
    this.spatialHash = new SpatialHashGrid(this.config.clothThickness * 2);
    this.adjacency = buildAdjacency(this.triIds, this.numParticles);
  }

  /**
   * Compute initial inverse masses from triangle areas and rest lengths.
   */
  private initPhysics(): void {
    this.invMass.fill(0.0);

    const numTris = this.triIds.length / 3;
    const e0 = new Float32Array(3);
    const e1 = new Float32Array(3);
    const cross = new Float32Array(3);

    for (let i = 0; i < numTris; i++) {
      const id0 = this.triIds[3 * i];
      const id1 = this.triIds[3 * i + 1];
      const id2 = this.triIds[3 * i + 2];

      vecSetDiff(e0, 0, this.pos, id1, this.pos, id0);
      vecSetDiff(e1, 0, this.pos, id2, this.pos, id0);
      vecSetCross(cross, 0, e0, 0, e1, 0);

      const area = 0.5 * Math.sqrt(vecLengthSquared(cross, 0));
      const pInvMass = area > 0.0 ? 1.0 / area / 3.0 : 0.0;
      this.invMass[id0] += pInvMass;
      this.invMass[id1] += pInvMass;
      this.invMass[id2] += pInvMass;
    }

    // Compute rest lengths for stretching
    for (let i = 0; i < this.stretchingLengths.length; i++) {
      const id0 = this.stretchingIds[2 * i];
      const id1 = this.stretchingIds[2 * i + 1];
      this.stretchingLengths[i] = Math.sqrt(vecDistSquared(this.pos, id0, this.pos, id1));
    }

    // Classify edges and assign per-constraint compliance for anisotropic stretch
    this.stretchCompliances = new Float32Array(this.stretchingLengths.length);
    const uvs = this.uvs;

    for (let i = 0; i < this.stretchingLengths.length; i++) {
      const id0 = this.stretchingIds[2 * i];
      const id1 = this.stretchingIds[2 * i + 1];

      // Get UV coords if available, otherwise default to SHEAR
      let edgeType = EdgeType.SHEAR;
      if (uvs && uvs.length >= (Math.max(id0, id1) + 1) * 2) {
        const uvA: [number, number] = [uvs[id0 * 2], uvs[id0 * 2 + 1]];
        const uvB: [number, number] = [uvs[id1 * 2], uvs[id1 * 2 + 1]];
        edgeType = classifyEdgeType(uvA, uvB);
      }

      // Assign compliance based on edge type
      switch (edgeType) {
        case EdgeType.WARP:
          this.stretchCompliances[i] = this.config.stretchComplianceWarp;
          break;
        case EdgeType.WEFT:
          this.stretchCompliances[i] = this.config.stretchComplianceWeft;
          break;
        case EdgeType.SHEAR:
        default:
          this.stretchCompliances[i] = this.config.stretchComplianceShear;
          break;
      }
    }

    // Compute rest lengths for bending
    for (let i = 0; i < this.bendingLengths.length; i++) {
      const id0 = this.bendingIds[4 * i + 2];
      const id1 = this.bendingIds[4 * i + 3];
      this.bendingLengths[i] = Math.sqrt(vecDistSquared(this.pos, id0, this.pos, id1));
    }

    // Classify bend edges and assign per-constraint compliance for anisotropic bending
    this.bendCompliances = new Float32Array(this.bendingLengths.length);

    for (let i = 0; i < this.bendingLengths.length; i++) {
      // Get the shared edge vertices (a, b are first two indices of quad)
      const a = this.bendingIds[i * 4];
      const b = this.bendingIds[i * 4 + 1];

      // Classify edge by UV direction
      let edgeType = EdgeType.WEFT; // Default
      if (uvs && uvs.length >= (Math.max(a, b) + 1) * 2) {
        const uvA: [number, number] = [uvs[a * 2], uvs[a * 2 + 1]];
        const uvB: [number, number] = [uvs[b * 2], uvs[b * 2 + 1]];
        edgeType = classifyEdgeType(uvA, uvB);
        // For bending, SHEAR defaults to WEFT
        if (edgeType === EdgeType.SHEAR) {
          edgeType = EdgeType.WEFT;
        }
      }

      // Assign compliance based on edge type
      if (edgeType === EdgeType.WARP) {
        this.bendCompliances[i] = this.config.bendComplianceWarp;
      } else {
        this.bendCompliances[i] = this.config.bendComplianceWeft;
      }
    }
  }

  /**
   * Pin a particle in place (invMass = 0).
   *
   * @param particleIndex - Index of the particle to pin
   */
  pinParticle(particleIndex: number): void {
    if (particleIndex >= 0 && particleIndex < this.numParticles) {
      this.invMass[particleIndex] = 0.0;
      if (this.config.enableLRA) this.rebuildLRA();
    }
  }

  /**
   * Unpin a particle (restore invMass from area-based computation).
   * Note: re-runs physics init to recalculate mass.
   *
   * @param particleIndex - Index of the particle to unpin
   * @param mass - Inverse mass to restore (default 1.0)
   */
  unpinParticle(particleIndex: number, mass: number = 1.0): void {
    if (particleIndex >= 0 && particleIndex < this.numParticles) {
      this.invMass[particleIndex] = mass;
      if (this.config.enableLRA) this.rebuildLRA();
    }
  }

  /**
   * Build/rebuild Long Range Attachment constraints from current pinned particles.
   */
  buildLRA(): void {
    this.rebuildLRA();
  }

  private rebuildLRA(): void {
    const pinned = new Set<number>();
    for (let i = 0; i < this.numParticles; i++) {
      if (this.invMass[i] === 0.0) pinned.add(i);
    }
    if (pinned.size === 0) {
      this.lraConstraints = null;
      return;
    }
    this.lraConstraints = buildLRAConstraints(this.restPos, this.numParticles, this.triIds, pinned);
  }

  /**
   * Set sphere colliders for avatar approximation.
   *
   * @param colliders - Array of sphere colliders
   */
  setSphereColliders(colliders: SphereCollider[]): void {
    this.sphereColliders = colliders;
  }

  /**
   * Set capsule colliders for avatar approximation.
   *
   * @param colliders - Array of capsule colliders
   */
  setCapsuleColliders(colliders: CapsuleCollider[]): void {
    this.capsuleColliders = colliders;
  }

  /**
   * Set SDF data for accurate avatar body collision.
   *
   * @deprecated Use `setCollisionMesh()` instead. SDF collision is retained
   * for backward compatibility with the Wasm solver.
   *
   * @param sdf - Signed distance field data or null to disable
   */
  setSDF(sdf: SDFData | null): void {
    this.sdfData = sdf;
  }

  /**
   * Set triangle collision mesh for body collision (replaces SDF).
   * Builds spatial hash over avatar triangles.
   */
  setCollisionMesh(mesh: CollisionMeshData | null): void {
    this.collisionMesh = mesh;
    if (mesh && mesh.triCount > 0) {
      const cellSize = Math.max(0.02, (this.config.clothThickness ?? 0.002) * 10);
      this.collisionHash = new TriangleSpatialHash(mesh, cellSize);
    } else {
      this.collisionHash = null;
    }
  }

  /**
   * Set seam constraints for multi-piece sewing.
   *
   * @param seamSet - Seam constraint set from buildSeamConstraints(), or null to clear
   */
  setSeamConstraints(seamSet: SeamConstraintSet | null): void {
    this.seamConstraints = seamSet;
  }

  /**
   * Pre-solve: integrate gravity, apply air drag, save previous positions, enforce ground plane.
   */
  private preSolve(sdt: number): void {
    const grav = new Float32Array(this.config.gravity);

    // Compute internal damping factor: maps internalDamping (0.0 to 1.0) to factor (1.0 to 0.9)
    const internalDampingFactor = 1.0 - this.config.internalDamping * 0.1;

    for (let i = 0; i < this.numParticles; i++) {
      if (this.invMass[i] === 0.0) continue;

      // Apply gravity
      vecAdd(this.vel, i, grav, 0, sdt);

      // Apply damping (global + internal)
      const totalDamping = this.config.damping * internalDampingFactor;
      vecScale(this.vel, i, totalDamping);
    }

    // Apply air drag after gravity integration but before position update
    this.applyAirDrag(sdt);

    for (let i = 0; i < this.numParticles; i++) {
      if (this.invMass[i] === 0.0) continue;

      // Save previous position
      vecCopy(this.prevPos, i, this.pos, i);

      // Integrate position
      vecAdd(this.pos, i, this.vel, i, sdt);
    }
  }

  /**
   * Apply aerodynamic drag force per triangle.
   * Formula: F = ½ρv²CdA(n·v̂)
   *
   * @param sdt - Substep delta time
   */
  private applyAirDrag(sdt: number): void {
    const dragCoeff = this.config.dragCoefficient;
    if (dragCoeff <= 0) return;

    const airDensity = 1.225; // kg/m³ at sea level
    const numTris = this.triIds.length / 3;

    // Temporary vectors for calculation
    const e0 = new Float32Array(3);
    const e1 = new Float32Array(3);
    const normal = new Float32Array(3);
    const triVel = new Float32Array(3);

    for (let t = 0; t < numTris; t++) {
      const i0 = this.triIds[t * 3];
      const i1 = this.triIds[t * 3 + 1];
      const i2 = this.triIds[t * 3 + 2];

      // Skip if all vertices are pinned
      if (this.invMass[i0] === 0 && this.invMass[i1] === 0 && this.invMass[i2] === 0) {
        continue;
      }

      // Calculate triangle velocity (average of vertices)
      const v0 = i0 * 3, v1 = i1 * 3, v2 = i2 * 3;
      triVel[0] = (this.vel[v0] + this.vel[v1] + this.vel[v2]) / 3;
      triVel[1] = (this.vel[v0 + 1] + this.vel[v1 + 1] + this.vel[v2 + 1]) / 3;
      triVel[2] = (this.vel[v0 + 2] + this.vel[v1 + 2] + this.vel[v2 + 2]) / 3;

      const speed = Math.sqrt(triVel[0] * triVel[0] + triVel[1] * triVel[1] + triVel[2] * triVel[2]);
      if (speed < 0.001) continue;

      // Calculate triangle normal and area
      const p0 = i0 * 3, p1 = i1 * 3, p2 = i2 * 3;
      e0[0] = this.pos[p1] - this.pos[p0];
      e0[1] = this.pos[p1 + 1] - this.pos[p0 + 1];
      e0[2] = this.pos[p1 + 2] - this.pos[p0 + 2];

      e1[0] = this.pos[p2] - this.pos[p0];
      e1[1] = this.pos[p2 + 1] - this.pos[p0 + 1];
      e1[2] = this.pos[p2 + 2] - this.pos[p0 + 2];

      // normal = cross(e0, e1)
      normal[0] = e0[1] * e1[2] - e0[2] * e1[1];
      normal[1] = e0[2] * e1[0] - e0[0] * e1[2];
      normal[2] = e0[0] * e1[1] - e0[1] * e1[0];

      const normalLen = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
      if (normalLen < 1e-10) continue;

      const area = normalLen * 0.5;

      // Normalize normal
      normal[0] /= normalLen;
      normal[1] /= normalLen;
      normal[2] /= normalLen;

      // Velocity direction
      const velDir = [triVel[0] / speed, triVel[1] / speed, triVel[2] / speed];

      // Facing factor: how much triangle faces into velocity
      const facingFactor = Math.abs(normal[0] * velDir[0] + normal[1] * velDir[1] + normal[2] * velDir[2]);

      // F = ½ρv²CdA * facingFactor
      const dragMagnitude = 0.5 * airDensity * speed * speed * dragCoeff * area * facingFactor;

      // Drag force opposes velocity
      const dragForce = [
        -velDir[0] * dragMagnitude,
        -velDir[1] * dragMagnitude,
        -velDir[2] * dragMagnitude,
      ];

      // Distribute force to vertices
      const forcePerVertex = 1 / 3;
      for (const idx of [i0, i1, i2]) {
        if (this.invMass[idx] === 0) continue;
        const vi = idx * 3;
        const scale = forcePerVertex * this.invMass[idx] * sdt;
        this.vel[vi] += dragForce[0] * scale;
        this.vel[vi + 1] += dragForce[1] * scale;
        this.vel[vi + 2] += dragForce[2] * scale;
      }
    }
  }

  /**
   * Solve all constraints (stretching + bending).
   */
  private solve(sdt: number): void {
    this.solveStretching(sdt);
    this.solveBending(sdt);
    if (this.seamConstraints) {
      solveSeamConstraints(this.pos, this.invMass, this.seamConstraints, sdt);
    }
    this.solveCollisions();

    if (this.config.selfCollision) {
      solveSelfCollision(
        this.pos, this.prevPos, this.invMass, this.numParticles,
        this.triIds, this.config.clothThickness, this.spatialHash, this.adjacency,
      );
    }

    // LRA as hard limit after all soft constraints
    if (this.config.enableLRA && this.lraConstraints) {
      solveLRA(this.pos, this.invMass, this.lraConstraints);
    }

    // Ground plane collision - MUST be after all other constraints
    this.solveGroundCollision();
  }

  /**
   * Resolve ground plane collisions.
   * Called after all other constraints to ensure particles stay above ground.
   * Friction is handled separately in postSolve at velocity level.
   */
  private solveGroundCollision(): void {
    const groundY = this.config.groundY;

    for (let i = 0; i < this.numParticles; i++) {
      if (this.invMass[i] === 0.0) continue;

      const yi = 3 * i + 1;

      if (this.pos[yi] < groundY) {
        // Clamp to ground plane
        this.pos[yi] = groundY;
      }
    }
  }

  /**
   * Solve XPBD distance constraints for stretching resistance.
   * Uses per-constraint compliance for anisotropic stretch behavior.
   *
   * @param sdt - Substep time
   */
  private solveStretching(sdt: number): void {
    for (let i = 0; i < this.stretchingLengths.length; i++) {
      const compliance = this.stretchCompliances[i];
      const alpha = compliance / (sdt * sdt);

      const id0 = this.stretchingIds[2 * i];
      const id1 = this.stretchingIds[2 * i + 1];

      const w0 = this.invMass[id0];
      const w1 = this.invMass[id1];
      const w = w0 + w1;
      if (w === 0.0) continue;

      vecSetDiff(this.grads, 0, this.pos, id0, this.pos, id1);
      const len = Math.sqrt(vecLengthSquared(this.grads, 0));
      if (len === 0.0) continue;

      vecScale(this.grads, 0, 1.0 / len);
      const restLen = this.stretchingLengths[i];
      const C = len - restLen;
      const s = -C / (w + alpha);

      vecAdd(this.pos, id0, this.grads, 0, s * w0);
      vecAdd(this.pos, id1, this.grads, 0, -s * w1);
    }
  }

  /**
   * Solve XPBD bending constraints between triangle pairs.
   * Uses per-constraint compliance for anisotropic bending behavior.
   *
   * @param sdt - Substep time
   */
  private solveBending(sdt: number): void {
    for (let i = 0; i < this.bendingLengths.length; i++) {
      const compliance = this.bendCompliances[i];
      const alpha = compliance / (sdt * sdt);

      const id0 = this.bendingIds[4 * i + 2]; // opposite vertex 0
      const id1 = this.bendingIds[4 * i + 3]; // opposite vertex 1

      const w0 = this.invMass[id0];
      const w1 = this.invMass[id1];
      const w = w0 + w1;
      if (w === 0.0) continue;

      vecSetDiff(this.grads, 0, this.pos, id0, this.pos, id1);
      const len = Math.sqrt(vecLengthSquared(this.grads, 0));
      if (len === 0.0) continue;

      vecScale(this.grads, 0, 1.0 / len);
      const restLen = this.bendingLengths[i];
      const C = len - restLen;
      const s = -C / (w + alpha);

      vecAdd(this.pos, id0, this.grads, 0, s * w0);
      vecAdd(this.pos, id1, this.grads, 0, -s * w1);
    }
  }

  /**
   * Resolve collisions with sphere and capsule colliders.
   */
  private solveCollisions(): void {
    // Sphere colliders
    for (const sphere of this.sphereColliders) {
      const cx = sphere.center[0];
      const cy = sphere.center[1];
      const cz = sphere.center[2];
      const r = sphere.radius;

      for (let i = 0; i < this.numParticles; i++) {
        if (this.invMass[i] === 0.0) continue;

        const pi = 3 * i;
        const dx = this.pos[pi] - cx;
        const dy = this.pos[pi + 1] - cy;
        const dz = this.pos[pi + 2] - cz;
        const dist2 = dx * dx + dy * dy + dz * dz;

        if (dist2 < r * r && dist2 > 0.0) {
          const dist = Math.sqrt(dist2);
          const invDist = 1.0 / dist;
          // Push particle to surface
          this.pos[pi] = cx + dx * invDist * r;
          this.pos[pi + 1] = cy + dy * invDist * r;
          this.pos[pi + 2] = cz + dz * invDist * r;
        }
      }
    }

    // Capsule colliders
    for (const capsule of this.capsuleColliders) {
      const ax = capsule.start[0], ay = capsule.start[1], az = capsule.start[2];
      const bx = capsule.end[0], by = capsule.end[1], bz = capsule.end[2];
      const r = capsule.radius;

      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const abLen2 = abx * abx + aby * aby + abz * abz;

      for (let i = 0; i < this.numParticles; i++) {
        if (this.invMass[i] === 0.0) continue;

        const pi = 3 * i;
        const apx = this.pos[pi] - ax;
        const apy = this.pos[pi + 1] - ay;
        const apz = this.pos[pi + 2] - az;

        // Project onto capsule axis
        let t = abLen2 > 0 ? (apx * abx + apy * aby + apz * abz) / abLen2 : 0;
        t = Math.max(0, Math.min(1, t));

        // Closest point on capsule axis
        const cx = ax + t * abx;
        const cy = ay + t * aby;
        const cz = az + t * abz;

        const dx = this.pos[pi] - cx;
        const dy = this.pos[pi + 1] - cy;
        const dz = this.pos[pi + 2] - cz;
        const dist2 = dx * dx + dy * dy + dz * dz;

        if (dist2 < r * r && dist2 > 0.0) {
          const dist = Math.sqrt(dist2);
          const invDist = 1.0 / dist;
          this.pos[pi] = cx + dx * invDist * r;
          this.pos[pi + 1] = cy + dy * invDist * r;
          this.pos[pi + 2] = cz + dz * invDist * r;
        }
      }
    }

    // SDF collision (accurate avatar body collision)
    if (this.sdfData) {
      const epsilon = 0.001; // 1mm offset to avoid z-fighting
      
      for (let i = 0; i < this.numParticles; i++) {
        if (this.invMass[i] === 0.0) continue;

        const pi = 3 * i;
        const point: [number, number, number] = [this.pos[pi], this.pos[pi + 1], this.pos[pi + 2]];
        
        // Sample SDF at particle position
        const distance = sampleSDF(this.sdfData, point);
        
        // If particle is inside body (distance < 0)
        if (distance < 0) {
          // Compute gradient (push direction)
          const gradient = sdfGradient(this.sdfData, point);
          
          // Push particle to surface with small offset
          const pushDistance = -distance + epsilon;
          this.pos[pi] += gradient[0] * pushDistance;
          this.pos[pi + 1] += gradient[1] * pushDistance;
          this.pos[pi + 2] += gradient[2] * pushDistance;
        }
      }
    }

    // Triangle mesh collision (replaces SDF — exact distance, supports animation)
    if (this.collisionMesh && this.collisionHash) {
      solveTriangleCollision(
        this.pos,
        this.invMass,
        this.numParticles,
        this.collisionMesh,
        this.collisionHash,
        this.config.clothThickness ?? 0.005,
      );
    }
  }

  /**
   * Post-solve: derive velocities from position change and apply friction.
   * Implements Coulomb friction model at velocity level for ground contact.
   */
  private postSolve(sdt: number): void {
    const maxSpeed = this.config.maxVelocity ?? 5.0;
    const invSdt = 1.0 / sdt;

    // Coulomb friction coefficients
    const kineticFriction = 0.4; // μ_k - applies when already moving
    const staticThreshold = 0.01; // velocity threshold for static friction
    const groundTolerance = 0.001; // distance from ground to apply friction
    const groundY = this.config.groundY;
    const gravityMag = Math.abs(this.config.gravity[1]);

    for (let i = 0; i < this.numParticles; i++) {
      if (this.invMass[i] === 0.0) continue;

      const xi = 3 * i;
      const yi = xi + 1;
      const zi = xi + 2;

      // Compute velocity from position change (Verlet integration)
      const vx = (this.pos[xi] - this.prevPos[xi]) * invSdt;
      const vy = (this.pos[yi] - this.prevPos[yi]) * invSdt;
      const vz = (this.pos[zi] - this.prevPos[zi]) * invSdt;

      // Check if particle is on or near ground
      if (this.pos[yi] <= groundY + groundTolerance) {
        // Calculate tangent (horizontal) velocity
        const tangentSpeed = Math.sqrt(vx * vx + vz * vz);

        if (tangentSpeed < staticThreshold) {
          // Static friction: stop horizontal motion completely
          this.vel[xi] = 0.0;
          this.vel[zi] = 0.0;
        } else {
          // Kinetic friction: decelerate tangent velocity
          // F_friction = μ_k * F_normal = μ_k * m * g
          // a_friction = F_friction / m = μ_k * g
          // Δv = a_friction * dt
          const frictionDecel = kineticFriction * gravityMag * sdt;
          const newTangentSpeed = Math.max(0, tangentSpeed - frictionDecel);

          if (newTangentSpeed > 0) {
            const scale = newTangentSpeed / tangentSpeed;
            this.vel[xi] = vx * scale;
            this.vel[zi] = vz * scale;
          } else {
            // Friction stopped the particle
            this.vel[xi] = 0.0;
            this.vel[zi] = 0.0;
          }
        }

        // Vertical velocity: prevent bouncing below ground, allow upward motion
        this.vel[yi] = vy < 0 ? 0 : vy;
      } else {
        // Not on ground - normal velocity update
        this.vel[xi] = vx;
        this.vel[yi] = vy;
        this.vel[zi] = vz;
      }

      // Clamp velocity to prevent explosions
      const speed = Math.sqrt(vecLengthSquared(this.vel, i));
      if (speed > maxSpeed) {
        vecScale(this.vel, i, maxSpeed / speed);
      }
    }
  }

  /**
   * Advance the simulation by one frame (config.dt seconds).
   * Runs `config.numSubsteps` sub-iterations.
   */
  step(): void {
    let numSubsteps = this.config.numSubsteps;

    if (this.config.adaptiveSubsteps) {
      // Compute max particle velocity from current state
      let maxVel = 0;
      for (let i = 0; i < this.numParticles; i++) {
        if (this.invMass[i] === 0.0) continue;
        const v2 = vecLengthSquared(this.vel, i);
        if (v2 > maxVel) maxVel = v2;
      }
      maxVel = Math.sqrt(maxVel);

      const maxVelocity = this.config.maxVelocity;
      const scaled = Math.round(this.config.numSubsteps * maxVel / maxVelocity);
      numSubsteps = Math.max(this.config.minSubsteps, Math.min(this.config.maxSubsteps, scaled));
    }

    const sdt = this.config.dt / numSubsteps;

    for (let step = 0; step < numSubsteps; step++) {
      this.preSolve(sdt);
      this.solve(sdt);
      this.postSolve(sdt);
    }
  }

  /**
   * Reset all particles to their initial rest positions with zero velocity.
   */
  reset(): void {
    this.pos.set(this.restPos);
    this.prevPos.set(this.restPos);
    this.vel.fill(0);
  }

  /**
   * Get a snapshot of the current simulation state for rendering.
   *
   * @returns Read-only snapshot with positions and triangle indices
   */
  getSnapshot(): ClothSnapshot {
    return {
      positions: new Float32Array(this.pos),
      numParticles: this.numParticles,
      triIds: this.triIds,
    };
  }

  /**
   * Update configuration at runtime.
   *
   * @param partial - Partial config to merge
   */
  updateConfig(partial: Partial<ClothSimConfig>): void {
    Object.assign(this.config, partial);
  }

  /**
   * Compute total kinetic energy of the system (for diagnostics).
   *
   * @returns Total kinetic energy in joules (arbitrary mass units)
   */
  computeKineticEnergy(): number {
    let energy = 0;
    for (let i = 0; i < this.numParticles; i++) {
      if (this.invMass[i] === 0.0) continue;
      const mass = 1.0 / this.invMass[i];
      const v2 = vecLengthSquared(this.vel, i);
      energy += 0.5 * mass * v2;
    }
    return energy;
  }

  /**
   * Get the number of stretching constraints.
   */
  get numStretchingConstraints(): number {
    return this.stretchingLengths.length;
  }

  /**
   * Get the number of bending constraints.
   */
  get numBendingConstraints(): number {
    return this.bendingLengths.length;
  }

  /**
   * Get edge data for fit map computation.
   * Returns read-only views of stretching constraint arrays.
   */
  getEdgeData(): { stretchingIds: Int32Array; stretchingLengths: Float32Array } {
    return {
      stretchingIds: this.stretchingIds,
      stretchingLengths: this.stretchingLengths,
    };
  }

  /**
   * Update stretch constraint rest lengths in-place.
   * Used for warm-start on dimension-only pattern edits.
   */
  updateRestLengths(newLengths: Float32Array): void {
    const count = Math.min(newLengths.length, this.stretchingLengths.length);
    for (let i = 0; i < count; i++) {
      this.stretchingLengths[i] = newLengths[i];
    }
  }

  /**
   * Get current positions as a read-only view.
   */
  getPositions(): Float32Array {
    return this.pos;
  }
}

// ─── Mesh Generation Utilities ──────────────────────────────────────────────

/**
 * Generate a rectangular cloth mesh grid.
 *
 * @param width - Width in meters
 * @param height - Height in meters
 * @param resX - Number of columns
 * @param resY - Number of rows
 * @param center - Center position [x, y, z]
 * @returns ClothMeshData for the solver
 */
export function generateRectClothMesh(
  width: number,
  height: number,
  resX: number,
  resY: number,
  center: [number, number, number] = [0, 1, 0],
): ClothMeshData {
  const numVerts = resX * resY;
  const vertices = new Float32Array(numVerts * 3);

  for (let iy = 0; iy < resY; iy++) {
    for (let ix = 0; ix < resX; ix++) {
      const idx = (iy * resX + ix) * 3;
      vertices[idx] = center[0] + (ix / (resX - 1) - 0.5) * width;
      vertices[idx + 1] = center[1] + (0.5 - iy / (resY - 1)) * height;
      vertices[idx + 2] = center[2];
    }
  }

  const numQuads = (resX - 1) * (resY - 1);
  const triIds = new Int32Array(numQuads * 6);
  let ti = 0;

  for (let iy = 0; iy < resY - 1; iy++) {
    for (let ix = 0; ix < resX - 1; ix++) {
      const v00 = iy * resX + ix;
      const v10 = iy * resX + ix + 1;
      const v01 = (iy + 1) * resX + ix;
      const v11 = (iy + 1) * resX + ix + 1;

      triIds[ti++] = v00;
      triIds[ti++] = v10;
      triIds[ti++] = v11;

      triIds[ti++] = v00;
      triIds[ti++] = v11;
      triIds[ti++] = v01;
    }
  }

  return { vertices, triIds };
}

/**
 * Triangulate a 2D polygon outline into a flat 3D mesh suitable for cloth simulation.
 * Uses ear-clipping triangulation for simple convex/concave polygons.
 *
 * @deprecated Use meshPiece or meshPieceOutline from '../mesh' for better quality CDT meshing
 * @param points - 2D outline points [{x, y}, ...]
 * @param yHeight - Y position in 3D space (default 1.2m above ground)
 * @param scale - Scale factor from pattern units to meters (default 0.001 = mm→m)
 * @returns ClothMeshData ready for the solver
 */
export function triangulatePieceOutline(
  points: { x: number; y: number }[],
  yHeight: number = 1.2,
  scale: number = 0.003,
): ClothMeshData {
  if (points.length < 3) {
    return { vertices: new Float32Array(0), triIds: new Int32Array(0) };
  }

  // Center the points
  let cx = 0, cy = 0;
  for (const p of points) { cx += p.x; cy += p.y; }
  cx /= points.length;
  cy /= points.length;

  const vertices = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    vertices[i * 3] = (points[i].x - cx) * scale;
    vertices[i * 3 + 1] = yHeight;
    vertices[i * 3 + 2] = (points[i].y - cy) * scale;
  }

  // Simple ear-clipping triangulation
  const triIds = earClipTriangulate(points);
  return { vertices, triIds };
}

/**
 * Ear-clipping triangulation for a simple polygon.
 *
 * @param points - 2D polygon vertices in order
 * @returns Int32Array of triangle indices
 */
function earClipTriangulate(points: { x: number; y: number }[]): Int32Array {
  const n = points.length;
  if (n < 3) return new Int32Array(0);
  if (n === 3) return new Int32Array([0, 1, 2]);

  // Ensure CCW winding
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  const ccw = area > 0;

  const indices = Array.from({ length: n }, (_, i) => i);
  const triangles: number[] = [];

  let remaining = n;
  let attempts = 0;
  const maxAttempts = remaining * remaining;

  let idx = 0;
  while (remaining > 2 && attempts < maxAttempts) {
    attempts++;
    const prev = indices[(idx - 1 + remaining) % remaining];
    const curr = indices[idx % remaining];
    const next = indices[(idx + 1) % remaining];

    const ax = points[prev].x, ay = points[prev].y;
    const bx = points[curr].x, by = points[curr].y;
    const cxp = points[next].x, cyp = points[next].y;

    // Check if this is a convex vertex (ear tip)
    const cross = (bx - ax) * (cyp - ay) - (by - ay) * (cxp - ax);
    const isConvex = ccw ? cross > 0 : cross < 0;

    if (isConvex) {
      // Check no other vertex inside this triangle
      let isEar = true;
      for (let k = 0; k < remaining; k++) {
        const vi = indices[k];
        if (vi === prev || vi === curr || vi === next) continue;
        if (pointInTriangle(points[vi].x, points[vi].y, ax, ay, bx, by, cxp, cyp)) {
          isEar = false;
          break;
        }
      }

      if (isEar) {
        triangles.push(prev, curr, next);
        indices.splice(idx % remaining, 1);
        remaining--;
        attempts = 0;
        if (idx >= remaining) idx = 0;
        continue;
      }
    }

    idx = (idx + 1) % remaining;
  }

  return new Int32Array(triangles);
}

/** Check if point (px, py) is inside triangle (ax,ay)-(bx,by)-(cx,cy). */
function pointInTriangle(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

// ─── New CDT Integration ────────────────────────────────────────────────────

import type { PatternPiece } from '../../types/types';

/**
 * Create a high-quality mesh for cloth simulation using Constrained Delaunay Triangulation.
 * 
 * This is the new preferred method for meshing pattern pieces, replacing the old
 * ear-clipping approach with proper CDT for better physics stability.
 *
 * @param piece - Pattern piece to mesh
 * @param config - Optional mesh configuration
 * @returns ClothMeshData ready for XPBD cloth simulation
 */
export function meshPieceForSimulation(
  piece: PatternPiece,
  config?: {
    yHeight?: number;
    scale?: number;
    maxEdgeLength?: number;
    minAngle?: number;
    maxRefinementPasses?: number;
    curveResolution?: number;
  },
): ClothMeshData {
  try {
    // Use CDT meshing for high-quality triangulation
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { meshPiece } = require('../mesh');
    return meshPiece(piece, config);
  } catch (error) {
    // Fallback to old ear-clipping method if CDT fails
    console.warn('CDT meshing failed, falling back to ear-clipping for piece', piece.id, ':', error);

    // Use the existing flattenPath function
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { flattenPath } = require('../seam');
    const points = flattenPath(piece.outline);
    return triangulatePieceOutline(points, config?.yHeight, config?.scale);
  }
}

// ─── Exported helpers used by tests ─────────────────────────────────────────

export { vecSetZero, vecLengthSquared, vecDistSquared };
