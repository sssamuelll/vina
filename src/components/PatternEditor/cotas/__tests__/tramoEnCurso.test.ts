import { describe, it, expect } from 'vitest';
import { cotasDelTramoEnCurso } from '../tramoEnCurso';
import { cotasDelSujeto } from '../sujeto';
import type { SujetoInput } from '../sujeto';

/**
 * #1129 — el tramo en curso, congelado en dos chips.
 *
 * Spec de cotas vivas § 5.4: «`Tab` congela: el hook devuelve `nextPoint` como
 * hoy; en vez de `NextPointPanel` se montan dos chips en edición (Largo
 * enfocado, Ángulo al lado) en la posición donde estaba el readout. `Enter` =
 * `placePolar` […]. `Escape` = `closeNextPoint`. `Tab` dentro = Largo ↔ Ángulo».
 *
 * Lo que este archivo fija —y que el issue dejaba abierto— es CÓMO un chip
 * escribe en un hook en vez de en Redux:
 *
 *  - Los chips del tramo llevan los mismos `kind` que los de una línea interna
 *    (`tramo-largo` / `tramo-angulo`). No es pereza: esos dos kinds ya se
 *    separan ±36 px sobre la tangente en `chipScreenPosition`, que es
 *    exactamente lo que hace falta para que Largo y Ángulo compartan punto
 *    medio sin taparse. Un kind nuevo habría obligado a tocar los dos
 *    consumidores que hacen match por kind, para reimplementar lo mismo.
 *  - `apply` devuelve una variante nueva de `CotaUpdate`, `tramoEnCurso`, que
 *    NO es una mutación de proyecto: la resuelve `PatternEditor` contra el hook
 *    de la herramienta viva.
 *  - Y el chip dice ahora CON QUÉ confirmó. Sin ese dato, Tab y Enter son
 *    indistinguibles y Tab colocaría el punto en vez de saltar al Ángulo, que
 *    es justo lo que la § 5.4 no quiere.
 */

const from = { x: 100, y: 100 };

