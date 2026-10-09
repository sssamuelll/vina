import { describe, it, expect } from 'vitest';
import { fraseDeLaFase, fraseDelPie, LO_QUE_SE_PONE, LO_QUE_SE_PONE_EL_PUNTO, type FaseDeLaHerramienta } from '../fraseDeLaFase';
import { displayModifierKey } from '../../shell/shortcutDisplay';

/**
 * La frase de la línea al pie (spec 2026-10-02 «la interfaz en papel» § 5.4).
 * Sustituye a los tests de `HintText` (un `<text>` de SVG al pie del lienzo
 * hasta P2b) con el mismo criterio: se asevera el SIGNIFICADO que la frase
 * tiene que transmitir, no su redacción, que afina `solace-wren`. Lo que sí se
 * fija con exactitud son las teclas: ninguna puede perder su único anuncio.
 */
const base: FaseDeLaHerramienta = { activeTool: 'select', penNodesLength: 0, nodeEditorIsEditing: false };
const frase = (f: Partial<FaseDeLaHerramienta>) => fraseDeLaFase({ ...base, ...f }) ?? '';
const shift = displayModifierKey('⇧');

describe('coser', () => {
  it('en reposo contrasta el clic (el lado entero) con el arrastre (un tramo)', () => {
    const f = frase({ activeTool: 'seam', seamPhase: 'idle' });
    expect(f).toMatch(/clic/i);
    expect(f).toMatch(/arrastr/i);
    expect(f).toMatch(/entero/i);
    expect(f).toMatch(/tramo/i);
  });

  it('sosteniendo la primera mitad pide la otra pieza y nombra la salida', () => {
    const f = frase({ activeTool: 'seam', seamPhase: 'holdingA' });
    expect(f).toMatch(/otra pieza/i);
    expect(f).toMatch(/esc/i);
  });
});

describe('editar costuras', () => {
  it('dice que el clic revela con qué está cosido', () => {
    expect(frase({ activeTool: 'seamEdit' })).toMatch(/cosid/i);
  });

  it('sin ninguna costura, invita a coser primero (#1098)', () => {
    expect(frase({ activeTool: 'seamEdit', hasSeams: false })).toMatch(/cose primero/i);
  });
});

describe('la línea interna', () => {
  it('sin trazo dice dónde empezar y que hay enganche', () => {
    const f = frase({ activeTool: 'internalShape', internalShapeNodesLength: 0 });
    expect(f).toMatch(/pieza/i);
    expect(f).toMatch(/esquina|borde|engancha/i);
  });

  it('con trazo nombra sus cuatro teclas: Tab, Enter, Retroceso y Esc', () => {
    const f = frase({ activeTool: 'internalShape', internalShapeNodesLength: 2 });
    expect(f).toMatch(/\bTab\b/);
    expect(f).toMatch(/\bEnter\b/);
    expect(f).toMatch(/Retroceso/);
    expect(f).toMatch(/\bEsc\b/);
  });
});

describe('la pluma', () => {
  it('sin puntos dice cómo empezar, haya piezas o no (antes solo lo decía en una hoja vacía)', () => {
    const f = frase({ activeTool: 'pen', penNodesLength: 0 });
    expect(f).toMatch(/clic/i);
    expect(f).toMatch(/arrastr/i);
  });

  it('con puntos nombra Tab, cerrar, Enter, Retroceso y Esc, y qué deja Enter', () => {
    const f = frase({ activeTool: 'pen', penNodesLength: 2 });
    expect(f).toMatch(/\bTab\b/);
    expect(f).toMatch(/cierra/i);
    expect(f).toMatch(/\bEnter\b/);
    expect(f).toMatch(/Retroceso/);
    expect(f).toMatch(/\bEsc\b/);
    expect(f).toMatch(/trazo con dos/i);
  });
});

describe('el rectángulo', () => {
  it('dice con qué tamaño crea un clic, que sus cotas se escriben y que se arrastra', () => {
    const f = frase({ activeTool: 'rectangle', rectanguloPorDefecto: { width: 300, height: 150 } });
    expect(f).toContain('300 × 150 mm');
    expect(f).toMatch(/cotas/i);
    expect(f).toMatch(/arrastr/i);
  });
});

describe('las cotas', () => {
  it('con cotas visibles, Seleccionar y Transformar nombran la cota, el arrastre y Tab', () => {
    for (const activeTool of ['select', 'transform'] as const) {
      const f = frase({ activeTool, cotasVisibles: true });
      expect(f).toMatch(/escribirla/i);
      expect(f).toMatch(/arrástrala/i);
      expect(f).toMatch(/\bTab\b/);
    }
  });

  it('Transformar sin cotas no tiene frase: lo que le falta lo dice `falta`', () => {
    expect(fraseDeLaFase({ ...base, activeTool: 'transform' })).toBeNull();
  });
});

