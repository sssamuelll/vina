import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece, unlinkPieces, setLayer, setSublayer, addAnnotation, removeAnnotation, setFabricCode, addPlacementRule, removePlacementRule } from '../../store/projectSlice';
import { setToolOption } from '../../store/toolSlice';
import { STANDARD_FABRIC_CODES } from '../../utils/fabricCodes';
import { selectPiece } from '../../store/editorSlice';
import type { NotchShape, NotchOptions, InterfacingType, PatternPiece, PlacementRule, PlacementRuleType } from '../../types/types';
import { DEFAULT_NOTCH_OPTIONS } from '../../utils/notches';
import { FORMAS_DE_PIQUETE } from '../../tools/definitions/notch';
import { computeStiffnessMultiplier } from '../../utils/cloth/interfacing';
import { ANNOTATION_TEMPLATES, annotationId, sanitizeAnnotationText } from '../../utils/annotationTemplates';
import PropertySection from './PropertySection';

interface PiecePropertiesProps {
  piece: PatternPiece;
  collapsed: boolean;
  /** SIMULACIÓN plegada por defecto — patronaje y solver no se mezclan (Fase 3). */
  simCollapsed: boolean;
  onToggle: (id: string) => void;
}

export default function PieceProperties({ piece, collapsed, simCollapsed, onToggle }: PiecePropertiesProps) {
  const dispatch = useDispatch();
  const fabrics = useSelector((s: RootState) => s.project.fabrics);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  // Notch defaults live in tools.toolOptions.notch (G6 convention, canonical
  // keys = NotchOptions names) — the notch tool reads them on every click.
  // The old panel kept these in local useState, which wrote nowhere.
  const storeNotchOptions = useSelector(
    (s: RootState) => s.tools.toolOptions?.notch as Partial<NotchOptions> | undefined,
  );
  const notchSettings: NotchOptions = { ...DEFAULT_NOTCH_OPTIONS, ...storeNotchOptions };
  const setNotchOption = (optionId: keyof NotchOptions, value: NotchOptions[keyof NotchOptions]) =>
    dispatch(setToolOption({ toolId: 'notch', optionId, value }));
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [customText, setCustomText] = useState('');

  const handleAddTemplate = () => {
    const tpl = ANNOTATION_TEMPLATES.find(t => t.text === selectedTemplate);
    if (!tpl) return;
    dispatch(addAnnotation({
      pieceId: piece.id,
      annotation: { id: annotationId(), text: tpl.text, position: 'center', category: tpl.category, fontSize: 8 },
    }));
    setSelectedTemplate('');
  };

  const handleAddCustom = () => {
    if (!customText.trim()) return;
    dispatch(addAnnotation({
      pieceId: piece.id,
      annotation: { id: annotationId(), text: sanitizeAnnotationText(customText), position: 'center', category: 'general', fontSize: 8 },
    }));
    setCustomText('');
  };

  return (
    <>
    <PropertySection id="piece" title="PIEZA" collapsed={collapsed} onToggle={onToggle}>
      <div className="panel-field">
        <label htmlFor="prop-piece-name">Nombre</label>
        <input
          id="prop-piece-name"
          type="text"
          className="panel-input panel-input--grow"
          title={piece.name}
          value={piece.name}
          onChange={e => dispatch(updatePiece({ ...piece, name: e.target.value, updatedAt: Date.now() }))}
        />
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-sa">Margen (mm)</label>
        <input
          id="prop-piece-sa"
          type="number"
          className="panel-input narrow"
          value={piece.seamAllowance}
          min={0}
          max={50}
          onChange={e => dispatch(updatePiece({ ...piece, seamAllowance: Number(e.target.value), updatedAt: Date.now() }))}
        />
      </div>
      <div className="panel-field panel-field--wrap">
        <label>Preajustes de margen</label>
        <div className="panel-preset-row">
          {/* Cada preajuste se llama como su tipo de costura en el pie y en la etiqueta (P3c). */}
          {([['Overlock', 8], ['Normal', 10], ['Flat-felled', 12], ['Francesa', 15]] as const).map(([label, width]) => (
            <button
              key={label}
              className="panel-chip-btn"
              onClick={() => dispatch(updatePiece({ ...piece, seamAllowance: width, updatedAt: Date.now() }))}
              title={`${label}: ${width}mm`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-fabric">Tela</label>
        <select
          id="prop-piece-fabric"
          className="panel-input"
          value={piece.fabricId || ''}
          onChange={e => dispatch(updatePiece({ ...piece, fabricId: e.target.value || undefined, updatedAt: Date.now() }))}
        >
          <option value="">Ninguna</option>
          {fabrics.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-fabric-code">Código de tela</label>
        {(() => {
          const current = piece.fabricCode || 'SELF';
          const isCustom = !STANDARD_FABRIC_CODES.includes(current as typeof STANDARD_FABRIC_CODES[number]);
          return isCustom ? (
            <input
              id="prop-piece-fabric-code"
              className="panel-input"
              value={current}
              onChange={e => dispatch(setFabricCode({ pieceId: piece.id, fabricCode: e.target.value }))}
              onBlur={e => { if (!e.target.value.trim()) dispatch(setFabricCode({ pieceId: piece.id, fabricCode: 'SELF' })); }}
            />
          ) : (
            <select
              id="prop-piece-fabric-code"
              className="panel-input"
              value={current}
              onChange={e => {
                if (e.target.value === '__custom__') {
                  dispatch(setFabricCode({ pieceId: piece.id, fabricCode: 'CUSTOM' }));
                } else {
                  dispatch(setFabricCode({ pieceId: piece.id, fabricCode: e.target.value }));
                }
              }}
            >
              {STANDARD_FABRIC_CODES.map(code => (
                <option key={code} value={code}>{code}</option>
              ))}
              <option value="__custom__">Personalizado...</option>
            </select>
          );
        })()}
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-interfacing">Entretela</label>
        <select
          id="prop-piece-interfacing"
          className="panel-input"
          value={piece.interfacingType || 'none'}
          onChange={e => dispatch(updatePiece({ ...piece, interfacingType: e.target.value as InterfacingType, updatedAt: Date.now() }))}
        >
          <option value="none">Ninguna</option>
          <option value="fusible-light">Termoadhesiva ligera (2x)</option>
          <option value="fusible-medium">Termoadhesiva media (4x)</option>
          <option value="fusible-heavy">Termoadhesiva pesada (8x)</option>
          <option value="sew-in-light">De coser ligera (1.5x)</option>
          <option value="sew-in-heavy">De coser pesada (3x)</option>
          <option value="canvas">Crin (10x)</option>
        </select>
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-mirror">Espejada</label>
        <input
          id="prop-piece-mirror"
          type="checkbox"
          checked={piece.mirrored}
          onChange={() => dispatch(updatePiece({ ...piece, mirrored: !piece.mirrored, updatedAt: Date.now() }))}
        />
      </div>
      {/* Linked Editing */}
      {piece.linkedPieceId && (
        <div className="panel-subblock">
          <div className="panel-subtitle">Edición vinculada</div>
          <div className="panel-link-row">
            <span className={piece.linkMode === 'symmetry' ? 'panel-link-mode--symmetry' : 'panel-link-mode--instance'}>
              {piece.linkMode === 'symmetry' ? 'Simetría' : 'Instancia'}
            </span>
            {' vinculada a '}
            <button
              className="panel-link"
              onClick={() => dispatch(selectPiece(piece.linkedPieceId!))}
            >
              {pieces.find(p => p.id === piece.linkedPieceId)?.name || piece.linkedPieceId}
            </button>
          </div>
          <button
            className="panel-delete"
            onClick={() => dispatch(unlinkPieces({ pieceId: piece.id }))}
          >
            Quitar edición vinculada
          </button>
        </div>
      )}
      {/* Annotations */}
      <div className="panel-subtitle panel-subtitle--spaced">Anotaciones</div>
      {(piece.annotations || []).map(ann => (
        <div key={ann.id} className="panel-field panel-field--between">
          <span className="panel-item-text">{ann.text}</span>
          <button className="panel-btn-sm" aria-label={`Eliminar anotación ${ann.text}`}
            onClick={() => dispatch(removeAnnotation({ pieceId: piece.id, annotationId: ann.id }))}>✕</button>
        </div>
      ))}
      <div className="panel-field panel-field--row">
        <select className="panel-input panel-input--grow" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
          <option value="">Plantilla...</option>
          {ANNOTATION_TEMPLATES.map((t, i) => <option key={i} value={t.text}>{t.text}</option>)}
        </select>
        <button className="panel-btn-sm" onClick={handleAddTemplate} disabled={!selectedTemplate}>+</button>
      </div>
      <div className="panel-field panel-field--row">
        <input className="panel-input panel-input--grow" placeholder="Texto personalizado..." value={customText} onChange={e => setCustomText(e.target.value)} />
        <button className="panel-btn-sm" onClick={handleAddCustom} disabled={!customText.trim()}>+</button>
      </div>

      {/* Placement Rules */}
      <div className="panel-subtitle panel-subtitle--spaced">Reglas de colocación</div>
      {(piece.placementRules || []).map((rule, idx) => (
        <div key={idx} className="panel-field panel-field--between">
          <span className="panel-item-text">
            {rule.type === 'atFold' ? 'Al doblez' :
             rule.type === 'atEdge' ? `Al borde ${rule.edge === 'right' ? 'derecho' : 'izquierdo'}` :
             rule.type === 'priority' ? `Prioridad ${rule.value || 1}` :
             rule.type === 'grainTilt' ? `Inclinación ≤${rule.value || 5}°` :
             rule.type === 'pairWith' ? 'Emparejar' :
             rule.type === 'minDistance' ? `Mín ${rule.value || 10}mm` : rule.type}
          </span>
          <button className="panel-btn-sm" aria-label="Eliminar regla de colocación"
            onClick={() => dispatch(removePlacementRule({ pieceId: piece.id, ruleIndex: idx }))}>✕</button>
        </div>
      ))}
      <div className="panel-field panel-field--row">
        <select className="panel-input panel-input--grow" value="" onChange={e => {
          if (!e.target.value) return;
          const type = e.target.value as PlacementRuleType;
          const rule: PlacementRule = { type };
          if (type === 'priority') rule.value = 1;
          if (type === 'grainTilt') rule.value = 5;
          if (type === 'minDistance') rule.value = 10;
          if (type === 'atEdge') rule.edge = 'left';
          dispatch(addPlacementRule({ pieceId: piece.id, rule }));
          e.target.value = '';
        }}>
          <option value="">Agregar regla...</option>
          <option value="atFold">Al doblez</option>
          <option value="atEdge">Al borde</option>
          <option value="priority">Prioridad</option>
          <option value="grainTilt">Inclinación de hilo</option>
          <option value="pairWith">Emparejar con</option>
          <option value="minDistance">Distancia mínima</option>
        </select>
      </div>

      {/* Notch defaults — written to tools.toolOptions.notch; the notch tool
          merges them over DEFAULT_NOTCH_OPTIONS on every placement. */}
      <div className="panel-subblock">
        <div className="panel-subtitle">Ajustes de piquete</div>
        <div className="panel-field">
          <label htmlFor="prop-notch-shape">Forma</label>
          <select
            id="prop-notch-shape"
            className="panel-input"
            value={notchSettings.shape}
            onChange={e => setNotchOption('shape', e.target.value as NotchShape)}
          >
            {/* Los nombres de la línea al pie: un término por concepto (P3c). */}
            {FORMAS_DE_PIQUETE.map(c => (
              <option key={String(c.value)} value={String(c.value)}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="panel-field">
          <label htmlFor="prop-notch-length">Profundidad (mm)</label>
          <input id="prop-notch-length" type="number" className="panel-input narrow" value={notchSettings.length} min={1} max={30}
            onChange={e => setNotchOption('length', Number(e.target.value))} />
        </div>
        <div className="panel-field">
          <label htmlFor="prop-notch-width">Ancho (mm)</label>
          <input id="prop-notch-width" type="number" className="panel-input narrow" value={notchSettings.width} min={1} max={20}
            onChange={e => setNotchOption('width', Number(e.target.value))} />
        </div>
        <div className="panel-field">
          <label htmlFor="prop-notch-count">Cantidad</label>
          <select id="prop-notch-count" className="panel-input" value={notchSettings.count}
            onChange={e => setNotchOption('count', Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
      </div>
    </PropertySection>

    <PropertySection id="layer" title="CAPA" collapsed={collapsed} onToggle={onToggle}>
      <div className="panel-field">
        <label htmlFor="prop-piece-layer">Capa</label>
        <input
          id="prop-piece-layer"
          type="number"
          className="panel-input narrow"
          value={piece.layer ?? 1}
          min={0}
          max={9}
          onChange={e => dispatch(setLayer({ pieceId: piece.id, layer: Number(e.target.value) }))}
        />
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-sublayer">Subcapa</label>
        <input
          id="prop-piece-sublayer"
          type="number"
          className="panel-input narrow"
          value={piece.sublayer ?? 0}
          min={0}
          max={9}
          onChange={e => dispatch(setSublayer({ pieceId: piece.id, sublayer: Number(e.target.value) }))}
        />
      </div>
    </PropertySection>

    <PropertySection id="sim" title="SIMULACIÓN" collapsed={simCollapsed} onToggle={onToggle}>
      <div className="panel-field">
        <label>Solidificar</label>
        <input
          type="range" className="panel-slider"
          min={0} max={100} value={Math.round((piece.solidifyFactor ?? 0) * 100)}
          onChange={e => dispatch(updatePiece({ ...piece, solidifyFactor: Number(e.target.value) / 100, updatedAt: Date.now() }))}
        />
        <span className="panel-value">{((piece.solidifyFactor ?? 0) * 100).toFixed(0)}%</span>
      </div>
      <div className="panel-field">
        <label>Presión (Pa)</label>
        <input
          type="range" className="panel-slider"
          min={0} max={500} step={10}
          value={piece.pressurePa || 0}
          onChange={e => dispatch(updatePiece({ ...piece, pressurePa: Number(e.target.value), updatedAt: Date.now() }))}
        />
        <span className="panel-value">{piece.pressurePa || 0}</span>
      </div>
      {(piece.interfacingType && piece.interfacingType !== 'none' || (piece.solidifyFactor ?? 0) > 0) && (
        <div className="panel-hint">
          Rigidez efectiva: {computeStiffnessMultiplier(piece.interfacingType, piece.solidifyFactor).toFixed(1)}x
        </div>
      )}
    </PropertySection>


    </>
  );
}