describe('las dos cotas del tramo en curso', () => {
  it('son Largo y Ángulo, con los kinds que ya saben separarse', () => {
    const cotas = cotasDelTramoEnCurso({ from, lengthMm: 80, angleDeg: 90 });
    expect(cotas.map(c => c.kind)).toEqual(['tramo-largo', 'tramo-angulo']);
    expect(cotas.map(c => c.label)).toEqual(['Largo', 'Ángulo']);
    expect(cotas[0].valueMm).toBe(80);
    expect(cotas[1].valueMm).toBe(90);
    expect(cotas[0].unit).toBe('mm');
    expect(cotas[1].unit).toBe('deg');
    expect(cotas[0].grupo).toBe('tramo-en-curso');
    expect(cotas[1].grupo).toBe(cotas[0].grupo);
  });

  it('el segmento que dibujan va del último nodo al punto polar, no a otro sitio', () => {
    // 0° a la derecha, 90° arriba EN PANTALLA — la convención de `polarOf`,
    // que es la que ya usan las cotas de la línea interna.
    const [largo] = cotasDelTramoEnCurso({ from, lengthMm: 80, angleDeg: 90 });
    expect(largo.a).toEqual(from);
    expect(largo.b.x).toBeCloseTo(100, 6);
    expect(largo.b.y).toBeCloseTo(20, 6);
  });

  it('escribir el LARGO conserva el ángulo, y al revés', () => {
    const [largo, angulo] = cotasDelTramoEnCurso({ from, lengthMm: 80, angleDeg: 90 });
    expect(largo.apply(50)).toEqual({ kind: 'tramoEnCurso', largoMm: 50, anguloDeg: 90 });
    expect(angulo.apply(0)).toEqual({ kind: 'tramoEnCurso', largoMm: 80, anguloDeg: 0 });
  });

  it('el marco relativo conserva el otro valor y vuelve al mismo ángulo absoluto', () => {
    const lengthMm = 83.123456789;
    const angleDeg = 127.123456789;
    const [largo, angulo] = cotasDelTramoEnCurso({ from, lengthMm, angleDeg,
      reference: { kind: 'border', baseDeg: 37.123456789 } });
    expect(angulo.valueMm).toBeCloseTo(90, 12);
    expect(angulo.referenceLabel).toBe('al borde');
    expect(largo.apply(50.123456789)).toEqual({ kind: 'tramoEnCurso', largoMm: 50.123456789, anguloDeg: angleDeg });
    expect(angulo.apply(angulo.valueMm)).toEqual({ kind: 'tramoEnCurso', largoMm: lengthMm, anguloDeg: angleDeg });
  });

  it('confirmar con Enter vale aunque el número no haya cambiado: aquí confirmar COLOCA', () => {
    // Para una cota de objeto, «no cambió → no despacho» ahorra una escritura.
    // Aquí no hay objeto: confirmar es la orden de colocar el punto. Sin esto,
    // congelar el tramo, ver el número que ya se quiere y pulsar Enter no hacía
    // absolutamente nada — el caso más simple del encadenado.
    for (const c of cotasDelTramoEnCurso({ from, lengthMm: 80, angleDeg: 90 })) {
      expect(c.confirmaSinCambio, `«${c.label}» no coloca si el número no cambia`).toBe(true);
    }
  });

  it('el largo no acepta cero ni negativo: un tramo de largo cero no es un tramo', () => {
    const [largo] = cotasDelTramoEnCurso({ from, lengthMm: 80, angleDeg: 90 });
    expect(largo.min).toBeGreaterThan(0);
  });

  it('el ángulo da la vuelta entera, que es lo que el panel viejo aceptaba', () => {
    const [, angulo] = cotasDelTramoEnCurso({ from, lengthMm: 80, angleDeg: 90 });
    expect(angulo.min).toBeLessThanOrEqual(-360);
    expect(angulo.max).toBeGreaterThanOrEqual(360);
  });

  it('ninguno se arrastra: escribir un tramo que aún no existe es de teclado', () => {
    // El scrub tira de un objeto que está en pantalla. Aquí no hay objeto
    // todavía — hay una intención — y arrastrarlo colocaría puntos sin querer.
    const cotas = cotasDelTramoEnCurso({ from, lengthMm: 80, angleDeg: 90 });
    expect(cotas, 'sin cotas el `for` de abajo pasa en vacío').toHaveLength(2);
    for (const c of cotas) expect(c.scrub).toBe(false);
  });
});

const BASE: SujetoInput = {
  activeTool: 'pen',
  pieces: [],
  selectedPieceIds: [],
  selectedInternalLine: null,
  hotId: null,
  isDragging: false,
  contextMenuOpen: false,
  calibrationActive: false,
  hiddenLayerIds: [],
  layerLocked: {},
};

describe('el tramo en curso como sujeto', () => {
  it('con la pluma trazando y Tab pulsado, el sujeto son sus dos chips', () => {
    const s = cotasDelSujeto({ ...BASE, tramoEnCurso: { from, lengthMm: 80, angleDeg: 90 } });
    expect(s.cotas).toHaveLength(2);
  });

  it('sin Tab pulsado la pluma no tiene cotas: el readout sigue siendo el readout', () => {
    // Congelar es un acto deliberado. Si el tramo tuviera chips siempre, el
    // trazo se llenaría de campos mientras ella dibuja.
    const s = cotasDelSujeto({ ...BASE, tramoEnCurso: null });
    expect(s.cotas).toEqual([]);
  });

  it('gana a la pieza seleccionada: lo vivo manda sobre lo elegido', () => {
    // La regla del sujeto es «el más reciente». Un trazo en curso es lo más
    // reciente que hay, por definición.
    const pieza = {
      id: 'p1', name: 'p', outline: [
        { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
      ],
      internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
      seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
    } as never;
    const s = cotasDelSujeto(
      { ...BASE, activeTool: 'select', pieces: [pieza], selectedPieceIds: ['p1'], tramoEnCurso: { from, lengthMm: 80, angleDeg: 90 } });
    expect(s.cotas.map(c => c.label)).toEqual(['Largo', 'Ángulo']);
  });
});
