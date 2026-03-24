import { useCallback, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { setFabric, setPieceTint, setPieceUVTransform, setPieceTextureOverride, setPieceOpacity, setPieceEmission, clearPieceEmission } from '../../store/simulationSlice';
import { PHYSICAL_FABRIC_LIBRARY, getPhysicalFabric } from '../../utils/cloth/physicalFabric';

// Note: Drag-drop textures use blob URLs which are session-scoped and won't
// survive page reload. This is intentional for quick previews — persistent
// texture storage would require a backend or IndexedDB, which is out of scope.
function TextureSlot({ slot, pieceId }: { slot: 'diffuse' | 'normal' | 'roughness' | 'ao'; pieceId: string }) {
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
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
        borderBottom: '1px solid #333',
      }}
    >
      <div style={{ width: 28, height: 28, background: '#333', borderRadius: 3, border: '1px dashed #555', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {url ? (
          <img src={url} alt={slot} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 8, color: '#666' }}>+</span>
        )}
      </div>
      <span style={{ fontSize: 10, color: '#aaa', textTransform: 'capitalize', flex: 1 }}>{slot}</span>
      {url && (
        <button
          onClick={() => {
            if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
            dispatch(setPieceTextureOverride({ pieceId, slot, url: null }));
          }}
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 12 }}
        >
          x
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
    return <div style={{ padding: 8, color: '#888', fontSize: 11 }}>Select a piece to edit material</div>;
  }

  const fabricId = pieceFabrics[selectedPieceId] || defaultFabricId;
  const fabric = getPhysicalFabric(fabricId);
  const tint = pieceTints[selectedPieceId] || '#ffffff';
  const uv = pieceUVTransforms[selectedPieceId] || { repeatX: 4, repeatY: 4, rotation: 0, offsetX: 0, offsetY: 0 };
  const currentOpacity = pieceOpacity[selectedPieceId] ?? 1.0;
  const currentEmission = pieceEmission[selectedPieceId] || null;
  const currentEmissionIntensity = pieceEmissionIntensity[selectedPieceId] ?? 0;

  return (
    <div style={{ padding: '0 8px' }}>
      {/* Fabric Preset Grid */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>FABRIC PRESET</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {PHYSICAL_FABRIC_LIBRARY.map(f => (
            <button
              key={f.id}
              onClick={() => handleFabricSelect(f.id)}
              title={`${f.name} — ${f.weight}gsm ${f.weaveType}`}
              style={{
                width: '100%',
                aspectRatio: '1',
                border: f.id === fabricId ? '2px solid #4a9eff' : '1px solid #444',
                borderRadius: 4,
                background: '#333',
                cursor: 'pointer',
                padding: 2,
                fontSize: 8,
                color: '#ccc',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {f.name.split(' ').slice(0, 2).join(' ')}
            </button>
          ))}
        </div>
        {fabric && (
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
            {fabric.name} — {fabric.weight}gsm — {fabric.weaveType}
          </div>
        )}
      </div>

      {/* Color Tint */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>COLOR TINT</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="color"
            value={tint}
            onChange={e => dispatch(setPieceTint({ pieceId: selectedPieceId, tint: e.target.value }))}
            style={{ width: 28, height: 28, border: '1px solid #555', borderRadius: 4, cursor: 'pointer' }}
          />
          <input
            type="text"
            value={tint}
            onChange={e => dispatch(setPieceTint({ pieceId: selectedPieceId, tint: e.target.value }))}
            style={{ width: 70, background: '#333', border: '1px solid #555', borderRadius: 3, color: '#fff', padding: '2px 6px', fontSize: 11 }}
          />
          <button
            onClick={() => dispatch(setPieceTint({ pieceId: selectedPieceId, tint: '#ffffff' }))}
            style={{ background: '#555', border: 'none', borderRadius: 3, color: '#ccc', padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Opacity */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>OPACITY</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(currentOpacity * 100)}
            onChange={e => {
              const val = Number(e.target.value) / 100;
              dispatch(setPieceOpacity({ pieceId: selectedPieceId, opacity: val }));
            }}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 10, color: '#aaa', minWidth: 32, textAlign: 'right' }}>{Math.round(currentOpacity * 100)}%</span>
        </div>
      </div>

      {/* Emission */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>EMISSION</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="color"
            value={currentEmission || '#000000'}
            onChange={e => {
              dispatch(setPieceEmission({ pieceId: selectedPieceId, color: e.target.value, intensity: currentEmissionIntensity || 1 }));
            }}
            style={{ width: 28, height: 28, border: '1px solid #555', borderRadius: 4, cursor: 'pointer' }}
          />
          {currentEmission && currentEmission !== '#000000' && (
            <>
              <input
                type="range"
                min={0}
                max={500}
                value={Math.round(currentEmissionIntensity * 100)}
                onChange={e => {
                  dispatch(setPieceEmission({ pieceId: selectedPieceId, color: currentEmission, intensity: Number(e.target.value) / 100 }));
                }}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: '#aaa', minWidth: 32, textAlign: 'right' }}>{currentEmissionIntensity.toFixed(1)}</span>
              <button
                onClick={() => dispatch(clearPieceEmission(selectedPieceId))}
                style={{ background: '#555', border: 'none', borderRadius: 3, color: '#ccc', padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* UV Transform */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>UV TRANSFORM</div>

        {/* Repeat Presets */}
        <div className="panel-field" style={{ gap: 4 }}>
          <label>Presets</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 4, 8].map(n => (
              <button
                key={n}
                className="panel-btn-sm"
                onClick={() => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, repeatX: n, repeatY: n }))}
                style={{ fontSize: 11, padding: '2px 6px' }}
              >
                {n}x{n}
              </button>
            ))}
          </div>
        </div>

        {/* Repeat X */}
        <div className="panel-field">
          <label>
            Repeat X
            <button
              onClick={() => setLockAspect(!lockAspect)}
              title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, marginLeft: 4, padding: 0 }}
            >
              {lockAspect ? '\uD83D\uDD17' : '\uD83D\uDD13'}
            </button>
          </label>
          <input
            type="range"
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
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, opacity: 0.7, minWidth: 30, textAlign: 'right' }}>{uv.repeatX}</span>
        </div>

        {/* Repeat Y */}
        <div className="panel-field">
          <label>Repeat Y</label>
          <input
            type="range"
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
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, opacity: 0.7, minWidth: 30, textAlign: 'right' }}>{uv.repeatY}</span>
        </div>

        {/* Offset X */}
        <div className="panel-field">
          <label>Offset X</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={uv.offsetX ?? 0}
            onChange={e => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, offsetX: Number(e.target.value) }))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, opacity: 0.7, minWidth: 30, textAlign: 'right' }}>{(uv.offsetX ?? 0).toFixed(2)}</span>
        </div>

        {/* Offset Y */}
        <div className="panel-field">
          <label>Offset Y</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={uv.offsetY ?? 0}
            onChange={e => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, offsetY: Number(e.target.value) }))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, opacity: 0.7, minWidth: 30, textAlign: 'right' }}>{(uv.offsetY ?? 0).toFixed(2)}</span>
        </div>

        {/* Rotation */}
        <div className="panel-field">
          <label>Rotation</label>
          <input
            type="range"
            min={0}
            max={360}
            step={15}
            value={uv.rotation}
            onChange={e => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, rotation: Number(e.target.value) }))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, opacity: 0.7, minWidth: 30, textAlign: 'right' }}>{uv.rotation}&deg;</span>
        </div>
      </div>

      {/* Texture Map Slots */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>TEXTURE OVERRIDES</div>
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
