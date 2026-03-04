import { describe, it, expect } from 'vitest';
import { getActionCategory } from '../actionTypes';
import type { CopilotAction } from '../actionTypes';
import { validateAction } from '../actionValidator';
import type { RootState } from '../../../store';

const mockState = {
  project: { pieces: [], seams: [], fabrics: [], avatar: { measurements: {} }, name: '', id: '' },
  editor: { selectedPieceIds: [] },
  simulation: { simulationState: 'idle' },
} as unknown as RootState;

describe('import_dxf action', () => {
  it('has category "project"', () => {
    const action: CopilotAction = { action: 'import_dxf', fileContent: 'test' };
    expect(getActionCategory(action)).toBe('project');
  });

  it('validates successfully with fileContent', () => {
    const action: CopilotAction = { action: 'import_dxf', fileContent: '0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF' };
    const result = validateAction(action, mockState);
    expect(result.valid).toBe(true);
  });

  it('fails validation without fileContent', () => {
    const action = { action: 'import_dxf' } as unknown as CopilotAction;
    const result = validateAction(action, mockState);
    expect(result.valid).toBe(false);
  });

  it('fails validation with empty fileContent', () => {
    const action = { action: 'import_dxf', fileContent: '' } as unknown as CopilotAction;
    const result = validateAction(action, mockState);
    expect(result.valid).toBe(false);
  });
});
