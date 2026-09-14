// @vitest-environment jsdom
/**
 * #1170 — ley § 5 del contrato de interfaz, en trinquete.
 *
 * > «si un atajo está en `src/shortcuts/defaults.ts`, el catálogo que lo
 * >  muestra tiene que declararlo igual»
 *
 * En el menú de Vina se rompía en el sentido inverso, que para María es igual
 * o peor: **el menú declaraba lo que el registro no tiene**. El censo del
 * 2026-09-14 dio 8 de 15 anuncios mal, en dos formas distintas:
 *
 * - Cuatro no los respaldaba nada: `⌘N` (Proyecto nuevo), `⌘1` (Zoom 100%, que
 *   además Chrome reserva y no se puede cancelar), `⌫` (Eliminar, registrado
 *   como Retroceso/Supr pero escrito de otra manera) y `⌘⇧A` (Quitar
 *   selección, que de verdad es **Escape** — la fila rompía las dos mitades de
 *   la ley a la vez: anunciaba una tecla muerta y escondía la viva).
 * - Cuatro anunciaban una tecla que **hace otra cosa**: `1`, `2` y `3` son
 *   presets de cámara 3D, y `G` es la herramienta Línea interna. Esa es la
 *   peor: María lee «Cuadrícula · G», pulsa G sobre el lienzo y entra a dibujar.
 *
 * Este test mira lo que se PINTA, no la estructura de datos, para que siga
 * valiendo si el menú cambia de forma por dentro.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { DEFAULT_SHORTCUTS } from '../../../shortcuts/defaults';
import { displayShortcutBinding } from '../shortcutDisplay';
import constructionReducer from '../../../store/constructionSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import dockReducer from '../../../store/dockSlice';
import editorReducer from '../../../store/editorSlice';
import projectReducer from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolsReducer from '../../../store/toolSlice';
import LogoMenu from '../LogoMenu';

vi.mock('../../../utils/export/uiExport', () => ({ runUiExport: vi.fn() }));
vi.mock('../../../utils/export/diagnosticExporter', () => ({ downloadDiagnosticBundle: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

/** Los siete cajones de primer nivel; el submenú solo se monta al pasarles el ratón. */
const CAJONES = ['Archivo', 'Edición', 'Vista', 'Patrón', 'Simulación', 'Preferencias', 'Ayuda'];

function anunciosDelMenu(): Array<{ label: string; rotulo: string }> {
  const store = configureStore({
    reducer: {
      editor: editorReducer, project: projectReducer, tools: toolsReducer,
      simulation: simulationReducer, dock: dockReducer,
      construction: constructionReducer, copilotUI: copilotUIReducer,
    },
  });
  render(<Provider store={store}><LogoMenu onOpenPanel={() => {}} onImportDXF={() => {}} /></Provider>);

  // Un solo clic: el botón ALTERNA el desplegable, así que clicar una vez por
  // cajón lo abre y lo cierra en alternancia y la mitad de los submenús no se
  // monta nunca. Costó un falso «el menú no lo enseña» sobre todo el cajón de
  // Edición.
  fireEvent.click(screen.getByRole('button', { name: /vina/i }));

  const vistos = new Map<string, string>();
  for (const cajon of CAJONES) {
    const entrada = screen.queryByText(cajon);
    if (!entrada) continue;
    fireEvent.mouseEnter(entrada);
    for (const el of Array.from(document.querySelectorAll('.logo-menu__shortcut'))) {
      const fila = el.closest('.logo-menu__item');
      const label = fila?.querySelector('.logo-menu__label')?.textContent?.trim();
      const rotulo = el.textContent?.trim();
      if (label && rotulo) vistos.set(label, rotulo);
    }
  }
  return [...vistos].map(([label, rotulo]) => ({ label, rotulo }));
}

/** La misma notación que pinta el menú, calculada desde el registro. */
const comoSeEscribe = (id: string) => {
  const def = DEFAULT_SHORTCUTS.find(d => d.id === id);
  return def ? displayShortcutBinding(def) : null;
};

describe('#1170 — el menú no anuncia atajos que no existen', () => {
  it('cada atajo que una entrada de menú enseña está declarado igual en el registro', () => {
    const anuncios = anunciosDelMenu();
    expect(anuncios.length, 'el barrido tiene que encontrar anuncios; si no, no mide nada').toBeGreaterThan(5);

    const escrituras = new Set(
      DEFAULT_SHORTCUTS.map(d => displayShortcutBinding(d)),
    );
    const mentiras = anuncios.filter(a => !escrituras.has(a.rotulo));

    expect(
      mentiras.map(m => `«${m.label}» dice ${m.rotulo}`),
      'un atajo anunciado y no registrado es, para quien lo lee, un atajo roto (ley § 5)',
    ).toEqual([]);
  });

  it('y lo que enseña es el atajo de ESA acción, no el de otra que comparte tecla', () => {
    // La mitad que el caso de arriba no ve: `1` sí está en el registro, pero es
    // «Vista 3/4 derecha» de la cámara 3D, no «Solo 2D». Coincidir en la
    // notación no basta; tiene que ser el atajo de la acción que la fila hace.
    const esperado: Record<string, string> = {
      'Deshacer': 'edit.undo',
      'Rehacer': 'edit.redo',
      'Duplicar': 'edit.duplicate',
      'Eliminar': 'edit.delete',
      'Seleccionar todo': 'selection.selectAll',
      'Quitar selección': 'selection.deselect',
      'Ajustar zoom al patrón': 'view.fitPattern',
      'Margen de costura': 'view.toggleSeamAllowance',
      'Iniciar simulación': 'sim.toggle',
    };

    const anuncios = anunciosDelMenu();
    const desajustes: string[] = [];
    for (const { label, rotulo } of anuncios) {
      const id = esperado[label];
      if (!id) {
        desajustes.push(`«${label}» anuncia ${rotulo} y no está en la lista de filas con atajo propio`);
        continue;
      }
      const suyo = comoSeEscribe(id);
      if (suyo !== rotulo) desajustes.push(`«${label}» dice ${rotulo} y su acción (${id}) es ${suyo}`);
    }
    for (const [label, id] of Object.entries(esperado)) {
      if (!anuncios.some(a => a.label === label)) {
        desajustes.push(`«${label}» tiene atajo (${id}) y el menú no lo enseña`);
      }
    }

    expect(desajustes, 'cada fila enseña el atajo de su propia acción, o no enseña ninguno').toEqual([]);
  });
});
