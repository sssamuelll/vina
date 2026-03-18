import type { PhysicalFabric } from '../utils/cloth/physicalFabric';

// ─── Inspection Target ───────────────────────────────────────────────────────

export type InspectionTargetType = 'piece' | 'edge' | 'point' | 'vertex';

export interface InspectionTarget {
  type: InspectionTargetType;
  pieceId: string;
  edgeName?: string;
  pointIndex?: number;
  vertexIndex?: number;
  constructionPointId?: string;
}

// ─── Inspection Data Bag ─────────────────────────────────────────────────────

export interface InspectionPieceData {
  id: string;
  name: string;
  position: { x: number; y: number };
  rotation: number;
  seamAllowance: number;
}

export interface InspectionEdgeData {
  name: string;
  type: string;
  length: number;
}

export interface InspectionSeamData {
  id: string;
  partnerPieceId: string;
  partnerPieceName: string;
  edgeName: string;
  type: string;
}

export interface InspectionInternalData {
  type: string;
  count: number;
}

export interface InspectionConstructionPointData {
  label: string;
  x: number;
  y: number;
  definitionType: string;
}

export interface InspectionSimulationData {
  position?: [number, number, number];
  collisionDistance?: number;
  particleCount?: number;
}

export interface InspectionData {
  target: InspectionTarget;
  timestamp: number;
  piece: InspectionPieceData;
  fabric?: PhysicalFabric;
  edge?: InspectionEdgeData;
  seams: InspectionSeamData[];
  internals: InspectionInternalData[];
  constructionPoint?: InspectionConstructionPointData;
  simulation?: InspectionSimulationData;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export type DiagnosticSeverity = 'info' | 'warning' | 'critical' | 'error';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  category: string;
  message: string;
  detail?: string;
}

// ─── Agent Analysis ──────────────────────────────────────────────────────────

export interface AgentSuggestion {
  description: string;
  impact: string;
  toolCall?: { name: string; params: Record<string, unknown> };
}

export interface AgentAnalysis {
  summary: string;
  explanations: string[];
  suggestions: AgentSuggestion[];
}
