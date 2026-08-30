import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { Point2D } from '../../../types/types';
import type { Cota } from './cotas';
import CotaChip, { type CotaChipProps } from './CotaChip';
import { chipScreenPosition } from './cotasGeometry';

export interface CotasLayerHandle {
  /** Enfoca el primer chip vivo; `false` si no hay ninguno (Tab sigue siendo el de siempre). */
  focusFirst(): boolean;
}

export interface CotasLayerProps {
  cotas: Cota[];
  pan2D: Point2D;
  zoom2D: number;
  disabled?: boolean;
  onCommit: CotaChipProps['onCommit'];
  onScrubStart: CotaChipProps['onScrubStart'];
  onScrub: CotaChipProps['onScrub'];
  onScrubEnd: CotaChipProps['onScrubEnd'];
  onScrubCancel: CotaChipProps['onScrubCancel'];
}

/**
 * Capa HTML de chips, hermana del <svg> dentro de `.pattern-editor` (spec
 * 2026-08-30 § 5.1). La capa NO recibe punteros — la rueda y el clic siguen
 * llegando al lienzo —; solo los chips. Sin z-index: el orden del DOM la pone
 * encima del svg. Las dos capas (esta y `CotaLines`) leen el mismo pan/zoom
 * de Redux en el mismo render: no hay nada que sincronizar.
 */
export const CotasLayer = forwardRef<CotasLayerHandle, CotasLayerProps>(function CotasLayer(
  { cotas, pan2D, zoom2D, disabled, onCommit, onScrubStart, onScrub, onScrubEnd, onScrubCancel },
  ref,
) {
  const root = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    focusFirst() {
      const primero = root.current?.querySelector<HTMLElement>('button.cota:not([aria-disabled="true"])');
      if (!primero) return false;
      primero.focus();
      return true;
    },
  }), []);
  return (
    <div ref={root} className="cotas" style={{ pointerEvents: 'none' }} data-testid="cotas">
      {cotas.map((cota) => {
        const { left, top } = chipScreenPosition(cota, pan2D, zoom2D);
        return (
          <CotaChip
            key={cota.id}
            cota={cota}
            left={left}
            top={top}
            zoom2D={zoom2D}
            disabled={disabled}
            onCommit={onCommit}
            onScrubStart={onScrubStart}
            onScrub={onScrub}
            onScrubEnd={onScrubEnd}
            onScrubCancel={onScrubCancel}
          />
        );
      })}
    </div>
  );
});
