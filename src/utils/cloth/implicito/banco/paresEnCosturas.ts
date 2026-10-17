/**
 * Diagnóstico del banco: por costura, los pares del contacto propio activos junto a sus puntos abiertos, por clase:
 * banda (un lado de la costura contra el otro, a `anillos` anillos de sus puntos), otra (contra el resto de la tela) y
 * cuerpo (un vértice del cuerpo contra la tela). Se llama con los pares armados en las posiciones que se miden.
 */
import type { SistemaTela } from '../sistema';

export interface ParesEnCostura {
  costura: string;
  abiertos: number;
  maxima: number;
  banda: number;
  otra: number;
  cuerpo: number;
  /** cuánto están dentro de su separación los pares activos de cada clase, sumado (m) */
  p0banda: number;
  p0otra: number;
  p0cuerpo: number;
}

export function paresEnCosturas(s: SistemaTela, piezaDe: (v: number) => string, umbral = 1e-3, anillos = 2): ParesEnCostura[] {
  const vecinos: Set<number>[] = Array.from({ length: s.n }, () => new Set());
  for (let t = 0; t < s.tris.length; t += 3) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) vecinos[s.tris[t + i]].add(s.tris[t + j]);
  }
  const anillo = (vs: number[]) => {
    const dentro = new Set(vs);
    let borde = vs;
    for (let r = 0; r < anillos; r++) {
      const sig: number[] = [];
      for (const v of borde) for (const w of vecinos[v]) if (!dentro.has(w)) { dentro.add(w); sig.push(w); }
      borde = sig;
    }
    return dentro;
  };
  const paresDe: number[][] = Array.from({ length: s.n }, () => []);
  s.paresPropios.forEach((p, i) => { for (const v of p.v) paresDe[v].push(i); });
  const porCostura = new Map<string, ParesEnCostura>();
  const d = [0, 0, 0];
  for (let k = 0; k < s.costuras.n; k++) {
    const [a, b0, b1] = s.costuras.vertices(k);
    const costura = `${piezaDe(a)} + ${piezaDe(b0)}`;
    let f = porCostura.get(costura);
    if (!f) porCostura.set(costura, (f = { costura, abiertos: 0, maxima: 0, banda: 0, otra: 0, cuerpo: 0, p0banda: 0, p0otra: 0, p0cuerpo: 0 }));
    s.costuras.separacion(k, s.x, d);
    const g = Math.hypot(d[0], d[1], d[2]);
    f.maxima = Math.max(f.maxima, g);
    if (g <= umbral) continue;
    f.abiertos++;
    const A = anillo([a]), B = anillo([b0, b1]);
    const vistos = new Set<number>();
    for (const v of A) for (const i of paresDe[v]) vistos.add(i);
    for (const v of B) for (const i of paresDe[v]) vistos.add(i);
    for (const i of vistos) {
      const p = s.paresPropios[i];
      if (!(p.p0 > 0)) continue;
      if (p.v.length === 3) {
        f.cuerpo++;
        f.p0cuerpo += p.p0;
        continue;
      }
      const [q, ...t] = p.v;
      if ((A.has(q) && t.some((w) => B.has(w))) || (B.has(q) && t.some((w) => A.has(w)))) {
        f.banda++;
        f.p0banda += p.p0;
      } else {
        f.otra++;
        f.p0otra += p.p0;
      }
    }
  }
  return [...porCostura.values()].sort((p, q) => q.maxima - p.maxima);
}

/** El punto más abierto de cada costura: dónde cae en ella y los pares activos que tocan sus tres vértices. */
export interface PeorPunto {
  costura: string;
  /** posición en la costura, de 0 a 1 */
  t: number;
  separacion: number;
  /** E8: si el punto se puede coser y si ya está cosido */
  soldable: boolean;
  cosido: boolean;
  pares: Array<{ sobre: 'a' | 'b'; vertice: string; cara: string; anillos: number | null; p0: number; alineado: number }>;
}

export function peoresPuntos(s: SistemaTela, piezaDe: (v: number) => string): PeorPunto[] {
  const vecinos: Set<number>[] = Array.from({ length: s.n }, () => new Set());
  for (let t = 0; t < s.tris.length; t += 3) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) vecinos[s.tris[t + i]].add(s.tris[t + j]);
  }
  const distancia = (v: number, objetivo: Set<number>, tope = 8): number | null => {
    const visto = new Set([v]);
    let borde = [v];
    for (let r = 0; r <= tope; r++) {
      if (borde.some((w) => objetivo.has(w))) return r;
      const sig: number[] = [];
      for (const w of borde) for (const u of vecinos[w]) if (!visto.has(u)) { visto.add(u); sig.push(u); }
      borde = sig;
    }
    return null;
  };
  const paresDe: number[][] = Array.from({ length: s.n }, () => []);
  s.paresPropios.forEach((p, i) => { for (const v of p.v) paresDe[v].push(i); });
  const tramos: Array<{ costura: string; desde: number; hasta: number }> = [];
  for (let k = 0; k < s.costuras.n; k++) {
    const [a, b0] = s.costuras.vertices(k);
    const costura = `${piezaDe(a)} + ${piezaDe(b0)}`;
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.costura === costura && ultimo.hasta === k) ultimo.hasta = k + 1;
    else tramos.push({ costura, desde: k, hasta: k + 1 });
  }
  const d = [0, 0, 0];
  return tramos.map(({ costura, desde, hasta }) => {
    let peor = desde, g = -1;
    for (let k = desde; k < hasta; k++) {
      s.costuras.separacion(k, s.x, d);
      const gk = Math.hypot(d[0], d[1], d[2]);
      if (gk > g) { g = gk; peor = k; }
    }
    s.costuras.separacion(peor, s.x, d);
    const [a, b0, b1] = s.costuras.vertices(peor);
    const pares: PeorPunto['pares'] = [];
    for (const [sobre, vs] of [['a', [a]], ['b', [b0, b1]]] as const) {
      const vistos = new Set<number>();
      for (const v of vs) for (const i of paresDe[v]) vistos.add(i);
      for (const i of vistos) {
        const p = s.paresPropios[i];
        if (!(p.p0 > 0)) continue;
        const q = p.v.length === 4 ? p.v[0] : -1, cara = p.v.length === 4 ? p.v.slice(1) : p.v;
        pares.push({
          sobre,
          vertice: q >= 0 ? piezaDe(q) : 'cuerpo',
          cara: piezaDe(cara[0]),
          anillos: q >= 0 ? distancia(q, new Set(cara)) : null,
          p0: p.p0,
          alineado: g > 0 ? Math.abs(p.nx * d[0] + p.ny * d[1] + p.nz * d[2]) / g : 0,
        });
      }
    }
    const soldable = s.costuras.soldable[peor] === 1, cosido = s.costuras.cosido[peor] === 1;
    return { costura, t: (peor - desde) / Math.max(1, hasta - desde - 1), separacion: g, soldable, cosido, pares };
  });
}
