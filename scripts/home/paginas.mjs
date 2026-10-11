#!/usr/bin/env node
/**
 * Las dos páginas de la home desde una plantilla, el copy de cada idioma y los datos
 * de home/datos/ (spec 2026-10-10 § 6.2). Los HTML se commitean; `--check` sale con 1
 * si difieren de lo generado (tests/repo/home-paginas.test.ts lo exige).
 *   node scripts/home/paginas.mjs            # escribe index.html y es/index.html
 *   node scripts/home/paginas.mjs --check    # solo compara
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const leer = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const json = (rel) => JSON.parse(leer(rel));

export const PAGINAS = {
  en: { salida: 'index.html', raiz: './', url: 'https://vina.sdar.dev/', ogImagen: 'og.png', ogLocale: 'en_US' },
  es: { salida: 'es/index.html', raiz: '../', url: 'https://vina.sdar.dev/es/', ogImagen: 'og-es.png', ogLocale: 'es_VE' },
};

/** En una lista, `{{k}}` es `d[k][idioma]` si el dato es bilingüe, y `d[k]` si no. */
function valor(d, k, idioma) {
  if (!(k in d)) throw new Error(`la lista no tiene la clave «${k}»`);
  const v = d[k];
  return v && typeof v === 'object' && idioma in v ? v[idioma] : String(v);
}

export function generarPagina(idioma) {
  const p = PAGINAS[idioma];
  if (!p) throw new Error(`idioma desconocido: ${idioma}`);
  const otro = idioma === 'en' ? 'es' : 'en';
  const copy = json(`home/copy/${idioma}.json`);
  const hoy = json('home/datos/hoy.json');
  const listas = {
    columnas: hoy.columnas,
    filas: hoy.filas.map((f) => ({ ...f, clase: f.mono ? 'mono' : 'prosa' })),
    enConstruccion: json('home/datos/en-construccion.json'),
    diario: json('home/datos/diario.json'),
  };
  const vars = {
    ...copy, idioma, raiz: p.raiz, url: p.url, otraUrl: PAGINAS[otro].url,
    ogImagen: p.ogImagen, ogLocale: p.ogLocale, ogLocaleOtro: PAGINAS[otro].ogLocale,
    webgpu: idioma === 'en' ? 'WebGPU' : '<span lang="en">WebGPU</span>',
  };
  let html = leer('home/plantilla.html');
  html = html.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, nombre, cuerpo) => {
    const datos = listas[nombre];
    if (!datos) throw new Error(`lista desconocida en la plantilla: ${nombre}`);
    return datos.map((d) => cuerpo.replace(/\{\{(\w+)\}\}/g, (_m, k) => valor(d, k, idioma))).join('');
  });
  html = html.replace(/\{\{(\w+)\}\}/g, (_m, k) => {
    if (!(k in vars)) throw new Error(`marca sin valor en el copy ${idioma}: ${k}`);
    return vars[k];
  });
  return html;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  let desactualizados = 0;
  for (const [idioma, p] of Object.entries(PAGINAS)) {
    const html = generarPagina(idioma);
    const destino = path.join(REPO, p.salida);
    if (check) {
      if (!existsSync(destino) || readFileSync(destino, 'utf8') !== html) { console.error(`✗ ${p.salida} no es lo que genera la plantilla`); desactualizados++; }
      else console.log(`✓ ${p.salida} al día`);
    } else {
      mkdirSync(path.dirname(destino), { recursive: true });
      writeFileSync(destino, html);
      console.log(`✓ ${p.salida} · ${html.length} B`);
    }
  }
  if (desactualizados) { console.error('Corre: node scripts/home/paginas.mjs'); process.exit(1); }
}
