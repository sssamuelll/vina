import { describe, it, expect } from 'vitest';
// @ts-expect-error — módulo .mjs sin tipos
import { HUESOS, huesosDelGlb, mezclarCatalogo, nombre, hojaHtml } from '../../scripts/avatares/generar-todas.mjs';

/** Un GLB mínimo: cabecera + bloque JSON (sin binario). */
function glb(json: object): Buffer {
  let txt = JSON.stringify(json);
  while (txt.length % 4) txt += ' ';
  const cuerpo = Buffer.from(txt);
  const cab = Buffer.alloc(20);
  cab.writeUInt32LE(0x46546c67, 0);
  cab.writeUInt32LE(2, 4);
  cab.writeUInt32LE(20 + cuerpo.length, 8);
  cab.writeUInt32LE(cuerpo.length, 12);
  cab.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([cab, cuerpo]);
}

describe('generar-todas', () => {
  it('lee los huesos del primer skin del GLB', () => {
    const nodos = HUESOS.map((name: string) => ({ name }));
    expect(huesosDelGlb(glb({ nodes: [{ name: 'vina_body' }, ...nodos], skins: [{ joints: HUESOS.map((_: string, i: number) => i + 1) }] }))).toEqual(HUESOS);
    expect(huesosDelGlb(glb({ nodes: [] }))).toEqual([]);
    expect(() => huesosDelGlb(Buffer.from('no soy un glb, no soy un glb'))).toThrow(/GLB/);
  });

  it('regenerar unas tallas no borra las demás del catálogo y respeta el orden de tallas.json', () => {
    const anterior = [{ id: 'mujer-eu38', v: 1 }, { id: 'nino-8', v: 1 }];
    const nuevas = [{ id: 'nino-8', v: 2 }, { id: 'hombre-eu50', v: 2 }];
    expect(mezclarCatalogo(anterior, nuevas, ['mujer-eu38', 'hombre-eu50', 'nina-8', 'nino-8'])).toEqual([
      { id: 'mujer-eu38', v: 1 }, { id: 'hombre-eu50', v: 2 }, { id: 'nino-8', v: 2 },
    ]);
  });

  it('nombra la talla como la lee María', () => {
    expect(nombre({ grupo: 'mujer', talla: { eu: '38', us: '8' } })).toBe('Mujer EU 38 · US 8');
    expect(nombre({ grupo: 'nina', talla: { edad: 8 } })).toBe('Niña 8 años');
  });

  it('la hoja muestra la falla con su error, escapado', () => {
    const html = hojaHtml([{ id: 'nino-2', ok: false, error: 'no converge: <estatura>' }]);
    expect(html).toContain('<h2>nino-2</h2>');
    expect(html).toContain('no converge: &lt;estatura&gt;');
  });
});
