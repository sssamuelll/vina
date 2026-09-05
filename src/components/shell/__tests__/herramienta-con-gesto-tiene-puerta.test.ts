import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SHORTCUTS } from '../../../shortcuts/defaults';
import { DOCK_2D_CATALOG } from '../dock2dTools';

/**
 * La ley de puertas del contrato de interfaz (§ 6):
 *
 *   «Una función que se despacha tiene una puerta visible en el shell. Si solo
 *   se llega por la paleta de comandos o por un atajo que nadie muestra, no
 *   está terminada.»
 *
 * El hallazgo F7 de la revisión del 2026-09-04 midió la mitad de este defecto:
 * **siete teclas que metían a María en una herramienta sin gesto**. La cabina se
 * dibujaba, el cursor se ponía en cruz, y ningún clic hacía nada.
 *
 * El censo del 2026-09-05 encontró la otra mitad, y es exactamente simétrica:
 * **siete herramientas con el gesto completo y ninguna puerta**. El despachador
 * las conduce en sus cinco enganches, tienen overlay, tienen hooks — y no había
 * botón en el dock ni atajo registrado. Solo se alcanzaban si el copiloto las
 * activaba por su cuenta (`copilot/action/tools/definitions/patternOpsTools.ts`).
 *
 * **Las siete tienen puerta.** Cinco el 2026-09-05 —Mano, Medir el borde,
 * Comparar largos, Abrir la pieza, Poner avío— y las otras dos el 06-09, con
 * sus dos deudas pagadas primero. Las razones por las que estuvieron cerradas
 * eran ciertas, y las dos resultaron ser DEFECTOS, no carencias:
 *
 *   elastic  el resalte leía `editor.selectedElasticId`, un campo de Redux sin
 *            un solo escritor. Ahora cuelga del local, que sí se escribe, y
 *            Supr borra el seleccionado.
 *   pleat    "nadie lo pinta" era falso: `PieceRenderer` dibuja las líneas
 *            `fold` con sus marcas de monte y valle desde siempre. Lo roto
 *            estaba antes, en `generatePleatFoldLines`, que rebanaba el rango
 *            del borde y perdía su punto de arranque: devolvía cero pliegues en
 *            cualquier borde de UN comando, o sea en los cuatro lados de un
 *            rectángulo.
 *
 * Este test sigue haciendo lo mismo que el primer día: **fijar el techo** para
 * que una nueva sin puerta no pase en silencio, que es justo lo que dejó llegar
 * a aquellas siete. Hoy el techo es CERO, que es el techo más ruidoso posible:
 * cualquier herramienta nueva con gesto y sin puerta rompe la suite.
 */

const DESPACHADOR = readFileSync(
  join(process.cwd(), 'src/components/PatternEditor/useEditorInteractions.ts'),
  'utf8',
);

/** Ids que el despachador conduce de verdad — mismo censo que el test de F7. */
function idsConducidos(): Set<string> {
  const ids = new Set<string>();
  for (const m of DESPACHADOR.matchAll(/activeTool\s*===\s*'([A-Za-z0-9]+)'/g)) ids.add(m[1]);
  for (const decl of DESPACHADOR.matchAll(/const\s+([A-Z0-9_]*TOOL_IDS)\s*=\s*new Set\(\[([^\]]*)\]/g)) {
    if (!new RegExp(`${decl[1]}\\.has\\(activeTool`).test(DESPACHADOR)) continue;
    for (const lit of decl[2].matchAll(/'([A-Za-z0-9]+)'/g)) ids.add(lit[1]);
  }
  return ids;
}

const CONDUCIDOS = idsConducidos();
const CON_ATAJO = new Set(
  DEFAULT_SHORTCUTS.filter((s) => s.id.startsWith('tool.')).map((s) => s.id.slice('tool.'.length)),
);
const EN_EL_DOCK = new Set(DOCK_2D_CATALOG.map((t) => t.id));

/**
 * Vacía. Eran siete el 2026-09-05 por la mañana y dos por la noche.
 *
 * Bajar esta lista es progreso; que crezca es una puerta que se olvidó. Si
 * alguna vez hay que volver a meter una, va con su razón MEDIDA (no supuesta) y
 * con un guardián ejecutable que falle el día que la deuda caduque.
 */
const SIN_PUERTA_HOY: readonly string[] = [];

