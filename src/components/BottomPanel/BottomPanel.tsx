import { useState, useCallback, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import CopilotPanel from '../CopilotPanel/CopilotPanel';
import './BottomPanel.css';

type BottomTab = 'copilot' | 'problems' | 'output' | 'nesting-preview';

interface BottomPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  defaultTab?: BottomTab;
}

const allTabs: { id: BottomTab; label: string }[] = [
  { id: 'copilot', label: 'Copilot' },
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Output' },
  { id: 'nesting-preview', label: 'Nesting Preview' },
];

export default function BottomPanel({ isOpen, onToggle, defaultTab = 'copilot' }: BottomPanelProps) {
  const { copilotPosition } = useSelector((state: RootState) => state.layout);
  
  // Filter tabs based on copilot position
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
  
  const [activeTab, setActiveTab] = useState<BottomTab>(getInitialTab());
  const [height, setHeight] = useState(280);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // Update active tab if copilot moves away from bottom
  useEffect(() => {
    if (activeTab === 'copilot' && copilotPosition !== 'bottom') {
      const firstAvailableTab = tabs.find(t => t.id !== 'copilot');
      if (firstAvailableTab) {
        setActiveTab(firstAvailableTab.id);
      }
    }
  }, [copilotPosition, activeTab, tabs]);

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
        {activeTab === 'copilot' && copilotPosition === 'bottom' && (
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
