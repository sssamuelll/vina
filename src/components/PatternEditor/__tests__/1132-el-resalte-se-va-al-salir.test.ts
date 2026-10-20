import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Trinquete de #1132 — «el resaltado de hover se queda pegado al salir del
 * lienzo».
 *
 * El primer arreglo cubrió Margen y solo Margen. El censo del 06-09 encontró
 * **catorce** hooks de herramienta con estado de hover y **uno** cableado a
 * `handleMouseLeave`: exactamente la forma de «arreglar la mitad parte el
 * dibujo». Coser y Editar costuras entraron en esta tanda porque son los que
 * María nombró; los demás quedan como deuda DECLARADA, no como olvido.
 *
 * El trinquete cuenta. Si alguien añade un hook con hover y no lo cablea, el
 * número sube y esto falla. Bajarlo (cablear uno más) exige tocar `TECHO`
 * a mano — la misma disciplina que `deuda-espacio-de-pieza.js`.
 *
 * Es un censo sobre el TEXTO, con su propio control: si el regex deja de
 * encontrar hooks, falla ruidosamente en vez de pasar en vacío. Montar
 * `useEditorInteractions` de verdad exigiría simular las 25 herramientas.
 */

const DIR = join(process.cwd(), 'src/components/PatternEditor');

/** Hooks de herramienta que guardan algún resalte de hover en estado propio. */
function hooksConHover(): string[] {
  return readdirSync(DIR)
    .filter(f => /^use[A-Z].*\.ts$/.test(f))
    // El anfitrión no cuenta: `hoverCursor` es el cursor del lienzo, no un
    // resalte pintado, y es quien LLAMA a los demás.
    .filter(f => f !== 'useEditorInteractions.ts')
    .filter(f => {
      const src = readFileSync(join(DIR, f), 'utf8');
      // Dos formas del mismo estado: setter propio (`setHover`, `setHoveredX`)
      // o campo `hovered*` dentro del objeto de estado del hook. La primera
      // versión de este censo solo miraba `setHovered` y se le escapaba
      // `useSeamAllowanceTool` — que era justo el hook YA arreglado.
      return /const \[[^\]]*,\s*set[Hh]over[A-Za-z]*\s*\]\s*=\s*useState/.test(src)
        || /hovered[A-Za-z]*\s*:/.test(src);
    })
    .sort();
}

/** Los que ya se limpian cuando el ratón sale: exponen `limpiarHover`. */
function hooksQueLimpian(censo: string[]): string[] {
  return censo.filter(f => /limpiarHover/.test(readFileSync(join(DIR, f), 'utf8')));
}

const CENSO = hooksConHover();
const LIMPIAN = hooksQueLimpian(CENSO);
const SIN_LIMPIAR = CENSO.filter(f => !LIMPIAN.includes(f));

/**
 * Deuda declarada: hooks con hover que TODAVÍA no se limpian al salir. Llegó a
 * cero el 13-10 (T#212 + #1132): las nueve que quedaban se cablearon juntas.
 * Un hook nuevo con hover nace con su `limpiarHover`.
 */
const TECHO = 0;

describe('#1132 — trinquete del resalte que se queda pegado', () => {
  it('el censo encuentra hooks (control: si el regex se rompe, esto falla)', () => {
    expect(CENSO.length).toBeGreaterThanOrEqual(14);
  });

  it('la deuda de hooks sin limpiar no sube', () => {
    expect(
      SIN_LIMPIAR.length,
      `Hooks con hover que no se limpian al salir del lienzo:\n  ${SIN_LIMPIAR.join('\n  ')}\n` +
      `Si acabas de cablear uno, baja TECHO a ${SIN_LIMPIAR.length}. Si añadiste un hook ` +
      'con hover, dale su `limpiarHover` y llámalo desde `handleMouseLeave`.',
    ).toBeLessThanOrEqual(TECHO);
  });

  it('los tres que María nombró están cableados', () => {
    for (const hook of ['useSeamAllowanceTool.ts', 'useSeamEditTool.ts', 'useFreeSewingTool.ts']) {
      expect(LIMPIAN, `${hook} debería limpiar su hover`).toContain(hook);
    }
  });

  it('`handleMouseLeave` llama a los tres, no solo a uno', () => {
    const src = readFileSync(join(DIR, 'useEditorInteractions.ts'), 'utf8');
    const i = src.indexOf('const handleMouseLeave');
    expect(i, 'no encontré handleMouseLeave').toBeGreaterThan(0);
    const cuerpo = src.slice(i, src.indexOf('}, [', i));
    for (const llamada of ['seamAllowanceTool.limpiarHover', 'seamEditTool.limpiarHover', 'seamTool.limpiarHover']) {
      expect(cuerpo, `handleMouseLeave debería llamar a ${llamada}`).toContain(llamada);
    }
  });

  it('`handleMouseLeave` llama a un `limpiarHover` por cada hook del censo', () => {
    // Tener `limpiarHover` no basta: un hook que lo expone y nadie llama
    // sigue dejando el resalte. Una llamada por hook, contadas en el cuerpo.
    const src = readFileSync(join(DIR, 'useEditorInteractions.ts'), 'utf8');
    const i = src.indexOf('const handleMouseLeave');
    const cuerpo = src.slice(i, src.indexOf('}, [', i));
    const llamadas = cuerpo.match(/\.limpiarHover\b/g) ?? [];
    expect(llamadas.length, `limpiarHover llamados en handleMouseLeave: ${llamadas.length}`).toBe(CENSO.length);
  });
});
