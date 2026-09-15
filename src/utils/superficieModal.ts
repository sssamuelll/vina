/**
 * ¿Hay una superficie modal delante? (#1173)
 *
 * Vive en un solo sitio porque lo preguntan DOS oyentes de teclado que corren
 * en fases distintas, y con uno solo el arreglo queda medio hecho:
 *
 *   · `ShortcutProvider` → `document`, burbuja. Los atajos globales.
 *   · `useEditorInteractions` → `window`, CAPTURA. El router de #1115.
 *
 * La captura corre ANTES. Guardar solo el primero dejaba a los dueños locales
 * del lienzo —nodo y tramo de Editar patrón, nodo de curva, punto de
 * Pespunte— borrando detrás del diálogo: medido, el contorno pasaba de 5 a 4
 * nodos mientras el diálogo seguía preguntando.
 *
 * El detector es el del estándar y no una marca nuestra: `aria-modal` dice
 * exactamente «esto bloquea lo de atrás». Deja fuera a propósito a los
 * diálogos NO modales — `NotchPrecisionModal` es `role="dialog"` SIN velo, se
 * abre junto a la pieza y el lienzo sigue vivo detrás.
 *
 * Y comprueba que se VEA. `AppShell` deja el panel 2D montado con
 * `display:none` en modo Solo 3D, y `CalibrationModal` vive dentro: sin esta
 * comprobación, un modal escondido dejaba el teclado muerto sin nada en
 * pantalla que lo explicara.
 */
export function hayModalDelante(): boolean {
  const modal = document.querySelector('[aria-modal="true"]');
  return modal instanceof HTMLElement ? seVe(modal) : false;
}

function seVe(el: HTMLElement): boolean {
  // `checkVisibility` es la respuesta del navegador y mira más cosas que
  // nosotros (content-visibility, contenido vacío). Pero jsdom no la trae, y
  // su `getComputedStyle` tampoco hereda `display`, así que ahí se camina el
  // árbol a mano: es lo que hace falta comprobar para el caso real, que es un
  // ANCESTRO escondido (el panel 2D en modo Solo 3D), no el modal mismo.
  const ver = el.checkVisibility?.bind(el);
  if (ver) return ver();
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
  }
  return true;
}
