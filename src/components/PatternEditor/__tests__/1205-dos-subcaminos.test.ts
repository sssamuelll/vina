/**
 * #1205 — `nearestSegment` trata un contorno de dos subcaminos como si fuera
 * uno solo.
 *
 * Con una pieza con agujero pasan dos cosas, y las dos se ven en pantalla:
 *
 *   1. **Inventa un lado que no se dibuja.** El recorrido de anclas no mira los
 *      límites de subcamino, así que fabrica un tramo entre la última ancla del
 *      anillo 1 y la `M` del anillo 2. Ese tramo no existe en el SVG y sin
 *      embargo es el blanco más cercano en una zona grande de la pieza.
 *   2. **Los dos cierres reales dejan de clicarse.** El tramo de cierre es uno
 *      solo, `anclas[última] → anclas[0]` —una cuerda fantasma que cruza la
 *      pieza entera— y se rotula con `outline.findIndex(c => c.type === 'Z')`,
 *      o sea con la PRIMERA `Z`, viva donde viva el clic.
 *
 * Es la tercera vía del mismo objeto, y las otras dos ya se pagaron: el RANGO
 * sin traducir (`rangoMedibleDeBorde`) y el ÍNDICE sin traducir
 * (`indiceSegunLosBordes`), las dos en `src/utils/semanticEdges.ts`, cuyas
 * cabeceras traen el caso medido. La cabecera de `rangoMedibleDeBorde` lo dice
 * con estas palabras: «con dos subcaminos —una pieza con agujero— devolvía el
 * cierre del OTRO, y el elástico o el pliegue se dibujaban sobre un borde
 * ajeno».
 *
 * Alcance del defecto: todo lo que hit-testea un lado — Coser, Piquete,
 * Margen, Elástico, Pliegue, Medir, Editar patrón y la caja de largo del lado.
 *
 * El contorno con varios subcaminos es alcanzable de verdad: `svgImport.ts`
 * acepta una `M` a media ruta, así que un `<path>` compuesto entra tal cual.
 */
import { describe, it, expect } from 'vitest';
import { nearestSegment, splitSegmentAt } from '../nodeEditorUtils';
import { parseSvgPathD } from '../../../utils/formats/svgImport';
import type { PathCommand } from '../../../types/types';

/**
 * Marco de 200×100 con un agujero de 100×40 centrado.
 * `M0 L1 L2 L3 Z4 M5 L6 L7 L8 Z9` — el fixture medido en el issue.
 */
const CON_AGUJERO: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
  { type: 'M', values: [50, 30] },
  { type: 'L', values: [150, 30] },
  { type: 'L', values: [150, 70] },
  { type: 'L', values: [50, 70] },
  { type: 'Z', values: [] },
];
const Z_EXTERIOR = 4;
const Z_AGUJERO = 9;

