import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verificarContraste } from '../contrasteDeTokens';

const TOKENS = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

describe('la piel cumple sus pisos de contraste (spec 2026-09-24 § 4)', () => {
  it.each(verificarContraste(TOKENS))('$tinta sobre $fondo ≥ $minimo ($por)', (r) => {
    expect(r.ratio, `${r.tinta} sobre ${r.fondo} da ${r.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(r.minimo);
  });
});
