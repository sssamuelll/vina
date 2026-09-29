import { test, expect, Page } from '@playwright/test';

/**
 * Ola 1 de la Fase 3+4 (§ 2.3 de la spec, Grupo 1): las cuatro
 * reclasificaciones de z-index cambian comportamiento, y jsdom no puede
 * verlas — no calcula layout, así que `getBoundingClientRect()` devuelve 0 y
 * `elementFromPoint` no existe. La suite unitaria (6889 tests) pasó entera
 * mientras la Ola 1 llevaba dentro una regresión de apilamiento; hizo falta
 * un navegador para encontrarla.
 *
 * Dos de las cuatro se verificaron a mano en Chrome (SolverMetrics y
 * ToolTooltip). Las otras dos viven detrás de flujos que hay que conducir:
 *
 *  - `NotchPrecisionModal`  1000 → --z-menu (200), reclasificado A LA BAJA
 *    porque su propio archivo dice "deliberately no scrim/backdrop": no
 *    bloquea, así que no es un modal.
 *  - `ConnectionModal`      200 → --z-modal (1100), reclasificado AL ALZA
 *    porque sí tiene velo y sí bloquea.
 *
 * Lo que este spec mide NO es el valor declarado —para eso está
 * `zIndexScale.test.ts`— sino el resultado real: quién pinta encima de quién,
 * vía `document.elementFromPoint`. Un z-index alto no sirve de nada si un
 * ancestro con contexto de apilamiento lo encierra; ese fue exactamente el
 * defecto que tumbó al Grupo 2, y hay que comprobar que el Grupo 1 no lo
 * repite.
 */

interface VentanaConStore {
  __VINA_STORE__: {
    dispatch: (a: { type: string; payload?: unknown }) => void;
    getState: () => { tools: { activeTool2D: string } };
  };
}

/** Resultado del sondeo de apilamiento de una superficie. */
interface Apilamiento {
  existe: boolean;
  zIndex: string;
  position: string;
  /** Clases de los ancestros que establecen contexto de apilamiento (lo encierran). */
  encerradoPor: string[];
  /** Quién pinta arriba en el punto probado, de adentro hacia afuera. */
  ganaSobreTopBar: string[];
  ganaSobreBarraIA: string[];
}

async function esperarApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
  await page.waitForTimeout(600);
}

/**
 * Siembra un rectángulo. El e2e arranca con proyecto vacío, y el piquete
 * necesita un contorno donde caer. Un lado recto es el caso que SÍ produce
 * `notchAnchor`, que es la condición para que el modal abra (D-4,
 * click-then-refine).
 */
async function sembrarRectangulo(page: Page) {
  await page.evaluate(() => {
    const w = 300, h = 400;
    (window as unknown as VentanaConStore).__VINA_STORE__.dispatch({
      type: 'project/addPiece',
      payload: {
        id: 'emplazamiento-rect',
        name: 'Rectángulo de prueba',
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [w, 0] },
          { type: 'L', values: [w, h] },
          { type: 'L', values: [0, h] },
          { type: 'Z', values: [] },
        ],
        position: { x: 120, y: 120 },
        internals: [], rotation: 0, mirrored: false, seamAllowance: 0,
        layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
      },
    });
  });
  await page.waitForTimeout(600);
}

/**
 * Mide el apilamiento REAL de `selector` contra la barra superior y la barra
 * de IA. Mueve la superficie encima de cada barra, pregunta con
 * `elementFromPoint` quién pinta arriba, y la devuelve a su sitio.
 */
async function sondearApilamiento(page: Page, selector: string): Promise<Apilamiento> {
  return page.evaluate((sel) => {
    const nombre = (e: Element) =>
      typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : e.tagName;

    // `ConnectionModal` no tiene clase: su raíz es un div con estilos inline.
    // Se localiza por el encabezado que contiene, que es el asidero estable.
    const el = (sel.startsWith('encabezado:')
      ? [...document.querySelectorAll('div')].find(
          d => getComputedStyle(d).position === 'fixed'
            && d.querySelector('h4')?.textContent?.includes(sel.slice('encabezado:'.length)),
        )
      : document.querySelector(sel)) as HTMLElement | null;
    if (!el) {
      return { existe: false, zIndex: '', position: '', encerradoPor: [], ganaSobreTopBar: [], ganaSobreBarraIA: [] };
    }
    const cs = getComputedStyle(el);

    // Un ancestro establece contexto de apilamiento si cumple cualquiera de estas.
    const esContexto = (n: Element) => {
      const s = getComputedStyle(n);
      if (s.position !== 'static' && s.zIndex !== 'auto') return true;
      if (s.isolation === 'isolate') return true;
      if (s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none') return true;
      if (parseFloat(s.opacity) < 1) return true;
      if (s.mixBlendMode !== 'normal') return true;
      if (s.contain.includes('paint') || s.contain.includes('layout')) return true;
      if (s.willChange.includes('transform') || s.willChange.includes('opacity')) return true;
      return false;
    };
    const encerradoPor: string[] = [];
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      if (esContexto(n)) encerradoPor.push(nombre(n));
    }

    const quienGana = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      const cadena: string[] = [];
      for (let g = hit; g && g !== document.body; g = g.parentElement) cadena.push(nombre(g));
      return cadena.slice(0, 4);
    };

    // Se mueve la superficie encima de cada barra para forzar el solape.
    // Si ya cubre la pantalla entera (tiene velo), el movimiento es inocuo.
    const medirContra = (barra: Element | null) => {
      if (!barra) return [];
      const r = barra.getBoundingClientRect();
      const antes = { position: el.style.position, top: el.style.top, left: el.style.left, right: el.style.right, bottom: el.style.bottom };
      const cubreTodo = el.getBoundingClientRect().width >= window.innerWidth * 0.95;
      if (!cubreTodo) {
        el.style.position = 'fixed';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.top = `${r.top + 4}px`;
        el.style.left = `${r.left + 20}px`;
      }
      const ganador = quienGana(r.left + 40, r.top + Math.min(12, r.height / 2));
      Object.assign(el.style, antes);
      return ganador;
    };

    return {
      existe: true,
      zIndex: cs.zIndex,
      position: cs.position,
      encerradoPor,
      ganaSobreTopBar: medirContra(document.querySelector('.top-bar')),
      ganaSobreBarraIA: medirContra(document.querySelector('.unified-bar')),
    };
  }, selector);
}

