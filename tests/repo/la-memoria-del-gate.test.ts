import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * La memoria del gate del deploy (`scripts/deploy-prod.sh`) es un reporter de
 * Playwright, `scripts/memoria-del-gate.mjs`: deja `<spec>.ok` en la carpeta de
 * marcas del árbol cuando todos los tests de un spec salieron como se esperaba.
 * El deploy siguiente se salta los specs con marca.
 *
 * Una marca de más es un spec que se publica sin haber pasado. Por eso esto se
 * mide con Playwright de verdad (reintentos, grupos seriales, saltos) sobre la
 * fixture `tests/repo/fixtures/memoria-del-gate/`, y no con un modelo de cómo
 * creemos que se comporta. Ningún spec de la fixture pide `page`: no abre
 * navegador y tarda unos segundos.
 */
const RAIZ = process.cwd();
const FIXTURE = join(RAIZ, 'tests/repo/fixtures/memoria-del-gate');

let corrida: SpawnSyncReturns<string>;
let marcas: string[];

beforeAll(() => {
  const raiz = mkdtempSync(join(tmpdir(), 'vina-marcas-'));
  // La carpeta del árbol no existe todavía: la crea el reporter.
  const carpeta = join(raiz, 'arbol');
  const salida = mkdtempSync(join(tmpdir(), 'vina-pw-'));
  try {
    corrida = spawnSync(process.execPath, [
      join(RAIZ, 'node_modules/@playwright/test/cli.js'), 'test',
      '--config', join(FIXTURE, 'memoria.config.ts'),
      `--reporter=list,${join(RAIZ, 'scripts/memoria-del-gate.mjs')}`,
    ], {
      cwd: RAIZ,
      env: { ...process.env, VINA_GATE_MARCAS: carpeta, PW_SALIDA: salida },
      encoding: 'utf8',
      timeout: 120_000,
    });
    marcas = existsSync(carpeta) ? readdirSync(carpeta).sort() : [];
  } finally {
    rmSync(raiz, { recursive: true, force: true });
    rmSync(salida, { recursive: true, force: true });
  }
}, 150_000);

describe('la memoria del gate marca solo lo que pasó entero', () => {
  it('la corrida de verdad vio rojos: la fixture no pasa en vacío', () => {
    // Sin este control, «rojo no tiene marca» también lo daría un Playwright
    // que no llegó a correr nada. Y el código de salida no basta: un reporter
    // que no carga también sale con 1. Lo que cuenta es el resumen de la lista.
    expect(corrida.error).toBeUndefined();
    expect(corrida.status, corrida.stderr).toBe(1);
    expect(corrida.stdout).toMatch(/^\s+2 failed$/m);
    expect(corrida.stdout).toMatch(/^\s+2 flaky$/m);
  });

  it('un spec que pasa entero queda marcado, aunque salte tests a propósito', () => {
    expect(marcas).toContain('verde.pw.ts.ok');
  });

  it('un spec con un test rojo no se marca', () => {
    expect(marcas).not.toContain('rojo.pw.ts.ok');
  });

  it('un test que pasa al reintento cuenta como pasado (flaky), como en el gate de siempre', () => {
    expect(marcas).toContain('flaky.pw.ts.ok');
  });

  it('un grupo serial que pasa al reintentarse entero queda marcado', () => {
    expect(marcas).toContain('serial.pw.ts.ok');
  });

  it('un grupo serial cortado no se marca: lo que no llegó a correr no pasó', () => {
    expect(marcas).not.toContain('serial-rojo.pw.ts.ok');
  });

  it('y no hay ninguna marca más', () => {
    expect(marcas).toEqual(['flaky.pw.ts.ok', 'serial.pw.ts.ok', 'verde.pw.ts.ok']);
  });
});
