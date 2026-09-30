import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
// @ts-expect-error — módulo .mjs sin tipos
import { HUESOS, huesosDelGlb, mezclarCatalogo, nombre, hojaHtml, correr, publicar } from '../../scripts/avatares/generar-todas.mjs';

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

  it('el log guarda stdout y stderr, y devuelve el código de salida del programa', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'correr-'));
    const log = path.join(dir, 'hijo.log');
    // como Blender al fallar: algo por stdout, la traza de Python por stderr, código distinto de 0
    const hijo = "process.stdout.write('A\\n', () => setTimeout(() => { process.stderr.write('B\\n'); process.exitCode = 3; }, 50));";
    expect(await correr(process.execPath, ['-e', hijo], log)).toBe(3);
    expect(readFileSync(log, 'utf8')).toBe('A\nB\n');
  });
});

/** Un GLB válido con un triángulo pesado a los huesos que se pidan. */
async function glbConHuesos(nombres: string[]): Promise<Uint8Array> {
  const doc = new Document();
  const buf = doc.createBuffer();
  const acc = (tipo: 'VEC3' | 'VEC4', arr: Float32Array | Uint16Array) => doc.createAccessor().setType(tipo).setArray(arr).setBuffer(buf);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(12)))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])));
  const identidades = new Float32Array(16 * nombres.length);
  for (let i = 0; i < nombres.length; i++) identidades.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 16 * i);
  const skin = doc.createSkin().setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(identidades).setBuffer(buf));
  const escena = doc.createScene();
  for (const n of nombres) { const hueso = doc.createNode(n); skin.addJoint(hueso); escena.addChild(hueso); }
  escena.addChild(doc.createNode('vina_body').setMesh(doc.createMesh().addPrimitive(prim)).setSkin(skin));
  return new NodeIO().writeBinary(doc);
}

describe('publicar: del GLB de Blender a public/', () => {
  const preparar = () => {
    const raiz = mkdtempSync(path.join(tmpdir(), 'publicar-'));
    const tmp = path.join(raiz, 'tmp');
    const publico = path.join(raiz, 'public');
    mkdirSync(tmp);
    mkdirSync(publico);
    writeFileSync(path.join(tmp, 'x.json'), JSON.stringify({ entrada: { id: 'x' }, informe: {} }));
    writeFileSync(path.join(tmp, 'x.webp'), 'NUEVA');
    return { tmp, publico };
  };

  it('una talla válida publica su GLB comprimido con los 52 huesos y su miniatura', async () => {
    const { tmp, publico } = preparar();
    writeFileSync(path.join(tmp, 'x.glb'), await glbConHuesos(HUESOS));
    const r = await publicar('x', tmp, publico);
    expect(r).toMatchObject({ id: 'x', ok: true, entrada: { id: 'x' } });
    expect(huesosDelGlb(readFileSync(path.join(publico, 'x.glb')))).toEqual(HUESOS);
    expect(readFileSync(path.join(publico, 'x.webp'), 'utf8')).toBe('NUEVA');
  });

  it('una talla rechazada no pisa la GLB ni la miniatura publicadas', async () => {
    const { tmp, publico } = preparar();
    writeFileSync(path.join(tmp, 'x.glb'), await glbConHuesos(['Hips', 'Spine']));
    writeFileSync(path.join(publico, 'x.glb'), 'VIEJA');
    writeFileSync(path.join(publico, 'x.webp'), 'VIEJA');
    const r = await publicar('x', tmp, publico);
    expect(r).toMatchObject({ id: 'x', ok: false });
    expect(r.error).toMatch(/huesos: 2/);
    expect(readFileSync(path.join(publico, 'x.glb'), 'utf8')).toBe('VIEJA');
    expect(readFileSync(path.join(publico, 'x.webp'), 'utf8')).toBe('VIEJA');
  });

  it('un error después de Blender vuelve como falla de esa talla, no tumba la corrida', async () => {
    const { tmp, publico } = preparar();
    writeFileSync(path.join(tmp, 'x.glb'), 'esto no es un glb');
    const r = await publicar('x', tmp, publico);
    expect(r).toMatchObject({ id: 'x', ok: false });
    expect(r.error).toMatch(/después de Blender/);
  });
});
