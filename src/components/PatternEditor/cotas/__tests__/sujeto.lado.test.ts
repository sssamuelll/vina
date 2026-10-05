/**
 * El lado en la escalera del sujeto (#1167, spec 2026-09-18 § 3.1).
 *
 * El lado NO es un peldaño que se cuela delante de todos: es un **refinamiento**
 * del sujeto que ya ganó. En `Z` afina a la pieza; en `Q` es hermano del punto.
 * En las demás herramientas no entra — y ahí estaba el peor fallo de la primera
 * versión, que dejaba una caja EDITABLE en las ~19 restantes, Medir incluida.
 *
 * `admiteLado` es la ÚNICA lista de compuertas: la consultan el que dibuja
 * (`refinarAlLado`) y el que decide si Tab abre (`usePuertaDeLado`).
 */
import { describe, it, expect } from 'vitest';
import { admiteLado, cotasDelSujeto, refinarAlLado, type SujetoInput } from '../sujeto';
import type { PatternPiece, PathCommand, Tool2D } from '../../../../types/types';

const rect = (w: number, h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] }, { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
];
/** Como lo deja CLO: el vértice REPETIDO en cada esquina (el DXF de María). */
const CON_ESQUINAS_DUPLICADAS: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 100] },
  { type: 'L', values: [200, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];
const pieza = (id: string, over: Partial<PatternPiece> = {}): PatternPiece => ({
  id, name: id, outline: rect(200, 100), internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, ...over,
} as PatternPiece);

const base = {
  // La 'a' lleva una interna de verdad: con un `lineId` inventado, la escalera
  // la trata como colgante y cae a la pieza — el test pasaría por el motivo
  // equivocado, midiendo un fallback en vez de la precedencia.
  pieces: [
    pieza('a', { internals: [{
      id: 'i1', type: 'reference',
      path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }],
    }] as PatternPiece['internals'] }),
    pieza('b', { locked: true }), pieza('c', { layer: 2 }),
    pieza('d', { outline: CON_ESQUINAS_DUPLICADAS }),
  ],
  selectedInternalLine: null, hotId: null,
  isDragging: false, contextMenuOpen: false, calibrationActive: false,
  hiddenLayerIds: [] as number[], layerLocked: {} as Record<number, boolean>,
  activeTool: 'select' as Tool2D, selectedPieceIds: ['a'],
} satisfies SujetoInput;

const entrada = (over: Partial<SujetoInput> = {}): SujetoInput => ({ ...base, ...over });
const sujetoDe = (over: Partial<SujetoInput> = {}) => cotasDelSujeto(entrada(over));
const conLado = (over: Partial<SujetoInput>, lado: { pieceId: string; commandIndex: number } | null) => {
  const input = entrada(over);
  return refinarAlLado(cotasDelSujeto(input), lado, input);
};

describe('admiteLado — la única lista de compuertas', () => {
  it('en Seleccionar admite un lado solo cuando el sujeto es la PIEZA', () => {
    expect(admiteLado(sujetoDe(), 'select')).toBe(true);
  });

  it('en Editar patrón admite un lado cuando no hay nada más fino elegido', () => {
    const s = sujetoDe({ activeTool: 'editPattern', selectedPieceIds: [] });
    expect(admiteLado(s, 'editPattern')).toBe(true);
  });

  it('un punto elegido gana al lado: lo más fino manda', () => {
    const s = sujetoDe({
      activeTool: 'editPattern', selectedPieceIds: [],
      nodoSeleccionado: { pieceId: 'a', commandIndex: 1 },
    });
    expect(admiteLado(s, 'editPattern')).toBe(false);
  });

  it.each<Tool2D>(['measure', 'pen', 'seamAllowance', 'notch', 'rectangle', 'circle', 'triangle', 'transform'])(
    'en %s no admite lado: el sujeto es el par (herramienta, objeto)',
    (herramienta) => {
      // § 2.2 del contrato del 08-09: «Herramienta de creación vs. pieza ya
      // seleccionada → gana LA HERRAMIENTA». Y § 4, en negrita suya: «Medir `M`
      // | ningún gesto modifica geometría».
      //
      // Y de paso cierra la distinción que hizo ELLA —«al SALIR de crear y
      // volver a clicar la pieza»— sin un caso especial: mientras una
      // herramienta de crear esté activa, se está creando, y Tab conserva el
      // Ancho de #223/#225.
      expect(admiteLado(sujetoDe({ activeTool: herramienta }), herramienta)).toBe(false);
    });

  it('una interna elegida no deja sitio al lado', () => {
    const s = sujetoDe({ selectedInternalLine: { pieceId: 'a', lineId: 'i1' } });
    expect(admiteLado(s, 'select')).toBe(false);
  });

  it('con el menú contextual abierto tampoco: no hay caja que abrir', () => {
    expect(admiteLado(sujetoDe({ contextMenuOpen: true }), 'select')).toBe(false);
  });

  it('arrastrando tampoco', () => {
    expect(admiteLado(sujetoDe({ isDragging: true }), 'select')).toBe(false);
  });

  it('capa oculta tampoco', () => {
    expect(admiteLado(sujetoDe({ selectedPieceIds: ['c'], hiddenLayerIds: [2] }), 'select')).toBe(false);
  });
});

