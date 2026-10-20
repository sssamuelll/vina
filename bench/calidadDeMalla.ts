/**
 * La calidad de la malla del motor en la camiseta de María: el ángulo mínimo, los triángulos de menos de 5° y de 1°, la
 * rigidez de placa (máxima / mediana, y cuántos triángulos pasan de 10³ y de 10⁴ veces la mediana) con una tela
 * isótropa, para que la razón dependa solo de la geometría, y los cinco triángulos de más rigidez: su pieza, cuántos
 * bordes libres tienen, sus ángulos y, si tienen un borde libre, el ángulo entre sus dos bordes interiores.
 *   npx tsx bench/calidadDeMalla.ts [--mallas=5,10,20]
 */
import fs from 'node:fs';
import { hiloDe, mallarParaElMotor, patronDe, piezasDeMaria } from '../src/utils/cloth/implicito/banco/camiseta';
import { armarPrenda } from '../src/utils/cloth/implicito/prenda';
import { Placa } from '../src/utils/cloth/implicito/placa';
import { telaSI } from '../src/utils/cloth/implicito/tela';

const args = new Map(process.argv.slice(2).map((a): [string, string] => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? ''];
}));
const ISOTROPA = telaSI({ gramaje: 150, grosor: 0.5, kTrama: 1000, kUrdimbre: 1000, kCizalla: 100, pandeo: 0.4, bTrama: 5, bUrdimbre: 5, bBies: 5, friccionCuerpo: 0.3, friccionTela: 0.3 });
const piezas = piezasDeMaria(fs.readFileSync('tests/fixtures/garments/maria_patrones_samuel_2M.dxf', 'utf8'));

for (const malla of (args.get('mallas') ?? '5,10,20').split(',').map(Number)) {
  const t0 = performance.now();
  const mallas = mallarParaElMotor(piezas, malla);
  const ms = performance.now() - t0;
  const prenda = armarPrenda(piezas.map((p, k) => ({ id: p.id, x: Float64Array.from(mallas[k].vertices), patron: patronDe(mallas[k]), tris: mallas[k].triIds, hilo: hiloDe(p) })));
  const { patron, tris, piezaDeTri } = prenda.malla, nt = tris.length / 3;
  /** los ángulos del triángulo t en sus vértices 0, 1 y 2 (grados) */
  const angulos = (t: number) => {
    const v = [tris[3 * t], tris[3 * t + 1], tris[3 * t + 2]];
    const l = [0, 1, 2].map((i) => Math.hypot(patron[2 * v[(i + 1) % 3]] - patron[2 * v[i]], patron[2 * v[(i + 1) % 3] + 1] - patron[2 * v[i] + 1]));
    return [0, 1, 2].map((i) => {
      const a = l[i], b = l[(i + 2) % 3], c = l[(i + 1) % 3];
      return (Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - c * c) / (2 * a * b)))) * 180) / Math.PI;
    });
  };
  let minimo = 180, bajo5 = 0, bajo1 = 0;
  for (let t = 0; t < nt; t++) {
    const m = Math.min(...angulos(t));
    minimo = Math.min(minimo, m);
    if (m < 5) bajo5++;
    if (m < 1) bajo1++;
  }
  // con una tela isótropa, el marco del hilo no cambia la razón
  const placa = new Placa(patron, tris, ISOTROPA);
  const kDe = Float64Array.from({ length: nt }, (_, t) => Math.max(...[0, 1, 2].map((d) => Math.abs(placa.K[9 * t + 4 * d]))));
  const k = Array.from(kDe).filter((x) => x > 0 && Number.isFinite(x)).sort((a, b) => a - b);
  const mediana = k[k.length >> 1];
  const sobre = (f: number) => k.filter((x) => x > f * mediana).length;
  console.log(`malla ${malla} mm: ${patron.length / 2} vértices, ${nt} triángulos en ${ms.toFixed(0)} ms · ángulo mínimo ${minimo.toFixed(1)}° · <5° ${bajo5} · <1° ${bajo1} · K máx/mediana ${(k[k.length - 1] / mediana).toExponential(1)} · >1e3 ${sobre(1e3)} · >1e4 ${sobre(1e4)}`);
  const clave = (a: number, b: number) => (a < b ? a * patron.length + b : b * patron.length + a);
  const usos = new Map<number, number>();
  for (let t = 0; t < nt; t++) for (let i = 0; i < 3; i++) usos.set(clave(tris[3 * t + i], tris[3 * t + ((i + 1) % 3)]), (usos.get(clave(tris[3 * t + i], tris[3 * t + ((i + 1) % 3)])) ?? 0) + 1);
  const peores = Array.from({ length: nt }, (_, t) => t).filter((t) => Number.isFinite(kDe[t])).sort((a, b) => kDe[b] - kDe[a]).slice(0, 5);
  for (const t of peores) {
    const libres = [0, 1, 2].filter((i) => usos.get(clave(tris[3 * t + i], tris[3 * t + ((i + 1) % 3)])) === 1);
    const a = angulos(t), p = piezas[piezaDeTri![t]];
    const entre = libres.length === 1 ? ` · entre los dos interiores ${a[(libres[0] + 2) % 3].toFixed(1)}°` : '';
    console.log(`  K ${(kDe[t] / mediana).toExponential(1)}× · ${p.name} (${p.category ?? 'sin clase'}) · ${libres.length} bordes libres · ángulos ${a.map((x) => x.toFixed(1)).join('/')}°${entre}`);
  }
}
