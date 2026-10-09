import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * El puente con el agente de la usuaria (spec 2026-10-09, § 4.2): lo que lee
 * la puerta «Tu agente». No se guarda (P10): conectarse es un permiso por
 * sesión.
 */
export type EstadoDelPuente = 'apagado' | 'buscando' | 'conectado' | 'bloqueado' | 'reemplazado';

export interface PuenteState {
  estado: EstadoDelPuente;
  /** Quién está del otro lado, si se presentó: «Claude Code». */
  agente: string | null;
}

const initialState: PuenteState = { estado: 'apagado', agente: null };

const puenteSlice = createSlice({
  name: 'puente',
  initialState,
  reducers: {
    cambiarPuente(state, action: PayloadAction<{ estado: EstadoDelPuente; agente?: string | null }>) {
      state.estado = action.payload.estado;
      state.agente = action.payload.agente ?? null;
    },
  },
});

export const { cambiarPuente } = puenteSlice.actions;
export default puenteSlice.reducer;
