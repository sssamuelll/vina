import { X } from 'lucide-react';
import type { SidebarView } from '../ActivityBar/ActivityBar';
import {
  PatternExplorerView,
  MeasurementsView,
  GradingView,
  NestingView,
  FileExplorerView,
  SettingsView,
} from '../views';
import PluginManager from '../PluginManager/PluginManager';
import SkillMarketplace from '../SkillMarketplace/SkillMarketplace';
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
  explorer: 'Pattern Explorer',
  measurements: 'Measurements',
  grading: 'Grading',
  nesting: 'Nesting',
  files: 'File Browser',
  plugins: 'Plugins',
  skills: 'Skills',
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
            {activeView === 'explorer' && <PatternExplorerView />}
            {activeView === 'measurements' && <MeasurementsView />}
            {activeView === 'grading' && <GradingView />}
            {activeView === 'nesting' && <NestingView />}
            {activeView === 'files' && <FileExplorerView />}
            {activeView === 'plugins' && <PluginManager />}
            {activeView === 'skills' && <SkillMarketplace />}
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
