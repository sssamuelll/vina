/**
 * TSL Face-Poke — body-vertex-vs-cloth-face collision correction (face-poke v1).
 *
 * Vertex-vs-triangle body collision is structurally blind to a convex body
 * feature poking up *between* the 3 verts of a flat cloth face (all 3 outside
 * the body, yet the face interior is pierced). This pass closes that gap on the
 * GPU tier: dispatched OVER PARTICLES once per frame, each particle gathers its
 * incident cloth faces, queries the existing body BVH for nearby body vertices,
 * and pushes ONLY ITSELF out along the outward cloth-face normal so the face
 * tents over the bump.
 *
 * Two kernels, dispatched in order each frame (BOTH over numParticles):
 *   1. snapshot — copy posBuf → facePokeSnapshotBuf. Runs FIRST so the
 *      correction reads frozen (immutable) corner positions, never the live
 *      posBuf it is writing. THIS IS THE B1 DETERMINISM FIX.
 *   2. correct — per particle i: accumulate i's barycentric share of the
 *      penetration depth over every poking body vertex into a local `corr`,
 *      clamp |corr| to MAX_PUSH_DIST, add corr to BOTH posBuf and prevPosBuf
 *      (velocity-neutral).
 *
 * **WebGPU storage-buffer budget (root cause of the T5 no-op, fixed here).**
 * The correct kernel must bind ≤ 8 storage buffers per compute stage (WebGPU
 * `maxStorageBuffersPerShaderStage` = 8). The first-cut kernel bound 11
 * (pos/prevPos/invMass + snapshot + incidentOffsets/incidentList/triIds +
 * bvhNodes/bvhSkip + triVerts/vertexPseudo) → invalid pipeline → the kernel
 * silently never ran. This version PACKS to 8: the cloth CSR (offsets + list +
 * triIds) rides ONE `csrSBA`, and the body geometry (triVerts + vertexPseudo)
 * rides ONE interleaved `bodyGeomSBA` (18 floats/tri). Final bind set:
 * pos, prevPos, invMass, snapshot, csr, bvhNodes, bvhSkip, bodyGeom = 8.
 *
 * **CPU↔GPU parity contract.** The per-body-vertex math (sign convention,
 * barycentric projection, `(α/Σα²)·depth·n_outward` distribution, soup
 * multiplicity) MIRRORS `src/utils/cloth/facePokeCorrection.ts` EXACTLY.
 *
 * The BVH traversal (stackless escape-pointer walk, AABB-overlap descent)
 * mirrors `findBestNode` in tslCollision.ts, but queries with the cloth FACE's
 * AABB (union of its 3 snapshot corners ± band) and runs the port-math for
 * EVERY body triangle whose AABB overlaps (enumerate leaves).
 *
 * Spec: docs/superpowers/specs/2026-06-30-cloth-face-poke-collision-design.md.
 * GPU-only in v1 (A7 GPU-ahead divergence, like strain-limit / tether).
 *
 * @module tslFacePoke
 */

import {
  Break,
  Fn,
  If,
  Loop,
  compute,
  storage,
  uniform,
  float,
  uint,
  vec3,
  select,
  instanceIndex,
} from 'three/tsl';
import type { StorageBufferAttribute } from 'three/webgpu';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';

// TSL node types vary across @types/three versions; use loose types for stability.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

/**
 * Maximum total face-poke push per particle per frame (meters). Mirrors
 * `MAX_PUSH_DIST` in tslCollision.ts — a NaN-cascade / launch guard on the
 * accumulated total (CPU `facePokeCorrection` does not clamp).
 */
const MAX_PUSH_DIST = 0.05;

/**
 * Build the packed cloth-CSR Uint32Array consumed by `csrSBA`:
 *   [ offsets (numParticles+1) | list (numClothTriangles*3) | triIds (numClothTriangles*3) ]
 * Packing the three cloth-topology arrays into ONE storage buffer is what keeps
 * the correct kernel at ≤ 8 storage buffers (see the module header).
 */
export function packFacePokeCsr(
  offsets: Uint32Array,
  faces: Uint32Array,
  triangleIds: Uint32Array | number[],
  numParticles: number,
): Uint32Array {
  const listBase = numParticles + 1;
  const triIdsBase = listBase + faces.length;
  const out = new Uint32Array(triIdsBase + triangleIds.length);
  out.set(offsets, 0);
  out.set(faces, listBase);
  out.set(triangleIds instanceof Uint32Array ? triangleIds : Uint32Array.from(triangleIds), triIdsBase);
  return out;
}

/**
 * Build the interleaved body-geometry Float32Array consumed by `bodyGeomSBA`:
 * per BVH-leaf-ordered body triangle, 18 floats = [vert0..2 xyz (9)][pseudo0..2 xyz (9)].
 * Interleaving triVerts + vertexPseudonormals into ONE storage buffer saves a
 * bind slot. Both inputs are already BVH-leaf-ordered (from buildLinearBVH).
 */
