import { Scaling, Download, Activity, Package, type LucideIcon } from 'lucide-react';
import type { WorkflowStage } from '../../store/selectors';

export interface DockSuggestion {
  /** Action id the container maps to a panel/export/fit-map call. */
  id: string;
  icon: LucideIcon;
  label: string;
}

const GRADE: DockSuggestion = { id: 'grade', icon: Scaling, label: 'Escalar' };
const EXPORT: DockSuggestion = { id: 'export', icon: Download, label: 'Exportar DXF' };
const FITMAP: DockSuggestion = { id: 'fitmap', icon: Activity, label: 'Mapa de ajuste' };
const BOM: DockSuggestion = { id: 'bom', icon: Package, label: 'BOM' };

// Wired-only suggestions per stage (painted-door/undefined tools dropped).
const LEFT: Record<WorkflowStage, DockSuggestion[]> = {
  empty: [], drafted: [GRADE], arranged: [GRADE], sewn: [GRADE], simulating: [GRADE], simulated: [EXPORT],
};
const RIGHT: Record<WorkflowStage, DockSuggestion[]> = {
  empty: [], drafted: [], arranged: [], sewn: [FITMAP], simulating: [], simulated: [BOM],
};

export function getDockSuggestions(stage: WorkflowStage, side: 'left' | 'right'): DockSuggestion[] {
  return (side === 'left' ? LEFT : RIGHT)[stage];
}

const ALL_AUTO_ITEMS: Record<string, DockSuggestion> = { grade: GRADE, export: EXPORT, fitmap: FITMAP, bom: BOM };

/** Look up an auto item by id (so a kept id renders regardless of stage). */
export function getAutoItemById(id: string): DockSuggestion | undefined {
  return ALL_AUTO_ITEMS[id];
}
