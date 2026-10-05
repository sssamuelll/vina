import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Search, ArrowUp } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { showErrorToast } from '../../store/copilotUISlice';
import { ocultarIA } from '../../store/iaSlice';
import { enviar } from '../../copilot/conversacion';
import { usePeldanoDeEscape } from '../../shortcuts/escaleraDeLoLlamado';
import { readAndParseDXFFile } from '../../utils/dxf';
import { dxfErrorMessage, type PendingDXFAttachment } from './dxfImport';
import UnifiedBarChat from './UnifiedBarChat';
import UnifiedBarCommands from './UnifiedBarCommands';
import { loadPosition, clampPosition, savePosition } from './barPosition';

interface UnifiedBarProps {
  onOpenPanel: (name: string) => void;
}

/**
 * La barra de IA convocada (spec 2026-10-02 «la interfaz en papel» § 6.2): una
 * cápsula de papel de una línea, que solo existe abierta (la monta AppShell con
 * `ia.abierta`). Un solo modo: escribir es conversación; `Ctrl+K`, o «/» al
 * empezar, son comandos. La conversación y el agente viven en el store, así
 * que ocultarla no los pierde.
 */
export default function UnifiedBar({ onOpenPanel }: UnifiedBarProps) {
  const dispatch = useDispatch();
  const { modoDeApertura, aperturas, mensajes, trabajando } = useSelector((s: RootState) => s.ia);
  const [comandos, setComandos] = useState(modoDeApertura === 'comandos');
  const [input, setInput] = useState('');
  const [position, setPosition] = useState(loadPosition);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Cada apertura —«IA», Ctrl+/, Ctrl+K, la pantalla vacía— pone el foco en el
  // campo; un Ctrl+K con la barra ya abierta pasa a comandos.
  useEffect(() => {
    setComandos(modoDeApertura === 'comandos');
    inputRef.current?.focus();
  }, [aperturas, modoDeApertura]);

  // Esc (spec § 6.2): con texto, lo borra; con el campo vacío, la oculta. La
  // conversación y el agente siguen. Un peldaño por delante del panel y de la
  // selección.
  usePeldanoDeEscape('ia', 'ia', true, () => {
    if (inputRef.current?.value) { setInput(''); return; }
    dispatch(ocultarIA());
  });

  // ─── DXF adjunto (soltar → adjuntar → enviar con texto) ──────────
  const [pendingDXF, setPendingDXF] = useState<PendingDXFAttachment | null>(null);
  const [dxfDragActive, setDxfDragActive] = useState(false);
  const dxfDragCounter = useRef(0);

  // Se lee al adjuntar (valida y cuenta las piezas, avisa pronto de un archivo
  // malo). NO importa: las piezas llegan al proyecto solo al enviar.
  const attachDXF = useCallback(async (file: File) => {
    try {
      const { name, result } = await readAndParseDXFFile(file, { unit: 'auto', autoDetect: true });
      setPendingDXF({ name, pieces: result.pieces });
      setComandos(false);
    } catch (err) {
      dispatch(showErrorToast(dxfErrorMessage(err)));
    }
  }, [dispatch]);

  const handleDxfDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dxfDragCounter.current += 1;
    setDxfDragActive(true);
  }, []);
  const handleDxfDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
  }, []);
  const handleDxfDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dxfDragCounter.current -= 1;
    if (dxfDragCounter.current <= 0) {
      dxfDragCounter.current = 0;
      setDxfDragActive(false);
    }
  }, []);
  const handleDxfDrop = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dxfDragCounter.current = 0;
    setDxfDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) void attachDXF(file);
  }, [attachDXF]);

  // Recalculate position on window resize
  useEffect(() => {
    const handler = () => setPosition(prev => clampPosition(prev.x, prev.y));
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ─── Drag handlers ─────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't drag from input, buttons, or panel
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'SELECT'
      || target.closest('.unified-bar__input-wrap') || target.closest('.unified-bar__esc')
      || target.closest('.unified-bar__send') || target.closest('.unified-bar__panel')) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      const clamped = clampPosition(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y,
      );
      setPosition(clamped);
    };

    const handleUp = () => {
      setIsDragging(false);
      setPosition(prev => {
        savePosition(prev);
        return prev;
      });
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging]);

  const handleSubmit = useCallback(() => {
    // Con la IA trabajando, lo escrito y el DXF se quedan donde están: se
    // envían cuando termine el turno, no se pierden.
    if (comandos || trabajando || (!input.trim() && !pendingDXF)) return;
    const adjunto = pendingDXF;
    setInput('');
    setPendingDXF(null);
    void enviar(input, adjunto);
  }, [comandos, trabajando, input, pendingDXF]);

  const conPanel = comandos || mensajes.length > 0 || trabajando || pendingDXF !== null;
  const Icono = comandos ? Search : MessageSquare;
  const barClasses = [
    'unified-bar',
    conPanel ? 'unified-bar--panel-open' : '',
    isDragging ? 'unified-bar--dragging' : 'unified-bar--draggable',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={barClasses}
      data-superficie="barra"
      data-material="papel"
      style={{ left: position.x, top: position.y }}
      onMouseDown={handleMouseDown}
      onDragEnter={handleDxfDragEnter}
      onDragOver={handleDxfDragOver}
      onDragLeave={handleDxfDragLeave}
      onDrop={handleDxfDrop}
    >
      {/* DXF drag overlay — appears while dragging a file over the bar/panel */}
      {dxfDragActive && (
        <div
          data-superficie="velo"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--accent-subtle)',
            border: '2px dashed var(--accent)',
            borderRadius: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Suelta tu .dxf para adjuntarlo
          </span>
        </div>
      )}

      <Icono size={16} className="unified-bar__icono" aria-hidden="true" />

      <div className="unified-bar__input-wrap">
        <input
          ref={inputRef}
          className="unified-bar__input"
          aria-label={comandos ? 'Buscar un comando' : 'Pedirle algo a la IA'}
          value={input}
          onChange={(e) => {
            const v = e.target.value;
            if (!comandos && input === '' && v.startsWith('/')) { setComandos(true); setInput(v.slice(1)); return; }
            setInput(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Backspace' && comandos && input === '') setComandos(false);
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setComandos(true); }
          }}
          placeholder={comandos ? 'Escribe un comando' : 'Pide algo o pregunta'}
        />
      </div>

      {!comandos && (input.trim() || pendingDXF) ? (
        <button className="unified-bar__send" aria-label="Enviar" disabled={trabajando} onClick={handleSubmit}>
          <ArrowUp size={16} />
        </button>
      ) : (
        <kbd className="unified-bar__esc" aria-hidden="true">Esc</kbd>
      )}

      {conPanel && (
        <div className="unified-bar__panel" data-superficie="paleta" onClick={e => e.stopPropagation()}>
          {comandos ? (
            <UnifiedBarCommands
              query={input}
              onExecute={() => { setInput(''); dispatch(ocultarIA()); }}
              onOpenPanel={onOpenPanel}
            />
          ) : (
            <UnifiedBarChat pendingDXF={pendingDXF} clearAttachment={() => setPendingDXF(null)} />
          )}
        </div>
      )}
    </div>
  );
}
