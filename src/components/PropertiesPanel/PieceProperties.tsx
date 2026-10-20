import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece, unlinkPieces } from '../../store/projectSlice';
import { selectPiece } from '../../store/editorSlice';
import type { PatternPiece } from '../../types/types';

/**
 * El primer nivel de Propiedades de una pieza (spec 2026-10-02 § 6.1):
 * nombre, margen, tela y espejada, sin cabecera. Lo demás vive plegado en
 * «Producción» (`ProduccionDeLaPieza`). La edición vinculada se queda a la
 * vista: lo que se cambie aquí también cambia a su pareja.
 *
 * Sin los cuatro preajustes de margen (escribían un número que ya tiene
 * campo) ni «Ajustes de piquete»: las opciones del próximo piquete están en
 * la línea al pie, y las de uno ya puesto, en su etiqueta.
 */
export default function PieceProperties({ piece }: { piece: PatternPiece }) {
  const dispatch = useDispatch();
  const fabrics = useSelector((s: RootState) => s.project.fabrics);
  const pieces = useSelector((s: RootState) => s.project.pieces);

  return (
    <div className="panel-nivel">
      <div className="panel-field">
        <label htmlFor="prop-piece-name">Nombre</label>
        <input
          id="prop-piece-name"
          type="text"
          className="panel-input panel-input--grow"
          title={piece.name}
          value={piece.name}
          onChange={e => dispatch(updatePiece({ ...piece, name: e.target.value, updatedAt: Date.now() }))}
        />
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-sa">Margen (mm)</label>
        <input
          id="prop-piece-sa"
          type="number"
          className="panel-input narrow"
          value={piece.seamAllowance}
          min={0}
          max={50}
          onChange={e => dispatch(updatePiece({ ...piece, seamAllowance: Number(e.target.value), updatedAt: Date.now() }))}
        />
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-fabric">Tela</label>
        <select
          id="prop-piece-fabric"
          className="panel-input"
          value={piece.fabricId || ''}
          onChange={e => dispatch(updatePiece({ ...piece, fabricId: e.target.value || undefined, updatedAt: Date.now() }))}
        >
          <option value="">Ninguna</option>
          {fabrics.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-mirror">Espejada</label>
        <input
          id="prop-piece-mirror"
          type="checkbox"
          checked={piece.mirrored}
          onChange={() => dispatch(updatePiece({ ...piece, mirrored: !piece.mirrored, updatedAt: Date.now() }))}
        />
      </div>
      {piece.linkedPieceId && (
        <div className="panel-subblock">
          <div className="panel-subtitle">Edición vinculada</div>
          <div className="panel-link-row">
            <span className={piece.linkMode === 'symmetry' ? 'panel-link-mode--symmetry' : 'panel-link-mode--instance'}>
              {piece.linkMode === 'symmetry' ? 'Simetría' : 'Instancia'}
            </span>
            {' vinculada a '}
            <button
              className="panel-link"
              onClick={() => dispatch(selectPiece(piece.linkedPieceId!))}
            >
              {pieces.find(p => p.id === piece.linkedPieceId)?.name || piece.linkedPieceId}
            </button>
          </div>
          <button
            className="panel-delete"
            onClick={() => dispatch(unlinkPieces({ pieceId: piece.id }))}
          >
            Quitar edición vinculada
          </button>
        </div>
      )}
    </div>
  );
}
