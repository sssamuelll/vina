import { describe, it, expect } from 'vitest';
import { resolverBorrado } from '../borradoDeSeleccion';
import type { EstadoParaBorrado } from '../borradoDeSeleccion';

/**
 * Revisión adversarial de UI del 2026-09-04, hallazgo F-Supr (issue #1115).
 *
 * Tres fallos REPRODUCIDOS en el navegador el mismo día, los tres del mismo
 * mecanismo: **hay seis campos de selección y el borrado mira dos.**
 *
 *  A) Herramienta Seleccionar, una línea interna seleccionada. Supr borra
 *     LA PIEZA ENTERA. Medido: piezas 2 → 1, la línea se va con ella. Es
 *     pérdida de datos y es el mismo susto de #1094, por otra puerta:
 *     `selectInternalLine` deja además `selectedPieceIds = [pieceId]`
 *     (editorSlice.ts:121), y el atajo global corre ANTES que el manejador
 *     local de la línea (document-burbuja vs window-burbuja).
 *
 *  B) Pieza BLOQUEADA. Se selecciona con un clic y Supr la borra. Medido:
 *     piezas 1 → 0. El candado protege de mover y de editar, no de borrar:
 *     `removePieces` no mira `locked` (projectSlice.ts:462-491).
 *
 *  C) Menú Edición ▸ Eliminar reimplementa el borrado SIN la regla de
 *     costuras y SIN el candado (LogoMenu.tsx:89-93). O sea: el arreglo de
 *     #1094 vive en el atajo y no en el menú. Dos implementaciones de la
 *     misma decisión, y una está tres semanas atrasada.
 *
 * La regla, ejecutable: **lo que se ve es lo que se borra.** Una sola función
 * decide el sujeto, y la usan las dos puertas. El orden es el de la tira:
 * primero el objeto fino que la usuaria acaba de tocar, la pieza al final.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 4.
 */

const vacio: EstadoParaBorrado = {
  activeTool: 'select',
  selectedPieceIds: [],
  selectedSeamId: null,
  selectedPOMId: null,
  selectedInternalLine: null,
  piezasBloqueadas: new Set<string>(),
};
const con = (p: Partial<EstadoParaBorrado>): EstadoParaBorrado => ({ ...vacio, ...p });

describe('A — la línea interna se borra a sí misma, no a su pieza', () => {
  it('con Seleccionar y una línea interna elegida, el sujeto es la línea', () => {
    expect(resolverBorrado(con({
      selectedInternalLine: { pieceId: 'p1', lineId: 'L1' },
      // selectInternalLine deja SIEMPRE la pieza anfitriona seleccionada:
      // es justo el dato que hacía ganar a la pieza.
      selectedPieceIds: ['p1'],
    }))).toEqual({ kind: 'internalLine', pieceId: 'p1', lineId: 'L1' });
  });

  it('gana la línea aunque haya varias piezas seleccionadas', () => {
    expect(resolverBorrado(con({
      selectedInternalLine: { pieceId: 'p1', lineId: 'L1' },
      selectedPieceIds: ['p1', 'p2', 'p3'],
    })).kind).toBe('internalLine');
  });

  it('sin línea interna, la pieza vuelve a ser el sujeto', () => {
    expect(resolverBorrado(con({ selectedPieceIds: ['p1'] })))
      .toEqual({ kind: 'pieces', ids: ['p1'] });
  });
});

