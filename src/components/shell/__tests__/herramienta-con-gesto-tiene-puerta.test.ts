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
 * **Cinco de las siete ya tienen puerta** (catálogo del dock, 2026-09-05). Se
 * ejercitaron una a una en Chrome y las cinco funcionan, así que entraron con
 * nombre en español —Mano, Medir el borde, Comparar largos, Abrir la pieza,
 * Poner avío—, con icono propio y con su pista de gesto. Cuáles merecían botón
 * era decisión de producto: está tomada, y con sus razones medidas, en
 * `las-cinco-puertas-que-se-abren.test.ts`.
 *
 * Quedan DOS, y no por olvido: `elastic` se crea y después no se puede
 * seleccionar ni borrar, y `pleat` guarda el pliegue y nadie lo pinta. Darles
 * botón habría sido reponer el defecto F7 —una puerta a una habitación vacía—
 * cambiando la tecla por un icono.
 *
 * Este test sigue haciendo lo mismo que el primer día: **fijar el techo** para
 * que una nueva sin puerta no pase en silencio, que es justo lo que dejó llegar
 * a estas. Hoy el techo son dos.
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
 * Las dos de hoy, con su deuda declarada. Eran siete el 2026-09-05 por la
 * mañana. Bajar esta lista es progreso; que crezca es una puerta que se olvidó.
 */
const SIN_PUERTA_HOY = [
  'elastic',
  'pleat',
] as const;

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
    const nuevas = sinPuerta.filter((id) => !SIN_PUERTA_HOY.includes(id as typeof SIN_PUERTA_HOY[number]));
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

  it('las dos siguen conducidas: la lista es de deuda, no de herramientas muertas', () => {
    // La red contra el arreglo perezoso: borrar el gesto también vaciaría la
    // lista de arriba. Estas SÍ funcionan; lo que les falta es por dónde entrar.
    for (const id of SIN_PUERTA_HOY) {
      expect(CONDUCIDOS.has(id), `${id} ya no tiene gesto: si murió, bórrala del todo`).toBe(true);
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

  /** Por qué cada una sigue sin puerta, medido en el navegador el 2026-09-05. */
  const RAZONES: Record<typeof SIN_PUERTA_HOY[number], string> = {
    elastic: 'ni un escritor de `selectedElasticId` en todo src/: se dibuja y después no se puede seleccionar ni borrar',
    pleat: 'cero renderizadores leen `project.pleats`: el store guarda el pliegue y el SVG no cambia (301 → 301 nodos)',
  };

  it('cada una de las dos cerradas lleva su razón, y la razón se comprueba sola', () => {
    // Una lista sin razones vuelve a ser lo que era antes de F7: una deuda que
    // nadie sabe si sigue siendo cierta. Y una razón en prosa se queda escrita
    // para siempre aunque se pague — por eso lo que la sostiene no es este mapa
    // sino el guardián ejecutable, que falla el día que la deuda caduque.
    expect(Object.keys(RAZONES).sort()).toEqual([...SIN_PUERTA_HOY].sort());

    const guardian = readFileSync(
      join(process.cwd(), 'src/components/shell/__tests__/las-cinco-puertas-que-se-abren.test.ts'),
      'utf8',
    );
    for (const id of SIN_PUERTA_HOY) {
      expect(guardian, `${id} no tiene guardián ejecutable de su razón`).toContain(id);
    }
  });
});
