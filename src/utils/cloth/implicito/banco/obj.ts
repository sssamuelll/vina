/**
 * Leer un OBJ para el banco (spec 2026-10-13 §4.4.2): la referencia privada guarda así su colocación inicial, su prenda
 * asentada y su avatar. Las caras de más de tres lados se parten en abanico; los grupos son los de `usemtl`, `g` u `o`.
 */
import type { CollisionMeshData } from '../../collisionMesh';
import type { MallaDeTela } from '../malla';

export interface Obj {
  /** posiciones, 3 por vértice, en las unidades del archivo */
  v: Float64Array;
  /** coordenadas de textura, 2 por entrada */
  vt: Float64Array;
  /** 3 índices de `v` por triángulo */
  tris: Uint32Array;
  /** 3 índices de `vt` por triángulo; los de `v` si la cara no trae textura */
  trisT: Uint32Array;
  /** los triángulos de cada grupo, en el orden del archivo */
  grupos: Array<{ nombre: string; t0: number; nt: number }>;
}

export function leerObj(texto: string): Obj {
  const v: number[] = [], vt: number[] = [], tris: number[] = [], trisT: number[] = [];
  const grupos: Obj['grupos'] = [];
  const empezar = (nombre: string) => {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.nt === 0) ultimo.nombre = nombre;
    else grupos.push({ nombre, t0: tris.length / 3, nt: 0 });
  };
  for (const linea of texto.split('\n')) {
    const p = linea.trim().split(/\s+/);
    if (p[0] === 'v') v.push(+p[1], +p[2], +p[3]);
    else if (p[0] === 'vt') vt.push(+p[1], +p[2]);
    else if (p[0] === 'usemtl' || p[0] === 'g' || p[0] === 'o') empezar(p.slice(1).join(' '));
    else if (p[0] === 'f') {
      if (grupos.length === 0) empezar('');
      const esquinas = p.slice(1).map((s) => s.split('/').map((q) => parseInt(q, 10) - 1));
      for (let k = 1; k + 1 < esquinas.length; k++) {
        for (const e of [esquinas[0], esquinas[k], esquinas[k + 1]]) {
          tris.push(e[0]);
          trisT.push(e[1] === undefined || Number.isNaN(e[1]) ? e[0] : e[1]);
        }
        grupos[grupos.length - 1].nt++;
      }
    }
  }
  return { v: Float64Array.from(v), vt: Float64Array.from(vt), tris: Uint32Array.from(tris), trisT: Uint32Array.from(trisT), grupos };
}

/** Los triángulos de los grupos pedidos (todos con `null`). */
function triangulosDe(obj: Obj, grupos: readonly string[] | null): number[] {
  const ts: number[] = [];
  for (const g of obj.grupos) if (grupos === null || grupos.includes(g.nombre)) for (let t = g.t0; t < g.t0 + g.nt; t++) ts.push(t);
  return ts;
}

/**
 * Los grupos pedidos como cuerpo rígido, escalados (`escala` m por unidad del archivo). La normal de cada cara sale
 * del sentido de sus vértices; si el volumen con signo de todo el cuerpo da negativo, las caras venían al revés y se
 * dan vuelta todas.
 */
export function cuerpoDeObj(obj: Obj, grupos: readonly string[] | null, escala: number): CollisionMeshData {
  const ts = triangulosDe(obj, grupos);
  const vertices = new Float32Array(9 * ts.length), normals = new Float32Array(3 * ts.length);
  let volumen = 0;
  ts.forEach((t, k) => {
    const p = [0, 1, 2].map((j) => [0, 1, 2].map((d) => obj.v[3 * obj.tris[3 * t + j] + d] * escala));
    volumen += p[0][0] * (p[1][1] * p[2][2] - p[1][2] * p[2][1]) - p[0][1] * (p[1][0] * p[2][2] - p[1][2] * p[2][0]) + p[0][2] * (p[1][0] * p[2][1] - p[1][1] * p[2][0]);
    p.forEach((q, j) => q.forEach((c, d) => (vertices[9 * k + 3 * j + d] = c)));
  });
  const alReves = volumen < 0;
  for (let k = 0; k < ts.length; k++) {
    const o = 9 * k;
    if (alReves) {
      for (let d = 0; d < 3; d++) [vertices[o + 3 + d], vertices[o + 6 + d]] = [vertices[o + 6 + d], vertices[o + 3 + d]];
    }
    const ux = vertices[o + 3] - vertices[o], uy = vertices[o + 4] - vertices[o + 1], uz = vertices[o + 5] - vertices[o + 2];
    const wx = vertices[o + 6] - vertices[o], wy = vertices[o + 7] - vertices[o + 1], wz = vertices[o + 8] - vertices[o + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz) || 1;
    normals[3 * k] = nx / l;
    normals[3 * k + 1] = ny / l;
    normals[3 * k + 2] = nz / l;
  }
  return { vertices, normals, triCount: ts.length };
}

/**
 * Una prenda de un OBJ como malla de tela, para medirla igual que la de Vina: las posiciones escaladas (`escala` m por
 * unidad) y el patrón de sus coordenadas de textura (`mmPorVt` mm por unidad de textura). Supone una coordenada de
 * textura por vértice, como los OBJ de la referencia.
 */
export function mallaDeObj(obj: Obj, escala: number, mmPorVt: number): MallaDeTela {
  const nt = obj.tris.length / 3, n = obj.v.length / 3;
  const x = Float64Array.from(obj.v, (q) => q * escala), patron = new Float64Array(2 * n);
  for (let k = 0; k < 3 * nt; k++) {
    const i = obj.tris[k], j = obj.trisT[k];
    patron[2 * i] = (obj.vt[2 * j] * mmPorVt) / 1000;
    patron[2 * i + 1] = (obj.vt[2 * j + 1] * mmPorVt) / 1000;
  }
  return { x, patron, tris: Uint32Array.from(obj.tris) };
}
