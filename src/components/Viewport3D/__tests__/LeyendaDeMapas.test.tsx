// @vitest-environment jsdom
/**
 * La leyenda de los mapas (spec 2026-10-02 § 4.2, P5): la escala de color, la
 * tabla del mapa de ajuste, los puntos de presión y el valor del punto que se
 * inspecciona. Antes eran la mitad de `FitMapToggle`, en negro con letra blanca
 * sobre el visor; ahora son papel, como todo lo que flota. La otra mitad, los
 * cuatro botones y sus ajustes, es el menú «Mapa» (`MenuDeMapas`).
 *
 * #1010 punto 4 sigue en pie en el menú, no aquí: sin simulación no hay nada
 * que leer, así que sin simulación la leyenda no se pinta.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { startSimulation, resetSimulation, setFitMapMode, updateFitMapConfig } from '../../../store/simulationSlice';
import { DEFAULT_FIT_MAP_CONFIG, type FitMapMode, type FitMapStats } from '../../../utils/cloth/fitMaps';
import LeyendaDeMapas from '../LeyendaDeMapas';

afterEach(() => {
  cleanup();
  act(() => {
    store.dispatch(resetSimulation());
    store.dispatch(setFitMapMode('none'));
    store.dispatch(updateFitMapConfig(DEFAULT_FIT_MAP_CONFIG));
  });
});

const stats: FitMapStats = { min: 0, max: 50, mean: 25, cantWearPct: 12.5, tightPct: 30, pressurePointCount: 7 };

function montar(modo: FitMapMode, props: { stats?: FitMapStats | null; inspectedValue?: number | null } = {}, simulando = true) {
  act(() => {
    if (simulando) store.dispatch(startSimulation());
    store.dispatch(setFitMapMode(modo));
  });
  return render(<Provider store={store}><LeyendaDeMapas stats={props.stats ?? null} inspectedValue={props.inspectedValue ?? null} /></Provider>);
}

describe('LeyendaDeMapas', () => {
  it('sin simulación no hay nada que leer: no se pinta, aunque haya un mapa puesto', () => {
    const { container } = montar('stress', { stats }, false);
    expect(container.innerHTML).toBe('');
  });

  it('sin mapa puesto tampoco se pinta', () => {
    const { container } = montar('none', { stats });
    expect(container.innerHTML).toBe('');
  });

  it('es papel, y se declara a sí misma: la raíz lleva material y superficie', () => {
    const { container } = montar('stress', { stats });
    const raiz = container.firstElementChild!;
    expect(raiz.getAttribute('data-material')).toBe('papel');
    expect(raiz.getAttribute('data-superficie')).toBe('leyenda');
  });

  it('tensión: la escala va de 0 al tope en kPa, con el máximo y el promedio de la malla', () => {
    const { container, getByText } = montar('stress', { stats });
    expect(container.querySelector('.leyenda-de-mapas__escala')).not.toBeNull();
    expect(getByText('100 kPa')).toBeTruthy();
    expect(getByText('0 kPa')).toBeTruthy();
    expect(getByText('máx. 50.0 kPa')).toBeTruthy();
    expect(getByText('prom. 25.0 kPa')).toBeTruthy();
  });

  it('los topes de la escala son los de la configuración, no los de fábrica', () => {
    act(() => { store.dispatch(updateFitMapConfig({ stressRange: [10, 250] })); });
    const { getByText } = montar('stress', { stats });
    expect(getByText('250 kPa')).toBeTruthy();
    expect(getByText('10 kPa')).toBeTruthy();
  });

  it('estiramiento: la escala va en porcentaje', () => {
    const { getByText } = montar('strain', { stats });
    expect(getByText('120%')).toBeTruthy();
    expect(getByText('100%')).toBeTruthy();
    expect(getByText('máx. 50.0%')).toBeTruthy();
  });

  it('ajuste: la tabla da los tres porcentajes y suman 100', () => {
    const { container, getByText } = montar('fit', { stats });
    expect(container.querySelector('.leyenda-de-mapas__escala'), 'el ajuste no tiene escala continua').toBeNull();
    expect(getByText('Mapa de ajuste')).toBeTruthy();
    expect(getByText('12.5%')).toBeTruthy();
    expect(getByText('30.0%')).toBeTruthy();
    expect(getByText('57.5%')).toBeTruthy();
    for (const nombre of ['No entra', 'Apretado', 'Bien']) expect(getByText(nombre)).toBeTruthy();
  });

  it('ajuste sin estadísticas todavía: no hay tabla', () => {
    const { container } = montar('fit', { stats: null });
    expect(container.innerHTML).toBe('');
  });

  it('los cuadritos de la tabla son DATO, con línea de pelo: el «Bien» blanco se ve sobre el papel', () => {
    const { container } = montar('fit', { stats });
    const muestras = [...container.querySelectorAll<HTMLElement>('.leyenda-de-mapas__muestra')];
    expect(muestras.map((m) => m.style.backgroundColor)).toEqual(['rgb(255, 0, 0)', 'rgb(255, 255, 0)', 'rgb(255, 255, 255)']);
  });

  it('presión: la leyenda cuenta los puntos de contacto', () => {
    const { getByText } = montar('pressure', { stats });
    expect(getByText('Puntos de presión')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
  });

  it.each<[FitMapMode, number, string]>([
    ['stress', 12.5, '12.50 kPa'],
    ['strain', 7.54, '7.5%'],
    ['fit', 0.4321, '43.2%'],
    ['pressure', 0.9, 'Contacto'],
    ['pressure', 0.1, 'Sin contacto'],
  ])('el valor del punto inspeccionado en «%s» (%d) se lee «%s»', (modo, valor, texto) => {
    const { getByText } = montar(modo, { stats, inspectedValue: valor });
    expect(getByText(texto)).toBeTruthy();
  });

  it('un clic que no cayó sobre la prenda (sin valor) no dibuja nada', () => {
    const { container } = montar('pressure', { stats: null, inspectedValue: null });
    expect(container.innerHTML).toBe('');
  });
});

describe('LeyendaDeMapas no trae el material oscuro de antes', () => {
  // Negro con letra blanca sobre el visor, que desde P5 es papel. Los cuadritos
  // de la tabla (#ff0000, #ffff00, #ffffff) y las ocho paradas de la escala son
  // el color del dato, y se quedan: el `\b` deja pasar «#ffffff» y no «#fff».
  const OSCURO = /#fff\b|#bbb\b|#ccc\b|#333\b|#444\b|#555\b|#666\b|rgba\(\s*(30|0)\s*,\s*(30|0)\s*,\s*(30|0)/i;
  it.each([
    'src/components/Viewport3D/LeyendaDeMapas.tsx',
    'src/components/Viewport3D/LeyendaDeMapas.css',
    'src/components/Viewport3D/MenuDeMapas.tsx',
    'src/components/Viewport3D/MenuDeMapas.css',
  ])('%s usa tokens, no el gris ni la letra blanca de la barra oscura', (ruta) => {
    const src = readFileSync(join(process.cwd(), ruta), 'utf8');
    expect(src.match(OSCURO)?.[0] ?? null, `quedó ${src.match(OSCURO)?.[0]} en ${ruta}`).toBeNull();
  });
});

describe('LeyendaDeMapas ▸ la escala va de arriba (tope, rojo) a abajo (piso, azul)', () => {
  it('el tope arriba, el piso abajo, y el gradiente empieza en rojo', () => {
    const { container } = montar('stress', { stats });
    const marcas = [...container.querySelectorAll('.leyenda-de-mapas__marca')].map((e) => e.textContent);
    expect(marcas).toEqual(['100 kPa', '0 kPa']);
    const barra = container.querySelector<HTMLElement>('.leyenda-de-mapas__barra')!;
    const fondo = barra.style.backgroundImage || barra.style.background || barra.getAttribute('style') || '';
    const rojo = fondo.search(/#ff0000|rgb\(255, ?0, ?0\)/i);
    const azul = fondo.search(/#0000ff|rgb\(0, ?0, ?255\)/i);
    expect(rojo, `el gradiente no se lee: «${fondo}»`).toBeGreaterThanOrEqual(0);
    expect(rojo).toBeLessThan(azul);
  });
});

describe('LeyendaDeMapas ▸ se lee sobre cualquier fondo del visor', () => {
  // El fondo «Sólido» puede ser oscuro. La tabla y el valor llevan su hoja de papel; las marcas de
  // la escala vertical iban sueltas sobre la escena, con tinta de papel: sobre #222 daban 1,05:1 y no
  // se leían (revisión final de P5, A8). Antes eran blancas con halo negro.
  const css = readFileSync(join(process.cwd(), 'src/components/Viewport3D/LeyendaDeMapas.css'), 'utf8');
  const regla = (selector: string) =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((m) => m[1].split(',').map((x) => x.trim()).includes(selector))
      .map((m) => m[2].replace(/\s+/g, ' ').trim())
      .join(' ');

  it.each(['.leyenda-de-mapas__marca', '.leyenda-de-mapas__extremos'])('«%s» lleva su propia hoja, no la escena de detrás', (selector) => {
    expect(regla(selector), `${selector} se pinta directo sobre la escena`).toContain('background: var(--surface-overlay-bg)');
  });

  it('los extremos no se atenúan con `opacity`: sobre su hoja bajarían el contraste de la tinta', () => {
    expect(regla('.leyenda-de-mapas__extremos')).not.toContain('opacity');
  });
});
