import { FileText, Ruler, Layers, LayoutGrid, Play, Folder, Plug, Settings, SlidersHorizontal, History, Sparkles } from 'lucide-react';
import './ActivityBar.css';

export type SidebarView =
  | 'explorer'
  | 'measurements'
  | 'grading'
  | 'nesting'
  | 'files'
  | 'plugins'
  | 'skills'
  | 'settings'
  | 'simulation'
  | 'parametric'
  | 'history';

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
  {
    id: 'explorer',
    label: 'Pattern Explorer',
    position: 'top',
    icon: <FileText size={20} />,
  },
  {
    id: 'measurements',
    label: 'Measurements',
    position: 'top',
    icon: <Ruler size={20} />,
  },
  {
    id: 'grading',
    label: 'Grading',
    position: 'top',
    icon: <Layers size={20} />,
  },
  {
    id: 'nesting',
    label: 'Nesting',
    position: 'top',
    icon: <LayoutGrid size={20} />,
  },
  {
    id: 'simulation',
    label: 'Simulation',
    position: 'top',
    icon: <Play size={20} />,
  },
  {
    id: 'parametric',
    label: 'Parametric',
    position: 'top',
    icon: <SlidersHorizontal size={20} />,
  },
  {
    id: 'history',
    label: 'History',
    position: 'top',
    icon: <History size={20} />,
  },
  {
    id: 'files',
    label: 'Files',
    position: 'top',
    icon: <Folder size={20} />,
  },
  {
    id: 'skills',
    label: 'Skills Marketplace',
    position: 'bottom',
    icon: <Sparkles size={20} />,
  },
  {
    id: 'plugins',
    label: 'Plugins',
    position: 'bottom',
    icon: <Plug size={20} />,
  },
  {
    id: 'settings',
    label: 'Settings',
    position: 'bottom',
    icon: <Settings size={20} />,
  },
];

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
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
      </div>
    </div>
  );
}
