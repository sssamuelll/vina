/**
 * TSL Face-Poke — body-vertex-vs-cloth-face contact, Generate/Solve (A4).
 *
 * Vertex-vs-triangle body collision is structurally blind to a convex body
 * feature poking up *between* the 3 verts of a flat cloth face (all 3 outside
 * the body, yet the face interior is pierced). A4 closes that gap with the
 * unified-contact shape (plan drape-profesional §4 A4, redesigned after the
 * Halberg blocker — the v1 monolith ran ONCE per frame after the substep
 * loop, so the 15 substeps of constraints undid the tent every frame and the
 * pass cost ~13ms doing ~174k BVH walks):
 *
 *   Pass A (generate) — dispatched over CLOTH FACES (~÷3 walks vs
 *     per-particle), every-2-frames cadence, COLUMN query (±120mm along the
 *     normal — deep, to rescue seam-trapped cloth — ±30mm lateral) + alignment
 *     gate. Per face: body-BVH walk → keep the DEEPEST poking body soup-vert (thread-private
 *     strictly-greater keep-max in fixed BVH-leaf order → deterministic, ZERO
 *     atomics) → faceContactBuf[t] = soupIdx+1 (0 = none). The slot stores
 *     contact IDENTITY only; depth is recomputed fresh by Pass B.
 *
 *   Pass B (solve) — dispatched over PARTICLES, INSIDE the substep loop
 *     (after the body-collision pair, before postSolve). Per particle: gather
 *     incident faces (CSR), read the face's contact slot, recompute the
 *     projection against THIS substep's preCollisionPos corners (race-free
 *     snapshot — the B1 fix for free), apply my clamped barycentric share to
 *     posBuf[me] ONLY. No prevPos write (Halberg #2: postSolve derives
 *     velocity from preCollisionPos, so a push applied after the snapshot is
 *     velocity-excluded exactly like the body-collision push). Coefficients
 *     are CLAMPED to the triangle (ppf fold-in) instead of hard-rejected.
 *
 * Determinism (P4): Pass A is one thread per face with a private keep-max;
 * Pass B reads stable buffers (faceContactBuf, preCollisionPos) and
 * read-modify-writes only its own posBuf element. No atomics anywhere.
 *
 * Storage-buffer budget (WebGPU max 8/stage): generate binds 6
 * (pos, csr, bvhNodes, bvhSkip, bodyGeom, contact), solve binds 6
 * (pos, invMass, preCollision, csr, bodyGeom, contact).
 *
 * The per-contact math (sign convention, barycentric projection,
 * `(α/Σα²)·depth·n_outward` distribution) mirrors
 * `src/utils/cloth/facePokeCorrection.ts`; the oracle metric
 * (`facePokeMetric.ts`) shares the same convention on welded verts.
 *
 * GPU-only (A7 GPU-ahead divergence, like strain-limit / tether).
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
 * Maximum face-poke push per particle per SUBSTEP (meters). Mirrors
 * `MAX_PUSH_DIST` in tslCollision.ts — a NaN-cascade / launch guard.
 */
const MAX_PUSH_DIST = 0.05;

/**
 * Per-substep cap on the projected contact depth (meters) — the rescue RAMP.
 * Full-depth projection of a deep (up to 120mm) trapped contact is a hammer:
 * it fights the whole constraint system, oscillates, and balloons the cloth
 * (measured 2026-07-03: visible 30 -> 7856, fps 30 -> 11.5). 3mm/substep =
 * 45mm/frame climb: shallow margin-scale contacts resolve in ~3 substeps
 * (visually identical to full projection), a 120mm trapped region walks out
 * in ~3 frames, energy injection stays bounded.
 */
const RESCUE_STEP = 0.003;

/**
 * Pass A detection band ALONG the face normal (meters). Deep by design: the
 * violent settle (seam closure yanking cloth through the body -- plan
 * mechanism 2) sinks whole cloth regions >3cm inside the body within 1-2
 * frames, where the vertex-collision search radius (uAabbMargin = 3cm,
 * perf-cliff-calibrated) can no longer see them -- TRAPPED cloth is what the
 * chest patches are (measured 2026-07-03: A4-ON with a 30mm band killed 100%
 * of shallow pokes, residual visible pokes were ALL >30mm). The query box is
 * a COLUMN (+-BAND_DEEP along the normal, +-BAND_LAT laterally), not an
 * iso-expansion -- ~14x cheaper walk than iso-120mm.
 */
