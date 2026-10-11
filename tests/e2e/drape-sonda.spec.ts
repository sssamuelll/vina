/**
 * La sonda del drape (2026-10-11). Samuel, en su PC con Chrome: «no es estable,
 * se siente buggy, la tela no está tocando el suelo y se reinicia». Este spec
 * hace el gesto de María con la interfaz de verdad —el DXF, coser, 3D,
 * «Simular», pausa y reanudar— y deja la línea de tiempo entera en disco:
 *
 *  - una muestra cada 250 ms del estado de la simulación y de la malla (tier,
 *    cuadros, `armAxis`, minY/maxY/avgY, NaN, cuántas geometrías distintas);
 *  - cada ventana de 30 cuadros que publica el solver (`frameTimeMs`), con su
 *    instante: el avance de la física contra el reloj de pared;
 *  - los intervalos de `requestAnimationFrame` (la fluidez que ve el ojo) y las
 *    tareas largas del hilo principal;
 *  - la bitácora y los eventos del solver, por la puerta de María (Exportar
 *    diagnóstico), con el reloj alineado al de las muestras.
 *
 * Corre con GPU real (config webgpu, headed) y contra el build:
 *   npm run build && VINA_E2E_BUILD=1 VINA_E2E_PORT=5187 \
 *     npx playwright test --config playwright.webgpu.config.ts drape-sonda
 * La evidencia queda en `.tmp/sonda-drape/<instante>/`.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirAppVacia, cargarDxfDeMaria, cambiarVista, abrirPaleta } from './helpers/estados';
import { exportBundle } from './helpers/diagnostico';

/** `SONDA_TIER=wasm` apaga WebGPU: lo que ve quien abre Vina en un equipo sin él. */
const TIER = process.env.SONDA_TIER === 'wasm' ? 'wasm' : 'webgpu';

/**
 * Lo que la sonda espera en 3D, con la simulación parada, antes de «Simular».
 * El preparador arranca 600 ms después de entrar y a la camisa de María le
 * toma unos 4 s: con 8 s se mide el arranque preparado, el del criterio 1 de
 * la spec.
 */
const PREPARAR_MS = Number(process.env.SONDA_PREPARAR_MS ?? 8000);

