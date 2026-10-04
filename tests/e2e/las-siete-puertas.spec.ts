/**
 * Las siete puertas nuevas, abiertas de verdad en un navegador.
 *
 * El censo del 2026-09-05 encontró siete herramientas con gesto completo y
 * ninguna puerta. Cinco la estrenaron ese día; las otras dos el 06-09, después
 * de arreglar lo que de verdad las tenía cerradas. Este archivo prueba lo que
 * ninguna unitaria puede probar: que María LLEGA — que el botón existe donde se
 * dice, que se puede tocar, y que al tocarlo la herramienta se activa de
 * verdad.
 *
 * Es la ley de «verificar la puerta, no solo el cuarto»: una unitaria que mira
 * `DOCK_2D_CATALOG` demuestra que la entrada está escrita, no que se alcance.
 *
 * Y mide dos cosas que este mismo cambio pone en riesgo:
 *
 *  - El personalizador pasa de catorce filas a veintiuna. El submenú del logo
 *    se salió de la pantalla con menos (#1095) y nadie lo vio hasta medirlo.
 *  - La pista de «Abrir la pieza» tiene que caber. En su primera redacción
 *    ocupaba 883 px y arrancaba en x = −101 a 1366×643: el hallazgo F2 del
 *    informe, repuesto por nuestra propia mano. Ahora va por fases.
 */
import { test, expect, Page } from '@playwright/test';
import { addPiece, clickAt, dispatch, st, toScreen } from './helpers/lienzo';

/** El viewport real del Chrome de María, medido en #1095. */
const MARIA = { width: 1366, height: 643 };

/** id → la etiqueta que María lee. */
const LAS_SIETE: Array<[string, string]> = [
  ['hand', 'Mano'],
  ['measureCurve', 'Medir el borde'],
  ['compareCurves', 'Comparar largos'],
  ['slashAndSpread', 'Abrir la pieza'],
  ['trimPlace', 'Poner avío'],
  ['elastic', 'Elástico'],
  ['pleat', 'Pliegue'],
];

async function abrirApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.locator('.toast__dismiss')
    .evaluateAll((bs) => bs.forEach((b) => (b as HTMLElement).click()))
    .catch(() => {});
  await page.waitForTimeout(200);
}

