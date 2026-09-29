#!/usr/bin/env node
/**
 * DXF de María → home/img/patron.svg (el patrón del hero de la home).
 * Determinista: mismo DXF, mismo SVG byte a byte (tests/repo/home-patron.test.ts
 * lo compara con el commiteado). Spec: docs/superpowers/specs/2026-09-28-homepage-design.md
 * § 5.1 y su enmienda del 2026-09-29: sin línea de costura (el contorno ES la de
 * corte), sin pinza (el DXF no tiene), rótulos solo con lo que los datos sostienen.
 *
 *   npx tsx scripts/home/dxf-a-svg.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importDXFContent } from '../../src/utils/dxf/importPipeline.ts';

const W = 720, H = 540, MARGEN = 24, HUECO = 32, ALTO_COTA = 44, ALTO_ROTULO = 28;
const f = (n) => (Math.round(n * 10) / 10).toString();

const puntos = (outline) => outline.flatMap((c) => {
  const p = []; for (let i = 0; i < c.values.length; i += 2) p.push([c.values[i], c.values[i + 1]]); return p;
});
const caja = (pts) => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};

/** Profundidad del escote: cuánto baja el borde de arriba en el tercio central.
 *  El delantero es el de escote más hondo. En coordenadas del importador
 *  (y hacia abajo en pantalla = y mayor). Verificar a ojo en Step 4. */
function escote(pieza) {
  const pts = puntos(pieza.outline), c = caja(pts);
  const ancho = c.x1 - c.x0, cx = (c.x0 + c.x1) / 2;
  const centro = pts.filter(([x]) => Math.abs(x - cx) < ancho / 6);
  return Math.min(...centro.map(([, y]) => y)) - c.y0;
}

export function generarPatronSvg(dxfTexto) {
  const { pieces, format } = importDXFContent(dxfTexto);
  const grandes = pieces.filter((p) => { const c = caja(puntos(p.outline)); return c.y1 - c.y0 > 500; });
  const delantero = [...grandes].sort((a, b) => escote(b) - escote(a))[0];
  const mangas = pieces.filter((p) => { const c = caja(puntos(p.outline)); return Math.abs((c.x1 - c.x0) - 381) < 20; });
  const manga = [...mangas].sort((a, b) => a.name.localeCompare(b.name))[0];

  const cd = caja(puntos(delantero.outline)), cm = caja(puntos(manga.outline));
  const s = Math.min(
    (W - 2 * MARGEN - HUECO) / ((cd.x1 - cd.x0) + (cm.x1 - cm.x0)),
    (H - ALTO_ROTULO - ALTO_COTA - MARGEN) / (cd.y1 - cd.y0),
  );
  const oy = ALTO_ROTULO + 8;
  const tD = ([x, y]) => [MARGEN + (x - cd.x0) * s, oy + (y - cd.y0) * s];
  const mx = MARGEN + (cd.x1 - cd.x0) * s + HUECO;
  const tM = ([x, y]) => [mx + (x - cm.x0) * s, oy + (y - cm.y0) * s];

  const d = (outline, t) => outline.map((c) => {
    if (c.type === 'Z') return 'Z';
    const [x, y] = t([c.values[0], c.values[1]]); return `${c.type}${f(x)} ${f(y)}`;
  }).join(' ');
  // internals[].path son comandos {type:'M'|'L', values:[x, y]} (medido 2026-09-29).
  const lineas = (pieza, t, tipo) => pieza.internals.filter((l) => l.type === tipo)
    .map((l) => { const [a, b] = [t(l.path[0].values), t(l.path[1].values)];
      return `<path class="${tipo}" d="M${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])}"/>`; }).join('');

  // Dobladillo: el borde de abajo del delantero (puntos a ≤ 1 mm del y máximo).
  const bajos = puntos(delantero.outline).filter(([, y]) => cd.y1 - y <= 1);
  const dobladilloMm = Math.round(Math.max(...bajos.map((p) => p[0])) - Math.min(...bajos.map((p) => p[0])));
  const [hx0] = tD([Math.min(...bajos.map((p) => p[0])), cd.y1]);
  const [hx1, hy] = tD([Math.max(...bajos.map((p) => p[0])), cd.y1]);
  const yc = hy + 22;

  const archivo = `${delantero.name.replace(/-\d+$/, '')} · ${(format ?? 'dxf').toUpperCase()} · mm`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="patron" role="img" aria-label="El delantero y la manga del patrón de una camiseta, trazados en tinta, con la medida del dobladillo: ${dobladilloMm} milímetros">`,
    `<rect class="marcador" x="${MARGEN}" y="4" width="${f(archivo.length * 7)}" height="14"/>`,
    `<text class="rotulo" x="${MARGEN}" y="15">${archivo}</text>`,
    `<path class="pieza" data-pieza="${delantero.name}" d="${d(delantero.outline, tD)}"/>`,
    `<path class="pieza" data-pieza="${manga.name}" d="${d(manga.outline, tM)}"/>`,
    lineas(delantero, tD, 'grainline'), lineas(manga, tM, 'grainline'),
    lineas(delantero, tD, 'notch'), lineas(manga, tM, 'notch'),
    // Centrado en el eje de la pieza: a x = MARGEN + 24 pisaba la sisa (visto en Step 4).
    `<text class="rotulo" x="${f(MARGEN + 0.5 * (cd.x1 - cd.x0) * s)}" y="${f(oy + 0.2 * (cd.y1 - cd.y0) * s)}" text-anchor="middle">DELANTERO · ×1</text>`,
    `<text class="rotulo" x="${f(mx + 24)}" y="${f(oy + 0.5 * (cm.y1 - cm.y0) * s)}">MANGA · ×2</text>`,
    `<g class="cota"><path d="M${f(hx0)} ${f(yc)} H${f(hx1)} M${f(hx0)} ${f(yc - 6)} v12 M${f(hx1)} ${f(yc - 6)} v12"/>`,
    `<rect x="${f((hx0 + hx1) / 2 - 70)}" y="${f(yc + 6)}" width="140" height="22" rx="3"/>`,
    `<text x="${f((hx0 + hx1) / 2)}" y="${f(yc + 21)}" text-anchor="middle">${dobladilloMm} mm · dobladillo</text></g>`,
    `</svg>`,
  ].join('\n') + '\n';
  return { svg, dobladilloMm };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dxf = readFileSync('tests/fixtures/garments/maria_patrones_samuel_2M.dxf', 'utf8');
  const { svg, dobladilloMm } = generarPatronSvg(dxf);
  writeFileSync('home/img/patron.svg', svg);
  console.log(`home/img/patron.svg · dobladillo ${dobladilloMm} mm`);
}
