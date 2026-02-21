import type { SidebarView } from '../ActivityBar/ActivityBar';
import {
  PatternExplorerView,
  MeasurementsView,
  GradingView,
  NestingView,
  FileExplorerView,
  SettingsView,
} from '../views';
import CopilotPanel from '../CopilotPanel/CopilotPanel';
import PluginManager from '../PluginManager/PluginManager';
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
  copilot: 'AI Copilot',
  settings: 'Settings',
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
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="sidebar-content">
            {activeView === 'explorer' && <PatternExplorerView />}
            {activeView === 'measurements' && <MeasurementsView />}
            {activeView === 'grading' && <GradingView />}
            {activeView === 'nesting' && <NestingView />}
            {activeView === 'files' && <FileExplorerView />}
            {activeView === 'plugins' && <PluginManager />}
            {activeView === 'copilot' && <CopilotPanel />}
            {activeView === 'settings' && <SettingsView />}
          </div>
        </>
      )}
    </div>
  );
}
