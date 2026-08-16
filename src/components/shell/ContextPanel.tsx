import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function ContextPanel({ title, onClose, children }: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="context-panel">
      <div className="context-panel__header">
        <span>{title}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar panel">
          <X size={14} />
        </button>
      </div>
      <div className="context-panel__body">
        {children}
      </div>
    </div>
  );
}
