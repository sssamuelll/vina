import { forwardRef, useContext, useImperativeHandle, useMemo, useRef } from 'react';
import type { PatternPiece, Point2D, UnitSystem } from '../../../types/types';
import { pieceLocalToPatternMany } from '../../../utils/geometry/pieceSpace';
import { lineLengthLabels } from '../renderers/lineLengthLabelsData';
import type { Cota } from './cotas';
import CotaChip, { type CotaChipProps } from './CotaChip';
import { GruposDeCotas } from './gruposDeCotas';
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
  piezasConLargos?: readonly PatternPiece[];
  piezaAcotadaId?: string;
  units?: UnitSystem;
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
  { cotas, piezasConLargos, piezaAcotadaId, units = 'mm', lectura, lecturaApagada, pan2D, zoom2D, estorbos, disabled, onCommit, onScrubStart, onScrub, onScrubEnd, onScrubCancel },
  ref,
) {
  const root = useRef<HTMLDivElement>(null);
  const grupos = useContext(GruposDeCotas);
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
  const lados = useMemo(() => (piezasConLargos ?? []).flatMap(piece =>
    lineLengthLabels(piece, units).map(label => {
      const [a, b, medio] = pieceLocalToPatternMany([label.a, label.b, { x: label.x, y: label.y }], piece);
      return { pieceId: piece.id, label, a, b, medio };
    }),
  ), [piezasConLargos, units]);
  const largos = useMemo(() => {
    const coinciden = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
    return lados.flatMap(({ pieceId, label, a, b, medio }) => {
      // Solo el chip que está presente sobre ESTE lado sustituye su lectura.
      // Los extremos pueden venir en el sentido contrario al del contorno.
      if (pieceId === piezaAcotadaId && cotas.some(cota =>
        (coinciden(cota.a, a) && coinciden(cota.b, b)) || (coinciden(cota.a, b) && coinciden(cota.b, a)),
      )) return [];
      return [{
        cota: {
          // state-encoded ID: identidad de la lectura derivada, sin persistencia.
          id: `${pieceId}:${label.id}`,
          label: label.text,
          a, b, outward: { x: 0, y: 0 },
        },
        left: pan2D.x + medio.x * zoom2D,
        top: pan2D.y + medio.y * zoom2D,
        texto: label.text,
        cede: true,
      }];
    });
  }, [lados, piezaAcotadaId, cotas, pan2D, zoom2D]);
  // Chips y lecturas comparten la pasada. Los grupos ya traen su posición y
  // el texto de ambas magnitudes: son las cajas que realmente pinta CotaChip.
  // Las lecturas ceden el sitio para no mover los mandos anclados.
  const puestos = useMemo(() => {
    const chips: ChipPuesto[] = cotas.flatMap(cota => {
      const grupo = grupos?.get(cota.id);
      if (grupo === null) return [];
      return [{
        cota,
        ...(grupo ?? chipScreenPosition(cota, pan2D, zoom2D)),
        texto: grupo
          ? grupo.campos.map(campo => formatMedida(campo.valueMm, campo.unit, campo.referenceLabel)).join(' · ')
          : formatMedida(cota.valueMm, cota.unit, cota.referenceLabel),
      }];
    });
    const items: ChipPuesto[] = [...chips, ...largos];
    if (lectura) {
      items.push({
        cota: lectura,
        ...chipScreenPosition(lectura, pan2D, zoom2D),
        texto: formatMedida(lectura.valueMm, lectura.unit, lectura.referenceLabel),
        cede: true,
      });
    }
    const separados = separarChips(items, estorbos);
    return {
      chips: new Map(chips.map((chip, i) => [chip.cota.id, separados[i]])),
      largos: largos.map((largo, i) => ({ ...largo, ...separados[chips.length + i] })),
      lectura: lectura ? separados[items.length - 1] : null,
    };
  }, [cotas, grupos, largos, lectura, pan2D, zoom2D, estorbos]);
  const lecturaPosition = puestos.lectura;
  return (
    <div ref={root} className="cotas" style={{ pointerEvents: 'none' }} data-testid="cotas">
      {puestos.largos.map(largo => (
        <div
          key={largo.cota.id}
          className="cota cota--lectura"
          aria-hidden="true"
          style={{ left: largo.left, top: largo.top, pointerEvents: 'none' }}
        >
          {largo.texto}
        </div>
      ))}
      {lectura && lecturaPosition && (
        <div
          className={`cota cota--lectura${lectura.primary ? '' : ' cota--hueca'}`}
          aria-hidden="true"
          aria-disabled={lecturaApagada || undefined}
          data-lectura-hover=""
          data-rotulo={lectura.rotulo}
          data-lado={lectura.outward.y > 0 ? 'abajo' : undefined}
          style={{ left: lecturaPosition.left, top: lecturaPosition.top, pointerEvents: 'none' }}
        >
          {formatMedida(lectura.valueMm, lectura.unit)}
        </div>
      )}
      {cotas.map(cota => {
        const puesto = puestos.chips.get(cota.id);
        if (!puesto) return null;
        const { left, top } = puesto;
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