test.describe('Emplazamiento — las dos reclasificaciones que solo se ven en el navegador', () => {
  test('NotchPrecisionModal: reclasificado a --z-menu, le sigue ganando al cromo', async ({ page }) => {
    await esperarApp(page);
    await sembrarRectangulo(page);

    // El piquete abre el modal solo al hacer clic (click-then-refine, D-4):
    // el modal aparece cuando la posición fue una adivinanza y hay ancla.
    // Activar una herramienta 2D son DOS hechos, no uno: `editor.activeTool`
    // decide qué hace un clic en el lienzo y `tools.activeTool2D` es la clave
    // de opciones. Ponerle solo el segundo la deja activada a medias — lo dice
    // `toolActivation.ts`, y es exactamente lo que pasó al escribir este test.
    await page.evaluate(() => {
      const st = (window as unknown as VentanaConStore).__VINA_STORE__;
      st.dispatch({ type: 'editor/setActiveTool', payload: 'notch' });
      st.dispatch({ type: 'tools/setActiveTool2D', payload: 'notch' });
    });
    await expect
      .poll(() => page.evaluate(
        () => (window as unknown as VentanaConStore).__VINA_STORE__.getState().tools.activeTool2D,
      ))
      .toBe('notch');
    await page.waitForTimeout(300);

    // Clic sobre el borde de una pieza. Se prueban varios puntos del contorno
    // porque el piquete necesita caer sobre el anillo, no sobre el relleno.
    const svg = page.locator('svg.pattern-svg');
    const caja = await svg.boundingBox();
    expect(caja).not.toBeNull();

    const pieza = page.locator('g.pattern-piece').first();
    await expect(pieza).toBeVisible();
    const cajaPieza = await pieza.boundingBox();
    expect(cajaPieza).not.toBeNull();

    // El piquete tiene que caer sobre el anillo del contorno, no sobre el
    // relleno. Se barren varios puntos del borde izquierdo hasta que el modal
    // abra; si ninguno acierta, el test falla en vez de dar un verde falso.
    const modal = page.locator('.notch-precision-modal');
    let abierto = false;
    for (const frac of [0.5, 0.35, 0.65, 0.25, 0.75]) {
      await page.mouse.click(cajaPieza!.x + 1, cajaPieza!.y + cajaPieza!.height * frac);
      await page.waitForTimeout(400);
      if (await modal.count() > 0 && await modal.first().isVisible()) { abierto = true; break; }
    }
    expect(abierto, 'ningún clic sobre el borde izquierdo abrió el modal de piquete').toBe(true);

    await page.screenshot({ path: 'test-results/emplazamiento-notch-modal.png', fullPage: false });

    const sondeo = await sondearApilamiento(page, '.notch-precision-modal');
    expect(sondeo.existe).toBe(true);
    // 200 (--z-menu): por encima de las dos barras (100), por debajo de un
    // menú contextual (1000) y de un modal de verdad (1100).
    expect(sondeo.zIndex).toBe('200');
    expect(sondeo.encerradoPor).toEqual([]);
    // El cromo no puede quedar por delante: eso sería el defecto de vuelta.
    expect(sondeo.ganaSobreTopBar.join(' ')).not.toMatch(/top-bar|app-shell/);
    expect(sondeo.ganaSobreBarraIA.join(' ')).not.toMatch(/unified-bar/);
  });

  test('ConnectionModal: reclasificado a --z-modal, ¿le gana al cromo de verdad?', async ({ page }) => {
    await esperarApp(page);

    // La barra de IA en modo ajustes es quien monta AgentSettings →
    // ConnectionsList → ConnectionModal.
    await page.getByRole('button', { name: 'Modo ajustes' }).click();
    await page.waitForTimeout(700);

    const agregar = page.getByRole('button', { name: /Agregar (conexión|tu primera conexión)/ });
    await expect(agregar.first()).toBeVisible({ timeout: 8000 });
    await agregar.first().click();
    await page.waitForTimeout(600);

    await page.screenshot({ path: 'test-results/emplazamiento-connection-modal.png', fullPage: false });

    const sondeo = await sondearApilamiento(page, 'encabezado:Agregar conexión');
    expect(sondeo.existe).toBe(true);

    // Lo declarado: --z-modal = 1100.
    expect(sondeo.zIndex).toBe('1100');

    // Lo que de verdad importa: que ese 1100 NO esté encerrado. Si un ancestro
    // establece contexto de apilamiento, el valor es decorativo — es
    // exactamente el defecto que retiró al Grupo 2, y no puede repetirse aquí.
    expect(
      sondeo.encerradoPor,
      `el modal está encerrado por ${sondeo.encerradoPor.join(' → ')}: su z-index ${sondeo.zIndex} nunca compite globalmente`,
    ).toEqual([]);

    expect(
      sondeo.ganaSobreTopBar.join(' '),
      'el cromo pinta por delante del modal',
    ).not.toMatch(/top-bar|app-shell/);
  });
});
