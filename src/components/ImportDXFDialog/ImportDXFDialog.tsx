import { useState, useMemo } from 'react';
import type { DXFDocument } from '../../utils/dxf/types';
import './ImportDXFDialog.css';

export interface ImportDXFOptions {
  loadType: 'open' | 'add';
  unit: 'mm' | 'cm' | 'inch' | 'auto';
  scale: number;
  importNotches: boolean;
  importGrainlines: boolean;
  importInternalLines: boolean;
}

interface Props {
  doc: DXFDocument;
  onImport: (options: ImportDXFOptions) => void;
  onCancel: () => void;
}

const INSUNITS_MAP: Record<number, 'inch' | 'mm' | 'cm'> = {
  1: 'inch',
  4: 'mm',
  5: 'cm',
};

export default function ImportDXFDialog({ doc, onImport, onCancel }: Props) {
  const detectedUnit = useMemo(() => {
    const raw = doc.header.get('$INSUNITS');
    if (typeof raw === 'number') return INSUNITS_MAP[raw] ?? null;
    if (typeof raw === 'string') return INSUNITS_MAP[parseInt(raw, 10)] ?? null;
    return null;
  }, [doc]);

  const [loadType, setLoadType] = useState<'open' | 'add'>('add');
  const [unit, setUnit] = useState<'mm' | 'cm' | 'inch' | 'auto'>('auto');
  const [scale, setScale] = useState(100);
  const [importNotches, setImportNotches] = useState(true);
  const [importGrainlines, setImportGrainlines] = useState(true);
  const [importInternalLines, setImportInternalLines] = useState(true);

  const pieceCount = doc.blocks.size || 1;
  const pieceNames = doc.blocks.size > 0
    ? Array.from(doc.blocks.keys()).join(', ')
    : 'Imported Piece';

  const resolvedUnit = unit === 'auto' ? (detectedUnit ?? 'mm') : unit;

  const handleImport = () => {
    onImport({ loadType, unit, scale, importNotches, importGrainlines, importInternalLines });
  };

  return (
    <div className="import-dxf-overlay" onClick={onCancel}>
      <div className="import-dxf-dialog" onClick={e => e.stopPropagation()}>
        <h3>Import DXF</h3>

        {/* Load Type */}
        <div className="import-dxf-row">
          <label>Load Type</label>
        </div>
        <div className="import-dxf-radio-group">
          <label>
            <input type="radio" name="loadType" checked={loadType === 'add'} onChange={() => setLoadType('add')} />
            Add (append)
          </label>
          <label>
            <input type="radio" name="loadType" checked={loadType === 'open'} onChange={() => setLoadType('open')} />
            Open (replace)
          </label>
        </div>

        {/* Unit */}
        <div className="import-dxf-row">
          <label>Unit</label>
          <select value={unit} onChange={e => setUnit(e.target.value as ImportDXFOptions['unit'])}>
            <option value="auto">Auto{detectedUnit ? ` (${detectedUnit})` : ''}</option>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="inch">inch</option>
          </select>
        </div>

        {/* Scale */}
        <div className="import-dxf-row">
          <label>Scale (%)</label>
          <input type="number" min={1} max={1000} value={scale} onChange={e => setScale(Number(e.target.value))} />
        </div>

        {/* Piece Summary */}
        <div className="import-dxf-summary">
          {pieceCount} pieces detected: {pieceNames}
          <br />
          Unit: {resolvedUnit}
        </div>

        {/* Import Options */}
        <div className="import-dxf-checkboxes">
          <label>
            <input type="checkbox" checked={importNotches} onChange={e => setImportNotches(e.target.checked)} />
            Import notches
          </label>
          <label>
            <input type="checkbox" checked={importGrainlines} onChange={e => setImportGrainlines(e.target.checked)} />
            Import grainlines
          </label>
          <label>
            <input type="checkbox" checked={importInternalLines} onChange={e => setImportInternalLines(e.target.checked)} />
            Import internal lines
          </label>
        </div>

        {/* Actions */}
        <div className="import-dxf-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={handleImport}>Import</button>
        </div>
      </div>
    </div>
  );
}
