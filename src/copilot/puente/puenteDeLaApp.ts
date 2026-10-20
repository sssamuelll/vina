import { store } from '../../store';
import { safeGetItem } from '../../utils/safeStorage';
import { crearConexion, permisoDelNavegador, PUERTO_DEL_PUENTE } from './conexion';

/**
 * La conexión de esta pestaña con vina-mcp, sobre la tienda de verdad. El
 * puerto solo cambia en las pruebas: el e2e escribe `vina-puente-puerto` antes
 * de cargar la app, para no chocar con un puente de verdad en el 8462.
 */
let conexion: ReturnType<typeof crearConexion> | null = null;

function laConexion() {
  conexion ??= crearConexion({
    WebSocketImpl: WebSocket,
    getState: store.getState,
    dispatch: store.dispatch,
    puerto: () => Number(safeGetItem('vina-puente-puerto')) || PUERTO_DEL_PUENTE,
    permiso: permisoDelNavegador,
    reintentoMs: 3000,
  });
  return conexion;
}

export const conectarTuAgente = () => laConexion().conectar();
export const desconectarTuAgente = () => laConexion().desconectar();
