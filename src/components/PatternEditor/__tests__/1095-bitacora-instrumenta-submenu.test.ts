// @vitest-environment jsdom
/**
 * #1095 ronda 2 — hallazgo del review adversarial (Serrano + Halberg): las
 * acciones dentro de un submenú (Orden, Capa, Duplicar…) nunca pasaban por
 * `pushJournal` — ContextMenu solo instrumenta la rama de botones planos.
 * "duplicate", "cloneLinkedSymmetry" y "cloneLinkedInstance" SÍ quedaban
 * en la bitácora en `main`; al plegarse en un submenú, desaparecían.
 * Esto contradice el principio de Samuel del 2026-08-29: "toda superficie
 * nueva nace instrumentada" — la caja negra tiene que verlo todo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { instrumentSubmenuItems } from '../menuInstrumentation';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';

beforeEach(() => clearJournal());

describe('#1095 ronda 2 — instrumentSubmenuItems: la bitácora ve las acciones plegadas', () => {
  it('envuelve cada action para que dispare ui/menu:action con el id del padre', () => {
    const real = vi.fn();
    const items = instrumentSubmenuItems('duplicateGroup', [{ label: 'Duplicar', action: real }]);
    items[0].action!();

    expect(real).toHaveBeenCalledTimes(1);
    const { events: eventos } = getJournal();
    const evento = eventos.find(e => e.kind === 'ui' && e.name === 'menu:action');
    expect(evento).toBeDefined();
    expect(evento?.data).toMatchObject({ id: 'duplicateGroup' });
  });

  it('preserva el resto de campos del item (label, disabled, separator)', () => {
    const items = instrumentSubmenuItems('order', [
      { label: 'Traer al frente', action: vi.fn(), separator: true, disabled: false },
    ]);
    expect(items[0]).toMatchObject({ label: 'Traer al frente', separator: true, disabled: false });
  });

  it('un ítem sin action (separador puro, si existiera) no revienta', () => {
    const items = instrumentSubmenuItems('order', [{ label: 'sep', separator: true }]);
    expect(items[0].action).toBeUndefined();
  });

  it('cada ítem dispara su propio evento — dos clics, dos entradas', () => {
    const items = instrumentSubmenuItems('duplicateGroup', [
      { label: 'Duplicar', action: vi.fn() },
      { label: 'Con edición vinculada – simetría', action: vi.fn() },
    ]);
    items[0].action!();
    items[1].action!();
    const eventos = getJournal().events.filter(e => e.kind === 'ui' && e.name === 'menu:action');
    expect(eventos).toHaveLength(2);
  });
});
