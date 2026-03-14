/**
 * ToolOptionsBar2D — horizontal options bar for the active 2D tool.
 * Renders configurable options (sliders, toggles, dropdowns) from ToolDefinition.
 */
import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setToolOption } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import type { ToolOption } from '../../tools/types';
import '../../styles/toolOptionsBar.css';

export default function ToolOptionsBar2D() {
  const dispatch = useDispatch();
  const activeTool2D = useSelector((s: RootState) => s.tools.activeTool2D);
  const toolOptions = useSelector((s: RootState) => s.tools.toolOptions[activeTool2D] ?? {});

  const toolDef = toolRegistry.getTool(activeTool2D);
  const options = toolDef?.options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = useCallback((optionId: string, value: any) => {
    dispatch(setToolOption({ toolId: activeTool2D, optionId, value }));
  }, [dispatch, activeTool2D]);

  if (!options || options.length === 0) return null;

  return (
    <div className="tool-options-bar">
      <span className="tool-options-label">{toolDef?.name}</span>
      <div className="tool-options-divider" />
      {options.map(opt => (
        <OptionControl
          key={opt.id}
          option={opt}
          value={toolOptions[opt.id] ?? opt.value}
          onChange={(v) => handleChange(opt.id, v)}
        />
      ))}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function OptionControl({ option, value, onChange }: {
  option: ToolOption;
  value: any;
  onChange: (v: any) => void;
}) {
  switch (option.type) {
    case 'number':
      return (
        <div className="tool-option-item">
          <label className="tool-option-label">{option.label}</label>
          <input
            type="range"
            className="tool-option-slider"
            min={option.min ?? 0}
            max={option.max ?? 100}
            step={option.step ?? 1}
            value={value}
            onChange={e => onChange(Number(e.target.value))}
          />
          <span className="tool-option-value">{value}</span>
        </div>
      );
    case 'toggle':
      return (
        <div className="tool-option-item">
          <label className="tool-option-label">{option.label}</label>
          <button
            className={`tool-option-toggle ${value ? 'on' : ''}`}
            onClick={() => onChange(!value)}
          >
            {value ? 'ON' : 'OFF'}
          </button>
        </div>
      );
    case 'select':
      return (
        <div className="tool-option-item">
          <label className="tool-option-label">{option.label}</label>
          <select
            className="tool-option-select"
            value={value}
            onChange={e => onChange(e.target.value)}
          >
            {option.choices?.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      );
    case 'color':
      return (
        <div className="tool-option-item">
          <label className="tool-option-label">{option.label}</label>
          <input
            type="color"
            className="tool-option-color"
            value={value}
            onChange={e => onChange(e.target.value)}
          />
        </div>
      );
    default:
      return null;
  }
}
