/**
 * Rule Engine — evaluates deterministic diagnostic rules against InspectionData.
 *
 * Each rule is a pure function that accepts InspectionData and returns zero or
 * more Diagnostic objects. `evaluateRules` collects all results and sorts them
 * by severity (error → critical → warning → info).
 *
 * @module ruleEngine
 */

import type { InspectionData, Diagnostic, DiagnosticSeverity } from './types';

// ─── Severity ordering ────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<DiagnosticSeverity, number> = {
  error: 0,
  critical: 1,
  warning: 2,
  info: 3,
};

// ─── Rule type ────────────────────────────────────────────────────────────────

type Rule = (data: InspectionData) => Diagnostic[];

// ─── Fabric rules ─────────────────────────────────────────────────────────────

const ruleNoFabric: Rule = (data) => {
  if (data.fabric === undefined) {
    return [
      {
        severity: 'error',
        category: 'fabric',
        message: 'Sin tela asignada',
        detail: 'Asigna una tela antes de simular o exportar la pieza.',
      },
    ];
  }
  return [];
};

const ruleFabricHeavyWeight: Rule = (data) => {
  if (data.fabric !== undefined && data.fabric.weight > 400) {
    return [
      {
        severity: 'warning',
        category: 'fabric',
        message: `El gramaje de la tela es ${data.fabric.weight} g/m² (> 400 g/m²)`,
        detail:
          'Las telas pesadas pueden desestabilizar la simulación y requieren más subpasos.',
      },
    ];
  }
  return [];
};

// ─── Seam allowance rules ─────────────────────────────────────────────────────
// NOTE: SA = 0 is the normal NET working state (hallazgo #2) — patternmakers
// draft without allowance; it is an explicit finishing step. There is
// deliberately NO rule flagging SA 0 (the sim never consumes SA; it is a
// display/export concern only). Only an explicitly tiny allowance warns.

const ruleSeamAllowanceTooSmall: Rule = (data) => {
  const sa = data.piece.seamAllowance;
  if (sa > 0 && sa < 3) {
    return [
      {
        severity: 'warning',
        category: 'seam-allowance',
        message: `El margen de costura es ${sa} mm (< 3 mm)`,
        detail: 'Los márgenes tan pequeños son difíciles de coser y propensos a deshilacharse.',
      },
    ];
  }
  return [];
};

// ─── Seam connection rules ────────────────────────────────────────────────────

/** Mensaje de "esta pieza no está cosida a nada", exportado por el mismo motivo
 *  que TINY_PIECE_MESSAGE_PREFIX: los `Diagnostic` no llevan código estable, así
 *  que su identidad la carga el mensaje. Cuando el mensaje se tradujo al español
 *  (contrato de interfaz, 2026-08-14) los tests que lo husmeaban en inglés se
 *  rompieron. Una constante compartida hace que la próxima traducción no rompa
 *  nada — la solución de fondo sería un `code` en el tipo Diagnostic. */
export const NO_SEAM_CONNECTIONS_MESSAGE = 'No hay conexiones de costura';

const ruleNoSeamConnections: Rule = (data) => {
  if (data.seams.length === 0) {
    // Skip for tiny pieces — ruleTinyPiece already provides a more actionable
    // diagnostic ("delete this scrap") and the no-seam warning is redundant noise.
    if (data.piece.area < TINY_PIECE_THRESHOLD_MM2) return [];

    return [
      {
        severity: 'warning',
        category: 'seam',
        message: NO_SEAM_CONNECTIONS_MESSAGE,
        detail: 'Esta pieza no tiene costuras que la conecten con otras piezas.',
      },
    ];
  }
  return [];
};

// ─── Internals rules ──────────────────────────────────────────────────────────

const ruleNoGrainline: Rule = (data) => {
  const hasGrainline = data.internals.some((i) => i.type === 'grainline');
  if (!hasGrainline) {
    return [
      {
        severity: 'warning',
        category: 'internals',
        message: 'No hay dirección de hilo',
        detail:
          'La dirección de hilo permite alinear correctamente la tela al simular y cortar.',
      },
    ];
  }
  return [];
};

const ruleNoNotches: Rule = (data) => {
  const hasNotch = data.internals.some((i) => i.type === 'notch');
  if (!hasNotch) {
    return [
      {
        severity: 'info',
        category: 'internals',
        message: 'No hay piquetes',
        detail: 'Los piquetes ayudan a alinear las piezas al coser. Puedes añadirlos a los bordes de costura.',
      },
    ];
  }
  return [];
};

