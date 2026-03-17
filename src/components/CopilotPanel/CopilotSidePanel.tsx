import { MessageSquare, PanelLeftClose, PanelRightClose, ChevronLeft, ChevronRight, Settings, SlidersHorizontal } from 'lucide-react';
import { useRef, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setCopilotSize, toggleCopilot, cycleCopilotPosition, setSidebarTab } from '../../store/layoutSlice';
import CopilotPanel from './CopilotPanel';
import PropertiesPanel from '../PropertiesPanel/PropertiesPanel';
import './CopilotSidePanel.css';


interface CopilotSidePanelProps {
  position: 'left' | 'right';
}

export default function CopilotSidePanel({ position }: CopilotSidePanelProps) {
  const dispatch = useDispatch();
  const { copilotOpen, copilotSize } = useSelector((state: RootState) => state.layout);
  const activeTab = useSelector((state: RootState) => state.layout.sidebarTab);

  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = copilotSize;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [copilotSize]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const delta = position === 'left'
        ? e.clientX - startX.current  // Left panel: expand right
        : startX.current - e.clientX; // Right panel: expand left

      const newWidth = startWidth.current + delta;
      const minWidth = 280;
      const maxWidth = window.innerWidth * 0.6;

      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      dispatch(setCopilotSize(clampedWidth));
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    if (isDragging.current) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [position, dispatch]);

  const handleToggle = useCallback(() => {
    dispatch(toggleCopilot());
  }, [dispatch]);

  const handlePositionCycle = useCallback(() => {
    dispatch(cycleCopilotPosition());
  }, [dispatch]);

  const handleCollapsedTabClick = useCallback((tab: 'chat' | 'properties') => {
    dispatch(setSidebarTab(tab));
    dispatch(toggleCopilot());
  }, [dispatch]);

  if (!copilotOpen) {
    return (
      <div className={`copilot-side-panel collapsed ${position}`}>
        <div className="copilot-collapsed-tab" onClick={() => handleCollapsedTabClick('chat')}>
          <MessageSquare size={16} style={{ color: 'var(--accent)' }} />
          <span className="copilot-collapsed-label">Chat</span>
        </div>
        <div className="copilot-collapsed-tab" onClick={() => handleCollapsedTabClick('properties')}>
          <SlidersHorizontal size={16} style={{ color: 'var(--text-secondary)' }} />
          <span className="copilot-collapsed-label">Properties</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`copilot-side-panel ${position}`}
      style={{ width: copilotSize }}
    >
      {/* Drag handle */}
      <div
        className={`copilot-resize-handle ${position}`}
        onMouseDown={handleDragStart}
      />

      {/* Tab bar */}
      <div className="copilot-side-tabs">
        <button
          className={`copilot-side-tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => dispatch(setSidebarTab('chat'))}
        >
          <MessageSquare size={14} />
          <span>Chat</span>
        </button>
        <button
          className={`copilot-side-tab ${activeTab === 'properties' ? 'active' : ''}`}
          onClick={() => dispatch(setSidebarTab('properties'))}
        >
          <SlidersHorizontal size={14} />
          <span>Properties</span>
        </button>

        <div className="copilot-side-tabs-spacer" />

        <div className="copilot-side-actions">
          {activeTab === 'chat' && (
            <button
              className="copilot-side-btn"
              onClick={() => window.dispatchEvent(new CustomEvent('openclo:copilot-settings'))}
              title="Chat settings"
            >
              <Settings size={14} />
            </button>
          )}
          <button
            className="copilot-side-btn"
            onClick={handlePositionCycle}
            title="Change position"
          >
            {position === 'left' ? <PanelLeftClose size={14} /> : <PanelRightClose size={14} />}
          </button>
          <button
            className="copilot-side-btn"
            onClick={handleToggle}
            title="Collapse panel"
          >
            {position === 'left' ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* Panel content */}
      <div className="copilot-side-content">
        {activeTab === 'chat' && <CopilotPanel isColumn={true} />}
        {activeTab === 'properties' && (
          <div className="side-panel-properties">
            <PropertiesPanel />
          </div>
        )}
      </div>
    </div>
  );
}