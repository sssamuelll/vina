/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * #142 — Bridge 3D Interactive Tools to Copilot
 *
 * Provides AI-driven tools for 3D operations:
 * - Semantic Pinning: Suggest pins at anatomical landmarks
 * - Auto-Tacking: Propose tacks based on spatial relationships
 * - Simulation Control: Start/pause/reset simulation
 * - State Awareness: Query 3D state for contextual advice
 *
 * Designed for extensibility as new 3D tools are added.
 */

import type { ToolDefinition } from '../registry';
import { detectLandmarks, extractSegments } from '../../../perception/geometryClassifier';
import type { LandmarkLabel } from '../../../perception/types';
import {
  startSimulation,
  pauseSimulation,
  resetSimulation,
  setViewMode3D,
} from '../../../../store/simulationSlice';
import { setCameraPreset, focusOnPiece } from '../../../../store/cameraSlice';

/**
 * Anatomical landmarks that are good pinning candidates.
 * Mapped to typical avatar bone positions.
 */
const PIN_CANDIDATES: Record<LandmarkLabel, { priority: number; avatarBone: string }> = {
  shoulder: { priority: 1, avatarBone: 'shoulder_L' },
  neckline: { priority: 2, avatarBone: 'neck' },
  waistline: { priority: 3, avatarBone: 'waist' },
  armhole: { priority: 4, avatarBone: 'upperarm_L' },
  center_front: { priority: 5, avatarBone: 'spine' },
  center_back: { priority: 5, avatarBone: 'spine' },
  cuff: { priority: 6, avatarBone: 'wrist_L' },
  sleeve_cap: { priority: 7, avatarBone: 'shoulder_L' },
  collar: { priority: 8, avatarBone: 'neck' },
  side_seam: { priority: 9, avatarBone: 'hip_L' },
  hipline: { priority: 10, avatarBone: 'hip' },
  hemline: { priority: 11, avatarBone: 'knee_L' },
  unknown: { priority: 99, avatarBone: 'root' },
};

/**
 * Pin suggestion with position and reasoning.
 */
interface PinSuggestion {
  pieceId: string;
  pieceName: string;
  landmark: LandmarkLabel;
  edgeIndex: number;
  confidence: number;
  avatarBone: string;
  reason: string;
}

/**
 * Tack suggestion connecting two pieces.
 */
interface TackSuggestion {
  pieceAId: string;
  pieceAName: string;
  pieceBId: string;
  pieceBName: string;
  edgeAIndex: number;
  edgeBIndex: number;
  distance: number;
  reason: string;
}

