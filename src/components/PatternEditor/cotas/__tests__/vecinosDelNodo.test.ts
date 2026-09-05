import { describe, it, expect } from 'vitest';
import { cotasDelNodo, vecinosDelNodo } from '../nodo';
import { cotasDelSujeto, type SujetoInput } from '../sujeto';
import { pieceLocalToPattern } from '../../../../utils/geometry/pieceSpace';
import type { PathCommand, PatternPiece } from '../../../../types/types';

/**
 * Los dos vecinos de un nodo del contorno — #1112.
 *
 * María [01:37]: «cuando yo lo muevo, cómo sé cuánto lo muevo… necesito poder
 * controlar de alguna manera lo que yo muevo ahora aquí, mi punto, respecto a
 * este punto, respecto a este punto y respecto a donde estaba el anterior».
 *
 * «Respecto a este punto, respecto a este punto» son los dos vecinos. Y no
 * existía ninguna función que los diera: el censo del 2026-09-06 encontró CINCO
 * copias del bucle «busca el ancla anterior» repartidas por `nodeEditorUtils` y
 * `splineSegment`, todas hacia atrás, ninguna con «siguiente», ninguna que
 * envuelva por la `Z`, ninguna que sepa de subcaminos.
 *
 * Los tres casos que rompen las versiones ingenuas, y por eso están todos aquí:
 *
 *  1. **La `Z` no es un nodo.** El vecino siguiente del último ancla de un
 *     contorno cerrado es el ancla de la `M`, no `commandIndex + 1` (ahí está
 *     la `Z`). Un `+1` ingenuo devuelve un comando que no tiene punto.
 *  2. **Anclas coincidentes.** El DXF de María llega con el vértice duplicado
 *     en cada esquina (CLO lo hace). El vecino ingenuo es el gemelo a distancia
 *     CERO, y una cota de «0.0 mm» que no se puede mover es peor que ninguna.
 *  3. **Contorno abierto.** No envuelve: el primero no tiene anterior y el
 *     último no tiene siguiente. Inventarles uno dibujaría un tramo que no
 *     existe.
 */

/** Rectángulo cerrado: M, L, L, L, Z. */
const CERRADO: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 150] },
  { type: 'L', values: [0, 150] },
  { type: 'Z', values: [] },
];

/** El mismo, con la esquina de arriba a la derecha DUPLICADA, como llega de CLO. */
const CON_GEMELO: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 150] },
  { type: 'L', values: [0, 150] },
  { type: 'Z', values: [] },
];

/** Abierto: sin `Z`. */
const ABIERTO: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
];

