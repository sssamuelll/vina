/**
 * Leer la bitácora de la caja negra por la puerta de María (Vina ▸ Archivo ▸
 * Exportar diagnóstico) y dejar la evidencia legible: qué gesto, qué acción,
 * en qué orden, con el tiempo relativo al primer atajo del escenario.
 *
 * Con `BITACORA_DUMP=<carpeta>` en el entorno, cada escenario deja además su
 * línea de tiempo en `<carpeta>/<nombre>.txt` y el JSON filtrado al lado —
 * es lo que se pega en el issue como reproducción medida. Sin la variable,
 * no escribe nada: el spec sigue siendo un test de regresión normal.
 */
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportBundle } from './diagnostico';

export interface EventoBitacora {
  t: number;
  kind: string;
  name: string;
  data?: Record<string, unknown>;
  n?: number;
}

/** Acciones de Redux que cuentan la historia; el resto (pan, zoom, frames) es ruido aquí. */
const ACCIONES_RELEVANTES = /^(project\/|editor\/(setActiveTool|selectPiece|selectSeam|clearSelection|togglePieceSelection)|workflow\/|tools\/setActiveTool2D)/;

export function esRelevante(e: EventoBitacora): boolean {
  if (e.kind === 'gesture' || e.kind === 'shortcut' || e.kind === 'ui' || e.kind === 'error') return true;
  if (e.kind === 'action') return ACCIONES_RELEVANTES.test(e.name);
  return false;
}

export async function leerBitacora(page: Page): Promise<EventoBitacora[]> {
  const bundle = (await exportBundle(page)) as { journal?: { events?: EventoBitacora[] } };
  return bundle.journal?.events ?? [];
}

/**
 * Recorta la bitácora desde el primer `shortcut tool.<herramienta>` (o desde
 * el índice dado) y la vuelve líneas `+ms kind name {data}`.
 */
export function lineaDeTiempo(eventos: EventoBitacora[], desde: number | string): string[] {
  const i0 = typeof desde === 'number'
    ? desde
    : Math.max(0, eventos.findIndex((e) => e.kind === 'shortcut' && e.name === `tool.${desde}`));
  const t0 = eventos[i0]?.t ?? eventos[0]?.t ?? 0;
  return eventos.slice(i0).filter(esRelevante).map((e) => {
    const rep = e.n && e.n > 1 ? ` ×${e.n}` : '';
    const data = e.data ? ' ' + JSON.stringify(e.data) : '';
    return `+${String(e.t - t0).padStart(6)}ms ${e.kind.padEnd(8)} ${e.name}${rep}${data}`;
  });
}

/** Deja la evidencia en disco si `BITACORA_DUMP` apunta a una carpeta; devuelve las líneas. */
export function guardarEvidencia(nombre: string, eventos: EventoBitacora[], desde: number | string): string[] {
  const lineas = lineaDeTiempo(eventos, desde);
  const dir = process.env.BITACORA_DUMP;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${nombre}.txt`), lineas.join('\n') + '\n', 'utf8');
    writeFileSync(join(dir, `${nombre}.json`), JSON.stringify(eventos.filter(esRelevante), null, 1), 'utf8');
  }
  return lineas;
}

/** Índice del primer evento que cumple; -1 si no está. */
export function indiceDe(
  eventos: EventoBitacora[],
  kind: string,
  name: string,
  pred: (d: Record<string, unknown>) => boolean = () => true,
): number {
  return eventos.findIndex((e) => e.kind === kind && e.name === name && pred(e.data ?? {}));
}