export function packFacePokeBodyGeom(
  triVerts: Float32Array,
  vertexPseudonormals: Float32Array,
  numBodyTris: number,
): Float32Array {
  const out = new Float32Array(numBodyTris * 18);
  for (let t = 0; t < numBodyTris; t++) {
    const src = t * 9;
    const dst = t * 18;
    for (let k = 0; k < 9; k++) {
      out[dst + k] = triVerts[src + k];
      out[dst + 9 + k] = vertexPseudonormals[src + k];
    }
  }
  return out;
}

/**
 * Build the snapshot kernel: copy posBuf → facePokeSnapshotBuf over
 * numParticles. Dispatch BEFORE the correction kernel each frame (B1 fix).
 */
export function makeFacePokeSnapshotNode(
  posBuf: TslNode,
  snapshotSBA: StorageBufferAttribute,
  numParticles: number,
): ComputeNode {
  const snapBuf = storage(snapshotSBA, 'vec3', numParticles);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (Fn as any)(() => {
    snapBuf.element(instanceIndex).assign(posBuf.element(instanceIndex));
  })();
  return compute(fn, numParticles, [64]);
}

export interface FacePokeCorrectParams {
  /** Shared vec3 position storage node (written: posBuf += corr). */
  posBuf: TslNode;
  /** Shared vec3 previous-position node (written: prevPosBuf += corr, velocity-neutral). */
  prevPosBuf: TslNode;
  /** Shared float inverse-mass node (0 = pinned → skipped). */
  invMassBuf: TslNode;
  /** facePokeSnapshotSBA (vec3, numParticles) — immutable read source for face corners. */
  snapshotSBA: StorageBufferAttribute;
  /** Packed cloth CSR (uint): [offsets(N+1), list(numTri*3), triIds(numTri*3)]. See packFacePokeCsr. */
  csrSBA: StorageBufferAttribute;
  /** BVH nodes (float, numBvhNodes*8). */
  bvhNodesSBA: StorageBufferAttribute;
  /** BVH escape pointers (uint, numBvhNodes). */
  bvhSkipSBA: StorageBufferAttribute;
  /** Interleaved body geometry (float, numBodyTris*18): [verts 9][pseudo 9]. See packFacePokeBodyGeom. */
  bodyGeomSBA: StorageBufferAttribute;
  numParticles: number;
  /** Number of CLOTH triangles (sizes the CSR list/triIds regions). */
  numClothTriangles: number;
  /** Number of BVH nodes. */
  numBvhNodes: number;
  /** Number of BODY triangles. */
  numBodyTris: number;
  /** Body collision margin (meters). */
  margin: number;
}

/**
 * Build the correction kernel (single pass, ≤ 8 storage buffers via packed CSR
 * + interleaved body geometry). Per particle i: gather incident cloth faces,
 * traverse the body BVH per face, accumulate i's barycentric share of every
 * poking body vertex into `corr`, clamp, apply to pos + prevPos.
 *
 * The math mirrors `facePokeCorrection.ts` line-by-line.
 */
