import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { addColorway, removeColorway, setActiveColorway, updateColorway, duplicateColorway, renameColorway } from '../../store/projectSlice';
import { STANDARD_FABRIC_CODES } from '../../utils/fabricCodes';

export default function ColorwayView() {
  const dispatch = useDispatch();
  const colorways = useSelector((s: RootState) => s.project.colorways);
  const activeColorwayId = useSelector((s: RootState) => s.project.activeColorwayId);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  // Collect all unique fabric codes used in pieces
  const usedCodes = [...new Set(pieces.map(p => p.fabricCode || 'SELF'))];
  const activeColorway = colorways.find(c => c.id === activeColorwayId);

  const handleAdd = () => {
    const name = String.fromCharCode(65 + colorways.length); // A, B, C...
    dispatch(addColorway({ name, overrides: {}, isDefault: colorways.length === 0 }));
  };

  const handleSwitch = (id: string) => {
    dispatch(setActiveColorway(id === activeColorwayId ? null : id));
  };

  const handleDuplicate = (id: string) => {
    const source = colorways.find(c => c.id === id);
    if (source) dispatch(duplicateColorway({ sourceId: id, newName: source.name + ' Copy' }));
  };

  const handleDelete = (id: string) => {
    dispatch(removeColorway(id));
  };

  const handleOverrideColor = (fabricCode: string, color: string) => {
    if (!activeColorway) return;
    dispatch(updateColorway({
      id: activeColorway.id,
      overrides: { [fabricCode]: { ...(activeColorway.overrides[fabricCode] || {}), color } },
    }));
  };

  return (
    <div className="sidebar-view colorway-view">
      <div className="panel-section-title">COLORWAYS</div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {colorways.map(cw => (
          <div key={cw.id} style={{ position: 'relative' }}>
            {editingName === cw.id ? (
              <input
                autoFocus
                className="panel-input"
                style={{ width: 60, fontSize: 11, padding: '2px 4px' }}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onBlur={() => { if (newName.trim()) dispatch(renameColorway({ id: cw.id, name: newName.trim() })); setEditingName(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { if (newName.trim()) dispatch(renameColorway({ id: cw.id, name: newName.trim() })); setEditingName(null); } }}
              />
            ) : (
              <button
                onClick={() => handleSwitch(cw.id)}
                onDoubleClick={() => { setEditingName(cw.id); setNewName(cw.name); }}
                onContextMenu={e => { e.preventDefault(); handleDuplicate(cw.id); }}
                style={{
                  padding: '3px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                  border: cw.id === activeColorwayId ? '1px solid #4a9eff' : '1px solid #444',
                  background: cw.id === activeColorwayId ? '#2a3a4a' : '#1e1e1e',
                  color: cw.id === activeColorwayId ? '#4a9eff' : '#aaa',
                  fontWeight: cw.id === activeColorwayId ? 600 : 400,
                }}
                title={`Click: activate | Double-click: rename | Right-click: duplicate`}
              >
                {cw.name}
              </button>
            )}
            {colorways.length > 1 && (
              <button
                onClick={() => handleDelete(cw.id)}
                style={{ position: 'absolute', top: -4, right: -4, fontSize: 8, padding: '0 3px', background: '#333', border: '1px solid #555', borderRadius: '50%', color: '#888', cursor: 'pointer', lineHeight: '14px' }}
              >✕</button>
            )}
          </div>
        ))}
        <button
          onClick={handleAdd}
          style={{ padding: '3px 8px', fontSize: 11, borderRadius: 4, border: '1px dashed #555', background: 'transparent', color: '#888', cursor: 'pointer' }}
        >+</button>
      </div>

      {/* Editor table */}
      {activeColorway && (
        <>
          <div className="panel-section-title" style={{ marginTop: 12 }}>OVERRIDES — {activeColorway.name}</div>
          {usedCodes.map(code => {
            const override = activeColorway.overrides[code];
            const currentColor = (override as { color?: string })?.color || '';
            return (
              <div key={code} className="panel-field" style={{ gap: 6 }}>
                <label style={{ minWidth: 70, fontSize: 11 }}>{code}</label>
                <input
                  type="color"
                  value={currentColor || '#ffffff'}
                  onChange={e => handleOverrideColor(code, e.target.value)}
                  style={{ width: 28, height: 22, padding: 0, border: '1px solid #555', borderRadius: 3, cursor: 'pointer' }}
                />
                {currentColor && (
                  <button
                    onClick={() => dispatch(updateColorway({ id: activeColorway.id, overrides: { [code]: null } }))}
                    style={{ fontSize: 9, padding: '1px 4px', background: '#333', border: '1px solid #555', borderRadius: 3, color: '#888', cursor: 'pointer' }}
                  >Clear</button>
                )}
              </div>
            );
          })}
          {usedCodes.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 11, opacity: 0.5 }}>No pieces with fabric codes yet</div>
          )}
        </>
      )}

      {colorways.length === 0 && (
        <div style={{ padding: '12px', fontSize: 11, opacity: 0.5 }}>
          No colorways yet. Click + to create one.
        </div>
      )}
    </div>
  );
}
