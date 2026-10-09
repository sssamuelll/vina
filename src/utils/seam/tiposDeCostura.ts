import type { Seam } from '../../types/types';

/**
 * Los cuatro tipos de costura, con el nombre que ve María. Un término por
 * concepto (contrato de interfaz § 5): los usan Tijeras, la etiqueta de la
 * costura (P3c) y Propiedades. «Flat-felled» y «Overlock» no se traducen: son
 * del oficio (glosario, #1049).
 */
export const TIPOS_DE_COSTURA: ReadonlyArray<{ value: Seam['type']; label: string }> = [
  { value: 'standard', label: 'Normal' },
  { value: 'french', label: 'Francesa' },
  { value: 'flat-felled', label: 'Flat-felled' },
  { value: 'overlock', label: 'Overlock' },
];

export function nombreDelTipoDeCostura(tipo: Seam['type']): string {
  return TIPOS_DE_COSTURA.find((t) => t.value === tipo)?.label ?? tipo;
}
