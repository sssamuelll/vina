import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ningún script de shell del repo lleva un retorno de carro.
 *
 * `.gitattributes` ya pide `scripts/*.sh text eol=lf` desde hace tiempo, con su
 * razón escrita: «a CRLF checkout under Windows autocrlf breaks the parser
 * mid-script». **Y no bastó.** El 2026-09-05 se colaron DOS CR al blob de
 * `deploy-prod.sh` —dos renglones añadidos por un script de Python que escribió
 * en CRLF— y `.gitattributes` no los normalizó al commitear. Se mergearon.
 *
 * Lo que eso hace, que es lo peor de este defecto:
 *
 *   npx playwright test --workers=2 \
 *     tests/e2e/uno.spec.ts \
 *     tests/e2e/dos.spec.ts \<CR>      <- aquí se acaba el comando
 *     tests/e2e/tres.spec.ts \         <- y esto es un comando nuevo
 *
 * La barra escapa el CR, no el salto de línea. Así que el comando se corta ahí,
 * los renglones siguientes se intentan ejecutar como programas, y `bash -n`
 * pasa en verde porque **es sintácticamente válido**: solo es semánticamente
 * falso. Un gate que se corta a la mitad no falla: pasa con menos.
 *
 * De ahí que el guardián mire los BYTES y no la sintaxis.
 */

const RAIZ = process.cwd();


function scriptsDeShell(): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    let entradas;
    try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) {
        // `.husky/_/` lo genera husky en cada instalación; no es nuestro.
        if (e.name !== 'node_modules' && e.name !== '_') recorrer(ruta);
      } else if (/\.(sh|bash)$/.test(e.name) || (dir.endsWith('.husky') && !e.name.includes('.'))) {
        salida.push(ruta);
      }
    }
  };
  recorrer(join(RAIZ, 'scripts'));
  recorrer(join(RAIZ, '.husky'));
  return salida;
}

describe('los scripts de shell no llevan retorno de carro', () => {
  it('el censo no está ciego: hay al menos tres scripts que mirar', () => {
    // Sin esto, mover los scripts de carpeta dejaría el test de abajo pasando
    // en vacío y el defecto volvería sin que nadie se entere.
    expect(scriptsDeShell().length).toBeGreaterThanOrEqual(3);
  });

  it('ninguno tiene un solo CR en sus bytes', () => {
    const sucios = scriptsDeShell()
      .map((ruta) => {
        const bytes = readFileSync(ruta);
        let cr = 0;
        for (const b of bytes) if (b === 0x0d) cr++;
        return { ruta: ruta.slice(RAIZ.length + 1).replace(/\\/g, '/'), cr };
      })
      .filter((x) => x.cr > 0)
      .map((x) => `${x.ruta}: ${x.cr} CR`);

    expect(
      sucios,
      'estos scripts llevan CRLF: la barra de continuación escapa el CR y el comando se corta ahí',
    ).toEqual([]);
  });

  it('y siguen siendo ficheros con contenido, no vacíos', () => {
    // La otra mitad del cinturón: un script vaciado tampoco tiene CR.
    for (const ruta of scriptsDeShell()) {
      expect(statSync(ruta).size, `${ruta} está vacío`).toBeGreaterThan(0);
    }
  });
});