describe('la etiqueta de lo elegido (P3c)', () => {
  it('el piquete: su distancia se escribe con clic y la etiqueta cambia lo demás; gana a la de las cotas', () => {
    const f = frase({ activeTool: 'select', cotasVisibles: true, etiqueta: 'piquete' });
    expect(f).toMatch(/distancia/i);
    expect(f).toMatch(/etiqueta/i);
    expect(f).toMatch(/forma/i);
    expect(f).toMatch(/\bEsc\b/);
    // Un piquete no se arrastra (P3b): la frase de las cotas lo prometería.
    expect(f).not.toMatch(/arrástrala/i);
  });

  it('la esquina del margen: la etiqueta cambia su tipo', () => {
    const f = frase({ activeTool: 'select', etiqueta: 'esquina' });
    expect(f).toMatch(/etiqueta/i);
    expect(f).toMatch(/tipo de esquina/i);
    expect(f).toMatch(/\bEsc\b/);
  });
});

describe('el hilo (#1107)', () => {
  it('se arrastra dentro de la pieza y Shift engancha 0°, 45° y 90°', () => {
    const f = frase({ activeTool: 'grainline' });
    expect(f).toMatch(/pieza/i);
    expect(f).toMatch(/arrastr/i);
    expect(f).toMatch(/shift|⇧/i);
    expect(f).toMatch(/0°/);
    expect(f).toMatch(/90°/);
  });
});

describe('desplazar contorno y extender / recortar (#1178)', () => {
  it('Desplazar contorno dice que Enter aplica, y ya no habla de la tira', () => {
    const f = frase({ activeTool: 'offsetOutline' });
    expect(f).toMatch(/\bEnter\b/);
    expect(f).toMatch(/aplica/i);
    expect(f).not.toMatch(/tira/i);
  });

  it('extender, sin extremo: cómo empezar', () => {
    expect(frase({ activeTool: 'extendTrim', extendTrimMode: 'extend', extendTrimArmed: false })).toMatch(/extend/i);
  });

  it('extender, con extremo: Enter confirma', () => {
    expect(frase({ activeTool: 'extendTrim', extendTrimMode: 'extend', extendTrimArmed: true })).toMatch(/\bEnter\b/);
  });

  it('recortar, sin punto: cómo empezar, sin hablar de extender', () => {
    const f = frase({ activeTool: 'extendTrim', extendTrimMode: 'trim', extendTrimArmed: false });
    expect(f).toMatch(/recort/i);
    expect(f).not.toMatch(/extend/i);
  });

  it('recortar, con punto: el clic decide el lado', () => {
    expect(frase({ activeTool: 'extendTrim', extendTrimMode: 'trim', extendTrimArmed: true })).toMatch(/lado|Enter/);
  });
});

describe('Shift anuncia la otra guía (spec 2026-09-23 § 4.2)', () => {
  it('con Shift y un borde que elegir, dice cómo llegar a él', () => {
    expect(frase({ activeTool: 'pen', penNodesLength: 2, modoShift: 'hoja', segundoMarco: 'border' }))
      .toBe(`${shift}: al eje · ${shift} dos veces: al borde`);
  });

  it('con el borde activo, dice cómo volver al eje', () => {
    expect(frase({ activeTool: 'pen', penNodesLength: 2, modoShift: 'borde', segundoMarco: 'border' }))
      .toBe(`${shift} dos veces: al borde · una vez: al eje`);
  });

  it('desde el segundo tramo el otro marco es el tramo', () => {
    expect(frase({ activeTool: 'pen', penNodesLength: 2, modoShift: 'hoja', segundoMarco: 'segment' }))
      .toBe(`${shift}: al eje · ${shift} dos veces: al tramo`);
  });

  it('sin segundo marco, o sin Shift, la frase de la herramienta', () => {
    expect(frase({ activeTool: 'pen', penNodesLength: 2, modoShift: 'hoja', segundoMarco: null })).toMatch(/\bTab\b/);
    expect(frase({ activeTool: 'pen', penNodesLength: 2, modoShift: 'suelto', segundoMarco: 'border' })).toMatch(/\bTab\b/);
  });

  it('también en la Línea interna y en Editar patrón; el Hilo no cambia', () => {
    expect(frase({ activeTool: 'internalShape', internalShapeNodesLength: 1, modoShift: 'hoja', segundoMarco: 'border' }))
      .toBe(`${shift}: al eje · ${shift} dos veces: al borde`);
    expect(frase({ activeTool: 'editPattern', modoShift: 'borde', segundoMarco: 'border' }))
      .toBe(`${shift} dos veces: al borde · una vez: al eje`);
    expect(frase({ activeTool: 'grainline', modoShift: 'hoja', segundoMarco: 'border' })).toMatch(/hilo/i);
  });

  it('con el editor de nodos abierto, solo su frase', () => {
    expect(frase({ activeTool: 'editPattern', nodeEditorIsEditing: true, modoShift: 'hoja', segundoMarco: 'border' }))
      .toBe('Editando nodos · arrastra para mover · Esc para salir');
  });
});

