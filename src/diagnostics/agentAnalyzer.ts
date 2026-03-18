import type { InspectionData, Diagnostic, AgentAnalysis, AgentSuggestion } from './types';

function buildSystemPrompt(): string {
  return `You are an expert pattern engineer analyzing a garment piece.
You receive inspection data and diagnostic results. Provide:
1. A concise summary of the overall state
2. Explanations for each diagnostic finding
3. Actionable suggestions with tool calls

Respond in JSON: { "summary": "...", "explanations": ["..."], "suggestions": [{ "description": "...", "impact": "...", "toolCall": { "name": "...", "params": {...} } }] }

Available tools: adjustFit, setFabric, setSeamAllowance, addNotch, addGrainline, createSeam.`;
}

function buildUserPrompt(data: InspectionData, diagnostics: Diagnostic[]): string {
  return JSON.stringify({ inspectionData: data, diagnostics }, null, 2);
}

// Generate suggestions based on diagnostic category
function generateSuggestions(data: InspectionData, diagnostics: Diagnostic[]): AgentSuggestion[] {
  const suggestions: AgentSuggestion[] = [];

  for (const d of diagnostics) {
    if (d.severity === 'info') continue;

    switch (d.category) {
      case 'fabric':
        if (!data.fabric) {
          suggestions.push({
            description: 'Assign a fabric to this piece',
            impact: 'Required for accurate simulation and production',
            toolCall: { name: 'setFabric', params: { pieceId: data.piece.id, fabricId: 'cotton-poplin' } },
          });
        }
        break;
      case 'seam-allowance':
        if (data.piece.seamAllowance === 0) {
          suggestions.push({
            description: 'Set seam allowance to 10mm',
            impact: 'Standard seam allowance for most garments',
            toolCall: { name: 'setSeamAllowance', params: { pieceId: data.piece.id, width: 10 } },
          });
        }
        break;
      case 'internals':
        if (d.message.includes('grainline')) {
          suggestions.push({
            description: 'Add a grainline to this piece',
            impact: 'Required for correct fabric grain alignment in production',
            toolCall: { name: 'addGrainline', params: { pieceId: data.piece.id } },
          });
        }
        break;
      case 'seam':
        suggestions.push({
          description: 'Connect this piece to adjacent pieces with seams',
          impact: 'Required for garment assembly',
        });
        break;
      case 'fit':
        if (d.severity === 'critical') {
          suggestions.push({
            description: 'Add ease to resolve body penetration',
            impact: 'Prevents intersection with avatar body',
            toolCall: { name: 'adjustFit', params: { pieceId: data.piece.id, amount: 10 } },
          });
        }
        break;
    }
  }

  return suggestions;
}

export async function analyzeInspection(
  data: InspectionData,
  diagnostics: Diagnostic[],
  onChunk: (partial: Partial<AgentAnalysis>) => void,
  signal?: AbortSignal,
): Promise<AgentAnalysis> {
  // Check for cancellation
  if (signal?.aborted) throw new Error('Analysis aborted');

  // For v1: rule-based analysis (LLM integration deferred)
  // Generate analysis from diagnostics directly
  const errors = diagnostics.filter(d => d.severity === 'error');
  const criticals = diagnostics.filter(d => d.severity === 'critical');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  let summary: string;
  if (errors.length > 0 || criticals.length > 0) {
    summary = `${data.piece.name} has ${errors.length + criticals.length} critical issue${errors.length + criticals.length !== 1 ? 's' : ''} that need attention.`;
  } else if (warnings.length > 0) {
    summary = `${data.piece.name} has ${warnings.length} warning${warnings.length !== 1 ? 's' : ''} to review.`;
  } else {
    summary = `${data.piece.name} looks good — no issues detected.`;
  }

  const explanations = diagnostics
    .filter(d => d.severity !== 'info')
    .map(d => d.detail ?? d.message);

  const suggestions = generateSuggestions(data, diagnostics);

  const analysis: AgentAnalysis = { summary, explanations, suggestions };

  // Simulate streaming by sending the full result
  onChunk(analysis);

  return analysis;
}

// Export prompt builders for future LLM integration
export { buildSystemPrompt, buildUserPrompt };
