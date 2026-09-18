import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PatternPiece, Point2D } from '../../types/types';
import { ladoMasCercano } from './cotas/lado';
import { segmentPolar } from './cotas/segmentPolar';
import { patternToPieceLocal } from '../../utils/geometry/pieceSpace';

export interface LadoElegido {
  pieceId: string;
  /** Convención de `segmentPolar`: el comando cuyo par final es el nodo que se mueve. */
  commandIndex: number;
  /**
   * Cuántos comandos tenía el contorno al elegirlo. Un `commandIndex` es un
   * nombre PRESTADO: si alguien inserta o borra un comando, el mismo número
   * pasa a nombrar otro lado, y ni el lado ni la pieza cambian de aspecto.
   * Es el mismo umbral que usa `useEditPattern` para decidir si un cambio es
   * estructural y hay que soltar la selección.
   */
  comandos: number;
}

/** Los dos verbos que consume el router de teclas. Estable entre renders. */
export interface PuertaDeLadoTeclas {
  /** `false` = no había lado que abrir; Tab sigue su camino de siempre. */
  enfocar(): boolean;
  /** `true` = soltó el lado que estaba a la vista, o sea que consumió el Escape. */
  soltar(): boolean;
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
  teclas: PuertaDeLadoTeclas;
}

/**
 * La puerta de teclado al largo de un lado (#1167, spec 2026-09-18 § 3.1).
 *
 * «el editable de largos me gustaría que apareciera solo cuando uno clica Tab,
 * como al crear una línea con pluma en el dibujo libre» — María, 13-09.
 *
 * Elige **el lado recto más cercano a la última posición del ratón sobre el
 * lienzo**: es determinista (§ 2.2 del 08-09 ya resuelve los empates por menor
 * distancia) y no obliga a inventar un recorrido con Tab, que dentro de la caja
 * ya significa «Largo → Ángulo».
 *
 * **No decide por su cuenta si puede abrir.** Pregunta a `admiteLado` sobre el
 * sujeto que hay AHORA en pantalla, vía los dos refs que `PatternEditor`
 * mantiene frescos. La primera versión tenía aquí una lista propia de
 * compuertas —pieza bloqueada, capa oculta, pieza caliente— que duplicaba la de
 * la escalera del sujeto, y las dos ya se contradecían: Tab abría en las ~19
 * herramientas que ni siquiera miraba, y se tragaba la tecla en cuatro estados
 * donde la caja no podía salir.
 *
 * El lado vive aquí y no en Redux, como el punto y el tramo en curso: es una
 * sub-selección transitoria, no una edición pendiente — por eso § 2.3 del
 * contrato del 08-09 no lo gobierna y § 2.4 sí («se recupera volviendo a
 * seleccionar el sujeto»).
 */
export function usePuertaDeLado(opts: {
  pieces: PatternPiece[];
  selectedPieceIds: string[];
  /** El cursor en coordenadas de PATRÓN; `null` si nunca entró al lienzo. */
  cursorPattern: { current: Point2D | null };
  /**
   * ¿Cabría un lado en el sujeto que hay en pantalla? Lo escribe `PatternEditor`
   * con `admiteLado(sujetoSinLado, activeTool) && !sujetoSinLado.disabled`.
   * Es del render ANTERIOR, que es justo lo que corresponde: la tecla llega
   * entre renders y lo que decide es lo que la usuaria está viendo.
   */
  puedeAbrir: { current: boolean };
  /** ¿El lado es AHORA MISMO el sujeto dibujado? Gobierna quién se queda el Escape. */
  esElSujeto: { current: boolean };
}): PuertaDeLado {
  const { pieces, selectedPieceIds, cursorPattern, puedeAbrir, esElSujeto } = opts;
  const [lado, setLado] = useState<LadoElegido | null>(null);
  const [seq, setSeq] = useState(0);
  // Los verbos leen de refs y no del cierre. La lección está escrita en
  // `useEditorInteractions`: «el efecto se re-suscribe en cada render y entre
  // el commit y el flush el `window` seguía con el gancho anterior». Y además
  // el Escape tiene que contestar AHORA si consumió algo, y un updater de
  // `setState` corre en el commit, no en la llamada.
  const ladoRef = useRef<LadoElegido | null>(null);
  const datos = useRef({ pieces, selectedPieceIds });
  datos.current = { pieces, selectedPieceIds };

  const soltar = useCallback(() => {
    // Solo consume el Escape si el lado está A LA VISTA. Este gancho corre en
    // CAPTURA y con `stopPropagation`, así que un «sí» de más mata la tecla
    // para todo lo que venga después — y el Escape del menú contextual está en
    // burbuja. Es la regresión que este mismo archivo documenta haber pagado
    // una vez (#1115).
    if (!ladoRef.current || !esElSujeto.current) return false;
    ladoRef.current = null;
    setLado(null);
    return true;
  }, [esElSujeto]);

  const enfocar = useCallback(() => {
    if (!puedeAbrir.current) return false;
    const { pieces: piezas, selectedPieceIds: elegidas } = datos.current;
    if (elegidas.length !== 1) return false;
    const piece = piezas.find(p => p.id === elegidas[0]);
    if (!piece) return false;
    const cursor = cursorPattern.current;
    const commandIndex = ladoMasCercano(
      piece.outline,
      cursor ? patternToPieceLocal(cursor, piece) : null,
    );
    // Sin ningún lado recto no hay nada que escribir: el largo de una curva es
    // de solo lectura (spec 08-09 § 3.1) y se lee con el interruptor «Largos».
    if (commandIndex === null) return false;
    ladoRef.current = { pieceId: piece.id, commandIndex, comandos: piece.outline.length };
    setLado(ladoRef.current);
    setSeq(n => n + 1);
    return true;
  }, [cursorPattern, puedeAbrir]);

  // El lado no sobrevive a su dueño ni a sí mismo. Validar la PIEZA no basta:
  // un `commandIndex` es un nombre prestado, y en cuanto el contorno cambia de
  // estructura —un punto insertado, un deshacer, una curva por puntos— ese
  // número denota otra geometría. Es la misma ley que `resyncStateToPiece`
  // aplica en `useEditPattern`, y aquí faltaba entera.
  const dueña = lado === null ? undefined : pieces.find(p => p.id === lado.pieceId);
  const vivo = lado !== null
    && selectedPieceIds.length === 1
    && selectedPieceIds[0] === lado.pieceId
    && dueña !== undefined
    // Estructura intacta: un punto insertado o un deshacer corren los índices.
    && dueña.outline.length === lado.comandos
    // Y el lado sigue siendo recto: convertirlo en curva no cambia el número de
    // comandos, así que la comprobación de arriba es ciega a ese caso.
    && segmentPolar(dueña.outline).some(t => t.toCommandIndex === lado.commandIndex);
  ladoRef.current = vivo ? lado : null;
  useEffect(() => { if (lado !== null && !vivo) setLado(null); }, [lado, vivo]);

  const teclas = useMemo(() => ({ enfocar, soltar }), [enfocar, soltar]);
  return { lado: ladoRef.current, seq, teclas };
}
