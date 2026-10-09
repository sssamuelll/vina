import type { AppDispatch, RootState } from '../../store';
import { cambiarPuente, type EstadoDelPuente } from '../../store/puenteSlice';
import { revisionDelProyecto } from '../../store/revisionDelProyecto';
import { pushJournal } from '../../utils/telemetry/journal';
import { ejecutarVerbo } from '../superficie/ejecutar';
import { SUPERFICIE, definicionesDeLaSuperficie } from '../superficie';
import { INSTRUCCIONES } from '../superficie/instrucciones';
import type { Verbo } from '../superficie/tipos';

/**
 * La pestaña ante vina-mcp (spec 2026-10-09, § 4.2). El navegador no puede
 * escuchar, así que la pestaña llama al puente y, mientras «Conectar» esté
 * encendido, reintenta. Cada llamada del agente pasa por `ejecutarVerbo` con
 * origen `mcp`: el mismo camino que usará el agente de Vina (D4).
 */
export const PUERTO_DEL_PUENTE = 8462;
/** Con este código cierra el puente a una pestaña cuando llega otra (P4). */
export const CIERRE_REEMPLAZADA = 4001;

export type PermisoDelNavegador = 'prompt' | 'granted' | 'denied' | 'desconocido';

/**
 * El permiso de «acceso a la red local», vivo: su `onchange` avisa cuando la
 * usuaria responde al navegador. Chrome 155 lo llama así (medido el 09-10);
 * otros navegadores no lo conocen y dan null.
 */
export async function estadoDelPermiso(): Promise<PermissionStatus | null> {
  try {
    return await navigator.permissions.query({ name: 'local-network-access' as PermissionName });
  } catch {
    return null;
  }
}

export async function permisoDelNavegador(): Promise<PermisoDelNavegador> {
  return (await estadoDelPermiso())?.state ?? 'desconocido';
}

const NOMBRES: Record<string, string> = {
  'claude-code': 'Claude Code',
  'claude-ai': 'Claude Desktop',
  cursor: 'Cursor',
  'cursor-vscode': 'Cursor',
};

/** El `clientInfo.name` del agente, como lo leería María. Los que no conocemos salen tal cual. */
export function nombreDelAgente(nombre: unknown): string | null {
  if (typeof nombre !== 'string' || !nombre.trim()) return null;
  return NOMBRES[nombre] ?? nombre;
}

export interface DependenciasDelPuente {
  WebSocketImpl: typeof WebSocket;
  getState: () => RootState;
  dispatch: AppDispatch;
  puerto: () => number;
  permiso: () => Promise<PermisoDelNavegador>;
  reintentoMs: number;
  verbos?: readonly Verbo[];
}

type MensajeDelPuente =
  | { t: 'agente'; nombre?: unknown }
  | { t: 'llamada'; id: number; verbo: string; args: unknown; hasta?: number };

export function crearConexion(dep: DependenciasDelPuente) {
  const verbos = dep.verbos ?? SUPERFICIE;
  let encendido = false;
  let ws: WebSocket | null = null;
  let reintento: ReturnType<typeof setTimeout> | undefined;
  let cola: Promise<void> = Promise.resolve();
  let ultimo = '';

  function poner(estado: EstadoDelPuente, agente: string | null = null) {
    const clave = `${estado}|${agente ?? ''}`;
    if (clave === ultimo) return;
    ultimo = clave;
    dep.dispatch(cambiarPuente({ estado, agente }));
    pushJournal('puente', estado, agente ? { agente } : undefined);
  }

  async function abrir() {
    if (!encendido || ws) return;
    if ((await dep.permiso()) === 'denied') {
      encendido = false;
      poner('bloqueado');
      return;
    }
    if (!encendido || ws) return;
    let s: WebSocket;
    try {
      s = new dep.WebSocketImpl(`ws://127.0.0.1:${dep.puerto()}`);
    } catch {
      // Un navegador que no deja ni intentarlo (contenido mixto, por ejemplo):
      // dicho, en vez de quedarse esperando para siempre.
      encendido = false;
      poner('bloqueado');
      return;
    }
    ws = s;
    s.onopen = () => {
      s.send(JSON.stringify({ t: 'hola', v: 1, instrucciones: INSTRUCCIONES, definiciones: definicionesDeLaSuperficie(verbos) }));
      poner('conectado');
    };
    s.onmessage = (e) => {
      let m: MensajeDelPuente;
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.t === 'agente') poner('conectado', nombreDelAgente(m.nombre));
      if (m.t === 'llamada') {
        const { id, verbo, args, hasta } = m;
        // Una a la vez: un agente que pide en paralelo no mezcla dos lotes de deshacer.
        cola = cola.then(async () => {
          // Vencida, el agente ya la dio por fallida: correrla ahora la
          // aplicaría a sus espaldas, y la repetiría si reintenta.
          const respuesta = typeof hasta === 'number' && Date.now() > hasta
            ? { ok: false as const, error: `${verbo} expired before Vina could run it (Vina was busy); nothing was changed.`, revision: revisionDelProyecto() }
            : await ejecutarVerbo(verbos, verbo, args, { getState: dep.getState, dispatch: dep.dispatch, origen: 'mcp' });
          if (s.readyState === dep.WebSocketImpl.OPEN) s.send(JSON.stringify({ t: 'respuesta', id, respuesta }));
        });
      }
    };
    s.onclose = (e) => {
      if (ws !== s) return;
      ws = null;
      if (e.code === CIERRE_REEMPLAZADA) {
        encendido = false;
        poner('reemplazado');
        return;
      }
      if (!encendido) return;
      poner('buscando');
      reintento = setTimeout(() => void abrir(), dep.reintentoMs);
    };
  }

  return {
    conectar() {
      if (encendido) return;
      encendido = true;
      poner('buscando');
      void abrir();
    },
    desconectar() {
      encendido = false;
      clearTimeout(reintento);
      const s = ws;
      ws = null;
      s?.close(1000);
      poner('apagado');
    },
  };
}
