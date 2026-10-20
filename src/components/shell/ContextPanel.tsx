import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Un panel del marco, con su título y su ✕. Esc lo cierra desde
 * `usePanelHost`: un peldaño de la escalera de lo que se llama (spec
 * 2026-10-02 § 6.2), que cierra los paneles antes que la selección.
 */
export default function ContextPanel({ title, onClose, children }: Props) {
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
