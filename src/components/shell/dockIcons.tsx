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