const abrirPersonalizador = async (page: Page) => {
  await page.getByRole('button', { name: 'Personalizar herramientas del dock' }).click();
  await expect(page.locator('.dock-picker')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(300);
};

test.describe('las siete puertas se alcanzan', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(120_000);

  for (const [id, etiqueta] of LAS_SIETE) {
    test(`«${etiqueta}» se añade al dock y su botón activa ${id}`, async ({ page }) => {
      await abrirApp(page);
      await abrirPersonalizador(page);

      const fila = page.locator('.dock-picker__item', { hasText: etiqueta });
      await expect(fila, `«${etiqueta}» no está en el personalizador`).toHaveCount(1);
      await fila.scrollIntoViewIfNeeded();
      await fila.click();
      await page.waitForTimeout(400);

      // Cerrar el personalizador para que no tape el dock.
      await page.getByRole('button', { name: 'Personalizar herramientas del dock' }).click();
      await page.waitForTimeout(300);

      const boton = page.getByRole('button', { name: etiqueta, exact: true });
      await expect(boton, `«${etiqueta}» no apareció en el dock`).toHaveCount(1);

      // Que EXISTA no basta: que el clic le llegue.
      const tapado = await page.evaluate((et) => {
        const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === et);
        if (!b) return 'no existe';
        const r = b.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) return `fuera de pantalla (${Math.round(r.top)}→${Math.round(r.bottom)} de ${window.innerHeight})`;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !hit || b === hit || b.contains(hit) ? null : (hit.className?.toString().split(' ')[0] ?? hit.tagName);
      }, etiqueta);
      expect(tapado, `el botón de «${etiqueta}» no recibe el clic`).toBeNull();

      await boton.click();
      await expect
        .poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 })
        .toBe(id);

      // Y las DOS puertas del motor, no una: `tools.activeTool2D` es la llave
      // de las opciones y la compuerta de Medir. Activar solo la primera deja
      // la herramienta a medias, y eso no se ve.
      const activo2d = await page.evaluate(
        () => (window as unknown as { __VINA_STORE__: { getState: () => { tools: { activeTool2D: string } } } })
          .__VINA_STORE__.getState().tools.activeTool2D,
      );
      expect(activo2d, `${id} se activó a medias: falta tools.activeTool2D`).toBe(id);
    });
  }

  test('el personalizador entero cabe en la pantalla con sus veintiuna filas', async ({ page }) => {
    await abrirApp(page);
    await abrirPersonalizador(page);

    const medida = await page.evaluate(() => {
      const p = document.querySelector('.dock-picker') as HTMLElement | null;
      if (!p) return null;
      const r = p.getBoundingClientRect();
      const filas = p.querySelectorAll('.dock-picker__item').length;
      const lista = p.querySelector('.dock-picker__list') as HTMLElement | null;
      return {
        filas,
        top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight,
        scrollea: !!lista && lista.scrollHeight > lista.clientHeight + 1,
      };
    });

    expect(medida, 'no se abrió el personalizador').not.toBeNull();
    expect(medida!.filas, 'el catálogo no llegó al personalizador').toBeGreaterThanOrEqual(21);
    // O cabe entero, o scrollea. Lo que no vale es salirse en silencio, que es
    // exactamente lo que hizo el submenú del logo en #1095.
    const cabe = medida!.top >= 0 && medida!.bottom <= medida!.vh;
    expect(
      cabe || medida!.scrollea,
      `el personalizador se sale (${medida!.top}→${medida!.bottom} de ${medida!.vh}) y no scrollea`,
    ).toBe(true);
  });

  test('el personalizador se ve: lo que hay en su caja es él, no el lienzo', async ({ page }) => {
    // #1149 le puso scroll al dock, y un scroll recorta todo lo que se sale de
    // su caja: el personalizador existía, con su tamaño, a la derecha del dock
    // y fuera de la vista. Los clics de este archivo lo alcanzaban porque
    // Playwright desplaza el dock a lo ancho hasta encontrarlo; una persona no.
    await abrirApp(page);
    await abrirPersonalizador(page);
    const tapados = await page.evaluate(() => {
      const r = document.querySelector('.dock-picker')!.getBoundingClientRect();
      return [[r.left + 20, r.top + 20], [r.left + r.width / 2, r.top + r.height / 2], [r.right - 20, r.bottom - 20]]
        .filter(([x, y]) => !document.elementFromPoint(x, y)?.closest('.dock-picker')).length;
    });
    expect(tapados, 'el personalizador está recortado o tapado: de tres puntos de su caja, estos no son él').toBe(0);
  });
});

