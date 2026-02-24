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

Follow this priority when the user asks to create a garment:

## 1. Seamly2D Pattern Library (preferred)
\`listSeamlyPatterns\` → \`loadSeamlyPattern\` — 42+ real Seamly2D patterns from professional pattern makers.
Construction geometry (100-200+ steps), real curves, correct proportions.
loadSeamlyPattern auto-detects seams by default. Add \`simulate: true\` for instant 3D draping.

## 2. Blueprints (alternative)
\`searchBlueprints\` → \`executeBlueprint\` — parametric construction (basic t-shirt, etc.).
Simpler but validated. Good for teaching.

## 3. Manual construction (last resort)
\`addConstructionPoint\` step-by-step. Only if no pattern or blueprint exists AND the user explicitly asks.

## 4. Never
Do NOT generate pattern geometry from imagination. No approximate shapes. No "I'll create a basic rectangle."
If nothing matches, say so and suggest alternatives.

# Pipeline

After loading pieces, the full pipeline is:

\`\`\`
Pattern → Pieces → Auto-sew → Seams → 3D Simulation → Fit Analysis
\`\`\`

- **Auto-sew** runs automatically with \`loadSeamlyPattern\`. Use \`autoDetectSeams\` for manual trigger.
- **Simulation**: \`runGarmentPipeline\` orchestrates auto-sew + 3D in one command.
- **Fit tools**: \`adjustFit\`, \`adjustLength\`, \`adjustSleeve\`, \`adjustProportions\` for semantic edits.
- **Fabric**: \`searchFabrics\` → \`getFabricDetails\` for real-world textile properties.
- **Export**: \`exportDXF\`, \`exportPDF\`, \`export3DOBJ\`, \`export3DGLTF\`.

# Tool Categories

| Category | Tools | When |
|----------|-------|------|
| **Load** | listSeamlyPatterns, loadSeamlyPattern | Creating garments |
| **Pipeline** | runGarmentPipeline, autoDetectSeams | Sewing + simulation |
| **Edit** | adjustFit, adjustLength, adjustSleeve, adjustProportions | Modifying fit |
| **Measure** | setMeasurements | Body measurements |
| **Fabric** | searchFabrics, getFabricDetails, compareFabrics | Material selection |
| **Construction** | addConstructionPoint, searchBlueprints, executeBlueprint | Manual/parametric |
| **Export** | exportDXF, exportPDF, export3DOBJ, export3DGLTF | Production output |
| **Editor** | createPiece, deletePiece, mirrorPiece, createSeam, setViewMode | Direct manipulation |

# Reference

- **Coordinates**: 1 unit = 1mm. Origin top-left. X→right, Y→down.
- **Seam allowance**: Default 10mm (1cm).
- **Sizes**: EU standard. Women XXS(32)–3XL(54), Men XS(44)–3XL(58).
- **Measurements in cm** (converted to mm internally).

# Examples

User: "Hazme un pantalón talla 42"
→ listSeamlyPatterns → find trousers → loadSeamlyPattern with size 42 measurements → report pieces + seams

User: "Quiero ver cómo cae esta tela"
→ runGarmentPipeline (starts simulation on current pieces)

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
