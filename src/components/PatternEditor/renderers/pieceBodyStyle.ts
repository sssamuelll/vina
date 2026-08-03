export type RenderMode2D = 'textured' | 'translucent' | 'wireframe';

export interface PieceBodyStyleInput {
  /** `piece.locked` — el candado por pieza, distinto del bloqueo de capa. */
  locked?: boolean;
  renderMode2D: RenderMode2D;
  /** Color de la colorway resuelta, si la pieza tiene tela asignada. */
  colorwayColor?: string;
  isSelected: boolean;
  zoom2D: number;
}

export interface PieceBodyStyle {
  /** `fill` del cuerpo de la pieza. */
  fill: string;
  /** `strokeDasharray` del contorno de corte; `undefined` = línea continua. */
  cutDash?: string;
}

/**
 * Cómo se pinta el cuerpo de una pieza, incluido su estado de bloqueo.
 *
 * Nota de María #192: bloqueó una pieza sin querer y creyó que el programa se
 * había roto — "no la deja mover de la pantalla, como si fuera un muerto".
 * Había un aviso: la palabra `locked` en 10 px al centro. No lo vio, y con
 * razón: estaba en inglés sobre una interfaz en español, y pintado con el
 * mismo peso que las demás anotaciones técnicas, así que se leía como una
 * marca más de la pieza y no como un estado suyo.
 *
 * Ella misma nombró la convención que espera, la de Clo: "las piezas se
 * vuelven huecas con el margen de línea discontinuo". Eso es lo que hace esto
 * — hueca y contorno de trazos. Es un cambio de forma, no de texto: se nota
 * de reojo y sin saber inglés.
 */
export function pieceBodyStyle(input: PieceBodyStyleInput): PieceBodyStyle {
  const { locked, renderMode2D, colorwayColor, isSelected, zoom2D } = input;

  const cutDash = locked ? `${8 / zoom2D} ${4 / zoom2D}` : undefined;

  // Hueca, pero `transparent` y NUNCA `none`: con `none` el relleno deja de
  // pintarse y se lleva por delante su área de impacto, así que la pieza no
  // se podría seleccionar — justo cuando hace falta para desbloquearla.
  if (locked && renderMode2D !== 'wireframe') return { fill: 'transparent', cutDash };

  const fill =
    renderMode2D === 'wireframe' ? 'none'
    : colorwayColor ? (isSelected ? colorwayColor + '40' : colorwayColor + '25')
    : isSelected ? 'color-mix(in oklab, var(--accent-2d) 14%, var(--piece-fill-2d))'
    : renderMode2D === 'translucent' ? 'rgba(255,255,255,0.45)'
    : 'var(--piece-fill-2d)';

  return { fill, cutDash };
}
