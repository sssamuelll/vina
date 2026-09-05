import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DOCK_2D_CATALOG } from '../dock2dTools';
import dockReducer, { DEFAULT_DOCK_2D_IDS, MAX_DOCK_2D_TOOLS, addDockTool } from '../../../store/dockSlice';
import type { DockState } from '../../../store/dockSlice';

/**
 * Cuáles de las siete sin puerta se abren, y por qué las otras dos no.
 *
 * El censo del 2026-09-05 (informe § 12.4) encontró siete herramientas con el
 * gesto completo y ninguna puerta. La tentación era abrir las siete de golpe.
 * Se ejercitaron una a una en Chrome antes de decidir, y no eran siete casos
 * iguales — abrirle la puerta a dos de ellas habría sido reponer F7 con un
 * botón en vez de con una tecla.
 *
 * LO QUE SE MIDIÓ, herramienta por herramienta, sobre un rectángulo de 200×150
 * hecho con la herramienta Rectángulo:
 *
 *   hand            pan 0,0 → 360,0. Funciona.
 *   slashAndSpread  contorno 5 → 10 comandos. Funciona, con CINCO clics
 *                   (contorno, contorno, mitad, confirmar, pivote) y luego
 *                   arrastrar y Enter. La primera sonda le dio tres y la dio
 *                   por rota: el gesto era mío, no suyo.
 *   measureCurve    dibuja marcas y da el total. Devolvía «0.0 mm» en el lado
 *                   de cierre — arreglado en `rangoMedibleDeBorde`.
 *   compareCurves   mismo motor; marcas cada 50 mm y «Total: 200.0 mm».
 *   trimPlace       coloca el avío. Guardaba el borde CORRIDO UNO (clic arriba
 *                   → `leftEdge`) — arreglado en `edgeInterpolation`.
 *
 *   elastic         dibuja el zigzag y llega al 3D, pero `selectedElasticId`
 *                   no tiene NI UN escritor en todo `src/`: el resalte nunca
 *                   se enciende, no se puede seleccionar y no hay forma de
 *                   borrarlo salvo Ctrl+Z o el copiloto. Es una herramienta de
 *                   solo-crear.
 *   pleat           guarda el pliegue en el store y NADIE lo pinta: cero
 *                   referencias a `project.pleats` en `src/components`.
 *                   Medido además en el navegador: 301 nodos SVG antes del
 *                   clic y 301 después.
 *
 * Las dos que se quedan fuera llevan su razón EJECUTABLE aquí abajo: el día
 * que alguien le dé escritor a `selectedElasticId` o escriba el renderizador
 * de pliegues, este archivo falla y pide que se les abra la puerta. Una deuda
 * escrita así caduca sola; una escrita en prosa se queda para siempre.
 */

const RAIZ = process.cwd();
const ids = DOCK_2D_CATALOG.map((t) => t.id);

/** Las cinco que se abren, con el nombre que María va a leer. */
const SE_ABREN: Record<string, string> = {
  hand: 'Mano',
  measureCurve: 'Medir el borde',
  compareCurves: 'Comparar largos',
  slashAndSpread: 'Abrir la pieza',
  trimPlace: 'Poner avío',
};