describe('ley de puertas — una herramienta con gesto se alcanza sin adivinar', () => {
  it('el detector no está ciego: el despachador conduce al menos 25 ids', () => {
    // Si un refactor cambia la forma de los `if`, el censo se vuelve cero y el
    // resto de la suite pasaría en vacío. Que falle aquí, ruidosamente.
    expect(CONDUCIDOS.size).toBeGreaterThanOrEqual(25);
    expect(CONDUCIDOS.has('select')).toBe(true);
  });

  it('no hay ninguna herramienta sin puerta que no esté declarada', () => {
    const sinPuerta = [...CONDUCIDOS]
      .filter((id) => !CON_ATAJO.has(id) && !EN_EL_DOCK.has(id))
      .sort();
    const nuevas = sinPuerta.filter((id) => !SIN_PUERTA_HOY.includes(id));
    expect(
      nuevas,
      'estas herramientas tienen gesto y ninguna puerta: dales botón o atajo, o decláralas aquí con su razón',
    ).toEqual([]);
  });

  it('el techo solo baja: si una consigue puerta, sale de la lista', () => {
    // Sin esto la deuda se queda escrita para siempre aunque se pague. Es el
    // mismo trinquete que la reserva de atajos de F7.
    const yaTienen = SIN_PUERTA_HOY.filter((id) => CON_ATAJO.has(id) || EN_EL_DOCK.has(id));
    expect(
      yaTienen,
      'estas ya tienen puerta: quítalas de SIN_PUERTA_HOY para que el techo baje',
    ).toEqual([]);
  });

  it('la deuda declarada está en cero, y las siete de ayer siguen conducidas', () => {
    // La red contra el arreglo perezoso: vaciar la lista borrando el gesto
    // también la habría vaciado. Estas siete SÍ funcionan y ahora además se
    // alcanzan.
    expect(SIN_PUERTA_HOY, 'hay deuda de puertas declarada otra vez').toEqual([]);
    for (const id of ['hand', 'measureCurve', 'compareCurves', 'slashAndSpread', 'trimPlace', 'elastic', 'pleat']) {
      expect(CONDUCIDOS.has(id), `${id} ya no tiene gesto: si murió, bórrala del todo`).toBe(true);
      expect(EN_EL_DOCK.has(id), `${id} perdió su puerta`).toBe(true);
    }
  });
});

/**
 * La correlación que este bloque fijaba —«las siete sin puerta son las siete
 * que nadie tradujo»— fue el hallazgo, y con dos elementos ya no se sostiene:
 * cualquier par correlaciona con cualquier cosa. Fue cierta, explicó por qué el
 * inglés se concentraba justo ahí, y hoy es historia — cinco de las siete se
 * tradujeron al abrirles la puerta, en el mismo lote, que es exactamente lo que
 * la correlación decía que había que hacer.
 *
 * Queda vivo lo que sí se sostiene con dos, que además es lo que importa: lo
 * que María alcanza lo lee en español, y lo que sigue cerrado dice por qué.
 */
describe('ley de idioma — lo que se alcanza se lee, y lo cerrado dice por qué', () => {
  const defs = (id: string) => {
    const dir = join(process.cwd(), 'src/tools/definitions');
    for (const f of readFileSync(join(dir, '..', 'index.ts'), 'utf8').matchAll(/from '\.\/definitions\/([\w]+)'/g)) {
      const ruta = join(dir, `${f[1]}.tsx`);
      let src: string;
      try { src = readFileSync(ruta, 'utf8'); } catch { continue; }
      if (new RegExp(`id:\\s*'${id}'`).test(src)) return src;
    }
    return null;
  };

  it('toda herramienta con puerta tiene el nombre en español', () => {
    // Lo que María alcanza, lo lee. Lo que no alcanza no se le puede exigir al
    // mismo nivel — pero cuando se le abra la puerta, el nombre viene con ella.
    const conPuerta = [...CONDUCIDOS].filter((id) => CON_ATAJO.has(id) || EN_EL_DOCK.has(id));
    const enIngles: string[] = [];
    for (const id of conPuerta) {
      const src = defs(id);
      if (!src) continue;
      const nombre = (src.match(/name:\s*'([^']+)'/) ?? [])[1];
      if (!nombre) continue;
      // Heurística deliberadamente floja: solo caza lo que es claramente inglés.
      if (/\b(Add|Auto|Compare|Copy|Duplicate|Edit Mode|Flatten|Grading|Hand|Mesh|Mirror|Move|Place|Slash|Spread|Steam|Text|Along|Gathering|Pleat|Select \(|Sew|Simulate|Tape)\b/.test(nombre)) {
        enIngles.push(`${id} → "${nombre}"`);
      }
    }
    expect(enIngles, 'herramientas alcanzables con nombre en inglés').toEqual([]);
  });

  it('y la razón de las que estuvieron cerradas se comprueba sola, no en prosa', () => {
    // Las dos deudas de ayer se pagaron arreglando lo que las causaba, así que
    // lo que las vigila ya no es una lista de cadenas: son dos tests de
    // comportamiento. Si alguien revive `editor.selectedElasticId` o vuelve a
    // rebanar el rango del borde en los pliegues, fallan ellos.
    // Que el archivo EXISTA no basta: uno vaciado, con sus `it` comentados o
    // reducido a `expect(true).toBe(true)`, pasaría igual. Se exige la frase que
    // nombra el comportamiento, que es lo que no sobrevive a un vaciado.
    const guardianes: Array<[string, string]> = [
      ['src/hooks/__tests__/el-elastico-se-selecciona-y-se-borra.test.tsx', 'Supr borra el elástico seleccionado'],
      ['src/utils/__tests__/el-pliegue-se-dibuja.test.ts', 'ARRANCA sobre ese borde'],
    ];
    for (const [ruta, frase] of guardianes) {
      let src = '';
      expect(
        () => { src = readFileSync(join(process.cwd(), ruta), 'utf8'); },
        `${ruta} era el guardián de una deuda pagada: si se borra, la deuda vuelve muda`,
      ).not.toThrow();
      expect(src, `${ruta} ya no comprueba «${frase}»: el guardián se vació`).toContain(frase);
    }
  });
});
