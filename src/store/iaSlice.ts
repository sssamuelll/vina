import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ToolCallProgress } from '../copilot/hooks/useAgenticLoop';

/**
 * La IA convocada (spec 2026-10-02 «la interfaz en papel» § 6.2). No existe en
 * reposo: la barra se monta solo con `abierta`. La conversación y el turno del
 * agente viven aquí y no en el componente, porque cerrar la barra no puede
 * perder la conversación ni cortar al agente.
 */

/** Un paso del agente, sin su resultado: puede traer funciones (`rollback`). */
export interface PasoDelAgente {
  name: string;
  status: ToolCallProgress['status'];
  error?: string;
  /** Por qué lo hizo: la frase con que el agente abrió esa tanda. */
  reason?: string;
}

export interface MensajeDeIA {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Las herramientas de ese turno: el rastro de lo que decidió. */
  toolCalls?: PasoDelAgente[];
}

/** Con qué se abre: escribiendo, o con la lista de comandos (`Ctrl+K`). */
export type ModoDeApertura = 'conversacion' | 'comandos';

export interface IaState {
  abierta: boolean;
  modoDeApertura: ModoDeApertura;
  /** Sube con cada apertura: la barra ya montada se entera de un `Ctrl+K`. */
  aperturas: number;
  mensajes: MensajeDeIA[];
  /** El agente corre, con la barra a la vista o no. */
  trabajando: boolean;
  /** Los pasos de la vuelta en curso, en vivo. */
  enCurso: PasoDelAgente[];
}

const initialState: IaState = {
  abierta: false,
  modoDeApertura: 'conversacion',
  aperturas: 0,
  mensajes: [],
  trabajando: false,
  enCurso: [],
};

const iaSlice = createSlice({
  name: 'ia',
  initialState,
  reducers: {
    abrirIA(state, action: PayloadAction<ModoDeApertura | undefined>) {
      state.abierta = true;
      state.modoDeApertura = action.payload ?? 'conversacion';
      state.aperturas += 1;
    },
    ocultarIA(state) {
      state.abierta = false;
    },
    agregarMensaje(state, action: PayloadAction<MensajeDeIA>) {
      state.mensajes.push(action.payload);
    },
    empezarTurno(state) {
      state.trabajando = true;
      state.enCurso = [];
    },
    progresoDelTurno(state, action: PayloadAction<PasoDelAgente[]>) {
      state.enCurso = action.payload;
    },
    terminarTurno(state) {
      state.trabajando = false;
      state.enCurso = [];
    },
    olvidarConversacion(state) {
      state.mensajes = [];
      state.enCurso = [];
    },
  },
});

export const { abrirIA, ocultarIA, agregarMensaje, empezarTurno, progresoDelTurno, terminarTurno, olvidarConversacion } = iaSlice.actions;
export default iaSlice.reducer;