describe('B — el candado también protege del borrado', () => {
  it('una pieza bloqueada seleccionada no se borra, y se dice por qué', () => {
    expect(resolverBorrado(con({
      selectedPieceIds: ['p1'],
      piezasBloqueadas: new Set(['p1']),
    }))).toEqual({ kind: 'nada', motivo: 'bloqueada' });
  });

  it('de una selección mixta se borran solo las libres', () => {
    expect(resolverBorrado(con({
      selectedPieceIds: ['p1', 'p2', 'p3'],
      piezasBloqueadas: new Set(['p2']),
    }))).toEqual({ kind: 'pieces', ids: ['p1', 'p3'] });
  });

  it('si TODAS están bloqueadas no se borra ninguna', () => {
    expect(resolverBorrado(con({
      selectedPieceIds: ['p1', 'p2'],
      piezasBloqueadas: new Set(['p1', 'p2']),
    }))).toEqual({ kind: 'nada', motivo: 'bloqueada' });
  });

  it('el candado no bloquea el borrado de una costura', () => {
    // El candado es de la pieza; una costura no es una pieza.
    expect(resolverBorrado(con({
      activeTool: 'seam',
      selectedSeamId: 's1',
      selectedPieceIds: ['p1'],
      piezasBloqueadas: new Set(['p1']),
    }))).toEqual({ kind: 'seam', id: 's1' });
  });
});

describe('resolverBorrado — trazo', () => {
  it('con un tramo de trazo seleccionado, el sujeto es ese tramo', () => {
    expect(resolverBorrado(con({
      selectedTrazo: { trazoId: 't1', segmentIndex: 2 },
    }))).toEqual({ kind: 'trazo', trazoId: 't1', segmentIndex: 2 });
  });
});

describe('#1094 sigue arreglado — la regla de costuras no se pierde en el camino', () => {
  // El fix original: en el menú de costuras, Supr borra la costura o nada,
  // JAMÁS la pieza que quedó seleccionada tres gestos antes.
  it.each(['seam', 'seamEdit', 'walkSeam'])(
    'con %s y una costura elegida, se borra la costura',
    (activeTool) => {
      expect(resolverBorrado(con({ activeTool, selectedSeamId: 's1', selectedPieceIds: ['p1'] })))
        .toEqual({ kind: 'seam', id: 's1' });
    },
  );

  it.each(['seam', 'seamEdit', 'walkSeam'])(
    'con %s y SIN costura elegida, no se borra nada (la pieza vieja se salva)',
    (activeTool) => {
      expect(resolverBorrado(con({ activeTool, selectedPieceIds: ['p1'] })))
        .toEqual({ kind: 'nada' });
    },
  );

  it('en el menú de costuras la línea interna tampoco se cuela', () => {
    expect(resolverBorrado(con({
      activeTool: 'seam',
      selectedInternalLine: { pieceId: 'p1', lineId: 'L1' },
      selectedPieceIds: ['p1'],
    }))).toEqual({ kind: 'nada' });
  });
});

describe('los sujetos que hoy nadie borra', () => {
  it('un punto de medida (POM) elegido se borra', () => {
    expect(resolverBorrado(con({ selectedPOMId: 'pom1', selectedPieceIds: ['p1'] })))
      .toEqual({ kind: 'pom', id: 'pom1' });
  });

  it('una costura elegida fuera del menú de costuras también', () => {
    expect(resolverBorrado(con({ selectedSeamId: 's1' })))
      .toEqual({ kind: 'seam', id: 's1' });
  });

  it('sin nada seleccionado, no pasa nada', () => {
    expect(resolverBorrado(vacio)).toEqual({ kind: 'nada' });
  });
});

describe('el orden es el de la tira: lo fino antes que lo grueso', () => {
  it('línea interna > POM > pieza', () => {
    expect(resolverBorrado(con({
      selectedInternalLine: { pieceId: 'p1', lineId: 'L1' },
      selectedPOMId: 'pom1',
      selectedPieceIds: ['p1'],
    })).kind).toBe('internalLine');
  });

  it('POM > pieza', () => {
    expect(resolverBorrado(con({ selectedPOMId: 'pom1', selectedPieceIds: ['p1'] })).kind).toBe('pom');
  });

  it('la pieza es el último recurso, nunca el primero', () => {
    const conTodo = resolverBorrado(con({
      selectedInternalLine: { pieceId: 'p1', lineId: 'L1' },
      selectedPOMId: 'pom1',
      selectedSeamId: 's1',
      selectedPieceIds: ['p1'],
    }));
    expect(conTodo.kind).not.toBe('pieces');
  });
});

