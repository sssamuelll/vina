import { FileText, Layers, Play, Plug, Settings, SlidersHorizontal, History, User, MessageSquare } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { toggleCopilot } from '../../store/layoutSlice';
import './ActivityBar.css';

export type SidebarView =
  | 'explorer'
  | 'avatar'
  | 'grading'
  | 'simulation'
  | 'parametric'
  | 'history'
  | 'plugins'
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
          <button
            key={item.id}
            className={`activity-bar-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => handleClick(item.id)}
            title={item.label}
          >
            <span className="activity-bar-icon">{item.icon}</span>
          </button>
        ))}
      </div>
      <div className="activity-bar-bottom">
        {bottomItems.map(item => (
          <button
            key={item.id}
            className={`activity-bar-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => handleClick(item.id)}
            title={item.label}
          >
            <span className="activity-bar-icon">{item.icon}</span>
          </button>
        ))}
        <button
          className={`activity-bar-item ${copilotOpen ? 'active' : ''}`}
          onClick={() => dispatch(toggleCopilot())}
          title="Copilot"
        >
          <span className="activity-bar-icon"><MessageSquare size={20} /></span>
        </button>
      </div>
    </div>
  );
}
