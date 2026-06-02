import type { ReactNode } from 'react';
import './Dock.css';

interface DockShellProps {
  side: 'left' | 'right';
  domainLabel: string;
  children: ReactNode;
}

/**
 * The shared side-dock silhouette: a vertical floating column with a domain
 * label, framing the canvas. Both the 2D (single-select) and 3D (heterogeneous)
 * docks fill it with their own buttons. Presentational only.
 */
export default function DockShell({ side, domainLabel, children }: DockShellProps) {
  return (
    <div className={`dock dock--${side}`}>
      <div className="dock__label">{domainLabel}</div>
      {children}
    </div>
  );
}
