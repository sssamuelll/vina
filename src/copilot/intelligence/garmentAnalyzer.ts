/**
 * Garment Analyzer -- LLM-based pattern piece classification and seam inference.
 *
 * Sends piece descriptions (dimensions, edges, curves) to the configured LLM
 * provider and returns structured classifications and seam connections.
 *
 * @module copilot/intelligence/garmentAnalyzer
 */

import type { LLMProvider, ProviderConfig, ChatMessage } from '../providers/types';
import { loadProviderConfig } from '../providers/types';
import { anthropicProvider } from '../providers/anthropic';
import { openaiProvider } from '../providers/openai';
import { deepseekProvider } from '../providers/deepseek';
import { ollamaProvider } from '../providers/ollama';
import { claudeBridgeProvider } from '../providers/claudeBridge';
import type { PatternPiece, PieceCategory, PieceSide } from '../../types/types';

// ─── Public Types ──────────────────────────────────────────────────────────

/** Minimal description of a piece, derived from PatternPiece for prompt building. */
export interface PieceDescription {
  id: string;
  name: string;
  /** Bounding-box width in mm */
  width: number;
  /** Bounding-box height in mm */
  height: number;
  edgeCount: number;
  edges: { name: string; length: number; type: string }[];
  hasCurves: boolean;
  outlinePointCount: number;
}

/** Result of the garment analysis. */
export interface GarmentAnalysis {
  pieces: {
    id: string;
    suggestedName: string;
    category: PieceCategory;
    side?: PieceSide;
  }[];
  seams: {
    pieceAId: string;
    edgeAName: string;
    pieceBId: string;
    edgeBName: string;
  }[];
}

// ─── Provider Resolution ───────────────────────────────────────────────────

/**
 * Resolve the active LLM provider and its configuration.
 *
 * Reads from the same persisted config that the copilot chat uses.
 * Returns null when no provider is configured or the API key is missing.
 */
export async function getProvider(): Promise<{
  provider: LLMProvider;
  config: ProviderConfig;
} | null> {
  const config = await loadProviderConfig();
  if (!config) return null;

  // Ollama does not require an API key; all others do
  if (!config.apiKey && config.provider !== 'ollama') return null;

  switch (config.provider) {
    case 'anthropic':
      return { provider: anthropicProvider, config };
    case 'openai':
      return { provider: openaiProvider, config };
    case 'deepseek':
      return { provider: deepseekProvider, config };
    case 'ollama':
      return { provider: ollamaProvider, config };
    case 'claude-bridge':
      return { provider: claudeBridgeProvider, config };
    default:
      return null;
  }
}

// ─── Prompt Building ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert garment pattern maker analyzing pattern pieces to determine their identity and sewing connections.

Identification rules:
- Wide, roughly rectangular pieces are usually bodice panels.
- The widest bodice piece is typically the front (more ease). The next widest is the back.
- Pieces with a distinctly curved top edge and narrower width relative to height are sleeves.
- Very narrow or flat strip-like pieces are neckbands, bindings, waistbands, or collars.
- Pieces with a roughly semicircular or bell shape are skirt panels.
- Use the piece name hint if it suggests a specific role (e.g. "Front" or "Sleeve").

Sewing rules:
- Side seams connect front and back bodice pieces at their vertical edges.
- Sleeve caps (curved edges) connect to armholes (curved edges on bodice pieces).
- Neckbands or collars connect to neckline edges.
- Waistbands connect to waist edges of skirt or trouser pieces.
- Only match edges with similar lengths (within 30% tolerance).
- Each edge can participate in at most ONE seam.
- Never create a seam between an edge and another edge on the same piece.

Respond with ONLY valid JSON, no markdown fences, no explanation:
{
  "pieces": [
    { "id": "piece-id", "suggestedName": "Front Bodice", "category": "bodice", "side": "front" }
  ],
  "seams": [
    { "pieceAId": "piece-id-1", "edgeAName": "sideSeam", "pieceBId": "piece-id-2", "edgeBName": "sideSeam" }
  ]
}

