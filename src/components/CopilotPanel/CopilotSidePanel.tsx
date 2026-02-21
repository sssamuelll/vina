import { useRef, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setCopilotSize, toggleCopilot, cycleCopilotPosition } from '../../store/layoutSlice';
import CopilotPanel from './CopilotPanel';
import './CopilotSidePanel.css';

interface CopilotSidePanelProps {
  position: 'left' | 'right';
}

export default function CopilotSidePanel({ position }: CopilotSidePanelProps) {
  const dispatch = useDispatch();
  const { copilotOpen, copilotSize } = useSelector((state: RootState) => state.layout);
  
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

  if (!copilotOpen) {
    return (
      <div className={`copilot-side-panel collapsed ${position}`}>
        <div className="copilot-collapsed-tab" onClick={handleToggle}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3H13C13.55 3 14 3.45 14 4V10C14 10.55 13.55 11 13 11H5L2 14V4C2 3.45 2.45 3 3 3Z" fill="var(--accent)" stroke="var(--accent)" strokeWidth="1"/>
          </svg>
          <span className="copilot-collapsed-label">Chat</span>
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
      
      {/* Header */}
      <div className="copilot-side-header">
        <div className="copilot-side-title">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3H13C13.55 3 14 3.45 14 4V10C14 10.55 13.55 11 13 11H5L2 14V4C2 3.45 2.45 3 3 3Z" fill="var(--accent)" stroke="var(--accent)" strokeWidth="1"/>
          </svg>
          <span>Copilot</span>
        </div>
        
        <div className="copilot-side-actions">
          {/* Position toggle */}
          <button
            className="copilot-side-btn"
            onClick={handlePositionCycle}
            title="Change position"
          >
            {position === 'left' ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="3" width="5" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1"/>
                <path d="M8 7H12" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                <path d="M10 5L12 7L10 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="8" y="3" width="5" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1"/>
                <path d="M6 7H2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                <path d="M4 5L2 7L4 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          
          {/* Collapse button */}
          <button
            className="copilot-side-btn"
            onClick={handleToggle}
            title="Collapse panel"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d={position === 'left' ? "M9 4L5 7L9 10" : "M5 4L9 7L5 10"} 
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      
      {/* Panel content */}
      <div className="copilot-side-content">
        <CopilotPanel isColumn={true} />
      </div>
    </div>
  );
}