describe('las cinco puertas que se abren', () => {
  it.each(Object.entries(SE_ABREN))('%s entra al catálogo del dock', (id) => {
    expect(ids, `${id} sigue sin puerta`).toContain(id);
  });

  it('ninguna entra al dock de fábrica: las doce están medidas contra su trabajo diario', () => {
    // Mismo criterio escrito para el círculo (#1111): el catálogo crece, el
    // dock que ella ve al abrir no. Y hay una razón medida: a 1366×643 el dock
    // con doce mide 596 px de 643, y cada herramienta cuesta 43 px. El techo
    // real son trece.
    for (const id of Object.keys(SE_ABREN)) {
      expect(DEFAULT_DOCK_2D_IDS as readonly string[], `${id} se coló en el default`).not.toContain(id);
    }
    expect(DEFAULT_DOCK_2D_IDS).toHaveLength(12);
  });

  it('cada una se llama en español y con su propio nombre', () => {
    for (const [id, nombre] of Object.entries(SE_ABREN)) {
      const entrada = DOCK_2D_CATALOG.find((t) => t.id === id);
      expect(entrada?.label, `${id} no tiene la etiqueta esperada`).toBe(nombre);
    }
    // Y que no choque con ninguna otra: un término por concepto (§ 5).
    const etiquetas = DOCK_2D_CATALOG.map((t) => t.label);
    expect(new Set(etiquetas).size, 'hay dos entradas del dock con la misma etiqueta').toBe(etiquetas.length);
  });

  it('sin tecla nueva: solo queda libre la Y, e inventar mnemónicos enseña un hábito que CLO rompe', () => {
    // Es el mismo razonamiento ya escrito para `point` en dock2dTools.ts. La
    // puerta es el botón del catálogo más el personalizador ＋, que sí escala
    // porque tiene scroll.
    for (const id of Object.keys(SE_ABREN)) {
      const entrada = DOCK_2D_CATALOG.find((t) => t.id === id);
      expect(entrada?.shortcut, `${id} estrenó tecla: eso hay que decidirlo aparte`).toBeUndefined();
    }
  });

  it('el nombre de la definición también está en español, no solo la etiqueta del dock', () => {
    // La tira de herramienta pinta `ToolDefinition.name`, no la etiqueta del
    // dock. Si se traduce una y no la otra, María ve dos nombres para lo mismo.
    const dir = join(RAIZ, 'src/tools/definitions');
    for (const [id, nombre] of Object.entries(SE_ABREN)) {
      const archivo = readdirSync(dir).find((f) => {
        try { return new RegExp(`id:\\s*'${id}'`).test(readFileSync(join(dir, f), 'utf8')); }
        catch { return false; }
      });
      expect(archivo, `no encontré la definición de ${id}`).toBeDefined();
      const src = readFileSync(join(dir, archivo!), 'utf8');
      const declarado = (src.match(/\n\s*name:\s*'([^']+)'/) ?? [])[1];
      expect(declarado, `${id} sigue rotulada en inglés en su definición`).toBe(nombre);
    }
  });
});

describe('las dos que se quedan cerradas, con la razón ejecutable', () => {
  it('elastic sigue sin escritor de selección: es de solo-crear', () => {
    // El día que alguien escriba `state.selectedElasticId =` en un reducer,
    // el elástico se podrá seleccionar y borrar, y entonces MERECE puerta.
    // Que este test falle ese día es el recordatorio.
    const slice = readFileSync(join(RAIZ, 'src/store/editorSlice.ts'), 'utf8');
    const escritores = slice.match(/state\.selectedElasticId\s*=/g) ?? [];
    expect(
      escritores.length,
      'selectedElasticId ya se escribe: el elástico se puede seleccionar, ábrele la puerta',
    ).toBe(0);
    expect(ids, 'elastic tiene puerta pero todavía no se puede borrar').not.toContain('elastic');
  });

  it('pleat sigue sin quien lo pinte', () => {
    // Cero renderizadores leen `project.pleats`. Medido también en el
    // navegador: el store guarda el pliegue y el SVG no cambia (301 → 301).
    const pintores: string[] = [];
    const recorrer = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) {
          if (entrada.name !== '__tests__') recorrer(ruta);
        } else if (/\.tsx?$/.test(entrada.name) && /\bpleats\b/.test(readFileSync(ruta, 'utf8'))) {
          pintores.push(ruta);
        }
      }
    };
    recorrer(join(RAIZ, 'src/components'));
    expect(
      pintores,
      'alguien ya pinta los pliegues: la herramienta deja rastro y merece puerta',
    ).toEqual([]);
    expect(ids, 'pleat tiene puerta pero no dibuja nada').not.toContain('pleat');
  });
});

describe('un catálogo más grande no puede borrarle el dock a María', () => {
  it('fijar más del tope no crece la lista en silencio', () => {
    // El sobre persistido valida `max(MAX_PINNED)`; si se guarda uno más
    // grande, al recargar `safeParse` lo rechaza ENTERO y el dock vuelve a las
    // doce de fábrica. O sea: quien fije 17 pierde TODA su configuración, sin
    // aviso. Con catorce en el catálogo eso era inalcanzable; con diecinueve
    // no. El tope es de este lote porque el riesgo lo trae este lote.
    let estado: DockState = {
      pinnedExtra: { left: [], right: [] },
      signaling: 'subtle',
      tools2d: [...DEFAULT_DOCK_2D_IDS],
    };
    for (let i = 0; i < 12; i++) {
      estado = dockReducer(estado, addDockTool(`extra-${i}`));
    }
    expect(estado.tools2d.length).toBeLessThanOrEqual(MAX_DOCK_2D_TOOLS);
  });

  it('y el catálogo entero cabe bajo el tope, para que "fijarlo todo" nunca lo rompa', () => {
    expect(DOCK_2D_CATALOG.length).toBeLessThanOrEqual(MAX_DOCK_2D_TOOLS);
  });
});
