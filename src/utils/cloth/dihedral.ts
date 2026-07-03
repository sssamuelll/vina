/**
 * P1 — matemática dihedral compartida (spec 2026-07-02-dihedral-bend-design.md §4).
 *
 * UNA función es la verdad del ángulo: el extractor de rest-angles
 * (gpuBuffers.extractBendConstraints) y el kernel CPU (xpbdSolver) la llaman
 * directo; Rust (lib.rs solve_bend) y TSL (tslSolver) la transcriben línea a
 * línea — si esto cambia, los tres tiers cambian juntos o la paridad se rompe.
 *
 * Fuentes (borrow-map re-verificado 2026-07-02): gradientes de
 * PositionBasedDynamics::solve_DihedralConstraint (MIT, Bridson/Müller-2007,
 * la división por |n|² baka 1/(2·área) en los gradientes) + ángulo por
 * atan2(sinθ, cosθ) de Tissu BendingConstraint.cpp (Apache-2.0) — gradiente
 * estable cerca de plano, donde acos(dot) explota y donde vive el drape.
 *
 * CONVENCIÓN: FLAT = φ = 0, signo del pliegue por (n̂1×n̂2)·ê (mountain/valley).
 * El extractor viejo daba flat=π — los dos MUNDOS no se mezclan (BUG-1 al
 * revés); por eso extractor+kernels aterrizan en un solo PR (unidad atómica).
 *
 * GUARDS load-bearing, no higiene (upstream NO los tiene; con one-sided
 * stretch los slivers son más probables): elen², |n|², denom.
 */

const EPS_EDGE_SQ = 1e-12; // |e|² mínimo (elen < 1e-6 m)
const EPS_NORMAL_SQ = 1e-12; // |n|² mínimo (área² ~ 1e-12)

/**
 * Ángulo dihedral SIGNED del quad [a,b,c,d] (arista a-b, alas c,d).
 * Devuelve null en configuraciones degeneradas (jamás NaN, jamás π-fallback).
 */
export function dihedralAngle(
  pos: Float32Array,
  a: number,
  b: number,
  c: number,
  d: number,
): number | null {
  const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
  const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
  const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];
  const dx = pos[d * 3], dy = pos[d * 3 + 1], dz = pos[d * 3 + 2];

  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const elenSq = ex * ex + ey * ey + ez * ez;
  if (elenSq < EPS_EDGE_SQ) return null;
  const elen = Math.sqrt(elenSq);

  // n1 = (a−c)×(b−c), n2 = (b−d)×(a−d) — sin escalar (solo dirección aquí).
  const acx = ax - cx, acy = ay - cy, acz = az - cz;
  const bcx = bx - cx, bcy = by - cy, bcz = bz - cz;
  let n1x = acy * bcz - acz * bcy;
  let n1y = acz * bcx - acx * bcz;
  let n1z = acx * bcy - acy * bcx;

  const bdx = bx - dx, bdy = by - dy, bdz = bz - dz;
  const adx = ax - dx, ady = ay - dy, adz = az - dz;
  let n2x = bdy * adz - bdz * ady;
  let n2y = bdz * adx - bdx * adz;
  let n2z = bdx * ady - bdy * adx;

  const n1sq = n1x * n1x + n1y * n1y + n1z * n1z;
  const n2sq = n2x * n2x + n2y * n2y + n2z * n2z;
  if (n1sq < EPS_NORMAL_SQ || n2sq < EPS_NORMAL_SQ) return null;

  const inv1 = 1 / Math.sqrt(n1sq);
  const inv2 = 1 / Math.sqrt(n2sq);
  n1x *= inv1; n1y *= inv1; n1z *= inv1;
  n2x *= inv2; n2y *= inv2; n2z *= inv2;

  const cosT = Math.max(-1, Math.min(1, n1x * n2x + n1y * n2y + n1z * n2z));
  // sinθ con signo: ((n̂1×n̂2)·e)/|e| — paralelo a e por construcción (Tissu).
  const crx = n1y * n2z - n1z * n2y;
  const cry = n1z * n2x - n1x * n2z;
  const crz = n1x * n2y - n1y * n2x;
  const sinT = (crx * ex + cry * ey + crz * ez) / elen;
  return Math.atan2(sinT, cosT);
}

/**
 * Proyección XPBD del constraint dihedral C = φ − φ* sobre el quad [a,b,c,d].
 * Muta `pos` in-place. `alphaTilde` = compliance/sdt² YA precomputado (la
 * conversión vive en cada tier, como en stretch). Sin acumulación de λ
 * cross-iteración (patrón single-iteration-per-substep de los 3 tiers).
 *
 * Gradientes de PBD solve_DihedralConstraint (la división de n por |n|² baka
 * el factor 1/(2·área) — modos de Bridson); ángulo por atan2 (ver arriba).
 */
