/**
 * Built-in annotation templates for production pattern pieces.
 */
import type { AnnotationCategory } from '../types/types';

export interface AnnotationTemplate {
  text: string;
  category: AnnotationCategory;
}

export const ANNOTATION_TEMPLATES: AnnotationTemplate[] = [
  // Cutting
  { text: 'CUT 1', category: 'cutting' },
  { text: 'CUT 2', category: 'cutting' },
  { text: 'CUT 2 ON FOLD', category: 'cutting' },
  { text: 'CUT 4', category: 'cutting' },

  // Sewing
  { text: 'INTERFACE', category: 'sewing' },
  { text: 'STITCH LINE', category: 'sewing' },
  { text: 'EASE', category: 'sewing' },
  { text: 'GATHER', category: 'sewing' },

  // General
  { text: 'GRAIN \u2192', category: 'general' },
  { text: 'NOTCH', category: 'general' },
  { text: 'CB', category: 'general' },
  { text: 'CF', category: 'general' },

  // QC
  { text: 'CHECK ALIGNMENT', category: 'qc' },
  { text: 'MATCH PATTERN', category: 'qc' },
];

/** Color per annotation category for 2D rendering. */
export const ANNOTATION_CATEGORY_COLORS: Record<AnnotationCategory, string> = {
  cutting: '#e06060',
  sewing: '#6090e0',
  qc: '#e0a030',
  general: '#808080',
};