describe('los dos vecinos de un nodo', () => {
  it('en medio del contorno son el anterior y el siguiente, sin más', () => {
    const v = vecinosDelNodo(CERRADO, 2);
    expect(v.anterior).toEqual({ indice: 1, punto: { x: 200, y: 0 } });
    expect(v.siguiente).toEqual({ indice: 3, punto: { x: 0, y: 150 } });
  });

  it('el ÚLTIMO ancla de un contorno cerrado tiene por siguiente la M, no la Z', () => {
    // El `+1` ingenuo devuelve la `Z`, que no tiene punto. Este es el caso que
    // convierte la cota en «NaN mm» o en nada.
    const v = vecinosDelNodo(CERRADO, 3);
    expect(v.siguiente, 'el contorno cerrado no envolvió por la Z').toEqual({ indice: 0, punto: { x: 0, y: 0 } });
  });

  it('y la M tiene por anterior el último ancla, cerrando el anillo', () => {
    const v = vecinosDelNodo(CERRADO, 0);
    expect(v.anterior).toEqual({ indice: 3, punto: { x: 0, y: 150 } });
    expect(v.siguiente).toEqual({ indice: 1, punto: { x: 200, y: 0 } });
  });

  it('salta el gemelo coincidente: el vecino es el siguiente punto DISTINTO', () => {
    // Sin esto, mover la esquina duplicada de un DXF de María enseñaría una
    // cota de 0,0 mm contra su propio gemelo. Es el caso real, no el raro.
    const v = vecinosDelNodo(CON_GEMELO, 1);
    expect(v.siguiente, 'el vecino es el gemelo a distancia cero').toEqual({ indice: 3, punto: { x: 200, y: 150 } });
    expect(v.anterior).toEqual({ indice: 0, punto: { x: 0, y: 0 } });
  });

  it('y da lo mismo por cuál de los dos gemelos se pregunte', () => {
    // Los dos comandos son el MISMO punto para la usuaria: `anchorGroupOf` ya
    // los mueve juntos, así que sus vecinos tienen que coincidir.
    expect(vecinosDelNodo(CON_GEMELO, 2)).toEqual(vecinosDelNodo(CON_GEMELO, 1));
  });

  it('en un contorno abierto los extremos tienen un solo vecino', () => {
    expect(vecinosDelNodo(ABIERTO, 0).anterior).toBeNull();
    expect(vecinosDelNodo(ABIERTO, 0).siguiente).toEqual({ indice: 1, punto: { x: 100, y: 0 } });
    expect(vecinosDelNodo(ABIERTO, 2).siguiente).toBeNull();
    expect(vecinosDelNodo(ABIERTO, 2).anterior).toEqual({ indice: 1, punto: { x: 100, y: 0 } });
  });

  it('un índice que no es nodo no tiene vecinos, y lo dice', () => {
    expect(vecinosDelNodo(CERRADO, 4)).toEqual({ anterior: null, siguiente: null });
    expect(vecinosDelNodo(CERRADO, 99)).toEqual({ anterior: null, siguiente: null });
  });

  it('una pieza degenerada (todos los puntos iguales) no cuelga buscando un vecino', () => {
    // La red contra el bucle infinito: si todo coincide, no hay vecino distinto
    // y hay que decirlo, no dar vueltas al anillo para siempre.
    const degenerado: PathCommand[] = [
      { type: 'M', values: [5, 5] },
      { type: 'L', values: [5, 5] },
      { type: 'L', values: [5, 5] },
      { type: 'Z', values: [] },
    ];
    expect(vecinosDelNodo(degenerado, 0)).toEqual({ anterior: null, siguiente: null });
  });
});


const PIEZA = {
  id: 'p1', name: 'Delantero', outline: CERRADO, internals: [],
  position: { x: 10, y: 20 }, rotation: 0, mirrored: false, seamAllowance: 0,
  layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
} as unknown as PatternPiece;