Valid categories: bodice, sleeve, collar, skirt, trouser, waistband, facing, lining, pocket, cuff, hood, yoke, other
Valid sides: front, back, left, right, center, both`;

/**
 * Build a human-readable description of the pattern pieces for the LLM prompt.
 */
function describePieces(pieces: PatternPiece[]): string {
  return pieces
    .map((p) => {
      // Compute bounding box from outline commands
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let cx = 0;
      let cy = 0;

      for (const cmd of p.outline) {
        let ex = cx;
        let ey = cy;
        switch (cmd.type) {
          case 'M':
          case 'L':
            ex = cmd.values[0];
            ey = cmd.values[1];
            break;
          case 'H':
            ex = cmd.values[0];
            ey = cy;
            break;
          case 'V':
            ex = cx;
            ey = cmd.values[0];
            break;
          case 'C':
            ex = cmd.values[4];
            ey = cmd.values[5];
            break;
          case 'S':
            ex = cmd.values[2];
            ey = cmd.values[3];
            break;
          case 'Q':
            ex = cmd.values[2];
            ey = cmd.values[3];
            break;
          case 'T':
            ex = cmd.values[0];
            ey = cmd.values[1];
            break;
          case 'A':
            ex = cmd.values[5];
            ey = cmd.values[6];
            break;
          case 'Z':
            continue;
          default:
            continue;
        }
        if (ex < minX) minX = ex;
        if (ex > maxX) maxX = ex;
        if (ey < minY) minY = ey;
        if (ey > maxY) maxY = ey;
        cx = ex;
        cy = ey;
      }

      const width = Number.isFinite(minX) ? Math.round(maxX - minX) : 0;
      const height = Number.isFinite(minY) ? Math.round(maxY - minY) : 0;
      const hasCurves = p.outline.some(
        (c) => c.type === 'C' || c.type === 'Q' || c.type === 'S',
      );
      const edgeDescriptions = (p.edges ?? [])
        .map(
          (e) =>
            `${e.name} (${Math.round(e.length ?? 0)}mm, ${e.edgeType})`,
        )
        .join(', ');

      return `Piece "${p.id}" -- ${p.name} (${width}mm x ${height}mm):
  Edges: ${edgeDescriptions || 'none'}
  Has curves: ${hasCurves}
  Outline commands: ${p.outline.length}`;
    })
    .join('\n\n');
}

// ─── Core Analysis ─────────────────────────────────────────────────────────

/**
 * Ask the LLM to classify pattern pieces and infer seam connections.
 *
 * @param pieces   - The pattern pieces to analyze
 * @param provider - An LLMProvider instance (anthropic, openai, etc.)
 * @param config   - The provider configuration (model, API key, etc.)
 * @returns Structured garment analysis with piece classifications and seam pairs
 */
export async function analyzeGarment(
  pieces: PatternPiece[],
  provider: LLMProvider,
  config: ProviderConfig,
): Promise<GarmentAnalysis> {
  if (pieces.length === 0) {
    return { pieces: [], seams: [] };
  }

  const userMessage = `Analyze this garment with ${pieces.length} piece${pieces.length === 1 ? '' : 's'}:\n\n${describePieces(pieces)}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await provider.send(messages, [], config);
    const text = response.content.trim();

    // Extract JSON from response (handle possible markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(
        '[garmentAnalyzer] LLM did not return valid JSON:',
        text.slice(0, 200),
      );
      return { pieces: [], seams: [] };
    }

    const raw = JSON.parse(jsonMatch[0]) as GarmentAnalysis;

    // Validate: keep only references to real piece IDs
    const validIds = new Set(pieces.map((p) => p.id));

    // Build a lookup of valid edge names per piece
    const validEdges = new Map<string, Set<string>>();
    for (const p of pieces) {
      const names = new Set((p.edges ?? []).map((e) => e.name));
      validEdges.set(p.id, names);
    }

    const validatedPieces = (raw.pieces ?? []).filter((p) =>
      validIds.has(p.id),
    );

    const usedEdges = new Set<string>();
    const validatedSeams = (raw.seams ?? []).filter((s) => {
      // Both pieces must exist and be different
      if (!validIds.has(s.pieceAId) || !validIds.has(s.pieceBId)) return false;
      if (s.pieceAId === s.pieceBId) return false;

      // Both edge names must exist on their respective pieces
      const edgesA = validEdges.get(s.pieceAId);
      const edgesB = validEdges.get(s.pieceBId);
      if (edgesA && !edgesA.has(s.edgeAName)) return false;
      if (edgesB && !edgesB.has(s.edgeBName)) return false;

      // Each edge may only be used once
      const keyA = `${s.pieceAId}:${s.edgeAName}`;
      const keyB = `${s.pieceBId}:${s.edgeBName}`;
      if (usedEdges.has(keyA) || usedEdges.has(keyB)) return false;
      usedEdges.add(keyA);
      usedEdges.add(keyB);

      return true;
    });

    return { pieces: validatedPieces, seams: validatedSeams };
  } catch (err) {
    console.warn('[garmentAnalyzer] LLM analysis failed:', err);
    return { pieces: [], seams: [] };
  }
}
