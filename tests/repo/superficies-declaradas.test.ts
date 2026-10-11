import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cada superficie del shell declara qué es con `data-superficie` (spec
 * 2026-09-24 «cromo callado» § 3.4). El trinquete e2e de superficies por
 * acción cuenta SOLO lo que está marcado: una superficie sin marca es
 * invisible para el techo de 4, así que este test pide la marca archivo por
 * archivo, con el valor y las veces exactas. Si nace una superficie nueva,
 * se añade aquí y al vocabulario.
 */
export const VOCABULARIO = new Set([
  'ambiente', 'documento', 'dev',
  'pie', 'pista', 'barra', 'paleta', 'velo', 'cabina', 'menu', 'panel',
  'modal', 'toast', 'tooltip', 'estado-vacio', 'indicador-simulacion',
  'leyenda', 'instantaneas',
]);

/** [archivo, valor, veces] */
const MARCAS: Array<[string, string, number]> = [
  ['src/components/shell/TopBar.tsx', 'ambiente', 1],
  ['src/components/shell/TopBar.tsx', 'dev', 1],
  ['src/components/shell/Dock.tsx', 'ambiente', 1],
  // El margen del 3D (spec 2026-10-02 § 4.3, P5): el segundo de los dos márgenes
  // de la lista cerrada de `ambiente`. Desde P5 el dock flotante (DockShell) no existe.
  ['src/components/shell/RightDock.tsx', 'ambiente', 1],
  // La línea al pie (spec 2026-10-02 § 5.3): marco. Lo que aparece en ella
  // son las opciones (`pie`) y la frase (`pista`), que pinta la sección del
  // patrón por portal.
  ['src/components/shell/AppShell.tsx', 'ambiente', 1],
  ['src/components/PatternEditor/SeccionDelPatron.tsx', 'pie', 1],
  ['src/components/PatternEditor/SeccionDelPatron.tsx', 'pista', 1],
  ['src/components/PatternEditor/SeccionDelPatron.tsx', 'menu', 1],
  ['src/components/PatternEditor/renderers/MarcaDeEscala.tsx', 'documento', 1],
  // «Texturizado ▾» vive en el grupo de la prenda de la barra superior (P5): ya
  // no es un ambiente propio, solo su menú es una superficie.
  ['src/components/Viewport3D/SurfaceModePill.tsx', 'menu', 1],
  ['src/components/Debug/SolverMetrics.tsx', 'dev', 2],
  // La fila vive en la barra superior desde P2: es parte de su ambiente. Lo
  // único suyo que aparece es el menú de «Mostrar», cuando se pliega.
  ['src/components/PatternEditor/FilaDeCapas.tsx', 'menu', 1],
  ['src/components/shell/UnifiedBar.tsx', 'barra', 1],
  ['src/components/shell/UnifiedBar.tsx', 'velo', 1],
  ['src/components/shell/UnifiedBar.tsx', 'paleta', 1],
  ['src/components/PatternEditor/FloatingActionBar.tsx', 'cabina', 1],
  ['src/components/PatternEditor/cotas/CotaChip.tsx', 'cabina', 3],
  ['src/components/PatternEditor/cotas/CotasLayer.tsx', 'cabina', 2],
  ['src/components/PatternEditor/renderers/overlays/TransformHandlesOverlay.tsx', 'cabina', 1],
  // La etiqueta de opción (spec 2026-10-02 § 5.2, P3c): la pastilla es parte
  // de la cabina del objeto; su menú, como el de «Más», es un menú.
  ['src/components/PatternEditor/etiquetas/EtiquetaDeOpcion.tsx', 'cabina', 1],
  ['src/components/PatternEditor/etiquetas/EtiquetaDeOpcion.tsx', 'menu', 1],
  ['src/components/shell/LogoMenu.tsx', 'menu', 1],
  ['src/components/PatternEditor/ContextMenu.tsx', 'menu', 1],
  ['src/components/Viewport3D/ContextMenu3D.tsx', 'menu', 1],
  ['src/components/shell/DockToolPicker.tsx', 'menu', 1],
  // «Tu agente» (spec 2026-10-09): el enchufe vive en la barra; su hoja flota.
  ['src/components/shell/PuertaDelAgente.tsx', 'menu', 1],
  ['src/components/LayerPanel/LayerPanel.tsx', 'menu', 1],
  ['src/components/shell/ContextPanel.tsx', 'panel', 1],
  ['src/components/Viewport3D/RenderSettingsPanel.tsx', 'panel', 1],
  ['src/components/Viewport3D/CollisionBodyPanel.tsx', 'panel', 1],
  // Los mapas de ajuste (spec 2026-10-02 § 4.2, P5): el menú «Mapa» cuelga de la
  // barra superior (una hoja, con la lista y los ajustes como dos vistas), y la
  // leyenda —escala, tabla y valor— es lo que se lee sobre el visor.
  ['src/components/Viewport3D/MenuDeMapas.tsx', 'menu', 1],
  ['src/components/Viewport3D/LeyendaDeMapas.tsx', 'leyenda', 1],
  ['src/components/shell/ConfirmDialog.tsx', 'modal', 1],
  ['src/components/PatternEditor/CalibrationModal.tsx', 'modal', 1],
  ['src/copilot/connections/ConnectionModal.tsx', 'modal', 1],
  ['src/components/shell/ToastContainer.tsx', 'toast', 1],
  ['src/components/shell/ToolTooltip.tsx', 'tooltip', 1],
  ['src/components/shell/AppShell.tsx', 'velo', 1],
  ['src/components/PatternEditor/EmptyState2D.tsx', 'estado-vacio', 1],
  ['src/components/Viewport3D/SimulationStatusOverlay.tsx', 'indicador-simulacion', 1],
  ['src/components/Viewport3D/SnapshotBar.tsx', 'instantaneas', 1],
];

const lee = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');

describe('cada superficie del shell declara data-superficie', () => {
  it.each(MARCAS)('%s declara "%s" %i vez/veces', (ruta, valor, veces) => {
    const n = lee(ruta).match(new RegExp(`data-superficie="${valor}"`, 'g'))?.length ?? 0;
    expect(n, `${ruta}: esperaba data-superficie="${valor}" ${veces} vez/veces`).toBe(veces);
  });

  it('ningún archivo usa un valor fuera del vocabulario', () => {
    const fuera: string[] = [];
    for (const ruta of new Set(MARCAS.map(([r]) => r))) {
      for (const m of lee(ruta).matchAll(/data-superficie="([^"]+)"/g)) {
        if (!VOCABULARIO.has(m[1])) fuera.push(`${ruta}: ${m[1]}`);
      }
    }
    expect(fuera).toEqual([]);
  });
});
