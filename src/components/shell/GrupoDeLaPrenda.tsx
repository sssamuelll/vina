import { useDispatch, useSelector } from 'react-redux';
import { selectAvatarVisible, toggleAvatarVisible } from '../../store/renderSettingsSlice';
import SurfaceModePill from '../Viewport3D/SurfaceModePill';
import MenuDeMapas from '../Viewport3D/MenuDeMapas';
import { displayShortcut } from './shortcutDisplay';
import './GrupoDeLaPrenda.css';

/**
 * El grupo de la prenda (spec 2026-10-02 «la interfaz en papel» § 4.2, P5): lo
 * que se ve de la prenda en 3D, en la barra superior y junto a «IA»: el avatar
 * (un interruptor), «Texturizado ▾» (cómo se pinta la tela) y «Mapa ▾» (los mapas
 * de ajuste). Hasta P4 eran tres cosas sueltas sobre el visor, en negro.
 *
 * Comparte el estilo del grupo del patrón (`grupo-del-patron__interruptor` y
 * `__plegado`, layout.css): un solo estilo de interruptor sobre el marco, con la
 * marca llena o hueca para que el estado no dependa solo del tono. Está cuando el
 * visor está a la vista (Split y 3D); lo decide `TopBar`.
 *
 * Es un solo avatar: el interruptor, el clic derecho del 3D y Shift+A escriben el
 * mismo campo (`avatarRenderStyle`), y el estilo que tenía se recupera al volver.
 *
 * Es una botonera (contrato § 4): Espacio es el atajo de simular, así que con el
 * foco en «Avatar» Espacio pulsa el botón y no arranca la simulación; y un clic de
 * ratón no deja el foco en el botón. Los menús que cuelgan de aquí por portal son
 * hijos de este grupo para React: un `mousedown` sobre un botón suyo se cancela
 * igual (da lo mismo), y sobre un campo de los ajustes no.
 */
export default function GrupoDeLaPrenda() {
  const dispatch = useDispatch();
  const avatarVisible = useSelector(selectAvatarVisible);

  return (
    <div
      className="grupo-de-la-prenda"
      role="group"
      aria-label="Qué se ve de la prenda"
      data-botonera
      onMouseDown={(e) => {
        // Un clic de ratón no deja el foco en el botón: Enter y Espacio solo son
        // de un botón de la botonera si se llegó a él con el teclado.
        if ((e.target as Element).closest('button')) e.preventDefault();
      }}
    >
      <button
        type="button"
        className={`grupo-del-patron__interruptor${avatarVisible ? ' grupo-del-patron__interruptor--activo' : ''}`}
        aria-pressed={avatarVisible}
        aria-label="Mostrar avatar"
        title={`${avatarVisible ? 'Ocultar' : 'Mostrar'} avatar (${displayShortcut('⇧A')})`}
        onClick={() => dispatch(toggleAvatarVisible())}
      >
        <span className="grupo-del-patron__marca" aria-hidden="true" />
        Avatar
      </button>
      <SurfaceModePill />
      <MenuDeMapas />
    </div>
  );
}