describe('refinarAlLado — la caja del lado', () => {
  it('con un lado elegido sale su caja, no Ancho y Alto', () => {
    const s = conLado({}, { pieceId: 'a', commandIndex: 1 });
    expect(s.cotas.map(c => c.kind)).toEqual(['tramo-largo', 'tramo-angulo']);
    expect(s.cotas[0].valueMm).toBeCloseTo(200, 6);
    // Un término por concepto (contrato de interfaz § 5): la app ya llama
    // «tramo» a esta unidad en la interna y en el trazo.
    expect(s.esPieza).toBe(false);
  });

  it('el lado de cierre también es sujeto', () => {
    const s = conLado({}, { pieceId: 'a', commandIndex: 0 });
    expect(s.cotas).toHaveLength(2);
    expect(s.cotas[0].valueMm).toBeCloseTo(100, 6);
  });

  it('vale en Editar patrón, que es de donde llega el clic sobre el lado', () => {
    const s = conLado({ activeTool: 'editPattern', selectedPieceIds: [] }, { pieceId: 'a', commandIndex: 2 });
    expect(s.cotas).toHaveLength(2);
    expect(s.cotas[0].valueMm).toBeCloseTo(100, 6);
  });

  it('pieza bloqueada: la caja sale, apagada', () => {
    const s = conLado({ selectedPieceIds: ['b'] }, { pieceId: 'b', commandIndex: 1 });
    expect(s.disabled).toBe(true);
    expect(s.cotas).toHaveLength(2);
  });

  it.each<[string, Partial<SujetoInput>]>([
    ['en Medir', { activeTool: 'measure' }],
    ['con la Pluma', { activeTool: 'pen' }],
    ['en Margen', { activeTool: 'seamAllowance' }],
    ['con el menú abierto', { contextMenuOpen: true }],
    ['arrastrando', { isDragging: true }],
  ])('%s el lado NO se dibuja: devuelve el sujeto tal cual', (_caso, over) => {
    const input = entrada(over);
    const antes = cotasDelSujeto(input);
    expect(refinarAlLado(antes, { pieceId: 'a', commandIndex: 1 }, input)).toBe(antes);
  });

  it('un lado que ya no existe cae a la pieza, y lo dice: Ancho y Alto', () => {
    const s = conLado({}, { pieceId: 'a', commandIndex: 99 });
    expect(s.cotas.map(c => c.id)).toEqual(['ancho', 'alto']);
  });

  it('una pieza que ya no existe cae a la pieza seleccionada, sin inventar sujeto', () => {
    const s = conLado({}, { pieceId: 'zzz', commandIndex: 1 });
    expect(s.cotas.map(c => c.id)).toEqual(['ancho', 'alto']);
  });

  it('sin lado elegido, la pieza conserva Ancho y Alto tal cual', () => {
    const s = conLado({}, null);
    expect(s.cotas.map(c => c.id)).toEqual(['ancho', 'alto']);
  });

  describe('el DXF real de María, con la esquina repetida en cada vértice', () => {
    // `addPiece` y los rectángulos sintéticos traen anclas ÚNICAS, así que
    // ninguna suite veía este caso — el mismo hueco de fixture que
    // `1112-mover-el-punto-con-numero.spec.ts` dejó escrito: «los otros tres
    // tests de este archivo no podían verlo».
    it('los lados de largo CERO de las esquinas no tienen caja', () => {
      // El índice 2 es el gemelo de la esquina: (200,0)→(200,0). Una caja de
      // «0,0 mm» por debajo de su propio mínimo, con un ángulo que `atan2(0,0)`
      // se inventa, y que al escribirle 250 arrastraría la esquina 250 mm por
      // un rumbo que nadie trazó.
      const s = conLado({ selectedPieceIds: ['d'] }, { pieceId: 'd', commandIndex: 2 });
      expect(s.cotas.map(c => c.id)).toEqual(['ancho', 'alto']);
    });

    it('los lados de verdad siguen teniendo la suya, con su largo', () => {
      const s = conLado({ selectedPieceIds: ['d'] }, { pieceId: 'd', commandIndex: 3 });
      expect(s.cotas[0].valueMm).toBeCloseTo(100, 6);
    });

    it('y el de cierre también', () => {
      const s = conLado({ selectedPieceIds: ['d'] }, { pieceId: 'd', commandIndex: 0 });
      expect(s.cotas[0].valueMm).toBeCloseTo(100, 6);
    });
  });
});
