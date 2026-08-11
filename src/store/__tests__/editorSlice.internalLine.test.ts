import { describe, it, expect } from 'vitest';
import reducer, {
  selectInternalLine,
  selectPiece,
  togglePieceSelection,
} from '../editorSlice';

/**
 * samuel-215 — "hay un problema con la seleccion de lineas, a veces cambio de
 * pieza y aun queda seleccionada la linea de una pieza en la que estaba
 * trabajando antes".
 *
 * El "a veces" es el camino que no limpia. `selectedInternalLine` se limpiaba en
 * `selectPiece`, `clearSelection`, `selectAllPieces`, `selectSeam`, `selectPOM`
 * y las de margen — pero NO en `togglePieceSelection`, que es el Shift+clic.
 *
 * Y no es solo cosmético. `useEditorInteractions` cuelga Delete/Backspace de
 * `selectedInternalLine` y borra `{pieceId, lineId}` tal cual: con la selección
 * colgada de la pieza anterior, pulsar Delete borra una línea de una pieza que
 * ni siquiera se está mirando. Pérdida de trabajo en silencio.
 *
 * La regla que se fija aquí: una línea seleccionada es una sub-selección DENTRO
 * de una pieza, así que solo sobrevive mientras esa pieza sea la selección — a
 * secas. En cuanto la selección pasa a ser otra, o varias, la línea se suelta.
 */

const base = () => reducer(undefined, { type: '@@INIT' });

describe('samuel-215 — la línea seleccionada no sobrevive al cambio de pieza', () => {
  it('Shift+clic sobre OTRA pieza suelta la línea de la anterior', () => {
    let s = base();
    s = reducer(s, selectInternalLine({ pieceId: 'A', lineId: 'l1' }));
    expect(s.selectedInternalLine).toEqual({ pieceId: 'A', lineId: 'l1' });

    s = reducer(s, togglePieceSelection('B'));

    expect(s.selectedPieceIds).toEqual(['A', 'B']);
    expect(s.selectedInternalLine).toBeNull();
  });

  it('Shift+clic que DESELECCIONA su propia pieza también la suelta', () => {
    let s = base();
    s = reducer(s, selectInternalLine({ pieceId: 'A', lineId: 'l1' }));

    s = reducer(s, togglePieceSelection('A'));

    expect(s.selectedPieceIds).toEqual([]);
    expect(s.selectedInternalLine).toBeNull();
  });

  it('seleccionar una línea sigue dejando su pieza como la selección', () => {
    let s = base();
    s = reducer(s, selectInternalLine({ pieceId: 'A', lineId: 'l1' }));
    expect(s.selectedPieceIds).toEqual(['A']);
    expect(s.selectedInternalLine).toEqual({ pieceId: 'A', lineId: 'l1' });
  });

  it('el clic normal sobre otra pieza la seguía soltando, y sigue igual', () => {
    let s = base();
    s = reducer(s, selectInternalLine({ pieceId: 'A', lineId: 'l1' }));
    s = reducer(s, selectPiece('B'));
    expect(s.selectedInternalLine).toBeNull();
  });

  it('Shift+clic sin ninguna línea seleccionada no inventa nada', () => {
    let s = base();
    s = reducer(s, selectPiece('A'));
    s = reducer(s, togglePieceSelection('B'));
    expect(s.selectedPieceIds).toEqual(['A', 'B']);
    expect(s.selectedInternalLine).toBeNull();
  });
});
