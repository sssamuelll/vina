/**
 * Internal Line Tools — darts (pinzas), grainlines (hilos), notches (piquetes), fold lines.
 * Herramientas de Líneas Internas — pinzas, hilos, piquetes, líneas de doblez.
 *
 * @module internalTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { addInternalLine, setInternalLine } from '../../../../store/projectSlice';
import type { PathCommand, InternalLine } from '../../../../types/types';
import { lineId, M, L } from '../../../../utils/pathHelpers';

// ─── addDart ────────────────────────────────────────────────────────────────

const addDartTool: ToolDefinition = {
  name: 'addDart',
  description:
    'Add a dart (pinza) to a pattern piece. Darts absorb excess fabric for shaping. ' +
    '/ Agregar una pinza a una pieza de patrón. Las pinzas absorben el exceso de tela para dar forma.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      dartType: {
        type: 'string',
        enum: ['bust', 'waist-front', 'waist-back', 'shoulder', 'neck', 'elbow'],
        description: 'Dart type determines auto-calculated position / Tipo de pinza determina posición auto-calculada',
      },
      width: { type: 'number', description: 'Dart intake width in mm at the base / Ancho de la pinza en mm en la base' },
      length: { type: 'number', description: 'Dart length in mm from base to point / Largo de la pinza en mm desde base a punta' },
      position: {
        type: 'object',
        description: 'Override auto-calculated position / Sobrescribir posición auto-calculada',
        properties: {
          baseX: { type: 'number' },
          baseY: { type: 'number' },
          tipX: { type: 'number' },
          tipY: { type: 'number' },
        },
      },
    },
    required: ['pieceId', 'dartType'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const width = (params.width as number) || 25;
    const length = (params.length as number) || 110;

    let baseX: number, baseY: number, tipX: number, tipY: number;

    if (params.position) {
      const pos = params.position as { baseX: number; baseY: number; tipX: number; tipY: number };
      baseX = pos.baseX;
      baseY = pos.baseY;
      tipX = pos.tipX;
      tipY = pos.tipY;
    } else {
      // Auto-calculate based on piece bounds and dart type
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const cmd of piece.outline) {
        for (let i = 0; i < cmd.values.length - 1; i += 2) {
          minX = Math.min(minX, cmd.values[i]);
          minY = Math.min(minY, cmd.values[i + 1]);
          maxX = Math.max(maxX, cmd.values[i]);
          maxY = Math.max(maxY, cmd.values[i + 1]);
        }
      }
      const w = maxX - minX;
      const h = maxY - minY;

      switch (params.dartType) {
        case 'bust':
          baseX = minX + w * 0.4;
          baseY = maxY - 30;
          tipX = baseX;
          tipY = baseY - length;
          break;
        case 'waist-front':
        case 'waist-back':
          baseX = minX + w * 0.35;
          baseY = maxY;
          tipX = baseX;
          tipY = maxY - length;
          break;
        case 'shoulder':
          baseX = minX + w * 0.4;
          baseY = minY;
          tipX = baseX;
          tipY = minY + length;
          break;
        case 'neck':
          baseX = minX + w * 0.2;
          baseY = minY;
          tipX = baseX;
          tipY = minY + length * 0.6;
          break;
        case 'elbow':
          baseX = minX + w * 0.5;
          baseY = minY + h * 0.55;
          tipX = baseX;
          tipY = baseY - length * 0.7;
          break;
        default:
          baseX = minX + w * 0.4;
          baseY = maxY;
          tipX = baseX;
          tipY = maxY - length;
      }
    }

    const halfWidth = width / 2;
    const dart: InternalLine = {
      id: lineId(),
      type: 'dart',
      path: [
        M(baseX - halfWidth, baseY),
        L(tipX, tipY),
        L(baseX + halfWidth, baseY),
      ],
    };

    dispatch(addInternalLine({ pieceId: params.pieceId as string, line: dart }));
    return { success: true, data: { internalLineId: dart.id } };
  },
};

// ─── addGrainline ───────────────────────────────────────────────────────────

const addGrainlineTool: ToolDefinition = {
  name: 'addGrainline',
  description:
    'Add or set the grainline (hilo) on a pattern piece. Indicates fabric grain direction. ' +
    '/ Agregar o establecer la línea de hilo en una pieza de patrón. Indica la dirección del hilo de la tela.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      direction: {
        type: 'string',
        enum: ['vertical', 'horizontal', 'bias-45', 'custom'],
        description: 'Grainline direction / Dirección del hilo',
      },
      customAngle: { type: 'number', description: 'Degrees from vertical, only for custom / Grados desde la vertical' },
    },
    required: ['pieceId'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of piece.outline) {
      for (let i = 0; i < cmd.values.length - 1; i += 2) {
        minX = Math.min(minX, cmd.values[i]);
        minY = Math.min(minY, cmd.values[i + 1]);
        maxX = Math.max(maxX, cmd.values[i]);
        maxY = Math.max(maxY, cmd.values[i + 1]);
      }
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const h = maxY - minY;
    const w = maxX - minX;
    const dir = (params.direction as string) || 'vertical';
    const margin = 20;

    let path: PathCommand[];
    switch (dir) {
      case 'horizontal':
        path = [M(minX + margin, cy), L(maxX - margin, cy)];
        break;
      case 'bias-45': {
        const halfLen = Math.min(w, h) / 2 - margin;
        path = [M(cx - halfLen, cy - halfLen), L(cx + halfLen, cy + halfLen)];
        break;
      }
      case 'custom': {
        const angle = ((params.customAngle as number) || 0) * Math.PI / 180;
        const halfLen = (h / 2) - margin;
        path = [
          M(cx - Math.sin(angle) * halfLen, cy - Math.cos(angle) * halfLen),
          L(cx + Math.sin(angle) * halfLen, cy + Math.cos(angle) * halfLen),
        ];
        break;
      }
      default: // vertical
        path = [M(cx, minY + margin), L(cx, maxY - margin)];
    }

    const grainline: InternalLine = { id: lineId(), type: 'grainline', path };
    dispatch(setInternalLine({ pieceId: params.pieceId as string, line: grainline }));
    return { success: true, data: { internalLineId: grainline.id } };
  },
};

// ─── addNotch ───────────────────────────────────────────────────────────────

const addNotchTool: ToolDefinition = {
  name: 'addNotch',
  description:
    'Add a notch mark (piquete) to a piece outline for alignment during sewing. ' +
    '/ Agregar un piquete a un contorno de pieza para alineación durante la costura.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      edgePosition: { type: 'number', description: 'Position along the outline as a fraction 0-1 / Posición a lo largo del contorno como fracción 0-1' },
      shape: {
        type: 'string',
        enum: ['slit', 't-notch', 'v-internal', 'v-external', 'u-notch', 'castle', 'diamond'],
        description: 'Notch shape / Forma del piquete',
      },
      count: { type: 'integer', enum: [1, 2, 3], description: 'Number of marks (1=single, 2=double for back, 3=triple) / Cantidad de marcas' },
      length: { type: 'number', description: 'Notch depth in mm (default 8) / Profundidad del piquete en mm' },
    },
    required: ['pieceId', 'edgePosition'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const edgePosition = params.edgePosition as number;
    if (edgePosition < 0 || edgePosition > 1) {
      return { success: false, error: 'edgePosition must be between 0 and 1' };
    }

    // Find point along outline at the given fraction
    const { flattenPath } = await import('../../../../utils/seam/index');
    const points = flattenPath(piece.outline);
    if (points.length < 2) return { success: false, error: 'Piece outline too short' };

    // Compute total perimeter length
    let totalLen = 0;
    const segLens: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      segLens.push(len);
      totalLen += len;
    }

    const targetLen = edgePosition * totalLen;
    let accum = 0;
    let px = points[0].x, py = points[0].y;
    let nx = 0, ny = -1; // default normal

    for (let i = 0; i < segLens.length; i++) {
      if (accum + segLens[i] >= targetLen) {
        const t = (targetLen - accum) / segLens[i];
        px = points[i].x + t * (points[i + 1].x - points[i].x);
        py = points[i].y + t * (points[i + 1].y - points[i].y);
        // Normal perpendicular to edge
        const dx = points[i + 1].x - points[i].x;
        const dy = points[i + 1].y - points[i].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          nx = -dy / len;
          ny = dx / len;
        }
        break;
      }
      accum += segLens[i];
    }

    const notchLen = (params.length as number) || 8;

    // Parametric anchor (notch-precision F2): the tool already receives the
    // placement as edgePosition — persist it as arc-distance-from-corner so
    // the precision modal can read/edit agent-created notches too.
    const { computeNotchAnchor } = await import('../../../../utils/notchAnchor');
    const anchor = computeNotchAnchor(piece.outline, { x: px, y: py });

    const notchLine: InternalLine = {
      id: lineId(),
      type: 'notch',
      path: [M(px, py), L(px + nx * notchLen, py + ny * notchLen)],
      notchOptions: {
        shape: (params.shape as InternalLine['notchOptions'] extends undefined ? never : NonNullable<InternalLine['notchOptions']>['shape']) || 'slit',
        subType: 'straightforward',
        length: notchLen,
        width: 3,
        angle: 0,
        count: (params.count as number) || 1,
      },
      ...(anchor ? { notchAnchor: anchor } : {}),
    };

    dispatch(addInternalLine({ pieceId: params.pieceId as string, line: notchLine }));
    return { success: true, data: { internalLineId: notchLine.id } };
  },
};

// ─── mirrorNotch ──────────────────────────────────────────────────────────────

const mirrorNotchTool: ToolDefinition = {
  name: 'mirrorNotch',
  description:
    'Create the corresponding notch on the piece sewn to this one, at the matching ' +
    'distance along the shared seam, so the sewing lines up (CLO3D "corresponding notch"). ' +
    'One-shot: creates an independent notch, no persistent link. ' +
    '/ Crear el piquete correspondiente en la pieza cosida a ésta, a la misma distancia ' +
    'sobre la costura compartida, para que el cosido calce. One-shot, sin vínculo persistente.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Source piece ID / ID de la pieza origen' },
      notchLineId: { type: 'string', description: 'ID of the source notch internal line / ID del piquete origen' },
      invert: {
        type: 'boolean',
        description:
          'Flip the traversal sense. The normal right-sides-together seam sews edges in OPPOSITE ' +
          'directions, so invert=true is often correct. Preview the result and toggle if it lands ' +
          'on the wrong end. / Invertir el sentido. El caso normal cose en sentidos opuestos.',
      },
    },
    required: ['pieceId', 'notchLineId'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const source = piece.internals.find(i => i.id === params.notchLineId && i.type === 'notch');
    if (!source) return { success: false, error: `Notch "${params.notchLineId}" not found on piece` };
    const head = source.path[0];
    if (!head || head.values.length < 2) return { success: false, error: 'Source notch has no anchor point' };
    const point = { x: head.values[0], y: head.values[1] };

    const { mapNotchAcrossSeam, createMirrorNotchLine } = await import('../../../../utils/seam/notchMirror');
    const mapped = mapNotchAcrossSeam({
      sourcePiece: piece,
      point,
      seams: state.project.seams,
      pieces: state.project.pieces,
      invert: params.invert as boolean | undefined,
    });
    if (!mapped.ok) return { success: false, error: mapped.message };

    const pairedPiece = state.project.pieces.find(p => p.id === mapped.pairedPieceId)!;
    const notchLine = createMirrorNotchLine(pairedPiece.outline, mapped, source);

    dispatch(addInternalLine({ pieceId: mapped.pairedPieceId, line: notchLine }));
    return { success: true, data: { internalLineId: notchLine.id, pieceId: mapped.pairedPieceId, edge: mapped.pairedEdgeName } };
  },
};

// ─── addFoldLine ────────────────────────────────────────────────────────────

const addFoldLineTool: ToolDefinition = {
  name: 'addFoldLine',
  description:
    'Add a fold line to a pattern piece. ' +
    '/ Agregar una línea de doblez a una pieza de patrón.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      startX: { type: 'number', description: 'Start X in mm / X de inicio en mm' },
      startY: { type: 'number', description: 'Start Y in mm / Y de inicio en mm' },
      endX: { type: 'number', description: 'End X in mm / X de fin en mm' },
      endY: { type: 'number', description: 'End Y in mm / Y de fin en mm' },
      direction: {
        type: 'string',
        enum: ['mountain', 'valley'],
        description: 'Fold direction (default mountain) / Dirección del doblez (defecto mountain)',
      },
      creaseAngleDeg: {
        type: 'number',
        description: 'Crease angle in degrees (default 180 = flat fold) / Ángulo del doblez en grados (defecto 180 = doblez plano)',
      },
    },
    required: ['pieceId', 'startX', 'startY', 'endX', 'endY'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const foldLine: InternalLine = {
      id: lineId(),
      type: 'fold',
      path: [
        M(params.startX as number, params.startY as number),
        L(params.endX as number, params.endY as number),
      ],
      foldOptions: {
        direction: (params.direction as 'mountain' | 'valley') ?? 'mountain',
        creaseAngleDeg: (params.creaseAngleDeg as number) ?? 180,
      },
    };

    dispatch(addInternalLine({ pieceId: params.pieceId as string, line: foldLine }));
    return { success: true, data: { internalLineId: foldLine.id } };
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  addDartTool,
  addGrainlineTool,
  addNotchTool,
  mirrorNotchTool,
  addFoldLineTool,
];
