import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function ContextPanel({ title, onClose, children }: Props) {
  // Close on Escape. `onClose` por ref, no en las dependencias: un Escape real
  // dispara antes el atajo global en `document`, que re-renderiza al padre en
  // medio del dispatch; con `onClose` inline el listener se quitaba y volvía a
  // registrar sin llegar a correr (medido en el menú contextual 2D, 2026-08-29).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="context-panel" data-superficie="panel">
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
