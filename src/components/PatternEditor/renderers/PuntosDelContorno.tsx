import { memo, useMemo } from 'react';
import type { PatternPiece } from '../../../types/types';
import { extractNodes } from '../nodeEditorUtils';
import { classifyEditableAnchors, type AnchorRole } from '../anchorRoles';
import AnchorGlyph from './AnchorGlyph';

/**
 * Los puntos del contorno de una pieza, visibles SIEMPRE (#1103).
 *
 * María, [11:38]: *«es curioso que los puntos aquí en el cuadrado solo
 * aparecen una vez que clico el cuadrado, pero yo creo que siempre en los
 * extremos los puntos deberían aparecer, porque esos puntos son
 * indispensables, igual que en las líneas»*.
 *
 * Y la otra mitad de la misma frase: *«y los de curva igual no, porque son
 * muchos puntos… solo deberían verse cuando uno clica como el menú curva»*.
 * De ahí el reparto: los extremos siempre, las muestras de curva solo con una
 * herramienta de curva activa.
 *
 * ── Por qué en un componente aparte y memoizado ────────────────────────────
 * Un DXF suyo trae decenas de piezas con decenas de esquinas cada una. Pintar
 * eso en el cuerpo de `SinglePiece` reconcilia cientos de nodos SVG en cada
 * render de la pieza — es el mismo error de rendimiento que ya se midió con
 * los vértices de la pluma (31,9 ms contra 2,2 ms) y que se arregló sacándolos
 * a un `memo` propio. Aquí se hace desde el principio.
 *
 * ponytail: el techo es el NÚMERO de nodos SVG, no el de piezas. Un glifo de
 * esquina son dos nodos, así que un patrón de 30 piezas con 20 esquinas cada
 * una pone ~1200 en el lienzo de forma permanente — el doble de lo que ya
 * pone `verticesVisibles` para la pluma, que sí se midió y aguanta. Si el
 * archivo de María llega a arrastrarse, lo que se toca es pintar los de las
 * piezas NO elegidas con una primitiva plana en vez del glifo completo; la
 * forma solo hace falta donde se manipula.
 */

/**
 * Los que María llama «los extremos»: se ven siempre.
 *
 * **Exportado a propósito, y no por comodidad.** `findClickedAnchorPoint`
 * (`useEditorInteractions.ts`) decide con esta MISMA lista qué punto se puede
 * agarrar con Seleccionar. Lo pintado y lo agarrable tienen que ser el mismo
 * conjunto: si divergen, el borde se ve limpio y el clic entra en edición de
 * nodos igual — medido sobre el DXF de María, 887 nodos agarrables contra 40
 * pintados, con el espaciado por debajo del umbral de captura, o sea el
 * contorno ENTERO era zona de nodo invisible.
 */
export const EXTREMOS: ReadonlySet<AnchorRole> = new Set<AnchorRole>([
  'corner',
  'openEndpoint',
  'lineEnd',
]);

interface PuntosDelContornoProps {
  piece: PatternPiece;
  zoom2D: number;
  /** La pieza está elegida: los puntos pasan de referencia a manipulables. */
  isSelected: boolean;
  /**
   * Esta pieza es la que se está editando con una herramienta de curva:
   * entonces sí salen sus puntos de curva. Es POR PIEZA, no global — con el
   * DXF de María, encenderlo para todas suelta cientos de puntos sobre piezas
   * que nadie está tocando.
   */
  mostrarPuntosDeCurva: boolean;
}

function PuntosDelContorno({
  piece, zoom2D, isSelected, mostrarPuntosDeCurva,
}: PuntosDelContornoProps) {
  const puntos = useMemo(() => {
    const clasificados = classifyEditableAnchors(piece, extractNodes(piece));

    // El DXF de CLO repite el vértice en cada esquina, así que sin deduplicar
    // por coordenada se pintan dos glifos idénticos superpuestos en cada una
    // — se ven más gordos y más oscuros que los demás sin motivo. Es el mismo
    // dedupe que `verticesVisibles` hace para la pluma.
    const vistos = new Set<string>();
    return clasificados.filter(({ node, role }) => {
      if (!EXTREMOS.has(role) && !mostrarPuntosDeCurva) return false;
      const k = `${Math.round(node.position.x * 1e4)}|${Math.round(node.position.y * 1e4)}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  }, [piece, mostrarPuntosDeCurva]);

  return (
    <g className="puntos-del-contorno" data-puntos={puntos.length}>
      {puntos.map(({ node, role }) => (
        <AnchorGlyph
          key={node.ref.commandIndex}
          role={role}
          position={node.position}
          // Sin elegir la pieza, los puntos son una referencia y no un mando:
          // se pintan a la mitad de tamaño para que estén sin gritar.
          zoom2D={isSelected ? zoom2D : zoom2D * 2}
          state="idle"
        />
      ))}
    </g>
  );
}

export default memo(PuntosDelContorno);
