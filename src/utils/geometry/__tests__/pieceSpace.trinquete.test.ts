/**
 * Trinquete de la conversión entre espacio de patrón y espacio de pieza.
 *
 * Cuenta los sitios de deuda de #1068 y falla si un archivo sube su cuenta,
 * si aparece un archivo nuevo, o si uno baja y nadie fijó el techo nuevo.
 *
 * ── Qué cambió, y por qué ──────────────────────────────────────────────────
 * Este trinquete tenía su propio detector: un juego de expresiones regulares
 * sobre líneas de texto. Llegó a acumular SIETE rodeos documentados —la suma
 * frente a la resta, la propiedad anidada a la derecha del operador, el
 * encadenamiento opcional, el alias de la coordenada, el alias del objeto
 * entero, la coalescencia inline— y cada vez que se cerraba uno aparecían
 * sitios que ningún censo anterior había visto. Todos eran el mismo error de
 * fondo: leer texto en vez de leer la forma.
 *
 * El detector vive ahora en `eslint-rules/rules/conversion-espacio-de-pieza.js`
 * como regla de AST, donde esos siete dejan de ser casos que recordar y pasan
 * a ser imposibles por construcción. Los siete están pinados como casos
 * `invalid` en `eslint-rules/tests/conversion-espacio-de-pieza.test.js`; acá
 * ya no se prueba la detección, solo se cuenta.
 *
 * Al portarla se midieron las dos unidades sobre el mismo árbol: el AST
 * encuentra exactamente las mismas 57 LÍNEAS en los mismos 21 archivos que
 * veía el regex, y las parte en 71 EXPRESIONES. No es deuda nueva; es la misma
 * deuda vista con mejor lupa. Los techos de `deuda-espacio-de-pieza.js` están
 * en expresiones.
 *
 * El único rodeo que sobrevive es el 8º, y ningún detector estático puede
 * verlo: la posición pasada como parámetro suelto. Una función que recibe
 * `Point2D` de posición y `PathCommand[]` de contorno por separado ya perdió
 * el giro, y tanto el regex como la regla dirán que está limpia. Se cierra
 * cambiando la firma para que pida la pieza entera; eso es revisión humana.
 *
 * Cross-ref: #1068, `src/utils/geometry/pieceSpace.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
// @ts-expect-error — el plugin local es JS sin tipos; su forma la fija su propio test.
import regla from '../../../../eslint-rules/rules/conversion-espacio-de-pieza.js';
// @ts-expect-error — idem.
import { TECHOS } from '../../../../eslint-rules/deuda-espacio-de-pieza.js';

const RAIZ = 'src';

const techos = TECHOS as Record<string, number>;

const linter = new Linter();

const CONFIG = {
  files: ['**/*.{ts,tsx}'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
  },
  plugins: { vina: { rules: { conversion: regla } } },
  rules: { 'vina/conversion': 'error' },
  // El censo mide la deuda TAL CUAL ES, así que ignora el bloque de override
  // de `eslint.config.js` que apaga la regla en los archivos con deuda. Si
  // usara la config del repo contaría cero en los 21 archivos que vigila.
} as unknown as Parameters<Linter['verify']>[1];

function* archivos(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') yield* archivos(p);
      continue;
    }
    if (/\.tsx?$/.test(e.name)) yield p;
  }
}

/**
 * Cuenta los sitios por archivo. Prefiltra por `.position` antes de parsear:
 * de 1.332 archivos solo 107 pueden contener la forma, y parsear el resto
 * costaría diez veces más sin cambiar ni un número.
 */
function censo(): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const f of archivos(RAIZ)) {
    const rel = relative('.', f).split(sep).join('/');
    const code = readFileSync(f, 'utf8');
    if (!code.includes('.position')) continue;
    const n = linter.verify(code, CONFIG, rel).filter(m => m.ruleId === 'vina/conversion').length;
    if (n) cuenta[rel] = n;
  }
  return cuenta;
}

describe('trinquete: la conversión patrón ↔ local pasa por el helper', () => {
  const hoy = censo();

  it('ningún archivo sube su cuenta ni aparece uno nuevo', () => {
    const subidas = Object.entries(hoy)
      .filter(([f, n]) => n > (techos[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} (techo ${techos[f] ?? 0}) — usa pieceLocalToPattern / patternToPieceLocal`);
    expect(subidas).toEqual([]);
  });

  it('los techos que bajaron están fijados', () => {
    // Si arreglas un sitio, el techo tiene que bajar con él. Sin esto, el
    // margen ganado queda disponible para el próximo que lo rompa. Y bajar el
    // techo a 0 significa BORRAR la fila: es lo que devuelve la regla al
    // archivo en eslint.config.js, no solo lo que actualiza el número.
    const flojos = Object.entries(techos)
      .filter(([f, techo]) => (hoy[f] ?? 0) < techo)
      .map(([f, techo]) => `${f}: quedan ${hoy[f] ?? 0}, el techo dice ${techo} — bájalo (o quita la fila si es 0)`);
    expect(flojos).toEqual([]);
  });

  it('el censo alcanza los rincones donde vive la deuda', () => {
    // Un censo que no recorre no mide. El regex anterior tuvo este bug: se
    // quedaba en el primer nivel de components/PatternEditor/.
    const vistos = Object.keys(hoy);
    expect(vistos.some(f => f.includes('/renderers/overlays/'))).toBe(true);
    expect(vistos.some(f => f.startsWith('src/utils/'))).toBe(true);
    expect(vistos.some(f => f.startsWith('src/store/'))).toBe(true);
    expect(vistos.some(f => f.startsWith('src/copilot/'))).toBe(true);
  });
});
