import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SHORTCUTS, ATAJOS_2D_SIN_GESTO } from '../../../shortcuts/defaults';
import { toolRegistry } from '../../../tools';
import { DOCK_2D_CATALOG } from '../../shell/dock2dTools';

/**
 * #1111 — María, en el audio del 30-08: «círculo es indispensable».
 *
 * Lo que había era peor que nada: la tecla `E` activaba una herramienta
 * 'circle' que NO existía. `circle.tsx` es una `ToolDefinition` completa y
 * registrada, y `ToolStrip2D` es genérica —lee `toolRegistry.getTool(activeTool).options`—,
 * así que la tira le dibujaba la cabina entera, con su selector Círculo /
 * Elipse / Arco y su campo de radio, y el cursor se ponía en cruz. Pero el
 * despachador no conducía ese id: clic y arrastre dejaban las piezas como
 * estaban. Eso es el hallazgo F7 del 04-09, y la tanda anterior quitó la
 * trampa reservando la tecla en `ATAJOS_2D_SIN_GESTO`, con el comentario «el
 * primero de la cola es el círculo».
 *
 * Este es el círculo naciendo. Tres decisiones que se toman aquí y quedan
 * escritas para poder discutirlas:
 *
 * 1. **Herramienta aparte, no "Formas".** El cuerpo de #1111 propone que
 *    Rectángulo se convierta en «Formas» con selector rectángulo·círculo·
 *    triángulo. Se hace lo otro: `circle.tsx` ya existe como herramienta
 *    propia, su tecla ya está reservada, y convertir Rectángulo —que María usa
 *    a diario— en un selector es un cambio de gramática en una herramienta viva.
 *    Si Samuel prefiere «Formas», esto se pliega a ello sin perder nada.
 *
 * 2. **El arrastre ancla en la esquina, como el rectángulo.** Petra propuso
 *    «arrastre desde el centro, Shift para uniforme». Se descarta: dos
 *    gramáticas para dos herramientas de dibujo hermanas es exactamente la
 *    deriva que la revisión midió. La elipse se inscribe en la caja arrastrada,
 *    igual que el rectángulo se dibuja en ella.
 *
 * 3. **El Arco sale del selector.** Un arco es un camino ABIERTO y `addPiece`
 *    asume pieza cerrada (el 3D extruye con THREE.Shape). Un arco como PIEZA no
 *    significa nada; como línea interna ya existe `internalShape`.
 */

const lee = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');
const DESPACHADOR = lee('src/components/PatternEditor/useEditorInteractions.ts');

describe('el círculo tiene gesto de verdad', () => {
  it('el despachador lo conduce, no solo lo activa', () => {
    // Es la condición que F7 midió: activar sin conducir es la trampa.
    expect(/activeTool\s*===\s*'circle'/.test(DESPACHADOR), 'el despachador no enruta circle').toBe(true);
  });

  it('está enganchado en las cuatro puertas del gesto, como el rectángulo', () => {
    // rectTool aparece en mousedown, mousemove, mouseup y pointercancel. Si el
    // círculo se engancha solo en el down, el arrastre se queda a medias y el
    // press vivo sobrevive al puntero — el defecto de F8, por otra puerta.
    const veces = (DESPACHADOR.match(/circleTool\./g) ?? []).length;
    expect(veces, `circleTool aparece ${veces} veces en el despachador`).toBeGreaterThanOrEqual(4);
  });

  it('existe su hook', () => {
    expect(() => lee('src/components/PatternEditor/useCircleTool.ts')).not.toThrow();
  });

  it('el hook usa la geometría compartida, no una copia suya', () => {
    const hook = lee('src/components/PatternEditor/useCircleTool.ts');
    expect(hook, 'el círculo se dibuja con su propia trigonometría en vez de reusar ellipseToPath').toContain('ellipseToPath');
    expect(hook, "no puede nacer con el comando 'A': el 3D lo descarta en silencio").not.toMatch(/type:\s*'A'/);
  });
});

describe('el círculo tiene puerta', () => {
  it('recupera su tecla: sale de la reserva y vuelve a la lista viva', () => {
    const reservados = ATAJOS_2D_SIN_GESTO.map((s) => s.id);
    expect(reservados, 'sigue reservado, o sea que la tecla no volvió').not.toContain('tool.circle');

    const vivo = DEFAULT_SHORTCUTS.find((s) => s.id === 'tool.circle');
    expect(vivo, 'el círculo no tiene atajo registrado').toBeDefined();
    expect(vivo!.key, 'la tecla reservada era la E').toBe('e');
    expect(vivo!.context).toBe('2d');
  });

  it('tiene botón en el dock: una función sin puerta visible no está terminada', () => {
    // Ley de puertas del contrato de interfaz, § 6.
    expect(DOCK_2D_CATALOG.map((t) => t.id)).toContain('circle');
  });

  it('la cabina ya no ofrece Arco', () => {
    const def = toolRegistry.getTool('circle');
    expect(def, 'circle no está registrada').toBeDefined();
    const figura = def!.options?.find((o) => o.id === 'shapeType');
    expect(figura, 'la herramienta perdió su selector de figura').toBeDefined();
    const valores = (figura as { choices?: Array<{ value: string }> }).choices?.map((c) => c.value) ?? [];
    expect(valores).toContain('circle');
    expect(valores).toContain('ellipse');
    expect(valores, 'un arco es un camino abierto: como PIEZA no significa nada').not.toContain('arc');
  });

  it('muere el onActivate que solo escribía en la consola', () => {
    const def = lee('src/tools/definitions/circle.tsx');
    expect(def, "quedó el 'Coming soon!'").not.toMatch(/Coming soon/i);
  });
});

describe('el círculo se comporta como su hermano el rectángulo', () => {
  it('la pieza dibujada muestra sus cotas vivas', () => {
    // `CON_COTAS_DE_PIEZA` decide qué herramientas dejan ver Ancho y Alto sobre
    // la pieza. Sin añadir el círculo, dibujarlo y no poder escribir su medida
    // sería la mitad de la herramienta.
    const sujeto = lee('src/components/PatternEditor/cotas/sujeto.ts');
    const conjunto = sujeto.match(/CON_COTAS_DE_PIEZA[^\]]*\]/s)?.[0] ?? '';
    expect(conjunto, 'el círculo no entra en CON_COTAS_DE_PIEZA').toContain("'circle'");
  });

  it('tiene su línea de ayuda en la pista', () => {
    const hint = lee('src/components/PatternEditor/renderers/HintText.tsx');
    expect(hint, 'el círculo no instruye a nadie').toMatch(/circle/);
  });

  it('la pista está en español y no promete lo que no hace', () => {
    const hint = lee('src/components/PatternEditor/renderers/HintText.tsx');
    const bloque = hint.match(/circle[^}]{0,400}/s)?.[0] ?? '';
    expect(bloque).not.toMatch(/\b(drag|click|draw|shape)\b/i);
    expect(bloque, 'promete el arco, que ya no existe').not.toMatch(/arco/i);
  });

  it("'circle' es miembro de la unión Tool2D, no un cast suelto", () => {
    expect(lee('src/types/types.ts')).toMatch(/'circle'/);
  });
});