describe('#1172 — en las herramientas que solo MIRAN, Supr no tiene sujeto', () => {
  // Medir y comparar no escriben sobre el patrón: entre las tres no hay un
  // solo dispatch al store. Con una pieza seleccionada detrás de seis
  // mediciones, Supr se llevaba la pieza. Medido en navegador: 1 → 0.
  //
  // No es que Medir «se trague» la tecla: es que ahí no hay nada que borrar.
  // Recorrer costura ya se comportaba así por estar en SEWING_TOOL_IDS; esto
  // solo iguala a sus hermanas, que se quedaron fuera por venir de otra
  // familia.
  it.each(['measure', 'measureCurve', 'compareCurves'])(
    'con %s y una pieza seleccionada, la pieza no se borra',
    (activeTool) => {
      expect(resolverBorrado(con({ activeTool, selectedPieceIds: ['p1'] })))
        .toEqual({ kind: 'nada', motivo: 'sin-sujeto' });
    },
  );

  it('CONTROL: Medir POM NO entra en el conjunto por parecerse de nombre', () => {
    // Ojo con lo que este caso prueba y lo que no. Prueba que `pomMeasure` no
    // cayó dentro por parecido de nombre. NO prueba que un POM sea un sujeto
    // alcanzable: `selectPOM` es un reducer que no despacha NADIE en el repo,
    // así que este estado no lo produce ningún camino de usuaria hoy. La
    // primera versión de este control decía lo contrario y era falso.
    expect(resolverBorrado(con({ activeTool: 'pomMeasure', selectedPOMId: 'pom1' })))
      .toEqual({ kind: 'pom', id: 'pom1' });
  });

  it('CONTROL: fuera de esas herramientas la pieza se sigue borrando', () => {
    // Sin esto, «no borrar nunca» también pasaría y apagaría el borrado de
    // toda la app en silencio.
    expect(resolverBorrado(con({ activeTool: 'select', selectedPieceIds: ['p1'] })))
      .toEqual({ kind: 'pieces', ids: ['p1'] });
  });
});

describe('#1172 — pero la sub-selección que SE VE se sigue borrando', () => {
  // La primera versión puso la regla ARRIBA del todo y apagó de paso el
  // trazo, la línea interna y el POM. Eso contradice la ley de la cabecera:
  // esas selecciones siguen PINTADAS mientras se mide, y `setActiveTool` no
  // las limpia al cambiar de herramienta. La regla es sobre la PIEZA.
  it('midiendo, una línea interna seleccionada se borra ella', () => {
    expect(resolverBorrado(con({
      activeTool: 'measure',
      selectedInternalLine: { pieceId: 'p1', lineId: 'L1' },
      selectedPieceIds: ['p1'],
    }))).toEqual({ kind: 'internalLine', pieceId: 'p1', lineId: 'L1' });
  });

  it('midiendo, un tramo de trazo seleccionado se borra él', () => {
    expect(resolverBorrado(con({
      activeTool: 'measure',
      selectedTrazo: { trazoId: 't1', segmentIndex: 2 },
      selectedPieceIds: ['p1'],
    }))).toEqual({ kind: 'trazo', trazoId: 't1', segmentIndex: 2 });
  });

  it('cuando no se borra la pieza, se dice por qué y no en silencio', () => {
    // El motivo no es adorno: de él cuelga que el menú Edición ▸ Eliminar
    // conteste. Sin él, un renglón con rótulo se pulsa y no pasa nada.
    expect(resolverBorrado(con({ activeTool: 'measure', selectedPieceIds: ['p1'] })))
      .toEqual({ kind: 'nada', motivo: 'sin-sujeto' });
  });
});
