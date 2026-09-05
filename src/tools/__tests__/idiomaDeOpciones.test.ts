import { describe, it, expect } from 'vitest';
import { toolRegistry } from '../index';
import { TRIM_LIBRARY } from '../../utils/trim/trimLibrary';

/**
 * Idioma de las opciones de herramienta (#1049).
 *
 * De las 91 opciones declaradas en el repo, hasta esta rama exactamente UNA
 * tenía la etiqueta en español. Nadie lo vio nunca porque ninguna se pintaba:
 * el único consumidor de `tool.options` era el schema del copiloto. Encender
 * la barra las pone en pantalla.
 *
 * Esta instantánea congelada cubre las 23 herramientas 2D CON OPCIONES que
 * María puede activar hoy (`polyPen` murió con la unificación de líneas
 * internas, spec 2026-08-29; `pen` sigue activable pero sin opciones, cubierta
 * aparte; `hand` tampoco declara ninguna). Eran 19 hasta el 2026-09-05, cuando
 * cinco herramientas que tenían gesto y ninguna puerta entraron al catálogo del
 * dock — cuatro de ellas con opciones, y las cuatro rotuladas en inglés, que es
 * la mitad de idioma del mismo defecto. Una etiqueta nueva en inglés
 * rompe el test, y el último caso rompe también si alguien AÑADE una opción a
 * una herramienta cubierta sin traducirla. Es lo único que impide que la
 * próxima herramienta reintroduzca la deriva que esta rama arregla.
 *
 * Los `value` de los `choices` NO se traducen: son identificadores
 * ('curvePoints', 'flat-felled', 'outward'), no texto.
 *
 * `flat-felled` se queda en inglés, igual que `overlock`: término de industria
 * que no se traduce (glosario, regla 4). Las tres candidatas en español tenían
 * problema — *ribeteada* en taller suele significar overlock y caería en ESTE
 * mismo desplegable, *rebatida* es regional, *tipo jean* es coloquial. Antes
 * que arriesgar una palabra equivocada en la pantalla de una patronista, se
 * deja la del oficio. Spec §5.3.
 */

