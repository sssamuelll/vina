/**
 * #895 — el contrato de mallado sobre el patrón real de María.
 *
 * Causa raíz (medida con prueba causal): convertToPSLG calculaba el punto
 * FINAL de cada segmento subdividido como p1 + d·1.0 — que difiere de p2
 * por 1 ulp (~5e-15 mm) en coma flotante — y el chequeo de continuidad de
 * cadena usaba igualdad EXACTA. En 2 vértices del delantero (lotería de
 * bits del DXF; 0 en las otras 4 piezas) se insertaban dos puntos casi
 * coincidentes SIN edge entre ellos → el contorno llegaba a cdt2d como
 * lazo ABIERTO → el flood-fill interior se escapaba → 0 triángulos → el
 * fallback exterior:true duplicaba el coste (timeout de 30s en el worker
 * de producción) y además habría devuelto el CASCO CONVEXO (escote y
 * sisas tapados con tela).
 *
 * Fix pineado aquí: (1) el último punto de la subdivisión ES p2 exacto;
 * (2) continuidad de cadena con epsilon; (3) fallback de casco convexo
 * ELIMINADO — 0 triángulos interiores = malla vacía que el caller
 * superficie con toast (doctrina CLO3D: mensaje explícito + excluir la
 * pieza, nunca una malla incorrecta en silencio).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { importDXFContent } from '../../dxf';
import { meshPiece } from '../index';

const FIXTURE = resolve(__dirname, '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');

/** Mismas opciones que SimulationInitClient.meshPiece (producción, pd=5). */
const PROD_OPTIONS = {
  yHeight: 0,
  scale: 0.001,
  maxEdgeLength: 5,
  minAngle: 25,
  maxRefinementPasses: 3,
  curveResolution: 12,
};

describe('#895 — las 5 piezas reales mallan con triangulación INTERIOR', () => {
  it('cada pieza produce malla no vacía y el delantero supera los 15k triángulos', { timeout: 300_000 }, () => {
    const pieces = importDXFContent(readFileSync(FIXTURE, 'utf-8'), { unit: 'auto', autoDetect: true }).pieces;
    expect(pieces).toHaveLength(5);

    const results = pieces.map(p => ({
      name: p.name,
      cmds: p.outline.length,
      mesh: meshPiece(p, PROD_OPTIONS),
    }));

    for (const r of results) {
      // Antes del fix, el delantero (276 cmds) devolvía 0 triángulos
      // interiores y caía al fallback de casco convexo / timeout.
      expect(r.mesh.vertices.length, `${r.name} (${r.cmds} cmds) malló vacía`).toBeGreaterThan(0);
      expect(r.mesh.triIds.length, `${r.name} sin triángulos`).toBeGreaterThan(0);
    }

    // El delantero es la pieza más grande (520×594mm): ~20.9k triángulos
    // interiores a 5mm medidos post-fix. Un casco convexo daría ~21.4k
    // (no discriminable por count) — pero el fallback ya no existe: si el
    // lazo volviera a abrirse, esta malla saldría VACÍA y el assert de
    // arriba fallaría. El umbral pina que la triangulación interior
    // completa sigue ocurriendo (no una degradada).
    const sorted = [...results].sort((a, b) => b.mesh.triIds.length - a.mesh.triIds.length);
    expect(sorted[0].mesh.triIds.length / 3).toBeGreaterThan(15_000);

    // Total del patrón: ~29.3k partículas a 5mm (lo que producción debe
    // tener para que las 8 costuras resuelvan — en el bug se quedaba en
    // 18.6k con el delantero ausente).
    const totalParticles = results.reduce((s, r) => s + r.mesh.vertices.length / 3, 0);
    expect(totalParticles).toBeGreaterThan(25_000);
  });
});
