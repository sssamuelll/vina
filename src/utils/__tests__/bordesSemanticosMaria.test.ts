/**
 * La premisa sobre la que descansan las tres tandas del arrastre unificado
 * (#1029), medida contra su patrón y no supuesta.
 *
 * El gesto de borde clampea a `EdgeTarget.edgeRange`, y quien lo calcula es
 * `edgeRangeForCommand` (`src/utils/semanticEdges.ts:237-245`). Su última
 * línea es la que importa:
 *
 *     return semantic ? semantic.segmentRange : [cmdIndex, cmdIndex + 1];
 *
 * Sin bordes semánticos, un "borde" es UN COMANDO. Sobre los contornos de
 * María —que llegan del DXF con las curvas ya aplanadas en polilíneas de
 * ~200 comandos, ver `docs/reports/2026-08-12-verificacion-piquetes-patron-real.md`—
 * eso sería una fracción invisible del perímetro: el arrastre no tendría
 * recorrido y el número no se movería.
 *
 * Medido el 2026-08-13, y salió a favor: sus curvas grandes caen enteras en
 * un solo borde. Este test congela esa premisa. Si un cambio futuro en
 * `detectSemanticEdges` trocea sus sisas, las tres tandas se caen a la vez y
 * es este archivo el que lo dice.
 *
 * Ojo con el matiz que hace mentir a un test escrito de prisa: `piece.edges`
 * viene **undefined** del importador de DXF. Quien los rellena es el store,
 * en la carga del proyecto (`projectSlice.ts:289-293`) y en `addPiece`
 * (`:396-399`). Mirar `piece.edges` justo tras importar da `undefined` y
 * concluye lo contrario de lo que pasa en la app; hay que llamar a
 * `detectSemanticEdges`, que es lo que hace el store.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importDXFContent } from '../dxf';
import { detectSemanticEdges, edgeRangeForCommand } from '../semanticEdges';

const REPO_ROOT = resolve(__dirname, '../../..');
const FIXTURE = 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf';

const { pieces } = importDXFContent(
  readFileSync(resolve(REPO_ROOT, FIXTURE), 'utf8'),
  { unit: 'auto', autoDetect: true },
);

/** Las piezas grandes: las que traen las curvas aplanadas densas. */
const GRANDES = 50;

describe('los bordes semánticos del patrón real de María', () => {
  it('el fixture trae las 5 piezas, no se encogió', () => {
    expect(pieces.length).toBe(5);
  });

  it('cada pieza tiene al menos dos bordes semánticos', () => {
    // Con menos de dos, `detectSemanticEdges` devuelve [] (semanticEdges.ts:71)
    // y la rama de borde del margen es directamente inalcanzable
    // (edgeHitTest.ts:125, `piece.edges?.length ? … : null`).
    for (const piece of pieces) {
      expect(detectSemanticEdges(piece).length, `pieza ${piece.name}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('las curvas grandes caen en UN borde, no troceadas', () => {
    // Lo medido: 67, 77, 105 y 127 comandos en un solo borde. Un borde de un
    // comando NO es un bug por sí solo — un hombro recto es un comando; lo
    // que se vigila es que las curvas densas no se partan.
    for (const piece of pieces) {
      const rangos = detectSemanticEdges(piece).map(e => e.segmentRange[1] - e.segmentRange[0]);
      const minimoEsperado = piece.outline.length > GRANDES ? 50 : 3;
      expect(Math.max(...rangos), `pieza ${piece.name}`).toBeGreaterThanOrEqual(minimoEsperado);
    }
  });

  it('los comandos huérfanos son la excepción, y cuántos son queda escrito', () => {
    // La puerta, no el cuarto: que existan bordes no prueba que el gesto los
    // alcance desde cualquier punto del contorno. Un comando que no cae en
    // ningún borde hace que `edgeRangeForCommand` devuelva [i, i+1] — el
    // sliver de la queja 2 de su #220 ("una parte random de la curva, que
    // parece que es entre punto de curva y punto extremo").
    //
    // Medido el 2026-08-13: 4,0 % (SAMUEL-1 y -4), 8,8 % (-3), 6,2 % (-5).
    // El umbral de 15 % no dice "esto está bien": dice "no ha empeorado sin
    // que nadie se entere". El hueco vive en el #1027.
    for (const piece of pieces) {
      if (piece.outline.length <= GRANDES) continue; // la chica es 50 % y es su forma
      const conEdges = { ...piece, edges: detectSemanticEdges(piece) };
      let huerfanos = 0;
      for (let i = 0; i < conEdges.outline.length; i++) {
        const [a, b] = edgeRangeForCommand(conEdges, i);
        if (b - a <= 1) huerfanos++;
      }
      const pct = (huerfanos / conEdges.outline.length) * 100;
      expect(pct, `pieza ${piece.name}: ${huerfanos}/${conEdges.outline.length} huérfanos`)
        .toBeLessThan(15);
    }
  });

  it('el importador NO trae los bordes puestos — los pone el store', () => {
    // Congela el matiz del encabezado. Si algún día el importador empezara a
    // rellenarlos, este test lo dice y hay que revisar los otros cuatro: los
    // suyos llamarían a detectSemanticEdges sobre unos que ya existen.
    for (const piece of pieces) {
      expect(piece.edges, `pieza ${piece.name}`).toBeUndefined();
    }
  });
});
