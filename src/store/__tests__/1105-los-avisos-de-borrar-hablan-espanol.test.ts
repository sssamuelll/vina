import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ley de idioma del contrato de interfaz, en el sitio donde más pesa: los
 * diálogos que preguntan antes de BORRAR.
 *
 * #1105 empezó por el copy del corte ("Eliminar" se leía como borrar la pieza)
 * y ese se arregló en la tanda 5a. El censo del 06-09 encontró a sus hermanos
 * intactos: «Remove Pattern Piece», «Merge pieces?», «Any seams and trims
 * attached to this piece will also be removed». Son las frases que María lee
 * justo antes de perder trabajo, y estaban en inglés.
 *
 * Es la forma de siempre: se arregló el sitio donde la usuaria señaló y no se
 * greparon los hermanos del mismo mecanismo.
 *
 * El test lee el TEXTO de los dos archivos que declaran esas cadenas, y trae su
 * propio control: si el censo deja de encontrar cadenas, falla en vez de pasar
 * en vacío. Importar las funciones no sirve: `getTitle` y `getConsequences` son
 * privadas del módulo.
 */

const ARCHIVOS = [
  'src/store/confirmationMiddleware.ts',
  'src/hooks/useGuardedAction.ts',
];

const COMILLA = /['`]([^'`\n]*\s[^'`\n]*)['`]/g;
/** Operadores: un trozo de código dentro de una plantilla lleva espacio y nadie lo lee. */
const ES_CODIGO = /(===|\|\||=>|&&)/;

/**
 * Toda cadena con un ESPACIO dentro. El texto que se lee siempre lo tiene; los
 * identificadores ('project/removePieces', 'splitPiece') nunca. La primera
 * versión de este censo miraba solo `clave: 'texto'` y se dejaba fuera las
 * viñetas de consecuencia, que van sueltas dentro de un array — un censo
 * parcial delata al detector, no al código.
 */
function cadenasQueSeLeen(ruta: string): string[] {
  const src = readFileSync(join(process.cwd(), ruta), 'utf8');
  const out: string[] = [];
  for (const bruta of src.split('\n')) {
    const linea = bruta.trim();
    if (linea.startsWith('//') || linea.startsWith('*') || linea.startsWith('/*')) continue;
    if (linea.startsWith('import ') || linea.includes(" from '")) continue;
    for (const m of linea.matchAll(COMILLA)) {
      const texto = m[1];
      if (ES_CODIGO.test(texto)) continue;
      if (texto !== texto.trim()) continue;
      out.push(texto);
    }
  }
  return out;
}

/** Palabras que solo aparecen en inglés — mismo criterio que `no-paso-nada`. */
const INGLES = /\b(remove|removed|delete|deleted|merge|merged|pieces?|seams?|will|be|also|attached|confirm|action|point|any|lines|curves|reference|break|single|both|replaced|construction)\b/i;

describe('#1105 — los avisos de borrar hablan el idioma de María', () => {
  const todas = ARCHIVOS.flatMap(cadenasQueSeLeen);

  it('el censo encuentra cadenas (control: si se rompe, esto falla)', () => {
    expect(todas.length).toBeGreaterThanOrEqual(10);
  });

  it('ninguna cadena que la usuaria lee está en inglés', () => {
    const enIngles = todas.filter(t => INGLES.test(t));
    expect(
      enIngles,
      `Estas cadenas se pintan en un diálogo y están en inglés:\n  ${enIngles.join('\n  ')}`,
    ).toEqual([]);
  });

  it('el respaldo genérico no deja escapar ni el inglés ni el identificador', () => {
    const src = readFileSync(join(process.cwd(), 'src/store/confirmationMiddleware.ts'), 'utf8');
    expect(src).not.toContain("'Confirm Action'");
    const guarded = readFileSync(join(process.cwd(), 'src/hooks/useGuardedAction.ts'), 'utf8');
    // «Confirm removeThing?» era inglés Y nombre de objeto: las dos mitades.
    expect(guarded).not.toContain('Confirm ${operationName}');
  });
});
