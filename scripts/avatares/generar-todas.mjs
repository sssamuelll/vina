/**
 * La biblioteca de avatares entera (spec docs/superpowers/specs/2026-09-29-biblioteca-de-avatares-design.md § 4.4).
 *
 *   npm run avatares                                   # las 31
 *   npm run avatares -- --solo mujer-eu38,nino-8       # solo esas; el resto del catálogo se conserva
 *   npm run avatares -- --probar                       # las pruebas que corren dentro de Blender
 *
 * Cada avatar es un proceso de Blender (generar.py) que escribe en .tmp/avatares/. Después: meshopt al
 * GLB → public/avatares/<id>.glb, la miniatura → public/avatares/<id>.webp, las entradas →
 * src/avatares/catalogo.json, y la hoja de contactos → .tmp/avatares/hoja.html y hoja.png.
 * Blender: la variable de entorno BLENDER o la ruta de instalación por defecto de Windows.
 * Nunca corre en el servidor ni en el deploy: los GLB generados se commitean.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const TMP = path.join(RAIZ, '.tmp', 'avatares');
const PUBLICO = path.join(RAIZ, 'public', 'avatares');
const CATALOGO = path.join(RAIZ, 'src', 'avatares', 'catalogo.json');
const BLENDER = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe';
const MAX_GLB = 600 * 1024; // sin meshopt pesa ~930 KB: por encima de esto, la compresión no corrió

export const HUESOS = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3',
  'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3', 'LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3',
  'LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3', 'LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3',
  'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3', 'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3',
  'RightHandRing1', 'RightHandRing2', 'RightHandRing3', 'RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
]; // los 52 del avatar de hoy (public/default-avatar.glb)

const GRUPOS = { mujer: 'Mujer', hombre: 'Hombre', nina: 'Niña', nino: 'Niño' };

/** "Mujer EU 38 · US 8" / "Niña 8 años". */
export function nombre({ grupo, talla }) {
  return talla.edad !== undefined ? `${GRUPOS[grupo]} ${talla.edad} años` : `${GRUPOS[grupo]} EU ${talla.eu} · US ${talla.us}`;
}

/** Nombres de los huesos del primer skin de un GLB, leyendo solo su bloque JSON (meshopt no lo toca). */
export function huesosDelGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('no es un GLB');
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)));
  return (gltf.skins?.[0]?.joints ?? []).map((i) => gltf.nodes[i].name);
}

/** Las entradas regeneradas reemplazan a las suyas, las demás se conservan, en el orden de tallas.json. */
export function mezclarCatalogo(anterior, nuevas, orden) {
  const porId = new Map([...anterior, ...nuevas].map((e) => [e.id, e]));
  return orden.filter((id) => porId.has(id)).map((id) => porId.get(id));
}

