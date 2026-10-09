import { WebSocketServer } from 'ws';

/**
 * El puente de vina-mcp (spec 2026-10-09, § 4.1): un servidor WebSocket en
 * 127.0.0.1 al que se conecta la pestaña de Vina. Un navegador no puede
 * escuchar un socket, así que la pestaña llama y el puente espera (P3). Lo que
 * dice va para el agente, en inglés (D8).
 */

/** Con este código se cierra a una pestaña cuando llega otra (P4). */
export const CIERRE_REEMPLAZADA = 4001;

const VINA = 'https://vina.sdar.dev';
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Solo Vina puede ser la pestaña (P6): la de producción. Una Vina servida en
 * esta máquina (desarrollo, e2e) entra solo si se pide con
 * VINA_MCP_ALLOW_LOCAL=1: cualquier web local podría si no hacerse pasar por
 * ella y cambiarle al agente las descripciones de las herramientas.
 */
export function origenPermitido(origen, permitirLocal = false) {
  return origen === VINA || (permitirLocal && typeof origen === 'string' && LOCAL.test(origen));
}

const NO_CONECTADA =
  'Vina is not connected. If the user already pressed «Conectar», Vina retries every few seconds: try again in a moment. Otherwise ask them to open Vina in the browser, click the plug icon next to «IA» and press «Conectar».';
// Lo que el puente da por fallido pudo haber corrido en la pestaña.
const QUIZAS = 'It may have been applied: call read_pattern before retrying.';

