import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatternPiece, Point2D } from '../../types/types';
import { ladoMasCercano } from './cotas/lado';
import { patternToPieceLocal } from '../../utils/geometry/pieceSpace';

export interface LadoElegido {
  pieceId: string;
  /** Convención de `segmentPolar`: el comando cuyo par final es el nodo que se mueve. */
  commandIndex: number;
}

export interface PuertaDeLado {
  lado: LadoElegido | null;
  /**
   * Sube en cada Tab, aunque el lado sea el mismo. El chip no existe hasta el
   * render siguiente, así que quien lo abre espera a esta secuencia — y con la
   * POSICIÓN en vez de la secuencia, pulsar Tab tras Escape no reabriría nada
   * (tecla muerta, el mismo fallo que la revisión del 06-09 cazó en la Pluma).
   */
  seq: number;
  /** `false` = no había lado que abrir; Tab sigue su camino de siempre. */
  enfocar(): boolean;
  /** `true` = soltó un lado, o sea que consumió el Escape. */
  soltar(): boolean;
}

/**
 * La puerta de teclado al largo de un lado (#1167, spec 2026-09-18 § 3.1).
 *
 * «el editable de largos me gustaría que apareciera solo cuando uno clica Tab,
 * como al crear una línea con pluma en el dibujo libre» — María, 13-09.
 *
 * Elige **el lado recto más cercano al puntero**: es determinista (§ 2.2 del
 * 08-09 ya resuelve los empates por menor distancia) y no obliga a inventar un
 * recorrido con Tab, que dentro de la caja ya significa «Largo → Ángulo».
 *
 * El lado vive aquí y no en Redux, como el punto y el tramo en curso: es estado
 * transitorio de una interacción, y llega a la escalera del sujeto como
 * argumento.
 */
/**
 * Las mismas compuertas que la escalera del sujeto aplica a la pieza. Se
 * comprueban ANTES de decir que Tab se consumió: tragarse la tecla y no abrir
 * nada es peor que no hacer nada, porque el `preventDefault` del router deja
 * además sin efecto el Tab nativo. Si las dos listas se separan, se contradicen
 * en silencio.
 */
function editable(
  piece: PatternPiece,
  hiddenLayerIds: readonly number[],
  layerLocked: Readonly<Record<number, boolean>>,
): boolean {
  const capa = piece.layer ?? 1;
  return !piece.locked && !hiddenLayerIds.includes(capa) && !layerLocked[capa];
}

export function usePuertaDeLado(opts: {
  pieces: PatternPiece[];
  selectedPieceIds: string[];
  /** El cursor en coordenadas de PATRÓN; `null` si nunca entró al lienzo. */
  cursorPattern: { current: Point2D | null };
  /** Capas ocultas (`simulation.hiddenLayerIds`). */
  hiddenLayerIds: readonly number[];
  /** Capas bloqueadas (`project.layerLocked`). */
  layerLocked: Readonly<Record<number, boolean>>;
  /**
   * La pieza seleccionada es la que Rectángulo, Círculo o Triángulo acaba de
   * crear y sigue caliente. Ahí Tab conserva Ancho y Alto (#223/#225): es la
   * medida que se acaba de dibujar, y es la distinción que hizo ELLA —«al
   * SALIR de crear y volver a clicar la pieza». Y no es un estado escondido:
   * la tira dice «la pieza nueva» en vez de «la pieza seleccionada».
   */
  caliente: boolean;
}): PuertaDeLado {
  const { pieces, selectedPieceIds, cursorPattern, hiddenLayerIds, layerLocked, caliente } = opts;
  const [lado, setLado] = useState<LadoElegido | null>(null);
  const [seq, setSeq] = useState(0);
  // El Escape tiene que saber AHORA si consumió algo, y un updater de `setState`
  // corre en el commit, no en la llamada. Se lee del ref, como el resto de los
  // ganchos de tecla de este editor.
  const ladoRef = useRef<LadoElegido | null>(null);

  const soltar = useCallback(() => {
    if (!ladoRef.current) return false;
    ladoRef.current = null;
    setLado(null);
    return true;
  }, []);

  const enfocar = useCallback(() => {
    if (caliente) return false;
    if (selectedPieceIds.length !== 1) return false;
    const piece = pieces.find(p => p.id === selectedPieceIds[0]);
    if (!piece || !editable(piece, hiddenLayerIds, layerLocked)) return false;
    const cursor = cursorPattern.current;
    const commandIndex = ladoMasCercano(
      piece.outline,
      cursor ? patternToPieceLocal(cursor, piece) : null,
    );
    // Sin ningún lado recto no hay nada que escribir: el largo de una curva es
    // de solo lectura (spec 08-09 § 3.1) y se lee con el interruptor «Largos».
    if (commandIndex === null) return false;
    ladoRef.current = { pieceId: piece.id, commandIndex };
    setLado(ladoRef.current);
    setSeq(n => n + 1);
    return true;
  }, [pieces, selectedPieceIds, cursorPattern, hiddenLayerIds, layerLocked, caliente]);

  // El sujeto no sobrevive a su dueño: si la pieza deja de estar seleccionada,
  // desaparece, o cambia la selección, el lado se suelta. Es la misma ley que
  // «no hay estado escondido» (§ 2.4 del contrato del 08-09): si el mando no
  // está, es porque su sujeto no está.
  const dueña = lado === null ? undefined : pieces.find(p => p.id === lado.pieceId);
  const vivo = lado !== null
    && selectedPieceIds.length === 1
    && selectedPieceIds[0] === lado.pieceId
    && dueña !== undefined
    && editable(dueña, hiddenLayerIds, layerLocked);
  ladoRef.current = vivo ? lado : null;
  useEffect(() => { if (lado !== null && !vivo) setLado(null); }, [lado, vivo]);

  return { lado: ladoRef.current, seq, enfocar, soltar };
}
