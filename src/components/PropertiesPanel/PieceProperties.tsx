import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece, removePiece, unlinkPieces, setLayer, setSublayer, addAnnotation, removeAnnotation, setFabricCode, addPlacementRule, removePlacementRule } from '../../store/projectSlice';
import { setToolOption } from '../../store/toolSlice';
import { STANDARD_FABRIC_CODES } from '../../utils/fabricCodes';
import { clearSelection, selectPiece } from '../../store/editorSlice';
import type { NotchShape, NotchOptions, InterfacingType, PatternPiece, PlacementRule, PlacementRuleType } from '../../types/types';
import { DEFAULT_NOTCH_OPTIONS } from '../../utils/notches';
import { computeStiffnessMultiplier } from '../../utils/cloth/interfacing';
import { ANNOTATION_TEMPLATES, annotationId, sanitizeAnnotationText } from '../../utils/annotationTemplates';
import PropertySection from './PropertySection';

interface PiecePropertiesProps {
  piece: PatternPiece;
  collapsed: boolean;
  onToggle: (id: string) => void;
}

export default function PieceProperties({ piece, collapsed, onToggle }: PiecePropertiesProps) {
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

  const handleDeletePiece = () => {
    dispatch(removePiece(piece.id));
    dispatch(clearSelection());
  };

  return (
    <>
    <PropertySection id="piece" title="PIECE" collapsed={collapsed} onToggle={onToggle}>
      <div className="panel-field">
        <label htmlFor="prop-piece-name">Name</label>
        <input
          id="prop-piece-name"
          type="text"
          className="panel-input"
          value={piece.name}
          onChange={e => dispatch(updatePiece({ ...piece, name: e.target.value, updatedAt: Date.now() }))}
        />
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-sa">Seam (mm)</label>
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
        <label>SA Presets</label>
        <div className="panel-preset-row">
          {([['Overlock', 8], ['Standard', 10], ['Flat-felled', 12], ['French', 15]] as const).map(([label, width]) => (
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
        <label htmlFor="prop-piece-fabric">Fabric</label>
        <select
          id="prop-piece-fabric"
          className="panel-input"
          value={piece.fabricId || ''}
          onChange={e => dispatch(updatePiece({ ...piece, fabricId: e.target.value || undefined, updatedAt: Date.now() }))}
        >
          <option value="">None</option>
          {fabrics.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-fabric-code">Fabric Code</label>
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
              <option value="__custom__">Custom...</option>
            </select>
          );
        })()}
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-interfacing">Interfacing</label>
        <select
          id="prop-piece-interfacing"
          className="panel-input"
          value={piece.interfacingType || 'none'}
          onChange={e => dispatch(updatePiece({ ...piece, interfacingType: e.target.value as InterfacingType, updatedAt: Date.now() }))}
        >
          <option value="none">None</option>
          <option value="fusible-light">Fusible Light (2x)</option>
          <option value="fusible-medium">Fusible Medium (4x)</option>
          <option value="fusible-heavy">Fusible Heavy (8x)</option>
          <option value="sew-in-light">Sew-in Light (1.5x)</option>
          <option value="sew-in-heavy">Sew-in Heavy (3x)</option>
          <option value="canvas">Canvas (10x)</option>
        </select>
      </div>
      <div className="panel-field">
        <label>Solidify</label>
        <input
          type="range" className="panel-slider"
          min={0} max={100} value={Math.round((piece.solidifyFactor ?? 0) * 100)}
          onChange={e => dispatch(updatePiece({ ...piece, solidifyFactor: Number(e.target.value) / 100, updatedAt: Date.now() }))}
        />
        <span className="panel-value">{((piece.solidifyFactor ?? 0) * 100).toFixed(0)}%</span>
      </div>
      <div className="panel-field">
        <label>Pressure (Pa)</label>
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
          Effective stiffness: {computeStiffnessMultiplier(piece.interfacingType, piece.solidifyFactor).toFixed(1)}x
        </div>
      )}
      <div className="panel-field">
        <label htmlFor="prop-piece-mirror">Mirror</label>
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
          <div className="panel-subtitle">Linked Editing</div>
          <div className="panel-link-row">
            <span className={piece.linkMode === 'symmetry' ? 'panel-link-mode--symmetry' : 'panel-link-mode--instance'}>
              {piece.linkMode === 'symmetry' ? 'Symmetry' : 'Instance'}
            </span>
            {' linked to '}
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
            Remove Linked Editing
          </button>
        </div>
      )}
      {/* Annotations */}
      <div className="panel-subtitle panel-subtitle--spaced">Annotations</div>
      {(piece.annotations || []).map(ann => (
        <div key={ann.id} className="panel-field panel-field--between">
          <span className="panel-item-text">{ann.text}</span>
          <button className="panel-btn-sm" aria-label={`Remove annotation ${ann.text}`}
            onClick={() => dispatch(removeAnnotation({ pieceId: piece.id, annotationId: ann.id }))}>✕</button>
        </div>
      ))}
      <div className="panel-field panel-field--row">
        <select className="panel-input panel-input--grow" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
          <option value="">Template...</option>
          {ANNOTATION_TEMPLATES.map((t, i) => <option key={i} value={t.text}>{t.text}</option>)}
        </select>
        <button className="panel-btn-sm" onClick={handleAddTemplate} disabled={!selectedTemplate}>+</button>
      </div>
      <div className="panel-field panel-field--row">
        <input className="panel-input panel-input--grow" placeholder="Custom..." value={customText} onChange={e => setCustomText(e.target.value)} />
        <button className="panel-btn-sm" onClick={handleAddCustom} disabled={!customText.trim()}>+</button>
      </div>

      {/* Placement Rules */}
      <div className="panel-subtitle panel-subtitle--spaced">Placement Rules</div>
      {(piece.placementRules || []).map((rule, idx) => (
        <div key={idx} className="panel-field panel-field--between">
          <span className="panel-item-text">
            {rule.type === 'atFold' ? '📐 At Fold' :
             rule.type === 'atEdge' ? `📏 At ${rule.edge || 'left'} edge` :
             rule.type === 'priority' ? `⬆️ Priority ${rule.value || 1}` :
             rule.type === 'grainTilt' ? `↗️ Tilt ≤${rule.value || 5}°` :
             rule.type === 'pairWith' ? `🔗 Pair` :
             rule.type === 'minDistance' ? `↔️ Min ${rule.value || 10}mm` : rule.type}
          </span>
          <button className="panel-btn-sm" aria-label="Remove placement rule"
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
          <option value="">Add rule...</option>
          <option value="atFold">At Fold</option>
          <option value="atEdge">At Edge</option>
          <option value="priority">Priority</option>
          <option value="grainTilt">Grain Tilt</option>
          <option value="pairWith">Pair With</option>
          <option value="minDistance">Min Distance</option>
        </select>
      </div>

      <button className="panel-delete" onClick={handleDeletePiece}>
        Delete Piece
      </button>

      {/* Notch defaults — written to tools.toolOptions.notch; the notch tool
          merges them over DEFAULT_NOTCH_OPTIONS on every placement. */}
      <div className="panel-subblock">
        <div className="panel-subtitle">Notch Settings</div>
        <div className="panel-field">
          <label htmlFor="prop-notch-shape">Shape</label>
          <select
            id="prop-notch-shape"
            className="panel-input"
            value={notchSettings.shape}
            onChange={e => setNotchOption('shape', e.target.value as NotchShape)}
          >
            <option value="slit">Slit</option>
            <option value="t-notch">T-Notch</option>
            <option value="v-internal">V-Internal</option>
            <option value="v-external">V-External</option>
            <option value="u-notch">U-Notch</option>
            <option value="castle">Castle</option>
            <option value="diamond">Diamond</option>
          </select>
        </div>
        <div className="panel-field">
          <label htmlFor="prop-notch-length">Depth (mm)</label>
          <input id="prop-notch-length" type="number" className="panel-input narrow" value={notchSettings.length} min={1} max={30}
            onChange={e => setNotchOption('length', Number(e.target.value))} />
        </div>
        <div className="panel-field">
          <label htmlFor="prop-notch-width">Width (mm)</label>
          <input id="prop-notch-width" type="number" className="panel-input narrow" value={notchSettings.width} min={1} max={20}
            onChange={e => setNotchOption('width', Number(e.target.value))} />
        </div>
        <div className="panel-field">
          <label htmlFor="prop-notch-count">Count</label>
          <select id="prop-notch-count" className="panel-input" value={notchSettings.count}
            onChange={e => setNotchOption('count', Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
      </div>
    </PropertySection>

    <PropertySection id="layer" title="LAYER" collapsed={collapsed} onToggle={onToggle}>
      <div className="panel-field">
        <label htmlFor="prop-piece-layer">Layer</label>
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
        <label htmlFor="prop-piece-sublayer">Sublayer</label>
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
    </>
  );
}
