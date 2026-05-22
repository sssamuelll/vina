import { FileText, Layers, Palette, Play, Plug, Settings, SlidersHorizontal, History, User, MessageSquare, SquareStack } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { toggleCopilot } from '../../store/layoutSlice';
import ToolTooltip from '../Toolbar3D/ToolTooltip';
import './ActivityBar.css';

export type SidebarView =
  | 'explorer'
  | 'avatar'
  | 'grading'
  | 'layers'
  | 'simulation'
  | 'parametric'
  | 'history'
  | 'plugins'
  | 'colorways'
  | 'settings';

interface ActivityBarProps {
  activeView: SidebarView | null;
  onViewChange: (view: SidebarView | null) => void;
}

interface ActivityItem {
  id: SidebarView;
  label: string;
  icon: JSX.Element;
  position: 'top' | 'bottom';
}

const items: ActivityItem[] = [
  { id: 'explorer', label: 'Project', position: 'top', icon: <FileText size={20} /> },
  { id: 'avatar', label: 'Avatar & Body', position: 'top', icon: <User size={20} /> },
  { id: 'simulation', label: 'Simulation', position: 'top', icon: <Play size={20} /> },
  { id: 'parametric', label: 'Parametric', position: 'top', icon: <SlidersHorizontal size={20} /> },
  { id: 'grading', label: 'Grading', position: 'top', icon: <Layers size={20} /> },
  { id: 'layers', label: 'Layers', position: 'top', icon: <SquareStack size={20} /> },
  { id: 'colorways', label: 'Colorways', position: 'top', icon: <Palette size={20} /> },
  { id: 'history', label: 'History', position: 'top', icon: <History size={20} /> },
  { id: 'plugins', label: 'Plugins', position: 'bottom', icon: <Plug size={20} /> },
  { id: 'settings', label: 'Settings', position: 'bottom', icon: <Settings size={20} /> },
];

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  const dispatch = useDispatch();
  const copilotOpen = useSelector((s: RootState) => s.layout.copilotOpen);

  const topItems = items.filter(i => i.position === 'top');
  const bottomItems = items.filter(i => i.position === 'bottom');

  const handleClick = (id: SidebarView) => {
    if (activeView === id) {
      onViewChange(null); // collapse sidebar
    } else {
      onViewChange(id);
    }
  };

  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
        {topItems.map(item => (
          <ToolTooltip key={item.id} name={item.label} position="right">
            <button
              className={`activity-bar-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => handleClick(item.id)}
              aria-label={item.label}
            >
              <span className="activity-bar-icon">{item.icon}</span>
            </button>
          </ToolTooltip>
        ))}
      </div>
      <div className="activity-bar-bottom">
        {bottomItems.map(item => (
          <ToolTooltip key={item.id} name={item.label} position="right">
            <button
              className={`activity-bar-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => handleClick(item.id)}
              aria-label={item.label}
            >
              <span className="activity-bar-icon">{item.icon}</span>
            </button>
          </ToolTooltip>
        ))}
        <ToolTooltip name="Copilot" position="right">
          <button
            className={`activity-bar-item ${copilotOpen ? 'active' : ''}`}
            onClick={() => dispatch(toggleCopilot())}
            aria-label="Copilot"
          >
            <span className="activity-bar-icon"><MessageSquare size={20} /></span>
          </button>
        </ToolTooltip>
      </div>
    </div>
  );
}