describe('#1205 — un contorno de dos subcaminos', () => {
  it('el cierre del anillo EXTERIOR se nombra con su propia Z', () => {
    // El lado izquierdo del marco, de (0,100) a (0,0): lo dibuja la Z del
    // primer subcamino.
    //
    // OJO con el índice: para el PRIMER anillo, `findIndex(Z)` coincide con su
    // propia `Z` por construcción, así que el código viejo también devolvía 4.
    // Lo que delataba el fallo no era el rótulo sino la GEOMETRÍA: rotulaba 4
    // pero medía la cuerda fantasma (50,70)→(0,0), a 30,69 mm y proyectando
    // fuera del lado. Por eso aquí se fija el punto proyectado, no solo el
    // índice: una aserción de identidad sola pasaba con el bug dentro.
    const hit = nearestSegment({ x: -2, y: 50 }, CON_AGUJERO);
    expect(hit).not.toBeNull();
    expect(hit!.commandIndex, 'el cierre del anillo exterior es su propia Z').toBe(Z_EXTERIOR);
    expect(hit!.distance, 'medía la cuerda fantasma, a 30,69 mm').toBeCloseTo(2, 6);
    expect(hit!.point.x, 'el punto cae sobre el lado izquierdo del marco').toBeCloseTo(0, 6);
    expect(hit!.point.y).toBeCloseTo(50, 6);
  });

  it('el cierre del AGUJERO se nombra con su propia Z, no con la del otro anillo', () => {
    // El lado izquierdo del agujero, de (50,70) a (50,30).
    const hit = nearestSegment({ x: 48, y: 50 }, CON_AGUJERO);
    expect(hit).not.toBeNull();
    expect(hit!.commandIndex, 'cada subcamino cierra con SU Z').toBe(Z_AGUJERO);
    expect(hit!.distance).toBeLessThan(5);
  });

  it('no inventa un tramo entre el final de un anillo y la M del siguiente', () => {
    // (25,65) cae sobre el tramo fantasma (0,100)→(50,30), que no se dibuja.
    // El lado real más cercano está a ~25 mm (el izquierdo del marco, x=0).
    // Hoy este punto engancha a 0 mm un tramo que la usuaria no ve.
    const hit = nearestSegment({ x: 25, y: 65 }, CON_AGUJERO);
    expect(hit).not.toBeNull();
    expect(
      CON_AGUJERO[hit!.commandIndex].type,
      'ningún hit puede caer sobre una M: ahí no se dibuja nada',
    ).not.toBe('M');
    expect(hit!.distance, 'el tramo inventado engancha a 0 mm donde no hay línea').toBeGreaterThan(15);
  });

  it('no inventa la cuerda que cruza la pieza entre el último anillo y el primero', () => {
    // (25,35) cae sobre la cuerda fantasma (50,70)→(0,0), que tampoco se
    // dibuja: es `anclas[última] → anclas[0]` saltándose los subcaminos.
    const hit = nearestSegment({ x: 25, y: 35 }, CON_AGUJERO);
    expect(hit).not.toBeNull();
    expect(hit!.distance, 'la cuerda fantasma engancha a 0 mm en mitad de la tela').toBeGreaterThan(15);
  });

  it('los lados dibujados de cada anillo siguen nombrándose por su comando', () => {
    expect(nearestSegment({ x: 100, y: -2 }, CON_AGUJERO)!.commandIndex).toBe(1);
    expect(nearestSegment({ x: 202, y: 50 }, CON_AGUJERO)!.commandIndex).toBe(2);
    expect(nearestSegment({ x: 100, y: 102 }, CON_AGUJERO)!.commandIndex).toBe(3);
    expect(nearestSegment({ x: 100, y: 32 }, CON_AGUJERO)!.commandIndex).toBe(6);
    expect(nearestSegment({ x: 148, y: 50 }, CON_AGUJERO)!.commandIndex).toBe(7);
    expect(nearestSegment({ x: 100, y: 68 }, CON_AGUJERO)!.commandIndex).toBe(8);
  });
});

describe('#1205 — la estela: consumidores que acertaban por casualidad', () => {
  it('partir el cierre del agujero inserta el punto SOBRE ese lado', () => {
    // `splitSegmentAt` resolvía el otro extremo del cierre con
    // `getAnchor(cmds[0])`, o sea la `M` del PRIMER subcamino, siempre. Con un
    // solo anillo acierta por casualidad; en cuanto el hit-test empezó a
    // nombrar la `Z` del agujero, interpola contra la esquina del marco y
    // deja el punto nuevo en mitad de la tela.
    //
    // Las dos hermanas del mismo archivo ya usan `getClosingAnchor`, que
    // retrocede hasta la `M` dueña de esa `Z`: `nodeEditorUtils.ts` en
    // `getEdgeEndpoints` y `splineSegment.ts`. Esta era la única que no.
    const out = splitSegmentAt(CON_AGUJERO, Z_AGUJERO, 0.5);
    expect(out.map(c => c.type)).toEqual(['M', 'L', 'L', 'L', 'Z', 'M', 'L', 'L', 'L', 'L', 'Z']);
    // El cierre del agujero va de (50,70) a (50,30): su punto medio es (50,50).
    expect(out[9].values, 'el punto nuevo cae sobre el lado del agujero').toEqual([50, 50]);
  });

  it('el cierre del anillo exterior se parte contra su propia M', () => {
    const out = splitSegmentAt(CON_AGUJERO, Z_EXTERIOR, 0.5);
    // Va de (0,100) a (0,0): el medio es (0,50).
    expect(out[4].values).toEqual([0, 50]);
    expect(out[5].type).toBe('Z');
  });
});

