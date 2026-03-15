import { Component, Suspense, type ReactNode, useRef, useEffect, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import type { AnyRenderer } from '../../types/renderer';
import { isWebGPURendererActive } from '../../utils/cloth/gpu/webgpuDetect';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import DraggablePiece from './DraggablePiece';
import Mannequin from './Mannequin';
import AvatarModel from './AvatarModel';
import GarmentSimulation from './GarmentSimulation';
import type { GarmentSimulationHandle } from './GarmentSimulation';
import { SimulationErrorBoundary } from './SimulationErrorBoundary';
import { SimulationStatusOverlay } from './SimulationStatusOverlay';
import JointGizmos from './JointGizmos';
import IKEndEffectorGizmos from './IKEndEffectorGizmos';
import FitMapToggle from './FitMapToggle';
import { usePoseDrag } from './usePoseDrag';
import { placeGarmentPieces } from '../../utils/cloth/garmentPlacement';
import { renderTurntable, downloadBlob } from '../../utils/export/turntableRenderer';
import { exportStill, exportAllViews } from '../../utils/export/stillExporter';
import { collectExportScene } from '../../utils/export/sceneCollector';
import { downloadGLTF } from '../../utils/export/gltfExporter';
import { downloadUSDZ } from '../../utils/export/usdzExporter';
import type { Tool3D } from '../Toolbar3D/Toolbar3D';
import ContextMenu3D, { type ContextMenu3DState } from './ContextMenu3D';
import SimModeToggle from './SimModeToggle';
import SnapshotBar from './SnapshotBar';
import AnchorPoints from './AnchorPoints';
import AvatarTapes from './AvatarTapes';
import CollisionBodyMesh from './CollisionBodyMesh';
import CollisionBodyPanel from './CollisionBodyPanel';
import { WindGizmo } from './WindGizmo';
import RenderSettingsPanel from './RenderSettingsPanel';
import EnvironmentSetup from './EnvironmentSetup';
import CustomLights from './CustomLights';
import { useAvatarTape } from './useAvatarTape';
import { useCameraPresets } from './useCameraPresets';
import { useAnimationPlayback } from '../../hooks/useAnimationPlayback';
import type { ViewPreset } from '../../store/cameraSlice';
import { selectPiece, clearSelection } from '../../store/editorSlice';
import { toggleIK } from '../../store/avatarSlice';
import { setActiveTool3D } from '../../store/toolSlice';
import { resetSimulation, setViewMode3D, clearArrangementSnapshot, clearAllPins } from '../../store/simulationSlice';

import { FABRIC_LIBRARY } from '../../utils/cloth/fabricLibrary';
import { setArrangement3D } from '../../store/projectSlice';
import { useDispatch } from 'react-redux';
import { toolRegistry } from '../../tools';
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

/**
 * Create a WebGPURenderer (with WebGL2 fallback when WebGPU is unavailable).
 *
 * R3F 8.x's `gl` factory must return synchronously, so we fire-and-forget
 * `renderer.init()`.  Three.js buffers draw commands internally until the
 * async initialisation resolves, so the first few frames are a no-op while
 * the GPU backend spins up.
 */
/** Whether to use the native WebGPU backend (vs WebGL2 fallback). */
const isWebGPUBackend = isWebGPURendererActive;
/**
 * WebGPURenderer is always used (with forceWebGL when WebGPU is off).
 * Its NodeMaterial system rejects legacy materials (MeshDepthMaterial,
 * ShaderMaterial, ShadowMaterial), so shadow features must stay disabled.
 */
const nodeMaterialActive = true;

function createWebGPURenderer(canvas: HTMLCanvasElement): WebGPURenderer {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: true,
    // Falls back to WebGL2 when WebGPU is unavailable or feature-flagged off
    forceWebGL: !isWebGPUBackend,
  });

  // Fire-and-forget — Three.js queues commands until the backend is ready
  renderer.init().catch((err) => {
    console.warn('[Viewport3D] WebGPURenderer.init() failed, frames may not render:', err);
  });

  return renderer;
}

