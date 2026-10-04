/**
 * La conversación con la IA, fuera de cualquier componente (spec 2026-10-02
 * «la interfaz en papel» § 6.2): cerrar la barra no pierde la conversación ni
 * corta al agente. Hay un solo loop por conexión activa, y su historia
 * sobrevive entre turnos: la confirmación de M2 propone y para, y sigue en el
 * turno siguiente. Lo que se pinta vive en el slice `ia`.
 */
import { store } from '../store';
import { addPiece } from '../store/projectSlice';
import { selectPiece, requestFitView } from '../store/editorSlice';
import { showErrorToast, showSuccessToast } from '../store/copilotUISlice';
import {
  agregarMensaje, empezarTurno, progresoDelTurno, terminarTurno, type PasoDelAgente,
} from '../store/iaSlice';
import { piecesLabel, promptSafeName, type PendingDXFAttachment } from '../components/shell/dxfImport';
import { reduceToolCalls, type ToolCallProgress } from './hooks/useAgenticLoop';
import { getDefaultRegistry } from './action/tools/registry';
import { anthropicProvider } from './providers/anthropic';
import { openaiProvider } from './providers/openai';
import { deepseekProvider } from './providers/deepseek';
import { ollamaProvider } from './providers/ollama';
import { claudeBridgeProvider } from './providers/claudeBridge';
import { vercelGatewayProvider } from './providers/vercelGateway';
import type { ProviderConfig, ChatMessage, ProviderToolDef } from './providers/types';
import { loadConnectionsState, getActiveConnection } from './connections/storage';
import { connectionToProviderConfig } from './connections/types';
import { getAllMetaTools } from './reasoning/bridge/meta-tools';
import type { AgenticEvent, AgenticLoop } from './reasoning/bridge/AgenticLoop';
import { createDebugAgenticLoop } from './debug/createDebugBridge';
import { classifyError, getErrorMessage } from './errorRecovery';
import { newId } from '../utils/ids';

export const SIN_CONEXION = 'Falta una conexión de IA. Agrégala en Vina › Preferencias › IA y ratón.';

export const sinConexionConDxf = (piezas: number) =>
  `Cargué tu patrón (${piecesLabel(piezas)}). Para trabajar con él, agrega una conexión de IA en Vina › Preferencias › IA y ratón.`;

function proveedorDe(config: ProviderConfig) {
  switch (config.provider) {
    case 'vercel-gateway': return vercelGatewayProvider;
    case 'claude-bridge': return claudeBridgeProvider;
    case 'anthropic': return anthropicProvider;
    case 'openai': return openaiProvider;
    case 'deepseek': return deepseekProvider;
    case 'ollama': return ollamaProvider;
    default: return anthropicProvider;
  }
}

const lista = (c: ProviderConfig | null): c is ProviderConfig =>
  c !== null && (c.provider === 'ollama' || c.provider === 'claude-bridge' || c.apiKey.length > 0);

/** Los pasos tal como los pinta la conversación: sin `result`. */
const aPasos = (tcs: ToolCallProgress[]): PasoDelAgente[] =>
  tcs.map(({ name, status, error, reason }) => ({ name, status, ...(error ? { error } : {}), ...(reason ? { reason } : {}) }));

let conexion: Promise<ProviderConfig | null> | null = null;
let loop: AgenticLoop | null = null;
let escuchando = false;

/** La conexión activa. Un cambio en `ConnectionsList` la invalida, y el loop con ella. */
function laConexion(): Promise<ProviderConfig | null> {
  if (!escuchando && typeof window !== 'undefined') {
    escuchando = true;
    window.addEventListener('vina:provider-config-changed', () => { conexion = null; loop = null; });
  }
  conexion ??= loadConnectionsState().then((s) => {
    const activa = getActiveConnection(s);
    return activa ? connectionToProviderConfig(activa) : null;
  });
  return conexion;
}