export function crearPuente({
  puerto,
  host = '127.0.0.1',
  permitirLocal = false,
  superficie = null,
  registrar = () => {},
  alCambiarSuperficie = () => {},
  plazoMs = 120_000,
  esperaMs = 4_000,
  reintentoMs = 3_000,
}) {
  let servidor = null;
  let pestana = null;
  let ocupado = false;
  let fallo = null;
  let cerrado = false;
  let reintento;
  let agente = null;
  let siguienteId = 1;
  let ultimaSuperficie = superficie ? JSON.stringify(superficie) : null;
  const pendientes = new Map();
  const aLaEspera = new Set();

  const enUso = () =>
    `vina-mcp cannot take port ${puerto}: another agent session with vina-mcp, or another program, has it. Close that session, or use it.`;

  function soltar(motivo) {
    for (const p of pendientes.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(`Vina disconnected while running ${p.verbo}${motivo}. ${QUIZAS}`));
    }
    pendientes.clear();
  }

  function contarAgente(ws) {
    if (agente) ws.send(JSON.stringify({ t: 'agente', ...agente }));
  }

  function alConectar(ws) {
    if (pestana) {
      const vieja = pestana;
      pestana = null;
      soltar(': another Vina tab took over');
      vieja.close(CIERRE_REEMPLAZADA, 'another tab');
    }
    pestana = ws;
    registrar('Vina connected');
    for (const avisar of aLaEspera) avisar();
    aLaEspera.clear();
    ws.on('message', (datos) => {
      let m;
      try { m = JSON.parse(String(datos)); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hola') {
        // Un paquete viejo frente a una pestaña nueva (P7) sigue vivo: se queda
        // con su lista horneada y dice qué hacer.
        if (m.v !== 1) { registrar(`Vina speaks protocol v${m.v}; update vina-studio (npx -y vina-studio@latest)`); return; }
        if (typeof m.instrucciones !== 'string' || !Array.isArray(m.definiciones)) { registrar('ignored a malformed greeting from Vina'); return; }
        // La pestaña desplegada es la verdad (P7): un paquete viejo no recorta verbos nuevos.
        const s = { instrucciones: m.instrucciones, definiciones: m.definiciones };
        const clave = JSON.stringify(s);
        if (clave !== ultimaSuperficie) {
          ultimaSuperficie = clave;
          alCambiarSuperficie(s);
        }
        contarAgente(ws);
      } else if (m.t === 'respuesta') {
        const p = pendientes.get(m.id);
        if (!p) return;
        pendientes.delete(m.id);
        clearTimeout(p.timer);
        p.resolve(m.respuesta);
      }
    });
    ws.on('close', () => {
      if (pestana !== ws) return;
      pestana = null;
      soltar('');
      registrar('Vina disconnected');
    });
  }

  function escuchar() {
    return new Promise((listo) => {
      // Sin poder escuchar por otra razón (un puerto reservado por Windows, uno
      // inválido) el puente tampoco muere: lo dice en cada llamada.
      const fallar = (e) => {
        fallo = `vina-mcp cannot listen on ${host}:${puerto} (${e.code ?? 'error'}): ${e.message}`;
        registrar(fallo);
        listo('fallo');
      };
      const intentar = () => {
        if (cerrado) return;
        let s;
        try {
          s = new WebSocketServer({
            host,
            port: puerto,
            // Con callback para responder 403: devolver false da un 401, que
            // pediría credenciales que no existen.
            verifyClient: ({ origin }, responder) => {
              const ok = origenPermitido(origin, permitirLocal);
              if (!ok) {
                const local = !permitirLocal && LOCAL.test(origin ?? '');
                registrar(`rejected a tab from ${origin ?? 'no origin'}${local ? ' (a local Vina: start vina-mcp with VINA_MCP_ALLOW_LOCAL=1)' : ''}`);
              }
              responder(ok, 403, 'Forbidden');
            },
          });
        } catch (e) {
          fallar(e);
          return;
        }
        s.on('listening', () => {
          servidor = s;
          ocupado = false;
          registrar(`waiting for Vina on ${host}:${s.address().port}`);
          s.on('connection', alConectar);
          listo('escuchando');
        });
        s.on('error', (e) => {
          if (e.code !== 'EADDRINUSE') {
            s.close();
            fallar(e);
            return;
          }
          // P5: otra sesión del agente tiene el puerto. Este puente sigue vivo
          // y reintenta; si muriera, el agente vería un servidor caído sin
          // explicación.
          if (!ocupado) registrar(`port ${puerto} is in use, retrying every ${reintentoMs / 1000} s`);
          ocupado = true;
          listo('ocupado');
          s.close();
          reintento = setTimeout(intentar, reintentoMs);
        });
      };
      intentar();
    });
  }

  async function llamar(verbo, args) {
    if (cerrado) throw new Error('vina-mcp is shutting down.');
    if (fallo) throw new Error(fallo);
    if (!pestana) {
      if (ocupado) throw new Error(enUso());
      // La pestaña reintenta cada 3 s: una llamada que llega antes la espera.
      await new Promise((seguir) => {
        const avisar = () => { clearTimeout(t); seguir(); };
        const t = setTimeout(() => { aLaEspera.delete(avisar); seguir(); }, esperaMs);
        aLaEspera.add(avisar);
      });
      if (!pestana) throw new Error(ocupado ? enUso() : NO_CONECTADA);
    }
    const ws = pestana;
    const id = siguienteId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendientes.delete(id);
        reject(new Error(`Vina did not answer ${verbo} within ${Math.round(plazoMs / 1000)} s. ${QUIZAS}`));
      }, plazoMs);
      pendientes.set(id, { resolve, reject, timer, verbo });
      // `hasta`: pasado ese instante el agente ya la dio por fallida, y la
      // pestaña no la corre (comparten reloj: los dos en esta máquina).
      ws.send(JSON.stringify({ t: 'llamada', id, verbo, args, hasta: Date.now() + plazoMs }));
    });
  }

  function presentarAgente(cliente = {}) {
    agente = { nombre: String(cliente.name ?? ''), version: String(cliente.version ?? '') };
    if (pestana) contarAgente(pestana);
  }

  async function cerrar() {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(reintento);
    soltar('');
    for (const avisar of aLaEspera) avisar();
    aLaEspera.clear();
    pestana?.close(1001, 'vina-mcp closed');
    pestana = null;
    if (servidor) await new Promise((r) => servidor.close(() => r()));
  }

  return {
    escuchar,
    llamar,
    presentarAgente,
    cerrar,
    estado: () => (cerrado ? 'cerrado' : fallo ? 'fallo' : ocupado ? 'ocupado' : pestana ? 'conectado' : 'escuchando'),
    puertoReal: () => servidor?.address()?.port ?? null,
  };
}
