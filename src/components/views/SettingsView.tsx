import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { toggleSnapToGrid, setGridSize } from '../../store/editorSlice';
import './views.css';

// ─── Types ───

type UnitSystem = 'mm' | 'cm' | 'inches';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SettingsState {
  units: UnitSystem;
  gridEnabled: boolean;
  gridSpacing: number;
  snapEnabled: boolean;
  snapDistance: number;
  canvasBgColor: string;
  saDefaultWidth: number;
  autoSave: boolean;
}

// ─── Collapsible Section ───

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sidebar-section">
      <button className="sidebar-section-header" onClick={() => setOpen(!open)}>
        <span className="sidebar-section-toggle">{open ? '▾' : '▸'}</span>
        <span className="sidebar-section-title">{title}</span>
      </button>
      <div className={`sidebar-section-body${open ? '' : ' collapsed'}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Main Component ───

export default function SettingsView() {
  const dispatch = useDispatch();
  const snapToGrid = useSelector((s: RootState) => s.editor.snapToGrid);
  const gridSize = useSelector((s: RootState) => s.editor.gridSize);

  // Local settings (not yet in Redux — extend as needed)
  const [units, setUnits] = useState<UnitSystem>('mm');
  const [gridEnabled, setGridEnabled] = useState(true);
  const [snapDistance, setSnapDistance] = useState(5);
  const [canvasBgColor, setCanvasBgColor] = useState('#1e1e1e');
  const [saDefaultWidth, setSaDefaultWidth] = useState(10);
  const [autoSave, setAutoSave] = useState(false);

  const handleGridSpacingChange = useCallback(
    (value: number) => {
      dispatch(setGridSize(value));
    },
    [dispatch],
  );

  const handleToggleSnap = useCallback(() => {
    dispatch(toggleSnapToGrid());
  }, [dispatch]);

  return (
    <div className="sidebar-view">
      <div className="sidebar-view-header">
        <h2>Settings</h2>
      </div>
      <div className="sidebar-view-content">
        {/* Units */}
        <Section title="Units">
          <div className="sidebar-field-row">
            <span className="sidebar-label">Unit System</span>
            <select
              className="sidebar-select"
              style={{ maxWidth: 100 }}
              value={units}
              onChange={(e) => setUnits(e.target.value as UnitSystem)}
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="inches">inches</option>
            </select>
          </div>
        </Section>

        {/* Grid */}
        <Section title="Grid">
          <div className="sidebar-field-row">
            <span className="sidebar-label">Show Grid</span>
            <label className="sidebar-toggle">
              <input
                type="checkbox"
                checked={gridEnabled}
                onChange={() => setGridEnabled(!gridEnabled)}
              />
              <span className="sidebar-toggle-slider" />
            </label>
          </div>
          <div className="sidebar-field-row">
            <span className="sidebar-label">Grid Spacing</span>
            <input
              type="number"
              className="sidebar-input sidebar-input-sm"
              value={gridSize}
              min={1}
              step={1}
              onChange={(e) => handleGridSpacingChange(+e.target.value)}
            />
          </div>
        </Section>

        {/* Snap */}
        <Section title="Snap">
          <div className="sidebar-field-row">
            <span className="sidebar-label">Snap to Grid</span>
            <label className="sidebar-toggle">
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={handleToggleSnap}
              />
              <span className="sidebar-toggle-slider" />
            </label>
          </div>
          <div className="sidebar-field-row">
            <span className="sidebar-label">Snap Distance</span>
            <input
              type="number"
              className="sidebar-input sidebar-input-sm"
              value={snapDistance}
              min={1}
              step={1}
              onChange={(e) => setSnapDistance(+e.target.value)}
            />
          </div>
        </Section>

        {/* Canvas */}
        <Section title="Canvas">
          <div className="sidebar-field-row">
            <span className="sidebar-label">Background</span>
            <input
              type="color"
              className="sidebar-color-input"
              value={canvasBgColor}
              onChange={(e) => setCanvasBgColor(e.target.value)}
            />
          </div>
        </Section>

        {/* Seam Allowance */}
        <Section title="Seam Allowance">
          <div className="sidebar-field-row">
            <span className="sidebar-label">Default SA Width</span>
            <input
              type="number"
              className="sidebar-input sidebar-input-sm"
              value={saDefaultWidth}
              min={0}
              step={0.5}
              onChange={(e) => setSaDefaultWidth(+e.target.value)}
            />
          </div>
        </Section>

        {/* Auto-save */}
        <Section title="Auto-save">
          <div className="sidebar-field-row">
            <span className="sidebar-label">Auto-save</span>
            <label className="sidebar-toggle">
              <input
                type="checkbox"
                checked={autoSave}
                onChange={() => setAutoSave(!autoSave)}
              />
              <span className="sidebar-toggle-slider" />
            </label>
          </div>
          {autoSave && (
            <div className="sidebar-info" style={{ marginTop: 4 }}>
              Project will be saved to local storage automatically.
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
