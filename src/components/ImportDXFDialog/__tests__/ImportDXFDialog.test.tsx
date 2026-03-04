// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ImportDXFDialog from '../ImportDXFDialog';
import type { DXFDocument } from '../../../utils/dxf/types';

afterEach(() => {
  cleanup();
});

function makeDoc(): DXFDocument {
  return {
    header: new Map(),
    layers: [],
    blocks: new Map([
      ['Front', { name: 'Front', basePoint: { x: 0, y: 0 }, entities: [] }],
      ['Back', { name: 'Back', basePoint: { x: 0, y: 0 }, entities: [] }],
    ]),
    entities: [],
  };
}

describe('ImportDXFDialog', () => {
  it('renders piece summary from DXFDocument', () => {
    const onImport = vi.fn();
    const onCancel = vi.fn();
    render(<ImportDXFDialog doc={makeDoc()} onImport={onImport} onCancel={onCancel} />);
    expect(screen.getByText(/2 pieces detected/i)).toBeTruthy();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onImport = vi.fn();
    const onCancel = vi.fn();
    render(<ImportDXFDialog doc={makeDoc()} onImport={onImport} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onImport with default options when Import is clicked', () => {
    const onImport = vi.fn();
    const onCancel = vi.fn();
    render(<ImportDXFDialog doc={makeDoc()} onImport={onImport} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Import'));
    expect(onImport).toHaveBeenCalledWith(expect.objectContaining({
      loadType: 'add',
      unit: 'auto',
      scale: 100,
      importNotches: true,
      importGrainlines: true,
      importInternalLines: true,
    }));
  });

  it('auto-detects unit from $INSUNITS header', () => {
    const doc = makeDoc();
    doc.header.set('$INSUNITS', 1); // inches
    const onImport = vi.fn();
    const onCancel = vi.fn();
    render(<ImportDXFDialog doc={doc} onImport={onImport} onCancel={onCancel} />);
    expect(screen.getAllByText(/inch/i).length).toBeGreaterThan(0);
  });
});
