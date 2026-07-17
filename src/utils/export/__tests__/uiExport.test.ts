/**
 * @vitest-environment jsdom
 *
 * Orchestration of runUiExport: routes to the right download function with a
 * name-derived filename, toasts success, and guards the empty-pieces case.
 * Download modules are mocked so no real blob/anchor fires.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../dxf/exportAAMA', () => ({ downloadDXFAAMA: vi.fn() }));
vi.mock('../../exportPDF', () => ({ downloadPDF: vi.fn() }));
vi.mock('../bomExport', () => ({ downloadBOM: vi.fn() }));

import { runUiExport } from '../uiExport';
import { downloadDXFAAMA } from '../../dxf/exportAAMA';
import { downloadPDF } from '../../exportPDF';
import { downloadBOM } from '../bomExport';
import { showSuccessToast, showErrorToast } from '../../../store/copilotUISlice';
import type { PatternPiece } from '../../../types/types';

const piece = { id: 'p1', name: 'Front', outline: [{ type: 'M', values: [0, 0] }], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as PatternPiece;
const project = (pieces: PatternPiece[], name = 'Tee') => ({ pieces, seams: [], fabrics: [], name });

beforeEach(() => vi.clearAllMocks());

describe('runUiExport', () => {
  it('exports DXF with a name-derived filename and toasts success', () => {
    const dispatch = vi.fn();
    runUiExport('dxf', project([piece]), dispatch);
    expect(downloadDXFAAMA).toHaveBeenCalledWith([piece], 'Tee.dxf', undefined, []);
    expect(dispatch).toHaveBeenCalledWith(showSuccessToast('Exporté tu patrón en DXF.'));
  });

  it('exports PDF', () => {
    const dispatch = vi.fn();
    runUiExport('pdf', project([piece]), dispatch);
    expect(downloadPDF).toHaveBeenCalledWith([piece], 'Tee.pdf', []);
    expect(dispatch).toHaveBeenCalledWith(showSuccessToast('Exporté tu patrón en PDF.'));
  });

  it('exports BOM with seams and fabrics', () => {
    const dispatch = vi.fn();
    runUiExport('bom', project([piece]), dispatch);
    expect(downloadBOM).toHaveBeenCalledWith([piece], [], [], 'Tee-bom.csv');
    expect(dispatch).toHaveBeenCalledWith(showSuccessToast('Exporté la lista de materiales.'));
  });

  it('falls back to "patron" when the project name is empty', () => {
    const dispatch = vi.fn();
    runUiExport('dxf', project([piece], ''), dispatch);
    expect(downloadDXFAAMA).toHaveBeenCalledWith([piece], 'patron.dxf', undefined, []);
  });

  it('shows an error toast and downloads nothing with zero pieces', () => {
    const dispatch = vi.fn();
    runUiExport('dxf', project([]), dispatch);
    expect(downloadDXFAAMA).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(showErrorToast('No hay piezas que exportar.'));
  });
});