export function makeFacePokeCorrectNode(p: FacePokeCorrectParams): ComputeNode {
  const {
    posBuf,
    prevPosBuf,
    invMassBuf,
    numParticles,
    numClothTriangles,
    numBvhNodes,
    numBodyTris,
    margin,
  } = p;

  // ─── Wrap SBAs as TSL storage nodes (8 total incl. shared pos/prevPos/invMass) ──
  const snapBuf = storage(p.snapshotSBA, 'vec3', numParticles);
  const csrLen = numParticles + 1 + numClothTriangles * 3 * 2;
  const csrBuf = storage(p.csrSBA, 'uint', csrLen);
  const bvhBuf = storage(p.bvhNodesSBA, 'float', numBvhNodes * 8);
  const skipBuf = storage(p.bvhSkipSBA, 'uint', numBvhNodes);
  const bodyGeomBuf = storage(p.bodyGeomSBA, 'float', numBodyTris * 18);

  // Packed-CSR region bases (compile-time constants → u32 literals in-kernel).
  const listBase = numParticles + 1;
  const triIdsBase = listBase + numClothTriangles * 3;

  const uMargin = uniform(margin);
  // uBand: expande el AABB de la cara para el BVH query del cuerpo. 30mm
  // dejaba fuera los body-verts que asoman PROFUNDO (>30mm): el probe
  // @gpu-local 2026-07-02 midio 73/4254 deep-pokes agarrados a 30mm vs
  // 687/4582 a 120mm (9x). 60mm = compromiso cobertura/costo del walk; el
  // pase sigue gated OFF (GPU_CAPABILITIES.facePoke=false) hasta el rework A4
  // (respuesta dentro del substep loop, que arregla la reversion).
  const uBand = uniform(Math.max(margin, 0.06));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (Fn as any)(() => {
    const i = instanceIndex;
    const w = invMassBuf.element(i);

    If(w.greaterThan(float(0.0)), () => {
      const corr = vec3(0, 0, 0).toVar('fpCorr');

      // ── Incident-face loop (packed CSR: offsets region at [0..N]) ──
      const fStart = csrBuf.element(uint(i));
      const fEnd = csrBuf.element(uint(i).add(uint(1)));
      const fCount = fEnd.sub(fStart);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Loop({ start: uint(0), end: fCount, type: 'uint', condition: '<' }, ({ i: fk }: { i: any }) => {
        // list region at [listBase ..]; each entry is a cloth triangle index.
        const t = csrBuf.element(uint(listBase).add(fStart).add(fk));
        // triIds region at [triIdsBase ..]; 3 vertex ids per cloth triangle.
        const triBase = uint(triIdsBase).add(t.mul(uint(3)));
        const id0 = csrBuf.element(triBase).toVar('fpId0');
        const id1 = csrBuf.element(triBase.add(uint(1))).toVar('fpId1');
        const id2 = csrBuf.element(triBase.add(uint(2))).toVar('fpId2');

        // Face corners A,B,C from the SNAPSHOT (NOT live posBuf) — B1 fix.
        const A = snapBuf.element(id0);
        const B = snapBuf.element(id1);
        const C = snapBuf.element(id2);
        const ax = A.x.toVar('fpAx'); const ay = A.y.toVar('fpAy'); const az = A.z.toVar('fpAz');
        const bx = B.x.toVar('fpBx'); const by = B.y.toVar('fpBy'); const bz = B.z.toVar('fpBz');
        const cx = C.x.toVar('fpCx'); const cy = C.y.toVar('fpCy'); const cz = C.z.toVar('fpCz');

        const e1x = bx.sub(ax).toVar('fpE1x'); const e1y = by.sub(ay).toVar('fpE1y'); const e1z = bz.sub(az).toVar('fpE1z');
        const e2x = cx.sub(ax).toVar('fpE2x'); const e2y = cy.sub(ay).toVar('fpE2y'); const e2z = cz.sub(az).toVar('fpE2z');

        const d00 = e1x.mul(e1x).add(e1y.mul(e1y)).add(e1z.mul(e1z)).toVar('fpD00');
        const d01 = e1x.mul(e2x).add(e1y.mul(e2y)).add(e1z.mul(e2z)).toVar('fpD01');
        const d11 = e2x.mul(e2x).add(e2y.mul(e2y)).add(e2z.mul(e2z)).toVar('fpD11');
        const denom = d00.mul(d11).sub(d01.mul(d01)).toVar('fpDenom');

        If(denom.abs().greaterThan(float(1e-12)), () => {
          const rnx = e1y.mul(e2z).sub(e1z.mul(e2y));
          const rny = e1z.mul(e2x).sub(e1x.mul(e2z));
          const rnz = e1x.mul(e2y).sub(e1y.mul(e2x));
          const invNl = float(1.0).div(rnx.mul(rnx).add(rny.mul(rny)).add(rnz.mul(rnz)).sqrt().max(float(1e-20)));
          const nx = rnx.mul(invNl).toVar('fpNx');
          const ny = rny.mul(invNl).toVar('fpNy');
          const nz = rnz.mul(invNl).toVar('fpNz');

          const fminx = ax.min(bx).min(cx).toVar('fpMinX');
          const fmaxx = ax.max(bx).max(cx).toVar('fpMaxX');
          const fminy = ay.min(by).min(cy).toVar('fpMinY');
          const fmaxy = ay.max(by).max(cy).toVar('fpMaxY');
          const fminz = az.min(bz).min(cz).toVar('fpMinZ');
          const fmaxz = az.max(bz).max(cz).toVar('fpMaxZ');

          // ── Stackless BVH traversal (mirror of findBestNode) ──
          const nodeIdx = uint(0).toVar('fpNode');
          Loop(numBvhNodes, () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            If((nodeIdx as any).greaterThanEqual(uint(numBvhNodes)), () => { Break(); });

            const nodeBase = nodeIdx.mul(uint(8)).toVar('fpNB');
            const nMinX = bvhBuf.element(nodeBase);
            const nMinY = bvhBuf.element(nodeBase.add(uint(1)));
            const nMinZ = bvhBuf.element(nodeBase.add(uint(2)));
            const nMaxX = bvhBuf.element(nodeBase.add(uint(3)));
            const nMaxY = bvhBuf.element(nodeBase.add(uint(4)));
            const nMaxZ = bvhBuf.element(nodeBase.add(uint(5)));
            const triCnt = bvhBuf.element(nodeBase.add(uint(7)));

            If(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (fminx.sub(uBand) as any).lessThanEqual(nMaxX)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .and((fmaxx.add(uBand) as any).greaterThanEqual(nMinX))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .and((fminy.sub(uBand) as any).lessThanEqual(nMaxY))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .and((fmaxy.add(uBand) as any).greaterThanEqual(nMinY))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .and((fminz.sub(uBand) as any).lessThanEqual(nMaxZ))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .and((fmaxz.add(uBand) as any).greaterThanEqual(nMinZ)),
              () => {
                If(triCnt.greaterThan(float(0)), () => {
                  // All-uint leaf loop (no i32) — WGSL rejects `i32 + u32`, and a
                  // 'int'-typed loop counter mixing with an i32 cast triggered exactly
                  // that. triStart/cnt cast to uint; the counter and index math stay u32.
                  const triStart = uint(bvhBuf.element(nodeBase.add(uint(6))));
                  const cnt = uint(triCnt);

                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  Loop({ start: uint(0), end: cnt, type: 'uint', condition: '<' }, ({ i: ti }: { i: any }) => {
                    const bt = triStart.add(ti); // body triangle index (uint)

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    Loop({ start: uint(0), end: uint(3), type: 'uint', condition: '<' }, ({ i: lv }: { i: any }) => {
                      // Interleaved body geom: verts at [bt*18 + lv*3], pseudo at [bt*18 + 9 + lv*3].
                      const geomBase = bt.mul(uint(18)).add(lv.mul(uint(3)));
                      const px = bodyGeomBuf.element(geomBase);
                      const py = bodyGeomBuf.element(geomBase.add(uint(1)));
                      const pz = bodyGeomBuf.element(geomBase.add(uint(2)));
                      const pnBase = geomBase.add(uint(9));
                      const pnx = bodyGeomBuf.element(pnBase);
                      const pny = bodyGeomBuf.element(pnBase.add(uint(1)));
                      const pnz = bodyGeomBuf.element(pnBase.add(uint(2)));

                      const dotPn = nx.mul(pnx).add(ny.mul(pny)).add(nz.mul(pnz));
                      const flip = dotPn.lessThan(float(0.0));
                      const ox = select(flip, nx.negate(), nx);
                      const oy = select(flip, ny.negate(), ny);
                      const oz = select(flip, nz.negate(), nz);

                      const wpx = px.sub(ax); const wpy = py.sub(ay); const wpz = pz.sub(az);
                      const signed = wpx.mul(ox).add(wpy.mul(oy)).add(wpz.mul(oz));

                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      If(signed.greaterThan((uMargin as any).negate()), () => {
                        const d20 = wpx.mul(e1x).add(wpy.mul(e1y)).add(wpz.mul(e1z));
                        const d21 = wpx.mul(e2x).add(wpy.mul(e2y)).add(wpz.mul(e2z));
                        const beta = d11.mul(d20).sub(d01.mul(d21)).div(denom);
                        const gamma = d00.mul(d21).sub(d01.mul(d20)).div(denom);
                        const alpha = float(1.0).sub(beta).sub(gamma);

                        If(
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (alpha as any).greaterThanEqual(float(0.0))
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            .and((beta as any).greaterThanEqual(float(0.0)))
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            .and((gamma as any).greaterThanEqual(float(0.0))),
                          () => {
                            const depth = signed.add(uMargin); // > 0
                            const s = alpha.mul(alpha).add(beta.mul(beta)).add(gamma.mul(gamma));
                            If(s.greaterThan(float(0.0)), () => {
                              const alphaSelf = select(
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                (uint(i) as any).equal(id0),
                                alpha,
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                select((uint(i) as any).equal(id1), beta, gamma),
                              );
                              const k = alphaSelf.div(s).mul(depth);
                              corr.addAssign(vec3(ox, oy, oz).mul(k));
                            });
                          },
                        );
                      });
                    });
                  });

                  nodeIdx.assign(skipBuf.element(nodeIdx));
                }).Else(() => {
                  nodeIdx.assign(uint(bvhBuf.element(nodeBase.add(uint(6)))));
                });
              },
            ).Else(() => {
              nodeIdx.assign(skipBuf.element(nodeIdx));
            });
          });
        });
      });

      const corrLen = corr.length().toVar('fpLen');
      If(corrLen.greaterThan(float(0.0)), () => {
        If(corrLen.greaterThan(float(MAX_PUSH_DIST)), () => {
          corr.assign(corr.mul(float(MAX_PUSH_DIST).div(corrLen)));
        });
        posBuf.element(i).addAssign(corr);
        prevPosBuf.element(i).addAssign(corr);
      });
    });
  })();

  return compute(fn, numParticles, [64]);
}
