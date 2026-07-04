/**
 * Sewn-range helpers — the "cuánto de la curva se cose" surface.
 *
 * A seam half stores an optional parametric sub-range `tStart`/`tEnd`
 * (0–1, arc-length fractions over the edge — `parameterizeEdge` builds t
 * from cumulative arc length). UI and copilot tools speak PERCENT (0–100,
 * CLO3D-style seam extents); these helpers are the single percent↔t
 * boundary so panel and tools cannot drift.
 *
 * Convention (per Seam type + solver filter): a FULL range is stored as
 * `undefined`/`undefined`, never as 0/1 — full-range seams carry no
 * redundant fields. For a reversed B half, t (and therefore the percent
 * range) is measured along the SEWING direction: the filter in
 * `buildSeamConstraints`/`seamPairs` runs after `parameterizeEdge`
 * inverts t.
 */

/** The sub-range fields of one seam half (`Seam.pieceA` / `Seam.pieceB`). */
export interface SeamHalfRange {
  tStart?: number;
  tEnd?: number;
}

/**
 * Espejo de un rango t al invertir la dirección de recorrido del edge:
 * [s, e] → [1−e, 1−s].
 *
 * LA convención (header de este archivo): el rango almacenado del half B se
 * interpreta en dirección de COSIDO — el filtro corre DESPUÉS de que
 * `parameterizeEdge` invierte t con `reversed`. Quien ESCRIBA `reversed`
 * sobre un half con rango parcial debe espejar el rango almacenado con este
 * helper, o el solver cose la mitad física EQUIVOCADA (bug 2026-07-04: las
 * dos medias costuras de la sisa reclamaban la misma mitad del cap y la
 * otra quedaba desnuda — esquinas de 9-13cm). Único definidor del espejo:
 * worldRefine (siembra IA) y cualquier toggle humano (Ctrl+B, v2 nombrado)
 * deben pasar por aquí.
 */
export function mirrorPctRange(r: [number, number]): [number, number] {
  return [1 - r[1], 1 - r[0]];
}

/**
 * Clamp a percent pair to integers in [0, 100] with start < end.
 * When the edit makes the pair invalid, the OTHER bound is pushed
 * (never returns an invalid or empty range).
 */
export function clampPctRange(
  startPct: number,
  endPct: number,
  edited: 'start' | 'end',
): [number, number] {
  let s = Math.round(Math.min(100, Math.max(0, startPct)));
  let e = Math.round(Math.min(100, Math.max(0, endPct)));
  if (s >= e) {
    if (edited === 'start') {
      s = Math.min(s, 99);
      e = s + 1;
    } else {
      e = Math.max(e, 1);
      s = e - 1;
    }
  }
  return [s, e];
}

/**
 * Return a copy of a seam half with the given percent range applied as
 * `tStart`/`tEnd` fractions. The full range (0–100) REMOVES the fields —
 * including legacy explicit 0/1 pairs. All other fields (pieceId,
 * edgeName, reversed) are preserved.
 */
export function applyPctRange<
  H extends { pieceId: string; edgeName: string; tStart?: number; tEnd?: number },
>(
  half: H,
  startPct: number,
  endPct: number,
): H {
  const next = { ...half };
  delete next.tStart;
  delete next.tEnd;
  if (startPct <= 0 && endPct >= 100) return next;
  return { ...next, tStart: startPct / 100, tEnd: endPct / 100 };
}

/** Seam-half t fields → percent pair for display. Absent fields → [0, 100]. */
export function tRangeToPct(half: SeamHalfRange): [number, number] {
  return [
    Math.round((half.tStart ?? 0) * 100),
    Math.round((half.tEnd ?? 1) * 100),
  ];
}

/**
 * Sewn arc length in mm: edge arc length × sewn fraction. Exact because t
 * is arc-length parameterized. `undefined` when the edge length is unknown
 * (legacy "edge-N" halves without a SemanticEdge).
 */
export function sewnLengthMm(
  edgeLengthMm: number | undefined,
  half: SeamHalfRange,
): number | undefined {
  if (edgeLengthMm == null || !Number.isFinite(edgeLengthMm)) return undefined;
  return edgeLengthMm * ((half.tEnd ?? 1) - (half.tStart ?? 0));
}

/**
 * Renormaliza el parámetro t de los vértices FILTRADOS al [0,1] del sub-rango
 * cosido (paridad CLO3D, follow-up nombrado del sew-range 2026-07-04):
 * `matchVertices` empareja por t ABSOLUTO, así que sin renormalizar un rango
 * asimétrico (A[0.2,0.8] ↔ B completo) no se stretch-mapea — cose la
 * intersección porcentual y abanica los vértices fuera de rango sobre el
 * vértice frontera (fruncido espurio). Con renormalización: el sub-tramo de
 * cada mitad se mapea proporcionalmente contra el de la otra. Rangos IGUALES
 * o anidados producen el mismo emparejamiento que antes (mismo orden
 * relativo) — cero regresión del caso que ya funcionaba. Rango degenerado →
 * t=0.5 uniforme (matchVertices colapsa al mismo punto, sin NaN).
 *
 * Vive aquí (frontera pura) porque las DOS mitades del espejo la consumen:
 * seamAssembly.ts (CPU/WASM) y seamPairs.ts (GPU) — deben divergir jamás.
 */
export function renormalizeFilteredT<V extends { t: number }>(
  verts: V[],
  t0: number,
  t1: number,
): V[] {
  const span = t1 - t0;
  if (span <= 1e-9) return verts.map((v) => ({ ...v, t: 0.5 }));
  return verts.map((v) => ({ ...v, t: (v.t - t0) / span }));
}
