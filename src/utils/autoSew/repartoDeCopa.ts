/**
 * Dónde se parte la copa de la manga (2026-10-06).
 *
 * El pase de sisa de autoSew cose la copa a las DOS sisas, delantera y
 * espalda, con dos medias costuras de rango complementario. Las dos sisas
 * casi nunca miden lo mismo (María: 230,6 y 219,9 mm): partir la copa en
 * t = 0,5 dejaba cada media costura a 5 mm de su sisa sobre un patrón con
 * 0,4 mm de embebido en total, y el lienzo lo marcaba con «⚠».
 *
 * El corte va donde cada mitad mide, en proporción, lo que mide su sisa, y el
 * embebido se reparte en esa misma proporción: Vina no inventa dónde va (spec
 * 2026-10-05 § 5.3). El corte depende de QUÉ sisa recibe cada mitad, y eso lo
 * decide worldRefine después de autoSew; por eso corre al final de los dos,
 * sobre las costuras ya escritas.
 *
 * ponytail: el corte se calcula por par de mitades. Si alguien borra UNA
 * mitad, cambia el largo de una sisa y vuelve a coser con el menú, la mitad
 * nueva sale con el corte nuevo y no toca a la que quedó (samePair ignora
 * los rangos; al cuello le pasa igual desde 2026-07). Si eso aparece, el
 * arreglo es completar la mitad que falta con el rango que deja libre la otra.
 */
import type { PatternPiece, Seam } from '../../types/types';
import { largoCosidoDeLado } from '../seam/largoCosido';
import { mirrorPctRange } from '../seam/seamRange';

type Lado = 'pieceA' | 'pieceB';

const raiz = (nombre: string) => nombre.toLowerCase().replace(/-\d+$/, '');

/** El lado de la copa en una costura copa↔sisa, o null si no lo es. */
function ladoDeLaCopa(s: Seam): Lado | null {
  const a = raiz(s.pieceA.edgeName), b = raiz(s.pieceB.edgeName);
  if (a === 'sleevecap' && b === 'armhole') return 'pieceA';
  if (b === 'sleevecap' && a === 'armhole') return 'pieceB';
  return null;
}

/** Un B invertido guarda su rango en sentido de cosido (seamRange.ts): se espeja al leerlo y al escribirlo. */
const guardaEspejado = (s: Seam, lado: Lado) => lado === 'pieceB' && s.pieceB.reversed === true;

function rangoFisico(s: Seam, lado: Lado): [number, number] {
  const r: [number, number] = [s[lado].tStart ?? 0, s[lado].tEnd ?? 1];
  return guardaEspejado(s, lado) ? mirrorPctRange(r) : r;
}

function conRangoFisico(s: Seam, lado: Lado, r: [number, number]): Seam {
  const [tStart, tEnd] = guardaEspejado(s, lado) ? mirrorPctRange(r) : r;
  return { ...s, [lado]: { ...s[lado], tStart, tEnd } };
}

const EPS = 1e-6;

/** Una media costura de copa: copa↔sisa con la copa cosida solo en parte. */
export function esMitadDeCopa(s: Seam): boolean {
  const lado = ladoDeLaCopa(s);
  if (!lado) return false;
  const [desde, hasta] = rangoFisico(s, lado);
  return desde > EPS || hasta < 1 - EPS;
}

/**
 * Pone el corte de cada copa partida en dos donde cada mitad mide, en
 * proporción, lo que su sisa. Solo toca una copa con exactamente dos medias
 * costuras de rangos complementarios y dos sisas medibles; lo demás pasa igual.
 */
export function repartirCopas(seams: readonly Seam[], pieces: readonly PatternPiece[]): Seam[] {
  const out = [...seams];
  const porCopa = new Map<string, number[]>();
  seams.forEach((s, i) => {
    const lado = ladoDeLaCopa(s);
    if (!lado) return;
    const clave = `${s[lado].pieceId}\u0000${s[lado].edgeName}`;
    porCopa.set(clave, [...(porCopa.get(clave) ?? []), i]);
  });

  for (const indices of porCopa.values()) {
    if (indices.length !== 2) continue;
    const [primera, segunda] = indices
      .map(i => { const lado = ladoDeLaCopa(seams[i])!; return { i, lado, r: rangoFisico(seams[i], lado) }; })
      .sort((x, y) => x.r[0] - y.r[0]);
    const complementarias = Math.abs(primera.r[0]) < EPS && Math.abs(segunda.r[1] - 1) < EPS
      && Math.abs(primera.r[1] - segunda.r[0]) < EPS;
    if (!complementarias) continue;

    const largoDeSuSisa = ({ i, lado }: { i: number; lado: Lado }) => {
      const sisa = seams[i][lado === 'pieceA' ? 'pieceB' : 'pieceA'];
      const pieza = pieces.find(p => p.id === sisa.pieceId);
      return pieza ? largoCosidoDeLado(pieza, sisa) : undefined;
    };
    const l0 = largoDeSuSisa(primera), l1 = largoDeSuSisa(segunda);
    // Sin los dos largos no hay número con que cortar: se queda como está.
    if (!l0 || !l1) continue;

    const corte = l0 / (l0 + l1);
    out[primera.i] = conRangoFisico(seams[primera.i], primera.lado, [0, corte]);
    out[segunda.i] = conRangoFisico(seams[segunda.i], segunda.lado, [corte, 1]);
  }
  return out;
}
