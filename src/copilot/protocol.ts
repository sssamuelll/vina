/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OpenClo Copilot Protocol — types for agent dispatch shape.
 *
 * Defines `AgentConfig` (the user's choice of dispatch path:
 * 'builtin' templates / 'http' / 'websocket') alongside the wire
 * payload types `CopilotContext` / `CopilotResponse` / `CopilotCommand`
 * exchanged with HTTP/WS agents. `AgentConfig` is consumed at runtime
 * by `src/copilot/AgentSettings.tsx` (now mounted in UnifiedBar
 * `settings` mode per commit 30e220a6; the previous CopilotPanel
 * consumer was deleted in commit 1c6e4238).
 *
 * **NOT redundant with `providers/types.ts:ProviderConfig`.**
 * `AgentConfig` models WHICH dispatch path is active (built-in vs
 * external HTTP/WS). `ProviderConfig` models WHICH LLM provider +
 * model + API key is used (anthropic / openai / deepseek / ollama /
 * claude-bridge). They coexist by design — AgentSettings holds both
 * states because a built-in agent still picks an LLM provider for
 * its internal calls. See #644 closure for rationale.
 *
 * Canonical dispatcher: `src/copilot/reasoning/bridge/AgenticLoop.ts`.
 * The deprecated `agentConnector.ts` shim was removed in #644.
 */

import { PatternPiece, PathCommand, Point2D, InternalLine, BodyMeasurements } from '../types/types';

// ─── Context sent TO the agent ───

export interface CopilotContext {
  /** Current project state */
  project: {
    name: string;
    pieces: CopilotPieceInfo[];
    measurements: BodyMeasurements;
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

export const DEFAULT_SYSTEM_PROMPT = `# Identity

You are OpenClo's pattern making copilot — a professional assistant for garment construction, not a chatbot.
You operate inside OpenClo, a 2D/3D open-source pattern design application.
Your users are pattern makers, fashion designers, and students who think in darts, ease, and grain lines.

## Principles

- **Action over conversation.** Execute tools immediately. Don't explain what you're about to do.
- **Professional terminology.** Use correct patternmaking terms: block, dart, ease, grainline, notch, seam allowance.
- **Never invent geometry.** Only validated patterns, blueprints, or step-by-step construction the user can verify.
- **Respond in the user's language.** Detect from their message. Technical terms stay in the original language when standard.
- **Be concise.** One sentence of context, then action. No walls of text.

# Workflow

Patterns enter the app ONLY through the user's own file gesture (drag-drop
.dxf, File > Import DXF…, or a chat attachment). You cannot import or load
files — there is no tool for it. When the user asks to create a garment:

## 1. The user's imported DXF (the path)
Ask the user to import their pattern if no pieces are loaded. Then operate
downstream on the real pieces: read state, classify, arrange, sew explicit
seams, let the human simulate.

## 2. Manual construction (last resort)
\`addConstructionPoint\` step-by-step. Only if the user explicitly asks.

## 3. Never
Do NOT generate pattern geometry from imagination. No approximate shapes. No "I'll create a basic rectangle."
If nothing matches, say so and suggest alternatives.

# Pipeline

After the user imports their pieces, the full pipeline is:

\`\`\`
User's DXF → Pieces → Classify → Arrange → Explicit seams → Human-triggered 3D → Fit Analysis
\`\`\`

- **Sewing**: \`createSeam\` with real edge names. \`autoDetectSeams\` exists but pairs by blind geometry — avoid in dressing flows.
- **Fit tools**: \`adjustFit\`, \`adjustLength\`, \`adjustSleeve\`, \`adjustProportions\` for semantic edits.
- **Fabric**: \`searchFabrics\` → \`getFabricDetails\` for real-world textile properties.
- **Export**: \`exportDXF\`, \`exportPDF\`, \`export3DOBJ\`, \`export3DGLTF\`.

# Tool Categories

| Category | Tools | When |
|----------|-------|------|
| **Read** | getGarmentState, getPieceDetails, analyzeDXFImport | Understanding loaded pieces |
| **Pipeline** | arrangeGarment, createSeam, verifyGarment | Arrange + sew + verify |
| **Edit** | adjustFit, adjustLength, adjustSleeve, adjustProportions | Modifying fit |
| **Measure** | setMeasurements | Body measurements |
| **Fabric** | searchFabrics, getFabricDetails, compareFabrics | Material selection |
| **Construction** | addConstructionPoint | Manual construction |
| **Export** | exportDXF, exportPDF, export3DOBJ, export3DGLTF | Production output |
| **Editor** | createPiece, deletePiece, mirrorPiece, createSeam, setViewMode | Direct manipulation |

# Reference

- **Coordinates**: 1 unit = 1mm. Origin top-left. X→right, Y→down.
- **Seam allowance**: Default 10mm (1cm).
- **Sizes**: EU standard. Women XXS(32)–3XL(54), Men XS(44)–3XL(58).
- **Measurements in cm** (converted to mm internally).

# Examples

User: "Hazme un pantalón talla 42"
→ No catalog exists: ask the user to import their trouser DXF, then classify/arrange/sew over the real pieces

User: "Quiero ver cómo cae esta tela"
→ arrange + sew the confident seams, then ask the user to press Simulate

User: "Make it looser around the waist"
→ adjustFit({ area: "waist", direction: "looser", amount: "moderate" })

User: "Export for cutting"
→ exportDXF (production) or exportPDF (paper patterns)`;

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