describe('las cotas del punto — «respecto a este punto, respecto a este punto»', () => {
  it('son dos: la distancia a cada vecino, en milímetros', () => {
    // El nodo 1 es (200,0): 200 al anterior (0,0) y 150 al siguiente (200,150).
    const cotas = cotasDelNodo(PIEZA, 1);
    expect(cotas).toHaveLength(2);
    expect(cotas.map(c => c.label)).toEqual(['Al punto anterior', 'Al punto siguiente']);
    expect(cotas[0].valueMm).toBeCloseTo(200, 6);
    expect(cotas[1].valueMm).toBeCloseTo(150, 6);
    expect(cotas.map(c => c.unit)).toEqual(['mm', 'mm']);
  });

  it('las dos son `tramo-largo`: son largos, y el kind no se usa para robar layout', () => {
    for (const c of cotasDelNodo(PIEZA, 1)) expect(c.kind).toBe('tramo-largo');
  });

  it('el segmento que dibuja cada una va del vecino al nodo, en patrón', () => {
    // `a` y `b` son coordenadas de PATRÓN, así que llevan la posición de la
    // pieza sumada — si no, los chips salen sobre el origen del lienzo.
    const [alAnterior] = cotasDelNodo(PIEZA, 1);
    expect(alAnterior.a).toEqual({ x: 0 + 10, y: 0 + 20 });
    expect(alAnterior.b).toEqual({ x: 200 + 10, y: 0 + 20 });
  });

  it('sobre una pieza GIRADA los chips van al sitio girado, no al de la sombra', () => {
    // Sumar `position` a mano ignora el giro. Con la pieza a 90° el chip del
    // tramo de arriba se iría al lado contrario del lienzo — invisible con
    // rotación 0, que es el único caso que probaba este archivo hasta que el
    // trinquete de `pieceSpace` lo señaló.
    const girada = { ...PIEZA, rotation: 90 } as PatternPiece;
    const [alAnterior] = cotasDelNodo(girada, 1);
    const recto = cotasDelNodo(PIEZA, 1)[0];
    expect(alAnterior.valueMm, 'el largo NO depende del giro').toBeCloseTo(recto.valueMm, 6);
    expect(
      Math.hypot(alAnterior.b.x - recto.b.x, alAnterior.b.y - recto.b.y),
      'la cota de la pieza girada cayó en el mismo sitio que la sin girar',
    ).toBeGreaterThan(1);
    // Y coincide con el helper canónico, que es la única definición del giro.
    const esperado = pieceLocalToPattern({ x: 200, y: 0 }, girada);
    expect(alAnterior.b.x).toBeCloseTo(esperado.x, 6);
    expect(alAnterior.b.y).toBeCloseTo(esperado.y, 6);
  });

  it('escribir la distancia mueve el nodo POR esa recta, sin girar el tramo', () => {
    // La única lectura sin ambigüedad de «ponlo a 150 de este punto». Es la
    // misma semántica que ya tiene el largo de un tramo de línea interna.
    const [alAnterior] = cotasDelNodo(PIEZA, 1);
    const update = alAnterior.apply(150);
    expect(update).toEqual({
      kind: 'nodo', pieceId: 'p1', commandIndex: 1, destino: { x: 150, y: 0 },
    });
  });

  it('y NO reconstruye el contorno: eso es de quien ya mueve nodos', () => {
    // Si `apply` devolviera un `outline`, habría dos escritores del mismo
    // hecho: este y el arrastre de `useEditPattern`, que además compensa el
    // pivote y re-ancla los piquetes. El chip solo dice A DÓNDE.
    const update = cotasDelNodo(PIEZA, 1)[0].apply(150);
    expect(update && 'outline' in update).toBe(false);
  });

  it('un punto sin vecinos distintos no tiene cotas: nada que enseñar', () => {
    const degenerada = { ...PIEZA, outline: [
      { type: 'M', values: [5, 5] }, { type: 'L', values: [5, 5] }, { type: 'Z', values: [] },
    ] } as unknown as PatternPiece;
    expect(cotasDelNodo(degenerada, 0)).toEqual([]);
  });
});

const BASE: SujetoInput = {
  activeTool: 'editPattern', pieces: [PIEZA], selectedPieceIds: [],
  selectedInternalLine: null, hotId: null, isDragging: false,
  contextMenuOpen: false, calibrationActive: false, hiddenLayerIds: [], layerLocked: {},
};

describe('el punto como sujeto', () => {
  it('con UN punto seleccionado, la tira lo nombra y salen sus dos cotas', () => {
    const s = cotasDelSujeto({ ...BASE, nodoSeleccionado: { pieceId: 'p1', commandIndex: 1 } }, { width: 100, height: 100 });
    expect(s.cotas).toHaveLength(2);
    expect(s.lineaDeSujeto).toBe('Editando: el punto seleccionado');
  });

  it('sin punto seleccionado, «Editar patrón» no tiene cotas', () => {
    const s = cotasDelSujeto({ ...BASE, nodoSeleccionado: null }, { width: 100, height: 100 });
    expect(s.cotas).toEqual([]);
  });

  it('en una capa oculta no hay cotas, como para cualquier otro sujeto', () => {
    const s = cotasDelSujeto(
      { ...BASE, hiddenLayerIds: [1], nodoSeleccionado: { pieceId: 'p1', commandIndex: 1 } },
      { width: 100, height: 100 },
    );
    expect(s.cotas).toEqual([]);
  });

  it('en una pieza bloqueada las cotas se ven, apagadas: leer no es editar', () => {
    const bloqueada = { ...PIEZA, locked: true } as PatternPiece;
    const s = cotasDelSujeto(
      { ...BASE, pieces: [bloqueada], nodoSeleccionado: { pieceId: 'p1', commandIndex: 1 } },
      { width: 100, height: 100 },
    );
    expect(s.cotas).toHaveLength(2);
    expect(s.disabled).toBe(true);
  });
});
