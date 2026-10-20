/**
 * El papel de las exportaciones del 3D (spec 2026-10-02 § 4.5 y § 12).
 *
 * Con el fondo «Papel» el lienzo del visor es transparente: el color de la hoja
 * lo pone el CSS detrás de él. Una captura, una imagen o una vuelta 360° que
 * salgan de ese lienzo salen sin fondo —transparentes en PNG, negras en JPEG y
 * en vídeo—, así que se componen sobre el papel, salvo que se pida transparente.
 */

/** El color de la hoja, leído de su token: el JS no copia el hex (contrato § 1). */
export function colorDelPapel(): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue('--canvas-2d').trim();
  if (!valor) throw new Error('sobreElPapel: --canvas-2d no está definido');
  return valor;
}

/** Un canvas nuevo, del mismo tamaño, con el papel pintado y el origen encima. */
export function sobreElPapel(origen: HTMLCanvasElement): HTMLCanvasElement {
  const salida = document.createElement('canvas');
  salida.width = origen.width;
  salida.height = origen.height;
  const ctx = salida.getContext('2d')!;
  ctx.fillStyle = colorDelPapel();
  ctx.fillRect(0, 0, salida.width, salida.height);
  ctx.drawImage(origen, 0, 0);
  return salida;
}