describe('las cuatro que estrenan frase (spec § 5.4)', () => {
  it('Punto dice qué hace el clic en cada uno de sus tres modos', () => {
    expect(frase({ activeTool: 'point', modoDelPunto: 'point' })).toMatch(/añade un punto/i);
    expect(frase({ activeTool: 'point', modoDelPunto: 'curvePoints' })).toMatch(/curva por puntos/i);
    expect(frase({ activeTool: 'point', modoDelPunto: 'bezier' })).toMatch(/bezier/i);
    expect(frase({ activeTool: 'point' }), 'sin modo, el de fábrica').toMatch(/añade un punto/i);
  });

  it('Piquete dice dónde se hace clic', () => {
    expect(frase({ activeTool: 'notch' })).toMatch(/borde/i);
  });

  it('Medir: dos puntos, y con el primero puesto, cómo soltarlo', () => {
    expect(frase({ activeTool: 'measure' })).toMatch(/dos puntos/i);
    expect(frase({ activeTool: 'measure', medidaEmpezada: true })).toMatch(/\bEsc\b/);
  });

  it('Tijeras: dos clics en el contorno (no se arrastra), y Esc para empezar de nuevo', () => {
    const empieza = frase({ activeTool: 'scissors' });
    expect(empieza).toMatch(/empieza/i);
    expect(empieza).not.toMatch(/arrastr/i);
    const termina = frase({ activeTool: 'scissors', tijerasEmpezadas: true });
    expect(termina).toMatch(/termina/i);
    expect(termina).toMatch(/\bEsc\b/);
  });
});

describe('la cota de lo que se pone (spec 2026-10-02 § 5.2)', () => {
  it('con la cota del piquete abierta, la frase dice cómo terminar de ponerlo, con cualquier herramienta', () => {
    for (const activeTool of ['notch', 'select'] as const) {
      expect(fraseDeLaFase({ ...base, activeTool, loQueSePone: 'piquete' })).toBe(LO_QUE_SE_PONE);
    }
    expect(LO_QUE_SE_PONE).toBe('Escribe la distancia · Enter fija · Esc no lo mueve');
  });

  it('la del punto descansa en reposo: la frase dice que se abre con un clic, y cómo se cierra', () => {
    expect(fraseDeLaFase({ ...base, activeTool: 'point', loQueSePone: 'punto' })).toBe(LO_QUE_SE_PONE_EL_PUNTO);
    expect(LO_QUE_SE_PONE_EL_PUNTO).toMatch(/clic/i);
    expect(LO_QUE_SE_PONE_EL_PUNTO).toMatch(/\bEsc\b/);
  });
});

