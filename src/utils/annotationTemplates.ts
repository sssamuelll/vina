/**
 * Built-in annotation templates for production pattern pieces.
 */
import type { AnnotationCategory } from '../types/types';

const MAX_ANNOTATION_LENGTH = 50;

/** Generate a unique annotation ID. */
export function annotationId(): string {
  return 'ann-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

/** Sanitize annotation text: strip control chars, enforce length limit. */
export function sanitizeAnnotationText(text: string): string {
  // Strip control characters (except space)
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(/[\x00-\x1F\x7F]/g, '').trim();
  return cleaned.slice(0, MAX_ANNOTATION_LENGTH);
}

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
