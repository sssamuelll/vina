// Provisional German: illustrative until the glossary review (spec § 7.1).
import type { Catalog } from '../types';

export const keys = {
  space: 'Leertaste',
  backspace: 'Rücktaste',
  delete: 'Entf',
  escape: 'Esc', // same-as-en: key name printed on the keycap
  ctrl: 'Strg',
  shift: 'Umschalt',
  alt: 'Alt', // same-as-en: key name printed on the keycap
} satisfies Catalog['keys'];