export const FACE_POKE_BAND_DEEP = 0.12;
export const FACE_POKE_BAND_LAT = 0.03;

/**
 * Alignment gate: a true poke (skin pushing through fabric that lies ON it)
 * has the face near-tangent to the skin -- |dot(faceNormal, vertPseudonormal)|
 * high. Oblique pairs are OPEN GEOMETRY (armhole gap, collar opening: a
 * deltoid vert 10cm from a bridging face) -- chasing them balloons the cloth.
 */
export const FACE_POKE_ALIGN_MIN = 0.5; // cos 60 deg

/**
 * Shallow-poke band (meters): contacts within this depth are the CLASSIC poke
 * (skin through fabric lying on it) and are always honored. Deep contacts
 * beyond it are TRAPPED-cloth rescues and are subject to the back-contact
 * veto below.
 */
export const FACE_POKE_SHALLOW = 0.03;

/**
 * Back-contact veto band (meters): a face with a DEEP front contact that ALSO
 * has body skin just BEHIND it (signed in (-BACK_VETO, -margin], projecting
 * inside the face) is STANDING OFF the body, not trapped inside it — the deep
 * pair is cross-geometry (e.g. a sleeve tube's outer face seeing the far side
 * of the arm through the tube: aligned, inside-projecting, ~100mm — measured
 * 2026-07-03: honoring those inflated the tube and slid the sleeve off,
 * 6379 -> 142 verts). A truly trapped face (cloth inside the chest) has NO
 * body surface behind it — the chest interior is hollow of surface verts.
 */
export const FACE_POKE_BACK_VETO = 0.06;

/**
 * ENGAGEMENT threshold: the pass responds ONLY to signed > 0 (body vert
 * OUTSIDE the cloth = an actual visible poke). The near band
 * (-margin, 0] is the healthy resting contact that the VERTEX collision
 * already enforces WITH friction (hybrid Coulomb, #902) — duplicating it
 * here as a pure normal push acts as a LUBRICANT: it re-lifts every resting
 * contact each substep, breaks the friction grip, and slides garments off
 * (measured 2026-07-03: sleeves 6382 -> 2851 by t=2.5s with a
 * signed > -margin response). Once engaged, the push targets -margin
 * (depth = signed + margin, ramped), then disengages.
 */

/** Pass A cadence in frames (dispatched when frameCounter % CADENCE === 0). */
export const FACE_POKE_GENERATE_CADENCE = 2;

/**
 * Build the packed cloth-CSR Uint32Array consumed by both passes:
 *   [ offsets (numParticles+1) | list (numClothTriangles*3) | triIds (numClothTriangles*3) ]
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
 * Build the interleaved body-geometry Float32Array:
 * per BVH-leaf-ordered body triangle, 18 floats = [vert0..2 xyz (9)][pseudo0..2 xyz (9)].
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

export interface FacePokeGenerateParams {
  /** Shared vec3 position storage node (read-only here — frame-start positions). */
  posBuf: TslNode;
  /** Packed cloth CSR (uint): [offsets(N+1), list(numTri*3), triIds(numTri*3)]. */
  csrSBA: StorageBufferAttribute;
  /** BVH nodes (float, numBvhNodes*8). */
  bvhNodesSBA: StorageBufferAttribute;
  /** BVH escape pointers (uint, numBvhNodes). */
  bvhSkipSBA: StorageBufferAttribute;
  /** Interleaved body geometry (float, numBodyTris*18). */
  bodyGeomSBA: StorageBufferAttribute;
  /** Per-face contact slot (uint, numClothTriangles): soupIdx+1, 0 = none. WRITTEN. */
  contactSBA: StorageBufferAttribute;
  numParticles: number;
  numClothTriangles: number;
  numBvhNodes: number;
  numBodyTris: number;
  /** Body collision margin (meters). */
  margin: number;
}

/**
 * Pass A — per cloth face, find the deepest poking body soup-vert and store
 * its identity. ALWAYS writes the slot (stale contacts from the previous
 * cadence tick are cleared even when the face has no contact now).
 */
