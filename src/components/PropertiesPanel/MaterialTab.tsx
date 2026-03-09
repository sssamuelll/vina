import { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { setFabric, setPieceTint, setPieceUVTransform } from '../../store/simulationSlice';
import { PHYSICAL_FABRIC_LIBRARY, getPhysicalFabric } from '../../utils/cloth/physicalFabric';

export default function MaterialTab() {
  const dispatch = useDispatch();
  const selectedPieceId = useSelector((s: RootState) => {
    const ids = s.editor?.selectedPieceIds;
    return ids && ids.length > 0 ? ids[0] : null;
  });
  const pieceFabrics = useSelector((s: RootState) => s.simulation.pieceFabrics);
  const defaultFabricId = useSelector((s: RootState) => s.simulation.defaultFabricId);
  const pieceTints = useSelector((s: RootState) => s.simulation.pieceTints);
  const pieceUVTransforms = useSelector((s: RootState) => s.simulation.pieceUVTransforms);

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
  const uv = pieceUVTransforms[selectedPieceId] || { repeatX: 4, repeatY: 4, rotation: 0 };

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

      {/* UV Transform */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>UV TRANSFORM</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 10, color: '#aaa' }}>
            Repeat X
            <input
              type="number"
              value={uv.repeatX}
              step={1}
              min={0.1}
              onChange={e => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, repeatX: Number(e.target.value) }))}
              style={{ width: 45, marginLeft: 4, background: '#333', border: '1px solid #555', borderRadius: 3, color: '#fff', padding: '2px 4px', fontSize: 11 }}
            />
          </label>
          <label style={{ fontSize: 10, color: '#aaa' }}>
            Y
            <input
              type="number"
              value={uv.repeatY}
              step={1}
              min={0.1}
              onChange={e => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, repeatY: Number(e.target.value) }))}
              style={{ width: 45, marginLeft: 4, background: '#333', border: '1px solid #555', borderRadius: 3, color: '#fff', padding: '2px 4px', fontSize: 11 }}
            />
          </label>
          <label style={{ fontSize: 10, color: '#aaa' }}>
            Rot
            <input
              type="number"
              value={uv.rotation}
              step={15}
              min={0}
              max={360}
              onChange={e => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, rotation: Number(e.target.value) }))}
              style={{ width: 45, marginLeft: 4, background: '#333', border: '1px solid #555', borderRadius: 3, color: '#fff', padding: '2px 4px', fontSize: 11 }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
