/**
 * Las escenas del banco de la tela nueva (spec 2026-10-13 §4.4): el disco Cusick, la tira en voladizo y
 * la lámina del cilindro. No dependen del motor: el banco las corre con el de hoy y con el nuevo.
 */
import { buildLinearBVH } from '../../gpu/bvh';
import { puntosDeCostura } from '../costuras';
import { CuerpoRigido } from '../cuerpo';
import { mallaDeContorno, type MallaDeTela } from '../malla';
import type { Obstaculo } from '../obstaculos';
import type { OpcionesSistema } from '../sistema';
import { armarPrenda, bisagrasDePrenda, franjaDePrenda } from '../prenda';
import { separacion, telaSI, type TelaFisica } from '../tela';
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

/** Una lámina de 100 mm apoyada en el suelo, 0,2 mm dentro de su separación y corriendo a 5 cm/s: plano con fricción desde el primer cuadro. */
export function escenaApoyada(): Escena {
  const malla = mallaDeContorno(rectangulo(-50, -50, 50, 50), 10, separacion(telaSI(TELA_DE_LABORATORIO)) - 0.0002);
  return { malla, obstaculos: [{ tipo: 'plano', altura: 0 }], v: Float64Array.from(malla.x, (_, k) => (k % 3 === 0 ? 0.05 : 0)) };
}

/** Los vértices del borde x = x0 del dibujo, de abajo hacia arriba, corridos v0. */
export function bordeDelDibujo(m: MallaDeTela, x0: number, v0 = 0): number[] {
  const n = m.x.length / 3, vs: number[] = [];
  for (let i = 0; i < n; i++) if (Math.abs(m.patron[2 * i] - x0) < 1e-9) vs.push(i);
  return vs.sort((i, j) => m.patron[2 * i + 1] - m.patron[2 * j + 1]).map((i) => i + v0);
}

/**
 * Dos piezas de 100 × 60 mm, A con malla de 5 mm y B de 7 (los lados de la costura no coinciden), B a `abiertaMm` de A,
 * cosidas por los bordes de enfrente, con su franja de margen y sus bisagras de costura. Con 0 mm la costura cierra en
 * el primer cuadro y la flexión la cruza desde el segundo; `pliegueGrados` dobla B sobre la línea de la costura, para
 * que la bisagra tenga qué enderezar.
 */
