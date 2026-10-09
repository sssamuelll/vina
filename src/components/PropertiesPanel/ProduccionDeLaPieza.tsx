import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { updatePiece, setLayer, setSublayer, addAnnotation, removeAnnotation, setFabricCode, addPlacementRule, removePlacementRule } from '../../store/projectSlice';
import { STANDARD_FABRIC_CODES } from '../../utils/fabricCodes';
import type { InterfacingType, PatternPiece, PlacementRule, PlacementRuleType } from '../../types/types';
import { computeStiffnessMultiplier } from '../../utils/cloth/interfacing';
import { ANNOTATION_TEMPLATES, annotationId, sanitizeAnnotationText } from '../../utils/annotationTemplates';
import MaterialTab from './MaterialTab';

/**
 * El segundo nivel de Propiedades de una pieza, plegado en «Producción» (spec
 * 2026-10-02 § 6.1): código de tela, entretela, anotaciones, reglas de
 * colocación, capa y subcapa, simulación y material, en ese orden. Los
 * controles son los que había en `PieceProperties` y en la sección Material;
 * solo cambian de sitio. Capa y Simulación dejan de ser secciones plegables:
 * ya las pliega «Producción».
 */
export default function ProduccionDeLaPieza({ piece }: { piece: PatternPiece }) {
  const dispatch = useDispatch();
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

      <div className="panel-subblock">
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
      </div>

      <div className="panel-subtitle panel-subtitle--spaced">Simulación</div>
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

      <div className="panel-subtitle panel-subtitle--spaced">Material</div>
      <MaterialTab />
    </>
  );
}
