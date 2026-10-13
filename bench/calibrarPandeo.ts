/**
 * Calibra el factor de pandeo (spec 2026-10-13 §4.1.4) contra la referencia privada del disco Cusick en
 * 5, 10 y 20 mm.
 *
 *   VINA_REFERENCIAS=<carpeta privada> npm run bench:tela:calibrar
 *
 * Entre los factores que cumplen el criterio de §2 (nivel, rango y menos de 0,1 % de triángulos aplastados en
 * las tres mallas), elige el que deja la malla de 5 mm más cerca de la referencia. Si ninguno lo cumple, lo
 * dice: la ley de pandeo necesitaría otra forma (§5).
 */
import { criterioCusick, ensayoCusick, guardarInforme, imprimirCusick, leerReferencias } from './_banco';
import { correrImplicito } from './motorImplicito';

const FACTORES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1];
const ref = leerReferencias();
const ensayos = FACTORES.map((pandeo) => {
  console.log(`— pandeo ${pandeo}`);
  const filas = ensayoCusick(correrImplicito({ ...ref.tela, pandeo }), [5, 10, 20], ref);
  imprimirCusick(filas);
  return { pandeo, filas, criterio: criterioCusick(filas, ref) };
});
const cinco = (e: (typeof ensayos)[number]) => e.filas.find((f) => f.malla === 5)?.coeficiente ?? NaN;
const distancia = (e: (typeof ensayos)[number]) => Math.abs(cinco(e) - (ref.cusick['5']?.coeficiente ?? NaN));
const validos = ensayos
  .filter((e) => e.criterio.nivel && e.criterio.rango && e.filas.every((f) => f.aplastados < 0.1))
  .sort((a, b) => distancia(a) - distancia(b) || a.criterio.rangoPropio - b.criterio.rangoPropio);
console.log(validos.length > 0 ? `pandeo elegido: ${validos[0].pandeo}` : 'ningún factor cumple el criterio de §2: la ley de pandeo necesita otra forma (§5)');
console.log(`informe: ${guardarInforme('calibrar-pandeo', ensayos)}`);