/**
 * Una `Z` TAMBIÉN cierra un subcamino, no solo una `M` abre uno.
 *
 * `svgImport.ts` (case 'Z') emite la `Z` y devuelve el punto actual al
 * arranque SIN emitir una `M` sintética, así que un `d="M… Z L… Z"` entra tal
 * cual. Si el recorrido no corta en la `Z`, los dos anillos se funden: vuelve
 * el tramo inventado y la primera `Z` queda inalcanzable porque la segunda
 * pisa su rótulo.
 */
const Z_SIN_M: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] },
  { type: 'L', values: [10, 10] },
  { type: 'Z', values: [] },
  { type: 'L', values: [50, 10] },
  { type: 'L', values: [60, 10] },
  { type: 'Z', values: [] },
];

describe('#1205 — una Z cierra el subcamino aunque no venga una M detrás', () => {
  it('tras la Z, el dibujo se reanuda en el arranque del subcamino anterior', () => {
    // En SVG, la `Z` devuelve el lápiz a (0,0) y el `L 50,10` que sigue dibuja
    // desde ahí. Ese lado es REAL y tiene que poder clicarse: su punto medio
    // es (25,5).
    const hit = nearestSegment({ x: 25, y: 5 }, Z_SIN_M);
    expect(hit!.commandIndex, 'el lado reanudado lo nombra su propio comando').toBe(4);
    expect(hit!.distance).toBeCloseTo(0, 6);
  });

  it('no inventa el tramo que une el final de un anillo con el siguiente', () => {
    // (30,10) está sobre (10,10)→(50,10), que NO se dibuja: el anillo cerró
    // en (10,10) y el lápiz volvió a (0,0).
    //
    // El umbral exacto importa. Con `toBeGreaterThan(1)` este test no
    // distinguía «quité el fantasma» de «me cargué el lado reanudado»: las
    // dos respuestas lo pasaban. La distancia correcta al lado (0,0)→(50,10)
    // es 3,922; si el reanudado desapareciera, saltaría a 20.
    const hit = nearestSegment({ x: 30, y: 10 }, Z_SIN_M);
    expect(hit!.distance).toBeCloseTo(3.922, 3);
    expect(hit!.commandIndex).toBe(4);
  });

  it('el subcamino reanudado cierra contra el arranque que heredó', () => {
    // Su `Z` va de (60,10) a (0,0); el punto medio es (30,5).
    const hit = nearestSegment({ x: 30, y: 5 }, Z_SIN_M);
    expect(hit!.commandIndex).toBe(6);
    expect(hit!.distance).toBeCloseTo(0, 6);
  });

  it('el cierre del primer anillo sigue siendo alcanzable', () => {
    // El triángulo cierra por la diagonal (10,10)→(0,0). Un punto casi encima
    // de ella tiene que caer en su `Z`, la de índice 3.
    //
    // El primer intento de este fixture era `M L Z`: con dos anclas el lado
    // dibujado y el de cierre son LA MISMA recta, así que el test no podía
    // distinguirlos y fallaba después del arreglo. Hace falta un anillo de
    // tres anclas para que el cierre tenga geometría propia.
    const hit = nearestSegment({ x: 5, y: 5.2 }, Z_SIN_M);
    expect(hit!.commandIndex, 'la segunda Z pisaba el rótulo de la primera').toBe(3);
  });

  it('dos Z seguidas no mueven el rótulo del cierre a la redundante', () => {
    const dosZ: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'Z', values: [] },
      { type: 'Z', values: [] },
    ];
    expect(nearestSegment({ x: -2, y: 50 }, dosZ)!.commandIndex).toBe(3);
  });

  it('un contorno que no abre con M no nombra un lado dibujado como si fuera el cierre', () => {
    // El validador pone en cuarentena estas piezas (`OUTLINE_NO_M`), pero un
    // outline construido en sesión llega aquí antes de validarse. El cierre
    // fantasma se rotulaba con `0`, que aquí es una `L` — y los tres guardas
    // que existen para rechazarlo comparan contra `'M'`, así que pasaba.
    const sinM: PathCommand[] = [
      { type: 'L', values: [0, 0] },
      { type: 'L', values: [10, 0] },
      { type: 'L', values: [10, 10] },
      { type: 'M', values: [50, 50] },
      { type: 'L', values: [60, 50] },
      { type: 'L', values: [60, 60] },
      { type: 'Z', values: [] },
    ];
    // (5, 5.1) cae casi encima de la cuerda (10,10)→(0,0), a 0,07 mm. Esa
    // cuerda es el cierre fantasma de un subcamino que no tiene `M`, así que
    // no debe existir: el lado real más cercano está a 5 mm.
    //
    // Afirmar «el índice no es una L» no valdría: el vecino legítimo TAMBIÉN
    // es una L. Lo que distingue al fantasma es la distancia.
    const hit = nearestSegment({ x: 5, y: 5.1 }, sinM);
    expect(hit).not.toBeNull();
    // 5,0 exactos: el lado (10,0)→(10,10). Un umbral flojo no distinguiría
    // esto de haber descartado el subcamino entero, que daría 63,57.
    expect(
      hit!.distance,
      'el cierre fantasma de un subcamino sin M engancha a 0,07 mm',
    ).toBeCloseTo(5, 6);
    expect(hit!.commandIndex).toBe(2);
  });
});

