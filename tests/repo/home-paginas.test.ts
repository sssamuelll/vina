import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — módulo .mjs sin tipos
import { generarPagina, PAGINAS } from '../../scripts/home/paginas.mjs';

const en = JSON.parse(readFileSync('home/copy/en.json', 'utf8')) as Record<string, string>;
const es = JSON.parse(readFileSync('home/copy/es.json', 'utf8')) as Record<string, string>;

describe('el copy de la home', () => {
  it('los dos idiomas tienen exactamente las mismas claves', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
  it('sin exclamaciones ni «AI-powered»', () => {
    for (const [k, v] of [...Object.entries(en), ...Object.entries(es)]) {
      expect(v, k).not.toMatch(/[!¡]/);
      expect(v.toLowerCase(), k).not.toContain('ai-powered');
    }
  });
  it('el H1 y la descripción son los del spec', () => {
    expect(en.h1).toBe('Draft the pattern, watch it drape.');
    expect(es.h1).toBe('Traza el patrón, mira la caída.');
    for (const d of [en.descripcion, es.descripcion]) {
      expect([...d].length).toBeGreaterThanOrEqual(120);
      expect([...d].length).toBeLessThanOrEqual(150);
    }
  });
});

describe.each(Object.keys(PAGINAS) as ('en' | 'es')[])('la página %s', (idioma) => {
  const html = generarPagina(idioma);
  const salida = (PAGINAS as Record<string, { salida: string; raiz: string; url: string }>)[idioma];
  it('el fichero commiteado es el generado', () => expect(readFileSync(salida.salida, 'utf8')).toBe(html));
  it('no queda ninguna marca sin sustituir', () => expect(html).not.toMatch(/\{\{[#/]?\w+\}\}/));
  it('lleva su lang, su canonical y las tres alternativas', () => {
    expect(html).toContain(`<html lang="${idioma}">`);
    expect(html).toContain(`<link rel="canonical" href="${salida.url}">`);
    expect(html).toContain('hreflang="en" href="https://vina.sdar.dev/"');
    expect(html).toContain('hreflang="es" href="https://vina.sdar.dev/es/"');
    expect(html).toContain('hreflang="x-default" href="https://vina.sdar.dev/"');
  });
  it('incluye el SVG de su idioma y los activos con la raíz correcta', () => {
    expect(html).toContain(`<!-- incluir: home/img/patron.${idioma}.svg -->`);
    expect(html).toContain(`href="${salida.raiz}home/home.css"`);
    expect(html).toContain(`src="${salida.raiz}home/img/logo.svg"`);
    expect(html).not.toContain(idioma === 'es' ? 'src="./home/' : 'src="../home/');
  });
  it('los dos botones de oferta abren el correo con el asunto', () => {
    const asunto = idioma === 'en' ? 'A%20pattern%20for%20Vina' : 'Un%20patr%C3%B3n%20para%20Vina';
    expect(html.match(new RegExp(`href="mailto:contact@sdar\\.dev\\?subject=${asunto}"`, 'g'))).toHaveLength(2);
  });
  it('tiene los cuatro bloques y las listas enteras', () => {
    for (const id of ['today', 'making', 'how', 'send']) expect(html).toContain(`<section id="${id}"`);
    expect(html.match(/<li class="falta">/g)).toHaveLength(6);
    expect(html.match(/<li class="entrada">/g)).toHaveLength(4);
    expect(html.match(/<div class="fila">/g)).toHaveLength(3);
  });
  it('cada enlace de las listas tiene nombre completo para el lector de pantalla', () => {
    const enlaces = [...html.matchAll(/<a class="mono" href="[^"]+" aria-label="([^"]+)">([^<]+)<\/a>/g)];
    expect(enlaces).toHaveLength(10);
    for (const [, nombre, visible] of enlaces) {
      expect(nombre, visible).toContain(visible);
      expect(nombre.length, visible).toBeGreaterThan(visible.length + 10);
    }
  });
  it('WebGPU lleva lang="en" en la página española, en el hero y en la columna de caída', () => {
    const marcados = (html.match(/<span lang="en">WebGPU<\/span>/g) ?? []).length;
    expect(marcados).toBe(idioma === 'es' ? 2 : 0);
    expect((html.match(/WebGPU/g) ?? []).length).toBe(2);
  });
  it('un solo script, el JSON-LD, en su idioma', () => {
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain(`"inLanguage":"${idioma}"`);
  });
});
