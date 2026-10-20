/**
 * El hilo entre el menú Vina › Archivo y el visor 3D (spec 2026-10-02 § 4.2).
 *
 * «Capturar visor 3D» salió de la pantalla —era un botón de la barra de mapas— y
 * vive en un menú, fuera del árbol del visor, que es quien tiene el renderer y
 * sabe capturar. El visor registra su captura al montarse y la suelta al irse;
 * el menú la llama. Es el mismo patrón de módulo que `rendererDeviceLost`.
 */
let captura: (() => void) | null = null;

export function registrarVisor(nueva: (() => void) | null): void {
  captura = nueva;
}

/** Captura el visor si hay uno montado. `false` si no había a quién pedírselo. */
export function capturarVisor3D(): boolean {
  if (!captura) return false;
  captura();
  return true;
}
