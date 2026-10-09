import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import { Plug } from 'lucide-react';
import type { RootState } from '../../store';
import { usePeldanoDeEscape } from '../../shortcuts/escaleraDeLoLlamado';
import { pushJournal } from '../../utils/telemetry/journal';
import { conectarTuAgente, desconectarTuAgente } from '../../copilot/puente/puenteDeLaApp';
import { estadoDelPermiso, type PermisoDelNavegador } from '../../copilot/puente/conexion';

export const COMANDO_CLAUDE_CODE = 'claude mcp add vina -- npx -y vina-studio';
export const CONFIG_JSON = '"vina": { "command": "npx", "args": ["-y", "vina-studio"] }';

/**
 * «Tu agente» (spec 2026-10-09, P1 y § 4.3): el enchufe al lado de «IA», con un
 * punto cuando hay un agente conectado, y su hoja. Copia el menú «Mostrar» de
 * `FilaDeCapas`: portal de papel, Esc por la escalera de lo llamado, cierre al
 * clicar fuera y el foco adentro al abrir.
 */
export default function PuertaDelAgente() {
  const { estado, agente } = useSelector((s: RootState) => s.puente);
  const [abierta, setAbierta] = useState(false);
  const [ancla, setAncla] = useState({ right: 0, top: 0 });
  const [permiso, setPermiso] = useState<PermisoDelNavegador>('desconocido');
  const [copiado, setCopiado] = useState<string | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const hojaRef = useRef<HTMLDivElement>(null);
  const conectado = estado === 'conectado';
  const nombre = conectado ? `${agente ?? 'Tu agente'} está conectado` : 'Tu agente';

  // Abrir y cerrar quedan en la bitácora.
  const abiertaAntes = useRef(abierta);
  useEffect(() => {
    if (abiertaAntes.current === abierta) return;
    abiertaAntes.current = abierta;
    pushJournal('ui', 'tu-agente', { abierta });
  }, [abierta]);

  // Abierta, el foco vive en la hoja: al abrir, y cuando el estado cambia y
  // se lleva el botón que lo tenía («Conectar» pasa a «Desconectar»).
  useEffect(() => {
    if (!abierta) return;
    const activo = document.activeElement;
    if (activo && activo !== document.body && hojaRef.current?.contains(activo)) return;
    hojaRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [abierta, estado]);

  // El permiso, en vivo: la nota sale si el navegador va a preguntar, y se va
  // en cuanto la usuaria le responde.
  useEffect(() => {
    if (!abierta) return;
    let viva = true;
    let estadoPermiso: PermissionStatus | null = null;
    void estadoDelPermiso().then((p) => {
      if (!viva || !p) return;
      estadoPermiso = p;
      setPermiso(p.state);
      p.onchange = () => setPermiso(p.state);
    });
    return () => {
      viva = false;
      if (estadoPermiso) estadoPermiso.onchange = null;
    };
  }, [abierta]);

  useEffect(() => {
    if (!abierta) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (botonRef.current?.contains(t) || hojaRef.current?.contains(t)) return;
      setAbierta(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [abierta]);

  usePeldanoDeEscape('tu-agente', 'menu', abierta, () => {
    const activo = document.activeElement;
    if (activo === document.body || hojaRef.current?.contains(activo)) botonRef.current?.focus();
    setAbierta(false);
  });

  const copiar = (clave: string, texto: string) => {
    const escrito = navigator.clipboard?.writeText(texto);
    if (!escrito) return;
    void escrito.then(() => {
      setCopiado(clave);
      setTimeout(() => setCopiado(c => (c === clave ? null : c)), 2000);
    });
  };

  const accion = (texto: string, alClic: () => void, principal: boolean) => (
    <button
      type="button"
      className={`hoja-del-agente__accion${principal ? ' hoja-del-agente__accion--principal' : ''}`}
      onClick={alClic}
    >
      {texto}
    </button>
  );

  const senal = (ok: boolean, texto: string) => (
    <div className="hoja-del-agente__estado">
      <span className={`hoja-del-agente__senal${ok ? ' hoja-del-agente__senal--ok' : ''}`} aria-hidden="true" />
      {texto}
    </div>
  );

  const configuracion = (
    <div className="hoja-del-agente__configuracion">
      <div className="hoja-del-agente__subtitulo">Configura tu agente una sola vez</div>
      <div className="hoja-del-agente__fila">
        <span>Claude Code</span>
        <button type="button" className="hoja-del-agente__copiar" aria-label="Copiar el comando de Claude Code" onClick={() => copiar('code', COMANDO_CLAUDE_CODE)}>
          {copiado === 'code' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <code className="hoja-del-agente__codigo">{COMANDO_CLAUDE_CODE}</code>
      <div className="hoja-del-agente__fila">
        <span>Claude Desktop o Cursor</span>
        <button type="button" className="hoja-del-agente__copiar" aria-label="Copiar la configuración de Claude Desktop o Cursor" onClick={() => copiar('json', CONFIG_JSON)}>
          {copiado === 'json' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <code className="hoja-del-agente__codigo">{CONFIG_JSON}</code>
      <p className="hoja-del-agente__nota">Va dentro de «mcpServers», en la configuración de tu agente.</p>
    </div>
  );

  // Sale antes y mientras se espera: al pulsar «Conectar» es cuando Chrome
  // pregunta.
  const notaDelPermiso = permiso === 'prompt' && (
    <p className="hoja-del-agente__nota">La primera vez, tu navegador te pregunta si Vina puede acceder a otras aplicaciones de este dispositivo. Haz clic en «Permitir».</p>
  );

  let contenido;
  if (estado === 'buscando') {
    contenido = (
      <>
        {senal(false, 'Esperando a tu agente')}
        <p>Abre tu agente y Vina se conecta en cuanto arranque. Si lo acabas de configurar, ciérralo y ábrelo otra vez.</p>
        {accion('Desconectar', desconectarTuAgente, false)}
        {notaDelPermiso}
        {configuracion}
      </>
    );
  } else if (estado === 'conectado') {
    contenido = (
      <>
        {senal(true, `Conectado a ${agente ?? 'tu agente'}`)}
        <p>Puede leer y cambiar este patrón. Lo que cambie se deshace con Ctrl+Z, como lo tuyo.</p>
        {accion('Desconectar', desconectarTuAgente, false)}
      </>
    );
  } else if (estado === 'bloqueado') {
    contenido = (
      <>
        {senal(false, 'Tu navegador bloqueó la conexión')}
        <p>Haz clic en el icono a la izquierda de la dirección y permite el acceso a otras aplicaciones de este dispositivo. Después, intenta de nuevo.</p>
        {accion('Intentar de nuevo', conectarTuAgente, true)}
      </>
    );
  } else if (estado === 'reemplazado') {
    contenido = (
      <>
        {senal(false, 'Otra pestaña de Vina tomó la conexión')}
        <p>Tu agente trabaja ahora en esa pestaña.</p>
        {accion('Conectar aquí', conectarTuAgente, true)}
      </>
    );
  } else {
    contenido = (
      <>
        <p>Claude Code, Claude Desktop o Cursor pueden leer y cambiar este patrón. Lo que cambien se deshace con Ctrl+Z, como lo tuyo.</p>
        {accion('Conectar', conectarTuAgente, true)}
        {notaDelPermiso}
        {configuracion}
      </>
    );
  }

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        className={`puerta-del-agente${abierta ? ' puerta-del-agente--abierta' : ''}`}
        aria-label={nombre}
        title={nombre}
        aria-expanded={abierta}
        aria-controls="hoja-del-agente"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAncla({ right: window.innerWidth - r.right, top: r.bottom + 4 });
          setAbierta(a => !a);
        }}
      >
        <Plug size={14} aria-hidden="true" />
        {conectado && <span className="puerta-del-agente__punto" aria-hidden="true" />}
      </button>
      {abierta && createPortal(
        <div
          ref={hojaRef}
          id="hoja-del-agente"
          className="hoja-del-agente"
          role="dialog"
          aria-label="Tu agente"
          data-superficie="menu"
          data-material="papel"
          style={{ right: ancla.right, top: ancla.top }}
        >
          <h2 className="hoja-del-agente__titulo">Tu agente</h2>
          {contenido}
        </div>,
        document.body,
      )}
    </>
  );
}
