import type { AppDispatch } from '../../store';
import type { PatternPiece, Seam, Fabric } from '../../types/types';
import { showSuccessToast, showErrorToast } from '../../store/copilotUISlice';
import { downloadDXFAAMA } from '../dxf/exportAAMA';
import { downloadPDF } from '../exportPDF';
import { downloadBOM } from './bomExport';

export type UiExportFormat = 'dxf' | 'pdf' | 'bom';

/** The subset of the project slice an export needs. */
interface ExportProject {
  pieces: PatternPiece[];
  seams: Seam[];
  fabrics: Fabric[];
  name?: string;
}

const SUCCESS: Record<UiExportFormat, string> = {
  dxf: 'Exporté tu patrón en DXF.',
  pdf: 'Exporté tu patrón en PDF.',
  bom: 'Exporté la lista de materiales.',
};

const ERR_NOUN: Record<UiExportFormat, string> = {
  dxf: 'el DXF',
  pdf: 'el PDF',
  bom: 'la lista de materiales',
};

/**
 * Run a UI-initiated export. Self-contained: reads the passed project slice,
 * guards empty patterns, triggers the browser download, and toasts the result.
 * Callers pass `store.getState().project`.
 */
export function runUiExport(format: UiExportFormat, project: ExportProject, dispatch: AppDispatch): void {
  const { pieces, seams, fabrics, name } = project;
  if (!pieces || pieces.length === 0) {
    dispatch(showErrorToast('No hay piezas que exportar.'));
    return;
  }
  const base = (name && name.trim()) || 'patron';
  try {
    if (format === 'dxf') downloadDXFAAMA(pieces, `${base}.dxf`);
    else if (format === 'pdf') downloadPDF(pieces, `${base}.pdf`);
    else downloadBOM(pieces, seams, fabrics, `${base}-bom.csv`);
    dispatch(showSuccessToast(SUCCESS[format]));
  } catch (err) {
    dispatch(showErrorToast(`No pude exportar ${ERR_NOUN[format]}: ${(err as Error).message}`));
  }
}
