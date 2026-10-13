/**
 * Las escenas del banco de la tela nueva (spec 2026-10-13 §4.4): el disco Cusick, la tira en voladizo y
 * la lámina del cilindro. No dependen del motor: el banco las corre con el de hoy y con el nuevo.
 */
import { mallaDeContorno, type MallaDeTela } from '../malla';
import type { Obstaculo } from '../obstaculos';
import type { TelaFisica } from '../tela';

/**
 * Tela de laboratorio con números redondos, para las pruebas y las escenas públicas. No es una tela
 * medida: las medidas viven en la referencia privada del banco.
 */
export const TELA_DE_LABORATORIO: TelaFisica = {
  gramaje: 200, grosor: 0.5, kTrama: 300, kUrdimbre: 600, kCizalla: 50, pandeo: 1, bTrama: 2, bUrdimbre: 5, bBies: 3,
};

/** Ensayo Cusick (ISO 9073-9): disco de 30 cm sobre pedestal de 18 cm, 5 mm por encima de la tapa. */
export const CUSICK = { radioDisco: 0.15, radioPedestal: 0.09, tapa: 0.5, alturaInicial: 0.505 } as const;

/** Una escena: la malla, lo que toca y la dirección del hilo en el dibujo (por defecto, vertical). */
export interface Escena {
  malla: MallaDeTela;
  obstaculos: Obstaculo[];
  hilo?: readonly [number, number];
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
