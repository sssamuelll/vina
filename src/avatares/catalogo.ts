/**
 * La biblioteca de avatares dentro de la app (spec 2026-09-29 § 5). El generador
 * (`scripts/avatares/generar-todas.mjs`) escribe `catalogo.json`; la app lo importa al compilar
 * y baja cada GLB de `public/avatares/` cuando hace falta.
 */
import type { Avatar, BodyMeasurements } from '../types/types';
import { DEFAULT_MEASUREMENTS, aMorph, type MorphConfig } from '../utils/avatar/morphTargets';
import catalogo from './catalogo.json';

export interface EntradaDeCatalogo {
  id: string;
  grupo: string;
  talla: { eu?: string; us?: string; edad?: number };
  archivo: string;
  miniatura: string;
  medidas: Record<string, number>;
  fuente: string;
  generador: string;
}

// `as`: el JSON inferido marca `bajo_busto?: undefined` en niños y hombres; la forma la fija
// catalogo.test.ts.
export const CATALOGO = catalogo as readonly EntradaDeCatalogo[];

/** Del catálogo a `BodyMeasurements`. El patrón las usa como vienen, aunque algunas no se tomen
 *  donde las toma Seamly: `cuello` va bajo la nuez (Seamly: la base), `hombros` es el ancho
 *  biacromial recto y `largo_brazo` es con el brazo recto (Seamly: codo doblado). */
export const CLAVES: Readonly<Record<string, keyof BodyMeasurements>> = {
  estatura: 'height',
  busto: 'chest',
  cintura: 'waist',
  cadera: 'hips',
  hombros: 'shoulder',
  largo_brazo: 'armLength',
  entrepierna: 'inseam',
  cuello: 'neckCirc',
  bajo_busto: 'lowBust',
  muslo: 'thighCirc',
  rodilla: 'kneeCirc',
  biceps: 'upperArmCirc',
  talle_trasero: 'neckToWaistBack',
  tiro: 'crotchLength',
  altura_cintura: 'waistHeight',
};

export function medidasDeEntrada(e: EntradaDeCatalogo): BodyMeasurements {
  const m: Partial<Record<keyof BodyMeasurements, number>> = {};
  for (const [clave, valor] of Object.entries(e.medidas)) m[CLAVES[clave]] = valor;
  return m as BodyMeasurements;
}

const GRUPOS: Record<string, string> = { mujer: 'Mujer', hombre: 'Hombre', nina: 'Niña', nino: 'Niño' };

/** Como el `nombre()` del generador: "Mujer EU 38 · US 8", "Niña 8 años". */
export function nombreDeTalla(e: EntradaDeCatalogo): string {
  const grupo = GRUPOS[e.grupo] ?? e.grupo;
  return e.talla.edad !== undefined ? `${grupo} ${e.talla.edad} años` : `${grupo} EU ${e.talla.eu} · US ${e.talla.us}`;
}

export const urlDeModelo = (e: EntradaDeCatalogo): string => `/avatares/${e.archivo}`;

/** Un objeto por talla, construido una vez: los selectores de Redux comparan por referencia. */
const POR_URL = new Map<string, Avatar>(CATALOGO.map((e) => [urlDeModelo(e), {
  id: e.id, name: nombreDeTalla(e), modelUrl: urlDeModelo(e), measurements: medidasDeEntrada(e),
}]));

export function avatarPorUrl(url: string | null | undefined): Avatar | undefined {
  return url ? POR_URL.get(url) : undefined;
}

/** Un proyecto nuevo arranca con Mujer EU 38 (spec § 5). */
export const AVATAR_POR_DEFECTO: Avatar = POR_URL.get('/avatares/mujer-eu38.glb')!;

/**
 * Las medidas del cuerpo que se ve en 3D. Uno de la biblioteca no se estira (spec § 5): son las de
 * su talla aunque María edite las del proyecto, que van al patrón. Un modelo propio y el maniquí de
 * costura siguen las del proyecto, como antes. Lo que dibuja, choca o se coloca sobre el cuerpo lee
 * de aquí; el patrón lee `project.avatar.measurements`.
 */
export function medidasDelCuerpo(p: { avatarMode: string; avatarModelUrl: string | null; avatar: Avatar }): BodyMeasurements {
  return (p.avatarMode === 'model' && avatarPorUrl(p.avatarModelUrl)?.measurements) || p.avatar.measurements;
}

/** Contra qué se estira el cuerpo cargado: uno de la biblioteca, contra sus propias medidas (todo da
 *  1,0); un modelo propio, contra el hombre de 180 cm de siempre. */
export function referenciaDeMorph(url: string | null): MorphConfig {
  const cuerpo = avatarPorUrl(url);
  return cuerpo ? aMorph(cuerpo.measurements) : DEFAULT_MEASUREMENTS;
}