export function makeFacePokeGenerateNode(p: FacePokeGenerateParams): ComputeNode {
  const { posBuf, numParticles, numClothTriangles, numBvhNodes, numBodyTris, margin } = p;

  const csrLen = numParticles + 1 + numClothTriangles * 3 * 2;
  const csrBuf = storage(p.csrSBA, 'uint', csrLen);
  const bvhBuf = storage(p.bvhNodesSBA, 'float', numBvhNodes * 8);
  const skipBuf = storage(p.bvhSkipSBA, 'uint', numBvhNodes);
  const bodyGeomBuf = storage(p.bodyGeomSBA, 'float', numBodyTris * 18);
  const contactBuf = storage(p.contactSBA, 'uint', numClothTriangles);

  const triIdsBase = numParticles + 1 + numClothTriangles * 3;
  const uMargin = uniform(margin);
  const uBandDeep = uniform(FACE_POKE_BAND_DEEP);
  const uBandLat = uniform(FACE_POKE_BAND_LAT);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (Fn as any)(() => {
    const t = instanceIndex;

    // best = deepest signed distance seen; bestIdx = soupIdx+1 (0 = none).
    const best = float(-1e30).toVar('fpBest');
    const bestIdx = uint(0).toVar('fpBestIdx');
    // Body skin just behind the face (back-contact veto — see FACE_POKE_BACK_VETO).
    const hasBack = float(0.0).toVar('fpHasBack');

    const triBase = uint(triIdsBase).add(t.mul(uint(3)));
    const id0 = csrBuf.element(triBase).toVar('fpId0');
    const id1 = csrBuf.element(triBase.add(uint(1))).toVar('fpId1');
    const id2 = csrBuf.element(triBase.add(uint(2))).toVar('fpId2');

    const A = posBuf.element(id0);
    const B = posBuf.element(id1);
    const C = posBuf.element(id2);
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

      // Column query box: face AABB + |n|*BAND_DEEP per axis (the poke lives
      // along the normal, both signs -- orientation is per-body-vert) + BAND_LAT
      // iso pad. Lateral acceptance is the barycentric-inside test; the box
      // just has to CONTAIN the accept volume for BVH descent.
      const ex = nx.abs().mul(uBandDeep).add(uBandLat).toVar('fpExpX');
      const ey = ny.abs().mul(uBandDeep).add(uBandLat).toVar('fpExpY');
      const ez = nz.abs().mul(uBandDeep).add(uBandLat).toVar('fpExpZ');
      const fminx = ax.min(bx).min(cx).sub(ex).toVar('fpMinX');
      const fmaxx = ax.max(bx).max(cx).add(ex).toVar('fpMaxX');
      const fminy = ay.min(by).min(cy).sub(ey).toVar('fpMinY');
      const fmaxy = ay.max(by).max(cy).add(ey).toVar('fpMaxY');
      const fminz = az.min(bz).min(cz).sub(ez).toVar('fpMinZ');
      const fmaxz = az.max(bz).max(cz).add(ez).toVar('fpMaxZ');

      // ── Stackless BVH traversal (mirror of findBestNode / v1 monolith) ──
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
          (fminx as any).lessThanEqual(nMaxX)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .and((fmaxx as any).greaterThanEqual(nMinX))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .and((fminy as any).lessThanEqual(nMaxY))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .and((fmaxy as any).greaterThanEqual(nMinY))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .and((fminz as any).lessThanEqual(nMaxZ))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .and((fmaxz as any).greaterThanEqual(nMinZ)),
          () => {
            If(triCnt.greaterThan(float(0)), () => {
              const triStart = uint(bvhBuf.element(nodeBase.add(uint(6))));
              const cnt = uint(triCnt);

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              Loop({ start: uint(0), end: cnt, type: 'uint', condition: '<' }, ({ i: ti }: { i: any }) => {
                const bt = triStart.add(ti); // body triangle index (uint)

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Loop({ start: uint(0), end: uint(3), type: 'uint', condition: '<' }, ({ i: lv }: { i: any }) => {
                  const geomBase = bt.mul(uint(18)).add(lv.mul(uint(3)));
                  const px = bodyGeomBuf.element(geomBase);
                  const py = bodyGeomBuf.element(geomBase.add(uint(1)));
                  const pz = bodyGeomBuf.element(geomBase.add(uint(2)));
                  const pnBase = geomBase.add(uint(9));
                  const pnx = bodyGeomBuf.element(pnBase);
                  const pny = bodyGeomBuf.element(pnBase.add(uint(1)));
                  const pnz = bodyGeomBuf.element(pnBase.add(uint(2)));

                  const dotPn = nx.mul(pnx).add(ny.mul(pny)).add(nz.mul(pnz)).toVar('fpDotPn');
                  const flip = dotPn.lessThan(float(0.0));
                  const ox = select(flip, nx.negate(), nx);
                  const oy = select(flip, ny.negate(), ny);
                  const oz = select(flip, nz.negate(), nz);

                  const wpx = px.sub(ax); const wpy = py.sub(ay); const wpz = pz.sub(az);
                  const signed = wpx.mul(ox).add(wpy.mul(oy)).add(wpz.mul(oz)).toVar('fpSigned');

                  // Candidate window: back-veto band through the deep front band.
                  If(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (signed as any).greaterThan(float(-FACE_POKE_BACK_VETO))
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      .and((signed as any).lessThanEqual(uBandDeep))
                      // alignment gate: skip open-geometry pairs (see FACE_POKE_ALIGN_MIN)
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      .and((dotPn.abs() as any).greaterThan(float(FACE_POKE_ALIGN_MIN))),
                    () => {
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
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          If((signed as any).lessThanEqual((uMargin as any).negate()), () => {
                            hasBack.assign(float(1.0)); // skin just behind the face
                          // Engagement: only ACTUAL pokes (signed > 0) — resting
                          // contacts in (-margin, 0] belong to the vertex
                          // collision (friction). See the threshold doc above.
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          }).ElseIf((signed as any).greaterThan(float(0.0))
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            .and((signed as any).greaterThan(best)), () => {
                            best.assign(signed);
                            bestIdx.assign(bt.mul(uint(3)).add(lv).add(uint(1)));
                          });
                        },
                      );
                    },
                  );
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

    // Back-contact veto: a DEEP winner on a face with skin right behind it is
    // cross-geometry, not trapped cloth (see FACE_POKE_BACK_VETO). Shallow
    // winners (classic pokes through resting fabric) are always honored.
    If(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (best as any).greaterThan(float(FACE_POKE_SHALLOW)).and(hasBack.greaterThan(float(0.5))),
      () => {
        bestIdx.assign(uint(0));
      },
    );

    // Unconditional slot write: clears stale contacts on faces that lost theirs.
    contactBuf.element(t).assign(bestIdx);
  })();

  return compute(fn, numClothTriangles, [64]);
}

export interface FacePokeSolveParams {
  /** Shared vec3 position storage node (read-modify-write of OWN element only). */
  posBuf: TslNode;
  /** Shared vec3 previous-position node (read-only — friction decomposition). */
  prevPosBuf: TslNode;
  /** Shared float inverse-mass node (0 = pinned → skipped). */
  invMassBuf: TslNode;
  /** preCollisionPos SBA (vec3, numParticles) — THIS substep's pre-collision snapshot. */
  preCollisionSBA: StorageBufferAttribute;
  /** Packed cloth CSR (uint). */
  csrSBA: StorageBufferAttribute;
  /** Interleaved body geometry (float, numBodyTris*18). */
  bodyGeomSBA: StorageBufferAttribute;
  /** Per-face contact slot (uint, numClothTriangles) — read-only here. */
  contactSBA: StorageBufferAttribute;
  numParticles: number;
  numClothTriangles: number;
  numBodyTris: number;
  /** Body collision margin (meters). */
  margin: number;
  /** Body friction coefficient (0-1) — same value the vertex collision got. */
  friction: number;
}

/**
 * Pass B — per particle, gather my incident faces' contacts and push MYSELF
 * along the outward face normal by my clamped barycentric share of the depth,
 * recomputed fresh against this substep's preCollisionPos corners. After the
 * push, hybrid-Coulomb position friction (mirror of tslCollision applyPush /
 * #902) with the aggregate push direction as the contact normal — a pure
 * normal push with NO friction lubricates resting garments off (measured:
 * sleeves 6382 -> 3909 by 2.5s pre-friction).
 */
export function makeFacePokeSolveNode(p: FacePokeSolveParams): ComputeNode {
  const { posBuf, prevPosBuf, invMassBuf, numParticles, numClothTriangles, numBodyTris, margin, friction } = p;

  const preColBuf = storage(p.preCollisionSBA, 'vec3', numParticles);
  const csrLen = numParticles + 1 + numClothTriangles * 3 * 2;
  const csrBuf = storage(p.csrSBA, 'uint', csrLen);
  const bodyGeomBuf = storage(p.bodyGeomSBA, 'float', numBodyTris * 18);
  const contactBuf = storage(p.contactSBA, 'uint', numClothTriangles);

  const listBase = numParticles + 1;
  const triIdsBase = listBase + numClothTriangles * 3;
  const uMargin = uniform(margin);
  const uFriction = uniform(friction);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (Fn as any)(() => {
    const i = instanceIndex;
    const w = invMassBuf.element(i);

    If(w.greaterThan(float(0.0)), () => {
      const corr = vec3(0, 0, 0).toVar('fpCorr');

      const fStart = csrBuf.element(uint(i));
      const fEnd = csrBuf.element(uint(i).add(uint(1)));
      const fCount = fEnd.sub(fStart);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Loop({ start: uint(0), end: fCount, type: 'uint', condition: '<' }, ({ i: fk }: { i: any }) => {
        const t = csrBuf.element(uint(listBase).add(fStart).add(fk)).toVar('fpT');
        const slot = contactBuf.element(t).toVar('fpSlot');

        If(slot.greaterThan(uint(0)), () => {
          const soup = slot.sub(uint(1));
          const bt = soup.div(uint(3));
          const lv = soup.sub(bt.mul(uint(3)));
          const geomBase = bt.mul(uint(18)).add(lv.mul(uint(3)));
          const px = bodyGeomBuf.element(geomBase).toVar('fpPx');
          const py = bodyGeomBuf.element(geomBase.add(uint(1))).toVar('fpPy');
          const pz = bodyGeomBuf.element(geomBase.add(uint(2))).toVar('fpPz');
          const pnBase = geomBase.add(uint(9));
          const pnx = bodyGeomBuf.element(pnBase);
          const pny = bodyGeomBuf.element(pnBase.add(uint(1)));
          const pnz = bodyGeomBuf.element(pnBase.add(uint(2)));

          const triBase = uint(triIdsBase).add(t.mul(uint(3)));
          const id0 = csrBuf.element(triBase).toVar('fpId0');
          const id1 = csrBuf.element(triBase.add(uint(1))).toVar('fpId1');
          const id2 = csrBuf.element(triBase.add(uint(2))).toVar('fpId2');

          // Corners from THIS substep's pre-collision snapshot (race-free).
          const A = preColBuf.element(id0);
          const B = preColBuf.element(id1);
          const C = preColBuf.element(id2);
          const ax = A.x.toVar('fpAx'); const ay = A.y.toVar('fpAy'); const az = A.z.toVar('fpAz');
          const e1x = B.x.sub(ax).toVar('fpE1x'); const e1y = B.y.sub(ay).toVar('fpE1y'); const e1z = B.z.sub(az).toVar('fpE1z');
          const e2x = C.x.sub(ax).toVar('fpE2x'); const e2y = C.y.sub(ay).toVar('fpE2y'); const e2z = C.z.sub(az).toVar('fpE2z');

          const d00 = e1x.mul(e1x).add(e1y.mul(e1y)).add(e1z.mul(e1z)).toVar('fpD00');
          const d01 = e1x.mul(e2x).add(e1y.mul(e2y)).add(e1z.mul(e2z)).toVar('fpD01');
          const d11 = e2x.mul(e2x).add(e2y.mul(e2y)).add(e2z.mul(e2z)).toVar('fpD11');
          const denom = d00.mul(d11).sub(d01.mul(d01)).toVar('fpDenom');

          If(denom.abs().greaterThan(float(1e-12)), () => {
            const rnx = e1y.mul(e2z).sub(e1z.mul(e2y));
            const rny = e1z.mul(e2x).sub(e1x.mul(e2z));
            const rnz = e1x.mul(e2y).sub(e1y.mul(e2x));
            const invNl = float(1.0).div(rnx.mul(rnx).add(rny.mul(rny)).add(rnz.mul(rnz)).sqrt().max(float(1e-20)));
            const nx = rnx.mul(invNl);
            const ny = rny.mul(invNl);
            const nz = rnz.mul(invNl);

            const dotPn = nx.mul(pnx).add(ny.mul(pny)).add(nz.mul(pnz)).toVar('fpDotPn');
            const flip = dotPn.lessThan(float(0.0));
            const ox = select(flip, nx.negate(), nx).toVar('fpOx');
            const oy = select(flip, ny.negate(), ny).toVar('fpOy');
            const oz = select(flip, nz.negate(), nz).toVar('fpOz');

            const wpx = px.sub(ax); const wpy = py.sub(ay); const wpz = pz.sub(az);
            const signed = wpx.mul(ox).add(wpy.mul(oy)).add(wpz.mul(oz)).toVar('fpSigned');

            // Same alignment gate as Pass A (recomputed fresh -- the face may
            // have rotated since generation). Engage only while the body vert
            // is still OUTSIDE the cloth (signed > 0) -- resting contacts are
            // the vertex collision's job (friction). See the threshold doc.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            If((signed as any).greaterThan(float(0.0))
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .and((dotPn.abs() as any).greaterThan(float(FACE_POKE_ALIGN_MIN))), () => {
              const depth = signed.add(uMargin).min(float(RESCUE_STEP)); // > 0, ramped (see RESCUE_STEP)
              const d20 = wpx.mul(e1x).add(wpy.mul(e1y)).add(wpz.mul(e1z));
              const d21 = wpx.mul(e2x).add(wpy.mul(e2y)).add(wpz.mul(e2z));
              const beta = d11.mul(d20).sub(d01.mul(d21)).div(denom);
              const gamma = d00.mul(d21).sub(d01.mul(d20)).div(denom);
              const alpha = float(1.0).sub(beta).sub(gamma);

              // ppf fold-in: clamp coefficients to the triangle and renormalize
              // (the cloth moved since Pass A picked this contact — a hard
              // reject would drop the response exactly when the face slides).
              const ac = alpha.max(float(0.0)).toVar('fpAc');
              const bc = beta.max(float(0.0)).toVar('fpBc');
              const gc = gamma.max(float(0.0)).toVar('fpGc');
              const sum = ac.add(bc).add(gc).toVar('fpSum');

              If(sum.greaterThan(float(1e-9)), () => {
                const an = ac.div(sum);
                const bn = bc.div(sum);
                const gn = gc.div(sum);
                const s = an.mul(an).add(bn.mul(bn)).add(gn.mul(gn));
                const alphaSelf = select(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (uint(i) as any).equal(id0),
                  an,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  select((uint(i) as any).equal(id1), bn, gn),
                );
                const k = alphaSelf.div(s.max(float(1e-9))).mul(depth);
                corr.addAssign(vec3(ox, oy, oz).mul(k));
              });
            });
          });
        });
      });

      const corrLen = corr.length().toVar('fpLen');
      If(corrLen.greaterThan(float(0.0)), () => {
        If(corrLen.greaterThan(float(MAX_PUSH_DIST)), () => {
          corr.assign(corr.mul(float(MAX_PUSH_DIST).div(corrLen)));
          corrLen.assign(float(MAX_PUSH_DIST));
        });
        posBuf.element(i).addAssign(corr);

        // Hybrid Coulomb friction with stiction — mirror of tslCollision
        // applyPush (#902), with the aggregate push direction as the contact
        // normal and |corr| as the push depth. scale in [friction, 1].
        If(uFriction.greaterThan(float(0)), () => {
          const nnx = corr.x.div(corrLen).toVar('fpNnx');
          const nny = corr.y.div(corrLen).toVar('fpNny');
          const nnz = corr.z.div(corrLen).toVar('fpNnz');

          const dx = posBuf.element(i).x.sub(prevPosBuf.element(i).x);
          const dy = posBuf.element(i).y.sub(prevPosBuf.element(i).y);
          const dz = posBuf.element(i).z.sub(prevPosBuf.element(i).z);

          const vn = dx.mul(nnx).add(dy.mul(nny)).add(dz.mul(nnz));
          const tx = dx.sub(vn.mul(nnx));
          const ty = dy.sub(vn.mul(nny));
          const tz = dz.sub(vn.mul(nnz));

          const tLen = tx.mul(tx).add(ty.mul(ty)).add(tz.mul(tz)).sqrt();
          const scale = uFriction.mul(corrLen).div(tLen.max(float(1e-8))).max(uFriction).min(float(1.0));

          posBuf.element(i).x.subAssign(tx.mul(scale));
          posBuf.element(i).y.subAssign(ty.mul(scale));
          posBuf.element(i).z.subAssign(tz.mul(scale));
        });
      });
    });
  })();

  return compute(fn, numParticles, [64]);
}
