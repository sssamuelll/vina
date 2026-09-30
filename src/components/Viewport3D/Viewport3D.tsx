import { Component, Suspense, type ReactNode, useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import FloorGrid from './FloorGrid';
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import type { AnyRenderer } from '../../types/renderer';
import { isWebGPURendererActive } from '../../utils/cloth/gpu/webgpuDetect';
import { cmToM } from '../../utils/geometry';
import { pushJournal } from '../../utils/telemetry/journal';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import DraggablePiece from './DraggablePiece';
import Mannequin from './Mannequin';
import AvatarModel from './AvatarModel';
import GarmentSimulation from './GarmentSimulation';
import type { GarmentSimulationHandle } from './GarmentSimulation';
import { markRendererDeviceLost } from './rendererDeviceLost';
import { SimulationErrorBoundary } from './SimulationErrorBoundary';
import { SimulationStatusOverlay } from './SimulationStatusOverlay';
import JointGizmos from './JointGizmos';
import IKEndEffectorGizmos from './IKEndEffectorGizmos';
import FitMapToggle from './FitMapToggle';
import SurfaceModePill from './SurfaceModePill';
import { usePoseDrag } from './usePoseDrag';
import { isPanGesture, isPanRelease, cameraViewFromKeyEvent, isDoublePanClick, type PanClick } from './inputBindings';
import { wheelIntent, zoomFactor, type InputSchemeId } from '../../input/wheelIntents';
import { orbitAroundTarget, dollyTowardTarget, panViewpoint, recenterTarget } from '../../input/orbitMath';
import { resolveArrangement } from '../../utils/cloth/arrangement/arrangementBinding';
import { buildAxisHints } from '../../utils/cloth/arrangement/buildAxisHints';
import { renderTurntable, downloadBlob } from '../../utils/export/turntableRenderer';
import { exportStill, exportAllViews } from '../../utils/export/stillExporter';
import { collectExportScene } from '../../utils/export/sceneCollector';
import { downloadGLTF } from '../../utils/export/gltfExporter';
import { downloadUSDZ } from '../../utils/export/usdzExporter';
import type { Tool3D } from '../../types/types';
import ContextMenu3D, { type ContextMenu3DState } from './ContextMenu3D';
import PanCrosshair from './PanCrosshair';
import SnapshotBar from './SnapshotBar';
import AnchorPoints from './AnchorPoints';
import { medidasDelCuerpo } from '../../avatares/catalogo';
import AvatarTapes from './AvatarTapes';
import CollisionBodyMesh from './CollisionBodyMesh';
import CollisionBodyPanel from './CollisionBodyPanel';
import Sew3DTool from './Sew3DTool';
import SeamRenderer3D from './SeamRenderer3D';
import { WindGizmo } from './WindGizmo';
import RenderSettingsPanel from './RenderSettingsPanel';
import EnvironmentSetup from './EnvironmentSetup';
import CustomLights from './CustomLights';
import { useAvatarTape } from './useAvatarTape';
import { useCameraPresets, DEFAULT_TARGET, DEFAULT_POSITION } from './useCameraPresets';
import { useAnimationPlayback } from '../../hooks/useAnimationPlayback';
import { useColorwaySync } from '../../hooks/useColorwaySync';
import type { ViewPreset } from '../../store/cameraSlice';
import { selectPiece, clearSelection, togglePieceSelection, enterSuperimposePickMode } from '../../store/editorSlice';
import { toggleIK, resetPose } from '../../store/avatarSlice';
import { setActiveTool3D } from '../../store/toolSlice';
import { resetSimulation, setViewMode3D, clearArrangementSnapshot, clearAllPins, toggleHide3D, showAll3D, toggleFlipNormal, clearFlippedNormals, setSelectedVertices, setRenderSettingsOpen } from '../../store/simulationSlice';

import { FABRIC_LIBRARY } from '../../utils/cloth/fabricLibrary';
import { resolveColorway } from '../../utils/colorwayResolver';
import { setArrangement3D, setArrangementBinding, clearArrangementOverride, clearArrangementOverrides, setLayer, setSublayer, cloneToLayer } from '../../store/projectSlice';
import { showErrorToast, showInfoToast } from '../../store/copilotUISlice';
import { getAnchorMap } from '../../utils/cloth/arrangement/anchorMap';
import { resolveAnchorClick, selectionNamespace } from './anchorClick';
import { dispatchInspectPiece } from '../../store/inspectorSlice';
import { useDispatch } from 'react-redux';
import { toolRegistry } from '../../tools';
import { displayShortcut } from '../shell/shortcutDisplay';
import { pushError } from '../../utils/errorTracker';
import { pushSolverEvent } from '../../utils/cloth/solverRuntimeTracker';
import './Viewport3D.css';

/** Error boundary so a WebGL crash doesn't take down the 2D editor */
class Viewport3DErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: string }> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err.message };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Viewport3DErrorBoundary]', error, info.componentStack);
    pushError({
      message: error.message,
      source: 'Viewport3DErrorBoundary',
      timestamp: Date.now(),
      stack: [error.stack, info.componentStack]
        .filter(Boolean)
        .join('\n') || undefined,
    }, { persistForReload: true });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="viewport3d viewport3d-error">
          <div style={{ padding: '2rem', textAlign: 'center', color: '#888', fontSize: '0.85rem' }}>
            <p style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>⚠️ Vista 3D no disponible</p>
            <p>WebGL no pudo inicializar. El editor 2D sigue funcionando normal.</p>
            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.6 }}>{this.state.error}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const PIECE_COLORS = ['#e6e0f8', '#dcece2', '#f4e4d9', '#dfe9f6', '#f2e0e8']; // pasteles con hue (lavanda/salvia/durazno/cielo/rosa) — refresh 2026-07-04

