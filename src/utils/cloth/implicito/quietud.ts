/**
 * El medidor de quietud (spec 2026-10-13 §4.2.4): cuánto se movió la tela en el último cuadro, frente a
 * un cuadro de caída libre. Se mide por velocidad y no por fuerza: en la GPU, la fuerza de una tela en
 * reposo no baja del ruido de la precisión simple. La GPU lo calcula igual (gpu/wgsl.ts, `aplicar`).
 */
import type { SistemaTela } from './sistema';

export interface Quietud {
  /** Σ m·|v| de los vértices libres / Σ m·g·h */
  total: number;
  /** el mayor |v| / (g·h) de un vértice libre */
  maximo: number;
  /** el vértice de ese máximo (−1 si no hay libres) */
  vertice: number;
}

export function medirQuietud(s: SistemaTela): Quietud {
  const gh = Math.abs(s.aj.gravedad) * s.aj.h;
  let mv = 0, peso = 0, maximo = 0, vertice = -1;
  for (let i = 0; i < s.n; i++) {
    if (s.fijo[i]) continue;
    const v = Math.hypot(s.v[3 * i], s.v[3 * i + 1], s.v[3 * i + 2]);
    mv += s.masa[i] * v;
    peso += s.masa[i] * gh;
    if (vertice < 0 || v / gh > maximo) {
      maximo = v / gh;
      vertice = i;
    }
  }
  return { total: peso > 0 ? mv / peso : 0, maximo, vertice };
}

/** Cuenta cuadros quietos seguidos: la tela está quieta cuando lleva `cuadros` bajo el `umbral`. */
export class VigiaDeQuietud {
  private seguidos = 0;

  constructor(readonly umbral = 1e-3, readonly cuadros = 30) {}

  registrar(total: number): boolean {
    this.seguidos = total < this.umbral ? this.seguidos + 1 : 0;
    return this.seguidos >= this.cuadros;
  }
}