/** Cada herramienta 2D con frase, en cada una de sus fases. */
const TODAS: Array<Partial<FaseDeLaHerramienta>> = [
  { activeTool: 'select' }, { activeTool: 'select', cotasVisibles: true }, { activeTool: 'transform', cotasVisibles: true },
  { activeTool: 'select', nodeEditorIsEditing: true }, { activeTool: 'editPattern' },
  { activeTool: 'point', modoDelPunto: 'point' }, { activeTool: 'point', modoDelPunto: 'curvePoints' }, { activeTool: 'point', modoDelPunto: 'bezier' },
  { activeTool: 'pen' }, { activeTool: 'pen', penNodesLength: 2 },
  { activeTool: 'internalShape' }, { activeTool: 'internalShape', internalShapeNodesLength: 2 },
  { activeTool: 'rectangle', rectanguloPorDefecto: { width: 300, height: 150 } }, { activeTool: 'circle' }, { activeTool: 'triangle' },
  { activeTool: 'grainline' },
  { activeTool: 'scissors' }, { activeTool: 'scissors', tijerasEmpezadas: true },
  { activeTool: 'measure' }, { activeTool: 'measure', medidaEmpezada: true },
  { activeTool: 'seam', seamPhase: 'idle' }, { activeTool: 'seam', seamPhase: 'holdingA' },
  { activeTool: 'seamEdit', hasSeams: false }, { activeTool: 'seamEdit', hasSeams: true },
  { activeTool: 'seamAllowance', saDefaultWidthMm: 10 }, { activeTool: 'notch' }, { activeTool: 'notch', loQueSePone: 'piquete' }, { activeTool: 'point', loQueSePone: 'punto' },
  { activeTool: 'topstitchSeamline', topstitchMode: 'seamline' }, { activeTool: 'topstitchSegment', topstitchMode: 'segment' },
  { activeTool: 'topstitchFree', topstitchMode: 'free' }, { activeTool: 'topstitchEdit', topstitchMode: 'edit' },
  { activeTool: 'hand' }, { activeTool: 'measureCurve' }, { activeTool: 'compareCurves' }, { activeTool: 'offsetOutline' },
  { activeTool: 'extendTrim', extendTrimMode: 'extend' }, { activeTool: 'extendTrim', extendTrimMode: 'extend', extendTrimArmed: true },
  { activeTool: 'extendTrim', extendTrimMode: 'trim' }, { activeTool: 'extendTrim', extendTrimMode: 'trim', extendTrimArmed: true },
  ...['idle', 'drawingSlash', 'slashComplete', 'selectingHalf', 'halfConfirmed', 'awaitingDrag', 'spreading', 'spreadPreview']
    .map((slashPhase) => ({ activeTool: 'slashAndSpread' as const, slashPhase })),
  { activeTool: 'trimPlace' },
  { activeTool: 'walkSeam', walkSeamPhase: 'idle' }, { activeTool: 'walkSeam', walkSeamPhase: 'stationary' }, { activeTool: 'walkSeam', walkSeamPhase: 'walking' },
];

describe('cada frase, en español y en una línea', () => {
  // Regla dura del glosario: cero mezcla de idiomas en una superficie.
  const DELATORES = /\b(click|drag|to move|to exit|to apply|across|corner type|editing|nodes|width)\b/i;

  it.each(TODAS.map((f) => [`${f.activeTool} ${JSON.stringify(f)}`, f] as const))('%s', (_, f) => {
    const texto = fraseDeLaFase({ ...base, ...f });
    expect(texto, 'sin frase').toBeTruthy();
    expect(texto).not.toMatch(DELATORES);
    expect(texto, 'la tira ya no existe').not.toMatch(/\btira\b/i);
    // Sin opciones, a 1366 caben ~200 caracteres: 160 es un tope de prudencia.
    expect(texto!.length, `«${texto}» no cabe en una línea ni sin opciones`).toBeLessThanOrEqual(160);
    expect(texto!.endsWith('.'), 'es una etiqueta: sin punto final').toBe(false);
  });

  it('las de las herramientas con muchas opciones caben en su hueco', () => {
    // Estimado a 1366 px y 6,2 px por carácter; el e2e de la línea al pie lo mide de verdad.
    const PRESUPUESTO: Array<[Partial<FaseDeLaHerramienta>, number]> = [
      [{ activeTool: 'internalShape', internalShapeNodesLength: 2 }, 85],
      [{ activeTool: 'notch' }, 55],
      [{ activeTool: 'notch', loQueSePone: 'piquete' }, 55],
      [{ activeTool: 'point', loQueSePone: 'punto' }, 85],
      [{ activeTool: 'scissors', tijerasEmpezadas: true }, 85],
      [{ activeTool: 'topstitchSeamline', topstitchMode: 'seamline' }, 40],
      [{ activeTool: 'topstitchSegment', topstitchMode: 'segment' }, 40],
      ...['drawingSlash', 'awaitingDrag', 'spreadPreview'].map((slashPhase) => [{ activeTool: 'slashAndSpread' as const, slashPhase }, 65] as [Partial<FaseDeLaHerramienta>, number]),
    ];
    const largas = PRESUPUESTO
      .map(([f, max]) => [fraseDeLaFase({ ...base, ...f }) ?? '', max] as const)
      .filter(([texto, max]) => texto.length > max)
      .map(([texto, max]) => `${texto.length}/${max} «${texto}»`);
    expect(largas).toEqual([]);
  });
});

describe('la prioridad de la frase (spec § 5.4)', () => {
  it('el desenlace gana a lo que falta, y lo que falta a la frase de la fase', () => {
    expect(fraseDelPie('se murió', 'falta', 'fase')).toEqual({ texto: 'se murió', tipo: 'desenlace' });
    expect(fraseDelPie(null, 'falta', 'fase')).toEqual({ texto: 'falta', tipo: 'falta' });
    expect(fraseDelPie(null, null, 'fase')).toEqual({ texto: 'fase', tipo: 'fase' });
    expect(fraseDelPie(null, null, null)).toBeNull();
  });
});
