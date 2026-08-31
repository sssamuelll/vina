export function notchPlacedMessage(distanceMm: number): string {
  const redondeado = Math.round(distanceMm * 10) / 10;
  const texto = Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(1);
  return `Piquete colocado a ${texto} mm`;
}
