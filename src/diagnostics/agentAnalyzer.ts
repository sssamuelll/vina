import type { InspectionData, Diagnostic, AgentAnalysis, AgentSuggestion } from './types';
import { TINY_PIECE_MESSAGE_PREFIX } from './ruleEngine';

// Generate suggestions based on diagnostic category
function generateSuggestions(data: InspectionData, diagnostics: Diagnostic[]): AgentSuggestion[] {
  const suggestions: AgentSuggestion[] = [];

  for (const d of diagnostics) {
    if (d.severity === 'info') continue;

    switch (d.category) {
      case 'fabric':
        if (!data.fabric) {
          suggestions.push({
            description: 'Asignar una tela a esta pieza',
            impact: 'Necesaria para simular y producir con precisión',
            toolCall: { name: 'setFabric', params: { pieceId: data.piece.id, fabricId: 'cotton-poplin' } },
          });
        }
        break;
      case 'seam-allowance':
        // SA = 0 is the normal NET state (hallazgo #2) — never suggest
        // adding an allowance the patternmaker didn't ask for. The only
        // remaining seam-allowance diagnostic is the explicit-too-small
        // warning, which needs the user's intent, not an auto-fix.
        break;
      case 'internals':
        if (!data.internals.some((internal) => internal.type === 'grainline')) {
          suggestions.push({
            description: 'Añadir dirección de hilo a esta pieza',
            impact: 'Necesaria para alinear el hilo de la tela al producir',
            toolCall: { name: 'addGrainline', params: { pieceId: data.piece.id } },
          });
        }
        break;
      case 'seam':
        suggestions.push({
          description: 'Conectar esta pieza con las piezas adyacentes',
          impact: 'Necesaria para ensamblar la prenda',
        });
        break;
      case 'fit':
        if (d.severity === 'critical') {
          suggestions.push({
            description: 'Añadir holgura para corregir la penetración',
            impact: 'Evita que la tela atraviese el cuerpo del avatar',
            toolCall: { name: 'adjustFit', params: { pieceId: data.piece.id, amount: 10 } },
          });
        }
        break;
      case 'geometry':
        if (d.message.startsWith(TINY_PIECE_MESSAGE_PREFIX)) {
          suggestions.push({
            description: 'Eliminar esta pieza pequeña y aislada',
            impact: 'Mejora la estabilidad y la limpieza de la simulación',
            toolCall: { name: 'removePiece', params: { pieceId: data.piece.id } },
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
  if (signal?.aborted) throw new Error('Análisis cancelado');

  // For v1: rule-based analysis (LLM integration deferred)
  // Generate analysis from diagnostics directly
  const errors = diagnostics.filter(d => d.severity === 'error');
  const criticals = diagnostics.filter(d => d.severity === 'critical');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  let summary: string;
  if (errors.length > 0 || criticals.length > 0) {
    const count = errors.length + criticals.length;
    summary = count === 1
      ? `${data.piece.name} tiene 1 problema crítico que requiere atención.`
      : `${data.piece.name} tiene ${count} problemas críticos que requieren atención.`;
  } else if (warnings.length > 0) {
    summary = warnings.length === 1
      ? `${data.piece.name} tiene 1 aviso por revisar.`
      : `${data.piece.name} tiene ${warnings.length} avisos por revisar.`;
  } else {
    summary = `${data.piece.name} no tiene problemas detectados.`;
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
