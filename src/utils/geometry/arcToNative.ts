import type { PathCommand, Point2D } from '../../types/types';
import { gaussLegendreCubicBezierLength, gaussLegendreQuadBezierLength } from './arcLength';

/**
 * Pasos de bisección. Fijos y no un `while` con epsilon a propósito: un bucle
 * acotado no puede colgar el lienzo, y 2^-50 está muchos órdenes por debajo
 * del micrón sobre cualquier curva de un patrón.
 */
const BISECTION_STEPS = 50;

const lerpAt = (a: Point2D, b: Point2D, t: number): Point2D =>
  ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** La sub-cúbica [0, t], por De Casteljau. */
function cubicUpTo(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number) {
  const a = lerpAt(p0, p1, t), b = lerpAt(p1, p2, t), c = lerpAt(p2, p3, t);
  const d = lerpAt(a, b, t), e = lerpAt(b, c, t);
  return { p1: a, p2: d, p3: lerpAt(d, e, t) };
}

/** La sub-cuadrática [0, t], por De Casteljau. */
function quadUpTo(p0: Point2D, p1: Point2D, p2: Point2D, t: number) {
  const a = lerpAt(p0, p1, t), b = lerpAt(p1, p2, t);
  return { p1: a, p2: lerpAt(a, b, t) };
}

/** Invierte una longitud de arco por bisección sobre [0,1]. */
function invertir(objetivo: number, arcoHasta: (t: number) => number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (arcoHasta(mid) < objetivo) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Fracción de ARCO dentro de un comando → parámetro nativo de De Casteljau.
 *
 * Existe porque el repo tiene las dos parametrizaciones y no son la misma
 * sobre una curva. `outlineRing` habla siempre en fracción de arco (así lo
 * fijó la tanda 2a); `splitSegmentAt` —a donde llega la herramienta de Punto
 * vía `addPointOnSegment`— corta por De Casteljau, o sea en parámetro nativo.
 * Pasar uno por el otro pone el punto en el sitio equivocado sobre cualquier
 * curva, y en ninguno sobre una recta: invisible en un rectángulo de prueba,
 * visible en una sisa.
 *
 * Sobre `L` / `M` / `Z` los dos números son el mismo y se devuelve tal cual.
 * Sobre `C` / `Q` se invierte por bisección con la MISMA cuadratura que usa el
 * anillo, para que el redondeo coincida con `outlineRing` en vez de
 * contradecirlo.
 *
 * `tArc` fuera de [0,1] se clampea. Un comando degenerado (longitud 0)
 * devuelve `tArc` sin tocar: no hay nada que invertir.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md § 3.2
 */
export function arcToNativeT(command: PathCommand, start: Point2D, tArc: number): number {
  // El clampeo va ANTES de la salida rápida de las rectas, no después: el
  // contrato dice "fuera de [0,1] se clampea" para todo comando, y sobre una
  // `L` el que extrapolaría es `splitSegmentAt`, que partiría fuera del
  // segmento. Tenerlo solo en la rama de curva era prometer una cosa y
  // cumplirla en la mitad de los casos.
  if (tArc <= 0) return 0;
  if (tArc >= 1) return 1;
  if (command.type !== 'C' && command.type !== 'Q') return tArc;

  if (command.type === 'C') {
    const [c1x, c1y, c2x, c2y, ex, ey] = command.values;
    const p0 = start, p1 = { x: c1x, y: c1y }, p2 = { x: c2x, y: c2y }, p3 = { x: ex, y: ey };
    const total = gaussLegendreCubicBezierLength(p0, p1, p2, p3);
    if (total <= 0) return tArc;
    return invertir(total * tArc, (t) => {
      const s = cubicUpTo(p0, p1, p2, p3, t);
      return gaussLegendreCubicBezierLength(p0, s.p1, s.p2, s.p3);
    });
  }

  const [cx, cy, ex, ey] = command.values;
  const p0 = start, p1 = { x: cx, y: cy }, p2 = { x: ex, y: ey };
  const total = gaussLegendreQuadBezierLength(p0, p1, p2);
  if (total <= 0) return tArc;
  return invertir(total * tArc, (t) => {
    const s = quadUpTo(p0, p1, p2, t);
    return gaussLegendreQuadBezierLength(p0, s.p1, s.p2);
  });
}
