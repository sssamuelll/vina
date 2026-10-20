import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DOCK_2D_CATALOG } from '../dock2dTools';
import dockReducer, { DEFAULT_DOCK_2D_IDS, MAX_DOCK_2D_TOOLS, addDockTool } from '../../../store/dockSlice';
import type { DockState } from '../../../store/dockSlice';

/**
 * Las siete que estaban sin puerta, y por qué ninguna se queda fuera ya.
 *
 * El censo del 2026-09-05 (informe § 12.4) encontró siete herramientas con el
 * gesto completo y ninguna puerta. La tentación era abrir las siete de golpe.
 * Se ejercitaron una a una en Chrome antes de decidir, y NO eran siete casos
 * iguales: cinco funcionaban enteras y dos estaban rotas por dentro. Abrirle la
 * puerta a esas dos ese día habría sido reponer F7 con un botón en vez de con
 * una tecla.
 *
 * LO QUE SE MIDIÓ, herramienta por herramienta, sobre un rectángulo de 200×150:
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
 * Las dos que se quedaron fuera el 05-09 entraron el 06-09, con su deuda pagada
 * primero. Las dos razones eran ciertas y las dos eran DEFECTOS, no carencias:
 *
 *   elastic         se creaba y después no se podía seleccionar ni borrar: el
 *                   resalte leía `editor.selectedElasticId`, un campo de Redux
 *                   sin UN SOLO escritor en todo `src/`. La selección de verdad
 *                   vivía en el local de `useElasticTool`, que sí se escribe en
 *                   cada clic. Ahora el resalte cuelga de ahí y Supr borra el
 *                   seleccionado — en la CAPTURA, porque `edit.delete` es un
 *                   atajo global y desde la burbuja Supr habría borrado también
 *                   la pieza.
 *   pleat           «nadie lo pinta» era falso, y el guardián que lo certificaba
 *                   buscaba la palabra equivocada: greppeaba `pleats` en
 *                   `src/components` cuando el pliegue se pinta INDIRECTAMENTE,
 *                   como líneas internas de tipo `fold` que `PieceRenderer`
 *                   dibuja con sus marcas de monte y valle desde siempre.
 *                   Lo roto estaba antes: `generatePleatFoldLines` rebanaba
 *                   `outline.slice(segmentRange)`, y un comando `L` lleva su
 *                   punto FINAL, no el inicial. Un borde de UN comando —los
 *                   cuatro lados de un rectángulo— daba un punto, y la función
 *                   devolvía `[]` sin decir nada. La medición del navegador
 *                   (301 nodos SVG antes del clic y 301 después) era correcta;
 *                   la explicación que le pusimos, no.
 *
 * Lo que vigila que ninguna de las dos deudas vuelva ya no es una cadena de
 * texto en este archivo: son dos tests de comportamiento,
 * `el-elastico-se-selecciona-y-se-borra.test.tsx` y `el-pliegue-se-dibuja.test.ts`.
 * Una razón en prosa se queda escrita aunque se pague; una en código, no.
 */

const RAIZ = process.cwd();
const ids = DOCK_2D_CATALOG.map((t) => t.id);

/** Las siete, con el nombre que María va a leer. */
const SE_ABREN: Record<string, string> = {
  hand: 'Mano',
  measureCurve: 'Medir el borde',
  compareCurves: 'Comparar largos',
  slashAndSpread: 'Abrir la pieza',
  trimPlace: 'Poner avío',
  elastic: 'Elástico',
  pleat: 'Pliegue',
};

describe('las siete puertas que se abren', () => {
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

describe('un catálogo más grande no puede borrarle el dock a María', () => {
  it('fijar más del tope no crece la lista en silencio', () => {
    // El sobre persistido valida `max(MAX_DOCK_2D_TOOLS)`; si se guarda uno más
    // grande, al recargar `safeParse` lo rechaza ENTERO y el dock vuelve a las
    // doce de fábrica. O sea: quien fije de más pierde TODA su configuración,
    // sin aviso. Con catorce en el catálogo eso era inalcanzable; con veintiuna
    // no.
    let estado: DockState = { tools2d: [...DEFAULT_DOCK_2D_IDS] };
    for (let i = 0; i < 14; i++) {
      estado = dockReducer(estado, addDockTool(`extra-${i}`));
    }
    expect(estado.tools2d.length).toBeLessThanOrEqual(MAX_DOCK_2D_TOOLS);
  });

  it('y el catálogo entero cabe bajo el tope, para que "fijarlo todo" nunca lo rompa', () => {
    // Si esto falla es que el catálogo creció: sube MAX_DOCK_2D_TOOLS. Un tope
    // por debajo del catálogo cambia el desastre por un defecto más pequeño
    // pero igual de mudo — el ＋ de las últimas del personalizador no haría
    // nada.
    expect(DOCK_2D_CATALOG.length).toBeLessThanOrEqual(MAX_DOCK_2D_TOOLS);
  });
});