/**
 * La premisa de alcanzabilidad, probada en vez de leída.
 *
 * Todo este issue se apoya en que un `<path>` compuesto entra como un contorno
 * de varios subcaminos. Eso estaba argumentado leyendo `svgImport.ts`, no
 * corriéndolo — y una premisa leída es justo lo que permite cerrar algo con un
 * «esto no pasa en la práctica».
 */
describe('#1205 — un <path> compuesto entra de verdad como varios subcaminos', () => {
  it('parseSvgPathD conserva las dos M y las dos Z', () => {
    const cmds = parseSvgPathD('M0,0 L200,0 L200,100 L0,100 Z M50,30 L150,30 L150,70 L50,70 Z');
    expect(cmds.map(c => c.type).join('')).toBe('MLLLZMLLLZ');
    expect(cmds.filter(c => c.type === 'M')).toHaveLength(2);
  });

  it('y el hit-test sobre ESE contorno nombra el cierre de cada anillo', () => {
    const cmds = parseSvgPathD('M0,0 L200,0 L200,100 L0,100 Z M50,30 L150,30 L150,70 L50,70 Z');
    expect(nearestSegment({ x: -2, y: 50 }, cmds)!.commandIndex).toBe(4);
    expect(nearestSegment({ x: 48, y: 50 }, cmds)!.commandIndex).toBe(9);
  });

  it('una Z sin M detrás también sobrevive al parseo', () => {
    // Es la forma que justifica el arranque heredado: el `case 'Z'` del
    // importador devuelve el punto al arranque y NO emite una M sintética.
    const cmds = parseSvgPathD('M0,0 L10,0 L10,10 Z L50,10 L60,10 Z');
    expect(cmds.map(c => c.type).join('')).toBe('MLLZLLZ');
  });
});
