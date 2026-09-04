import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import type { Point2D } from '../../../types/types';
import type { Cota } from './cotas';
import CotaChip, { type CotaChipProps } from './CotaChip';
import { chipScreenPosition, separarChips, type ChipPuesto, type Estorbo } from './cotasGeometry';
import { formatMedida } from './parseMedida';

export interface CotasLayerHandle {
  /** Enfoca el primer chip vivo; `false` si no hay ninguno (Tab sigue siendo el de siempre). */
  focusFirst(): boolean;
  /** Enfoca y abre el primer chip vivo; el clic del borde usa esta puerta. */
  abrirPrimero(): boolean;
}

export interface CotasLayerProps {
  cotas: Cota[];
  lectura?: Cota | null;
  /** La lectura viene de una pieza bloqueada: apagada, con independencia de `disabled` (el ancla). */
  lecturaApagada?: boolean;
  pan2D: Point2D;
  zoom2D: number;
  /** Cajas de pantalla que los chips deben esquivar: los tiradores del
   *  transform box. Sin esto el chip del alto se come el asa este y el del
   *  ancho la de giro — medido el 2026-09-04. */
  estorbos?: readonly Estorbo[];
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
  { cotas, lectura, lecturaApagada, pan2D, zoom2D, estorbos, disabled, onCommit, onScrubStart, onScrub, onScrubEnd, onScrubCancel },
  ref,
) {
  const root = useRef<HTMLDivElement>(null);
  const primerChip = () => root.current?.querySelector<HTMLButtonElement>('button.cota:not([aria-disabled="true"])') ?? null;
  useImperativeHandle(ref, () => ({
    focusFirst() {
      const primero = primerChip();
      if (!primero) return false;
      primero.focus();
      return true;
    },
    abrirPrimero() {
      const primero = primerChip();
      if (!primero) return false;
      primero.focus();
      primero.click();
      return true;
    },
  }), []);
  // Los chips y la lectura se colocan en UNA sola pasada: si se separan por
  // separado se vuelven a pisar entre ellos. La lectura cede el sitio para que
  // pasar el ratón por un borde no haga saltar a los chips anclados.
  const puestos = useMemo(() => {
    const items: ChipPuesto[] = cotas.map((cota) => ({
      cota,
      ...chipScreenPosition(cota, pan2D, zoom2D),
      texto: formatMedida(cota.valueMm, cota.unit),
    }));
    if (lectura) {
      items.push({
        cota: lectura,
        ...chipScreenPosition(lectura, pan2D, zoom2D),
        texto: formatMedida(lectura.valueMm, lectura.unit),
        cede: true,
      });
    }
    const separados = separarChips(items, estorbos);
    return { chips: separados, lectura: lectura ? separados[cotas.length] : null };
  }, [cotas, lectura, pan2D, zoom2D, estorbos]);
  const lecturaPosition = puestos.lectura;
  return (
    <div ref={root} className="cotas" style={{ pointerEvents: 'none' }} data-testid="cotas">
      {lectura && lecturaPosition && (
        <div
          className={`cota cota--lectura${lectura.primary ? '' : ' cota--hueca'}`}
          aria-hidden="true"
          aria-disabled={lecturaApagada || undefined}
          data-rotulo={lectura.rotulo}
          data-lado={lectura.outward.y > 0 ? 'abajo' : undefined}
          style={{ left: lecturaPosition.left, top: lecturaPosition.top, pointerEvents: 'none' }}
        >
          {formatMedida(lectura.valueMm, lectura.unit)}
        </div>
      )}
      {cotas.map((cota, i) => {
        const { left, top } = puestos.chips[i];
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
