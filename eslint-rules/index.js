/**
 * eslint-plugin-vina — local custom ESLint plugin.
 *
 * Local plugin (not published to npm). Loaded by `eslint.config.js` via direct
 * relative import; no package install required.
 *
 * Scaffolded for the 4-rule lint cluster identified by the C1/D-something
 * audit (#659, #662, #664, #674). Rules are added one PR at a time; the
 * `rules` map below grows as each lands.
 *
 * Cross-ref: docs/reports/2026-05-01-rfc-c1-buffer-lifecycle.md § 8.3
 * (lint rule pending follow-up issue).
 */
import requireUseDisposable from './rules/require-use-disposable.js';
import conversionEspacioDePieza from './rules/conversion-espacio-de-pieza.js';
import noLiteralUiString from './rules/no-literal-ui-string.js';

export default {
  meta: {
    name: 'eslint-plugin-vina',
    version: '0.1.0',
  },
  rules: {
    'require-use-disposable': requireUseDisposable,
    'conversion-espacio-de-pieza': conversionEspacioDePieza,
    'no-literal-ui-string': noLiteralUiString,
  },
};
