import { describe, it, expect } from 'vitest';
import { BAR_ICONS } from '../barIcons';
import { ACTIONS, CURATION, BAR_ENABLED_KINDS } from '../actionCuration';

describe('BAR_ICONS — mapa monocromo propio de la barra (A4)', () => {
  it('cubre TODO ActionId alcanzable por una fila bar de BAR_ENABLED_KINDS', () => {
    for (const row of CURATION) {
      if (!BAR_ENABLED_KINDS.has(row.targetKind)) continue;
      for (const id of row.bar) {
        expect(BAR_ICONS[id], `sin ícono monocromo para el id de barra: ${id}`).toBeDefined();
      }
    }
  });

  it('cada valor es un componente de ícono renderizable (no un string)', () => {
    for (const key of Object.keys(BAR_ICONS)) {
      const Icon = BAR_ICONS[key as keyof typeof BAR_ICONS];
      // lucide expone forwardRef → typeof 'object'; nunca un string (eso es el emoji del menú)
      expect(typeof Icon === 'object' || typeof Icon === 'function').toBe(true);
      expect(typeof Icon).not.toBe('string');
    }
  });

  it('NO toca ActionDef.icon: el menú conserva su emoji (cero regresión)', () => {
    expect(ACTIONS.rotate90.icon).toBe('↻');
    expect(ACTIONS.lockToggle.icon).toBe('🔒');
    expect(ACTIONS.groupCreate.icon).toBe('📁');
    // el ícono de barra es un componente aparte, distinto del glifo emoji del menú
    expect(BAR_ICONS.rotate90).toBeTruthy();
    expect(BAR_ICONS.rotate90).not.toBe(ACTIONS.rotate90.icon);
  });
});
