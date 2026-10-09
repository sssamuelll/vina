/**
 * El MCP de vina-mcp (spec 2026-10-09, P2): JSON-RPC 2.0, un mensaje por línea
 * en stdin/stdout. Lo que dice va para el agente, en inglés (D8).
 *
 * ponytail: el protocolo va a mano, con cinco métodos. Si crece (recursos,
 * prompts, progreso, cancelación), pasar al SDK oficial
 * (@modelcontextprotocol/sdk).
 */

/** Las versiones del protocolo que habla, de la más nueva a la más vieja. */
export const VERSIONES = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/**
 * @param {{
 *   version: string,
 *   superficie: () => { instrucciones: string, definiciones: Array<{ name: string, description: string, input_schema: object }> },
 *   llamar: (verbo: string, args: unknown) => Promise<{ ok: boolean, result?: unknown, error?: string, revision: number }>,
 *   presentarse?: (cliente: { name?: string, version?: string }) => void,
 *   enviar: (mensaje: object) => void,
 * }} op
 */
export function crearProtocolo({ version, superficie, llamar, presentarse = () => {}, enviar }) {
  let listo = false;
  const responder = (id, result) => enviar({ jsonrpc: '2.0', id, result });
  const fallar = (id, code, message) => enviar({ jsonrpc: '2.0', id, error: { code, message } });
  const texto = (t, isError) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });

  async function atender(m) {
    const { id, method } = m;
    const params = m.params ?? {};
    const esPedido = id !== undefined && id !== null;
    switch (method) {
      case 'initialize': {
        presentarse(params.clientInfo ?? {});
        const pedida = params.protocolVersion;
        return responder(id, {
          protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: 'vina', version },
          instructions: superficie().instrucciones,
        });
      }
      case 'notifications/initialized':
        listo = true;
        return;
      case 'ping':
        if (esPedido) responder(id, {});
        return;
      case 'tools/list':
        return responder(id, {
          tools: superficie().definiciones.map(d => ({ name: d.name, description: d.description, inputSchema: d.input_schema })),
        });
      case 'tools/call': {
        try {
          // § 5.3 de la spec madre: un `done: false` es una respuesta, no un
          // error. isError queda para lo que no corrió.
          const r = await llamar(params.name, params.arguments ?? {});
          return responder(id, r.ok
            ? texto(JSON.stringify({ result: r.result ?? null, revision: r.revision }), false)
            : texto(JSON.stringify({ error: r.error, revision: r.revision }), true));
        } catch (e) {
          return responder(id, texto(e instanceof Error ? e.message : String(e), true));
        }
      }
      default:
        if (esPedido) fallar(id, -32601, `Method not found: ${method}`);
    }
  }

  return {
    async recibir(linea) {
      const t = linea.trim();
      if (!t) return;
      let m;
      try { m = JSON.parse(t); } catch { return fallar(null, -32700, 'Parse error'); }
      // Un objeto por línea: sin lotes (MCP los quitó en 2025-06-18), sin null
      // ni escalares. Nada que llegue por aquí puede tumbar el proceso.
      if (!m || typeof m !== 'object' || Array.isArray(m)) return fallar(null, -32600, 'Invalid Request');
      try {
        await atender(m);
      } catch (e) {
        if (m.id !== undefined && m.id !== null) fallar(m.id, -32603, `Internal error: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    avisarListaCambiada() {
      if (listo) enviar({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
    },
  };
}