test.describe('«Abrir la pieza» — el gesto más largo del lienzo, dicho y hecho', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(150_000);

  async function unaTira(page: Page) {
    await abrirApp(page);
    await dispatch(page, 'editor/setActiveTool', 'rectangle');
    await dispatch(page, 'tools/setActiveTool2D', 'rectangle');
    await page.waitForTimeout(300);
    const a = await toScreen(page, { x: 120, y: 140 });
    const b = await toScreen(page, { x: 320, y: 290 });
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up();
    await page.waitForTimeout(600);
    return (await st(page)).project.pieces[0];
  }

  const clic = async (page: Page, x: number, y: number) => {
    const s = await toScreen(page, { x, y });
    await page.mouse.move(s.x, s.y); await page.waitForTimeout(120);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(400);
  };

  test('cinco clics, un arrastre y Enter abren la pieza de verdad', async ({ page }) => {
    const pieza = await unaTira(page);
    await dispatch(page, 'editor/selectPiece', pieza.id);
    await dispatch(page, 'editor/setActiveTool', 'slashAndSpread');
    await dispatch(page, 'tools/setActiveTool2D', 'slashAndSpread');
    await page.waitForTimeout(400);

    const antes = pieza.outline.length;

    await clic(page, 220, 140);   // 1 · contorno: primer extremo del corte
    await clic(page, 220, 290);   // 2 · contorno: segundo extremo
    await clic(page, 170, 215);   // 3 · elegir la mitad izquierda
    await clic(page, 170, 215);   // 4 · confirmarla
    await clic(page, 220, 290);   // 5 · pivote en la punta de abajo

    const a = await toScreen(page, { x: 220, y: 160 });
    const b = await toScreen(page, { x: 170, y: 160 });
    await page.mouse.move(a.x, a.y);
    await page.mouse.move(b.x, b.y, { steps: 18 });
    await page.waitForTimeout(300);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);

    const despues = (await st(page)).project.pieces[0].outline.length;
    expect(
      despues,
      `la pieza no se abrió: el contorno sigue con ${despues} comandos`,
    ).toBeGreaterThan(antes);
  });

  test('y la pista cabe en la pantalla en TODAS sus fases', async ({ page }) => {
    // La primera redacción metía los cinco pasos en una línea: 883 px de ancho
    // arrancando en x = −101. Con la pista por fases, cada una tiene que caber.
    const pieza = await unaTira(page);
    await dispatch(page, 'editor/selectPiece', pieza.id);
    await dispatch(page, 'editor/setActiveTool', 'slashAndSpread');
    await dispatch(page, 'tools/setActiveTool2D', 'slashAndSpread');
    await page.waitForTimeout(400);

    const medirPista = () => page.evaluate(() => {
      const t = [...document.querySelectorAll('svg.pattern-svg text')]
        .map((e) => ({ txt: e.textContent ?? '', r: (e as SVGGraphicsElement).getBoundingClientRect() }))
        .filter((x) => x.txt.length > 25)
        .sort((a, b) => b.txt.length - a.txt.length)[0];
      if (!t) return null;
      return { txt: t.txt, left: Math.round(t.r.left), right: Math.round(t.r.right), vw: window.innerWidth };
    });

    const fuera: string[] = [];
    const pasos: Array<[number, number]> = [[220, 140], [220, 290], [170, 215], [170, 215], [220, 290]];
    for (let i = 0; i <= pasos.length; i++) {
      const p = await medirPista();
      if (p && (p.left < 0 || p.right > p.vw)) {
        fuera.push(`paso ${i}: "${p.txt.slice(0, 45)}…" ${p.left}→${p.right} de ${p.vw}`);
      }
      if (i < pasos.length) await clic(page, pasos[i][0], pasos[i][1]);
    }

    expect(fuera, 'la pista se sale de la pantalla en alguna fase').toEqual([]);
  });
});

