import { describe, it, expect } from 'vitest';
import { toolRegistry } from '../index';
import { DOCK_2D_CATALOG } from '../../components/shell/dock2dTools';

/**
 * Un nombre por herramienta (#1049).
 *
 * Hasta ahora había dos fuentes de nombre y nadie lo notaba porque nunca
 * aparecían juntas en pantalla: el dock decía "Pluma" y `shortcuts/defaults.ts`
 * decía "Polígono (pluma)", para la misma herramienta. La barra de opciones las
 * pone al lado, así que la deriva se vuelve visible.
 *
 * Este test ata el catálogo del dock a la definición de la herramienta. No
 * elige cuál gana — obliga a que haya una sola.
 */

/** seamEdit está en el catálogo del dock y NO tiene definición en
 *  `src/tools/definitions/`: su handler vive en `useSeamEditTool`. Es la única
 *  excepción legítima, y el segundo caso vigila que siga siendo la única. */
const SIN_DEFINICION = new Set(['seamEdit']);

describe('nombres de herramienta', () => {
  it('el dock y la definición dicen lo mismo', () => {
    for (const entrada of DOCK_2D_CATALOG) {
      if (SIN_DEFINICION.has(entrada.id)) continue;

      const definicion = toolRegistry.getTool(entrada.id);
      expect(definicion, `${entrada.id} no tiene definición`).toBeDefined();
      expect(
        definicion!.name,
        `${entrada.id}: el dock dice "${entrada.label}"`,
      ).toBe(entrada.label);
    }
  });

  it('seamEdit sigue siendo la única del dock sin definición', () => {
    const huerfanas = DOCK_2D_CATALOG
      .filter((e) => !toolRegistry.getTool(e.id))
      .map((e) => e.id);
    expect(huerfanas).toEqual(['seamEdit']);
  });

  it('las 20 herramientas 2D alcanzables tienen nombre en español', () => {
    // Las 7 del dock más las 13 que solo se alcanzan por atajo. El nombre sale
    // del catálogo del dock o de la etiqueta que `shortcuts/defaults.ts` ya
    // traía aprobada: ninguno se inventa aquí.
    const ESPERADO: Record<string, string> = {
      // dock
      select: 'Seleccionar',
      editPattern: 'Editar patrón',
      point: 'Punto',
      pen: 'Pluma',
      line: 'Línea',
      rectangle: 'Rectángulo',
      scissors: 'Tijeras',
      measure: 'Medir',
      seam: 'Coser',
      seamAllowance: 'Margen de costura',
      notch: 'Piquete',
      internalShape: 'Forma interna',
      grainline: 'Hilo',
      // solo atajo
      transform: 'Transformar patrón',
      circle: 'Elipse (círculo)',
      trace: 'Trazar',
      dart: 'Pinza',
      pin: 'Fijar',
      walkSeam: 'Recorrer costura',
      polyPen: 'Pluma poligonal',
      pomMeasure: 'Medir POM',
      offsetOutline: 'Desplazar contorno',
      extendTrim: 'Extender / recortar',
      topstitchFree: 'Pespunte libre',
      topstitchSeamline: 'Pespunte sobre costura',
      topstitchSegment: 'Pespunte por tramo',
      topstitchEdit: 'Editar pespunte',
    };

    for (const [id, nombre] of Object.entries(ESPERADO)) {
      const definicion = toolRegistry.getTool(id);
      expect(definicion, `${id} no está registrada`).toBeDefined();
      expect(definicion!.name, `${id}`).toBe(nombre);
    }
  });
});
