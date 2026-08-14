import { describe, it, expect } from 'vitest';
import { DOCK_2D_CATALOG } from '../dock2dTools';
import { DEFAULT_DOCK_2D_IDS } from '../../../store/dockSlice';
import { DEFAULT_SHORTCUTS } from '../../../shortcuts/defaults';

/**
 * Ley de puertas (§ 5.6 del informe 2026-08-14):
 *
 *     Una función que se despacha tiene una puerta visible en el shell.
 *     Si solo se llega por la paleta de comandos —o por un atajo que nadie
 *     muestra— no está terminada.
 *
 * Dos defectos medidos que originan estos tests:
 *
 * 1. `notch` (Piquete) y `seamAllowance` (Margen de costura) —las dos
 *    herramientas de #1027 y #1029— no estaban en el dock por defecto. Para
 *    llegar a Piquete había que abrir el personalizador y agregarla a mano.
 *
 * 2. Peor: `tool.notch` SÍ tenía atajo registrado (Shift+N, defaults.ts) pero
 *    el catálogo del dock no lo declaraba, así que la interfaz nunca lo mostró.
 *    Dos fuentes de verdad para el mismo atajo, en desacuerdo, y la que ve la
 *    usuaria era la que estaba vacía.
 */

/** `tool.notch` → `notch`, `tool3d.pin` → (no es 2D, se ignora). */
const idDeHerramienta = (shortcutId: string) =>
  shortcutId.startsWith('tool.') ? shortcutId.slice('tool.'.length) : null;

const atajoRegistrado = new Map<string, { key: string; shift?: boolean }>();
for (const s of DEFAULT_SHORTCUTS) {
  const id = idDeHerramienta(s.id);
  if (id && !atajoRegistrado.has(id)) atajoRegistrado.set(id, { key: s.key, shift: s.shift });
}

describe('las herramientas que María pidió tienen puerta en el dock', () => {
  it.each(['notch', 'seamAllowance'])('%s viene en el dock por defecto', (id) => {
    expect(
      DEFAULT_DOCK_2D_IDS as readonly string[],
      `${id} no está en el dock por defecto: solo se llega abriendo el personalizador`,
    ).toContain(id);
  });
});

describe('el atajo que existe es el atajo que se muestra', () => {
  it('ninguna herramienta del catálogo esconde un atajo que sí está registrado', () => {
    const escondidos = DOCK_2D_CATALOG
      .filter((t) => atajoRegistrado.has(t.id) && !t.shortcut)
      .map((t) => {
        const a = atajoRegistrado.get(t.id)!;
        return `${t.id} (${t.label}) tiene ${a.shift ? 'Shift+' : ''}${a.key.toUpperCase()} registrado y no lo declara`;
      });
    expect(escondidos, escondidos.join(' · ')).toEqual([]);
  });

  it('ningún atajo declarado en el catálogo contradice al registro', () => {
    const contradicciones: string[] = [];
    for (const t of DOCK_2D_CATALOG) {
      const a = atajoRegistrado.get(t.id);
      if (!a || !t.shortcut) continue;
      // El catálogo escribe '⇧L' para shift+l, 'Z' para z.
      const esperado = `${a.shift ? '⇧' : ''}${a.key.toUpperCase()}`;
      if (t.shortcut !== esperado) {
        contradicciones.push(`${t.id}: catálogo dice "${t.shortcut}", registro dice "${esperado}"`);
      }
    }
    expect(contradicciones, contradicciones.join(' · ')).toEqual([]);
  });
});