// ─── Fit rules ────────────────────────────────────────────────────────────────

const ruleFitBodyPenetration: Rule = (data) => {
  if (
    data.simulation !== undefined &&
    data.simulation.collisionDistance !== undefined &&
    data.simulation.collisionDistance < 0
  ) {
    return [
      {
        severity: 'critical',
        category: 'fit',
        message: `Penetración del cuerpo detectada (distancia de colisión: ${data.simulation.collisionDistance.toFixed(1)} mm)`,
        detail:
          'La tela atraviesa el cuerpo del avatar. Revisa los ajustes de colisión de la simulación.',
      },
    ];
  }
  return [];
};

const ruleFitPressurePoint: Rule = (data) => {
  if (
    data.simulation !== undefined &&
    data.simulation.collisionDistance !== undefined &&
    data.simulation.collisionDistance >= 0 &&
    data.simulation.collisionDistance < 2
  ) {
    return [
      {
        severity: 'warning',
        category: 'fit',
        message: `Posible punto de presión (distancia de colisión: ${data.simulation.collisionDistance.toFixed(1)} mm)`,
        detail:
          'La tela está muy cerca del cuerpo. Puede indicar una zona apretada o un punto de presión.',
      },
    ];
  }
  return [];
};

// ─── Simulation rules ─────────────────────────────────────────────────────────

const ruleNotSimulated: Rule = (data) => {
  if (
    data.simulation !== undefined &&
    data.simulation.particleCount !== undefined &&
    data.simulation.particleCount === 0
  ) {
    return [
      {
        severity: 'warning',
        category: 'simulation',
        message: 'La pieza no se ha simulado (0 partículas)',
        detail: 'Simula la tela para generar diagnósticos de ajuste de esta pieza.',
      },
    ];
  }
  return [];
};

// ─── Construction rules ───────────────────────────────────────────────────────

const ruleNoEdgesDefined: Rule = (data) => {
  if (data.edge === undefined && data.target.type !== 'piece') {
    return [
      {
        severity: 'warning',
        category: 'construction',
        message: 'La pieza no tiene bordes definidos',
        detail: 'Los bordes son necesarios para conectar costuras, aplicar márgenes y mallar la simulación.',
      },
    ];
  }
  return [];
};

const ruleUnresolvedPoints: Rule = (data) => {
  if (!data.unresolvedPoints || data.unresolvedPoints.length === 0) {
    return [];
  }
  const count = data.unresolvedPoints.length;
  const detail = data.unresolvedPoints
    .map(p => `• ${p.label}: ${p.error}`)
    .join('\n');
  return [
    {
      severity: 'error',
      category: 'construction',
      message: count === 1
        ? '1 punto de construcción no se pudo resolver'
        : `${count} puntos de construcción no se pudieron resolver`,
      detail,
    },
  ];
};

// ─── Seam tension / deactivation rules ────────────────────────────────────

const ruleSeamTension: Rule = (data) => {
  const diags: Diagnostic[] = [];
  for (const seam of data.seams) {
    if (seam.tension !== undefined && seam.tension < 50) {
      diags.push({
        severity: 'warning',
        category: 'seam',
        message: `Costura "${seam.edgeName}" → ${seam.partnerPieceName}: fruncido extremo (${seam.tension}%)`,
        detail:
          'Una tensión menor de 50 % produce mucho fruncido. Puede deformar la prenda o desestabilizar la simulación.',
      });
    }
    if (seam.tension !== undefined && seam.tension > 150) {
      diags.push({
        severity: 'warning',
        category: 'seam',
        message: `Costura "${seam.edgeName}" → ${seam.partnerPieceName}: embebido extremo (${seam.tension}%)`,
        detail:
          'Una tensión mayor de 150 % produce mucho embebido. La costura puede arrugar o tirar de la tela adyacente.',
      });
    }
  }
  return diags;
};

const ruleInactivePieceWithActiveSeams: Rule = (data) => {
  if (data.pieceActive === false) {
    const activeSeams = data.seams.filter((s) => s.active !== false);
    if (activeSeams.length > 0) {
      return [
        {
          severity: 'info',
          category: 'seam',
          message: 'La pieza inactiva tiene costuras activas',
          detail: `Esta pieza está inactiva, pero tiene ${activeSeams.length} ${activeSeams.length === 1 ? 'costura activa' : 'costuras activas'}. Desactiva las costuras o reactiva la pieza.`,
        },
      ];
    }
  }
  return [];
};

