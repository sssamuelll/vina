// El signo admite el ASCII normal Y el menos Unicode (−, U+2212): algunos
// teclados numéricos y el propio `formatMedida`/copiar-pegar lo escriben así.
const NUMERO = /^([-−]?\d+(?:[.,]\d+)?)\s*(?:°|mm)?$/;

/**
 * Lo que María escribe en un chip de cota (spec 2026-08-30 § 4.4): "300",
 * "300,5" o "300.5" → número; vacío, letras o `1e3` → null. Sin unidad es mm
 * (o grados) igual que antes; CON el sufijo que el propio chip pinta —
 * "90°", "90 °", "12,3 mm", "12,3mm"— también parsea: el chip tiene que
 * poder releer lo que él mismo escribió.
 */
export function parseMedida(texto: string): number | null {
  const t = texto.trim();
  const m = NUMERO.exec(t);
  if (!m) return null;
  return Number(m[1].replace('−', '-').replace(',', '.'));
}

/** Un decimal como máximo, coma decimal, sin ceros de relleno: "213,5 mm", "300 mm", "37°". */
export function formatMedida(valor: number, unit: 'mm' | 'deg', referenceLabel?: string): string {
  const redondeado = Math.round(valor * 10) / 10;
  const texto = String(redondeado).replace('.', ',');
  const referencia = referenceLabel ? ` ${referenceLabel}` : '';
  return unit === 'deg' ? `${texto}°${referencia}` : `${texto} mm${referencia}`;
}
