/**
 * ANSUR II + NHANES → scripts/avatares/tallas.json: las 31 tallas con sus medidas objetivo.
 * Spec: docs/superpowers/specs/2026-09-29-biblioteca-de-avatares-design.md § 3 y § 4.1.
 *
 *   node scripts/avatares/tallas.mjs
 *
 * Los datos crudos se descargan a .tmp/avatares-datos/ (gitignored) y se verifica el sha256
 * de cada archivo: el servidor de ANSUR a veces responde 200 con la página HTML en vez del CSV.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FUENTES = {
  ansurMujer: { url: 'https://tools.openlab.psu.edu/publicData/ANSUR_II_FEMALE_Public.csv', sha256: 'ed7e800aa97a4d42f8286b988be2fe1883a2e789588169db959864b707d1757a' },
  ansurHombre: { url: 'https://tools.openlab.psu.edu/publicData/ANSUR_II_MALE_Public.csv', sha256: '0547aea0170e5293de519389981135e75803f02e6d40c77ace740decc0caac64' },
  nhanesBmx: { url: 'https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/BMX_L.xpt', sha256: '44440c416d9ad709e8b1708a5975378ab4d5b18edc39eb5015c2ae7186500170' },
  nhanesDemo: { url: 'https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/DEMO_L.xpt', sha256: 'ca4374a158b493b8b0163e1388da21d57a18d1b9cecff2aa4e2fa2bec494fe23' },
};

// ANSUR II mide en mm. cintura_ombligo: ANSUR mide la cintura a la altura del ombligo (omphalion),
// no en la cintura natural; el generador la ajusta a esa altura y publica aparte la natural.
export const COLUMNAS_ANSUR = {
  estatura: 'stature', busto: 'chestcircumference', cintura_ombligo: 'waistcircumference',
  cadera: 'buttockcircumference', cuello: 'neckcircumference', hombros: 'biacromialbreadth',
  largo_brazo: 'sleeveoutseam', entrepierna: 'crotchheight',
};
// NHANES mide en cm. BMXHIP solo existe desde los 12 años (target de la variable en BMX_L).
export const COLUMNAS_NHANES = { estatura: 'BMXHT', cintura_ombligo: 'BMXWAIST', cadera: 'BMXHIP' };

const MIN_PERSONAS = 10; // la banda más chica de verdad (mujer EU 32) tiene 10 (2026-09-30)
// Los datos vienen en décimos de cm (ANSUR en mm; NHANES con un decimal): la mediana se redondea ahí,
// en enteros, para que el .json no dependa de la coma flotante.
const cm = (decimos) => Math.round(mediana(decimos)) / 10;

export function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) throw new Error('mediana de una lista vacía');
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** CSV sin comillas (ANSUR II no las usa): filas como objetos con claves en minúscula. */
export function leerCsv(texto) {
  const [cab, ...filas] = texto.split(/\r?\n/).filter((l) => l.length);
  const cols = cab.split(',').map((c) => c.toLowerCase());
  return filas.map((l, i) => {
    const celdas = l.split(',');
    if (celdas.length !== cols.length) throw new Error(`fila ${i + 2}: ${celdas.length} campos, se esperaban ${cols.length}`);
    return Object.fromEntries(cols.map((c, j) => [c, celdas[j]]));
  });
}