export function solveDihedralQuad(
  pos: Float32Array,
  invMass: Float32Array,
  a: number,
  b: number,
  c: number,
  d: number,
  restAngle: number,
  alphaTilde: number,
): void {
  const wa = invMass[a], wb = invMass[b], wc = invMass[c], wd = invMass[d];
  if (wa + wb + wc + wd === 0) return;

  const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
  const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
  const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];
  const dx = pos[d * 3], dy = pos[d * 3 + 1], dz = pos[d * 3 + 2];

  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const elenSq = ex * ex + ey * ey + ez * ez;
  if (elenSq < EPS_EDGE_SQ) return;
  const elen = Math.sqrt(elenSq);
  const invElen = 1 / elen;

  // n1, n2 divididos por |n|² (gradiente PBD: dirección normal / 2·área).
  const acx = ax - cx, acy = ay - cy, acz = az - cz;
  const bcx = bx - cx, bcy = by - cy, bcz = bz - cz;
  let n1x = acy * bcz - acz * bcy;
  let n1y = acz * bcx - acx * bcz;
  let n1z = acx * bcy - acy * bcx;

  const bdx = bx - dx, bdy = by - dy, bdz = bz - dz;
  const adx = ax - dx, ady = ay - dy, adz = az - dz;
  let n2x = bdy * adz - bdz * ady;
  let n2y = bdz * adx - bdx * adz;
  let n2z = bdx * ady - bdy * adx;

  const n1sq = n1x * n1x + n1y * n1y + n1z * n1z;
  const n2sq = n2x * n2x + n2y * n2y + n2z * n2z;
  if (n1sq < EPS_NORMAL_SQ || n2sq < EPS_NORMAL_SQ) return;

  // Ángulo con normales UNITARIAS (antes de re-escalar para gradientes).
  const inv1 = 1 / Math.sqrt(n1sq);
  const inv2 = 1 / Math.sqrt(n2sq);
  const u1x = n1x * inv1, u1y = n1y * inv1, u1z = n1z * inv1;
  const u2x = n2x * inv2, u2y = n2y * inv2, u2z = n2z * inv2;
  const cosT = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y + u1z * u2z));
  const crx = u1y * u2z - u1z * u2y;
  const cry = u1z * u2x - u1x * u2z;
  const crz = u1x * u2y - u1y * u2x;
  const sinT = (crx * ex + cry * ey + crz * ez) * invElen;
  const phi = Math.atan2(sinT, cosT);

  // Gradientes con n/|n|² (PBD).
  n1x /= n1sq; n1y /= n1sq; n1z /= n1sq;
  n2x /= n2sq; n2y /= n2sq; n2z /= n2sq;

  // d_c = |e|·n1 ; d_d = |e|·n2
  const dcx = elen * n1x, dcy = elen * n1y, dcz = elen * n1z;
  const ddx = elen * n2x, ddy = elen * n2y, ddz = elen * n2z;
  // d_a = ((c−b)·e)/|e|·n1 + ((d−b)·e)/|e|·n2
  const cbDotE = ((cx - bx) * ex + (cy - by) * ey + (cz - bz) * ez) * invElen;
  const dbDotE = ((dx - bx) * ex + (dy - by) * ey + (dz - bz) * ez) * invElen;
  const dax = cbDotE * n1x + dbDotE * n2x;
  const day = cbDotE * n1y + dbDotE * n2y;
  const daz = cbDotE * n1z + dbDotE * n2z;
  // d_b = ((a−c)·e)/|e|·n1 + ((a−d)·e)/|e|·n2
  const acDotE = ((ax - cx) * ex + (ay - cy) * ey + (az - cz) * ez) * invElen;
  const adDotE = ((ax - dx) * ex + (ay - dy) * ey + (az - dz) * ez) * invElen;
  const dbx = acDotE * n1x + adDotE * n2x;
  const dby = acDotE * n1y + adDotE * n2y;
  const dbz = acDotE * n1z + adDotE * n2z;

  const denom =
    wa * (dax * dax + day * day + daz * daz) +
    wb * (dbx * dbx + dby * dby + dbz * dbz) +
    wc * (dcx * dcx + dcy * dcy + dcz * dcz) +
    wd * (ddx * ddx + ddy * ddy + ddz * ddz) +
    alphaTilde;
  if (denom <= EPS_NORMAL_SQ) return;

  const lambda = (phi - restAngle) / denom;

  // Δpᵢ = +wᵢ·λ·dᵢ — OJO signo: PBD upstream usa acos (φ sin signo) y luego
  // flippea λ cuando (n1×n2)·e > 0; con φ SIGNED por atan2 ese flip queda
  // absorbido y la corrección es +, no − (verificado a mano con el quad
  // canónico contra el paso de PBD, y pinneado por los tests de proyección
  // en ambas direcciones de pliegue).
  pos[a * 3] += wa * lambda * dax;
  pos[a * 3 + 1] += wa * lambda * day;
  pos[a * 3 + 2] += wa * lambda * daz;
  pos[b * 3] += wb * lambda * dbx;
  pos[b * 3 + 1] += wb * lambda * dby;
  pos[b * 3 + 2] += wb * lambda * dbz;
  pos[c * 3] += wc * lambda * dcx;
  pos[c * 3 + 1] += wc * lambda * dcy;
  pos[c * 3 + 2] += wc * lambda * dcz;
  pos[d * 3] += wd * lambda * ddx;
  pos[d * 3 + 1] += wd * lambda * ddy;
  pos[d * 3 + 2] += wd * lambda * ddz;
}
