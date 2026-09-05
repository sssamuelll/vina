import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { faltaSujeto, HERRAMIENTAS_QUE_PIDEN_PIEZA } from '../cotas/sujeto';

/**
 * Revisión adversarial de UI del 2026-09-04, hallazgo G (issue #1117).
 *
 * De los 24 ganchos de herramienta 2D, **19 hacen `return` mudo** cuando el
 * clic no encuentra sujeto. Para la mayoría eso está bien: son herramientas de
 * hit-test y "no había nada bajo el cursor" es información que el cursor ya da.
 *
 * Pero cuatro toman el sujeto de la SELECCIÓN, no del cursor, y esas mueren en
 * silencio de verdad: María entra en la herramienta, hace clic sobre la pieza,
 * y no pasa nada, porque la pieza no estaba *seleccionada*. Dos de ellas están
 * en #1117 con nombre y apellido.
 *
 *   offsetOutline   `useOffsetTool.ts:41`         selectedPieceIds.length !== 1
 *   slashAndSpread  `useSlashAndSpreadTool.ts:183` selectedPieceIds[0] ?? null
 *   extendTrim      `useExtendTrimTool.ts:186`     selectedPieceIds.length !== 1
 *   transform       `useTransformTool.ts:66`       bbox de selectedPieceIds
 *
 * Dos de ellas hasta guardan un mensaje de error… en inglés y sin pintar:
 * `useOffsetTool.ts:57` guarda 'Select a single piece to offset' y
 * `PatternEditor.tsx` solo consume `previewOutline`.
 *
 * Por qué NO se usa `requiresSelection` de las definiciones como puerta
 * (medido, y por poco me lo trago): esa metadata es del copiloto, no del
 * ratón. `seamAllowance` declara `requiresSelection: 'piece'` y funciona
 * perfectamente sin ninguna selección, por hit-test; lo mismo `grainline`,
 * `internalShape` y `point`. Usarla como gate pondría un cartel de "selecciona
 * una pieza" sobre cuatro herramientas que no lo necesitan.
 *
 * La regla, ejecutable: **una herramienta que necesita una pieza seleccionada
 * lo dice en la tira ANTES del clic**, no después, y no con un silencio.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 4.
 */

describe('G — la tira dice qué falta antes de que María haga clic', () => {
  it.each([...HERRAMIENTAS_QUE_PIDEN_PIEZA])(
    '%s sin selección pide una pieza, en español y nombrándose',
    (tool) => {
      const msg = faltaSujeto(tool, []);
      expect(msg, `${tool} no dice nada`).toBeTruthy();
      expect(msg!.toLowerCase()).toContain('selecciona');
      // Que nombre la herramienta: "selecciona una pieza" a secas no enseña
      // en cuál de las cuatro está parada.
      expect(msg!.length).toBeGreaterThan(24);
      // El guardián de idioma caza el inglés genérico. Hasta el 2026-09-05
      // tenía que abrirle un hueco a un nombre propio: la herramienta se
      // llamaba "Slash & Spread" en el dock, en la tira y en la paleta, y
      // escribir otro nombre solo aquí habría roto la ley de
      // un-término-por-concepto, que es peor. Esa deuda se pagó donde tocaba,
      // en el registro y no en esta frase: hoy se llama "Abrir la pieza", y la
      // pista ni la nombra, porque el nombre YA es el verbo. Con la deuda se va
      // la excepción: el guardián vuelve a mirar la pista entera.
      // La primera versión (`/\b(select|piece|first|tool)\b/i`) no veía "Slash"
      // ni "Spread" y habría dejado pasar cualquier nombre inglés inventado
      // aquí; esta sí.
      expect(msg!, 'inglés colado en la pista')
        .not.toMatch(/\b(select|piece|first|tool|slash|spread|offset|extend|trim|transform|outline)\b/i);
    },
  );

  it.each([...HERRAMIENTAS_QUE_PIDEN_PIEZA])('%s con una pieza seleccionada se calla', (tool) => {
    expect(faltaSujeto(tool, ['p1'])).toBeNull();
  });

  it('las que trabajan sobre UNA sola pieza lo dicen cuando hay varias', () => {
    // offset, extendTrim: `selectedPieceIds.length !== 1` — con dos, mueren
    // igual de silenciosas que con cero.
    for (const tool of ['offsetOutline', 'extendTrim']) {
      const msg = faltaSujeto(tool, ['p1', 'p2']);
      expect(msg, `${tool} con dos piezas seleccionadas no avisa`).toBeTruthy();
      expect(msg!.toLowerCase()).toMatch(/una sola|solo una|una pieza/);
    }
  });

  it('transformar sí acepta varias piezas', () => {
    expect(faltaSujeto('transform', ['p1', 'p2'])).toBeNull();
  });

  it('las herramientas de hit-test NO reciben ningún cartel', () => {
    // La red contra el arreglo perezoso: poner el cartel en todas sería peor
    // que el silencio. Estas funcionan sin selección y están medidas.
    for (const tool of ['select', 'pen', 'rectangle', 'seamAllowance', 'grainline',
      'internalShape', 'point', 'scissors', 'measure', 'seam', 'seamEdit', 'notch']) {
      expect(faltaSujeto(tool, []), `${tool} no debería pedir selección`).toBeNull();
    }
  });

  it('la lista son exactamente las cuatro medidas', () => {
    expect([...HERRAMIENTAS_QUE_PIDEN_PIEZA].sort())
      .toEqual(['extendTrim', 'offsetOutline', 'slashAndSpread', 'transform']);
  });
});

describe('G — los mensajes muertos en inglés se van', () => {
  const lee = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');

  it.each([
    ['src/components/PatternEditor/useOffsetTool.ts', 'Select a single piece to offset'],
    ['src/components/PatternEditor/useExtendTrimTool.ts', 'Failed to extend edge'],
  ])('%s ya no guarda "%s"', (ruta, frase) => {
    expect(lee(ruta), `sigue ahí: una cadena que nadie pinta y que violaría la ley de idioma si alguien la pintara`)
      .not.toContain(frase);
  });
});
