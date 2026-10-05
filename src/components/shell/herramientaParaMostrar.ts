import { toolRegistry } from '../../tools';
import { getDockToolById, type DockIcon, type DockToolDef } from './dock2dTools';

/**
 * Cómo se enseña una herramienta: del catálogo del margen si es una de las
 * suyas, y si no (Transformar, con A, o una que solo abren el menú o los
 * comandos) del registro de herramientas, con su nombre en español. La usan el
 * margen, para la activa que no está en él, y la línea al pie, para nombrar la
 * activa (spec 2026-10-02 § 4.3 y § 5.3). El grupo solo lo lee el margen.
 */
export function herramientaParaMostrar(id: string): DockToolDef | undefined {
  const delCatalogo = getDockToolById(id);
  if (delCatalogo) return delCatalogo;
  const def = toolRegistry.getTool(id);
  // El icono del registro solo acepta `size` numérico; quien lo pinta siempre le pasa 16.
  return def ? { id, icon: def.icon as DockIcon, label: def.name, grupo: 'editar' } : undefined;
}
