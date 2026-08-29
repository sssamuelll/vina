import { describe, it, expect } from 'vitest';
import { toolRegistry } from '../index';
import { DOCK_2D_CATALOG } from '../../components/shell/dock2dTools';
import { DEFAULT_SHORTCUTS } from '../../shortcuts';

/**
 * Un nombre por herramienta, y en español (#1049).
 *
 * Había DOS fuentes de nombre y nadie lo notaba porque nunca aparecían juntas
 * en pantalla: el dock decía "Pluma" y `shortcuts/defaults.ts` decía "Polígono
 * (pluma)", para la misma herramienta. La barra de opciones las pone al lado.
 *
 * El alcance de este guardia es **todo lo que la usuaria puede activar**, no
 * "lo que tiene opciones". La distinción costó un defecto: la primera versión
 * se ató a las 20 herramientas con opciones, y la barra pinta el NOMBRE de
 * cualquiera — incluidas cuatro que quedaron en inglés o como identificador
 * crudo (`seamEdit`, `editCurve`, `editConstrain`, `merge`). `seamEdit` está en
 * el dock de fábrica: se llegaba a ver la palabra `seamEdit` en pantalla.
 */

/** Todo id de herramienta 2D que la usuaria puede activar: el catálogo del
 *  dock más los atajos de teclado. Son las dos puertas que existen. */
function idsAlcanzables(): string[] {
  const delDock = DOCK_2D_CATALOG.map((e) => e.id);
  const deAtajos = DEFAULT_SHORTCUTS
    .filter((s) => s.id.startsWith('tool.') && s.context === '2d')
    .map((s) => s.id.slice('tool.'.length));
  return [...new Set([...delDock, ...deAtajos])].sort();
}

/** El nombre español de cada herramienta alcanzable. Ninguno se inventa: sale
 *  del catálogo del dock (lo que ella acaba de clicar) o de la etiqueta que
 *  `shortcuts/defaults.ts` ya traía aprobada. */
const NOMBRES: Record<string, string> = {
  circle: 'Elipse (círculo)',
  dart: 'Pinza',
  editConstrain: 'Editar curvatura',
  editCurve: 'Editar punto de curva',
  editPattern: 'Editar patrón',
  extendTrim: 'Extender / recortar',
  grainline: 'Hilo',
  internalShape: 'Línea interna',
  measure: 'Medir',
  merge: 'Unir patrones',
  notch: 'Piquete',
  offsetOutline: 'Desplazar contorno',
  pen: 'Pluma',
  pin: 'Fijar',
  point: 'Punto',
  pomMeasure: 'Medir POM',
  rectangle: 'Rectángulo',
  scissors: 'Tijeras',
  seam: 'Coser',
  seamAllowance: 'Margen de costura',
  seamEdit: 'Editar costuras',
  select: 'Seleccionar',
  topstitchEdit: 'Editar pespunte',
  topstitchFree: 'Pespunte libre',
  topstitchSeamline: 'Pespunte sobre costura',
  topstitchSegment: 'Pespunte por tramo',
  trace: 'Trazar',
  transform: 'Transformar patrón',
  walkSeam: 'Recorrer costura',
};

describe('nombres de herramienta', () => {
  it('toda herramienta alcanzable está en la tabla de nombres', () => {
    // Si mañana alguien mete una herramienta al dock o le pone un atajo y no
    // le pone nombre aquí, esto falla — y sin esto la barra pintaría su id.
    const sinNombre = idsAlcanzables().filter((id) => !NOMBRES[id]);
    expect(sinNombre).toEqual([]);
  });

  it('toda herramienta alcanzable tiene definición registrada', () => {
    // La barra hace `definicion?.name ?? herramientaActiva`: sin definición
    // pinta el identificador crudo.
    const sinDefinicion = idsAlcanzables().filter((id) => !toolRegistry.getTool(id));
    expect(sinDefinicion).toEqual([]);
  });

  it('la definición dice el nombre español', () => {
    for (const id of idsAlcanzables()) {
      expect(toolRegistry.getTool(id)!.name, id).toBe(NOMBRES[id]);
    }
  });

  it('el dock dice lo mismo que la definición', () => {
    for (const entrada of DOCK_2D_CATALOG) {
      expect(entrada.label, `dock: ${entrada.id}`).toBe(NOMBRES[entrada.id]);
    }
  });

  it('la tabla de atajos dice lo mismo que la definición', () => {
    // La tercera fuente. Hoy `ShortcutDef.label` no se pinta en ninguna vista,
    // pero está vivo y la próxima pantalla de atajos lo destaparía: el dock
    // decía "Pluma" y esto decía "Polígono (pluma)".
    for (const atajo of DEFAULT_SHORTCUTS) {
      if (!atajo.id.startsWith('tool.') || atajo.context !== '2d') continue;
      const id = atajo.id.slice('tool.'.length);
      expect(atajo.label, `atajo: ${atajo.id}`).toBe(NOMBRES[id]);
    }
  });
});
