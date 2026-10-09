import { test, expect } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { abrirAppVacia } from './helpers/estados';

/**
 * El puente MCP (spec 2026-10-09), con la app de verdad: el test hace de
 * agente. Arranca `vina-mcp` como lo arrancaría Claude Code y habla MCP por su
 * stdio; la app entra por la puerta, el enchufe al lado de «IA». Lo que jsdom
 * no ve: que la pestaña llega al puente, y que lo que hace el agente se ve en
 * el lienzo y se deshace.
 */
test.describe.configure({ timeout: process.env.CI ? 240_000 : 120_000 });
test.use({ viewport: { width: 1366, height: 643 } });

/** No el 8462: en la máquina de Samuel puede estar corriendo el puente de verdad. */
const PUERTO = 18462;

type Respuesta = { result?: { content?: Array<{ text: string }>; isError?: boolean } };

function agente(proc: ChildProcessWithoutNullStreams) {
  let id = 0;
  const esperando = new Map<number, (r: Respuesta) => void>();
  createInterface({ input: proc.stdout }).on('line', (l) => {
    const m = JSON.parse(l) as Respuesta & { id?: number };
    if (m.id !== undefined) esperando.get(m.id)?.(m);
  });
  return {
    pedir(method: string, params: unknown = {}) {
      const mio = ++id;
      return new Promise<Respuesta>((ok) => {
        esperando.set(mio, ok);
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mio, method, params }) + '\n');
      });
    },
    avisar(method: string) {
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
    },
  };
}

test('tu agente entra por el enchufe: crea una pieza que se ve, y la deshace', async ({ page }) => {
  const proc = spawn(process.execPath, ['mcp/bin/vina-mcp.mjs'], { env: { ...process.env, VINA_MCP_PORT: String(PUERTO), VINA_MCP_ALLOW_LOCAL: '1' } });
  try {
    const yo = agente(proc);
    await yo.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: 'e2e' } });
    yo.avisar('notifications/initialized');

    await page.addInitScript((p) => localStorage.setItem('vina-puente-puerto', String(p)), PUERTO);
    await abrirAppVacia(page);
    await page.getByRole('button', { name: 'Tu agente', exact: true }).click();
    const hoja = page.locator('.hoja-del-agente');
    await expect(hoja).toHaveAttribute('data-material', 'papel');
    await hoja.getByRole('button', { name: 'Conectar', exact: true }).click();
    await expect(hoja).toContainText('Conectado a Claude Code');
    await expect(page.getByRole('button', { name: 'Claude Code está conectado', exact: true })).toBeVisible();

    const creada = await yo.pedir('tools/call', { name: 'create_piece', arguments: { name: 'Del agente', rectangle: { width: 200, height: 100 } } });
    expect(creada.result?.isError, JSON.stringify(creada.result)).toBeFalsy();
    expect(JSON.parse(creada.result!.content![0].text).result.done).toBe(true);
    await expect(page.locator('[data-piece-id]')).toHaveCount(1);

    const deshecha = await yo.pedir('tools/call', { name: 'undo', arguments: {} });
    expect(deshecha.result?.isError, JSON.stringify(deshecha.result)).toBeFalsy();
    await expect(page.locator('[data-piece-id]')).toHaveCount(0);
  } finally {
    proc.kill();
  }
});
