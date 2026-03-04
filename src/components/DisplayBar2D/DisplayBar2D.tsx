import { useSelector, useDispatch } from 'react-redux';
import {
  ScissorsLineDashed, Type, Ruler, Wheat, Link,
  Image, Droplets, Box,
} from 'lucide-react';
import { RootState } from '../../store';
import {
  toggleSeamAllowance, toggleGrainlines,
  togglePieceNames, toggleLineLengths, toggleSewingLines,
  setRenderMode2D,
} from '../../store/editorSlice';
import './DisplayBar2D.css';

type RenderMode = 'textured' | 'translucent' | 'wireframe';

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
  ];

  const modes: ModeItem[] = [
    { icon: <Image size={18} />, label: 'Textured', mode: 'textured' },
    { icon: <Droplets size={18} />, label: 'Translucent', mode: 'translucent' },
    { icon: <Box size={18} />, label: 'Wireframe', mode: 'wireframe' },
  ];

  return (
    <div className="display-bar-2d">
      {toggles.map(t => (
        <button
          key={t.label}
          className={`db-btn ${t.active ? 'active' : ''}`}
          onClick={t.onClick}
        >
          {t.icon}
          <span className="db-tooltip">{t.label}</span>
        </button>
      ))}

      <div className="db-separator" />

      {modes.map(m => (
        <button
          key={m.mode}
          className={`db-btn ${editor.renderMode2D === m.mode ? 'mode-active' : ''}`}
          onClick={() => dispatch(setRenderMode2D(m.mode))}
        >
          {m.icon}
          <span className="db-tooltip">{m.label}</span>
        </button>
      ))}
    </div>
  );
}