const SALIDA = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.tmp/sonda-drape',
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${TIER}`,
);

interface Muestra {
  t: number;
  estado: string;
  tier: string;
  frameMs: number;
  particulas: number;
  cuerpo: boolean;
  brazos: boolean | null;
  vista3d: string;
  geometrias: number;
  n: number;
  minY: number | null;
  maxY: number | null;
  avgY: number | null;
  nan: number;
}

interface Sonda {
  /** `Date.now() - performance.now()` al instalarse: alinea la bitácora con las muestras. */
  origen: number;
  raf: number[];
  largas: Array<{ t: number; ms: number }>;
  muestras: Muestra[];
  ventanas: Array<{ t: number; ms: number }>;
  /** Cuándo el estado al pie dijo «Simulando» por primera vez tras el clic. */
  simulando?: number;
}

/** Se instala antes que la app: nada de lo que pasa al arrancar se pierde. */
function instalarSonda(page: Page) {
  return page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const sonda = {
      origen: Date.now() - performance.now(),
      raf: [] as number[],
      largas: [] as Array<{ t: number; ms: number }>,
      muestras: [] as unknown[],
      ventanas: [] as Array<{ t: number; ms: number }>,
    };
    w.__SONDA__ = sonda;
    const tick = (t: number) => {
      if (sonda.raf.length < 60_000) sonda.raf.push(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      new PerformanceObserver((lista) => {
        for (const e of lista.getEntries()) sonda.largas.push({ t: e.startTime, ms: e.duration });
      }).observe({ entryTypes: ['longtask'] });
    } catch { /* sin longtask: la sonda sigue */ }

    type Store = {
      getState: () => { simulation: Record<string, unknown> & { armAxis?: { ready: boolean } } };
      subscribe: (f: () => void) => void;
    };
    let suscrita = false;
    let geoPrevia: unknown = null;
    let geometrias = 0;
    setInterval(() => {
      const store = w.__VINA_STORE__ as Store | undefined;
      if (!store) return;
      if (!suscrita) {
        suscrita = true;
        let ultimo = store.getState().simulation.frameTimeMs;
        store.subscribe(() => {
          const v = store.getState().simulation.frameTimeMs;
          if (v !== ultimo) {
            ultimo = v;
            if (typeof v === 'number' && v > 0) sonda.ventanas.push({ t: performance.now(), ms: v });
          }
        });
      }
      const s = store.getState().simulation;
      const malla = w.__VINA_CLOTH_MESH__ as
        | { geometry?: { attributes: { position: { count: number; array: ArrayLike<number> } } } }
        | undefined;
      let n = 0, nan = 0, minY: number | null = null, maxY: number | null = null, avgY: number | null = null;
      if (malla?.geometry) {
        if (malla.geometry !== geoPrevia) { geoPrevia = malla.geometry; geometrias++; }
        const pos = malla.geometry.attributes.position;
        n = pos.count;
        let lo = Infinity, hi = -Infinity, suma = 0, validos = 0;
        for (let i = 0; i < n; i++) {
          const y = pos.array[i * 3 + 1];
          if (!Number.isFinite(y)) { nan++; continue; }
          if (y < lo) lo = y;
          if (y > hi) hi = y;
          suma += y;
          validos++;
        }
        if (validos > 0) { minY = lo; maxY = hi; avgY = suma / validos; }
      }
      sonda.muestras.push({
        t: performance.now(),
        estado: String(s.simulationState),
        tier: String(s.solverTier),
        frameMs: Number(s.frameTimeMs),
        particulas: Number(s.particleCount ?? 0),
        cuerpo: Boolean(s.bodyCollision),
        brazos: s.armAxis ? Boolean(s.armAxis.ready) : null,
        vista3d: String(s.viewMode3D),
        geometrias,
        n, minY, maxY, avgY, nan,
      });
    }, 250);
  });
}

const leerSonda = (page: Page) => page.evaluate(() => (window as unknown as { __SONDA__: Sonda }).__SONDA__);

interface Perfil {
  ms: number;
  /** Tiempo propio por función (`nombre archivo:línea`), de mayor a menor. */
  funciones: Array<{ donde: string; ms: number }>;
  /** Tiempo propio por archivo. */
  archivos: Array<{ archivo: string; ms: number }>;
}

/** Perfil de CPU del hilo principal (CDP) durante `ms`, resumido por tiempo propio. */
async function perfilar(page: Page, ms: number): Promise<Perfil> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(ms);
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.detach();
  const nodos = new Map(profile.nodes.map((n) => [n.id, n]));
  const propio = new Map<number, number>();
  const muestras = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < muestras.length; i++) {
    propio.set(muestras[i], (propio.get(muestras[i]) ?? 0) + (deltas[i] ?? 0) / 1000);
  }
  const porFuncion = new Map<string, number>();
  const porArchivo = new Map<string, number>();
  for (const [id, t] of propio) {
    const cf = nodos.get(id)!.callFrame;
    const archivo = cf.url ? cf.url.replace(/^.*\//, '').replace(/\?.*$/, '') : `(${cf.functionName || 'nativo'})`;
    const donde = `${cf.functionName || '(anónima)'} ${archivo}:${cf.lineNumber + 1}`;
    porFuncion.set(donde, (porFuncion.get(donde) ?? 0) + t);
    porArchivo.set(archivo, (porArchivo.get(archivo) ?? 0) + t);
  }
  const orden = <K>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    ms,
    funciones: orden(porFuncion).slice(0, 40).map(([donde, t]) => ({ donde, ms: Math.round(t) })),
    archivos: orden(porArchivo).slice(0, 20).map(([archivo, t]) => ({ archivo, ms: Math.round(t) })),
  };
}

/** El botón del margen del 3D, como lo pulsa María. */
const pulsarSimular = (page: Page) => page.getByRole('button', { name: 'Simular', exact: true }).click();

function percentil(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const o = [...xs].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor((p / 100) * o.length))];
}

/** Intervalos de rAF dentro de [desde, hasta) — la fluidez de ese tramo. */
function fluidez(raf: number[], desde: number, hasta: number) {
  const dts: number[] = [];
  for (let i = 1; i < raf.length; i++) {
    if (raf[i - 1] >= desde && raf[i] < hasta) dts.push(raf[i] - raf[i - 1]);
  }
  return {
    cuadros: dts.length,
    fps: dts.length ? 1000 / (dts.reduce((a, b) => a + b, 0) / dts.length) : 0,
    p50: percentil(dts, 50),
    p95: percentil(dts, 95),
    max: dts.length ? Math.max(...dts) : NaN,
    tirones: dts.filter((d) => d > 50).length,
    congelados: dts.filter((d) => d > 250).length,
  };
}

// El Chrome instalado, no el Chromium de Playwright: el navegador de Samuel.
test.use({ channel: 'chrome', viewport: { width: 1920, height: 1080 } });

test.describe('Sonda del drape @gpu-local', () => {
  test('el gesto de María: coser, simular, pausar y reanudar', async ({ page }) => {
    test.setTimeout(300_000);
    mkdirSync(SALIDA, { recursive: true });
    const marcas: Record<string, number> = {};
    const marcar = async (nombre: string) => {
      marcas[nombre] = await page.evaluate(() => performance.now());
    };
    const foto = (nombre: string) => page.screenshot({ path: path.join(SALIDA, `${nombre}.png`) });

    await instalarSonda(page);
    if (TIER === 'wasm') await page.addInitScript(() => localStorage.setItem('vina-use-webgpu', 'false'));
    // La consola entera, con su instante: el solver cuenta ahí sus fases de
    // arranque y sus colores, y eso no pasa por la bitácora (solo warn/error).
    const t0 = Date.now();
    const consola: string[] = [];
    page.on('console', (m) => consola.push(`${String(Date.now() - t0).padStart(7)}ms ${m.type().padEnd(7)} ${m.text().slice(0, 400)}`));
    await abrirAppVacia(page);
    await cargarDxfDeMaria(page);

    await abrirPaleta(page);
    await page.locator('.unified-bar__panel').getByText('Coser piezas automáticamente', { exact: true }).first().click();
    await expect
      .poll(() => page.evaluate(() => {
        const st = (window as unknown as { __VINA_STORE__: { getState: () => { project: { seams: unknown[] } } } }).__VINA_STORE__;
        return st.getState().project.seams.length;
      }), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(6);
    await page.keyboard.press('Escape');

    await marcar('vista3d');
    await cambiarVista(page, '3D');
    await page.waitForTimeout(PREPARAR_MS);
    await foto('0-antes-de-simular');

    // El estado al pie, mirado cuadro a cuadro desde antes del clic: el instante en
    // que deja «Preparando la tela» y dice «Simulando». Lo mira la página, no el
    // test: el gesto no espera y las marcas no se mueven.
    await page.evaluate(() => {
      const sonda = (window as unknown as { __SONDA__: Sonda }).__SONDA__;
      const mirar = () => {
        if (document.querySelector('button[aria-label^="Estado de la simulación: Simulando"]')) sonda.simulando = performance.now();
        else requestAnimationFrame(mirar);
      };
      requestAnimationFrame(mirar);
    });
    await marcar('simular');
    await pulsarSimular(page);
    let anterior = 0;
    let perfil: Perfil | null = null;
    for (const s of [3, 8, 15, 30, 45]) {
      await page.waitForTimeout((s - anterior) * 1000);
      anterior = s;
      await foto(`1-simulando-${String(s).padStart(2, '0')}s`);
      // Del 15 al 20: cinco segundos de perfil de CPU del hilo principal, con la
      // tela ya en marcha. El perfilador pesa algo: ese tramo se marca aparte.
      if (s === 15) {
        await marcar('perfil');
        perfil = await perfilar(page, 5000);
        await marcar('perfilFin');
        anterior += 5;
      }
      // Del 30 en adelante: girar la cámara con el botón derecho mientras la
      // tela cae, como mira María la prenda. Cada movimiento del ratón sobre el
      // lienzo es un evento de puntero que r3f reparte entre lo que escucha.
      if (s === 30) {
        await marcar('orbita');
        await page.mouse.move(800, 540);
        await page.mouse.down({ button: 'right' });
        for (let i = 0; i < 120; i++) {
          await page.mouse.move(800 + Math.round(300 * Math.sin(i / 19)), 540 + Math.round(60 * Math.sin(i / 7)));
          await page.waitForTimeout(16);
        }
        await page.mouse.up({ button: 'right' });
        await marcar('orbitaFin');
      }
    }

    await marcar('pausa');
    await pulsarSimular(page);
    await page.waitForTimeout(4000);
    await foto('2-en-pausa');

    await marcar('reanudar');
    await pulsarSimular(page);
    await page.waitForTimeout(3000);
    await foto('3-reanudada-03s');
    await page.waitForTimeout(17_000);
    await foto('3-reanudada-20s');

    // Espacio, la tecla que anuncia el botón («Simular · espacio»), con el foco
    // en el lienzo como lo dejaría María: primero lo que hace con la tela en
    // marcha, después otra vez.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await marcar('espacio1');
    await page.keyboard.press(' ');
    await page.waitForTimeout(4000);
    await foto('4-espacio-1');
    await marcar('espacio2');
    await page.keyboard.press(' ');
    await page.waitForTimeout(6000);
    await foto('4-espacio-2');
    await marcar('fin');

    // La vista 2D con la simulación en marcha: el visor 3D se oculta con
    // `display: none` y no se desmonta. ¿Sigue renderizando y simulando detrás
    // del patrón? El perfil lo dice: si three.js aparece, el 2D paga el 3D.
    await cambiarVista(page, '2D');
    await page.waitForTimeout(1500);
    await marcar('vista2d');
    const perfil2d = await perfilar(page, 4000);
    await marcar('vista2dFin');

    const sonda = await leerSonda(page);
    const bundle = (await exportBundle(page)) as {
      journal?: { events?: Array<{ t: number; kind: string; name: string; data?: unknown; n?: number }> };
      solver?: { events?: Array<{ kind: string; timestamp: number; generation: number; data: Record<string, unknown> }> };
    };

    // La bitácora en el reloj de las muestras (ms desde que cargó la página).
    const enSonda = (tEpoch: number) => Math.round(tEpoch - sonda.origen);
    const eventosSolver = (bundle.solver?.events ?? []).map((e) => ({ ...e, t: enSonda(e.timestamp) }));
    const bitacora = (bundle.journal?.events ?? [])
      .filter((e) => e.kind !== 'console' || /warn|error/.test(e.name))
      .map((e) => ({ ...e, t: enSonda(e.t) }));

    const tramos = {
      simulando: fluidez(sonda.raf, marcas.simular, marcas.perfil),
      perfilado: fluidez(sonda.raf, marcas.perfil, marcas.perfilFin),
      simulandoTarde: fluidez(sonda.raf, marcas.perfilFin, marcas.orbita),
      orbita: fluidez(sonda.raf, marcas.orbita, marcas.orbitaFin),
      simulandoFinal: fluidez(sonda.raf, marcas.orbitaFin, marcas.pausa),
      pausa: fluidez(sonda.raf, marcas.pausa, marcas.reanudar),
      reanudada: fluidez(sonda.raf, marcas.reanudar, marcas.espacio1),
      espacio: fluidez(sonda.raf, marcas.espacio1, marcas.fin),
      vista2d: fluidez(sonda.raf, marcas.vista2d, marcas.vista2dFin),
    };
    const arranques = eventosSolver.filter((e) => e.kind === 'cascade:start');
    const primeraVentana = sonda.ventanas.find((v) => v.t > marcas.simular);
    // Del clic, por el instante del evento: su `data.ms` cuenta desde el
    // `cascade:start`, que llega después de mallar.
    const primerCuadro = eventosSolver.find((e) => e.kind === 'tela:primer-cuadro' && e.t >= marcas.simular);
    // Por fase, lo último que dejó el preparador antes del clic (el ring guarda el
    // orden): un `listo` que después falló no cuenta como preparado.
    const preparado = new Map<unknown, Record<string, unknown>>();
    for (const e of eventosSolver) {
      if ((e.kind === 'preparar:listo' || e.kind === 'preparar:fallo') && e.t < marcas.simular) {
        preparado.set(e.data.fase, { fase: e.data.fase, kind: e.kind, ...e.data });
      }
    }
    const usado = eventosSolver.filter((e) => e.kind === 'preparar:usada' && e.t >= marcas.simular).map((e) => e.data);
    const resumen = {
      marcas,
      tramos,
      arranques: arranques.map((e) => ({ t: e.t, generation: e.generation })),
      tiers: eventosSolver.filter((e) => e.kind.startsWith('tier:')).map((e) => ({ t: e.t, kind: e.kind, ...e.data })),
      primerCuadroTrasSimularMs: primeraVentana ? Math.round(primeraVentana.t - marcas.simular) : null,
      clicAPrimerCuadroMs: primerCuadro ? Math.round(primerCuadro.t - marcas.simular) : null,
      clicAEstadoSimulandoMs:
        sonda.simulando !== undefined && sonda.simulando < marcas.pausa ? Math.round(sonda.simulando - marcas.simular) : null,
      preparadoAntesDelClic: [...preparado.values()],
      usadoDeLoPreparado: usado,
      ventanasSimulando: sonda.ventanas.filter((v) => v.t >= marcas.simular && v.t < marcas.pausa).length,
      ventanasReanudada: sonda.ventanas.filter((v) => v.t >= marcas.reanudar && v.t < marcas.fin).length,
      tareasLargas: sonda.largas.filter((l) => l.t >= marcas.simular).map((l) => ({ t: Math.round(l.t), ms: Math.round(l.ms) })),
      // Del clic al perfil: el criterio 2 mide la app, no el perfilador, la órbita, Espacio ni el 2D de la sonda.
      tareasDeMasDe100ms: sonda.largas.filter((l) => l.t >= marcas.simular && l.t < marcas.perfil && l.ms > 100).length,
      // Sin aserción: aquí corre el preparador, pero también el visor 3D al despertar.
      tareasLargasAntesDelClic: sonda.largas
        .filter((l) => l.t >= marcas.vista3d && l.t < marcas.simular)
        .map((l) => ({ t: Math.round(l.t), ms: Math.round(l.ms) })),
      geometrias: sonda.muestras.at(-1)?.geometrias,
      ventanasEnVista2d: sonda.ventanas.filter((v) => v.t >= marcas.vista2d && v.t < marcas.vista2dFin).length,
      perfil,
      perfil2d,
    };

    writeFileSync(path.join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 1));
    writeFileSync(path.join(SALIDA, 'muestras.json'), JSON.stringify(sonda.muestras));
    writeFileSync(path.join(SALIDA, 'ventanas.json'), JSON.stringify(sonda.ventanas));
    writeFileSync(path.join(SALIDA, 'raf.json'), JSON.stringify(sonda.raf));
    writeFileSync(path.join(SALIDA, 'solver.json'), JSON.stringify(eventosSolver, null, 1));
    writeFileSync(path.join(SALIDA, 'consola.txt'), consola.join('\n') + '\n');
    writeFileSync(
      path.join(SALIDA, 'bitacora.txt'),
      bitacora
        .filter((e) => e.t >= marcas.simular - 2000)
        .map((e) => `${String(e.t).padStart(7)}ms ${e.kind.padEnd(8)} ${e.name}${e.n && e.n > 1 ? ` ×${e.n}` : ''}${e.data ? ' ' + JSON.stringify(e.data) : ''}`)
        .join('\n') + '\n',
    );
    console.log(`[sonda-drape] ${SALIDA}\n${JSON.stringify({
      ...resumen,
      tareasLargas: resumen.tareasLargas.length,
      perfil: perfil?.archivos.slice(0, 8),
    }, null, 1)}`);

    // Lo que Samuel pidió que no pasara, medido el 2026-10-11 contra producción
    // (4 cascadas en este gesto, Espacio restablecía) y en verde tras los
    // arreglos. Las cifras de fluidez quedan en el log: dependen de la máquina.
    expect(resumen.arranques, 'un «Simular» es una sola cascada: pausar, reanudar y Espacio no vuelven a vestir').toHaveLength(1);
    const ventanasEnPausa = sonda.ventanas.filter((v) => v.t >= marcas.pausa + 250 && v.t < marcas.reanudar).length;
    expect(ventanasEnPausa, 'en pausa la tela no avanza').toBe(0);
    const desdeElPrimerCuadro = primeraVentana?.t ?? marcas.simular;
    const trasSimular = sonda.muestras.filter((m) => m.t >= desdeElPrimerCuadro && m.t < marcas.vista2d);
    expect(trasSimular.some((m) => m.estado === 'idle'), 'nada la restablece por su cuenta').toBe(false);
    const enEspacio1 = sonda.muestras.filter((m) => m.t >= marcas.espacio1 + 500 && m.t < marcas.espacio2);
    expect(enEspacio1.length > 0 && enEspacio1.every((m) => m.estado === 'paused'), 'Espacio pausa, como el botón').toBe(true);
    if (TIER === 'webgpu') {
      // WebGPU avisa `tier:selected` antes de armarse: si después falla y cae a WASM,
      // el último elegido es el motor que midió la sonda.
      const elegido = eventosSolver.filter((e) => e.kind === 'tier:selected' && e.t >= marcas.simular).at(-1);
      expect(elegido?.data.tier, 'la corrida es de WebGPU: con una caída a WASM la medida no dice nada').toBe('webgpu');
      // Solo aquí se comprueba que la ruta GPU avisa su primer cuadro al estado: el gate corre en WASM.
      expect(resumen.clicAEstadoSimulandoMs, 'con WebGPU, el primer cuadro pasa el estado de «Preparando la tela» a «Simulando»').not.toBeNull();
    }
  });
});