export const tools: ToolDefinition[] = [
  // ─── Semantic Pinning ─────────────────────────────────────────────────────

  {
    name: 'suggestPinPoints',
    description:
      'Analyze pattern pieces and suggest optimal pinning points based on anatomical landmarks. ' +
      'Returns ranked suggestions for where to pin the garment on the avatar during simulation.',
    parameters: {
      type: 'object',
      properties: {
        pieceIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: specific piece IDs to analyze. If empty, analyzes all pieces.',
        },
        maxSuggestions: {
          type: 'integer',
          description: 'Maximum number of pin suggestions to return (default: 6)',
        },
      },
    },
    execute: async (params, _dispatch, getState) => {
      const pieces = getState().project.pieces;
      const pieceIds = (params.pieceIds as string[]) || [];
      const maxSuggestions = (params.maxSuggestions as number) || 6;

      const targetPieces = pieceIds.length > 0
        ? pieces.filter((p: any) => pieceIds.includes(p.id))
        : pieces;

      if (targetPieces.length === 0) {
        return {
          success: false,
          error: 'No pieces found to analyze for pinning.',
        };
      }

      const suggestions: PinSuggestion[] = [];

      for (const piece of targetPieces) {
        const segments = extractSegments(piece.outline);
        const landmarks = detectLandmarks(segments);

        for (const landmark of landmarks) {
          const candidate = PIN_CANDIDATES[landmark.label];
          if (!candidate || landmark.label === 'unknown') continue;

          suggestions.push({
            pieceId: piece.id,
            pieceName: piece.name,
            landmark: landmark.label,
            edgeIndex: landmark.edgeIndex,
            confidence: landmark.confidence,
            avatarBone: candidate.avatarBone,
            reason: `Pin ${piece.name} at ${landmark.label} to anchor on avatar ${candidate.avatarBone}`,
          });
        }
      }

      // Sort by priority (lower = better) then by confidence
      suggestions.sort((a, b) => {
        const priorityA = PIN_CANDIDATES[a.landmark]?.priority ?? 99;
        const priorityB = PIN_CANDIDATES[b.landmark]?.priority ?? 99;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return b.confidence - a.confidence;
      });

      const topSuggestions = suggestions.slice(0, maxSuggestions);

      return {
        success: true,
        suggestionCount: topSuggestions.length,
        suggestions: topSuggestions,
        summary: topSuggestions.length > 0
          ? `Found ${topSuggestions.length} pin points: ${topSuggestions.map(s => `${s.pieceName}@${s.landmark}`).join(', ')}`
          : 'No pinning landmarks detected. Consider adding pieces with typical garment features.',
      };
    },
  },

  // ─── Auto-Tacking ─────────────────────────────────────────────────────────

  {
    name: 'suggestTacks',
    description:
      'Analyze spatial relationships between pieces and suggest tacking points. ' +
      'Tacks temporarily hold adjacent pieces together during initial simulation settling.',
    parameters: {
      type: 'object',
      properties: {
        maxDistance: {
          type: 'number',
          description: 'Maximum distance in mm for pieces to be considered adjacent (default: 50mm)',
        },
        maxSuggestions: {
          type: 'integer',
          description: 'Maximum number of tack suggestions to return (default: 4)',
        },
      },
    },
    execute: async (params, _dispatch, getState) => {
      const pieces = getState().project.pieces;
      const seams = getState().project.seams;
      const maxDistance = (params.maxDistance as number) || 50;
      const maxSuggestions = (params.maxSuggestions as number) || 4;

      if (pieces.length < 2) {
        return {
          success: false,
          error: 'Need at least 2 pieces to suggest tacks.',
        };
      }

      // Build set of sewn pairs
      const sewnPairs = new Set<string>();
      for (const seam of seams) {
        const pairKey = [seam.pieceA.pieceId, seam.pieceB.pieceId].sort().join(':');
        sewnPairs.add(pairKey);
      }

      const suggestions: TackSuggestion[] = [];

      // Simple proximity check based on 2D positions
      // (In production, would use 3D positions from cloth sim)
      for (let i = 0; i < pieces.length; i++) {
        for (let j = i + 1; j < pieces.length; j++) {
          const pieceA = pieces[i];
          const pieceB = pieces[j];
          const pairKey = [pieceA.id, pieceB.id].sort().join(':');

          // Skip if already sewn
          if (sewnPairs.has(pairKey)) continue;

          // Calculate 2D distance between piece centers
          const posA = pieceA.position || { x: 0, y: 0 };
          const posB = pieceB.position || { x: 0, y: 0 };
          const dx = posB.x - posA.x;
          const dy = posB.y - posA.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < maxDistance) {
            suggestions.push({
              pieceAId: pieceA.id,
              pieceAName: pieceA.name,
              pieceBId: pieceB.id,
              pieceBName: pieceB.name,
              edgeAIndex: 0, // Would be refined with actual edge analysis
              edgeBIndex: 0,
              distance: Math.round(distance),
              reason: `${pieceA.name} and ${pieceB.name} are ${Math.round(distance)}mm apart - temporary tack recommended`,
            });
          }
        }
      }

      // Sort by distance (closer = higher priority)
      suggestions.sort((a, b) => a.distance - b.distance);
      const topSuggestions = suggestions.slice(0, maxSuggestions);

      return {
        success: true,
        suggestionCount: topSuggestions.length,
        suggestions: topSuggestions,
        summary: topSuggestions.length > 0
          ? `Found ${topSuggestions.length} tack candidates between adjacent pieces.`
          : 'No adjacent unsewn pieces found for tacking.',
      };
    },
  },

  // ─── Simulation Control ───────────────────────────────────────────────────

  {
    name: 'controlSimulation',
    description:
      'Control the cloth physics simulation: start, pause, or reset. ' +
      'Use this to drape the garment on the avatar and see realistic behavior.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'pause', 'reset'],
          description: 'Simulation action to perform',
        },
      },
      required: ['action'],
    },
    execute: async (params, dispatch, getState) => {
      const action = params.action as 'start' | 'pause' | 'reset';
      const currentState = getState().simulation.simulationState;

      switch (action) {
        case 'start':
          if (currentState === 'running') {
            return { success: true, message: 'Simulation is already running.', state: currentState };
          }
          dispatch(startSimulation());
          return { success: true, message: 'Simulation started.', state: 'running' };

        case 'pause':
          if (currentState !== 'running') {
            return { success: true, message: 'Simulation is not running.', state: currentState };
          }
          dispatch(pauseSimulation());
          return { success: true, message: 'Simulation paused.', state: 'paused' };

        case 'reset':
          dispatch(resetSimulation());
          return { success: true, message: 'Simulation reset to idle.', state: 'idle' };

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    },
  },

  {
    name: 'setViewMode3D',
    description:
      'Switch the 3D viewport mode between "arrange" (position pieces on avatar) and "simulate" (cloth physics).',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['arrange', 'simulate'],
          description: 'The 3D viewport mode',
        },
      },
      required: ['mode'],
    },
    execute: async (params, dispatch, _getState) => {
      const mode = params.mode as 'arrange' | 'simulate';
      dispatch(setViewMode3D(mode));
      return {
        success: true,
        mode,
        message: mode === 'arrange'
          ? 'Switched to Arrange mode - position pieces around the avatar.'
          : 'Switched to Simulate mode - cloth physics active.',
      };
    },
  },

  // ─── State Awareness ──────────────────────────────────────────────────────

  {
    name: 'get3DState',
    description:
      'Get the current 3D simulation and arrangement state. ' +
      'Returns simulation status, solver info, and piece positioning.',
    parameters: { type: 'object', properties: {} },
    execute: async (_params, _dispatch, getState) => {
      const sim = getState().simulation;
      const pieces = getState().project.pieces;

      return {
        success: true,
        data: {
          simulationState: sim.simulationState,
          viewMode3D: sim.viewMode3D,
          solverTier: sim.solverTier,
          bodyCollision: sim.bodyCollision,
          particleDistance: sim.particleDistance,
          simulationMode: sim.simulationMode,
          frameTimeMs: sim.frameTimeMs,
          particleCount: sim.particleCount,
          pieceCount: pieces.length,
          hasArrangementSnapshot: !!sim.arrangementSnapshot,
        },
      };
    },
  },

  {
    name: 'analyzeGarmentReadiness',
    description:
      'Check if the garment is ready for simulation. ' +
      'Validates piece count, seams, landmarks, and suggests preparation steps.',
    parameters: { type: 'object', properties: {} },
    execute: async (_params, _dispatch, getState) => {
      const pieces = getState().project.pieces;
      const seams = getState().project.seams;

      const issues: string[] = [];
      const suggestions: string[] = [];

      // Check piece count
      if (pieces.length === 0) {
        issues.push('No pieces in project');
        return {
          success: true,
          ready: false,
          issues,
          suggestions: ['Create or import pattern pieces first.'],
        };
      }

      // Check for seams
      if (seams.length === 0 && pieces.length > 1) {
        issues.push('No seams defined between pieces');
        suggestions.push('Use autoDetectSeams or createSeam to connect pieces.');
      }

      // Check for grainlines
      let piecesWithGrainline = 0;
      for (const piece of pieces) {
        if (piece.grainLine) piecesWithGrainline++;
      }
      if (piecesWithGrainline < pieces.length) {
        suggestions.push(`Add grainlines to ${pieces.length - piecesWithGrainline} pieces for accurate drape.`);
      }

      // Check for pinning landmarks
      let totalLandmarks = 0;
      for (const piece of pieces) {
        const segments = extractSegments(piece.outline);
        const landmarks = detectLandmarks(segments);
        totalLandmarks += landmarks.filter(l => l.label !== 'unknown').length;
      }
      if (totalLandmarks === 0) {
        suggestions.push('No anatomical landmarks detected. Consider refining piece outlines for better pinning.');
      }

      const ready = issues.length === 0;

      return {
        success: true,
        ready,
        pieceCount: pieces.length,
        seamCount: seams.length,
        landmarkCount: totalLandmarks,
        issues,
        suggestions,
        summary: ready
          ? `Garment is ready for simulation: ${pieces.length} pieces, ${seams.length} seams, ${totalLandmarks} landmarks.`
          : `Garment needs preparation: ${issues.join('; ')}`,
      };
    },
  },

  // ─── Camera Navigation ─────────────────────────────────────────────────────

  {
    name: 'setCameraView',
    description:
      'Set the 3D camera to a preset view angle or focus on a specific pattern piece. ' +
      'Use view presets for standard angles (front, back, left, right, top, bottom, threeQuarterLeft, threeQuarterRight). ' +
      'Use focusPieceId to zoom in on a specific piece.',
    parameters: {
      type: 'object',
      properties: {
        view: {
          type: 'string',
          enum: ['front', 'back', 'left', 'right', 'top', 'bottom', 'threeQuarterLeft', 'threeQuarterRight'],
          description: 'Camera view preset name',
        },
        focusPieceId: {
          type: 'string',
          description: 'Piece ID to focus/zoom the camera on (alternative to view preset)',
        },
      },
    },
    execute: async (params, dispatch, getState) => {
      const view = params.view as string | undefined;
      const focusPieceIdParam = params.focusPieceId as string | undefined;

      if (view) {
        dispatch(setCameraPreset(view as Parameters<typeof setCameraPreset>[0]));
        return {
          success: true,
          data: { view },
          message: `Camera set to ${view} view.`,
        };
      }

      if (focusPieceIdParam) {
        const pieces = getState().project.pieces;
        const piece = pieces.find((p: { id: string }) => p.id === focusPieceIdParam);
        if (!piece) {
          return { success: false, error: `Piece "${focusPieceIdParam}" not found.` };
        }
        dispatch(focusOnPiece(focusPieceIdParam));
        return {
          success: true,
          data: { focusPieceId: focusPieceIdParam, pieceName: piece.name },
          message: `Camera focused on piece "${piece.name}".`,
        };
      }

      return {
        success: false,
        error: 'Provide either "view" (preset name) or "focusPieceId" (piece ID).',
      };
    },
  },

  // ─── Dress Avatar ───────────────────────────────────────────────────────

  {
    name: 'dressAvatar',
    description:
      'One-click dress avatar: auto-arrange all pattern pieces around the avatar and start simulation. ' +
      'Pieces are positioned based on their category (bodice, sleeve, skirt, etc.) and the avatar measurements. ' +
      '/ Vestir avatar: auto-acomodar piezas alrededor del avatar e iniciar simulación.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute: async (_params, dispatch, getState) => {
      const state = getState();
      const pieces = state.project.pieces.filter(p => p.active);
      if (pieces.length === 0) {
        return { success: false, error: 'No active pattern pieces to simulate.' };
      }

      const { placeGarmentPieces } = await import('../../../../utils/cloth/garmentPlacement');
      const { clearArrangementOverrides } = await import('../../../../store/projectSlice');
      const { saveArrangementSnapshot, clearArrangementSnapshot } = await import('../../../../store/simulationSlice');

      // Reset
      dispatch(resetSimulation());
      dispatch(clearArrangementOverrides());
      dispatch(clearArrangementSnapshot());

      // Arrange
      const placements = placeGarmentPieces(pieces, state.project.avatar.measurements);
      const snapshot: Record<string, [number, number, number]> = {};
      pieces.forEach((p, i) => {
        snapshot[p.id] = [placements[i].position[0], placements[i].position[1], placements[i].position[2]];
      });
      dispatch(saveArrangementSnapshot(snapshot));

      // Simulate
      dispatch(setViewMode3D('simulate'));
      dispatch(startSimulation());

      return {
        success: true,
        data: {
          piecesArranged: pieces.length,
          seamsActive: state.project.seams.filter(s => s.active).length,
          message: `Dressing avatar with ${pieces.length} pieces and ${state.project.seams.filter(s => s.active).length} seams.`,
        },
      };
    },
  },
];
