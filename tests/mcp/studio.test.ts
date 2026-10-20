import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/** vina-studio, con vina-mcp dentro (spec 2026-10-09, nombre del paquete): la entrada con el nombre del producto. */
const leer = (ruta: string) => JSON.parse(readFileSync(ruta, 'utf8'));
const studio = leer('studio/package.json');
const mcp = leer('mcp/package.json');

describe('vina-studio, con vina-mcp dentro', () => {
  it('lleva dentro exactamente la versión de vina-mcp que hay en esta rama', () => {
    // Si vina-mcp sube y esto no, quien corre `npx -y vina-studio` se queda con el puente viejo.
    expect(studio.dependencies['vina-mcp']).toBe(mcp.version);
  });

  it('arranca el bin de vina-mcp, que existe', () => {
    const entrada = readFileSync(`studio/${studio.bin[studio.name]}`, 'utf8');
    expect(entrada).toContain(`import 'vina-mcp/${mcp.bin['vina-mcp']}';`);
    expect(existsSync(`mcp/${mcp.bin['vina-mcp']}`)).toBe(true);
  });

  it('npx lo encuentra: su único bin se llama como el paquete', () => {
    expect(Object.keys(studio.bin)).toEqual([studio.name]);
  });

  it('lleva en el paquete lo que hace falta para publicarse', () => {
    for (const f of ['bin', 'README.md', 'LICENSE']) expect(studio.files).toContain(f);
    expect(existsSync('studio/README.md')).toBe(true);
    expect(existsSync('studio/LICENSE')).toBe(true);
  });
});
