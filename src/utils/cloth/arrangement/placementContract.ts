/**
 * placementContract — la escritura canónica de intención de colocación.
 *
 * Consejo 2026-07-03 §1: "¿dónde va esta pieza?" debe tener EXACTAMENTE una
 * respuesta representable. Este módulo es el traductor único hacia
 * `ArrangementBinding` (frame-delta, grading-safe) para los TRES escritores
 * del contrato:
 *   - el humano: click en un anchor point (D2 UI) → `bindingForAnchor`
 *   - el agente: tool `place_piece` / `setArrangement3D` → `bindingForAnchor`
 *     / `worldDeltaToBinding` (el dialecto world-space legacy se convierte
 *     aquí — no se hornea un segundo formato)
 *   - las heurísticas: el auto-placement ES el frame base; su "propuesta" es
 *     delta cero.
 *
 * v1 (triage del consejo): solo TRASLACIÓN (rotDelta identidad — rotación
 * fina es POST) y solo anchors del MISMO namespace que la región efectiva de
 * la pieza (cross-region = re-asignar región/frame de wrap, que es plomería
 * de `computeEffectiveRegions` con nombre propio, no un delta). El bearing
 * clickeado se guarda como proveniencia (`anchorId`) aunque geométricamente
 * v1 use el axisPoint del anillo (altura/posición-en-eje).
 *
 * @module placementContract
 */
import * as THREE from 'three';
import type { BodyMeasurements, PatternPiece } from '../../../types/types';
import { computeAutoFrame, computeEffectiveRegions, outlineBBox, type BodyRegion } from '../garmentPlacement';
import type { ArrangementBinding } from './arrangementBinding';
import type { AnchorMap } from './anchorMap';
import type { V3 } from './surfaceFrame';

export interface ContractOpts {
  skeletonReady?: boolean;
  axisHints?: Record<string, V3>;
}

/**
 * Namespace canónico de anchors para una región efectiva de pieza. Los
 * anillos cubren 360° (un anillo de torso sirve a front Y back), así que el
 * mapa publica UN namespace por zona corporal (ver anchorMap.ts).
 */
export function anchorNamespaceFor(region: BodyRegion): BodyRegion {
  switch (region) {
    case 'front-torso':
    case 'back-torso':
    case 'waistband':
    case 'unknown': // fallback torso-like (mismo criterio que surfaceFrame)
      return 'front-torso';
    case 'front-skirt':
    case 'back-skirt':
      return 'front-skirt';
    case 'collar':
    case 'hood':
      return 'collar';
    case 'cuff-left':
      return 'left-sleeve';
    case 'cuff-right':
      return 'right-sleeve';
    default:
      return region; // left-sleeve / right-sleeve
  }
}

function autoFrameFor(
  pieces: PatternPiece[],
  index: number,
  measurements: BodyMeasurements,
  opts?: ContractOpts,
) {
  const effRegions = computeEffectiveRegions(pieces);
  const p = pieces[index];
  const { width, height } = outlineBBox(p.outline);
  const axisHint = opts?.skeletonReady === false ? undefined : opts?.axisHints?.[p.id];
  const { frame } = computeAutoFrame(effRegions[index], measurements, { widthMm: width, heightMm: height }, axisHint);
  return { frame, region: effRegions[index] };
}

/**
 * Proyecta un delta WORLD sobre la base del auto-frame de la pieza →
 * `ArrangementBinding` (el inverso exacto del compose de resolveArrangement:
 * worldDelta = b·pd0 + n·pd1 + t·pd2, base ortonormal de surfaceFrame).
 */
export function worldDeltaToBinding(
  pieces: PatternPiece[],
  index: number,
  measurements: BodyMeasurements,
  worldDelta: V3,
  opts?: ContractOpts,
  anchorId?: string,
): ArrangementBinding {
  const { frame } = autoFrameFor(pieces, index, measurements, opts);
  const n = new THREE.Vector3(...frame.normal).normalize();
  const t = new THREE.Vector3(...frame.tangent).normalize();
  const b = new THREE.Vector3().crossVectors(n, t).normalize();
  const d = new THREE.Vector3(...worldDelta);
  return {
    space: 'frame',
    posDelta: [b.dot(d), n.dot(d), t.dot(d)],
    rotDelta: [0, 0, 0, 1],
    ...(anchorId !== undefined ? { anchorId } : {}),
  };
}

/**
 * Click/tool → binding: coloca la pieza en el anillo del anchor elegido.
 * `null` cuando el anchor no existe o su namespace no corresponde a la
 * región efectiva de la pieza (cross-region: fuera del contrato v1).
 */
export function bindingForAnchor(
  pieces: PatternPiece[],
  index: number,
  measurements: BodyMeasurements,
  map: AnchorMap,
  anchorId: string,
  opts?: ContractOpts,
): ArrangementBinding | null {
  const point = map.points.find((pt) => pt.id === anchorId);
  if (!point) return null;
  const ring = map.rings.find((r) => r.region === point.region && r.ring === point.ring);
  if (!ring) return null;

  const { frame, region } = autoFrameFor(pieces, index, measurements, opts);
  if (anchorNamespaceFor(region) !== point.region) return null;

  const worldDelta: V3 = [
    ring.axisPoint[0] - frame.point[0],
    ring.axisPoint[1] - frame.point[1],
    ring.axisPoint[2] - frame.point[2],
  ];
  return worldDeltaToBinding(pieces, index, measurements, worldDelta, opts, anchorId);
}
