import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function ContextPanel({ title, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid immediate close from the click that opened the panel
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  return (
    <div className="context-panel" ref={panelRef}>
      <div className="context-panel__header">
        <span>{title}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel">
          <X size={14} />
        </button>
      </div>
      <div className="context-panel__body">
        {children}
      </div>
    </div>
  );
}
