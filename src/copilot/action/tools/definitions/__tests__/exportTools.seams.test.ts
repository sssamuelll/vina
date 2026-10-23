import { describe, it, expect, vi } from 'vitest';
import type { RootState, AppDispatch } from '../../../../../store';

// jsdom has no URL.createObjectURL: the downloads are stubbed, what matters is what they receive.
const downloadDXFAAMA = vi.fn();
const downloadPDF = vi.fn();
vi.mock('../../../../../utils/dxf/exportAAMA', () => ({ downloadDXFAAMA }));
vi.mock('../../../../../utils/exportPDF', () => ({ downloadPDF }));

const pieces = [{ id: 'a' }, { id: 'b' }];
const seams = [{ id: 's1' }];
const getState = () => ({ project: { pieces, seams } }) as unknown as RootState;
const dispatch = vi.fn() as unknown as AppDispatch;

/**
 * The project seams resolve `match` ("Empatada") corners; without them the
 * cut line falls back to mitered. The UI export passes them (`uiExport.ts`),
 * so the copilot has to as well or the two files differ.
 */
describe('copilot export tools — project seams', () => {
  it('exportDXF passes the seams like the UI export', async () => {
    const { tools } = await import('../exportTools');
    const result = await tools.find(t => t.name === 'exportDXF')!.execute({}, dispatch, getState);
    expect(result.success).toBe(true);
    expect(downloadDXFAAMA).toHaveBeenCalledWith(pieces, 'pattern.dxf', undefined, seams);
  });

  it('exportPDF passes the seams like the UI export', async () => {
    const { tools } = await import('../exportTools');
    const result = await tools.find(t => t.name === 'exportPDF')!.execute({}, dispatch, getState);
    expect(result.success).toBe(true);
    expect(downloadPDF).toHaveBeenCalledWith(pieces, 'pattern.pdf', seams);
  });
});
