import { test, expect } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { abrirAppVacia, cargarDxfDeMaria } from './helpers/estados';

/**
 * El ciclo del ajuste por el puente MCP (plan 2026-10-09-ia-superficie-1b2-ajuste):
 * el test hace de agente. Viste la camisa de María, simula y lee el ajuste
 * pieza por pieza. Con SwiftShader no hay WebGPU: corre el tier WASM, que tarda
 * en arrancar, da un cuadro cada uno o dos segundos y no se asienta en 45 s. El
 * recibo tiene que decirlo, y fit_map medir igual.
 */
test.describe.configure({ timeout: process.env.CI ? 300_000 : 180_000 });
test.use({ viewport: { width: 1366, height: 643 } });

/** Ni el 8462 (el puente de verdad) ni el 18462 (`puente-mcp.spec.ts`). */
const PUERTO = 18463;

type Respuesta = { result?: { content?: Array<{ text: string }>; isError?: boolean } };
type Resultado = Record<string, unknown> & { done?: boolean; measure?: Record<string, unknown>; warnings?: string[] };

function agente(proc: ChildProcessWithoutNullStreams) {
  let id = 0;
  const esperando = new Map<number, (r: Respuesta) => void>();
  createInterface({ input: proc.stdout }).on('line', (l) => {
    const m = JSON.parse(l) as Respuesta & { id?: number };
    if (m.id !== undefined) esperando.get(m.id)?.(m);
  });
  const pedir = (method: string, params: unknown = {}) => {
    const mio = ++id;
    return new Promise<Respuesta>((ok) => {
      esperando.set(mio, ok);
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mio, method, params }) + '\n');
    });
  };
  return {
    pedir,
    avisar: (method: string) => proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'),
    async llamar(name: string, args: unknown): Promise<Resultado> {
      const r = await pedir('tools/call', { name, arguments: args });
      expect(r.result?.isError, JSON.stringify(r.result)).toBeFalsy();
      return JSON.parse(r.result!.content![0].text).result as Resultado;
    },
  };
}

test('tu agente viste la camisa, la simula y lee el ajuste de cada pieza', async ({ page }) => {
  const proc = spawn(process.execPath, ['mcp/bin/vina-mcp.mjs'], { env: { ...process.env, VINA_MCP_PORT: String(PUERTO), VINA_MCP_ALLOW_LOCAL: '1' } });
  try {
    const yo = agente(proc);
    await yo.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: 'e2e' } });
    yo.avisar('notifications/initialized');

    await page.addInitScript((p) => localStorage.setItem('vina-puente-puerto', String(p)), PUERTO);
    await abrirAppVacia(page);
    await cargarDxfDeMaria(page);
    await page.getByRole('button', { name: 'Tu agente', exact: true }).click();
    await page.locator('.hoja-del-agente').getByRole('button', { name: 'Conectar', exact: true }).click();
    await expect(page.locator('.hoja-del-agente')).toContainText('Conectado a Claude Code');

    const vestido = await yo.llamar('dress', {});
    expect(vestido.measure!.pieces).toHaveLength(5);
    expect(vestido.measure).toMatchObject({ view: 'split', view_changed: true });

    const simulada = await yo.llamar('simulate', { action: 'start', wait_seconds: 45 });
    expect(simulada.measure).toMatchObject({ state: 'running' });
    expect(simulada.measure!.frames as number).toBeGreaterThan(0);
    expect(simulada.measure!.tier).not.toBe('none');
    if (!simulada.done) expect(simulada.warnings!.join(' ')).toMatch(/did not settle within 45 s/);

    const ajuste = await yo.llamar('fit_map', {});
    expect(ajuste.available, JSON.stringify(ajuste)).toBe(true);
    const piezas = ajuste.pieces as Array<{ strain_max_pct: number }>;
    expect(piezas).toHaveLength(5);
    for (const p of piezas) expect(Number.isFinite(p.strain_max_pct) && p.strain_max_pct >= 0).toBe(true);

    const parada = await yo.llamar('simulate', { action: 'stop' });
    expect(parada).toMatchObject({ done: true, measure: { state: 'paused' } });
  } finally {
    proc.kill();
  }
});