export { Viewport3DErrorBoundary };

/** Drives keyframe animation playback inside the R3F Canvas context. */
function AnimationDriver() {
  useAnimationPlayback();
  return null;
}

interface Viewport3DProps {
  activeTool3D?: Tool3D;
}

export default function Viewport3D({ activeTool3D = 'camera' }: Viewport3DProps) {
  const dispatch = useDispatch();
  const { pieces, seams, avatarMode, avatarModelUrl, avatar, arrangementOverrides } = useSelector((s: RootState) => s.project);
  const { selectedPieceIds } = useSelector((s: RootState) => s.editor);
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const pieceFabrics = useSelector((s: RootState) => s.simulation.pieceFabrics);
  const defaultFabricId = useSelector((s: RootState) => s.simulation.defaultFabricId);
  const viewMode3D = useSelector((s: RootState) => s.simulation.viewMode3D);
  const showGarment = useSelector((s: RootState) => s.simulation.showGarment);
  const collisionBodies = useSelector((s: RootState) => s.collisionBody.bodies);
  const { groundVisible, shadowOpacity, shadowBlur } = useSelector((s: RootState) => s.renderSettings);
  const playbackState = useSelector((s: RootState) => s.animation.playbackState);
  const useClothSim = simulationState !== 'idle';
  const isArrangeMode = viewMode3D === 'arrange';
  const { handleAvatarClick, isTapeTool } = useAvatarTape(activeTool3D);

  const simRef = useRef<GarmentSimulationHandle>(null);
  const cameraMode = activeTool3D === 'camera';
  const orbitRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const cameraPresets = useCameraPresets(orbitRef);

  // Get cursor from active tool definition
  const toolCursor = toolRegistry.getTool(activeTool3D)?.cursor || 'default';

  // Force-apply mouse mapping every frame via onChange, because OrbitControls
  // from drei can reinitialise its internal mouseButtons after mount.
  const patchMouseButtons = useCallback(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    const mb = controls.mouseButtons;
    if (mb.LEFT !== (-1 as unknown as THREE.MOUSE) ||
        mb.MIDDLE !== THREE.MOUSE.PAN ||
        mb.RIGHT !== THREE.MOUSE.ROTATE) {
      controls.mouseButtons = {
        LEFT: -1 as unknown as THREE.MOUSE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    }
  }, []);

  // Disable OrbitControls during animation playback
  useEffect(() => {
    if (orbitRef.current) {
      orbitRef.current.enabled = playbackState !== 'playing';
    }
  }, [playbackState]);

  const setOrbitEnabled = useCallback((enabled: boolean) => {
    if (orbitRef.current) {
      orbitRef.current.enabled = enabled;
    }
  }, []);

  const poseDrag = usePoseDrag(setOrbitEnabled);

  // Force Canvas to resize continuously during CSS transitions
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [fitMapStats, setFitMapStats] = useState<import('../../utils/cloth/fitMaps').FitMapStats | null>(null);
  const [inspectedValue, setInspectedValue] = useState<number | null>(null);
  const [avatarHidden, setAvatarHidden] = useState(false);
  const [collisionPanelOpen, setCollisionPanelOpen] = useState(false);
  const [renderPanelOpen, setRenderPanelOpen] = useState(false);

  // Expose fitMapStats to window for Playwright E2E testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__OPENCLO_FIT_MAP_STATS__ = fitMapStats;
    }
    return () => {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).__OPENCLO_FIT_MAP_STATS__;
      }
    };
  }, [fitMapStats]);

  const poseEditorOpen = useSelector((s: RootState) => s.avatar.poseEditorOpen);
  const [ctxMenu, setCtxMenu] = useState<ContextMenu3DState>({
    visible: false, x: 0, y: 0, target: 'background',
  });
  const rightDownRef = useRef<{ x: number; y: number } | null>(null);

  // Right-click context menu: distinguish drag (orbit) from click (menu)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 2) {
      rightDownRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const down = rightDownRef.current;
    rightDownRef.current = null;
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    // If dragged more than 5px, it was an orbit gesture — don't show menu
    if (Math.sqrt(dx * dx + dy * dy) > 5) return;

    setCtxMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      target: 'background',
    });
  }, []);

  const handleResetCamera = useCallback(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    controls.reset();
  }, []);

  const snapshot3D = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const store = container as unknown as Record<string, unknown>;
    const renderer = store.__gl as AnyRenderer | undefined;
    const scene = store.__scene as THREE.Scene | undefined;
    const camera = store.__camera as THREE.Camera | undefined;
    if (!renderer || !scene || !camera) return;

    // Force a render so the canvas content is current, then capture.
    // canvas.toDataURL() works for both WebGL and WebGPU canvases,
    // unlike readPixels which is WebGL-only.
    renderer.render(scene, camera);
    const canvas = renderer.domElement;

    const link = document.createElement('a');
    link.download = `openclo-fitmap-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  const handleExportStill = useCallback(async (width: number, height: number, transparent: boolean) => {
    const container = containerRef.current;
    if (!container) return;
    const refs = container as unknown as Record<string, unknown>;
    const gl = refs.__gl as AnyRenderer | undefined;
    const sc = refs.__scene as THREE.Scene | undefined;
    const cam = refs.__camera as THREE.PerspectiveCamera | undefined;
    if (!gl || !sc || !cam) return;
    await exportStill(gl, sc, cam, { width, height, transparent });
  }, []);

  const handleExportTurntable = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    const refs = container as unknown as Record<string, unknown>;
    const gl = refs.__gl as AnyRenderer | undefined;
    const sc = refs.__scene as THREE.Scene | undefined;
    const cam = refs.__camera as THREE.PerspectiveCamera | undefined;
    if (!gl || !sc || !cam) return;
    // Read config from Redux store directly
    const store = (window as unknown as Record<string, unknown>).__OPENCLO_STORE__ as { getState: () => { renderSettings: { turntableFrameCount: number; turntableDirection: 'cw' | 'ccw' } } } | undefined;
    const config = store?.getState().renderSettings;
    const blob = await renderTurntable(gl, sc, cam, {
      frameCount: config?.turntableFrameCount ?? 36,
      direction: config?.turntableDirection ?? 'cw',
    });
    downloadBlob(blob, `openclo-turntable-${Date.now()}.webm`);
  }, []);

  const handleExportAllViews = useCallback(async (width: number, height: number, transparent: boolean) => {
    const container = containerRef.current;
    if (!container) return;
    const refs = container as unknown as Record<string, unknown>;
    const gl = refs.__gl as AnyRenderer | undefined;
    const sc = refs.__scene as THREE.Scene | undefined;
    const cam = refs.__camera as THREE.PerspectiveCamera | undefined;
    if (!gl || !sc || !cam) return;
    await exportAllViews(gl, sc, cam, { width, height, transparent });
  }, []);

  const handleExport3D = useCallback(async (
    format: '3d-glb' | '3d-gltf' | '3d-usdz',
    includeAvatar: boolean,
    scale: number,
  ) => {
    const container = containerRef.current;
    if (!container) return;
    const refs = container as unknown as Record<string, unknown>;
    const sc = refs.__scene as THREE.Scene | undefined;
    if (!sc) return;

    // Get garment mesh from window global (set by GarmentSimulation when simulation is active)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const garmentMesh = (window as any).__OPENCLO_CLOTH_MESH__ as THREE.Mesh | undefined;

    if (!garmentMesh && !includeAvatar) {
      console.warn('[3D Export] Nothing to export: simulation is not running and avatar is excluded.');
      return;
    }
    if (!garmentMesh) {
      console.warn('[3D Export] Garment mesh not available (simulation may not be running). Exporting avatar only.');
    }

    const group = collectExportScene(sc, {
      garmentMesh: garmentMesh || null,
      includeAvatar,
      scale,
    });

    const timestamp = Date.now();
    try {
      if (format === '3d-usdz') {
        await downloadUSDZ(group, { filename: `openclo-${timestamp}` });
      } else {
        const binary = format === '3d-glb';
        await downloadGLTF(group, {
          binary,
          scale: 1, // scale already applied by collector
          filename: `openclo-${timestamp}`,
        });
      }
    } catch (err) {
      console.error('[3D Export] Failed:', err);
    }
  }, []);

  // Shift+A — Toggle avatar visibility (CLO3D: Show Avatar)
  // F10 — Snapshot 3D viewport (CLO3D: File > Snapshot > 3D Window)
  // W — Toggle Pin Tool (#134)
  // Ctrl+W — Clear all pins (#134)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        setAvatarHidden(h => !h);
      }
      if (e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        // Shift+F toggles arrangement tool on/off
        dispatch(setActiveTool3D(activeTool3D === 'arrangement' ? 'camera' : 'arrangement'));
      }
      if (e.key === 'F10') {
        e.preventDefault();
        snapshot3D();
      }
      // W — Toggle Pin Tool (without modifiers)
      if ((e.key === 'W' || e.key === 'w') && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        dispatch(setActiveTool3D(activeTool3D === 'pin' ? 'camera' : 'pin'));
      }
      // Ctrl+W — Clear all pins
      if ((e.key === 'W' || e.key === 'w') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        dispatch(clearAllPins());
        console.log('[Pin Tool] Cleared all pins');
      }

      // ─── Numpad Camera Presets (CLO3D-standard) ───
      if (e.code === 'Numpad2') { e.preventDefault(); cameraPresets.setCameraView('front'); }
      if (e.code === 'Numpad8') { e.preventDefault(); cameraPresets.setCameraView('back'); }
      if (e.code === 'Numpad4') { e.preventDefault(); cameraPresets.setCameraView('right'); }
      if (e.code === 'Numpad6') { e.preventDefault(); cameraPresets.setCameraView('left'); }
      if (e.code === 'Numpad5') { e.preventDefault(); cameraPresets.setCameraView('top'); }
      if (e.code === 'Numpad0') { e.preventDefault(); cameraPresets.setCameraView('bottom'); }
      if (e.code === 'Numpad1') { e.preventDefault(); cameraPresets.setCameraView('threeQuarterRight'); }
      if (e.code === 'Numpad3') { e.preventDefault(); cameraPresets.setCameraView('threeQuarterLeft'); }

      // I — Toggle IK mode (when pose editor is open)
      if ((e.key === 'I' || e.key === 'i') && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        if (poseEditorOpen) {
          e.preventDefault();
          dispatch(toggleIK());
        }
      }

      // ─── Focus (F) — zoom to selected piece (CLO3D-standard) ───
      if ((e.key === 'F' || e.key === 'f') && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (selectedPieceIds.length > 0) {
          cameraPresets.focusOnSelection(selectedPieceIds[0]);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTool3D, dispatch, cameraPresets, selectedPieceIds, snapshot3D, poseEditorOpen]);

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
    <div
      className="viewport3d"
      ref={containerRef}
      style={{ position: 'relative', cursor: toolCursor }}
      onPointerDown={handlePointerDown}
      onContextMenu={handleContextMenu}
    >
      <SimModeToggle />
      <SimulationStatusOverlay />
      <Canvas
        camera={{ position: [0, 0.8, 2.8], fov: 35 }}
        shadows={!nodeMaterialActive}
        resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
        style={{ width: containerSize.width || '100%', height: containerSize.height || '100%' }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        gl={createWebGPURenderer as any}
        onPointerMissed={() => dispatch(clearSelection())}
        onCreated={({ gl, scene, camera }) => {
          // Store refs for snapshot (readPixels needs a fresh render)
          (containerRef.current as unknown as Record<string, unknown>).__gl = gl;
          (containerRef.current as unknown as Record<string, unknown>).__scene = scene;
          (containerRef.current as unknown as Record<string, unknown>).__camera = camera;
        }}
      >
        <EnvironmentSetup />
        <CustomLights />
        <AnimationDriver />

        {!avatarHidden && avatarMode === 'dressform' && <Mannequin />}
        {!avatarHidden && avatarMode === 'model' && avatarModelUrl && (
          <Suspense fallback={null}>
            <AvatarModel
            url={avatarModelUrl}
            height={avatar.measurements.height / 100}
            onPointerDown={isTapeTool ? handleAvatarClick : undefined}
          />
          </Suspense>
        )}

        {/* JointGizmos: always mounted when avatar present; internally checks poseEditorOpen */}
        <JointGizmos poseDrag={poseDrag} setOrbitEnabled={setOrbitEnabled} />
        <IKEndEffectorGizmos setOrbitEnabled={setOrbitEnabled} />
        <AvatarTapes />
        {/* AnchorPoints: only when 'arrangement' tool is active — mutually exclusive with pose */}
        <AnchorPoints measurements={avatar.measurements} visible={activeTool3D === 'arrangement' && !poseEditorOpen} />

        {/* Collision Bodies */}
        {collisionBodies.map(body => (
          <CollisionBodyMesh key={body.id} body={body} orbitRef={orbitRef} />
        ))}

        {/* Wind direction indicator */}
        <WindGizmo />

        {showGarment && (useClothSim ? (
          <SimulationErrorBoundary>
            <GarmentSimulation ref={simRef} pieces={pieces} seams={seams} onFitMapStats={setFitMapStats} onInspect={setInspectedValue} />
          </SimulationErrorBoundary>
        ) : (
          (() => {
            const placements = placeGarmentPieces(pieces, avatar.measurements);
            return pieces.map((piece, i) => {
              const fabricId = pieceFabrics[piece.id] || defaultFabricId;
              const fabric = FABRIC_LIBRARY[fabricId];
              return (
              <DraggablePiece
                key={piece.id}
                piece={piece}
                isSelected={selectedPieceIds.includes(piece.id)}
                color={PIECE_COLORS[i % PIECE_COLORS.length]}
                position={placements[i].position}
                rotation={placements[i].rotation}
                arrangementOverride={arrangementOverrides[piece.id]}
                canDrag={isArrangeMode}
                onSelect={(id) => dispatch(selectPiece(id))}
                onDragEnd={(id, pos) => dispatch(setArrangement3D({ pieceId: id, position: pos }))}
                setOrbitEnabled={setOrbitEnabled}
                fabricColor={fabric?.color}
                fabricRoughness={fabric?.roughness}
              />
            ); });
          })()
        ))}

        {/* ContactShadows uses a custom ShaderMaterial incompatible with NodeMaterial */}
        {!nodeMaterialActive && (
          <ContactShadows position={[0, 0, 0]} opacity={shadowOpacity} scale={3} blur={shadowBlur} far={2} />
        )}

        {groundVisible && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow={!nodeMaterialActive}>
            <planeGeometry args={[20, 20]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        )}

        {/* drei Grid uses a custom ShaderMaterial incompatible with NodeMaterial */}
        {!nodeMaterialActive && (
          <Grid
            args={[10, 10]}
            cellSize={0.1} cellThickness={0.5} cellColor="#d0d0d0"
            sectionSize={1} sectionThickness={1} sectionColor="#b0b0b0"
            fadeDistance={8} position={[0, -0.001, 0]}
          />
        )}

        <OrbitControls
          ref={orbitRef}
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={0.6}
          maxDistance={5}
          target={[0, 0.75, 0]}
          mouseButtons={{ LEFT: -1 as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }}
          onChange={patchMouseButtons}
        />
      </Canvas>

      {/* Fit Map Toggle Bar */}
      <FitMapToggle
        stats={fitMapStats}
        inspectedValue={inspectedValue}
        avatarHidden={avatarHidden}
        onToggleAvatar={() => setAvatarHidden(h => !h)}
        onSnapshot={snapshot3D}
      />

      {/* Snapshot A/B comparison bar */}
      <SnapshotBar
        onSaveSnapshot={(id) => simRef.current?.saveSnapshot(id)}
        onRestoreSnapshot={(id) => simRef.current?.restoreSnapshot(id)}
        onDeleteSnapshot={(id) => simRef.current?.deleteSnapshot(id)}
      />

      {/* Render Settings toggle + panel */}
      <button
        style={{
          position: 'absolute',
          top: 8,
          right: renderPanelOpen ? 290 : (collisionPanelOpen ? 334 : 52),
          zIndex: 25,
          background: renderPanelOpen ? 'rgba(74, 158, 255, 0.2)' : 'rgba(30, 30, 30, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 6,
          color: renderPanelOpen ? '#4a9eff' : '#ccc',
          padding: '6px 10px',
          cursor: 'pointer',
          fontSize: 12,
          fontFamily: 'Inter, sans-serif',
        }}
        title="Render Settings"
        onClick={() => setRenderPanelOpen(!renderPanelOpen)}
      >
        Render
      </button>
      <RenderSettingsPanel
        open={renderPanelOpen}
        onClose={() => setRenderPanelOpen(false)}
        onExportStill={handleExportStill}
        onExportTurntable={handleExportTurntable}
        onExportAllViews={handleExportAllViews}
        onExport3D={handleExport3D}
      />

      {/* Collision Body toggle + panel */}
      <button
        style={{
          position: 'absolute',
          top: 8,
          right: collisionPanelOpen ? 290 : 8,
          zIndex: 25,
          background: collisionPanelOpen ? 'rgba(74, 158, 255, 0.2)' : 'rgba(30, 30, 30, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 6,
          color: collisionPanelOpen ? '#4a9eff' : '#ccc',
          padding: '6px 10px',
          cursor: 'pointer',
          fontSize: 12,
          fontFamily: 'Inter, sans-serif',
        }}
        title="Collision Bodies"
        onClick={() => setCollisionPanelOpen(!collisionPanelOpen)}
      >
        CB
      </button>
      <CollisionBodyPanel
        open={collisionPanelOpen}
        onClose={() => setCollisionPanelOpen(false)}
      />

      {/* Status indicators */}
      <div className={`sim-status ${simulationState === 'running' ? 'running' : ''}`}>
        {simulationState === 'running' ? '● SIMULATING' : simulationState === 'paused' ? '⏸ PAUSED' : `○ ${pieces.length} piece${pieces.length !== 1 ? 's' : ''}`}
      </div>
      {!cameraMode && (
        <div className="sim-status" style={{ left: 12, right: 'auto', color: '#4488ff', opacity: 0.9, pointerEvents: 'none' }}>
          {poseEditorOpen ? '● POSE MODE' : activeTool3D === 'arrangement' ? '⊕ ARRANGE MODE' : '✏️ EDIT MODE'} — middle-click to orbit
        </div>
      )}

      <ContextMenu3D
        menu={ctxMenu}
        onClose={() => setCtxMenu(m => ({ ...m, visible: false }))}
        onResetCamera={handleResetCamera}
        onToggleAvatar={() => setAvatarHidden(h => !h)}
        onSnapshot={snapshot3D}
        onSelectPiece={(id) => dispatch(selectPiece(id))}
        onResetArrangement={() => {
          dispatch(resetSimulation());
          dispatch(setViewMode3D('arrange'));
          dispatch(clearArrangementSnapshot());
        }}
        onZoomToFit={() => handleResetCamera()}
        onCameraPreset={(preset) => cameraPresets.setCameraView(preset as ViewPreset)}
      />
    </div>
  );
}
