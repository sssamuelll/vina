import { MessageSquare, Maximize2, Minimize2, Settings, Trash2, X } from 'lucide-react';

interface CopilotHeaderProps {
  hasConnection: boolean;
  providerLabel: string;
  offline: boolean;
  isColumn: boolean;
  isFullscreen: boolean;
  showSettings?: boolean;
  onToggleFullscreen: () => void;
  onToggleSettings: () => void;
  onClearConversation: () => void;
  onClose: () => void;
}

export default function CopilotHeader({
  hasConnection,
  providerLabel,
  offline,
  isColumn,
  isFullscreen,
  onToggleFullscreen,
  onToggleSettings,
  onClearConversation,
  onClose,
}: CopilotHeaderProps) {
  return (
    <div className="copilot-header">
      <div className="copilot-title">
        <MessageSquare size={16} style={{ color: 'var(--accent)' }} />
        <span>Chat</span>
        {hasConnection && <span className="copilot-agent-badge">{providerLabel}</span>}
        {offline && <span className="copilot-agent-badge" style={{ color: '#ff9800' }}>Offline</span>}
      </div>
      <div className="copilot-header-actions">
        {isColumn && (
          <button
            className="copilot-btn-sm"
            onClick={onToggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        )}
        <button className="copilot-btn-sm" onClick={onToggleSettings} title="Settings">
          <Settings size={12} />
        </button>
        <button className="copilot-btn-sm" onClick={onClearConversation} title="Clear chat">
          <Trash2 size={12} />
        </button>
        <button
          className="copilot-btn-sm"
          onClick={onClose}
          title="Close"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