// ─── Layer rules ──────────────────────────────────────────────────────────────

const ruleLayerOverlap: Rule = (data) => {
  const diags: Diagnostic[] = [];
  // ── Layer overlap check
  if (data.piecesOnSameLayer && data.piecesOnSameLayer.length > 0 && data.bodyRegion) {
    const sameRegion = data.piecesOnSameLayer.filter(p => p.bodyRegion === data.bodyRegion);
    if (sameRegion.length > 0) {
      const names = sameRegion.map(p => p.name).join(', ');
      diags.push({
        severity: 'warning',
        category: 'layer',
        message: `Misma capa y zona del cuerpo que: ${names}`,
        detail: 'Las piezas de una misma capa y zona del cuerpo pueden solaparse. Asigna capas distintas.',
      });
    }
  }
  return diags;
};

// ─── Interfacing rules ───────────────────────────────────────────────────────

const ruleMissingInterfacing: Rule = (data) => {
  if (!data.piece) return [];
  const cat = data.piece.category;
  const needsInterfacing = cat !== undefined && ['collar', 'cuff', 'waistband'].includes(cat);
  const hasInterfacing = data.piece.interfacingType !== undefined && data.piece.interfacingType !== 'none';
  if (needsInterfacing && !hasInterfacing) {
    return [{
      severity: 'info',
      category: 'simulation',
      message: 'Sin entretela — añade una para dar soporte estructural',
    }];
  }
  return [];
};

// ─── POM rules ───────────────────────────────────────────────────────────────

const ruleNoPOMs: Rule = (data) => {
  const hasPOMs = data.poms?.some(
    p => p.pointA.pieceId === data.piece?.id || p.pointB.pieceId === data.piece?.id,
  );
  if (!hasPOMs) {
    return [
      {
        severity: 'info',
        category: 'measurement',
        message: 'Ninguna medida POM referencia esta pieza — añade medidas para completar la ficha técnica',
      },
    ];
  }
  return [];
};

// ─── Geometry constants ──────────────────────────────────────────────────────

/** Area threshold below which a piece is considered a scrap (10 cm²). */
export const TINY_PIECE_THRESHOLD_MM2 = 1000;

/** Stable prefix shared with agentAnalyzer for suggestion matching. */
export const TINY_PIECE_MESSAGE_PREFIX = 'Pieza pequeña aislada detectada';

// ─── Geometry rules ───────────────────────────────────────────────────────────

const ruleTinyPiece: Rule = (data) => {
  const isTiny = data.piece.area < TINY_PIECE_THRESHOLD_MM2;
  const hasActiveSeams = data.seams.some((s) => s.active !== false);

  if (isTiny && !hasActiveSeams) {
    return [
      {
        severity: 'warning',
        category: 'geometry',
        message: `${TINY_PIECE_MESSAGE_PREFIX} (${Math.round(data.piece.area)} mm²)`,
        detail:
          'Los retazos pequeños y aislados pueden desestabilizar la simulación y suelen quedar tras una edición. Elimina esta pieza si es un residuo.',
      },
    ];
  }
  return [];
};

// ─── Rule registry ────────────────────────────────────────────────────────────

const RULES: Rule[] = [
  // geometry
  ruleTinyPiece,
  // fabric
  ruleNoFabric,
  ruleFabricHeavyWeight,
  // seam allowance
  ruleSeamAllowanceTooSmall,
  // seam
  ruleNoSeamConnections,
  ruleSeamTension,
  ruleInactivePieceWithActiveSeams,
  // internals
  ruleNoGrainline,
  ruleNoNotches,
  // fit
  ruleFitBodyPenetration,
  ruleFitPressurePoint,
  // simulation
  ruleNotSimulated,
  // construction
  ruleNoEdgesDefined,
  ruleUnresolvedPoints,
  // layer
  ruleLayerOverlap,
  // interfacing
  ruleMissingInterfacing,
  // pom
  ruleNoPOMs,
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate all diagnostic rules against the provided inspection data.
 *
 * @returns Array of Diagnostic objects sorted by severity
 *          (error → critical → warning → info).
 */
export function evaluateRules(data: InspectionData): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const rule of RULES) {
    const results = rule(data);
    diagnostics.push(...results);
  }

  return diagnostics.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}