// Scratch vectors for custom pan — avoids allocations in pointermove hot path
const _panRight = new THREE.Vector3();
const _panUp = new THREE.Vector3();
const _homeTarget = new THREE.Vector3();

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

function createWebGPURenderer(canvas: HTMLCanvasElement): WebGPURenderer {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: true,
    // Falls back to WebGL2 when WebGPU is unavailable or feature-flagged off
    forceWebGL: !isWebGPUBackend,
  });

  // Shadow maps under WebGPURenderer: supported since the NodeMaterial
  // ShadowNode landed (r184 ships Basic/PCF/PCFSoft/VSM filters — see
  // three/src/nodes/lighting/ShadowNode.js). The old "NodeMaterial rejects
  // MeshDepthMaterial" guard (9af1b3f8, r183-era) no longer applies to shadow
  // maps — only to drei's raw-ShaderMaterial helpers (ContactShadows/Grid),
  // which stay out. Set here (not only via the Canvas `shadows` prop) so the
  // renderer is correctly configured regardless of R3F prop handling for
  // custom gl factories.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Suppress "render called before init" errors by gating early render calls.
  // R3F calls .render() on the first frame before async init() completes.
  let backendReady = false;
  const originalRender = renderer.render.bind(renderer);
  renderer.render = function (...args: Parameters<typeof originalRender>) {
    if (!backendReady) return; // silently skip until init resolves
    return originalRender(...args);
  } as typeof renderer.render;

  renderer.init().then(() => {
    backendReady = true;
    // Record renderer-device loss in the module registry (#901) so the cloth
    // sim downgrades to WASM/CPU on the next Simulate even when the loss happens
    // while idle — GarmentSimulation (the in-sim watcher) is unmounted then, so
    // this renderer-scoped listener is the only one that catches an idle loss.
    const device = (renderer as unknown as { backend?: { device?: GPUDevice } }).backend?.device;
    if (device) device.lost.then((info) => {
      markRendererDeviceLost(device);
      pushSolverEvent('device:lost', { source: 'idle', reason: info?.reason, message: info?.message });
    });
  }).catch((err) => {
    console.warn('[Viewport3D] WebGPURenderer.init() failed:', err);
    // Allow render anyway — may work with degraded fallback
    backendReady = true;
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
  /** When true, hides legacy chrome (SimModeToggle, Render/CB buttons, sim-status)
   *  because the new AppShell provides RightDock instead. */
  hideChrome?: boolean;
}

// Safari signals trackpad pinch via proprietary GestureEvent; everywhere else
// the browser synthesizes ctrlKey on the wheel event. XOR — never handle both.
const SAFARI_GESTURES = typeof window !== 'undefined' && 'ongesturestart' in window;

export default function Viewport3D({ activeTool3D = 'camera', hideChrome = false }: Viewport3DProps) {
  const dispatch = useDispatch();
  const { pieces, seams, avatarMode, avatarModelUrl, avatar, arrangementOverrides } = useSelector((s: RootState) => s.project);
  // Lo que se coloca sobre el cuerpo usa SUS medidas: uno de la biblioteca no se estira (spec § 5).
  const cuerpo = medidasDelCuerpo({ avatarMode, avatarModelUrl, avatar });
  const { selectedPieceIds } = useSelector((s: RootState) => s.editor);
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const pieceFabrics = useSelector((s: RootState) => s.simulation.pieceFabrics);
  const defaultFabricId = useSelector((s: RootState) => s.simulation.defaultFabricId);
  const viewMode3D = useSelector((s: RootState) => s.simulation.viewMode3D);
  /** Modo de superficie del shell (2d / split / 3d). Lo lee el oyente crudo de
   *  teclado de abajo, que no pasa por el registro de atajos y por tanto no
   *  hereda su filtro de contexto. */
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const showGarment = useSelector((s: RootState) => s.simulation.showGarment);
  const showSeamlines3D = useSelector((s: RootState) => s.simulation.showSeamlines3D);
  const hiddenPieceIds = useSelector((s: RootState) => s.simulation.hiddenPieceIds);
  const flippedPieceIds = useSelector((s: RootState) => s.simulation.flippedPieceIds);
  const collisionBodies = useSelector((s: RootState) => s.collisionBody.bodies);
  const colorways = useSelector((s: RootState) => s.project.colorways);
  const activeColorwayId = useSelector((s: RootState) => s.project.activeColorwayId);
  const { groundVisible } = useSelector((s: RootState) => s.renderSettings);
  const playbackState = useSelector((s: RootState) => s.animation.playbackState);
  const useClothSim = simulationState !== 'idle';
  const isArrangeMode = viewMode3D === 'arrange';
  const { handleAvatarClick, isTapeTool } = useAvatarTape(activeTool3D);
  useColorwaySync();

  // ─── Placement contract: el humano escribe el binding (click pieza → click
  // anchor). anchorNamespace destaca los puntos válidos para la pieza
  // seleccionada; el click resuelve vía anchorClick.ts, cuyo binding usa los
  // MISMOS opts que GarmentSimulation (espejo — ver anchorClick.ts).
  const armAxis = useSelector((s: RootState) => s.simulation.armAxis);
  const hiddenLayerIds = useSelector((s: RootState) => s.simulation.hiddenLayerIds);
  // ESPEJO de GarmentSimulation.activePieces (axisHints source).
  const activePieces = useMemo(
    () => pieces.filter(p =>
      p.active !== false
      && !hiddenPieceIds.includes(p.id)
      && !hiddenLayerIds.includes(p.layer ?? 1)
    ),
    [pieces, hiddenPieceIds, hiddenLayerIds],
  );

  // Colocaciones RESUELTAS (auto + overrides/bindings) — la ÚNICA autoridad
  // (consejo 2026-07-03 §1: cardinalidad uno). Antes: placeGarmentPieces sin
  // overrides + cada consumidor re-aplicaba `overrides[id] || position` a
  // mano (solo V3, sin bindings, sin rotación) = comité de colocaciones.
  // Con los MISMOS opts que la sim (axisHints/skeletonReady): el preview del
  // arrange ES donde la sim siembra — sin esto, el binding de un anchor de
  // manga se computaba contra el frame A-pose pero se previsualizaba contra
  // T-pose (split-brain que el acta prohíbe; hallazgo del agente de UI).
  const garmentPlacements = useMemo(
    () => resolveArrangement(pieces, cuerpo, arrangementOverrides, {
      skeletonReady: armAxis.ready,
      axisHints: buildAxisHints(activePieces, armAxis),
    }),
    [pieces, activePieces, cuerpo, arrangementOverrides, armAxis],
  );
  // activePieces (no el array FULL): el set del contrato es el del solver —
  // ver anchorClick.ts (review #934, split-brain L/R por-set).
  const anchorNamespace = useMemo(
    () => (activeTool3D === 'arrangement' ? selectionNamespace(activePieces, selectedPieceIds) : null),
    [activeTool3D, activePieces, selectedPieceIds],
  );
  const handleAnchorClick = useCallback((anchorId: string) => {
    const result = resolveAnchorClick({
      activePieces,
      selectedPieceIds,
      measurements: cuerpo,
      map: getAnchorMap(),
      anchorId,
      armAxis,
    });
    switch (result.kind) {
      case 'no-selection':
        dispatch(showInfoToast('Selecciona una pieza primero — luego el punto donde va'));
        break;
      case 'cross-namespace':
        dispatch(showErrorToast(`Ese punto es de otra zona del cuerpo (la pieza va en ${result.namespace})`));
        break;
      case 'bound':
        dispatch(setArrangementBinding({ pieceId: result.pieceId, binding: result.binding }));
        break;
      case 'no-map': // unreachable from a rendered point — nothing sane to do
        break;
    }
  }, [activePieces, selectedPieceIds, cuerpo, armAxis, dispatch]);

  const simRef = useRef<GarmentSimulationHandle>(null);
  const cameraMode = activeTool3D === 'camera';
  const orbitRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const cameraPresets = useCameraPresets(orbitRef);

  // Get cursor from active tool definition
  const toolCursor = toolRegistry.getTool(activeTool3D)?.cursor || 'default';

  // Force-apply mouse mapping every frame via onChange, because OrbitControls
  // from drei can reinitialise its internal mouseButtons after mount.
  // Pan is disabled here — we implement custom pan below to keep orbit target
  // locked on the avatar center.
  const patchMouseButtons = useCallback(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    const mb = controls.mouseButtons;
    if (mb.LEFT !== (-1 as unknown as THREE.MOUSE) ||
        mb.MIDDLE !== (-1 as unknown as THREE.MOUSE) ||
        mb.RIGHT !== THREE.MOUSE.ROTATE) {
      controls.mouseButtons = {
        LEFT: -1 as unknown as THREE.MOUSE,
        MIDDLE: -1 as unknown as THREE.MOUSE,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    }
  }, []);

  const inputScheme = useSelector((s: RootState) => s.inputScheme.scheme);
  const inputSchemeRef = useRef<InputSchemeId>(inputScheme);
  inputSchemeRef.current = inputScheme;

  // Custom pan: middle-click drag (mouse) or Alt/Option+left-drag (trackpad —
  // MacBooks have no middle button) moves the camera AND the orbit target
  // together (CLO3D-style focus-point pan — supersedes the C7 camera-only
  // pan that kept the target locked on the avatar; decision 2026-06-04).
  const panState = useRef<{ active: boolean; lastX: number; lastY: number; drag: number }>({ active: false, lastX: 0, lastY: 0, drag: 0 });
  const lastPanClickRef = useRef<PanClick | null>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);

  const onPanPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isPanGesture(e)) return;
    if (playbackState === 'playing') return;

    // Double pan-click → re-center the focus on the avatar, keeping the
    // current angle/distance (inverse of the CLO3D-style pan above).
    const click: PanClick = { time: e.timeStamp, x: e.clientX, y: e.clientY };
    if (isDoublePanClick(lastPanClickRef.current, click)) {
      lastPanClickRef.current = null; // consume — a triple click doesn't re-fire
      const controls = orbitRef.current;
      if (controls) {
        recenterTarget(controls.object.position, controls.target, _homeTarget.set(...DEFAULT_TARGET));
        controls.update();
      }
    } else {
      lastPanClickRef.current = click;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    panState.current = { active: true, lastX: e.clientX, lastY: e.clientY, drag: 0 };
    // Show the focus crosshair while the pan button is held (target = viewport center)
    if (crosshairRef.current) crosshairRef.current.style.display = 'block';
  }, [playbackState]);

  const onPanPointerMove = useCallback((e: React.PointerEvent) => {
    if (!panState.current.active) return;
    const controls = orbitRef.current;
    if (!controls) return;
    const camera = controls.object;

    const dx = e.clientX - panState.current.lastX;
    const dy = e.clientY - panState.current.lastY;
    panState.current.lastX = e.clientX;
    panState.current.lastY = e.clientY;

    // A real drag is a pan, not a click — disarm the pending double-click.
    panState.current.drag += Math.abs(dx) + Math.abs(dy);
    if (panState.current.drag > 6) lastPanClickRef.current = null;

    // Scale pan speed based on camera distance to target
    const distance = camera.position.distanceTo(controls.target);
    const panSpeed = distance * 0.001;

    // Get camera-local right and up vectors
    _panRight.setFromMatrixColumn(camera.matrix, 0); // camera X axis
    _panUp.setFromMatrixColumn(camera.matrix, 1);     // camera Y axis

    // CLO3D-style: camera AND orbit target move together, so subsequent
    // orbit/zoom pivot around wherever the user panned to (e.g. an armpit).
    // Camera presets / reset restore the default target if you get lost.
    panViewpoint(camera.position, controls.target, _panRight, _panUp, dx, dy, panSpeed);
    controls.update();
  }, []);

  const onPanPointerUp = useCallback((e: React.PointerEvent) => {
    if (!panState.current.active || !isPanRelease(e.button)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    panState.current.active = false;
    if (crosshairRef.current) crosshairRef.current.style.display = 'none';
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

  // ─── Single 3D wheel owner (spec 2026-06-04 § Halberg constraint 1) ───
  // OrbitControls enableZoom is OFF permanently; this handler routes wheel
  // per scheme via the pure intent layer. Early-returns when controls are
  // disabled (TransformControls / poseDrag own the pointer then).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const controls = orbitRef.current;
      if (!controls || !controls.enabled) return;
      // Safari XOR (constraint 3): pinch arrives as GestureEvent there.
      if (SAFARI_GESTURES && (e.ctrlKey || e.metaKey)) return;
      const intent = wheelIntent(e, inputSchemeRef.current, '3d');
      if (!intent) return;
      e.preventDefault();
      const camera = controls.object;
      if (intent.kind === 'orbit') {
        orbitAroundTarget(camera.position, controls.target, intent.dx, intent.dy);
      } else if (intent.kind === 'zoom') {
        // zoomFactor>1 = zoom in = distance shrinks → invert for dolly
        dollyTowardTarget(camera.position, controls.target, 1 / zoomFactor(intent.delta), 0.6, 5);
      }
      controls.update();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Safari trackpad pinch → GestureEvent zoom (the global main.tsx preventDefault
  // does NOT stop propagation — we still receive these; verified fase 1).
  useEffect(() => {
    if (!SAFARI_GESTURES) return;
    const el = containerRef.current;
    if (!el) return;
    let prevScale = 1;
    const onStart = (e: Event) => { prevScale = 1; e.preventDefault(); };
    const onChange = (e: Event) => {
      e.preventDefault();
      const scale = (e as Event & { scale?: number }).scale;
      const controls = orbitRef.current;
      if (!controls || !controls.enabled || typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) return;
      // fingers apart (scale grows) → zoom in → distance shrinks
      dollyTowardTarget(controls.object.position, controls.target, prevScale / scale, 0.6, 5);
      prevScale = scale;
      controls.update();
    };
    el.addEventListener('gesturestart', onStart);
    el.addEventListener('gesturechange', onChange);
    return () => {
      el.removeEventListener('gesturestart', onStart);
      el.removeEventListener('gesturechange', onChange);
    };
  }, []);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [fitMapStats, setFitMapStats] = useState<import('../../utils/cloth/fitMaps').FitMapStats | null>(null);
  const [inspectedValue, setInspectedValue] = useState<number | null>(null);
  const [avatarHidden, setAvatarHidden] = useState(false);
  const [collisionPanelOpen, setCollisionPanelOpen] = useState(false);
  // Redux y no useState: las puertas (File menu, palette) viven fuera de este árbol.
  const renderPanelOpen = useSelector((s: RootState) => s.simulation.renderSettingsOpen);

  // Expose fitMapStats to window for Playwright E2E testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__VINA_FIT_MAP_STATS__ = fitMapStats;
    }
    return () => {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).__VINA_FIT_MAP_STATS__;
      }
    };
  }, [fitMapStats]);

  const poseEditorOpen = useSelector((s: RootState) => s.avatar.poseEditorOpen);
  const [ctxMenu, setCtxMenu] = useState<ContextMenu3DState>({
    visible: false, x: 0, y: 0, target: 'background',
  });
  const rightDownRef = useRef<{ x: number; y: number } | null>(null);

  // Right-click context menu: distinguish drag (orbit) from click (menu)
  const boxSelectStart = useRef<{ x: number; y: number } | null>(null);
  const boxSelectEnd = useRef<{ x: number; y: number } | null>(null);
  const boxOverlayRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 2) {
      rightDownRef.current = { x: e.clientX, y: e.clientY };
    }
    if (e.button === 0 && activeTool3D === 'meshSelectBox') {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      boxSelectStart.current = { x, y };
      boxSelectEnd.current = { x, y };
    }
  }, [activeTool3D]);

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
    controls.object.position.set(...DEFAULT_POSITION);
    controls.target.set(...DEFAULT_TARGET);
    controls.update();
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
    link.download = `vina-fitmap-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  const handleCopyToClipboard = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    const canvas = container.querySelector('canvas');
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
      );
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch (err) {
      console.warn('Copy to clipboard failed:', err);
    }
  }, []);

  const handleExportStill = useCallback(async (width: number, height: number, transparent: boolean) => {
    const container = containerRef.current;
    if (!container) return;
    const refs = container as unknown as Record<string, unknown>;
    const gl = refs.__gl as AnyRenderer | undefined;
    const sc = refs.__scene as THREE.Scene | undefined;
    const cam = refs.__camera as THREE.PerspectiveCamera | undefined;
    if (!gl || !sc || !cam) return;
    const store = (window as unknown as Record<string, unknown>).__VINA_STORE__ as { getState: () => { renderSettings: { imageFormat: 'png' | 'jpeg' | 'exr'; jpegQuality: number; samplesPerPixel: number; denoiserEnabled: boolean } } } | undefined;
    const rs = store?.getState().renderSettings;
    await exportStill(gl, sc, cam, {
      width,
      height,
      transparent,
      format: rs?.imageFormat ?? 'png',
      jpegQuality: rs?.jpegQuality ?? 0.92,
      samplesPerPixel: rs?.samplesPerPixel,
      denoiserEnabled: rs?.denoiserEnabled,
    });
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
    const store = (window as unknown as Record<string, unknown>).__VINA_STORE__ as { getState: () => { renderSettings: { turntableFrameCount: number; turntableDirection: 'cw' | 'ccw'; videoFps: number; videoFormat: 'webm' | 'mp4' } } } | undefined;
    const config = store?.getState().renderSettings;
    const videoFormat = config?.videoFormat ?? 'webm';
    const blob = await renderTurntable(gl, sc, cam, {
      frameCount: config?.turntableFrameCount ?? 36,
      direction: config?.turntableDirection ?? 'cw',
      fps: config?.videoFps ?? 30,
      videoFormat,
    });
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    downloadBlob(blob, `vina-turntable-${Date.now()}.${ext}`);
  }, []);

  const handleExportAllViews = useCallback(async (width: number, height: number, transparent: boolean) => {
    const container = containerRef.current;
    if (!container) return;
    const refs = container as unknown as Record<string, unknown>;
    const gl = refs.__gl as AnyRenderer | undefined;
    const sc = refs.__scene as THREE.Scene | undefined;
    const cam = refs.__camera as THREE.PerspectiveCamera | undefined;
    if (!gl || !sc || !cam) return;
    const store = (window as unknown as Record<string, unknown>).__VINA_STORE__ as { getState: () => { renderSettings: { imageFormat: 'png' | 'jpeg' | 'exr'; jpegQuality: number } } } | undefined;
    const rs = store?.getState().renderSettings;
    await exportAllViews(gl, sc, cam, {
      width,
      height,
      transparent,
      format: rs?.imageFormat ?? 'png',
      jpegQuality: rs?.jpegQuality ?? 0.92,
    });
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
    const garmentMesh = (window as any).__VINA_CLOTH_MESH__ as THREE.Mesh | undefined;

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
        await downloadUSDZ(group, { filename: `vina-${timestamp}` });
      } else {
        const binary = format === '3d-glb';
        await downloadGLTF(group, {
          binary,
          scale: 1, // scale already applied by collector
          filename: `vina-${timestamp}`,
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
      // Don't steal keystrokes while the user is typing in an input/textarea/
      // contenteditable (e.g. the AI chat box). Without this, single-key 3D
      // shortcuts (F=focus, W=pin, I=IK, Shift+A/F) preventDefault the key and
      // it never reaches the field — typing "front" silently dropped the "f".
      const el = document.activeElement as HTMLElement | null;
      if (el) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable) return;
      }

      // Este oyente se salta el registro de atajos, que sí filtra por contexto
      // (`context: '3d'` en shortcuts/defaults.ts). Sin esta guarda, estando en
      // el lienzo 2D —donde AppShell monta el visor igual, solo con
      // `display:none`— pulsar W cambiaba la herramienta 3D en silencio, y
      // Shift+A, Shift+F y F10 hacían lo suyo sin ninguna superficie que lo
      // dijera. Medido en la revisión adversarial del 2026-09-04.
      if (viewMode === '2d') return;

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

      // ─── Camera Presets (CLO3D-standard) — numpad or top-row digits ───
      // Top-row support: MacBooks have no numpad (the ShortcutRegistry
      // defaults already declared '2'/'8'/… — this makes them real).
      const presetView = cameraViewFromKeyEvent(e);
      if (presetView) { e.preventDefault(); cameraPresets.setCameraView(presetView); }

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
  }, [activeTool3D, dispatch, cameraPresets, selectedPieceIds, snapshot3D, poseEditorOpen, viewMode]);

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
      onPointerDown={(e) => {
        // Bitácora: la única sonda 3D — el press y el release en el visor (spec caja-negra § 3.2).
        pushJournal('gesture', 'down', { surface: '3d', button: e.button, tool: activeTool3D });
        handlePointerDown(e); onPanPointerDown(e);
      }}
      onPointerMove={(e) => {
        onPanPointerMove(e);
        if (boxSelectStart.current && activeTool3D === 'meshSelectBox') {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          boxSelectEnd.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          // Update overlay div directly (no Redux dispatch per frame)
          const el = boxOverlayRef.current;
          if (el && boxSelectStart.current) {
            const s = boxSelectStart.current;
            const c = boxSelectEnd.current;
            el.style.display = 'block';
            el.style.left = `${Math.min(s.x, c.x)}px`;
            el.style.top = `${Math.min(s.y, c.y)}px`;
            el.style.width = `${Math.abs(c.x - s.x)}px`;
            el.style.height = `${Math.abs(c.y - s.y)}px`;
          }
        }
      }}
      onPointerUp={(e) => {
        pushJournal('gesture', 'up', { surface: '3d', button: e.button, tool: activeTool3D });
        onPanPointerUp(e);
        if (boxSelectStart.current && boxSelectEnd.current && activeTool3D === 'meshSelectBox') {
          // Hide overlay
          if (boxOverlayRef.current) boxOverlayRef.current.style.display = 'none';
          // Project vertices to screen space and select those inside the box
          const camera = orbitRef.current?.object as THREE.Camera | undefined;
          const simHandle = simRef.current;
          if (camera && simHandle) {
            const positions = simHandle.getPositions?.();
            if (positions) {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const w = rect.width;
              const h = rect.height;
              const s = boxSelectStart.current;
              const c = boxSelectEnd.current;
              const minX = Math.min(s.x, c.x);
              const maxX = Math.max(s.x, c.x);
              const minY = Math.min(s.y, c.y);
              const maxY = Math.max(s.y, c.y);
              const mvp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
              const v = new THREE.Vector4();
              const selected: number[] = [];
              const numVerts = positions.length / 3;
              for (let i = 0; i < numVerts; i++) {
                v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], 1);
                v.applyMatrix4(mvp);
                if (v.w <= 0) continue; // behind camera
                const sx = (v.x / v.w * 0.5 + 0.5) * w;
                const sy = (1 - (v.y / v.w * 0.5 + 0.5)) * h;
                if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
                  selected.push(i);
                }
              }
              dispatch(setSelectedVertices(selected));
            }
          }
          boxSelectStart.current = null;
          boxSelectEnd.current = null;
        } else if (boxSelectStart.current) {
          boxSelectStart.current = null;
          boxSelectEnd.current = null;
          if (boxOverlayRef.current) boxOverlayRef.current.style.display = 'none';
        }
      }}
      onContextMenu={handleContextMenu}
    >
      {/* NOT gated on hideChrome (same rationale as SurfaceModePill below):
          AppShell — the only production shell — mounts Viewport3D with
          hideChrome, which left this overlay permanently dark. It is the
          ratified observability surface (C4 § 3.1.A tool silent-absence;
          parity plan Fase 4 seam constraint count + zero-constraint
          warnings), not legacy chrome. Caught by the R1 replay specs:
          the Fase 4 "aviso explícito" was invisible in the real shell. */}
      <SimulationStatusOverlay />
      <div ref={boxOverlayRef} style={{
        display: 'none', position: 'absolute', border: '1px dashed #00e5ff',
        backgroundColor: 'rgba(0, 229, 255, 0.08)', pointerEvents: 'none', zIndex: 10,
      }} />
      <PanCrosshair ref={crosshairRef} />
      <Canvas
        camera={{ position: [0, 0.85, 3.0], fov: 50 }}
        shadows
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
            height={cmToM(cuerpo.height)}
            onPointerDown={isTapeTool ? handleAvatarClick : undefined}
          />
          </Suspense>
        )}

        {/* JointGizmos: always mounted when avatar present; internally checks poseEditorOpen */}
        <JointGizmos poseDrag={poseDrag} setOrbitEnabled={setOrbitEnabled} />
        <IKEndEffectorGizmos setOrbitEnabled={setOrbitEnabled} />
        <AvatarTapes />
        {/* AnchorPoints: only when 'arrangement' tool is active — mutually exclusive with pose */}
        <AnchorPoints
          measurements={cuerpo}
          visible={activeTool3D === 'arrangement' && !poseEditorOpen}
          onAnchorClick={handleAnchorClick}
          activeNamespace={anchorNamespace}
        />

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
          pieces.map((piece, i) => {
              if (hiddenPieceIds.includes(piece.id)) return null;
              const baseFabricId = pieceFabrics[piece.id] || defaultFabricId;
              const baseFabric = FABRIC_LIBRARY[baseFabricId];
              const resolved = resolveColorway(
                piece,
                colorways,
                activeColorwayId,
                { [piece.fabricId ?? 'SELF']: { color: baseFabric?.color || '#cccccc', fabricId: baseFabricId } },
                new Set(Object.keys(FABRIC_LIBRARY)),
              );
              const fabric = FABRIC_LIBRARY[resolved.fabricId] || baseFabric;
              return (
              <DraggablePiece
                key={piece.id}
                piece={piece}
                isSelected={selectedPieceIds.includes(piece.id)}
                color={PIECE_COLORS[i % PIECE_COLORS.length]}
                position={garmentPlacements[i].position}
                rotation={garmentPlacements[i].rotation}
                flippedPieceIds={flippedPieceIds}
                canDrag={isArrangeMode}
                onSelect={(id, shift) => dispatch(shift ? togglePieceSelection(id) : selectPiece(id))}
                onDragEnd={(id, pos) => dispatch(setArrangement3D({ pieceId: id, position: pos }))}
                setOrbitEnabled={setOrbitEnabled}
                fabricColor={resolved.color}
                fabricRoughness={fabric?.roughness}
              />
            ); })
        ))}

        {/* 3D Sew Tool — click two edges to create a seam */}
        {activeTool3D === 'sew3d' && !useClothSim && (
          <Sew3DTool
            pieces={pieces}
            placements={garmentPlacements}
            flippedPieceIds={flippedPieceIds}
          />
        )}

        {/* Seam preview — draw existing seams as 3D lines before simulation,
            so the user can verify the sewing (CLO3D-style). Reads the
            showSeamlines3D toggle that DisplayBar3D already exposes. */}
        {showGarment && !useClothSim && showSeamlines3D && seams.length > 0 && (
          <SeamRenderer3D
            seams={seams}
            pieces={pieces}
            placements={garmentPlacements}
            flippedPieceIds={flippedPieceIds}
          />
        )}

        {/* drei ContactShadows (raw ShaderMaterial) stays incompatible with the
            WebGPURenderer — real shadow maps on the key light replace it. */}

        {groundVisible && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        )}

        {/* Geometry-based grid — works with NodeMaterial/WebGPU renderer */}
        {groundVisible && <FloorGrid y={-0.001} />}

        <OrbitControls
          ref={orbitRef}
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={0.6}
          maxDistance={5}
          target={[0, 0.75, 0]}
          enablePan={false}
          enableZoom={false}
          mouseButtons={{ LEFT: -1 as unknown as THREE.MOUSE, MIDDLE: -1 as unknown as THREE.MOUSE, RIGHT: THREE.MOUSE.ROTATE }}
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

      {/* Render & Export 3D — se abre desde File ▸ Export 3D / Turntable...
          o la palette (export-3d); el botón !hideChrome que era su única
          puerta jamás renderizó en el shell actual (Fase 2, puerta-export). */}
      <RenderSettingsPanel
        open={renderPanelOpen}
        onClose={() => dispatch(setRenderSettingsOpen(false))}
        onExportStill={handleExportStill}
        onExportTurntable={handleExportTurntable}
        onExportAllViews={handleExportAllViews}
        onExport3D={handleExport3D}
        onCopyToClipboard={handleCopyToClipboard}
      />

      {/* Collision Body toggle + panel */}
      {!hideChrome && (
        <button
          style={{
            position: 'absolute',
            top: 8,
            right: collisionPanelOpen ? 290 : 8,
            zIndex: 25,
            // Gemelo de .surface-pill__trigger: mismo material `overlay` y el
            // mismo acento al abrirse. Antes traía su propio gris y su propio
            // azul, que no salía de ningún token.
            background: collisionPanelOpen ? 'var(--accent-subtle)' : 'var(--surface-overlay-bg)',
            backdropFilter: 'var(--surface-overlay-blur)',
            border: collisionPanelOpen ? '1px solid var(--accent)' : 'var(--surface-overlay-border)',
            borderRadius: 'var(--surface-overlay-radius)',
            boxShadow: 'var(--surface-overlay-shadow)',
            color: collisionPanelOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
            padding: '6px 10px',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'var(--font-sans)',
          }}
          title="Cuerpos de colisión"
          aria-label="Cuerpos de colisión"
          onClick={() => setCollisionPanelOpen(!collisionPanelOpen)}
        >
          CC
        </button>
      )}
      <CollisionBodyPanel
        open={collisionPanelOpen}
        onClose={() => setCollisionPanelOpen(false)}
      />

      {/* Surface mode picker (spec 2026-06-04 display-toggles-resurface).
          NOT gated on hideChrome: AppShell mounts Viewport3D with hideChrome
          (legacy chrome hidden in the redesign shell), but the pill is
          redesign-era UI — gating it would make it a dark surface. */}
      <SurfaceModePill />

      {!cameraMode && (
        <div className="sim-status" style={{ left: 12, right: 'auto', color: '#4488ff', opacity: 0.9, pointerEvents: 'none' }}>
          {poseEditorOpen ? '● MODO POSE' : activeTool3D === 'arrangement' ? '⊕ COLOCAR — clic en la pieza, luego clic en el punto de colocación' : '✏️ MODO EDICIÓN'} — {inputScheme === 'trackpad' ? `orbitar con dos dedos · zoom con pellizco · ${displayShortcut('⌥')}arrastrar panea` : `clic derecho orbita · clic central/${displayShortcut('⌥')}arrastrar panea`}
        </div>
      )}

      <ContextMenu3D
        menu={ctxMenu}
        onClose={() => setCtxMenu(m => ({ ...m, visible: false }))}
        onResetCamera={handleResetCamera}
        onToggleAvatar={() => setAvatarHidden(h => !h)}
        onSnapshot={snapshot3D}
        onSelectPiece={(id) => dispatch(selectPiece(id))}
        onResetPieceArrangement={(id) => dispatch(clearArrangementOverride(id))} // reset = LIMPIAR el override (antes: [0,0,0] world = "muévete al origen", el mismo bug que el tool del agente tenía)
        onResetPose={() => dispatch(resetPose())}
        onShowProperties={(id) => {
          dispatch(selectPiece(id));
        }}
        onResetArrangement={() => {
          dispatch(resetSimulation());
          dispatch(setViewMode3D('arrange'));
          dispatch(clearArrangementSnapshot());
        }}
        onZoomToFit={() => handleResetCamera()}
        onCameraPreset={(preset) => cameraPresets.setCameraView(preset as ViewPreset)}
        onInspect={(pieceId) => {
          dispatchInspectPiece(dispatch, pieceId);
        }}
        onToggleHide={(id) => dispatch(toggleHide3D(id))}
        onToggleFlipNormal={(id) => dispatch(toggleFlipNormal(id))}
        onShowAll={() => dispatch(showAll3D())}
        onResetAll3D={() => {
          dispatch(clearArrangementOverrides());
          dispatch(showAll3D());
          dispatch(clearFlippedNormals());
        }}
        isPieceHidden={ctxMenu.pieceId ? hiddenPieceIds.includes(ctxMenu.pieceId) : false}
        isPieceFlipped={ctxMenu.pieceId ? flippedPieceIds.includes(ctxMenu.pieceId) : false}
        layerProps={ctxMenu.pieceId ? (() => {
          const ctxPiece = pieces.find(p => p.id === ctxMenu.pieceId);
          return {
            currentLayer: ctxPiece?.layer,
            currentSublayer: ctxPiece?.sublayer,
            onSetLayer: (pid: string, layer: number) => dispatch(setLayer({ pieceId: pid, layer })),
            onSetSublayer: (pid: string, sublayer: number) => dispatch(setSublayer({ pieceId: pid, sublayer })),
            onCloneToLayer: (pid: string, direction: 'over' | 'under') => dispatch(cloneToLayer({ pieceId: pid, direction })),
            onSuperimpose: (pid: string, mode: 'over' | 'under' | 'side') => dispatch(enterSuperimposePickMode({ sourcePieceId: pid, mode })),
          };
        })() : undefined}
      />
    </div>
  );
}
