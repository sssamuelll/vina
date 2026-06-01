import { useSelector, useDispatch } from 'react-redux';
import {
  ScissorsLineDashed, Type, Ruler, Wheat, Link,
  Image, Droplets, Box, Layers,
} from 'lucide-react';
import { RootState } from '../../store';
import {
  toggleSeamAllowance, toggleGrainlines,
  togglePieceNames, toggleLineLengths, toggleSewingLines,
  toggleReferenceImages,
  setRenderMode2D, setUnits,
} from '../../store/editorSlice';
import type { UnitSystem } from '../../types/types';
import ToolTooltip from '../Toolbar3D/ToolTooltip';
import './DisplayBar2D.css';

type RenderMode = 'textured' | 'translucent' | 'wireframe';

// Ruler unit cycle: the patternmaker's natural unit (cm) first, then inches, then mm.
const UNIT_CYCLE: UnitSystem[] = ['cm', 'inches', 'mm'];
const UNIT_LABEL: Record<UnitSystem, string> = { cm: 'cm', inches: 'in', mm: 'mm' };

interface ToggleItem {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

interface ModeItem {
  icon: React.ReactNode;
  label: string;
  mode: RenderMode;
}

export default function DisplayBar2D() {
  const dispatch = useDispatch();
  const editor = useSelector((s: RootState) => s.editor);

  const toggles: ToggleItem[] = [
    { icon: <ScissorsLineDashed size={18} />, label: 'Seam Allowance', active: editor.showSeamAllowance, onClick: () => dispatch(toggleSeamAllowance()) },
    { icon: <Type size={18} />, label: 'Piece Names', active: editor.showPieceNames, onClick: () => dispatch(togglePieceNames()) },
    { icon: <Ruler size={18} />, label: 'Line Lengths', active: editor.showLineLengths, onClick: () => dispatch(toggleLineLengths()) },
    { icon: <Wheat size={18} />, label: 'Grainlines', active: editor.showGrainlines, onClick: () => dispatch(toggleGrainlines()) },
    { icon: <Link size={18} />, label: 'Sewing Lines', active: editor.showSewingLines, onClick: () => dispatch(toggleSewingLines()) },
    { icon: <Layers size={18} />, label: 'Reference Images', active: editor.showReferenceImages, onClick: () => dispatch(toggleReferenceImages()) },
  ];

  const modes: ModeItem[] = [
    { icon: <Image size={18} />, label: 'Textured', mode: 'textured' },
    { icon: <Droplets size={18} />, label: 'Translucent', mode: 'translucent' },
    { icon: <Box size={18} />, label: 'Wireframe', mode: 'wireframe' },
  ];

  const cycleUnits = () => {
    const idx = UNIT_CYCLE.indexOf(editor.units);
    dispatch(setUnits(UNIT_CYCLE[(idx + 1) % UNIT_CYCLE.length]));
  };

  return (
    <div className="display-bar-2d">
      {toggles.map(t => (
        <ToolTooltip key={t.label} name={t.label} position="left">
          <button
            className={`db-btn ${t.active ? 'active' : ''}`}
            onClick={t.onClick}
          >
            {t.icon}
          </button>
        </ToolTooltip>
      ))}

      <ToolTooltip name="Ruler Units" position="left">
        <button
          className="db-btn"
          onClick={cycleUnits}
          style={{ fontFamily: 'var(--font-mono-2d)', fontSize: 11, fontWeight: 600 }}
        >
          {UNIT_LABEL[editor.units]}
        </button>
      </ToolTooltip>

      <div className="db-separator" />

      {modes.map(m => (
        <ToolTooltip key={m.mode} name={m.label} position="left">
          <button
            className={`db-btn ${editor.renderMode2D === m.mode ? 'mode-active' : ''}`}
            onClick={() => dispatch(setRenderMode2D(m.mode))}
          >
            {m.icon}
          </button>
        </ToolTooltip>
      ))}
    </div>
  );
}