/** Número IBM 370 de 8 bytes (el de SAS XPORT) → double. null si es un valor faltante de SAS. */
export function ibmADoble(b, i) {
  const b0 = b[i];
  let resto = 0;
  for (let k = 1; k < 8; k++) resto |= b[i + k];
  if (resto === 0 && (b0 === 0x2e || b0 === 0x5f || (b0 >= 0x41 && b0 <= 0x5a))) return null;
  const alto = (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
  const bajo = ((b[i + 4] << 24) >>> 0) + (b[i + 5] << 16) + (b[i + 6] << 8) + b[i + 7];
  const fraccion = (alto * 2 ** 32 + bajo) / 2 ** 56;
  const v = fraccion * 16 ** ((b0 & 0x7f) - 64);
  return b0 & 0x80 ? -v : v;
}

/** SAS XPORT v5 (el formato de NHANES), un solo miembro: { variables, filas }. */
export function leerXpt(buf) {
  const txt = (a, n) => buf.toString('latin1', a, a + n);
  if (!txt(0, 48).startsWith('HEADER RECORD*******LIBRARY HEADER RECORD!!!!!!!')) throw new Error('no es SAS XPORT v5');
  const iNames = buf.indexOf('HEADER RECORD*******NAMESTR HEADER RECORD!!!!!!!', 0, 'latin1');
  const nVars = Number(txt(iNames + 54, 4));
  const variables = [];
  for (let k = 0; k < nVars; k++) {
    const a = iNames + 80 + k * 140;
    variables.push({ tipo: buf.readUInt16BE(a), largo: buf.readUInt16BE(a + 4), nombre: txt(a + 8, 8).trim(), pos: buf.readUInt32BE(a + 84) });
  }
  const iObs = buf.indexOf('HEADER RECORD*******OBS     HEADER RECORD!!!!!!!', iNames, 'latin1');
  const largoFila = variables.reduce((s, v) => Math.max(s, v.pos + v.largo), 0);
  const filas = [];
  for (let a = iObs + 80; a + largoFila <= buf.length; a += largoFila) {
    if (buf.subarray(a, a + largoFila).every((x) => x === 0x20)) break; // relleno del último registro
    filas.push(Object.fromEntries(variables.map((v) => [v.nombre,
      v.tipo === 1 ? ibmADoble(buf, a + v.pos) : txt(a + v.pos, v.largo).trim()])));
  }
  return { variables: variables.map((v) => v.nombre), filas };
}

const ADULTOS = {
  mujer: { filas: 'ansurMujer', eus: [32, 34, 36, 38, 40, 42, 44, 46, 48], busto: (eu) => 2 * eu + 12, us: (eu) => eu - 30 },
  hombre: { filas: 'ansurHombre', eus: [44, 46, 48, 50, 52, 54, 56, 58], busto: (eu) => 2 * eu, us: (eu) => eu - 10 },
};
const NINOS = { nina: 2, nino: 1 }; // RIAGENDR de NHANES: 1 hombre, 2 mujer
const EDADES = [2, 4, 6, 8, 10, 12, 14];

/** Una talla adulta: la banda de busto [centro − 2, centro + 2) fija quién entra; el resto es su mediana. */
export function tallaAdulta(filas, grupo, eu) {
  const { busto, us } = ADULTOS[grupo];
  const centro = busto(eu);
  const banda = filas.filter((f) => { const mm = Number(f.chestcircumference); return mm >= (centro - 2) * 10 && mm < (centro + 2) * 10; });
  if (banda.length < MIN_PERSONAS) throw new Error(`${grupo} EU ${eu}: ${banda.length} personas en la banda de busto ${centro - 2}–${centro + 2} cm`);
  const objetivo = Object.fromEntries(Object.entries(COLUMNAS_ANSUR).map(([m, col]) =>
    [m, m === 'busto' ? centro : cm(banda.map((f) => Number(f[col])))]));
  return { id: `${grupo}-eu${eu}`, grupo, talla: { eu: String(eu), us: String(us(eu)) }, fuente: 'ANSUR II', n: banda.length,
    banda: { medida: 'busto', columna: 'chestcircumference', desde: centro - 2, hasta: centro + 2 }, columnas: COLUMNAS_ANSUR, objetivo };
}

/** Una talla de niña o niño: las personas de esa edad cumplida y ese sexo; cada medida, si hay datos. */
export function tallaNino(bmx, demo, grupo, edad) {
  const quien = new Set(demo.filter((d) => d.RIAGENDR === NINOS[grupo] && d.RIDAGEYR === edad).map((d) => d.SEQN));
  const banda = bmx.filter((b) => quien.has(b.SEQN));
  if (banda.length < MIN_PERSONAS) throw new Error(`${grupo} ${edad} años: ${banda.length} personas`);
  const objetivo = {};
  const columnas = {};
  for (const [m, col] of Object.entries(COLUMNAS_NHANES)) {
    const v = banda.map((b) => b[col]).filter((x) => x !== null);
    if (v.length >= MIN_PERSONAS) { objetivo[m] = cm(v.map((x) => Math.round(x * 10))); columnas[m] = col; }
  }
  return { id: `${grupo}-${edad}`, grupo, talla: { edad }, fuente: 'NHANES 2021-2023', n: banda.length,
    banda: { medida: 'edad', columna: 'RIDAGEYR', desde: edad, hasta: edad + 1 }, columnas, objetivo };
}

export function generarTallas({ ansurMujer, ansurHombre, bmx, demo }) {
  const ansur = { ansurMujer, ansurHombre };
  return [
    ...Object.entries(ADULTOS).flatMap(([grupo, { filas, eus }]) => eus.map((eu) => tallaAdulta(ansur[filas], grupo, eu))),
    ...Object.keys(NINOS).flatMap((grupo) => EDADES.map((edad) => tallaNino(bmx, demo, grupo, edad))),
  ];
}

export async function descargar(nombre, { url, sha256 }, dir) {
  const ruta = `${dir}/${url.split('/').pop()}`;
  if (!existsSync(ruta)) writeFileSync(ruta, Buffer.from(await (await fetch(url)).arrayBuffer()));
  const buf = readFileSync(ruta);
  const h = createHash('sha256').update(buf).digest('hex');
  if (h !== sha256) throw new Error(`${nombre}: sha256 ${h}, se esperaba ${sha256}. Borra ${ruta} y reintenta; si persiste, la fuente cambió.`);
  return buf;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = '.tmp/avatares-datos';
  mkdirSync(dir, { recursive: true });
  const b = {};
  for (const [k, f] of Object.entries(FUENTES)) b[k] = await descargar(k, f, dir);
  const tallas = generarTallas({
    ansurMujer: leerCsv(b.ansurMujer.toString('latin1')), ansurHombre: leerCsv(b.ansurHombre.toString('latin1')),
    bmx: leerXpt(b.nhanesBmx).filas, demo: leerXpt(b.nhanesDemo).filas,
  });
  const salida = fileURLToPath(new URL('./tallas.json', import.meta.url));
  writeFileSync(salida, JSON.stringify({ generadoPor: 'scripts/avatares/tallas.mjs', fuentes: FUENTES, tallas }, null, 2) + '\n');
  console.log(`${tallas.length} tallas → ${salida}`);
}
