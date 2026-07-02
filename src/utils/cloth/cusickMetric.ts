/**
 * Núcleo matemático del gate Cusick virtual (B2, plan drape profesional
 * 2026-07-02) — ISO 9073-9: disco de 30 cm drapeado sobre pedestal de 18 cm.
 *
 * DC = (As − π·r_support²) / (π·r_specimen² − π·r_support²) × 100
 * donde As = área de la silueta proyectada (plano XZ; up-axis = Y) encerrada
 * por el hem. Convención ISO: DC alto = rígido, DC bajo = fluido. NO confundir
 * con `PhysicalFabric.drapeCoefficient` (semántica invertida, hallazgo W7 —
 * ese campo se migra en Fase 4, no aquí).
 *
 * fold count = máximos locales de r(θ) suavizado del hem proyectado (el "node
 * count" del ensayo Cusick físico).
 *
 * Funciones puras sobre typed arrays: corren igual sobre el readback GPU
 * (@gpu-local) y sobre el tier WASM en CI. Consumidor: tests/e2e del gate
 * (harness B2) — ver el plan padre.
 */

export interface CusickOptions {
  /** Radio del pedestal en metros (ISO: 18 cm de diámetro → 0.09). */
  supportRadius: number;
  /** Radio del espécimen en metros (ISO: 30 cm de diámetro → 0.15). */
  specimenRadius: number;
}

export interface FoldOptions {
  /**
   * Prominencia radial mínima (m) para que un máximo local cuente como
   * pliegue: r_max − r_medio > minProminence. Filtra ruido de float/malla.
   */
  minProminence?: number;
  /** Ventana del suavizado circular (impar). Default: ~n/64, mínimo 3. */
  smoothWindow?: number;
}

/**
 * Extrae el loop de boundary ORDENADO de una malla triangular (aristas que
 * pertenecen a exactamente 1 triángulo). Si hay varios loops (agujeros),
 * devuelve el más largo — en el disco Cusick, el hem exterior. Arranque
 * determinista: el índice de vértice más bajo del loop.
 */
export function extractOrderedBoundaryLoop(triangles: Uint32Array): Uint32Array {
  // Cuenta de aristas → boundary = las que aparecen 1 vez.
  const edgeCount = new Map<string, [number, number]>();
  const seen = new Map<string, number>();
  for (let t = 0; t < triangles.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = triangles[t + e];
      const b = triangles[t + ((e + 1) % 3)];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
      edgeCount.set(key, [a, b]);
    }
  }

  // Adyacencia vértice → vecinos boundary.
  const neighbors = new Map<number, number[]>();
  for (const [key, [a, b]] of edgeCount) {
    if (seen.get(key) !== 1) continue;
    (neighbors.get(a) ?? neighbors.set(a, []).get(a)!).push(b);
    (neighbors.get(b) ?? neighbors.set(b, []).get(b)!).push(a);
  }
  if (neighbors.size === 0) return new Uint32Array(0);

  // Camina cada loop una vez; quédate con el más largo.
  const visited = new Set<number>();
  let best: number[] = [];
  const starts = Array.from(neighbors.keys()).sort((x, y) => x - y);
  for (const start of starts) {
    if (visited.has(start)) continue;
    const loop: number[] = [start];
    visited.add(start);
    let prev = -1;
    let curr = start;
    for (;;) {
      const nexts = (neighbors.get(curr) ?? []).filter((v) => v !== prev);
      // Determinismo: ante bifurcación (malla no-manifold), el índice menor.
      const next = nexts.length > 0 ? Math.min(...nexts) : -1;
      if (next === -1 || next === start) break;
      if (visited.has(next)) break; // no-manifold: corta en vez de ciclar
      loop.push(next);
      visited.add(next);
      prev = curr;
      curr = next;
    }
    if (loop.length > best.length) best = loop;
  }
  return Uint32Array.from(best);
}

/**
 * Drape coefficient % (ISO 9073-9) de la silueta proyectada al plano XZ.
 * Shoelace sobre el polígono del hem — orientación-independiente (|área|).
 */
export function computeDrapeCoefficient(
  positions: Float32Array,
  loop: Uint32Array,
  opts: CusickOptions,
): number {
  const n = loop.length;
  if (n < 3) return NaN;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    const ax = positions[a * 3];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3];
    const bz = positions[b * 3 + 2];
    area2 += ax * bz - bx * az;
  }
  const As = Math.abs(area2) / 2;
  const supportArea = Math.PI * opts.supportRadius * opts.supportRadius;
  const specimenArea = Math.PI * opts.specimenRadius * opts.specimenRadius;
  return ((As - supportArea) / (specimenArea - supportArea)) * 100;
}

/**
 * Cuenta de pliegues (node count Cusick): máximos locales de r(θ) del hem
 * proyectado, tras suavizado circular por media móvil. El suavizado y el
 * conteo son circulares → invariantes al punto de arranque del loop.
 */
export function countFolds(
  positions: Float32Array,
  loop: Uint32Array,
  opts: FoldOptions = {},
): number {
  const n = loop.length;
  if (n < 8) return 0;
  const minProminence = opts.minProminence ?? 0.002; // 2 mm

  // Centro = centroide del hem proyectado (el eje del pedestal en la práctica).
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += positions[loop[i] * 3];
    cz += positions[loop[i] * 3 + 2];
  }
  cx /= n;
  cz /= n;

  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const dx = positions[loop[i] * 3] - cx;
    const dz = positions[loop[i] * 3 + 2] - cz;
    r[i] = Math.hypot(dx, dz);
  }

  // Media móvil circular.
  let window = opts.smoothWindow ?? Math.max(3, Math.round(n / 64));
  if (window % 2 === 0) window++;
  const half = (window - 1) / 2;
  const smooth = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -half; k <= half; k++) {
      acc += r[(i + k + n) % n];
    }
    smooth[i] = acc / window;
  }

  let mean = 0;
  for (let i = 0; i < n; i++) mean += smooth[i];
  mean /= n;

  let folds = 0;
  for (let i = 0; i < n; i++) {
    const prev = smooth[(i - 1 + n) % n];
    const next = smooth[(i + 1) % n];
    if (smooth[i] > prev && smooth[i] > next && smooth[i] - mean > minProminence) {
      folds++;
    }
  }
  return folds;
}