function elLoop(config: ProviderConfig): AgenticLoop {
  if (loop) return loop;
  const registry = getDefaultRegistry();
  registry.setContext(store.dispatch, () => store.getState());
  const vistas = new Set<string>();
  const actionToolDefs = registry.list()
    .filter((t) => (vistas.has(t.name) ? false : (vistas.add(t.name), true)))
    .map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  const proveedor = proveedorDe(config);
  loop = createDebugAgenticLoop({
    send: (msgs: ChatMessage[], tools: ProviderToolDef[], cfg?: unknown) => proveedor.send(msgs, tools, (cfg ?? config) as ProviderConfig),
    metaTools: getAllMetaTools(),
    actionToolDefs,
    getState: () => store.getState(),
    dispatch: store.dispatch,
    registry,
    providerConfig: config,
  }).loop;
  return loop;
}

/**
 * Envía un mensaje. Con un DXF adjunto, primero lo carga en el proyecto (de una
 * vez, en un solo sitio) y el agente trabaja sobre las piezas ya cargadas:
 * nunca recibe los bytes del archivo. El nombre del archivo lo elige quien lo
 * manda, así que entra al modelo neutralizado (`promptSafeName`).
 */
export async function enviar(texto: string, adjunto: PendingDXFAttachment | null = null): Promise<void> {
  const { dispatch, getState } = store;
  if ((!texto.trim() && !adjunto) || getState().ia.trabajando) return;

  let alAgente = texto;
  let aLaVista = texto;
  if (adjunto) {
    for (const piece of adjunto.pieces) dispatch(addPiece(piece));
    dispatch(selectPiece(adjunto.pieces[0].id));
    dispatch(requestFitView());
    const nombre = promptSafeName(adjunto.name);
    const rotulo = `${nombre} · ${piecesLabel(adjunto.pieces.length)}`;
    aLaVista = texto.trim() ? `📎 ${rotulo}\n${texto}` : `📎 ${rotulo}`;
    const nota = `[Contexto: el usuario adjuntó y cargó un patrón DXF "${nombre}" con ${adjunto.pieces.length} piezas, ya presentes en el proyecto.]`;
    alAgente = texto.trim() ? `${nota}\n\n${texto}` : `${nota}\n\nAcabo de cargar este patrón. ¿Qué puedes hacer con él?`;
  }
  dispatch(agregarMensaje({ id: newId(), role: 'user', content: aLaVista }));

  const config = await laConexion();
  if (!lista(config)) {
    if (adjunto) dispatch(showSuccessToast(`Cargué tu patrón: ${piecesLabel(adjunto.pieces.length)}`));
    dispatch(agregarMensaje({ id: newId(), role: 'assistant', content: adjunto ? sinConexionConDxf(adjunto.pieces.length) : SIN_CONEXION }));
    return;
  }

  // Los pasos de ESTE turno, en una variable y no en el store: son el registro
  // que se guarda con la respuesta. La frase con que el agente abre cada tanda
  // se pega a su primera herramienta, para que el rastro diga por qué.
  let pasos: ToolCallProgress[] = [];
  let razon: string | undefined;
  const alEvento = (event: AgenticEvent) => {
    switch (event.type) {
      case 'text:delta':
        razon = event.content?.trim() || undefined;
        break;
      case 'tool:start':
        pasos = reduceToolCalls(pasos, event);
        if (razon && pasos.length > 0) {
          const ultimo = pasos.length - 1;
          pasos = pasos.map((tc, i) => (i === ultimo ? { ...tc, reason: razon } : tc));
          razon = undefined;
        }
        dispatch(progresoDelTurno(aPasos(pasos)));
        break;
      case 'tool:complete':
      case 'tool:cancelled':
      case 'tool:error':
        pasos = reduceToolCalls(pasos, event);
        dispatch(progresoDelTurno(aPasos(pasos)));
        break;
      case 'error':
        dispatch(showErrorToast(event.error));
        break;
    }
  };

  dispatch(empezarTurno());
  try {
    const respuesta = await elLoop(config).run(alAgente, alEvento);
    dispatch(agregarMensaje({ id: newId(), role: 'assistant', content: respuesta, toolCalls: aPasos(pasos) }));
  } catch (e: unknown) {
    dispatch(agregarMensaje({ id: newId(), role: 'assistant', content: getErrorMessage(classifyError(e), e) }));
  } finally {
    dispatch(terminarTurno());
  }
}

/** «Detener»: el turno en curso no hace nada más (spec 2026-10-02 § 6.2). */
export function detener(): void {
  loop?.detener();
}
