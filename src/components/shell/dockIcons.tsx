import type { SVGProps, ReactNode } from 'react';

/**
 * Glifos propios del dock 2D (#1101, María 2026-08-30).
 *
 * Lucide tiene 5797 iconos y ninguno para «puntada» ni para «piquete»: son
 * vocabulario de patronaje, no de interfaz de software. Se dibujan aquí en la
 * MISMA rejilla que Lucide —viewBox 24×24, trazo 2, `currentColor`, extremos y
 * uniones redondeados, contenido dentro de 20×20— para que no desentonen al
 * lado de los otros diez glifos del dock.
 *
 * La regla que los eligió: el glifo dibuja **el rastro que la herramienta deja
 * en el patrón**, no una metáfora del nombre del concepto. Los tres anteriores
 * (`Shapes`, `Spline`, `Triangle`) fallaban justo ahí y ella los leyó como
 * «formas geométricas», «crear curvas» y «un triángulo».
 *
 * Diseño en `docs/superpowers/specs/2026-09-02-tres-iconos-del-dock-design.md`.
 */

interface GlifoProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number | string;
}

function Glifo({ size = 24, children, ...resto }: GlifoProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...resto}
    >
      {children}
    </svg>
  );
}

/**
 * Línea interna: una línea discontinua.
 * «yo lo dibujaría como una línea intermitente» [00:26].
 */
export function InternalLineIcon(props: GlifoProps) {
  return (
    <Glifo {...props}>
      <path d="m4 20 4-4" />
      <path d="m10 14 4-4" />
      <path d="m16 8 4-4" />
    </Glifo>
  );
}

/**
 * Coser: la línea de costura con las puntadas que la atraviesan.
 * «el icono está raro, parece que ahí es el icono de crear curvas» [21:18].
 *
 * **Una sola horizontal, a propósito.** Ella describió «dos bordes con
 * puntadas», y ese es el dibujo correcto en papel — pero a 16 px NO sobrevive:
 * dos líneas horizontales más marcas verticales equiespaciadas es una rejilla,
 * y el glifo se lee como una almohadilla `#`. Medido sobre trece variantes
 * renderizadas a 16 px reales (§ 5.2 del spec): las seis de la familia «dos
 * bordes» dieron `#` sin excepción, por mucho que se inclinaran las puntadas.
 * Con una sola horizontal la rejilla desaparece y las puntadas se leen.
 */
export function SeamIcon(props: GlifoProps) {
  return (
    <Glifo {...props}>
      <path d="M3 12h18" />
      <path d="m5 8 3 8" />
      <path d="m11 8 3 8" />
      <path d="m17 8 3 8" />
    </Glifo>
  );
}

/**
 * Medir el borde: la curva con las marcas que la herramienta va dejando a lo
 * largo (una cada 25, 50 o 100 mm, según la opción). El rastro NO es una regla
 * ni una cinta: es el borde marcado, que es lo que queda en pantalla.
 *
 * Las marcas van perpendiculares a la curva en su punto, no verticales: una
 * cinta con travesaños rectos se lee como pentagrama.
 */
export function MedirBordeIcon(props: GlifoProps) {
  return (
    <Glifo {...props}>
      <path d="M3 17c4-10 14-10 18 0" />
      <path d="m6.9 11.4 1.9 2.3" />
      <path d="M12 9.5v3" />
      <path d="m17.1 11.4-1.9 2.3" />
    </Glifo>
  );
}

/**
 * Comparar largos: dos bordes superpuestos, uno continuo y otro discontinuo.
 * El rastro es exactamente lo que la herramienta pinta en el lienzo — el
 * segundo borde se dibuja punteado sobre el primero para ver la diferencia.
 *
 * La discontinua va DEBAJO y algo más corta: la diferencia de largo es el
 * dato, y a 16 px se lee antes por el extremo que por el patrón del trazo.
 */
export function CompararLargosIcon(props: GlifoProps) {
  return (
    <Glifo {...props}>
      <path d="M3 12c4-7 12-8 18-5" />
      <path d="M3 19c3.5-6 9.5-7 14-5" strokeDasharray="3 3" />
    </Glifo>
  );
}

