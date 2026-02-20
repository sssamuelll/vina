import { useState, useCallback, useRef, useEffect } from 'react';
import CopilotPanel from '../CopilotPanel/CopilotPanel';
import './BottomPanel.css';

type BottomTab = 'copilot' | 'problems' | 'output' | 'nesting-preview';

interface BottomPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  defaultTab?: BottomTab;
}

const tabs: { id: BottomTab; label: string }[] = [
  { id: 'copilot', label: 'Copilot' },
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Output' },
  { id: 'nesting-preview', label: 'Nesting Preview' },
];

export default function BottomPanel({ isOpen, onToggle, defaultTab = 'copilot' }: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState<BottomTab>(defaultTab);
  const [height, setHeight] = useState(200);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleTabClick = useCallback((tabId: BottomTab) => {
    if (activeTab === tabId && isOpen) {
      onToggle(); // collapse
    } else {
      setActiveTab(tabId);
      if (!isOpen) onToggle(); // expand
    }
  }, [activeTab, isOpen, onToggle]);

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
    <div
      className={`bottom-panel ${isOpen ? 'open' : 'closed'}`}
      style={{ height: isOpen ? height : 0 }}
    >
      {/* Drag handle */}
      <div className="bottom-panel-resize" onMouseDown={handleDragStart} />

      {/* Tab bar */}
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
        <button className="bottom-panel-close" onClick={onToggle} title="Close Panel">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Tab content */}
      <div className="bottom-panel-content">
        {activeTab === 'copilot' && (
          <div className="bottom-panel-pane">
            <CopilotPanel isColumn={true} />
          </div>
        )}
        {activeTab === 'problems' && (
          <div className="bottom-panel-pane bottom-panel-placeholder">
            <span>No problems detected</span>
          </div>
        )}
        {activeTab === 'output' && (
          <div className="bottom-panel-pane bottom-panel-placeholder">
            <span>Output log</span>
          </div>
        )}
        {activeTab === 'nesting-preview' && (
          <div className="bottom-panel-pane bottom-panel-placeholder">
            <span>Nesting preview will appear here</span>
          </div>
        )}
      </div>
    </div>
  );
}