/** toolId → optionId → [label, ...etiquetas de los choices] */
const ESPERADO: Record<string, Record<string, string[]>> = {
  // ── Las del dock de fábrica ─────────────────────────────────────────────
  point: {
    mode: ['Tipo de punto', 'Punto', 'Curva por puntos', 'Curva bezier'],
  },
  rectangle: {
    width: ['Ancho'],
    height: ['Alto'],
  },
  internalShape: {
    nodeType: ['Tipo de punto', 'Recta', 'Curva por puntos'],
    lineType: ['Tipo de línea', 'Referencia', 'Doblez', 'Pespunte'],
  },
  scissors: {
    autoSew: ['Coser el corte automáticamente'],
    seamType: ['Tipo de costura', 'Normal', 'Francesa', 'Flat-felled', 'Overlock'],
  },
  measure: {
    showAngle: ['Mostrar el ángulo'],
    cumulative: ['Distancia acumulada'],
  },
  // #1110 (María audio 30-08): `stitchLength` era decorativo — ningún
  // consumidor de `toolOptions.seam` lo lee (ni 2D, ni 3D, ni WASM), y
  // `Seam` ni siquiera tiene el campo. Se quitó en vez de mudarlo a un
  // sitio "por decidir" — ver docs/reports (#1110).
  seam: {
    seamType: ['Tipo de costura', 'Normal', 'Francesa', 'Flat-felled', 'Overlock'],
  },
  notch: {
    shape: [
      'Forma del piquete',
      'Recta',
      'En T',
      'V hacia adentro',
      'V hacia afuera',
      'En U',
      'Almena',
      'Rombo',
    ],
    length: ['Profundidad (mm)'],
    count: ['Cantidad', 'Uno', 'Dos', 'Tres'],
  },

  // ── Las que se alcanzan por atajo ───────────────────────────────────────
  transform: {
    mode: ['Transformación', 'Escalar', 'Girar', 'Inclinar'],
    uniform: ['Escalar proporcional'],
  },
  circle: {
    // El Arco salió del selector al nacer la herramienta: es un camino ABIERTO
    // y `addPiece` asume pieza cerrada (el 3D extruye con THREE.Shape, y
    // `commandsToShape` descarta el comando 'A' en silencio). Como línea
    // interna ya existe `internalShape`.
    shapeType: ['Figura', 'Círculo', 'Elipse'],
    radius: ['Radio'],
  },
  trace: {
    offset: ['Separación (mm)'],
  },
  dart: {
    dartWidth: ['Ancho (mm)'],
    // No es traducción, es oficio: en una pinza el "depth" del inglés va de la
    // boca al vértice, y eso es el LARGO. La profundidad es de piquete.
    dartDepth: ['Largo (mm)'],
    capShape: ['Forma de la punta', 'En punta', 'Curva', 'Plana', 'Rombo'],
    segments: ['Tramos'],
  },
  pin: {
    pinStrength: ['Fuerza de la fijación', 'Suave', 'Media', 'Fuerte'],
  },
  walkSeam: {
    tolerance: ['Tolerancia', '1 mm', '3 mm', '5 mm'],
    // El "ghost" es la copia translúcida de la pieza que se recorre. En el
    // oficio eso es un calco.
    ghostOpacity: ['Opacidad del calco'],
  },
  pomMeasure: {
    method: ['Método', 'En línea recta', 'Siguiendo el borde'],
    defaultCategory: ['Categoría', 'Largo', 'Ancho', 'Otra'],
  },
  offsetOutline: {
    distance: ['Distancia (mm)'],
    direction: ['Dirección', 'Hacia afuera', 'Hacia adentro', 'Las dos'],
    joinType: ['Unión de esquinas', 'Redondeada', 'En punta', 'Achaflanada'],
    replace: ['Reemplazar el original'],
  },
  extendTrim: {
    mode: ['Acción', 'Extender', 'Recortar'],
    distance: ['Distancia (mm)'],
  },
  topstitchFree: {
    stitchType: ['Tipo de puntada', 'Recta', 'Zigzag', 'Triple'],
    stitchLength: ['Largo de puntada (mm)'],
    threadColor: ['Color del hilo'],
  },
  topstitchSeamline: {
    stitchType: ['Tipo de puntada', 'Recta', 'Zigzag', 'Triple'],
    stitchLength: ['Largo de puntada (mm)'],
    offset: ['Separación (mm)'],
    threadColor: ['Color del hilo'],
  },
  topstitchSegment: {
    stitchType: ['Tipo de puntada', 'Recta', 'Zigzag', 'Triple'],
    stitchLength: ['Largo de puntada (mm)'],
    offset: ['Separación (mm)'],
    threadColor: ['Color del hilo'],
  },

  // ── Las cuatro que estrenaron puerta el 2026-09-05 ──────────────────────
  // Estaban en inglés por la misma razón por la que no tenían botón: nadie
  // traduce lo que nadie puede ver. Entran aquí el mismo día que al catálogo.
  measureCurve: {
    // Mismo rótulo que compareCurves: es la misma opción del mismo motor, y un
    // término por concepto (§ 5 del contrato).
    markerInterval: ['Marcas cada', '25 mm', '50 mm', '100 mm'],
  },
  compareCurves: {
    markerInterval: ['Marcas cada', '25 mm', '50 mm', '100 mm'],
  },
  slashAndSpread: {
    mode: ['Cómo se abre', 'Girando (ángulo)', 'En paralelo (distancia)'],
    gapFill: ['El hueco se cierra', 'Con una recta', 'Con una curva'],
  },
  trimPlace: {
    // Los 21 avíos NO se copian a mano aquí: el desplegable los saca de
    // `nameEs`, que la biblioteca ya traía escrito. Escribirlos literalmente
    // convertiría este trinquete en una copia de la biblioteca —cada avío nuevo
    // rompería el test aunque llegara bien traducido— y no comprobaría lo
    // único que hay que fijar, que es de qué campo salen. Que ese campo esté
    // de verdad en español lo mide el caso de más abajo.
    trimPreset: ['Avío', ...TRIM_LIBRARY.map((p) => p.nameEs)],
    placementMode: ['Cómo se ponen', 'Uno', 'Repartidos por el borde'],
    distributeCount: ['Cuántos'],
    startOffset: ['Desde el principio (mm)'],
    endOffset: ['Hasta el final (mm)'],
  },
};

