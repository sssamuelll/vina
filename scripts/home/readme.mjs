#!/usr/bin/env node
/** Las secciones «What it does today» y «In the making» del README salen de home/datos/,
 *  los mismos datos que la página (spec 2026-10-10 § 8.1). `--check` sale con 1 si difieren. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const json = (rel) => JSON.parse(readFileSync(rel, 'utf8'));
export const MARCAS = {
  hoy: ['<!-- hoy -->', '<!-- /hoy -->'],
  enConstruccion: ['<!-- en-construccion -->', '<!-- /en-construccion -->'],
};

export function generarSecciones() {
  const hoy = json('home/datos/hoy.json');
  const falta = json('home/datos/en-construccion.json');
  const prueba = (rutas) => rutas.map((r) => `[\`${r.split('/').pop()}\`](${r})`).join(', ');
  const lineasHoy = [...hoy.columnas, ...hoy.filas].map((e) => `- **${e.titulo.en}.** ${e.texto.en} · ${prueba(e.prueba)}`);
  const lineasFalta = falta.map((e) => `- ${e.texto.en} · [${e.rotulo}](${e.enlace})`);
  return {
    hoy: `\n${lineasHoy.join('\n')}\n\nEach line links to the code that makes it true; a test fails if that code goes away (\`tests/repo/home-honestidad.test.ts\`).\n`,
    enConstruccion: `\n${lineasFalta.join('\n')}\n`,
  };
}

export function aplicar(md) {
  const secciones = generarSecciones();
  for (const [nombre, [inicio, fin]] of Object.entries(MARCAS)) {
    const re = new RegExp(`${inicio}[\\s\\S]*?${fin}`);
    if (!re.test(md)) throw new Error(`README.md sin las marcas ${inicio} … ${fin}`);
    md = md.replace(re, `${inicio}\n${secciones[nombre].trim()}\n${fin}`);
  }
  return md;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const actual = readFileSync('README.md', 'utf8');
  const nuevo = aplicar(actual);
  if (process.argv.includes('--check')) {
    if (actual !== nuevo) { console.error('✗ README.md desactualizado: node scripts/home/readme.mjs'); process.exit(1); }
    console.log('✓ README.md al día');
  } else {
    writeFileSync('README.md', nuevo);
    console.log('✓ README.md');
  }
}
