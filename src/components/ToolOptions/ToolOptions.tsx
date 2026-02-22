import { useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setToolOption } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import type { ToolOption } from '../../tools';
import './ToolOptions.css';

interface OptionControlProps {
  option: ToolOption;
  currentValue: any;
  onChange: (value: any) => void;
}

function OptionControl({ option, currentValue, onChange }: OptionControlProps) {
  const value = currentValue ?? option.value;

  switch (option.type) {
    case 'toggle':
      return (
        <label className="tool-option toggle-option">
          <span className="option-label">{option.label}</span>
          <input
            type="checkbox"
            checked={value}
            onChange={e => onChange(e.target.checked)}
          />
        </label>
      );

    case 'number':
      return (
        <label className="tool-option number-option">
          <span className="option-label">{option.label}</span>
          <input
            type="number"
            value={value}
            min={option.min}
            max={option.max}
            step={option.step || 1}
            onChange={e => onChange(parseFloat(e.target.value))}
          />
        </label>
      );

    case 'select':
      return (
        <label className="tool-option select-option">
          <span className="option-label">{option.label}</span>
          <select
            value={value}
            onChange={e => onChange(e.target.value)}
          >
            {option.choices?.map(choice => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      );

    case 'color':
      return (
        <label className="tool-option color-option">
          <span className="option-label">{option.label}</span>
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
          />
        </label>
      );

    default:
      return null;
  }
}

interface ToolOptionsProps {
  context: '2d' | '3d';
}

export default function ToolOptions({ context }: ToolOptionsProps) {
  const dispatch = useDispatch();
  const activeTool2D = useSelector((s: RootState) => s.tools.activeTool2D);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const toolOptions = useSelector((s: RootState) => s.tools.toolOptions);

  const activeToolId = context === '2d' ? activeTool2D : activeTool3D;
  const tool = useMemo(() => toolRegistry.getTool(activeToolId), [activeToolId]);

  if (!tool || !tool.options || tool.options.length === 0) {
    return null; // No options to show
  }

  const handleOptionChange = (optionId: string, value: any) => {
    dispatch(setToolOption({ 
      toolId: activeToolId, 
      optionId, 
      value 
    }));
  };

  return (
    <div className="tool-options">
      <span className="tool-name">{tool.name}</span>
      <div className="options-list">
        {tool.options.map(option => (
          <OptionControl
            key={option.id}
            option={option}
            currentValue={toolOptions[activeToolId]?.[option.id]}
            onChange={value => handleOptionChange(option.id, value)}
          />
        ))}
      </div>
    </div>
  );
}