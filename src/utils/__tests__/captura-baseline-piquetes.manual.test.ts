/**
 * Herramienta manual de captura de evidencia; NO es un test de regresión.
 * Ejecutar a mano con:
 * npx vitest run src/utils/__tests__/captura-baseline-piquetes.manual.test.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importDXFContent } from '../dxf';
import { resolveNotchAnchor } from '../notchAnchor';

const REPO_ROOT = resolve(__dirname, '../../..');
const SOURCE_RELATIVE_PATH = 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf';
const SOURCE_PATH = resolve(REPO_ROOT, SOURCE_RELATIVE_PATH);
const OUTPUT_PATH = resolve(REPO_ROOT, 'docs/reports/2026-08-12-baseline-piquetes-maria.json');

describe('captura manual del baseline de piquetes de María', () => {
  it('escribe las posiciones resueltas actuales como evidencia JSON', () => {
    const { pieces } = importDXFContent(readFileSync(SOURCE_PATH, 'utf8'), {
      unit: 'auto',
      autoDetect: true,
    });
    const totalPiquetes = pieces.reduce(
      (total, piece) => total + piece.internals.filter(line => line.type === 'notch').length,
      0,
    );

    const piquetes = pieces.flatMap(piece => piece.internals
      .filter(line => line.type === 'notch' && line.notchAnchor)
      .map(line => {
        const anchor = line.notchAnchor!;
        const resolved = resolveNotchAnchor(piece.outline, anchor);

        expect(resolved, `No se pudo resolver el piquete ${line.id} de ${piece.name}`).not.toBeNull();
        if (!resolved) {
          throw new Error(`No se pudo resolver el piquete ${line.id} de ${piece.name}`);
        }

        return {
          // Los ids son UUID nuevos en CADA importación: no sirven para
          // emparejar el antes con el después. `clave` sí — el nombre de la
          // pieza y el ancla son deterministas dado el mismo DXF, y el ancla
          // es justamente lo que se re-deriva.
          clave: `${piece.name}|${anchor.refPoint.x},${anchor.refPoint.y}|${anchor.direction}|${anchor.distanceMm}`,
          piezaId: piece.id,
          piezaNombre: piece.name,
          piqueteId: line.id,
          ancla: {
            refPoint: { x: anchor.refPoint.x, y: anchor.refPoint.y },
            direction: anchor.direction,
            distanceMm: anchor.distanceMm,
          },
          posicionResuelta: { x: resolved.point.x, y: resolved.point.y },
          normalResuelta: { x: resolved.normal.x, y: resolved.normal.y },
        };
      }));

    expect(piquetes.length).toBeGreaterThan(0);
    expect(piquetes).toHaveLength(totalPiquetes);
    expect(piquetes.some(({ posicionResuelta }) =>
      !Number.isInteger(posicionResuelta.x) || !Number.isInteger(posicionResuelta.y))).toBe(true);

    const baseline = {
      capturadoEn: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      }).trim(),
      fuente: SOURCE_RELATIVE_PATH,
      totalPiezas: pieces.length,
      totalPiquetesConAncla: piquetes.length,
      piquetes,
    };

    // Un baseline solo vale si se capturó ANTES del cambio. Correr esto
    // después machacaría el oráculo con el resultado nuevo y la comparación
    // pasaría siempre — el fallo se vería como un éxito. Para volver a
    // capturarlo hay que borrar el archivo a mano y decir por qué.
    if (existsSync(OUTPUT_PATH)) {
      throw new Error(
        `El baseline ya existe: ${OUTPUT_PATH}\n` +
        'No se sobrescribe. Para COMPARAR contra él, usa el script de comparación.\n' +
        'Para re-capturarlo (solo si sabes que el anterior ya no vale), bórralo a mano primero.',
      );
    }

    writeFileSync(OUTPUT_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  });
});
