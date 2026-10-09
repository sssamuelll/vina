import type { CornerType, PatternPiece } from '../../types/types';

/**
 * Los siete tipos de esquina del margen, con el nombre que ve María. Un término
 * por concepto (contrato de interfaz § 5): los usan Propiedades
 * (`VertexPropertiesSection`) y la etiqueta de la esquina (P3c).
 */
export const TIPOS_DE_ESQUINA: ReadonlyArray<{ value: CornerType; label: string }> = [
  { value: 'mitered', label: 'Inglete' },
  { value: 'doubleMitered', label: 'Inglete doble' },
  { value: 'envelope', label: 'Envolvente' },
  { value: 'squared', label: 'Cuadrada' },
  { value: 'slant', label: 'Sesgada' },
  { value: 'match', label: 'Empatada' },
  { value: 'trimMirrored', label: 'Recorte espejado' },
];

/** El tipo de una esquina: el suyo, si no el de la pieza, si no Inglete (como `PieceRenderer`). */
export function tipoDeEsquina(
  piece: Pick<PatternPiece, 'cornerTypes' | 'defaultCornerType'>,
  vertexIndex: number,
): CornerType {
  return piece.cornerTypes?.[vertexIndex] ?? piece.defaultCornerType ?? 'mitered';
}
