import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SHORTCUTS, ATAJOS_2D_SIN_GESTO } from '../../../shortcuts/defaults';
import { toolRegistry } from '../../../tools';
import { DOCK_2D_CATALOG } from '../../shell/dock2dTools';

/**
 * #1111 (tanda 8) — María pidió «círculo y triángulo». El círculo nació en el
 * commit `e86b0216`; este es el triángulo, calcado de esa misma plantilla
 * (`circulo-nace-con-gesto.test.ts`).
 *
 * Decisiones ya cerradas por el círculo y que este trabajo NO reabre —están
 * escritas aquí para poder discutirlas de todos modos:
 *
 * 1. **Herramienta propia, no un selector «Formas» dentro de Rectángulo.**
 *    `triangle.tsx` es hermano de `circle.tsx`, con su propio `shapeType`.
 *
 * 2. **Dos figuras en la barra**, como círculo/elipse: isósceles —ápice
 *    arriba-centro, por defecto— y rectángulo —ángulo recto en la esquina
 *    del press, la misma gramática de «ancla en la esquina» que Rectángulo y
 *    Círculo establecieron—.
 *
 * 3. **Etiquetas «Base» y «Altura»**, no «Ancho»/«Alto»: son las palabras del
 *    propio issue y el vocabulario del triángulo. Las cotas vivas sobre el
 *    lienzo siguen diciendo «Ancho de la pieza»/«Alto de la pieza» porque
 *    `cotasDePieza()` es genérica — eso es correcto y no se toca.
 *
 * 4. **Sin atajo de teclado.** Las cinco herramientas de la tanda 6 entraron
 *    sin uno («repartir mnemónicos inventados enseñaría un hábito que CLO
 *    rompe») y el triángulo entra igual.
 */

const lee = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');
const DESPACHADOR = lee('src/components/PatternEditor/useEditorInteractions.ts');

describe('el triángulo tiene gesto de verdad', () => {
  it('el despachador lo conduce, no solo lo activa', () => {
    // Es la condición que F7 midió: activar sin conducir es la trampa.
    expect(/activeTool\s*===\s*'triangle'/.test(DESPACHADOR), 'el despachador no enruta triangle').toBe(true);
  });

  it('está enganchado en las cuatro puertas del gesto, como sus hermanos', () => {
    // rectTool/circleTool aparecen en mousedown, mousemove, mouseup y
    // pointercancel. Si el triángulo se engancha solo en el down, el arrastre
    // se queda a medias y el press vivo sobrevive al puntero.
    const veces = (DESPACHADOR.match(/triangleTool\./g) ?? []).length;
    expect(veces, `triangleTool aparece ${veces} veces en el despachador`).toBeGreaterThanOrEqual(4);
  });

  it('existe su hook', () => {
    expect(() => lee('src/components/PatternEditor/useTriangleTool.ts')).not.toThrow();
  });

  it('el hook usa la geometría compartida, no una copia suya', () => {
    const hook = lee('src/components/PatternEditor/useTriangleTool.ts');
    expect(hook, 'el triángulo se dibuja con su propia trigonometría en vez de reusar los vértices compartidos')
      .toContain('isoscelesTriangleVertices');
    expect(hook).toContain('rightTriangleVertices');
  });

  it("no puede nacer con el comando 'A': el 3D lo descarta en silencio", () => {
    const geo = lee('src/utils/geometry/triangle.ts');
    expect(geo).not.toMatch(/type:\s*'A'/);
  });
});

describe('el triángulo tiene puerta', () => {
  it('tiene botón en el dock: una función sin puerta visible no está terminada', () => {
    expect(DOCK_2D_CATALOG.map((t) => t.id)).toContain('triangle');
  });

  it('sin atajo de teclado, a propósito — ni vivo ni reservado', () => {
    // Decisión 4: repartir mnemónicos inventados enseñaría un hábito que CLO
    // rompe, igual que las cinco de la tanda 6. No le falta gesto (por eso NO
    // está en la reserva de F7 tampoco): le falta tecla, y es una decisión.
    expect(DEFAULT_SHORTCUTS.some((s) => s.id === 'tool.triangle')).toBe(false);
    expect(ATAJOS_2D_SIN_GESTO.some((s) => s.id === 'tool.triangle')).toBe(false);
  });

  it('la cabina ofrece isósceles y rectángulo, isósceles por defecto', () => {
    const def = toolRegistry.getTool('triangle');
    expect(def, 'triangle no está registrada').toBeDefined();
    const figura = def!.options?.find((o) => o.id === 'shapeType');
    expect(figura, 'la herramienta perdió su selector de figura').toBeDefined();
    expect(figura!.value).toBe('isosceles');
    const valores = figura!.choices?.map((c) => c.value) ?? [];
    expect(valores).toEqual(['isosceles', 'right']);
  });

  it('las medidas por defecto son 100×100 mm, como Rectángulo', () => {
    const def = toolRegistry.getTool('triangle');
    expect(def!.options?.find((o) => o.id === 'base')!.value).toBe(100);
    expect(def!.options?.find((o) => o.id === 'altura')!.value).toBe(100);
  });
});

describe('el triángulo se comporta como sus hermanos rectángulo y círculo', () => {
  it('la pieza dibujada muestra sus cotas vivas', () => {
    // `CON_COTAS_DE_PIEZA` decide qué herramientas dejan ver Ancho y Alto
    // sobre la pieza. Sin el triángulo aquí, dibujarlo y no poder escribir su
    // medida sería la mitad de la herramienta.
    const sujeto = lee('src/components/PatternEditor/cotas/sujeto.ts');
    const conjunto = sujeto.match(/CON_COTAS_DE_PIEZA[^\]]*\]/s)?.[0] ?? '';
    expect(conjunto, 'el triángulo no entra en CON_COTAS_DE_PIEZA').toContain("'triangle'");
  });

  it('tiene su línea de ayuda en la pista', () => {
    const hint = lee('src/components/PatternEditor/renderers/HintText.tsx');
    expect(hint, 'el triángulo no instruye a nadie').toMatch(/triangle/);
  });

  it('la pista está en español y no promete lo que no hace', () => {
    const hint = lee('src/components/PatternEditor/renderers/HintText.tsx');
    const bloque = hint.match(/triangle[^}]{0,400}/s)?.[0] ?? '';
    expect(bloque).not.toMatch(/\b(drag|click|draw|shape)\b/i);
  });

  it("'triangle' es miembro de la unión Tool2D, no un cast suelto", () => {
    expect(lee('src/types/types.ts')).toMatch(/'triangle'/);
  });

  it('un gesto que muere en cero deja su aviso, con un mensaje que dice qué hacer', () => {
    const noPasoNada = lee('src/components/PatternEditor/noPasoNada.ts');
    expect(noPasoNada).toContain("'triangulo:medida-en-cero'");
    const mensaje = noPasoNada.match(/'triangulo:medida-en-cero':\s*'([^']*)'/)?.[1] ?? '';
    expect(mensaje.toLowerCase()).toMatch(/base/);
    expect(mensaje.toLowerCase()).toMatch(/altura/);
  });
});
