import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Revisión adversarial de UI del 2026-09-04, hallazgos F5 y F11.
 *
 * Medido en la app viva: **cuatro azules de acento en la misma pantalla**.
 * Dos están declarados (`--accent` índigo del cromo, `--accent-2d` de las
 * cotas) y dos no existen en ningún token:
 *
 *   #4a9eff  (+ su tinte rgba(74,158,255,·))  cromo del visor 3D
 *   #4a90d9                                    fondo del botón de modo activo
 *
 * El caso que lo deja a la vista: `SnapshotBar.css:41-45` pinta el chip activo
 * con fondo `rgba(74,158,255,0.2)` y borde y texto `var(--accent)`. Dos azules
 * distintos dentro del MISMO control, a 4 px uno del otro.
 *
 * El azul del cromo 3D además falla AA: blanco sobre #4a9eff da 2,75:1.
 *
 * **La distinción que hay que respetar** (y por la que este test lista sitios
 * en vez de prohibir un hex en toda la carpeta): en `Viewport3D/` hay literales
 * que NO son acento sino DATO — la escala de 8 paradas del mapa de tensión
 * (`FitMapToggle.tsx:40-49`) espeja `STRESS_STRAIN_COLORS` del solver, y los
 * cuadritos de la leyenda espejan `FIT_COLOR_*`. Cambiar esos no es unificar:
 * es mentir sobre lo que la malla está pintando. Un buscar-y-reemplazar de hex
 * sobre este archivo rompería la lectura del mapa.
 *
 * La regla, ejecutable: **el azul que dice "esto está activo" es uno solo y
 * sale de un token; el que codifica un dato se queda donde está.**
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 2 F5 y F11.
 */

const lee = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');

/** Los sitios donde el azul es ESTADO de un control, uno por uno y medidos. */
const CROMO = [
  'src/components/Viewport3D/SurfaceModePill.css',
  'src/components/Viewport3D/SnapshotBar.css',
  'src/components/Viewport3D/CollisionBodyPanel.css',
];

/** Las dos familias de azul que no existen en tokens.css. */
const AZULES_SIN_TOKEN = /#4a9eff|#4a90d9|rgba?\(\s*74\s*,\s*158\s*,\s*255/gi;

describe('F11 — un solo azul de estado en el cromo del visor 3D', () => {
  it.each(CROMO)('%s no inventa su propio acento', (ruta) => {
    const encontrados = lee(ruta).match(AZULES_SIN_TOKEN) ?? [];
    expect(encontrados, `azules fuera de tokens.css: ${encontrados.join(', ')}`).toEqual([]);
  });

  it('el mapa puesto del menú «Mapa» usa el acento del sistema', () => {
    // Era el único #4a90d9 de interfaz de FitMapToggle: el fondo del botón
    // activo. Desde P5 el menú lo pinta con --accent-fuerte (el paso con texto
    // encima). El resto de literales de esos archivos son escala de datos.
    for (const ruta of ['src/components/Viewport3D/MenuDeMapas.tsx', 'src/components/Viewport3D/MenuDeMapas.css', 'src/components/Viewport3D/LeyendaDeMapas.tsx']) {
      expect(lee(ruta), `${ruta}: el fondo del mapa activo sigue siendo un hex suelto`).not.toContain('#4a90d9');
    }
    expect(lee('src/components/Viewport3D/MenuDeMapas.css'), 'el mapa puesto no sale del acento').toContain('var(--accent-fuerte)');
  });

  it('el chip activo de la barra de capturas deja de tener dos azules', () => {
    const css = lee('src/components/Viewport3D/SnapshotBar.css');
    const activo = css.slice(css.indexOf('.snap-chip.active'), css.indexOf('.snap-chip.active') + 260);
    expect(activo, 'no encontré la regla del chip activo').toContain('background');
    expect(activo).not.toMatch(/74\s*,\s*158\s*,\s*255/);
  });
});

describe('F11 — lo que codifica un dato NO se toca', () => {
  // P5: la escala vive en modosDeMapa.ts y la leyenda en LeyendaDeMapas.tsx.
  const escala = lee('src/components/Viewport3D/modosDeMapa.ts');
  const leyenda = lee('src/components/Viewport3D/LeyendaDeMapas.tsx');

  it('la escala del mapa de tensión conserva sus ocho paradas', () => {
    // Espejo de STRESS_STRAIN_COLORS (utils fitMaps): si esto cambia, la barra
    // deja de describir lo que el solver pintó en la malla.
    for (const parada of ['#0000FF', '#0066FF', '#00CCCC', '#00FF66', '#66FF00', '#FFFF00', '#FF8800', '#FF0000']) {
      expect(escala, `la escala perdió ${parada}`).toContain(parada);
    }
  });

  it('la leyenda del mapa de ajuste conserva sus colores de clase', () => {
    for (const c of ['#ff0000', '#ffff00', '#ffffff']) {
      expect(leyenda.toLowerCase(), `la leyenda perdió ${c}`).toContain(c);
    }
  });

  it('los puntos de anclaje 3D conservan su familia de tres brillos', () => {
    // AnchorPoints.tsx:37-39 usa tres azules donde el BRILLO codifica estado
    // (namespace activo / hover). Romper el primero rompe la relación.
    const anchors = lee('src/components/Viewport3D/AnchorPoints.tsx');
    expect(anchors.toLowerCase()).toContain('#4a90d9');
  });
});

describe('F11 — el material del visor 3D sale del sistema', () => {
  it('la píldora de modo de superficie usa el material declarado', () => {
    const css = lee('src/components/Viewport3D/SurfaceModePill.css');
    expect(css, 'sigue con su propio gris rgba(30,30,30,·)').not.toMatch(/rgba\(\s*30\s*,\s*30\s*,\s*30/);
  });

  it('y su z-index sale de la escala con nombre', () => {
    const css = lee('src/components/Viewport3D/SurfaceModePill.css');
    expect(css, 'z-index literal: la escala tiene roles con nombre').not.toMatch(/z-index:\s*\d+/);
  });
});
