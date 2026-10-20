import { ChevronDown } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef } from 'react';

interface PropertySectionProps {
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}

export default function PropertySection({ id, title, collapsed, onToggle, children }: PropertySectionProps) {
  const cuerpoId = useId();
  const cuerpo = useRef<HTMLDivElement>(null);
  // El plegado es de CSS (la fila de la rejilla a 0fr): lo de dentro sigue
  // montado, y sin `inert` el Tab entraba en campos que no se ven. React 18
  // no conoce el atributo, así que va por el DOM.
  useEffect(() => {
    cuerpo.current?.toggleAttribute('inert', collapsed);
  }, [collapsed]);

  return (
    <section className="panel-section">
      <button
        type="button"
        className="panel-section-header"
        aria-expanded={!collapsed}
        aria-controls={cuerpoId}
        onClick={() => onToggle(id)}
      >
        <span className="panel-title">{title}</span>
        <ChevronDown size={12} aria-hidden="true" className={collapsed ? 'collapsed' : 'expanded'} />
      </button>
      <div ref={cuerpo} id={cuerpoId} className={`panel-section-body ${collapsed ? 'collapsed' : ''}`}>
        <div className="panel-section-content">
          {children}
        </div>
      </div>
    </section>
  );
}
