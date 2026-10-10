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
 * mide con Playwright de verdad (reintentos, grupos seriales, saltos, tiempos
 * agotados, errores sin test) sobre la fixture
 * `tests/repo/fixtures/memoria-del-gate/`, y no con un modelo de cómo creemos
 * que se comporta. Ningún spec de la fixture pide `page`: no abre navegador y
 * cada corrida tarda unos segundos.
 */
const RAIZ = process.cwd();
const FIXTURE = join(RAIZ, 'tests/repo/fixtures/memoria-del-gate');

interface Corrida {
  proceso: SpawnSyncReturns<string>;
  marcas: string[];
}

/** Corre la fixture con el reporter y devuelve las marcas que dejó. */
function correr(filtro: string[]): Corrida {
  const raiz = mkdtempSync(join(tmpdir(), 'vina-marcas-'));
  // La carpeta del árbol no existe todavía: la crea el reporter.
  const carpeta = join(raiz, 'arbol');
  const salida = mkdtempSync(join(tmpdir(), 'vina-pw-'));
  try {
    const proceso = spawnSync(process.execPath, [
      join(RAIZ, 'node_modules/@playwright/test/cli.js'), 'test',
      '--config', join(FIXTURE, 'memoria.config.ts'),
      `--reporter=list,${join(RAIZ, 'scripts/memoria-del-gate.mjs')}`,
      ...filtro,
    ], {
      cwd: RAIZ,
      env: { ...process.env, VINA_GATE_MARCAS: carpeta, PW_SALIDA: salida },
      encoding: 'utf8',
      timeout: 120_000,
    });
    return { proceso, marcas: existsSync(carpeta) ? readdirSync(carpeta).sort() : [] };
  } finally {
    rmSync(raiz, { recursive: true, force: true });
    rmSync(salida, { recursive: true, force: true });
  }
}

let todo: Corrida;
let conErrorGlobal: Corrida;

beforeAll(() => {
  todo = correr(['--grep-invert', '@error-global']);
  conErrorGlobal = correr(['--grep', '@error-global']);
}, 240_000);

describe('la memoria del gate marca solo lo que pasó entero', () => {
  it('la corrida de verdad vio rojos: la fixture no pasa en vacío', () => {
    // Sin este control, «rojo no tiene marca» también lo daría un Playwright
    // que no llegó a correr nada. Y el código de salida no basta: un reporter
    // que no carga también sale con 1. Lo que cuenta es el resumen de la lista.
    expect(todo.proceso.error).toBeUndefined();
    expect(todo.proceso.status, todo.proceso.stderr).toBe(1);
    expect(todo.proceso.stdout).toMatch(/^\s+3 failed$/m);
    expect(todo.proceso.stdout).toMatch(/^\s+2 flaky$/m);
  });

  it('un spec que pasa entero queda marcado, aunque salte tests a propósito', () => {
    expect(todo.marcas).toContain('verde.pw.ts.ok');
  });

  it('un spec con un test rojo no se marca', () => {
    expect(todo.marcas).not.toContain('rojo.pw.ts.ok');
  });

  it('un tiempo agotado tampoco: no sale como «failed», sale como «timedOut»', () => {
    expect(todo.marcas).not.toContain('tiempo.pw.ts.ok');
  });

  it('un test que pasa al reintento cuenta como pasado (flaky), como en el gate de siempre', () => {
    expect(todo.marcas).toContain('flaky.pw.ts.ok');
  });

  it('un grupo serial que pasa al reintentarse entero queda marcado', () => {
    expect(todo.marcas).toContain('serial.pw.ts.ok');
  });

  it('un grupo serial cortado no se marca: lo que no llegó a correr no pasó', () => {
    expect(todo.marcas).not.toContain('serial-rojo.pw.ts.ok');
  });

  it('y no hay ninguna marca más', () => {
    expect(todo.marcas).toEqual(['flaky.pw.ts.ok', 'serial.pw.ts.ok', 'verde.pw.ts.ok']);
  });
});

describe('un error que no es de ningún test deja la corrida sin marcas', () => {
  it('control: el test pasó, y aun así la corrida sale en rojo por el cierre del worker', () => {
    expect(conErrorGlobal.proceso.stdout).toMatch(/^\s+1 passed/m);
    expect(conErrorGlobal.proceso.stdout + conErrorGlobal.proceso.stderr).toContain('cierre del worker roto');
    expect(conErrorGlobal.proceso.status).toBe(1);
  });

  it('y el spec no queda marcado: el intento siguiente lo vuelve a correr', () => {
    // Si se quedara, el intento siguiente encontraría todas las marcas y daría
    // verde sin correr nada, con el mismo error esperándolo.
    expect(conErrorGlobal.marcas).toEqual([]);
  });
});
