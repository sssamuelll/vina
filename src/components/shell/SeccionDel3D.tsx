import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { useShortcutRegistry } from '../../shortcuts';
import { displayShortcutBinding } from './shortcutDisplay';
import { vozDelTresD } from './vozDelTresD';
import './SeccionDel3D.css';

/** La acción del registro de atajos de cada herramienta que tiene tecla: el rótulo la lee de ahí. */
const ACCION_DE_LA_TECLA: Readonly<Record<string, string>> = {
  arrangement: 'tool3d.toggleArrangement',
  pin: 'tool3d.pin',
  steamBrush: 'tool3d.steamBrush',
  meshGrab: 'tool3d.meshGrab',
};

/**
 * La sección del 3D de la línea al pie (spec 2026-10-02 «la interfaz en papel»
 * § 5.3, P5): la VOZ, el nombre de la herramienta activa y una frase de cómo se
 * usa; sin herramienta, cómo se mueve la vista. Sustituye al rótulo azul «MODO
 * EDICIÓN» que se leía sobre la escena.
 *
 * El estado de la simulación ya no vive aquí: desde la enmienda del 2026-10-11 es
 * un icono al pie del margen del 3D (`EstadoDeLaSimulacion`), y la línea al pie es
 * papel, como los márgenes.
 *
 * Es contexto 3D de los atajos.
 */
export default function SeccionDel3D() {
  const registroDeAtajos = useShortcutRegistry();
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const poseAbierta = useSelector((s: RootState) => s.avatar.poseEditorOpen);
  const esquema = useSelector((s: RootState) => s.inputScheme.scheme);

  // El atajo EFECTIVO, no el de fábrica: el registro guarda los de la usuaria.
  const teclaDe = (accion: string): string | null => {
    const combo = registroDeAtajos?.getBinding(accion);
    return combo ? displayShortcutBinding(combo) : null;
  };
  const voz = vozDelTresD(activeTool3D, { esquema, poseAbierta });
  const accion = poseAbierta ? undefined : ACCION_DE_LA_TECLA[activeTool3D];
  const atajo = accion ? teclaDe(accion) : null;

  return (
    <div className="linea-al-pie__3d" role="group" aria-label="Vista 3D" data-shortcut-context="3d">
      <div className="seccion-del-3d__voz">
        {voz.nombre && (
          <span className="seccion-del-3d__quien">
            <span className="seccion-del-3d__nombre">{voz.nombre}</span>
            {atajo && <kbd className="seccion-del-3d__tecla">{atajo}</kbd>}
          </span>
        )}
        {/* La región viva va montada SIEMPRE y solo cambia su contenido: los
            lectores de pantalla anuncian cambios DENTRO de una región que ya
            existía (el precedente es ToastContainer.tsx). */}
        <div className="seccion-del-3d__frase" aria-live="polite">
          <span className="seccion-del-3d__texto" data-superficie="pista" title={voz.frase}>{voz.frase}</span>
        </div>
      </div>
    </div>
  );
}
