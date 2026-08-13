/**
 * La promesa de la tanda 2a (#1029), contra el patrón real y no contra una
 * figura que elegimos nosotros: un ancla guardada ANTES del cambio tiene que
 * resolver exactamente donde resolvía.
 *
 * El oráculo es `docs/reports/2026-08-12-baseline-piquetes-maria.json`,
 * capturado en el commit d6cfd6cc — antes de tocar una sola línea de la
 * medición. Las anclas que lleva dentro NO tienen `metric`, que es
 * precisamente el caso que hay que proteger: son datos viejos.
 *
 * Los ids son UUID nuevos en cada importación, así que el emparejamiento va
 * por `clave` (nombre de pieza + ancla), que sí es determinista.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NotchAnchor } from '../../types/types';
import { importDXFContent } from '../dxf';
import { resolveNotchAnchor } from '../notchAnchor';

const REPO_ROOT = resolve(__dirname, '../../..');

interface EntradaBaseline {
  clave: string;
  piezaNombre: string;
  ancla: NotchAnchor;
  posicionResuelta: { x: number; y: number };
}

const baseline: {
  fuente: string;
  totalPiquetesConAncla: number;
  piquetes: EntradaBaseline[];
} = JSON.parse(readFileSync(
  resolve(REPO_ROOT, 'docs/reports/2026-08-12-baseline-piquetes-maria.json'),
  'utf8',
));

describe('los piquetes guardados de María no se mueven', () => {
  const { pieces } = importDXFContent(
    readFileSync(resolve(REPO_ROOT, baseline.fuente), 'utf8'),
    { unit: 'auto', autoDetect: true },
  );

  it('el baseline no está vacío ni se encogió', () => {
    // Sin esto, borrar los piquetes del fixture haría que el resto de tests
    // pasara por vacuidad: cero anclas comprobadas, cero fallos.
    expect(baseline.piquetes).toHaveLength(baseline.totalPiquetesConAncla);
    expect(baseline.piquetes.length).toBeGreaterThan(0);
  });

  it.each(baseline.piquetes.map(p => [p.clave, p] as const))(
    'resuelve en el mismo punto: %s',
    (_clave, entrada) => {
      const pieza = pieces.find(p => p.name === entrada.piezaNombre);
      expect(pieza, `no está la pieza ${entrada.piezaNombre}`).toBeDefined();

      // El ancla GRABADA — sin `metric`, tal como se guardó — contra el
      // contorno recién importado. Comparar re-midiendo desde cero en vez de
      // esto compararía dos mediciones distintas: la importación de hoy
      // estampa metric 2, y ése no es el dato que hay que proteger.
      const r = resolveNotchAnchor(pieza!.outline, entrada.ancla);
      expect(r).not.toBeNull();
      expect(r!.point.x).toBe(entrada.posicionResuelta.x);
      expect(r!.point.y).toBe(entrada.posicionResuelta.y);
    },
  );
});
