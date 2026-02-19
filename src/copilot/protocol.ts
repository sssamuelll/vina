/**
 * OpenClo Copilot Protocol
 * 
 * The copilot is agent-agnostic. Users connect their own AI agent
 * (Claude Code, Codex, GPT, local LLM, etc.) via a simple HTTP/WebSocket interface.
 * 
 * Flow:
 * 1. User types a message in the copilot chat
 * 2. OpenClo builds a context payload (current pieces, measurements, selection)
 * 3. Payload + user message sent to the agent endpoint
 * 4. Agent responds with CopilotCommands (create piece, modify outline, etc.)
 * 5. OpenClo executes commands on the Redux store
 * 
 * Agent endpoint options:
 * - Local HTTP: POST http://localhost:{port}/copilot
 * - WebSocket: ws://localhost:{port}/copilot
 * - Built-in: direct function call (for embedded agents)
 */

import { PatternPiece, PathCommand, Point2D, InternalLine } from '../types/types';

// ─── Context sent TO the agent ───

export interface CopilotContext {
  /** Current project state */
  project: {
    name: string;
    pieces: CopilotPieceInfo[];
    measurements: Record<string, number>;
  };
  /** Currently selected piece(s) */
  selectedPieceIds: string[];
  /** User's message */
  message: string;
  /** Conversation history (last N messages) */
  history: CopilotMessage[];
}

export interface CopilotPieceInfo {
  id: string;
  name: string;
  /** Simplified outline description for the agent */
  outlineSummary: string;
  /** Bounding box in mm */
  bounds: { width: number; height: number };
  seamAllowance: number;
  internals: { type: string; count: number }[];
  position: Point2D;
}

// ─── Messages ───

export interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Commands that were executed (for assistant messages) */
  commands?: CopilotCommand[];
  timestamp: number;
}

// ─── Commands returned FROM the agent ───

export type CopilotCommand =
  | { type: 'create_piece'; piece: Omit<PatternPiece, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'modify_outline'; pieceId: string; outline: PathCommand[] }
  | { type: 'move_piece'; pieceId: string; position: Point2D }
  | { type: 'rename_piece'; pieceId: string; name: string }
  | { type: 'set_seam_allowance'; pieceId: string; mm: number }
  | { type: 'add_internal'; pieceId: string; line: Omit<InternalLine, 'id'> }
  | { type: 'delete_piece'; pieceId: string }
  | { type: 'scale_piece'; pieceId: string; factor: number }
  | { type: 'message'; text: string }; // Plain text response (no action)

// ─── Agent Response ───

export interface CopilotResponse {
  /** Human-readable explanation of what was done */
  message: string;
  /** Commands to execute on the project */
  commands: CopilotCommand[];
}

// ─── Agent Connection Config ───

export type AgentType = 'http' | 'websocket' | 'builtin';

export interface AgentConfig {
  type: AgentType;
  /** For HTTP/WS agents */
  endpoint?: string;
  /** Custom headers (e.g., API keys) */
  headers?: Record<string, string>;
  /** Agent name for display */
  name: string;
  /** System prompt prepended to every request */
  systemPrompt?: string;
}

export const DEFAULT_SYSTEM_PROMPT = `You are an AI pattern making copilot inside OpenClo, a 2D/3D pattern design application.

You help users create and modify garment pattern pieces. You can:
- Create new pattern pieces from descriptions
- Modify existing piece outlines (resize, reshape, add curves)
- Add internal lines (darts, grainlines, notches)
- Adjust seam allowances
- Answer questions about pattern making

COORDINATE SYSTEM:
- 1 unit = 1mm
- Origin (0,0) is top-left
- X increases rightward, Y increases downward
- Pieces are defined as SVG PathCommand arrays

PATHCOMMAND FORMAT:
- M(x,y) — move to
- L(x,y) — line to
- C(cx1,cy1,cx2,cy2,x,y) — cubic bezier curve to
- Z() — close path

When creating pieces, use realistic garment dimensions in mm.
Standard seam allowance: 10mm (1cm).

RESPONSE FORMAT:
Return JSON with "message" (string) and "commands" (array of CopilotCommand).
Each command has a "type" field. See the protocol definition for valid types.

Example response:
{
  "message": "I've extended the sleeve by 20mm.",
  "commands": [
    { "type": "modify_outline", "pieceId": "piece-123", "outline": [...] }
  ]
}

If you can't fulfill a request, return a message-only response with no commands.`;

// ─── Utility: Build context from Redux state ───

export function buildCopilotContext(
  projectState: any,
  editorState: any,
  message: string,
  history: CopilotMessage[],
): CopilotContext {
  const pieces: CopilotPieceInfo[] = projectState.pieces.map((p: PatternPiece) => {
    // Calculate bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of p.outline) {
      for (let i = 0; i < cmd.values.length - 1; i += 2) {
        minX = Math.min(minX, cmd.values[i]);
        minY = Math.min(minY, cmd.values[i + 1]);
        maxX = Math.max(maxX, cmd.values[i]);
        maxY = Math.max(maxY, cmd.values[i + 1]);
      }
    }

    // Build outline summary
    const cmdTypes = p.outline.map((c: PathCommand) => c.type).join('');
    const summary = `${cmdTypes} (${Math.round(maxX - minX)}×${Math.round(maxY - minY)}mm)`;

    // Count internals by type
    const internalCounts: Record<string, number> = {};
    for (const line of p.internals) {
      internalCounts[line.type] = (internalCounts[line.type] || 0) + 1;
    }

    return {
      id: p.id,
      name: p.name,
      outlineSummary: summary,
      bounds: { width: Math.round(maxX - minX), height: Math.round(maxY - minY) },
      seamAllowance: p.seamAllowance,
      internals: Object.entries(internalCounts).map(([type, count]) => ({ type, count })),
      position: p.position,
    };
  });

  return {
    project: {
      name: projectState.name,
      pieces,
      measurements: projectState.avatar.measurements,
    },
    selectedPieceIds: editorState.selectedPieceIds,
    message,
    history: history.slice(-10), // last 10 messages
  };
}