/**
 * Abrir la pieza: las dos mitades ya separadas, con la cuña entre ellas.
 * El rastro es el resultado —la pieza abierta—, no la tijera ni la línea de
 * corte, que duran un instante.
 *
 * SIN FLECHA, y esa es la corrección. La primera versión metía una flecha de
 * dos puntas en el hueco y a 16 px reales el glifo se leía como una **H**:
 *
 *     ..+++######+++..     <- la flecha, maciza
 *     ..+++######+++..
 *
 * Dos causas medidas sobre el `d`, las dos de aritmética: las mitades tenían
 * 1 y 2 unidades de claro interior, o sea 0,67 y 1,33 px entre dos trazos de
 * 1,33 px —cada mitad salía como una barra sólida—, y las puntas de la flecha
 * (x=9 y x=15) se solapaban una unidad entera con los cantos interiores (x=8 y
 * x=16), soldándose a ellos. El comentario razonaba el hueco contra el ASTA de
 * la flecha y se olvidó de la tinta de las puntas.
 *
 * La cuña sola dice lo mismo y sobrevive: se abre hacia abajo, que es lo que
 * hace el modo pivote. Rasterizado a 16 px contra tres alternativas antes de
 * elegirlo, que es el método que el spec § 5.2 fijó y que la primera versión
 * no corrió.
 */
export function AbrirPiezaIcon(props: GlifoProps) {
  return (
    <Glifo {...props}>
      <path d="M4 4h5l-1 16H5z" />
      <path d="M20 4h-5l1 16h3z" />
    </Glifo>
  );
}

/**
 * Poner avío: el botón con sus agujeros, visto de frente. Es el avío por
 * defecto de la biblioteca y el que ella va a poner nueve de cada diez veces;
 * la cremallera y el broche no tienen silueta reconocible a 16 px.
 *
 * Dos agujeros, no cuatro: a 16 px cuatro puntos dentro de un círculo de 8 px
 * de radio se empastan en una mancha.
 */
export function PonerAvioIcon(props: GlifoProps) {
  return (
    <Glifo {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.5 12h.01" />
      <path d="M14.5 12h.01" />
    </Glifo>
  );
}

/**
 * Piquete: el borde de la pieza se hunde en la muesca.
 * «lo pondría como una línea y otra línea perpendicular… o una muesca» [28:14].
 *
 * La muesca es parte del borde, no un adorno colgado debajo: así es como queda
 * cortada en la tela, y es lo que ella ve en su mesa.
 */
export function NotchIcon(props: GlifoProps) {
  return (
    <Glifo {...props}>
      <path d="M3 10h6l3 6 3-6h6" />
    </Glifo>
  );
}

/**
 * Elástico: el borde recto arriba y el zigzag que la herramienta pinta debajo.
 *
 * Es literalmente lo que `ElasticRenderer` deja en el patrón — un zigzag
 * desplazado del borde que mide—, no una goma ni una cinta. Van los dos trazos
 * porque el zigzag solo se confunde con el piquete, que también es una línea
 * quebrada; con el borde encima se lee «algo puesto SOBRE un borde».
 *
 * DOS zigs, no cuatro ni ocho. Rasterizado a 16 px contra cinco alternativas
 * (§ 5.2 del spec de iconos): con cuatro tramos los picos se empastan en una
 * banda gris —61 px de tinta repartidos en un borrón— y con ocho, peor. Con dos
 * se leen las dos uves. Es la misma cuenta que dejó «Poner avío» con dos
 * agujeros en vez de cuatro.
 */
export function ElasticoIcon(props: GlifoProps) {
  return (
    <Glifo {...props}>
      <path d="M3 7h18" />
      <path d="m4 18 5-7 5 7 5-7" />
    </Glifo>
  );
}

/**
 * Pliegue: el borde arriba y las líneas de doblez cayendo hacia dentro.
 *
 * Otra vez el rastro: `generatePleatFoldLines` genera exactamente eso —
 * perpendiculares al borde nombrado, hacia dentro de la pieza— y
 * `PieceRenderer` las pinta como internas de tipo `fold`.
 *
 * Tres dobleces y no cuatro: rasterizado a 16 px, con cuatro la separación cae
 * a 4 unidades (2,7 px a tamaño de dock) y el glifo pasa de 86 a 106 píxeles de
 * tinta — se lee como un código de barras. Con tres quedan cuatro filas de aire
 * y los tres trazos se distinguen.
 */
export function PliegueIcon(props: GlifoProps) {
  return (
    <Glifo {...props}>
      <path d="M3 5h18" />
      <path d="M7 5v15" />
      <path d="M12 5v15" />
      <path d="M17 5v15" />
    </Glifo>
  );
}

/**
 * Triángulo: el contorno que la herramienta deja en el patrón (#1111,
 * tanda 8). Aquí el glifo es literal, no una metáfora — es la misma regla que
 * ya sigue el Círculo, cuyo icono de dock también dibuja círculo por círculo.
 *
 * Ápice arriba-centro y base abajo: la misma orientación fija del isósceles
 * por defecto, para que el icono no prometa un ángulo que la herramienta no
 * dibuja de entrada.
 */
export function TrianguloIcon(props: GlifoProps) {
  return (
    <Glifo {...props}>
      <path d="M12 4 20 20 4 20Z" />
    </Glifo>
  );
}
