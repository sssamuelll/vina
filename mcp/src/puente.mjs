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

/** Solo Vina puede ser la pestaña (P6): producción, o la app en esta máquina. */
export function origenPermitido(origen) {
  return origen === VINA || (typeof origen === 'string' && LOCAL.test(origen));
}

const NO_CONECTADA =
  'Vina is not connected. Ask the user to open Vina in the browser, click the plug icon next to «IA» and press «Conectar».';

export function crearPuente({
  puerto,
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
  let cerrado = false;
  let reintento;
  let agente = null;
  let siguienteId = 1;
  let ultimaSuperficie = superficie ? JSON.stringify(superficie) : null;
  const pendientes = new Map();
  const aLaEspera = new Set();

  const enUso = () =>
    `Another agent session is connected to Vina (port ${puerto} is in use). Close that session or use it.`;

  function soltar(motivo) {
    for (const p of pendientes.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(`Vina disconnected while running ${p.verbo}${motivo}.`));
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
      if (m.t === 'hola') {
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
      const intentar = () => {
        if (cerrado) return;
        const s = new WebSocketServer({
          host: '127.0.0.1',
          port: puerto,
          // Con callback para responder 403: devolver false da un 401, que
          // pediría credenciales que no existen.
          verifyClient: ({ origin }, responder) => responder(origenPermitido(origin), 403, 'Forbidden'),
        });
        s.on('listening', () => {
          servidor = s;
          ocupado = false;
          registrar(`waiting for Vina on 127.0.0.1:${s.address().port}`);
          s.on('connection', alConectar);
          listo('escuchando');
        });
        s.on('error', (e) => {
          if (e.code !== 'EADDRINUSE') { registrar(e.message); return; }
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
        reject(new Error(`Vina did not answer ${verbo} within ${Math.round(plazoMs / 1000)} s.`));
      }, plazoMs);
      pendientes.set(id, { resolve, reject, timer, verbo });
      ws.send(JSON.stringify({ t: 'llamada', id, verbo, args }));
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
    estado: () => (cerrado ? 'cerrado' : ocupado ? 'ocupado' : pestana ? 'conectado' : 'escuchando'),
    puertoReal: () => servidor?.address()?.port ?? null,
  };
}
