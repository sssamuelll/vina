import { MessageSquare, Settings } from 'lucide-react';
import { getOfflineActions } from '../../copilot/errorRecovery';

interface CopilotEmptyStateProps {
  hasConnection: boolean;
  providerLabel: string;
  onOpenSettings: () => void;
  onSendText: (text: string) => void;
}

export default function CopilotEmptyState({
  hasConnection,
  providerLabel,
  onOpenSettings,
  onSendText,
}: CopilotEmptyStateProps) {
  if (!hasConnection) {
    const offlineActions = getOfflineActions();
    return (
      <div className="copilot-empty">
        <MessageSquare className="copilot-empty-icon" size={40} style={{ color: 'var(--text-muted)' }} />
        <p className="copilot-empty-title">AI Pattern Assistant</p>
        <p className="copilot-empty-hint">
          Configure an AI provider to get started — or use quick actions below without AI.
        </p>
        <button className="copilot-setup-btn" onClick={onOpenSettings}>
          <Settings size={14} />
          Configure Provider
        </button>
        <div className="copilot-suggestions" style={{ marginTop: 12 }}>
          {offlineActions.slice(0, 6).map(a => (
            <button key={a.toolName + a.label} className="copilot-suggestion" onClick={() => onSendText(a.label.split(' / ')[0])}>
              {a.icon} {a.label.split(' / ')[0]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="copilot-empty">
      <p>Connected to <strong>{providerLabel}</strong></p>
      <p className="copilot-empty-hint">Ask anything about your patterns:</p>
      <div className="copilot-suggestions">
        {['Hazme un corpiño talla 40', 'Generate a bodice block', 'Create a sleeve', 'Revisa los márgenes de costura'].map(s => (
          <button key={s} className="copilot-suggestion" onClick={() => onSendText(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
