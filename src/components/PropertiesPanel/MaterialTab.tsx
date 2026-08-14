import { useCallback, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { setFabric, setPieceTint, setPieceUVTransform, setPieceTextureOverride, setPieceOpacity, setPieceEmission, clearPieceEmission, DEFAULT_UV_TRANSFORM } from '../../store/simulationSlice';
import {
  PHYSICAL_FABRIC_LIBRARY,
  getPhysicalFabric,
  type WeaveType,
} from '../../utils/cloth/physicalFabric';

type TextureSlotId = 'diffuse' | 'normal' | 'roughness' | 'ao';

const TEXTURE_SLOT_LABELS: Record<TextureSlotId, string> = {
  diffuse: 'color',
  normal: 'normales',
  roughness: 'rugosidad',
  ao: 'oclusión ambiental',
};

const WEAVE_TYPE_LABELS: Record<WeaveType, string> = {
  plain: 'tejido plano',
  twill: 'sarga',
  satin: 'satén',
  'knit-jersey': 'punto jersey',
  'knit-rib': 'punto canalé',
  'knit-interlock': 'punto interlock',
  nonwoven: 'no tejido',
  leather: 'cuero',
  mesh: 'malla',
  pile: 'pelo',
  technical: 'tejido técnico',
};

// Note: Drag-drop textures use blob URLs which are session-scoped and won't
// survive page reload. This is intentional for quick previews — persistent
// texture storage would require a backend or IndexedDB, which is out of scope.
function TextureSlot({ slot, pieceId }: { slot: TextureSlotId; pieceId: string }) {
  const dispatch = useDispatch();
  const overrides = useSelector((s: RootState) => s.simulation.pieceTextureOverrides[pieceId]);
  const url = overrides?.[slot];

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    // Revoke previous blob URL to prevent memory leak
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
    const blobUrl = URL.createObjectURL(file);
    dispatch(setPieceTextureOverride({ pieceId, slot, url: blobUrl }));
  }, [dispatch, pieceId, slot, url]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  return (
    <div className="material-texture-slot" onDrop={handleDrop} onDragOver={handleDragOver}>
      <div className="material-texture-thumb">
        {url ? (
          <img src={url} alt={`Textura de ${TEXTURE_SLOT_LABELS[slot]}`} />
        ) : (
          <span className="material-texture-plus">+</span>
        )}
      </div>
      <span className="material-texture-name">{TEXTURE_SLOT_LABELS[slot]}</span>
      {url && (
        <button
          className="panel-btn-sm"
          aria-label={`Quitar textura de ${TEXTURE_SLOT_LABELS[slot]}`}
          onClick={() => {
            if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
            dispatch(setPieceTextureOverride({ pieceId, slot, url: null }));
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default function MaterialTab() {
  const dispatch = useDispatch();
  const [lockAspect, setLockAspect] = useState(true);
  const selectedPieceId = useSelector((s: RootState) => {
    const ids = s.editor?.selectedPieceIds;
    return ids && ids.length > 0 ? ids[0] : null;
  });
  const pieceFabrics = useSelector((s: RootState) => s.simulation.pieceFabrics);
  const defaultFabricId = useSelector((s: RootState) => s.simulation.defaultFabricId);
  const pieceTints = useSelector((s: RootState) => s.simulation.pieceTints);
  const pieceUVTransforms = useSelector((s: RootState) => s.simulation.pieceUVTransforms);
  const pieceOpacity = useSelector((s: RootState) => s.simulation.pieceOpacity);
  const pieceEmission = useSelector((s: RootState) => s.simulation.pieceEmission);
  const pieceEmissionIntensity = useSelector((s: RootState) => s.simulation.pieceEmissionIntensity);

  const handleFabricSelect = useCallback((id: string) => {
    if (!selectedPieceId) return;
    dispatch(setFabric({ pieceId: selectedPieceId, fabricId: id }));
  }, [dispatch, selectedPieceId]);

  if (!selectedPieceId) {
    return <div className="panel-empty">Selecciona una pieza para editar el material</div>;
  }

  const fabricId = pieceFabrics[selectedPieceId] || defaultFabricId;
  const fabric = getPhysicalFabric(fabricId);
  const tint = pieceTints[selectedPieceId] || '#ffffff';
  const uv = pieceUVTransforms[selectedPieceId] || DEFAULT_UV_TRANSFORM;
  const currentOpacity = pieceOpacity[selectedPieceId] ?? 1.0;
  const currentEmission = pieceEmission[selectedPieceId] || null;
  const currentEmissionIntensity = pieceEmissionIntensity[selectedPieceId] ?? 0;

  return (
    <div className="material-tab">
      {/* Fabric Preset Grid */}
      <div className="material-block">
        <div className="panel-subtitle">Preajuste de tela</div>
        <div className="material-grid">
          {PHYSICAL_FABRIC_LIBRARY.map(f => (
            <button
              key={f.id}
              className={`material-swatch ${f.id === fabricId ? 'material-swatch--active' : ''}`}
              onClick={() => handleFabricSelect(f.id)}
              title={`${f.nameEs} — ${f.weight} g/m² — ${WEAVE_TYPE_LABELS[f.weaveType]}`}
            >
              {f.nameEs.split(' ').slice(0, 2).join(' ')}
            </button>
          ))}
        </div>
        {fabric && (
          <div className="panel-hint">
            {fabric.nameEs} — {fabric.weight} g/m² — {WEAVE_TYPE_LABELS[fabric.weaveType]}
          </div>
        )}
      </div>

      {/* Color Tint */}
      <div className="material-block">
        <div className="panel-subtitle">Tinte</div>
        <div className="material-row">
          <input
            type="color"
            className="material-color"
            value={tint}
            onChange={e => dispatch(setPieceTint({ pieceId: selectedPieceId, tint: e.target.value }))}
          />
          <input
            type="text"
            className="panel-input material-hex"
            value={tint}
            onChange={e => dispatch(setPieceTint({ pieceId: selectedPieceId, tint: e.target.value }))}
          />
          <button
            className="panel-chip-btn"
            onClick={() => dispatch(setPieceTint({ pieceId: selectedPieceId, tint: '#ffffff' }))}
          >
            Restablecer
          </button>
        </div>
      </div>

      {/* Opacity */}
      <div className="material-block">
        <div className="panel-subtitle">Opacidad</div>
        <div className="material-row">
          <input
            type="range" className="panel-slider"
            min={0}
            max={100}
            value={Math.round(currentOpacity * 100)}
            onChange={e => {
              const val = Number(e.target.value) / 100;
              dispatch(setPieceOpacity({ pieceId: selectedPieceId, opacity: val }));
            }}
          />
          <span className="panel-value">{Math.round(currentOpacity * 100)}%</span>
        </div>
      </div>

      {/* Emission */}
      <div className="material-block">
        <div className="panel-subtitle">Emisión</div>
        <div className="material-row">
          <input
            type="color"
            className="material-color"
            value={currentEmission || '#000000'}
            onChange={e => {
              dispatch(setPieceEmission({ pieceId: selectedPieceId, color: e.target.value, intensity: currentEmissionIntensity || 1 }));
            }}
          />
          {currentEmission && currentEmission !== '#000000' && (
            <>
              <input
                type="range" className="panel-slider"
                min={0}
                max={500}
                value={Math.round(currentEmissionIntensity * 100)}
                onChange={e => {
                  dispatch(setPieceEmission({ pieceId: selectedPieceId, color: currentEmission, intensity: Number(e.target.value) / 100 }));
                }}
              />
              <span className="panel-value">{currentEmissionIntensity.toFixed(1)}</span>
              <button
                className="panel-chip-btn"
                onClick={() => dispatch(clearPieceEmission(selectedPieceId))}
              >
                Quitar
              </button>
            </>
          )}
        </div>
      </div>

      {/* UV Transform */}
      <div className="material-block">
        <div className="panel-subtitle">Transformación UV</div>

        {/* Repeat Presets */}
        <div className="panel-field panel-field--row">
          <label>Preajustes</label>
          <div className="panel-preset-row">
            {[1, 2, 4, 8].map(n => (
              <button
                key={n}
                className="panel-btn-sm"
                onClick={() => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, repeatX: n, repeatY: n }))}
              >
                {n}x{n}
              </button>
            ))}
          </div>
        </div>

        {/* Repeat X */}
        <div className="panel-field">
          <label>
            Repetición X
            <button
              className="material-lock-btn"
              onClick={() => setLockAspect(!lockAspect)}
              title={lockAspect ? 'Desbloquear proporción' : 'Bloquear proporción'}
            >
              {lockAspect ? '🔗' : '🔓'}
            </button>
          </label>
          <input
            type="range" className="panel-slider"
            min={0.1}
            max={20}
            step={0.5}
            value={uv.repeatX}
            onChange={e => {
              const val = Number(e.target.value);
              if (lockAspect) {
                dispatch(setPieceUVTransform({ pieceId: selectedPieceId, repeatX: val, repeatY: val }));
              } else {
                dispatch(setPieceUVTransform({ pieceId: selectedPieceId, repeatX: val }));
              }
            }}
          />
          <span className="panel-value">{uv.repeatX}</span>
        </div>

        {/* Repeat Y */}
        <div className="panel-field">
          <label>Repetición Y</label>
          <input
            type="range" className="panel-slider"
            min={0.1}
            max={20}
            step={0.5}
            value={uv.repeatY}
            onChange={e => {
              const val = Number(e.target.value);
              if (lockAspect) {
                dispatch(setPieceUVTransform({ pieceId: selectedPieceId, repeatX: val, repeatY: val }));
              } else {
                dispatch(setPieceUVTransform({ pieceId: selectedPieceId, repeatY: val }));
              }
            }}
          />
          <span className="panel-value">{uv.repeatY}</span>
        </div>

        {/* Offset X */}
        <div className="panel-field">
          <label>Desplazamiento X</label>
          <input
            type="range" className="panel-slider"
            min={0}
            max={1}
            step={0.05}
            value={uv.offsetX ?? 0}
            onChange={e => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, offsetX: Number(e.target.value) }))}
          />
          <span className="panel-value">{(uv.offsetX ?? 0).toFixed(2)}</span>
        </div>

        {/* Offset Y */}
        <div className="panel-field">
          <label>Desplazamiento Y</label>
          <input
            type="range" className="panel-slider"
            min={0}
            max={1}
            step={0.05}
            value={uv.offsetY ?? 0}
            onChange={e => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, offsetY: Number(e.target.value) }))}
          />
          <span className="panel-value">{(uv.offsetY ?? 0).toFixed(2)}</span>
        </div>

        {/* Rotation */}
        <div className="panel-field">
          <label>Rotación</label>
          <input
            type="range" className="panel-slider"
            min={0}
            max={360}
            step={15}
            value={uv.rotation}
            onChange={e => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, rotation: Number(e.target.value) }))}
          />
          <span className="panel-value">{uv.rotation}&deg;</span>
        </div>
      </div>

      {/* Texture Map Slots */}
      <div className="material-block">
        <div className="panel-subtitle">Texturas personalizadas</div>
        {(['diffuse', 'normal', 'roughness', 'ao'] as const).map(slot => (
          <TextureSlot
            key={slot}
            slot={slot}
            pieceId={selectedPieceId}
          />
        ))}
      </div>
    </div>
  );
}
