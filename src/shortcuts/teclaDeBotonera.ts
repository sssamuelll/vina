/**
 * Enter y Espacio sobre un botón de una botonera son del botón: lo pulsan, y
 * no llegan a los atajos ni a la herramienta del lienzo. Una botonera lo
 * declara con `data-botonera` (la línea al pie y su menú «Más»), y sus botones
 * nunca se quedan con el foco por un clic: solo lo tienen si María llegó a
 * ellos con el teclado.
 *
 * Lo cazó la revisión final de P2b: con el foco en una alternativa, Espacio
 * arrancaba la simulación (`sim.toggle`) en vez de pulsarla, y Enter sobre
 * «Más» hacía además que Desplazar contorno creara la pieza desplazada.
 */
export function esTeclaDeBotonera(e: KeyboardEvent): boolean {
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  return e.target instanceof Element && e.target.closest('[data-botonera] button') !== null;
}
