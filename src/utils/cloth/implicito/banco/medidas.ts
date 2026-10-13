/**
 * Lo que mide el banco sobre unas posiciones, sin importar qué motor las produjo (spec 2026-10-13 §2 y
 * §4.4).
 */
import { computeDrapeCoefficient, countFolds, extractOrderedBoundaryLoop } from '../../cusickMetric';
import type { MallaDeTela } from '../malla';
import { CUSICK } from './escenas';

/** Porcentaje de triángulos con menos de la mitad del área de su patrón. */
export function aplastados(x: ArrayLike<number>, malla: MallaDeTela): number {
  const { tris, patron } = malla, nt = tris.length / 3;
  let bajo = 0;
  for (let t = 0; t < nt; t++) {
    const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
    const A0 = 0.5 * Math.abs(
      (patron[2 * b] - patron[2 * a]) * (patron[2 * c + 1] - patron[2 * a + 1]) -
        (patron[2 * c] - patron[2 * a]) * (patron[2 * b + 1] - patron[2 * a + 1]),
    );
    const ab = [0, 1, 2].map((d) => x[3 * b + d] - x[3 * a + d]);
    const ac = [0, 1, 2].map((d) => x[3 * c + d] - x[3 * a + d]);
    const A = 0.5 * Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
    if (A < 0.5 * A0) bajo++;
  }
  return (100 * bajo) / nt;
}

/** Coeficiente de caída (ISO 9073-9, %) y ondas del disco Cusick. */
export function caidaCusick(x: ArrayLike<number>, malla: MallaDeTela): { coeficiente: number; ondas: number } {
  const p = Float32Array.from(x);
  const lazo = extractOrderedBoundaryLoop(malla.tris);
  return {
    coeficiente: computeDrapeCoefficient(p, lazo, { supportRadius: CUSICK.radioPedestal, specimenRadius: CUSICK.radioDisco }),
    ondas: countFolds(p, lazo),
  };
}

/** La punta de la tira: el promedio de los vértices de su borde libre (en el patrón, x = voladizo). */
export function puntaDelVoladizo(x: ArrayLike<number>, malla: MallaDeTela, voladoM: number): { x: number; y: number } {
  let sx = 0, sy = 0, k = 0;
  for (let i = 0; i < malla.patron.length / 2; i++) {
    if (malla.patron[2 * i] < voladoM - 1e-6) continue;
    sx += x[3 * i];
    sy += x[3 * i + 1];
    k++;
  }
  return { x: sx / k, y: sy / k };
}

/**
 * Ensayo de Peirce: el ángulo (grados) de la cuerda que va del borde del empotramiento a la punta, y la
 * longitud de flexión c = L·(cos(θ/2) / (8·tan θ))^(1/3), en m.
 */
export function peirce(punta: { x: number; y: number }, voladoM: number, alturaDelBorde = 0): { angulo: number; longitudDeFlexion: number } {
  const th = Math.atan2(alturaDelBorde - punta.y, punta.x);
  return { angulo: (th * 180) / Math.PI, longitudDeFlexion: voladoM * Math.cbrt(Math.cos(th / 2) / (8 * Math.tan(th))) };
}
