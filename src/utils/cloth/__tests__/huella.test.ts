/**
 * La huella es la clave de las cachés del arranque (telas preparadas, BVH del
 * cuerpo): tiene que decir la verdad en los dos sentidos. Las mismas entradas
 * dan la misma huella, y si no, el arranque vuelve a ser lento en silencio;
 * cualquier cambio real da otra, y si no, la simulación arranca con la tela de
 * otra prenda.
 */
import { describe, it, expect } from 'vitest';
import { huella } from '../huella';
import { dosPiezas, COSTURAS, TELA } from '../gpu/__tests__/dosPiezas';
import type { PieceMeshData } from '../gpu/gpuSolverClient';
import type { Interruptores } from '../gpu/prepararTela';

/** Lo que la cascada mete en la huella de la tela: piezas, costuras, tela e interruptores. */
function entradas() {
  const piezas = dosPiezas();
  piezas[0].region = 'front-torso';
  const interruptores: Interruptores = { crossBend: true, seamScExcl: true };
  return { piezas, costuras: structuredClone(COSTURAS), tela: { ...TELA }, interruptores };
}
type Entradas = ReturnType<typeof entradas>;
const huellaDe = (e: Entradas) => huella(e.piezas, e.costuras, e.tela, e.interruptores);

/** El mismo objeto con sus claves al revés. */
const alReves = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).reverse()) as T;

describe('huella', () => {
  it('las mismas entradas dan la misma huella, aunque sean objetos distintos y con las claves en otro orden', () => {
    const a = entradas();
    const b = entradas();
    b.piezas = b.piezas.map(alReves);
    b.costuras = b.costuras.map(alReves);
    b.tela = alReves(b.tela);
    b.interruptores = alReves(b.interruptores);
    expect(b.piezas[0]).not.toBe(a.piezas[0]);
    expect(Object.keys(b.tela)).not.toEqual(Object.keys(a.tela));
    expect(huellaDe(b)).toBe(huellaDe(a));
  });

  it.each<[string, (e: Entradas) => void]>([
    // Un solo bit, el más bajo de la mantisa: un ulp.
    ['un valor de vertices', (e) => { new Uint32Array(e.piezas[1].vertices.buffer)[4] ^= 1; }],
    ['un triIds', (e) => { e.piezas[0].triIds[5] = 1; }],
    ['el region', (e) => { e.piezas[0].region = 'back-torso'; }],
    ['el orden de las piezas', (e) => { e.piezas.reverse(); }],
    ['un campo que hoy no existe', (e) => { e.piezas[0] = { ...e.piezas[0], nuevo: 1 } as PieceMeshData; }],
    ['un vertexPairs de una costura', (e) => { e.costuras[2].vertexPairs[1].reverse(); }],
    ['un campo de la tela', (e) => { e.tela.density = 0.25; }],
    ['un interruptor', (e) => { e.interruptores.crossBend = false; }],
  ])('%s da otra huella', (_, cambiar) => {
    const e = entradas();
    const antes = huellaDe(e);
    cambiar(e);
    expect(huellaDe(e)).not.toBe(antes);
  });

  it('-0 y +0 dan huellas distintas: se leen los bits, en un Float32Array y en un número suelto', () => {
    expect(huella(new Float32Array([-0]))).not.toBe(huella(new Float32Array([0])));
    expect(huella(-0)).not.toBe(huella(0));
  });

  // Un cambio solo en el bit 31 (el signo de un float) se queda en el bit 31
  // tras un XOR y una multiplicación impar: sin desplazar los bits, dos cambios
  // de signo se cancelan en esa mitad de la huella.
  it('cambiar el signo de dos floats cambia las dos mitades de la huella', () => {
    const antes = huella(new Float32Array([1, 2, 3, 4]));
    const despues = huella(new Float32Array([-1, 2, -3, 4]));
    expect(despues.slice(0, 8), 'la mitad alta').not.toBe(antes.slice(0, 8));
    expect(despues.slice(8), 'la mitad baja').not.toBe(antes.slice(8));
  });

  it('un campo undefined es lo mismo que no tenerlo', () => {
    expect(huella({ a: 1, b: undefined })).toBe(huella({ a: 1 }));
  });

  it('lo que no sabe recorrer lo dice, no lo salta', () => {
    expect(() => huella({ a: () => 1 })).toThrow(/no sé recorrer/);
  });

  // Recorridos por sus claves propias, dos Set distintos (o dos fechas, o dos
  // ArrayBuffer) daban la misma huella que un {} vacío: la caché le habría
  // dado a uno la tela del otro.
  it.each<[string, unknown, string]>([
    ['un Set', new Set([1, 2]), 'Set'],
    ['una fecha', new Date(0), 'Date'],
    ['un ArrayBuffer suelto', new ArrayBuffer(8), 'ArrayBuffer'],
    ['la instancia de una clase', new (class Punto { x = 1; })(), 'Punto'],
  ])('%s no se recorre como un objeto: lanza y nombra su constructor', (_, valor, constructor) => {
    expect(() => huella({ dentro: valor })).toThrow(new RegExp(`huella: no sé recorrer .*${constructor}`));
  });

  it('un objeto plano, también uno sin prototipo, se recorre como siempre', () => {
    const sinPrototipo = Object.assign(Object.create(null) as Record<string, unknown>, { a: 1, b: [2] });
    expect(huella(sinPrototipo)).toBe(huella({ a: 1, b: [2] }));
    expect(huella({ a: 1, b: [2] })).not.toBe(huella({ a: 1, b: [3] }));
  });
});