const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function hojaHtml(resultados) {
  const tarjeta = (r) => {
    if (!r.ok) return `<article class="falla"><h2>${escapar(r.id)}</h2><pre>${escapar(r.error)}</pre></article>`;
    const { entrada: e, informe: i } = r;
    const peor = Math.max(...Object.values(i.error).map(Math.abs));
    const filas = Object.entries(e.medidas).map(([k, v]) => `<tr><td>${k.replace('_', ' ')}</td><td>${v.toFixed(1)}</td></tr>`).join('');
    return `<article><img src="${e.id}-hoja.png" alt="${escapar(nombre(e))}" width="450" height="450">
<h2>${escapar(nombre(e))}</h2><p>${i.n} personas · ${escapar(e.fuente)} · ajuste: peor error ${peor.toFixed(2)} cm · weight ${i.variables.weight.toFixed(2)}</p>
<table>${filas}</table></article>`;
  };
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Biblioteca de avatares — hoja de contactos</title>
<style>body{font:13px system-ui;margin:16px;background:#fff;color:#222}main{display:flex;flex-wrap:wrap;gap:16px}
article{width:450px}h2{font-size:15px;margin:4px 0}p{margin:0 0 4px;color:#555}table{border-collapse:collapse}
td{padding:1px 8px 1px 0}td+td{text-align:right}.falla{color:#a00}</style>
<h1>Biblioteca de avatares — hoja de contactos</h1><main>${resultados.map(tarjeta).join('\n')}</main></html>\n`;
}

export function correr(cmd, args, log) {
  return new Promise((resolve) => {
    const salida = createWriteStream(log);
    const p = spawn(cmd, args, { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.pipe(salida);
    p.stderr.pipe(salida);
    p.on('error', (e) => { salida.end(String(e)); resolve(1); });
    p.on('close', (code) => { salida.end(); resolve(code); });
  });
}

async function enParalelo(items, n, f) {
  const res = [];
  let siguiente = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      res[i] = await f(items[i]);
    }
  }));
  return res;
}

async function comprimir(entrada, salida) {
  const { Logger, NodeIO } = await import('@gltf-transform/core');
  const { EXTMeshoptCompression, KHRMeshQuantization } = await import('@gltf-transform/extensions');
  const { meshopt } = await import('@gltf-transform/functions');
  const { MeshoptEncoder } = await import('meshoptimizer');
  await MeshoptEncoder.ready;
  const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN))
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(entrada);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(salida, doc);
}

async function generarUna(id) {
  const base = path.join(TMP, id);
  for (const ext of ['.json', '.glb', '.meshopt.glb', '.webp', '-hoja.png']) rmSync(base + ext, { force: true }); // un fallo no hereda archivos viejos
  const code = await correr(BLENDER, ['-b', '--python-exit-code', '1', '--python', path.join(AQUI, 'generar.py'), '--', '--talla', id, '--salida', TMP], base + '.log');
  const faltan = ['.json', '.glb', '.webp', '-hoja.png'].filter((ext) => !existsSync(base + ext));
  if (code !== 0 || faltan.length) {
    const cola = existsSync(base + '.log') ? readFileSync(base + '.log', 'utf8').split('\n').slice(-12).join('\n') : '';
    return { id, ok: false, error: `Blender salió con ${code}${faltan.length ? `; faltan ${faltan.join(', ')}` : ''}\n${cola}` };
  }
  return publicar(id);
}

/** Del GLB de Blender al publicado: meshopt y las validaciones corren en tmp, y solo si todo pasa se
 *  copian GLB y miniatura a public/. Así una talla rechazada no pisa la que ya estaba publicada, y un
 *  error después de Blender vuelve como falla de esa talla en vez de tumbar la corrida. */
export async function publicar(id, tmp = TMP, publico = PUBLICO) {
  const base = path.join(tmp, id);
  try {
    await comprimir(base + '.glb', base + '.meshopt.glb');
    const peso = statSync(base + '.meshopt.glb').size;
    if (peso > MAX_GLB) return { id, ok: false, error: `${id}.glb pesa ${peso} bytes tras meshopt (máximo ${MAX_GLB})` };
    const huesos = huesosDelGlb(readFileSync(base + '.meshopt.glb'));
    const faltanHuesos = HUESOS.filter((h) => !huesos.includes(h));
    if (huesos.length !== HUESOS.length || faltanHuesos.length) return { id, ok: false, error: `huesos: ${huesos.length}, faltan ${faltanHuesos.join(', ')}` };
    const resultado = JSON.parse(readFileSync(base + '.json', 'utf8'));
    copyFileSync(base + '.meshopt.glb', path.join(publico, `${id}.glb`));
    copyFileSync(base + '.webp', path.join(publico, `${id}.webp`));
    return { id, ok: true, peso, ...resultado };
  } catch (e) {
    return { id, ok: false, error: `después de Blender: ${e.message}` };
  }
}

async function probar() {
  const pruebas = [['medir_test.py', ['--factory-startup']], ['acabado_test.py', []], ['ajuste_test.py', []]];
  mkdirSync(TMP, { recursive: true });
  let fallas = 0;
  for (const [archivo, extra] of pruebas) {
    const log = path.join(TMP, archivo.replace('.py', '.log'));
    const code = await correr(BLENDER, ['-b', ...extra, '--python-exit-code', '1', '--python', path.join(AQUI, archivo)], log);
    console.log(`${code === 0 ? 'ok   ' : 'FALLA'} ${archivo}${code === 0 ? '' : ` (ver ${log})`}`);
    fallas += code === 0 ? 0 : 1;
  }
  return fallas;
}

async function main() {
  if (!existsSync(BLENDER)) throw new Error(`no encuentro Blender en ${BLENDER}; pon su ruta en la variable BLENDER`);
  if (process.argv.includes('--probar')) process.exit(await probar() ? 1 : 0);
  const tallas = JSON.parse(readFileSync(path.join(AQUI, 'tallas.json'), 'utf8')).tallas.map((t) => t.id);
  const i = process.argv.indexOf('--solo');
  const ids = i > 0 ? process.argv[i + 1].split(',') : tallas;
  const desconocidas = ids.filter((id) => !tallas.includes(id));
  if (desconocidas.length) throw new Error(`no están en tallas.json: ${desconocidas.join(', ')}`);
  for (const d of [TMP, PUBLICO, path.dirname(CATALOGO)]) mkdirSync(d, { recursive: true });

  const n = Math.max(1, Math.min(8, Math.floor(availableParallelism() / 2)));
  console.log(`${ids.length} avatares, ${n} Blender a la vez`);
  const resultados = await enParalelo(ids, n, async (id) => {
    const r = await generarUna(id);
    console.log(`${r.ok ? 'ok   ' : 'FALLA'} ${id}${r.ok ? ` ${(r.peso / 1024).toFixed(0)} KB` : `: ${r.error.split('\n')[0]}`}`);
    return r;
  });

  const anterior = existsSync(CATALOGO) ? JSON.parse(readFileSync(CATALOGO, 'utf8')) : [];
  const catalogo = mezclarCatalogo(anterior, resultados.filter((r) => r.ok).map((r) => r.entrada), tallas);
  writeFileSync(CATALOGO, JSON.stringify(catalogo, null, 2) + '\n');
  const hoja = path.join(TMP, 'hoja.html');
  writeFileSync(hoja, hojaHtml(resultados));
  const { chromium } = await import('@playwright/test');
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 } });
  await pagina.goto(pathToFileURL(hoja).href);
  await pagina.screenshot({ path: path.join(TMP, 'hoja.png'), fullPage: true });
  await navegador.close();
  const fallas = resultados.filter((r) => !r.ok);
  console.log(`catálogo: ${catalogo.length} entradas → ${path.relative(RAIZ, CATALOGO)}\nhoja de contactos: ${path.relative(RAIZ, hoja)} y hoja.png`);
  if (fallas.length) {
    console.error(`${fallas.length} fallaron: ${fallas.map((r) => r.id).join(', ')}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