describe('idioma de las opciones de herramienta', () => {
  for (const [toolId, opciones] of Object.entries(ESPERADO)) {
    it(`${toolId}: etiquetas en español`, () => {
      const definicion = toolRegistry.getTool(toolId);
      expect(definicion, `${toolId} no está registrada`).toBeDefined();

      for (const [optionId, cadenas] of Object.entries(opciones)) {
        const opcion = definicion!.options?.find((o) => o.id === optionId);
        expect(opcion, `${toolId}.${optionId} no existe`).toBeDefined();

        const reales = [
          opcion!.label,
          ...(opcion!.choices?.map((c) => c.label) ?? []),
        ];
        expect(reales, `${toolId}.${optionId}`).toEqual(cadenas);
      }
    });
  }

  it('la pluma no declara opciones que no lee', () => {
    // smoothing / snapGrid / constrainAngles se pintaban y usePenTool nunca las
    // leía (§ 2 del spec 2026-08-29): se borran en vez de implementarse.
    expect(toolRegistry.getTool('pen')!.options ?? []).toEqual([]);
  });

  it('no hay opciones sin cubrir en las herramientas listadas', () => {
    // El trinquete de verdad: si alguien AÑADE una opción a una herramienta
    // cubierta y no la traduce, esto falla aunque no haya tocado las que ya
    // estaban.
    for (const [toolId, opciones] of Object.entries(ESPERADO)) {
      const declaradas = toolRegistry.getTool(toolId)!.options?.map((o) => o.id) ?? [];
      expect(declaradas.slice().sort(), toolId).toEqual(Object.keys(opciones).sort());
    }
  });

  it('el desplegable de avíos lee la columna española, no la inglesa', () => {
    // El defecto que esto caza: `label: p.name` en vez de `p.nameEs`. Los dos
    // campos existen, los dos son string, y TypeScript no ve la diferencia —
    // `nameEs` fue uno de los ocho contratos que la auditoría del 2026-08-14
    // encontró escritos y rodeados. Comparar contra `name` es lo único que
    // distingue "lee el campo bueno" de "lee un campo".
    const etiquetas = toolRegistry.getTool('trimPlace')!.options!
      .find((o) => o.id === 'trimPreset')!.choices!.map((c) => c.label);
    const enIngles = TRIM_LIBRARY.filter((p) => etiquetas.includes(p.name)).map((p) => p.name);
    expect(enIngles, 'hay avíos rotulados con su nombre inglés').toEqual([]);
    expect(etiquetas).toHaveLength(TRIM_LIBRARY.length);
  });

  it('los identificadores de los choices siguen en inglés', () => {
    // Los `value` son ids que el copiloto usa en su enum y que los hooks leen.
    // Traducirlos rompería el despacho en silencio.
    expect(
      toolRegistry.getTool('point')!.options![0].choices!.map((c) => c.value),
    ).toEqual(['point', 'curvePoints', 'bezier']);
    expect(
      toolRegistry.getTool('seam')!.options![0].choices!.map((c) => c.value),
    ).toEqual(['standard', 'french', 'flat-felled', 'overlock']);
  });
});
