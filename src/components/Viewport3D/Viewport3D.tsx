import { Component, Suspense, type ReactNode, useRef, useEffect, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import PieceMesh from './PieceMesh';
import Mannequin from './Mannequin';
import AvatarModel from './AvatarModel';
import GarmentSimulation from './GarmentSimulation';
import JointGizmos from './JointGizmos';
import { usePoseDrag } from './usePoseDrag';
import AvatarPanel from './AvatarPanel';
import { placeGarmentPieces } from '../../utils/cloth/garmentPlacement';
import './Viewport3D.css';

/** Error boundary so a WebGL crash doesn't take down the 2D editor */
class Viewport3DErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: string }> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="viewport3d viewport3d-error">
          <div style={{ padding: '2rem', textAlign: 'center', color: '#888', fontSize: '0.85rem' }}>
            <p style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>⚠️ 3D Preview Unavailable</p>
            <p>WebGL could not initialize. The 2D editor still works normally.</p>
            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.6 }}>{this.state.error}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const PIECE_COLORS = ['#e8e4df', '#d4cfc8', '#c8c0b5', '#f0ece6', '#e0d8cc'];

export { Viewport3DErrorBoundary };

export default function Viewport3D() {
  const { pieces, seams, avatarMode, avatarModelUrl, avatar } = useSelector((s: RootState) => s.project);
  const { selectedPieceIds } = useSelector((s: RootState) => s.editor);
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const poseEditorOpen = useSelector((s: RootState) => s.avatar.poseEditorOpen);
  const useClothSim = simulationState !== 'idle';

  // Avatar panel
  const [avatarPanelOpen, setAvatarPanelOpen] = useState(false);

  // Camera vs Edit mode
  const [cameraMode, setCameraMode] = useState(true);
  const orbitRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  // When pose editor opens, auto-switch to edit mode and open avatar panel
  useEffect(() => {
    if (poseEditorOpen) {
      setCameraMode(false);
      setAvatarPanelOpen(true);
    }
  }, [poseEditorOpen]);

  // Sync OrbitControls with cameraMode
  // In edit mode: only middle-click orbits (left-click free for tools)
  // In camera mode: normal orbit behavior
  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    if (cameraMode) {
      controls.enabled = true;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    } else {
      controls.enabled = true; // keep enabled for middle-click
      controls.mouseButtons = {
        LEFT: -1 as unknown as THREE.MOUSE, // disable left-click orbit
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN,
      };
    }
  }, [cameraMode]);

  const setOrbitEnabled = useCallback((enabled: boolean) => {
    if (orbitRef.current) {
      orbitRef.current.enabled = enabled;
    }
  }, []);

  const poseDrag = usePoseDrag(setOrbitEnabled);

  const toggleCameraMode = () => {
    const next = !cameraMode;
    setCameraMode(next);
  };

  // Force Canvas to resize continuously during CSS transitions (VS Code-style view resizing)
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="viewport3d" ref={containerRef}>
      <Canvas
        camera={{ position: [0, 0.8, 2.8], fov: 35 }}
        shadows
        resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
        style={{ width: containerSize.width || '100%', height: containerSize.height || '100%' }}
        gl={{ antialias: true }}
        onCreated={({ scene }) => { scene.background = new THREE.Color('#f0f0f0'); }}
      >
        {/* Soft studio lighting — CLO3D style, even and comfortable */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 5, 4]} intensity={0.7} castShadow shadow-mapSize={1024} />
        <directionalLight position={[-3, 4, -2]} intensity={0.4} />
        <directionalLight position={[0, 2, 5]} intensity={0.3} />
        <hemisphereLight args={['#ffffff', '#b0c4de', 0.3]} />

        {/* Avatar: dress form or loaded 3D model */}
        {avatarMode === 'dressform' && <Mannequin />}
        {avatarMode === 'model' && avatarModelUrl && (
          <Suspense fallback={null}>
            <AvatarModel url={avatarModelUrl} height={avatar.measurements.height / 100} />
          </Suspense>
        )}

        {/* Joint gizmos for interactive pose editing */}
        <JointGizmos poseDrag={poseDrag} setOrbitEnabled={setOrbitEnabled} />

        {/* Pattern pieces: cloth sim when running, static otherwise */}
        {useClothSim ? (
          <GarmentSimulation pieces={pieces} seams={seams} />
        ) : (
          (() => {
            const placements = placeGarmentPieces(pieces, avatar.measurements);
            return pieces.map((piece, i) => (
              <PieceMesh
                key={piece.id}
                piece={piece}
                isSelected={selectedPieceIds.includes(piece.id)}
                color={PIECE_COLORS[i % PIECE_COLORS.length]}
                position={placements[i].position}
              />
            ));
          })()
        )}

        {/* Floor shadow */}
        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.4}
          scale={3}
          blur={2}
          far={2}
        />

        {/* White floor plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>

        <Grid
          args={[10, 10]}
          cellSize={0.1}
          cellThickness={0.5}
          cellColor="#d0d0d0"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#b0b0b0"
          fadeDistance={8}
          position={[0, -0.001, 0]}
        />

        <OrbitControls
          ref={orbitRef}
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={0.6}
          maxDistance={5}
          target={[0, 0.75, 0]}
        />
      </Canvas>

      {/* Avatar panel toggle */}
      <button
        className={`viewport3d-avatar-toggle ${avatarPanelOpen ? 'active' : ''}`}
        onClick={() => setAvatarPanelOpen(p => !p)}
        title="Avatar & Pose Panel"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}>
          <circle cx="10" cy="6" r="3" />
          <path d="M4 18C4 14.69 6.69 12 10 12C13.31 12 16 14.69 16 18" />
        </svg>
        Avatar
      </button>

      {/* Avatar & Pose panel */}
      <AvatarPanel open={avatarPanelOpen} onClose={() => setAvatarPanelOpen(false)} />

      {/* Camera/Edit mode toggle — top right of 3D viewport */}
      <button
        className={`viewport3d-mode-toggle ${cameraMode ? 'camera' : 'edit'}`}
        onClick={toggleCameraMode}
        title={cameraMode ? 'Switch to Edit Mode (unlock mouse for tools)' : 'Switch to Camera Mode (orbit/pan/zoom)'}
      >
        {cameraMode ? '📷 Camera' : '✏️ Edit'}
      </button>

      {/* Status */}
      <div className={`sim-status ${simulationState === 'running' ? 'running' : ''}`}>
        {simulationState === 'running' ? '● SIMULATING' : simulationState === 'paused' ? '⏸ PAUSED' : `○ ${pieces.length} piece${pieces.length !== 1 ? 's' : ''}`}
      </div>
      {!cameraMode && (
        <div className="sim-status" style={{ left: 12, right: 'auto', color: '#4488ff', opacity: 0.9 }}>
          ✏️ EDIT MODE — middle-click to orbit
        </div>
      )}
    </div>
  );
}
