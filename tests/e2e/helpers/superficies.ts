import type { Page } from '@playwright/test';

export interface Superficie { nombre: string; firma: string }

/** No cuentan: ambiente fijo, documento, cromo solo de desarrollo (spec § 3.1 y § 3.4). */
const NO_CUENTAN = ['ambiente', 'documento', 'dev'];
/** Su TEXTO es su contenido: cambiar de texto es «cambiar» (spec § 3.4). */
const CON_FIRMA = ['pista', 'toast'];

/**
 * Superficies visibles ahora. «Visible» = caja mayor que cero dentro del
 * viewport, sin `display:none` ni `visibility:hidden`, opacidad acumulada por
 * encima de 0,05. La oclusión (quién tapa a quién) no se mide aquí: es el
 * trabajo de los specs de emplazamiento.
 */
export async function superficiesVisibles(page: Page): Promise<Superficie[]> {
  return page.evaluate(({ noCuentan, conFirma }) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const opacidad = (el: Element): number => {
      let o = 1;
      for (let n: Element | null = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity || '1');
      return o;
    };
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      return opacidad(el) > 0.05;
    };
    const salida: Array<{ nombre: string; firma: string }> = [];
    const vistas = new Set<string>();
    for (const el of Array.from(document.querySelectorAll('[data-superficie]'))) {
      const nombre = el.getAttribute('data-superficie') ?? '';
      if (noCuentan.includes(nombre) || !visible(el)) continue;
      const firma = conFirma.includes(nombre) ? (el.textContent ?? '').trim().replace(/\s+/g, ' ') : '';
      const clave = `${nombre}|${firma}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      salida.push({ nombre, firma });
    }
    return salida;
  }, { noCuentan: NO_CUENTAN, conFirma: CON_FIRMA });
}

/** Nombres que aparecen o cambian en `ahora` respecto de `antes`. */
export function cambios(antes: Superficie[], ahora: Superficie[]): string[] {
  const previas = new Map<string, Set<string>>();
  for (const s of antes) {
    if (!previas.has(s.nombre)) previas.set(s.nombre, new Set());
    previas.get(s.nombre)!.add(s.firma);
  }
  const nombres = new Set<string>();
  for (const s of ahora) {
    const firmas = previas.get(s.nombre);
    if (!firmas || !firmas.has(s.firma)) nombres.add(s.nombre);
  }
  return [...nombres].sort();
}

/**
 * Mide una acción: foto al empezar, un paso, foto, otro paso, foto… El
 * resultado es la unión de lo que apareció o cambió en algún paso respecto de
 * la foto inicial («aparecen o cambian», spec § 3.4).
 */
export async function medirAccion(page: Page, pasos: Array<() => Promise<void>>): Promise<string[]> {
  const base = await superficiesVisibles(page);
  const union = new Set<string>();
  for (const paso of pasos) {
    await paso();
    await page.waitForTimeout(350);
    for (const n of cambios(base, await superficiesVisibles(page))) union.add(n);
  }
  return [...union].sort();
}

/** Lo que hay en reposo: nombres distintos visibles, sin foto previa. */
export async function enReposo(page: Page): Promise<string[]> {
  const visibles = await superficiesVisibles(page);
  return [...new Set(visibles.map((s) => s.nombre))].sort();
}
