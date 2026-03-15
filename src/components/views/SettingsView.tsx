/**
 * SettingsView — VS Code-style settings page.
 *
 * Flat scrollable list grouped by category, with a search filter bar.
 * Each setting shows label, description, and inline control.
 */
import { useState, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import {
  setUnits, toggleSnapToGrid, setGridSize,
  toggleSeamAllowance, setDefaultSAWidth,
  toggleGrainlines, toggleAnchorPoints,
  togglePieceNames, toggleLineLengths, toggleSewingLines,
  setRenderMode2D,
} from '../../store/editorSlice';
import {
  setBackgroundMode, setBackgroundColor,
  setExposure, setToneMapping,
  setGroundVisible, setShadowOpacity,
} from '../../store/renderSettingsSlice';
import {
  setParticleDistance, setBodyCollision,
  setSurfaceMode3D, toggleGarment,
  toggleSeamlines3D, toggleInternalLines3D,
} from '../../store/simulationSlice';
import type { UnitSystem } from '../../types/types';
import type { BackgroundMode, ToneMapping } from '../../store/renderSettingsSlice';
import type { SurfaceMode3D } from '../../store/simulationSlice';
import './views.css';

// ─── Setting Definition ─────────────────────────────────────────────────────

interface SettingDef {
  id: string;
  category: string;
  label: string;
  description: string;
  type: 'toggle' | 'select' | 'number' | 'color';
  choices?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  selector: (state: RootState) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (value: any) => any;
  /** If true, dispatches with no payload (toggle actions) */
  isToggleAction?: boolean;
}

// ─── Setting Definitions ────────────────────────────────────────────────────

const SETTINGS: SettingDef[] = [
  // ── General ──
  {
    id: 'units',
    category: 'General',
    label: 'Unit System',
    description: 'Measurement units used throughout the application.',
    type: 'select',
    choices: [
      { value: 'mm', label: 'Millimeters (mm)' },
      { value: 'cm', label: 'Centimeters (cm)' },
      { value: 'inches', label: 'Inches' },
    ],
    selector: (s) => s.editor.units,
    action: (v: UnitSystem) => setUnits(v),
  },

  // ── 2D Editor ──
  {
    id: 'snapToGrid',
    category: '2D Editor',
    label: 'Snap to Grid',
    description: 'Snap points and pieces to the grid when moving.',
    type: 'toggle',
    selector: (s) => s.editor.snapToGrid,
    action: () => toggleSnapToGrid(),
    isToggleAction: true,
  },
  {
    id: 'gridSize',
    category: '2D Editor',
    label: 'Grid Size',
    description: 'Grid spacing in current units.',
    type: 'number',
    min: 1,
    max: 100,
    step: 1,
    selector: (s) => s.editor.gridSize,
    action: (v: number) => setGridSize(v),
  },
  {
    id: 'showSeamAllowance',
    category: '2D Editor',
    label: 'Show Seam Allowance',
    description: 'Display seam allowance outlines on pattern pieces.',
    type: 'toggle',
    selector: (s) => s.editor.showSeamAllowance,
    action: () => toggleSeamAllowance(),
    isToggleAction: true,
  },
  {
    id: 'saWidth',
    category: '2D Editor',
    label: 'Default Seam Allowance Width',
    description: 'Default width for seam allowances (mm).',
    type: 'number',
    min: 0,
    max: 50,
    step: 0.5,
    selector: (s) => s.editor.defaultSeamAllowanceWidth,
    action: (v: number) => setDefaultSAWidth(v),
  },
  {
    id: 'showGrainlines',
    category: '2D Editor',
    label: 'Show Grainlines',
    description: 'Display grainline indicators on pattern pieces.',
    type: 'toggle',
    selector: (s) => s.editor.showGrainlines,
    action: () => toggleGrainlines(),
    isToggleAction: true,
  },
  {
    id: 'showAnchorPoints',
    category: '2D Editor',
    label: 'Show Anchor Points',
    description: 'Display anchor/control points on piece outlines.',
    type: 'toggle',
    selector: (s) => s.editor.showAnchorPoints,
    action: () => toggleAnchorPoints(),
    isToggleAction: true,
  },
  {
    id: 'showPieceNames',
    category: '2D Editor',
    label: 'Show Piece Names',
    description: 'Display piece name labels on the 2D canvas.',
    type: 'toggle',
    selector: (s) => s.editor.showPieceNames,
    action: () => togglePieceNames(),
    isToggleAction: true,
  },
  {
    id: 'showLineLengths',
    category: '2D Editor',
    label: 'Show Line Lengths',
    description: 'Display length annotations on pattern edges.',
    type: 'toggle',
    selector: (s) => s.editor.showLineLengths,
    action: () => toggleLineLengths(),
    isToggleAction: true,
  },
  {
    id: 'showSewingLines',
    category: '2D Editor',
    label: 'Show Sewing Lines',
    description: 'Display sewing/stitch lines on pattern pieces.',
    type: 'toggle',
    selector: (s) => s.editor.showSewingLines,
    action: () => toggleSewingLines(),
    isToggleAction: true,
  },
  {
    id: 'renderMode2D',
    category: '2D Editor',
    label: 'Render Mode',
    description: '2D canvas rendering style.',
    type: 'select',
    choices: [
      { value: 'textured', label: 'Textured' },
      { value: 'translucent', label: 'Translucent' },
      { value: 'wireframe', label: 'Wireframe' },
    ],
    selector: (s) => s.editor.renderMode2D,
    action: (v: 'textured' | 'translucent' | 'wireframe') => setRenderMode2D(v),
  },

  // ── 3D Viewport ──
  {
    id: 'showGarment',
    category: '3D Viewport',
    label: 'Show Garment',
    description: 'Toggle garment piece visibility in the 3D view.',
    type: 'toggle',
    selector: (s) => s.simulation.showGarment,
    action: () => toggleGarment(),
    isToggleAction: true,
  },
  {
    id: 'showSeamlines3D',
    category: '3D Viewport',
    label: 'Show Seam Lines',
    description: 'Display seam connection lines between pieces in 3D.',
    type: 'toggle',
    selector: (s) => s.simulation.showSeamlines3D,
    action: () => toggleSeamlines3D(),
    isToggleAction: true,
  },
  {
    id: 'showInternalLines3D',
    category: '3D Viewport',
    label: 'Show Internal Lines',
    description: 'Display internal lines (darts, notches) in 3D view.',
    type: 'toggle',
    selector: (s) => s.simulation.showInternalLines3D,
    action: () => toggleInternalLines3D(),
    isToggleAction: true,
  },
  {
    id: 'surfaceMode3D',
    category: '3D Viewport',
    label: 'Surface Mode',
    description: 'Rendering style for 3D garment surfaces.',
    type: 'select',
    choices: [
      { value: 'textured', label: 'Textured' },
      { value: 'translucent', label: 'Translucent' },
      { value: 'mesh', label: 'Mesh' },
      { value: 'thick', label: 'Thick' },
    ],
    selector: (s) => s.simulation.surfaceMode3D,
    action: (v: SurfaceMode3D) => setSurfaceMode3D(v),
  },
  {
    id: 'bodyCollision',
    category: '3D Viewport',
    label: 'Body Collision',
    description: 'Enable collision detection between cloth and avatar body.',
    type: 'toggle',
    selector: (s) => s.simulation.bodyCollision,
    action: (v: boolean) => setBodyCollision(v),
  },
  {
    id: 'groundVisible',
    category: '3D Viewport',
    label: 'Show Ground',
    description: 'Display the ground plane in the 3D viewport.',
    type: 'toggle',
    selector: (s) => s.renderSettings.groundVisible,
    action: (v: boolean) => setGroundVisible(v),
  },
  {
    id: 'shadowOpacity',
    category: '3D Viewport',
    label: 'Shadow Opacity',
    description: 'Opacity of the ground shadow (0 = invisible, 1 = solid).',
    type: 'number',
    min: 0,
    max: 1,
    step: 0.1,
    selector: (s) => s.renderSettings.shadowOpacity,
    action: (v: number) => setShadowOpacity(v),
  },

  // ── Rendering ──
  {
    id: 'backgroundMode',
    category: 'Rendering',
    label: 'Background Mode',
    description: 'Background style for the 3D viewport.',
    type: 'select',
    choices: [
      { value: 'solid', label: 'Solid Color' },
      { value: 'hdri', label: 'HDRI Environment' },
      { value: 'transparent', label: 'Transparent' },
    ],
    selector: (s) => s.renderSettings.backgroundMode,
    action: (v: BackgroundMode) => setBackgroundMode(v),
  },
  {
    id: 'backgroundColor',
    category: 'Rendering',
    label: 'Background Color',
    description: 'Solid background color for the 3D viewport.',
    type: 'color',
    selector: (s) => s.renderSettings.backgroundColor,
    action: (v: string) => setBackgroundColor(v),
  },
  {
    id: 'toneMapping',
    category: 'Rendering',
    label: 'Tone Mapping',
    description: 'HDR tone mapping algorithm for the 3D renderer.',
    type: 'select',
    choices: [
      { value: 'aces', label: 'ACES Filmic' },
      { value: 'reinhard', label: 'Reinhard' },
      { value: 'linear', label: 'Linear' },
    ],
    selector: (s) => s.renderSettings.toneMapping,
    action: (v: ToneMapping) => setToneMapping(v),
  },
  {
    id: 'exposure',
    category: 'Rendering',
    label: 'Exposure',
    description: 'Exposure level for the 3D renderer (0.1 – 5.0).',
    type: 'number',
    min: 0.1,
    max: 5.0,
    step: 0.1,
    selector: (s) => s.renderSettings.exposure,
    action: (v: number) => setExposure(v),
  },

  // ── Simulation ──
  {
    id: 'particleDistance',
    category: 'Simulation',
    label: 'Particle Distance',
    description: 'Default mesh density for cloth simulation (mm). Lower values = finer mesh.',
    type: 'number',
    min: 1,
    max: 20,
    step: 0.5,
    selector: (s) => s.simulation.particleDistance,
    action: (v: number) => setParticleDistance(v),
  },
];

// ─── Extract unique categories in definition order ──────────────────────────

function getCategories(settings: SettingDef[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const s of settings) {
    if (!seen.has(s.category)) {
      seen.add(s.category);
      result.push(s.category);
    }
  }
  return result;
}

// ─── Setting Row Component ──────────────────────────────────────────────────

function SettingRow({ def }: { def: SettingDef }) {
  const dispatch = useDispatch();
  const value = useSelector(def.selector);

  const handleChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v: any) => {
      if (def.isToggleAction) {
        dispatch(def.action(undefined));
      } else {
        dispatch(def.action(v));
      }
    },
    [dispatch, def],
  );

  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-label">{def.label}</div>
        <div className="settings-row-desc">{def.description}</div>
      </div>
      <div className="settings-row-control">
        {def.type === 'toggle' && (
          <label className="sidebar-toggle">
            <input
              type="checkbox"
              checked={!!value}
              onChange={() => handleChange(!value)}
            />
            <span className="sidebar-toggle-slider" />
          </label>
        )}
        {def.type === 'select' && (
          <select
            className="sidebar-select"
            value={value as string}
            onChange={(e) => handleChange(e.target.value)}
          >
            {def.choices?.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        {def.type === 'number' && (
          <input
            type="number"
            className="sidebar-input sidebar-input-sm"
            value={value as number}
            min={def.min}
            max={def.max}
            step={def.step}
            onChange={(e) => handleChange(Number(e.target.value))}
          />
        )}
        {def.type === 'color' && (
          <input
            type="color"
            className="sidebar-color-input"
            value={value as string}
            onChange={(e) => handleChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function SettingsView() {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return SETTINGS;
    const q = search.toLowerCase();
    return SETTINGS.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }, [search]);

  const categories = useMemo(() => getCategories(filtered), [filtered]);

  return (
    <div className="sidebar-view">
      {/* Search bar */}
      <div className="settings-search-bar">
        <input
          type="text"
          className="settings-search-input"
          placeholder="Search settings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            className="settings-search-clear"
            onClick={() => setSearch('')}
            aria-label="Clear search"
          >
            x
          </button>
        )}
      </div>

      {/* Settings list */}
      <div className="sidebar-view-content">
        {categories.map((cat) => (
          <div key={cat} className="settings-category">
            <div className="settings-category-header">{cat}</div>
            {filtered
              .filter((s) => s.category === cat)
              .map((def) => (
                <SettingRow key={def.id} def={def} />
              ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="settings-empty">No settings match "{search}"</div>
        )}
      </div>
    </div>
  );
}
