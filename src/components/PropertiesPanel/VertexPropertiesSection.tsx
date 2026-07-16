import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import type { CornerType } from '../../types/types';

interface Props {
  pieceId: string;
  vertexIndex: number;
}

const CORNER_TYPES: { type: CornerType; label: string; disabled?: boolean }[] = [
  { type: 'mitered', label: 'Inglete' },
  { type: 'doubleMitered', label: 'Inglete doble' },
  { type: 'envelope', label: 'Envolvente' },
  { type: 'squared', label: 'Cuadrada' },
  { type: 'slant', label: 'Sesgada' },
  { type: 'match', label: 'Empatada (próximamente)', disabled: true },
  { type: 'trimMirrored', label: 'Recorte espejado' },
];

/**
 * Corner geometry for the selected vertex, edited in the docked panel (bound to
 * the seamAllowance-tool vertex selection). A corner type is a property of the
 * vertex; set it here rather than via a transient right-click popup.
 */
export default function VertexPropertiesSection({ pieceId, vertexIndex }: Props) {
  const dispatch = useDispatch();
  const piece = useSelector((s: RootState) => s.project.pieces.find(p => p.id === pieceId));
  if (!piece) return null;

  const current: CornerType = piece.cornerTypes?.[vertexIndex] ?? piece.defaultCornerType ?? 'mitered';

  const setForVertex = (type: CornerType) => {
    dispatch(updatePiece({
      ...piece,
      cornerTypes: { ...(piece.cornerTypes ?? {}), [vertexIndex]: type },
      updatedAt: Date.now(),
    }));
  };
  const setForAll = (type: CornerType) => {
    dispatch(updatePiece({ ...piece, defaultCornerType: type, cornerTypes: {}, updatedAt: Date.now() }));
  };

  return (
    <section className="panel-section">
      <div className="panel-subtitle panel-subtitle--spaced">Esquina</div>
      <div className="panel-preset-row">
        {CORNER_TYPES.map(({ type, label, disabled }) => (
          <button
            key={type}
            className={`panel-chip-btn ${type === current ? 'panel-chip-btn--active' : ''}`}
            disabled={disabled}
            onClick={() => setForVertex(type)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel-field panel-field--row">
        <button className="panel-chip-btn" onClick={() => setForAll(current)}>
          Aplicar a todas las esquinas
        </button>
      </div>
    </section>
  );
}