test.describe('el avío se guarda con el nombre que María eligió', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(120_000);

  test('lo que dice la tira es lo que va al store, y de ahí a la lista de materiales', async ({ page }) => {
    // El desplegable se tradujo y lo que ESCRIBE no. María elegía «Botón Plano
    // 15mm» en la tira y la pestaña Avíos le decía «Botón — Flat Button 15mm»:
    // dos nombres para el mismo objeto en la misma sesión. `trimExtractor.ts`
    // copia este campo tal cual, así que el idioma se decide aquí.
    await abrirApp(page);
    await dispatch(page, 'editor/setActiveTool', 'rectangle');
    await dispatch(page, 'tools/setActiveTool2D', 'rectangle');
    await page.waitForTimeout(300);
    const a = await toScreen(page, { x: 120, y: 140 });
    const b = await toScreen(page, { x: 320, y: 290 });
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up();
    await page.waitForTimeout(600);

    // Que la pieza EXISTA antes de seguir: sin esto, un arranque lento deja el
    // clic sobre el lienzo vacío y el fallo se lee como «el avío se guarda en
    // inglés» cuando en realidad no se guardó nada. Un gate que da falsos rojos
    // se acaba desactivando.
    const pieza = await expect.poll(
      async () => (await st(page)).project.pieces[0],
      { timeout: 10_000, message: 'no se creó la pieza con Rectángulo' },
    ).toBeTruthy().then(() => (st(page)).then((e) => e.project.pieces[0]));
    expect(pieza.outline.length).toBeGreaterThan(3);

    await dispatch(page, 'editor/setActiveTool', 'trimPlace');
    await dispatch(page, 'tools/setActiveTool2D', 'trimPlace');
    await page.waitForTimeout(400);

    // El medio del borde de arriba, sacado del contorno REAL y no de las
    // coordenadas que se pidieron: si el rectángulo salió con otro tamaño, el
    // clic sigue cayendo donde toca.
    const xs = pieza.outline.flatMap((c) => c.values.filter((_, i) => i % 2 === 0));
    const ys = pieza.outline.flatMap((c) => c.values.filter((_, i) => i % 2 === 1));
    const medio = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) };

    const borde = await toScreen(page, medio);
    await page.mouse.move(borde.x, borde.y); await page.waitForTimeout(200);
    await page.mouse.click(borde.x, borde.y);
    await expect
      .poll(async () => await page.evaluate(() => {
        const w = window as unknown as { __VINA_STORE__: { getState: () => { project: { trims?: unknown[] } } } };
        return (w.__VINA_STORE__.getState().project.trims ?? []).length;
      }), { timeout: 8000, message: 'el clic sobre el borde no colocó ningún avío' })
      .toBeGreaterThan(0);

    const guardado = await page.evaluate(() => {
      const w = window as unknown as { __VINA_STORE__: { getState: () => { project: { trims?: Array<{ name: string }> } } } };
      return (w.__VINA_STORE__.getState().project.trims ?? []).map((t) => t.name);
    });

    expect(guardado.length, 'no se colocó ningún avío').toBeGreaterThan(0);
    for (const n of guardado) {
      expect(n, `el avío se guardó como "${n}", en inglés`).not.toMatch(/\b(Button|Zipper|Snap|Flat|Shank|Horn|Molded|Metal|Nylon|Coil|Invisible|Trim)\b/);
    }
  });
});

test.describe('un catálogo de veintiuna no puede empujar el dock fuera de la pantalla', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(120_000);

  test('con el catálogo entero fijado, el dock sigue dentro y sus botones se alcanzan', async ({ page }) => {
    // `MAX_DOCK_2D_TOOLS` protege el sobre persistido: impide que María pierda
    // TODA su configuración al recargar. No protege el otro lado — `.dock` es
    // `position:absolute; top:50%; translateY(-50%)` sin `max-height` ni
    // `overflow`, así que lo que no cabe se sale por arriba Y por abajo, sin
    // scroll y sin ninguna señal.
    //
    // Medido: cada herramienta cuesta 43 px y el alto es 80 + 43n. A 1366×643
    // el techo son trece. Con catorce el dock ya mide 682. Este riesgo lo trae
    // el catálogo de veintiuna, o sea este mismo lote: antes eran catorce y
    // pasarse era casi imposible.
    await abrirApp(page);
    await page.evaluate(() => {
      const w = window as unknown as { __VINA_STORE__: { dispatch: (a: unknown) => void } };
      for (const id of ['hand', 'measureCurve', 'compareCurves', 'slashAndSpread', 'trimPlace', 'circle', 'grainline']) {
        w.__VINA_STORE__.dispatch({ type: 'dock/addDockTool', payload: id });
      }
    });
    await page.waitForTimeout(600);

    const medida = await page.evaluate(() => {
      const d = document.querySelector('nav.margen') as HTMLElement | null;
      if (!d) return null;
      const r = d.getBoundingClientRect();
      const scrollea = d.scrollHeight > d.clientHeight + 1;
      const botones = [...d.querySelectorAll('button')].map((b) => {
        const br = b.getBoundingClientRect();
        const visible = br.top >= r.top - 1 && br.bottom <= r.bottom + 1;
        const hit = visible
          ? document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2)
          : null;
        return {
          nombre: b.getAttribute('aria-label') ?? '?',
          visible,
          alcanzable: !visible || (!!hit && (hit === b || b.contains(hit))),
        };
      });
      return {
        top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight,
        scrollea,
        // Un botón que no se ve solo vale si se puede llegar a él haciendo
        // scroll. Sin scroll, «fuera de la caja» es «perdido».
        fuera: scrollea ? [] : botones.filter((b) => !b.visible).map((b) => b.nombre),
        inalcanzables: botones.filter((b) => !b.alcanzable).map((b) => b.nombre),
        cuantos: botones.length,
      };
    });

    expect(medida, 'no hay dock izquierdo').not.toBeNull();
    expect(medida!.cuantos, 'no se fijaron las herramientas').toBeGreaterThanOrEqual(17);
    // Lo primero: la propia caja del dock cabe. Antes iba de -109 a 788.
    expect(
      medida!.top >= 0 && medida!.bottom <= medida!.vh,
      `el dock se sale (${medida!.top}→${medida!.bottom} de ${medida!.vh})`,
    ).toBe(true);
    // Y si no cabe todo dentro, que scrollee — la barra ES la señal.
    expect(medida!.scrollea, 'con veintiuna fijadas el dock debería poder scrollear').toBe(true);
    expect(
      medida!.fuera,
      `estos botones del dock quedan fuera de la pantalla (dock ${medida!.top}→${medida!.bottom} de ${medida!.vh})`,
    ).toEqual([]);
    expect(medida!.inalcanzables, 'estos botones están dentro pero tapados').toEqual([]);
  });
});

