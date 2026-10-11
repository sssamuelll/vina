import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const json = (rel: string) => JSON.parse(readFileSync(rel, 'utf8'));
const hoy = json('home/datos/hoy.json') as { columnas: Entrada[]; filas: (Entrada & { mono: boolean })[] };
const enConstruccion = json('home/datos/en-construccion.json') as { id: string; texto: Texto; enlace: string; rotulo: string }[];
const diario = json('home/datos/diario.json') as { fecha: string; pr: number; texto: Texto }[];
type Texto = { en: string; es: string };
type Entrada = { id: string; titulo: Texto; texto: Texto; prueba: string[] };

const entradasHoy = [...hoy.columnas, ...hoy.filas];
const textos = (t: Texto) => [t.en, t.es];

describe('home/datos/hoy.json: cada afirmación tiene su prueba en el código', () => {
  it('tres columnas y tres filas, con id y texto en los dos idiomas', () => {
    expect(hoy.columnas.map((c) => c.id)).toEqual(['trazado', 'costura', 'caida']);
    expect(hoy.filas.map((f) => f.id)).toEqual(['lee', 'escribe', 'copiloto']);
    for (const e of entradasHoy) for (const t of [...textos(e.titulo), ...textos(e.texto)]) expect(t.trim().length).toBeGreaterThan(0);
  });
  it.each(entradasHoy.flatMap((e) => e.prueba.map((p) => [e.id, p])))('%s → %s existe', (_id, ruta) => {
    expect(existsSync(ruta as string), `${ruta} no existe: la afirmación se queda sin prueba`).toBe(true);
  });
  it('ninguna entrada se queda sin prueba', () => {
    for (const e of entradasHoy) expect(e.prueba.length, e.id).toBeGreaterThan(0);
  });
});

describe('home/datos/en-construccion.json: cada falta tiene a dónde ir', () => {
  it('seis puntos con texto en los dos idiomas', () => {
    expect(enConstruccion).toHaveLength(6);
    for (const e of enConstruccion) for (const t of textos(e.texto)) expect(t.trim().length).toBeGreaterThan(0);
  });
  it.each(enConstruccion.map((e) => [e.id, e.enlace, e.rotulo]))('%s → %s (%s)', (_id, enlace, rotulo) => {
    const issue = /^https:\/\/github\.com\/sssamuelll\/vina\/issues\/(\d+)$/.exec(enlace as string);
    const roadmap = /^https:\/\/github\.com\/sssamuelll\/vina\/blob\/main\/ROADMAP\.md#([\w-]+)$/.exec(enlace as string);
    expect(issue || roadmap, 'enlace a un issue del repo o a un ancla de ROADMAP.md').toBeTruthy();
    if (issue) expect(rotulo).toBe(`#${issue[1]}`);
    if (roadmap) {
      expect(rotulo).toBe('ROADMAP');
      const anclas = [...readFileSync('ROADMAP.md', 'utf8').matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'));
      expect(anclas, `ancla #${roadmap[1]} en ROADMAP.md`).toContain(roadmap[1]);
    }
  });
  it('no promete nada que hoy.json ya da por hecho', () => {
    const hechos = entradasHoy.flatMap((e) => textos(e.texto)).join(' ').toLowerCase();
    for (const e of enConstruccion) {
      const primera = e.texto.en.split('.')[0].toLowerCase();
      expect(hechos.includes(primera), `«${primera}» está en las dos listas`).toBe(false);
    }
  });
});

describe('home/datos/diario.json: la historia que se cuenta existe', () => {
  const historial = execSync('git log --oneline origin/main', { encoding: 'utf8' });
  it('cuatro entradas, de la más nueva a la más vieja', () => {
    expect(diario).toHaveLength(4);
    const fechas = diario.map((d) => d.fecha);
    expect([...fechas].sort().reverse()).toEqual(fechas);
    for (const d of diario) expect(d.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it.each(diario.map((d) => [d.pr, d.fecha]))('el PR #%s está en el historial', (pr) => {
    expect(new RegExp(`Merge pull request #${pr}\\b|\\(#${pr}\\)`).test(historial), `#${pr} no está en git log origin/main`).toBe(true);
  });
});
