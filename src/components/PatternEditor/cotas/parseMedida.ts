const NUMERO = /^-?\d+(?:[.,]\d+)?$/;

/**
 * Lo que María escribe en un chip de cota (spec 2026-08-30 § 4.4): "300",
 * "300,5" o "300.5" → número; vacío, letras, `1e3` o "30 mm" → null. Sin
 * unidades: todo es mm (o grados), y `formatMedida` es quien las pinta.
 */
export function parseMedida(texto: string): number | null {
  const t = texto.trim();
  if (!NUMERO.test(t)) return null;
  return Number(t.replace(',', '.'));
}

/** Un decimal como máximo, coma decimal, sin ceros de relleno: "213,5 mm", "300 mm", "37°". */
export function formatMedida(valor: number, unit: 'mm' | 'deg', referenceLabel?: string): string {
  const redondeado = Math.round(valor * 10) / 10;
  const texto = String(redondeado).replace('.', ',');
  return unit === 'deg' ? `${texto}°${referenceLabel ? ` ${referenceLabel}` : ''}` : `${texto} mm`;
}