export function escenaCostura(abiertaMm: number, pliegueGrados = 0): Escena {
  const A = mallaDeContorno(rectangulo(0, 0, 100, 60), 5), B = mallaDeContorno(rectangulo(0, 0, 100, 60), 7);
  const a = (pliegueGrados * Math.PI) / 180, borde = 0.1 + abiertaMm / 1000;
  const xB = Float64Array.from(B.x);
  for (let i = 0; i < xB.length / 3; i++) {
    const r = B.x[3 * i];
    xB[3 * i] = borde + r * Math.cos(a);
    xB[3 * i + 1] = B.x[3 * i + 1] + r * Math.sin(a);
  }
  const prenda = armarPrenda([
    { id: 'A', ...A },
    { id: 'B', ...B, x: xB },
  ]);
  const lados = [{ a: bordeDelDibujo(A, 0.1), b: bordeDelDibujo(B, 0, A.x.length / 3) }];
  return {
    malla: prenda.malla,
    obstaculos: [],
    costuras: { puntos: puntosDeCostura(prenda.malla.patron, lados[0].a, lados[0].b), bisagras: bisagrasDePrenda(prenda, lados, TELA_DE_LABORATORIO) },
    franja: franjaDePrenda(prenda, lados),
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

/** Una lámina de 120 mm, 5 mm sobre una esfera de 5 cm (malla de cuerpo): el contacto llega por anticipación en el segundo cuadro. */
export function escenaEsfera(): Escena {
  const cuerpo = new CuerpoRigido(buildLinearBVH(esferaDeColision(0.05, 3)));
  return { malla: mallaDeContorno(rectangulo(-60, -60, 60, 60), 10, 0.055), obstaculos: [{ tipo: 'cuerpo', cuerpo }] };
}

/** Una lámina de 100 mm apoyada en un plano inclinado 15° (malla de cuerpo), 0,1 mm dentro de su separación. */
export function escenaInclinada(): Escena {
  const a = (15 * Math.PI) / 180, n: [number, number, number] = [-Math.sin(a), Math.cos(a), 0];
  const cuerpo = new CuerpoRigido(buildLinearBVH(planoDeColision(n, 0.4)));
  const malla = mallaDeContorno(rectangulo(-50, -50, 50, 50), 10);
  const h = separacion(telaSI(TELA_DE_LABORATORIO)) - 0.0001;
  // el dibujo sobre el plano: x a lo largo de la pendiente, z horizontal
  malla.x = Float64Array.from(malla.x, (_, k) => {
    const i = Math.floor(k / 3), px = malla.patron[2 * i], pz = malla.patron[2 * i + 1];
    return [px * Math.cos(a) + h * n[0], px * Math.sin(a) + h * n[1], pz][k % 3];
  });
  return { malla, obstaculos: [{ tipo: 'cuerpo', cuerpo }] };
}

/**
 * Dos láminas en caída libre, sin piso: una de 90 mm inclinada sobre otra de 120 mm, de 1,2 mm (dentro de la
 * separación) a 6 mm, bajando 0,3 m/s más rápido y resbalando a 0,05 m/s. El primer cuadro tiene pares activos desde
 * la entrada, con su fricción, y pares anticipados. Con un piso, el piso frenaba las dos láminas a la misma altura y la
 * de arriba terminaba sobre la de abajo a distancia cero, donde la CPU y la GPU no pueden armar los mismos pares.
 */
export function escenaCapas(): Escena {
  const abajo = mallaDeContorno(rectangulo(-60, -60, 60, 60), 10), arriba = mallaDeContorno(rectangulo(-45, -45, 45, 45), 10);
  const nAbajo = abajo.x.length / 3;
  arriba.x = Float64Array.from(arriba.x, (y, k) => (k % 3 === 1 ? 0.0012 + ((arriba.x[k - 1] + 0.045) * 0.0048) / 0.09 : y));
  const prenda = armarPrenda([{ id: 'abajo', ...abajo }, { id: 'arriba', ...arriba }]);
  return {
    malla: prenda.malla,
    obstaculos: [],
    v: Float64Array.from(prenda.malla.x, (_, k) => (k < 3 * nAbajo ? 0 : k % 3 === 1 ? -0.3 : k % 3 === 0 ? 0.05 : 0)),
  };
}

/**
 * Dos láminas de pie a la altura del pecho (1,4 m), una de 90 mm 0,05 mm delante de otra de 120 mm: los pares entran
 * muy hundidos en la separación, como la tela sobre el torso. De pie, la altura cae en la dirección tangencial de la
 * cara, donde el criterio de la cara (E6) mide una separación de micras; en precisión simple, con coordenadas
 * absolutas, la altura se comía esas micras.
 */
export function escenaHundida(): Escena {
  const dePie = (m: MallaDeTela, delante: number): MallaDeTela => ({
    ...m,
    x: Float64Array.from(m.x, (_, k) => [delante, 1.4 + m.x[k - (k % 3)], m.x[k - (k % 3) + 2]][k % 3]),
  });
  const abajo = dePie(mallaDeContorno(rectangulo(-60, -60, 60, 60), 10), 0), arriba = dePie(mallaDeContorno(rectangulo(-45, -45, 45, 45), 10), 0.00005);
  return { malla: armarPrenda([{ id: 'abajo', ...abajo }, { id: 'arriba', ...arriba }]).malla, obstaculos: [] };
}

/** Una lámina de malla gruesa (20 mm), 2 mm sobre la punta de una pirámide y corrida para que la punta caiga en medio de un triángulo. */
export function escenaPunta(): Escena {
  const cuerpo = new CuerpoRigido(buildLinearBVH(piramideDeColision(0.3, 0.1)));
  const malla = mallaDeContorno(rectangulo(-60, -60, 60, 60), 20);
  malla.x = Float64Array.from(malla.x, (q, k) => (k % 3 === 0 ? q + 0.007 : k % 3 === 1 ? q + 0.102 : q + 0.003));
  return { malla, obstaculos: [{ tipo: 'cuerpo', cuerpo }] };
}
