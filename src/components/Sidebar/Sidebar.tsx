import { X } from 'lucide-react';
import type { SidebarView } from '../ActivityBar/ActivityBar';
import {
  GradingView,
  SettingsView,
} from '../views';
import ProjectView from '../views/ProjectView';
import AvatarBodyView from '../views/AvatarBodyView';
import PluginManager from '../PluginManager/PluginManager';
import SimulationView from './SimulationView';
import ParametricView from './ParametricView';
import HistoryView from '../views/HistoryView';
import '../views/views.css';
import './Sidebar.css';

interface SidebarProps {
  activeView: SidebarView | null;
  onClose: () => void;
}

const viewTitles: Record<SidebarView, string> = {
  explorer: 'Project',
  avatar: 'Avatar & Body',
  grading: 'Grading',
  plugins: 'Plugins',
  settings: 'Settings',
  simulation: 'Simulation',
  parametric: 'Parametric',
  history: 'History',
};

export default function Sidebar({ activeView, onClose }: SidebarProps) {
  const isOpen = activeView !== null;

  return (
    <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      {activeView && (
        <>
          <div className="sidebar-header">
            <span className="sidebar-title">{viewTitles[activeView]}</span>
            <button className="sidebar-close" onClick={onClose} title="Close Sidebar">
              <X size={14} />
            </button>
          </div>
          <div className="sidebar-content">
            {activeView === 'explorer' && <ProjectView />}
            {activeView === 'avatar' && <AvatarBodyView />}
            {activeView === 'grading' && <GradingView />}
            {activeView === 'plugins' && <PluginManager />}
            {activeView === 'settings' && <SettingsView />}
            {activeView === 'simulation' && <SimulationView />}
            {activeView === 'parametric' && <ParametricView />}
            {activeView === 'history' && <HistoryView />}
          </div>
        </>
      )}
    </div>
  );
}
