/**
 * @module BottomPanel
 *
 * Cross-feature integration: shell layout that hosts CopilotTab and
 * invokes copilot proactive analysis on tab activation. Import from
 * `src/copilot/reasoning/proactiveAnalysis` is an explicit entry point
 * per the **feature ownership** layer policy
 * (`docs/reports/2026-04-30-drift-fase2-d5-layering-violations.md`).
 */
import { X } from 'lucide-react';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import type { BottomTab } from '../../store/layoutSlice';
import CopilotPanel from '../CopilotPanel/CopilotPanel';
import { runProactiveAnalysis, type ProactiveWarning } from '../../copilot/reasoning/proactiveAnalysis';
import Timeline from '../Timeline/Timeline';
import InspectorTab from './InspectorTab';
import POMPanel from './POMPanel';
import BOMTab from './BOMTab';
import NestingTab from './NestingTab';
import GradingTab from './GradingTab';
import './BottomPanel.css';

interface BottomPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  activeTab?: BottomTab;
  onTabChange?: (tab: BottomTab) => void;
  defaultTab?: BottomTab;
}

function buildTabs(problemCount: number, unresolvedCount: number): { id: BottomTab; label: string }[] {
  return [
    { id: 'copilot', label: 'Copilot' },
    { id: 'problems', label: problemCount > 0 ? `Problems (${problemCount})` : 'Problems' },
    { id: 'output', label: 'Output' },
    { id: 'nesting-preview', label: 'Nesting Preview' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'inspector', label: unresolvedCount > 0 ? `Inspector (${unresolvedCount})` : 'Inspector' },
    { id: 'poms', label: 'POMs' },
    { id: 'bom', label: 'BOM' },
    { id: 'grading', label: 'Grading' },
  ];
}

const SEVERITY_ICON: Record<string, string> = {
  error: '🔴',
  warning: '🟡',
  info: '🔵',
};

function ProblemsView({ warnings }: { warnings: ProactiveWarning[] }) {
  if (warnings.length === 0) {
    return (
      <div className="bottom-panel-pane bottom-panel-placeholder">
        <span>No problems detected</span>
      </div>
    );
  }

  return (
    <div className="bottom-panel-pane problems-list">
      {warnings.map((w, i) => (
        <div key={i} className={`problem-row problem-${w.severity}`}>
          <span className="problem-icon">{SEVERITY_ICON[w.severity] ?? '🔵'}</span>
          <span className="problem-message">{w.message}</span>
          <span className="problem-category">{w.category}</span>
        </div>
      ))}
    </div>
  );
}

export default function BottomPanel({ isOpen, onToggle, activeTab: propActiveTab, onTabChange, defaultTab = 'copilot' }: BottomPanelProps) {
  const { copilotPosition } = useSelector((state: RootState) => state.layout);
  const pieces = useSelector((state: RootState) => state.project.pieces);
  const seams = useSelector((state: RootState) => state.project.seams);
  const unresolvedCount = useSelector((state: RootState) => state.inspector.unresolvedCount);

  // Reactive proactive analysis — runs when pieces/seams change
  const warnings = useMemo(() => runProactiveAnalysis(pieces, seams), [pieces, seams]);

  // Filter tabs based on copilot position
  const allTabs = buildTabs(warnings.length, unresolvedCount);
  const tabs = allTabs.filter(tab =>
    tab.id !== 'copilot' || copilotPosition === 'bottom'
  );
  // Determine the initial active tab based on what's available
  const getInitialTab = () => {
    if (copilotPosition === 'bottom' && defaultTab === 'copilot') {
      return 'copilot';
    }
    return tabs.length > 0 ? tabs[0].id : 'problems';
  };

  const [localActiveTab, setLocalActiveTab] = useState<BottomTab>(getInitialTab());
  // Use prop-driven tab if provided, otherwise fall back to local state
  const activeTab = propActiveTab ?? localActiveTab;
  const [height, setHeight] = useState(280);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // Update active tab if copilot moves away from bottom
  useEffect(() => {
    if (activeTab === 'copilot' && copilotPosition !== 'bottom') {
      const firstAvailableTab = tabs.find(t => t.id !== 'copilot');
      if (firstAvailableTab) {
        if (onTabChange) {
          onTabChange(firstAvailableTab.id);
        } else {
          setLocalActiveTab(firstAvailableTab.id);
        }
      }
    }
  }, [copilotPosition, activeTab, tabs, onTabChange]);

  const handleTabClick = useCallback((tabId: BottomTab) => {
    if (activeTab === tabId && isOpen) {
      onToggle(); // collapse
    } else {
      if (onTabChange) {
        // setBottomPanelTab already auto-opens the panel — don't also call onToggle
        onTabChange(tabId);
      } else {
        setLocalActiveTab(tabId);
        if (!isOpen) onToggle(); // expand (only needed for local state path)
      }
    }
  }, [activeTab, isOpen, onToggle, onTabChange]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = height;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [height]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY.current - e.clientY;
      const maxH = window.innerHeight * 0.5;
      const newHeight = Math.max(100, Math.min(maxH, startHeight.current + delta));
      setHeight(newHeight);
    };

    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className={`bottom-panel ${isOpen ? 'open' : 'closed'}`}>
      {/* Tab bar — always visible (VS Code pattern) */}
      <div className="bottom-panel-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`bottom-panel-tab ${activeTab === tab.id && isOpen ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <div className="bottom-panel-tabs-spacer" />
        {isOpen && (
          <button className="bottom-panel-close" onClick={onToggle} title="Close Panel">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Collapsible content area */}
      <div className="bottom-panel-body" style={{ height: isOpen ? height : 0 }}>
        {/* Drag handle */}
        <div className="bottom-panel-resize" onMouseDown={handleDragStart} />

        {/* Tab content */}
        <div className="bottom-panel-content">
          {activeTab === 'copilot' && copilotPosition === 'bottom' && (
            <div className="bottom-panel-pane">
              <CopilotPanel isColumn={true} />
            </div>
          )}
          {activeTab === 'problems' && (
            <ProblemsView warnings={warnings} />
          )}
          {activeTab === 'output' && (
            <div className="bottom-panel-pane bottom-panel-placeholder">
              <span>Output log</span>
            </div>
          )}
          {activeTab === 'nesting-preview' && <NestingTab />}
          {activeTab === 'timeline' && <Timeline />}
          {activeTab === 'inspector' && <InspectorTab />}
          {activeTab === 'poms' && <POMPanel />}
          {activeTab === 'bom' && <BOMTab />}
          {activeTab === 'grading' && <GradingTab />}
        </div>
      </div>
    </div>
  );
}
