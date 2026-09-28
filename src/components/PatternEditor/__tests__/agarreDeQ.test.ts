/**
 * Quién gana el clic en Editar patrón (spec 2026-09-24 § 3.4). Todas las filas
 * son la misma idea del contrato del 08-09: lo que ya es sujeto gana.
 */
import { describe, it, expect } from 'vitest';
import type { PathCommand } from '../../../types/types';
import { agarrar, type LineaParaAgarre } from '../agarreDeQ';
import { extractNodesFromPath } from '../nodeEditorUtils';
import { CLAVE_CONTORNO, claveDeInterna } from '../lineaEditable';

const linea = (clave: LineaParaAgarre['clave'], path: PathCommand[]): LineaParaAgarre =>
  ({ clave, path, nodes: extractNodesFromPath(path, 'p') });

const RECT = linea(CLAVE_CONTORNO, [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
]);
// De esquina a esquina: su primer punto coincide con el (0,0) del contorno.
const DIAG = linea(claveDeInterna('D'), [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 150] }]);
// Otra que arranca en la misma esquina, pintada encima.
const ARRIBA = linea(claveDeInterna('A'), [{ type: 'M', values: [0, 0] }, { type: 'L', values: [0, 80] }]);
const R = 8;

describe('agarrar', () => {
  it('el cierre fantasma de un subcamino abierto no se agarra (#1205)', () => {
    // Un anillo cerrado da `cierre: true` a todo el path; el subcamino abierto
    // de después aporta un cierre fantasma (400,100)→(300,0) rotulado con su `M`.
    const MIXTO = linea(CLAVE_CONTORNO, [
      ...RECT.path,
      { type: 'M', values: [300, 0] }, { type: 'L', values: [400, 0] }, { type: 'L', values: [400, 100] },
    ]);
    expect(agarrar([MIXTO], { x: 350, y: 50 }, R, null)).toBeNull();
  });

  it('un punto gana a un tramo dentro de 8 px', () => {
    expect(agarrar([RECT], { x: 3, y: 1 }, R, null)).toMatchObject({ tipo: 'punto', clave: CLAVE_CONTORNO, commandIndex: 0 });
  });

  it('en una esquina compartida gana el contorno si la interna no está elegida', () => {
    expect(agarrar([RECT, DIAG], { x: 1, y: 1 }, R, null)).toMatchObject({ tipo: 'punto', clave: CLAVE_CONTORNO });
  });

  it('… y la interna si está elegida', () => {
    expect(agarrar([RECT, DIAG], { x: 1, y: 1 }, R, claveDeInterna('D')))
      .toMatchObject({ tipo: 'punto', clave: claveDeInterna('D'), commandIndex: 0 });
  });

  it('dos internas en el mismo punto: la elegida; sin elegida, la de encima', () => {
    expect(agarrar([DIAG, ARRIBA], { x: 1, y: 1 }, R, claveDeInterna('D'))).toMatchObject({ clave: claveDeInterna('D') });
    expect(agarrar([DIAG, ARRIBA], { x: 1, y: 1 }, R, null)).toMatchObject({ clave: claveDeInterna('A') });
  });

  it('dos tramos: el más cercano', () => {
    // (100,78) está a 3 mm de la diagonal (en y=75 a x=100) y a 72 del borde de arriba.
    expect(agarrar([RECT, DIAG], { x: 100, y: 78 }, R, null)).toMatchObject({ tipo: 'tramo', clave: claveDeInterna('D') });
  });

  it('dos tramos que empatan: el elegido; sin elegido, el de encima', () => {
    const sobreElBorde = linea(claveDeInterna('B'), [{ type: 'M', values: [50, 0] }, { type: 'L', values: [150, 0] }]);
    expect(agarrar([RECT, sobreElBorde], { x: 100, y: 2 }, R, CLAVE_CONTORNO)).toMatchObject({ clave: CLAVE_CONTORNO });
    expect(agarrar([RECT, sobreElBorde], { x: 100, y: 2 }, R, null)).toMatchObject({ clave: claveDeInterna('B') });
  });

  // Una L abierta: (50,50) → (150,50) → (150,120). Su «cierre» de (150,120) a
  // (50,50) no está dibujado.
  const ele = linea(claveDeInterna('E'), [{ type: 'M', values: [50, 50] }, { type: 'L', values: [150, 50] }, { type: 'L', values: [150, 120] }]);

  it('el cierre fantasma de una línea abierta no es un tramo', () => {
    // (100,85) cae justo sobre ese cierre, y lejos de los dos tramos reales.
    expect(agarrar([ele], { x: 100, y: 85 }, R, null)).toBeNull();
  });

  it('… ni tapa a un tramo real que está más lejos que él', () => {
    // (143,112) está a 2,5 del cierre fantasma y a 7 del tramo que baja: gana el real.
    expect(agarrar([ele], { x: 143, y: 112 }, R, null)).toMatchObject({ tipo: 'tramo', commandIndex: 2 });
  });

  it('lejos de todo: nada', () => {
    expect(agarrar([RECT, DIAG], { x: 500, y: 500 }, R, null)).toBeNull();
  });
});