test.describe('las dos que estaban rotas por dentro', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(150_000);

  /** Una pieza dibujada por María, con sus bordes detectados por `addPiece`. */
  async function unRectangulo(page: Page) {
    await abrirApp(page);
    await addPiece(page, 'p1', { x: 120, y: 140 }, 200, 150);
    await expect.poll(async () => (await st(page)).project.pieces.length, { timeout: 5000 }).toBe(1);
  }

  /** El borde de ARRIBA de esa pieza, en coordenadas de patrón. */
  const bordeDeArriba = { x: 220, y: 140 };

  test('Pliegue: el clic deja dobleces en el patrón, y antes no dejaba nada', async ({ page }) => {
    // La medición del 05-09 dio 301 nodos SVG antes del clic y 301 después, y
    // la leímos como «nadie pinta los pliegues». El renderizador estaba bien:
    // `generatePleatFoldLines` devolvía cero líneas en CUALQUIER borde de un
    // comando, o sea los cuatro lados de un rectángulo. Este test mide las dos
    // cosas —el dato y el dibujo— porque el fallo viejo pasaba la primera.
    await unRectangulo(page);
    await dispatch(page, 'editor/setActiveTool', 'pleat');
    await dispatch(page, 'tools/setActiveTool2D', 'pleat');
    await page.waitForTimeout(300);

    // Línea base de LAS DOS cosas. `<polygon>` no es exclusivo del pliegue —lo
    // emiten también la punta del hilo, los avíos y los glifos de ancla—, así
    // que sin base el «> 0» quedaría vacío el día que la escena traiga otro.
    const antes = await page.evaluate(() => ({
      nodos: document.querySelectorAll('svg.pattern-svg *').length,
      marcas: document.querySelectorAll('svg.pattern-svg polygon').length,
    }));

    await clickAt(page, bordeDeArriba);
    await page.waitForTimeout(400);

    const despues = await page.evaluate(() => ({
      nodos: document.querySelectorAll('svg.pattern-svg *').length,
      // los triángulos de monte/valle que PieceRenderer pinta por doblez
      marcas: document.querySelectorAll('svg.pattern-svg polygon').length,
    }));
    const estado = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: { getState: () => {
        project: { pleats: unknown[]; pieces: Array<{ internals: Array<{ type: string }> }> } } } })
        .__VINA_STORE__.getState();
      return {
        pliegues: s.project.pleats.length,
        dobleces: s.project.pieces[0].internals.filter((l) => l.type === 'fold').length,
      };
    });

    expect(estado.pliegues, 'el pliegue no llegó ni al store').toBe(1);
    expect(estado.dobleces, 'el pliegue se guardó sin una sola línea de doblez').toBeGreaterThan(0);
    expect(
      despues.nodos,
      `el SVG no cambió: ${antes.nodos} nodos antes y ${despues.nodos} después`,
    ).toBeGreaterThan(antes.nodos);
    expect(
      despues.marcas,
      `las líneas están pero sin sus marcas de monte/valle (${antes.marcas} polígonos antes, ${despues.marcas} después)`,
    ).toBeGreaterThan(antes.marcas);
  });

  test('Elástico: se pone, se resalta y Supr lo quita sin llevarse la pieza', async ({ page }) => {
    // Las dos mitades de su deuda. La segunda importa tanto como la primera:
    // el Supr del elástico vive en la CAPTURA, y si se quedara el evento sin
    // tener sujeto —o si lo dejara pasar teniéndolo— borraría la pieza.
    await unRectangulo(page);
    await dispatch(page, 'editor/setActiveTool', 'elastic');
    await dispatch(page, 'tools/setActiveTool2D', 'elastic');
    await page.waitForTimeout(300);

    await clickAt(page, bordeDeArriba);
    await page.waitForTimeout(300);

    const puesto = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: { getState: () => {
        project: { elastics: unknown[]; pieces: unknown[] } } } }).__VINA_STORE__.getState();
      return { elasticos: s.project.elastics.length, piezas: s.project.pieces.length };
    });
    expect(puesto.elasticos, 'el elástico no se creó').toBe(1);

    // El resalte: antes leía un campo de Redux sin escritores y no se encendía
    // nunca. Ahora cuelga del local, así que TIENE que estar pintado.
    const resaltado = await page.evaluate(
      () => document.querySelectorAll('svg.pattern-svg [data-elastic-selected="true"], svg.pattern-svg .elastic--selected').length,
    );

    // Con la pieza SELECCIONADA. Sin esto, `deleteSelection` era un no-op pase
    // lo que pasase y el aserto de abajo pasaba igual con el `handleKeyDown` en
    // la burbuja, o sin consumir, o sin existir — o sea, sin cubrir la razón
    // entera por la que se eligió la captura.
    await dispatch(page, 'editor/selectPiece', 'p1');
    await page.waitForTimeout(200);
    await page.mouse.move(200, 300);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(400);

    const tras = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: { getState: () => {
        project: { elastics: unknown[]; pieces: unknown[] } } } }).__VINA_STORE__.getState();
      return { elasticos: s.project.elastics.length, piezas: s.project.pieces.length };
    });

    expect(tras.elasticos, 'Supr no borró el elástico').toBe(0);

    expect(tras.piezas, 'Supr se llevó la pieza además del elástico').toBe(puesto.piezas);
    // El resalte se mide después de comprobar el borrado para no bloquear lo
    // importante si el marcador cambia de nombre; si es cero, se dice.
    expect(resaltado, 'el elástico seleccionado no se resalta en el lienzo').toBeGreaterThan(0);
  });

  test('Elástico: también en el lado de cierre, que es el que no se dibujaba', async ({ page }) => {
    // El hermano del defecto del pliegue, buscado a propósito. `extractSegments`
    // compara la `Z` contra su propio índice y el productor etiqueta el tramo de
    // cierre con el de la `M`: el elástico del lado IZQUIERDO se guardaba en el
    // store y no pintaba ni un trazo.
    await unRectangulo(page);
    await dispatch(page, 'editor/setActiveTool', 'elastic');
    await dispatch(page, 'tools/setActiveTool2D', 'elastic');
    await page.waitForTimeout(300);

    await clickAt(page, { x: 120, y: 215 });   // el lado izquierdo, a media altura
    await page.waitForTimeout(400);

    const puesto = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: { getState: () => {
        project: { elastics: Array<{ edgeName: string }> } } } }).__VINA_STORE__.getState();
      return s.project.elastics.map((e) => e.edgeName);
    });
    expect(puesto, 'no se puso elástico en el lado izquierdo').toHaveLength(1);

    const trazos = await page.evaluate(
      () => document.querySelectorAll('svg.pattern-svg [data-elastic-id] path').length,
    );
    expect(
      trazos,
      `el elástico de «${puesto[0]}» está en el store y no dibuja nada`,
    ).toBeGreaterThan(0);
  });
});
