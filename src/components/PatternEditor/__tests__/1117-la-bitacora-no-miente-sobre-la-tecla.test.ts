import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * E-3 de la escalera de Escape (spec 2026-09-06 § 3): la bitácora mentía.
 *
 * El enrutador de captura anota en la bitácora QUIÉN consumió cada tecla. Cinco
 * ramas —punto, piquete, margen, coser y transformar— llamaban a su
 * `handleKeyDown` y devolvían `null`, así que la caja negra registraba
 * `consumedBy: null` sobre una tecla que sí se consumió. «La caja negra debe
 * verlo todo» incluye no mentir sobre lo que vio.
 *
 * El arreglo no es cosmético y tiene un matiz que la spec no separa: cuatro de
 * las cinco ramas están detrás de una guarda (`armed`, `isArmed()`,
 * `isDragging`), así que si se entra, se consume — devolver el nombre es
 * verdad. La quinta, coser, NO tenía guarda: su propio comentario dice «si no
 * hay nada que cancelar, el Esc fluye normal». Devolver 'seam' ahí habría sido
 * cambiar una mentira por la contraria, así que su `handleKeyDown` pasó al
 * protocolo P1 y ahora dice si consumió.
 *
 * Censo sobre el texto, con control propio: si deja de encontrar ramas, falla.
 */

const FUENTE = readFileSync(
  join(process.cwd(), 'src/components/PatternEditor/useEditorInteractions.ts'),
  'utf8',
);

/** El enrutador entero: desde el tipo `KeyConsumer` hasta `onKeyCapture`. */
function cuerpoDeRouteKey(): string {
  const i = FUENTE.indexOf('type KeyConsumer');
  expect(i, 'no encontré el tipo KeyConsumer').toBeGreaterThan(0);
  return FUENTE.slice(i, FUENTE.indexOf('const onKeyCapture', i));
}

const ROUTE = cuerpoDeRouteKey();

describe('E-3 — la bitácora dice quién se quedó la tecla', () => {
  it('el censo ve el enrutador (control)', () => {
    expect(ROUTE.length).toBeGreaterThan(1500);
    expect(ROUTE).toContain('type KeyConsumer');
  });

  it('las cinco herramientas que consumían en silencio ya se nombran', () => {
    for (const nombre of ['point', 'notch', 'seamAllowance', 'seam', 'transform']) {
      expect(
        ROUTE.includes(`'${nombre}'`),
        `${nombre} consume la tecla y no aparece en el tipo KeyConsumer ni en su return`,
      ).toBe(true);
    }
  });

  it('ninguna rama llama a un handleKeyDown y devuelve null justo después', () => {
    // El patrón exacto del defecto: `xTool.handleKeyDown(e);` seguido de
    // `return null;` sin nada en medio.
    const mentiras = [...ROUTE.matchAll(/(\w+)\.handleKeyDown\(e\);\s*\n\s*return null;/g)]
      .map(m => m[1]);
    expect(
      mentiras,
      'estas ramas consumen la tecla y le dicen a la bitácora que no fue nadie',
    ).toEqual([]);
  });

  it('coser pasó al protocolo P1: su handleKeyDown dice si consumió', () => {
    const coser = readFileSync(
      join(process.cwd(), 'src/components/PatternEditor/useFreeSewingTool.ts'),
      'utf8',
    );
    const i = coser.indexOf('const handleKeyDown');
    expect(i, 'no encontré handleKeyDown en coser').toBeGreaterThan(0);
    const cuerpo = coser.slice(i, coser.indexOf('}, [', i));
    expect(cuerpo).toContain('return true');
    expect(cuerpo).toContain('return false');
  });
});
