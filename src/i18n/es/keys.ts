import type { Catalog } from '../types';

export const keys = {
  space: 'Espacio',
  backspace: 'Retroceso',
  delete: 'Supr', // glossary-exempt: Delete — key name printed on the keycap, not the verb
  escape: 'Esc', // same-as-en: key name printed on the keycap
  ctrl: 'Ctrl', // same-as-en: key name printed on the keycap
  shift: 'Shift', // same-as-en: key name printed on the keycap
  alt: 'Alt', // same-as-en: key name printed on the keycap
} satisfies Catalog['keys'];
