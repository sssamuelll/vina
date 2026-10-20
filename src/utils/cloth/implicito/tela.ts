/**
 * La tela del motor implícito (spec docs/superpowers/specs/2026-10-13-tela-nueva-design.md §4.1.1), en
 * las unidades en que se mide una tela. El motor trabaja en SI: `telaSI` convierte una sola vez.
 *
 * Convención: la urdimbre corre a lo largo del hilo (la línea de grano); «bTrama» es la rigidez cuando
 * la curvatura va a lo ancho, es decir, cuando el pliegue corre a lo largo del hilo.
 */
export interface TelaFisica {
  /** g/m² */
  gramaje: number;
  /** mm */
  grosor: number;
  /** N/m: tracción a lo ancho */
  kTrama: number;
  /** N/m: tracción a lo largo del hilo */
  kUrdimbre: number;
  /** N/m */
  kCizalla: number;
  /** factor de la carga de pandeo P = pandeo·π²·B/L² (§4.1.4); Infinity = resiste igual que al estirar */
  pandeo: number;
  /** encogimiento (fracción) desde el que la tela vuelve a resistir como al estirar (E9); sin él, TOPE_DE_PANDEO */
  topePandeo?: number;
  /** µN·m */
  bTrama: number;
  /** µN·m */
  bUrdimbre: number;
  /** µN·m */
  bBies: number;
  /** coeficiente de Coulomb de la tela contra el cuerpo (§4.3.1) */
  friccionCuerpo: number;
  /** coeficiente de Coulomb de la tela contra sí misma (§4.3.2) */
  friccionTela: number;
}

/** La misma tela en SI: kg/m², m, N/m y N·m. */
export interface TelaSI {
  densidad: number;
  grosor: number;
  kTrama: number;
  kUrdimbre: number;
  kCizalla: number;
  pandeo: number;
  /** Infinity sin tope */
  topePandeo: number;
  bTrama: number;
  bUrdimbre: number;
  bBies: number;
  friccionCuerpo: number;
  friccionTela: number;
}

export function telaSI(t: TelaFisica): TelaSI {
  return {
    densidad: t.gramaje / 1000,
    grosor: t.grosor / 1000,
    kTrama: t.kTrama,
    kUrdimbre: t.kUrdimbre,
    kCizalla: t.kCizalla,
    pandeo: t.pandeo,
    topePandeo: t.topePandeo ?? TOPE_DE_PANDEO,
    bTrama: t.bTrama * 1e-6,
    bUrdimbre: t.bUrdimbre * 1e-6,
    bBies: t.bBies * 1e-6,
    friccionCuerpo: t.friccionCuerpo,
    friccionTela: t.friccionTela,
  };
}

/** Distancia que la tela guarda a un obstáculo (§4.3.1): la mitad de su grosor más 1 mm. */
export function separacion(t: TelaSI): number {
  return t.grosor / 2 + 0.001;
}

/**
 * Factor de pandeo de la ley de Choi y Ko (§4.1.4) para las telas que no traen uno medido. Se calibra con
 * `npm run bench:tela:calibrar` contra la referencia privada del disco Cusick en 5, 10 y 20 mm. Calibrado el
 * 2026-10-13 con la referencia privada del banco.
 */
export const PANDEO_CALIBRADO = 0.4;

/**
 * E9: el encogimiento (fracción) en que termina la meseta de pandeo de las telas que no traen uno medido; desde ahí
 * la tela vuelve a resistir como al estirar. Medido el 2026-10-16 con la camiseta a 5 mm en la GPU y el disco Cusick
 * en 5, 10 y 20 mm: con 0,1 los triángulos aplastados bajan de 1,53 a 0,28 % y el Cusick sigue cumpliendo (rango
 * 2,6); con 0,05 y 0,03 el Cusick pierde el rango.
 */
export const TOPE_DE_PANDEO = 0.1;
