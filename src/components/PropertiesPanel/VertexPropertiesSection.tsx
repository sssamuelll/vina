import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import type { CornerType } from '../../types/types';
// Un término por concepto: los mismos nombres que la etiqueta de la esquina (P3c).
import { TIPOS_DE_ESQUINA } from '../../utils/seam/tiposDeEsquina';

interface Props {
  pieceId: string;
  vertexIndex: number;
}


/**
 * Corner geometry for the selected vertex, edited in the docked panel (bound to
 * the seamAllowance-tool vertex selection). A corner type is a property of the
 * vertex; set it here rather than via a transient right-click popup.
 */
export default function VertexPropertiesSection({ pieceId, vertexIndex }: Props) {
  const dispatch = useDispatch();
  const piece = useSelector((s: RootState) => s.project.pieces.find(p => p.id === pieceId));
  if (!piece) return null;

  const explicit: CornerType | undefined = piece.cornerTypes?.[vertexIndex] ?? piece.defaultCornerType;
  const current: CornerType = explicit ?? 'mitered';
  const isExplicit = explicit !== undefined;

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
        {TIPOS_DE_ESQUINA.map(({ value: type, label }) => (
          <button
            key={type}
            className={`panel-chip-btn ${isExplicit && type === current ? 'panel-chip-btn--active' : ''}`}
            onClick={() => setForVertex(type)}
          >
            {label}
          </button>
        ))}
      </div>
      {!isExplicit && (
        <div className="panel-hint">
          Por defecto: {TIPOS_DE_ESQUINA.find(c => c.value === current)?.label}
        </div>
      )}
      <div className="panel-field panel-field--row">
        <button className="panel-chip-btn" onClick={() => setForAll(current)}>
          Aplicar a todas las esquinas
        </button>
      </div>
    </section>
  );
}
