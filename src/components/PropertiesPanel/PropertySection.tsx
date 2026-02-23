import { ChevronDown } from 'lucide-react';
import { ReactNode } from 'react';

interface PropertySectionProps {
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}

export default function PropertySection({ id, title, collapsed, onToggle, children }: PropertySectionProps) {
  return (
    <section className="panel-section">
      <button
        className="panel-section-header"
        onClick={() => onToggle(id)}
      >
        <span className="panel-title">{title}</span>
        <ChevronDown size={12} className={collapsed ? "collapsed" : "expanded"} />
      </button>
      <div className={`panel-section-body ${collapsed ? 'collapsed' : ''}`}>
        <div className="panel-section-content">
          {children}
        </div>
      </div>
    </section>
  );
}
