/**
 * Las escenas del banco de la tela nueva (spec 2026-10-13 §4.4): el disco Cusick, la tira en voladizo y
 * la lámina del cilindro. No dependen del motor: el banco las corre con el de hoy y con el nuevo.
 */
import { mallaDeContorno, type MallaDeTela } from '../malla';
import type { Obstaculo } from '../obstaculos';
import type { OpcionesSistema } from '../sistema';
import type { TelaFisica } from '../tela';
import type { CollisionMeshData } from '../../collisionMesh';

/**
 * Tela de laboratorio con números redondos, para las pruebas y las escenas públicas. No es una tela
 * medida: las medidas viven en la referencia privada del banco. La fricción es la del jersey de algodón de la
 * biblioteca (physicalFabric.ts, `cotton-jersey`).
 */
export const TELA_DE_LABORATORIO: TelaFisica = {
  gramaje: 200, grosor: 0.5, kTrama: 300, kUrdimbre: 600, kCizalla: 50, pandeo: 1, bTrama: 2, bUrdimbre: 5, bBies: 3, friccionCuerpo: 0.4, friccionTela: 0.45,
};

/** Ensayo Cusick (ISO 9073-9): disco de 30 cm sobre pedestal de 18 cm, 5 mm por encima de la tapa. */
export const CUSICK = { radioDisco: 0.15, radioPedestal: 0.09, tapa: 0.5, alturaInicial: 0.505 } as const;

/** Una escena: la malla, lo que toca y la dirección del hilo en el dibujo (por defecto, vertical). */
export interface Escena {
  malla: MallaDeTela;
  obstaculos: Obstaculo[];
  hilo?: readonly [number, number];
  /** los puntos y bisagras de costura de una prenda (sistema.ts, OpcionesSistema) */
  costuras?: OpcionesSistema['costuras'];
  /** la franja del margen (prenda.ts, franjaDePrenda) */
  franja?: Uint8Array;
  /** velocidades iniciales (m/s), 3 por vértice */
  v?: Float64Array;
}

export function circulo(radioMm: number, lados: number): Array<[number, number]> {
  return Array.from({ length: lados }, (_, i): [number, number] => {
    const a = (2 * Math.PI * i) / lados;
    return [radioMm * Math.cos(a), radioMm * Math.sin(a)];
  });
}

export function rectangulo(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/** El disco Cusick con malla de `aristaMm`; con otro radio sirve de escena grande para medir velocidad. */
export function escenaCusick(aristaMm: number, radioMm = 150): Escena {
  return {
    malla: mallaDeContorno(circulo(radioMm, Math.max(96, Math.round(radioMm / 3))), aristaMm, CUSICK.alturaInicial),
    obstaculos: [{ tipo: 'pedestal', radio: CUSICK.radioPedestal, tapa: CUSICK.tapa }],
  };
}

/**
 * Tira de 25 mm de ancho a lo largo de x, empotrada en x ≤ 0 (5 mm de empotramiento) y con `voladoMm` en
 * el aire. Con 'urdimbre' el hilo corre a lo largo de la tira; con 'trama', a lo ancho.
 */
export function escenaVoladizo(voladoMm: number, hilo: 'urdimbre' | 'trama', aristaMm: number): Escena {
  const malla = mallaDeContorno(
    [[-5, -12.5], [0, -12.5], [voladoMm, -12.5], [voladoMm, 12.5], [0, 12.5], [-5, 12.5]],
    aristaMm,
    0,
    [[[0, -12.5], [0, 12.5]]],
  );
  const n = malla.x.length / 3;
  malla.fijos = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (malla.x[3 * i] <= 1e-6) malla.fijos[i] = 1;
  return { malla, obstaculos: [], hilo: hilo === 'urdimbre' ? [1, 0] : [0, 1] };
}

/** Lámina de 120 × 120 mm, para curvarla sobre un cilindro. */
export function laminaPlana(aristaMm: number): MallaDeTela {
  return mallaDeContorno(rectangulo(-60, -60, 60, 60), aristaMm);
}

type V3 = [number, number, number];
const resta = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punto = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unitario = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Una malla de cuerpo: triángulos sueltos y la normal unitaria de cada cara, vuelta hacia `afuera(centro de la cara)`. */
function mallaDeCuerpo(v: V3[], caras: number[][], afuera: (centro: V3) => V3): CollisionMeshData {
  const vertices = new Float32Array(9 * caras.length), normals = new Float32Array(3 * caras.length);
  caras.forEach((cara, k) => {
    const a = v[cara[0]];
    let b = v[cara[1]], c = v[cara[2]];
    let n = cruz(resta(b, a), resta(c, a));
    const centro: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (punto(n, afuera(centro)) < 0) {
      [b, c] = [c, b];
      n = [-n[0], -n[1], -n[2]];
    }
    [a, b, c].forEach((p, j) => p.forEach((q, d) => (vertices[9 * k + 3 * j + d] = q)));
    const u = unitario(n);
    for (let d = 0; d < 3; d++) normals[3 * k + d] = u[d];
  });
  return { vertices, normals, triCount: caras.length };
}

/** Esfera de `radio` (m) centrada en el origen: un icosaedro subdividido `subdivisiones` veces. */
export function esferaDeColision(radio: number, subdivisiones: number): CollisionMeshData {
  const t = (1 + Math.sqrt(5)) / 2;
  const v: V3[] = ([
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ] as V3[]).map(unitario);
  let caras = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let s = 0; s < subdivisiones; s++) {
    const medios = new Map<number, number>();
    const medio = (a: number, b: number) => {
      const clave = a < b ? a * 1e6 + b : b * 1e6 + a;
      let i = medios.get(clave);
      if (i === undefined) {
        i = v.length;
        v.push(unitario([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]));
        medios.set(clave, i);
      }
      return i;
    };
    caras = caras.flatMap(([a, b, c]) => {
      const ab = medio(a, b), bc = medio(b, c), ca = medio(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }
  return mallaDeCuerpo(v.map((p) => [p[0] * radio, p[1] * radio, p[2] * radio] as V3), caras, (c) => c);
}

/** Un cuadrado de `lado` (m) centrado en el origen, perpendicular a `normal` y con la cara hacia ella. */
export function planoDeColision(normal: readonly [number, number, number], lado: number): CollisionMeshData {
  const n = unitario([normal[0], normal[1], normal[2]]);
  const ref: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = unitario(resta(ref, [n[0] * punto(ref, n), n[1] * punto(ref, n), n[2] * punto(ref, n)]));
  const e2 = cruz(n, e1), h = lado / 2;
  const v = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([a, b]): V3 => [a * e1[0] + b * e2[0], a * e1[1] + b * e2[1], a * e1[2] + b * e2[2]]);
  return mallaDeCuerpo(v, [[0, 1, 2], [0, 2, 3]], () => n);
}

/** Pirámide de base cuadrada de `base` (m) sobre y = 0, con la punta en (0, altura, 0). */
export function piramideDeColision(base: number, altura: number): CollisionMeshData {
  const h = base / 2;
  const v: V3[] = [[-h, 0, -h], [h, 0, -h], [h, 0, h], [-h, 0, h], [0, altura, 0]];
  const centro: V3 = [0, altura / 4, 0];
  return mallaDeCuerpo(v, [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [0, 1, 2], [0, 2, 3]], (c) => resta(c, centro));
}
