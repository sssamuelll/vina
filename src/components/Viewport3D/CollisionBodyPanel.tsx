import { useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  addCollisionBody,
  removeCollisionBody,
  updateCollisionBodyCollision,
  setCollisionBodyName,
  setCollisionBodyVisibility,
  selectCollisionBody,
} from '../../store/collisionBodySlice';
import type { CollisionBody } from '../../types/collisionBody';
import { newId } from '../../utils/ids';
import { detectFormat } from '../../utils/import/meshImporter';
import './CollisionBodyPanel.css';

interface CollisionBodyPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function CollisionBodyPanel({ open, onClose }: CollisionBodyPanelProps) {
  const dispatch = useDispatch<AppDispatch>();
  const bodies = useSelector((s: RootState) => s.collisionBody.bodies);
  const selectedBodyId = useSelector((s: RootState) => s.collisionBody.selectedBodyId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileImport = useCallback((file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    const supported = ['obj', 'fbx', 'glb', 'gltf'];
    if (!supported.includes(ext)) return;

    const url = URL.createObjectURL(file);
    const format = detectFormat(file.name);
    if (format === 'unknown' || format === 'vrm') return;

    const body: CollisionBody = {
      id: newId(),
      name: file.name.replace(/\.[^.]+$/, ''),
      meshUrl: url,
      format: format as 'obj' | 'fbx' | 'glb' | 'gltf',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      collision: { enabled: true, friction: 0.3, offset: 0.005 },
      animation: { clipIndex: null, playing: false, time: 0, loop: true },
      visible: true,
    };
    dispatch(addCollisionBody(body));
    dispatch(selectCollisionBody(body.id));
  }, [dispatch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileImport(file);
  }, [handleFileImport]);

  if (!open) return null;

  return (
    <div className="cb-panel-wrapper">
      <div className="cb-panel">
        <div className="cb-panel-header">
          <h3>Collision Bodies</h3>
          <button className="cb-panel-close" onClick={onClose}>&times;</button>
        </div>
        <div className="cb-panel-scroll">
          <input
            ref={fileInputRef}
            type="file"
            accept=".obj,.fbx,.glb,.gltf"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFileImport(file);
              e.target.value = '';
            }}
          />
          <button
            className="cb-import-btn"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            + Import Collision Body (.obj .fbx .glb .gltf)
          </button>

          {bodies.map(body => (
            <BodyItem
              key={body.id}
              body={body}
              isSelected={selectedBodyId === body.id}
              dispatch={dispatch}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BodyItem({
  body,
  isSelected,
  dispatch,
}: {
  body: CollisionBody;
  isSelected: boolean;
  dispatch: AppDispatch;
}) {
  return (
    <div
      className={`cb-body-item ${isSelected ? 'selected' : ''}`}
      onClick={() => dispatch(selectCollisionBody(body.id))}
    >
      <div className="cb-body-header">
        <input
          className="cb-body-name"
          value={body.name}
          onChange={e => dispatch(setCollisionBodyName({ id: body.id, name: e.target.value }))}
          onClick={e => e.stopPropagation()}
        />
        <div className="cb-body-actions">
          <button
            className={`cb-icon-btn ${body.visible ? 'active' : ''}`}
            title={body.visible ? 'Hide' : 'Show'}
            onClick={e => { e.stopPropagation(); dispatch(setCollisionBodyVisibility({ id: body.id, visible: !body.visible })); }}
          >
            {body.visible ? '\u25C9' : '\u25CB'}
          </button>
          <button
            className={`cb-icon-btn ${body.collision.enabled ? 'active' : ''}`}
            title={body.collision.enabled ? 'Disable collision' : 'Enable collision'}
            onClick={e => { e.stopPropagation(); dispatch(updateCollisionBodyCollision({ id: body.id, collision: { enabled: !body.collision.enabled } })); }}
          >
            {body.collision.enabled ? '\u26A1' : '\u26AA'}
          </button>
          <button
            className="cb-icon-btn danger"
            title="Delete"
            onClick={e => { e.stopPropagation(); dispatch(removeCollisionBody(body.id)); }}
          >
            &times;
          </button>
        </div>
      </div>

      {isSelected && (
        <>
          <div className="cb-slider-row">
            <span className="cb-slider-label">Friction</span>
            <input
              type="range"
              min={0} max={1} step={0.05}
              value={body.collision.friction}
              onChange={e => dispatch(updateCollisionBodyCollision({ id: body.id, collision: { friction: Number(e.target.value) } }))}
            />
            <span className="cb-slider-value">{body.collision.friction.toFixed(2)}</span>
          </div>
          <div className="cb-slider-row">
            <span className="cb-slider-label">Offset</span>
            <input
              type="range"
              min={0.001} max={0.05} step={0.001}
              value={body.collision.offset}
              onChange={e => dispatch(updateCollisionBodyCollision({ id: body.id, collision: { offset: Number(e.target.value) } }))}
            />
            <span className="cb-slider-value">{(body.collision.offset * 1000).toFixed(1)}mm</span>
          </div>
        </>
      )}
    </div>
  );
}
