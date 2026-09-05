/**
 * ArrangeGizmo — manipulador de traslación estilo CLO3D para el modo arrange.
 *
 * Reemplaza a drei TransformControls, que tenía DOS fallas aquí:
 * 1. POSICIÓN: envolvía un grupo hijo con `position` propio → el gizmo se
 *    anclaba en el ORIGEN del mundo (0,0,0) mientras la pieza se veía en su
 *    sitio (bug reportado por Samuel 2026-07-04).
 * 2. ESCRITURA: el drag movía el wrapper interno de TransformControls, pero
 *    onMouseUp leía la posición del grupo hijo (intacta) → el override
 *    escrito era la posición VIEJA — el drag por gizmo era un no-op
 *    silencioso (la misma familia de bug que el drag-fix de D1).
 *
 * Diseño: 3 flechas de eje (shaft + cono, colores X/Y/Z) + esfera central
 * (drag en el plano de la cámara). Todo mesh-based (meshBasicMaterial) —
 * WebGPURenderer rechaza LineMaterial/fat-lines (precedente documentado en
 * DraggablePiece/SeamRenderer3D). depthTest=false + renderOrder alto = el
 * gizmo siempre visible sobre la tela, como en CLO3D. Hover = brillo+escala.
 *
 * Matemática de drag estándar: eje → punto más cercano de la línea del eje
 * al rayo del puntero; centro → intersección con el plano ⊥ cámara por el
 * origen del gizmo. El delta se reporta en WORLD; el dueño lo aplica.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { bindPointerDrag } from './pointerDragSession';

type Handle = 'x' | 'y' | 'z' | 'center';

interface ArrangeGizmoProps {
  /** Posición WORLD del gizmo (el centro de la pieza seleccionada). */
  position: [number, number, number];
  /** Delta WORLD acumulado durante el drag (live). */
  onDrag: (delta: [number, number, number]) => void;
  /** Fin del drag con el delta final. */
  onDragEnd: (delta: [number, number, number]) => void;
  setOrbitEnabled: (enabled: boolean) => void;
  /**
   * Presta el arrastre libre (el de la esfera central) a quien quiera
   * empezarlo desde fuera — hoy, el propio cuerpo de la pieza (#1108).
   *
   * Se presta la función en vez de copiar la matemática: el plano ⊥ cámara,
   * la captura global del puntero, el corte del orbit y la cancelación
   * al desmontar a mitad de arrastre (#935) son un solo camino o no son
   * ninguno.
   */
  prestarArrastreLibre?: (iniciar: (e: ThreeEvent<PointerEvent>) => void) => void;
  size?: number;
}

const AXIS_DIR: Record<'x' | 'y' | 'z', THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
const AXIS_COLOR: Record<'x' | 'y' | 'z', string> = {
  x: '#ff5c5c',
  y: '#5fdd7d',
  z: '#5fb0ff',
};
const HOVER_COLOR = '#ffffff';
const CENTER_COLOR = '#e2e8f0'; // blanco pizarra (el amarillo murió con el resto, 2026-07-04)

/** Punto de la línea (p, dir a) más cercano al rayo (o, d). */
function closestPointOnAxis(
  origin: THREE.Vector3, axis: THREE.Vector3,
  ray: THREE.Ray,
): THREE.Vector3 {
  const o = ray.origin, d = ray.direction;
  const w0 = new THREE.Vector3().subVectors(origin, o);
  const a2 = axis.dot(axis);
  const ad = axis.dot(d);
  const denom = a2 * d.dot(d) - ad * ad;
  if (Math.abs(denom) < 1e-9) return origin.clone(); // rayo ∥ eje
  const s = (ad * w0.dot(d) - w0.dot(axis) * d.dot(d)) / denom;
  return origin.clone().addScaledVector(axis, s);
}

export default function ArrangeGizmo({
  position,
  onDrag,
  onDragEnd,
  setOrbitEnabled,
  prestarArrastreLibre,
  size = 0.16,
}: ArrangeGizmoProps) {
  const { camera, gl } = useThree();
  const [hover, setHover] = useState<Handle | null>(null);
  const dragRef = useRef<{
    handle: Handle;
    start: THREE.Vector3;      // punto de agarre inicial (world)
    origin: THREE.Vector3;     // posición del gizmo al iniciar
    plane: THREE.Plane | null; // para 'center'
    delta: [number, number, number];
  } | null>(null);

  const origin = useMemo(() => new THREE.Vector3(...position), [position]);

  // Cancel the active drag WITHOUT committing (set fresh per drag in handleDown).
  // Called on unmount so an Escape-deselect mid-drag doesn't leave listeners that
  // later fire a phantom onDragEnd (#935).
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { cancelRef.current?.(); }, []);

  const grabPoint = useCallback((handle: Handle, ray: THREE.Ray, at: THREE.Vector3): THREE.Vector3 | null => {
    if (handle === 'center') {
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, at);
      const hit = new THREE.Vector3();
      return ray.intersectPlane(plane, hit) ? hit : null;
    }
    return closestPointOnAxis(at, AXIS_DIR[handle], ray);
  }, [camera]);

  const handleDown = useCallback((handle: Handle) => (e: ThreeEvent<PointerEvent>) => {
    // Solo el botón primario arrastra. En este visor la ÓRBITA es el botón
    // DERECHO (`Viewport3D.tsx` fija `{LEFT:-1, MIDDLE:-1, RIGHT: ROTATE}`) y
    // R3F despacha `onPointerDown` para cualquier botón, así que sin este
    // filtro un arrastre con el derecho apaga el orbit, mueve la pieza y al
    // soltar escribe la colocación nueva. El gizmo nunca lo filtró; con la
    // esfera de 1,8 cm casi no se notaba, pero desde #1108 la superficie es la
    // pieza entera.
    if (e.button !== 0) return;
    e.stopPropagation();
    const start = grabPoint(handle, e.ray, origin);
    if (!start) return;
    let plane: THREE.Plane | null = null;
    if (handle === 'center') {
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
    }
    dragRef.current = { handle, start, origin: origin.clone(), plane, delta: [0, 0, 0] };
    setOrbitEnabled(false);
    // Captura global: el puntero puede salirse del handle durante el drag.
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const rect = el.getBoundingClientRect();
      ndc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      let now: THREE.Vector3 | null = null;
      if (drag.handle === 'center') {
        const hit = new THREE.Vector3();
        now = drag.plane && raycaster.ray.intersectPlane(drag.plane, hit) ? hit : null;
      } else {
        now = closestPointOnAxis(drag.origin, AXIS_DIR[drag.handle], raycaster.ray);
      }
      if (!now) return;
      const d: [number, number, number] = [
        now.x - drag.start.x,
        now.y - drag.start.y,
        now.z - drag.start.z,
      ];
      drag.delta = d;
      onDrag(d);
    };
    const session = bindPointerDrag(el, window, onMove, () => {
      const drag = dragRef.current;
      dragRef.current = null;
      cancelRef.current = null;
      setOrbitEnabled(true);
      if (drag) onDragEnd(drag.delta);
    });
    // Unmount-mid-drag path: drop the drag, restore orbit, do NOT commit.
    cancelRef.current = () => {
      session.cancel();
      dragRef.current = null;
      cancelRef.current = null;
      setOrbitEnabled(true);
    };
  }, [grabPoint, origin, camera, gl, onDrag, onDragEnd, setOrbitEnabled]);

  const iniciarLibre = useMemo(() => handleDown('center'), [handleDown]);
  useEffect(() => {
    prestarArrastreLibre?.(iniciarLibre);
  }, [prestarArrastreLibre, iniciarLibre]);

  const over = useCallback((h: Handle) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHover(h);
    gl.domElement.style.cursor = 'grab';
  }, [gl]);
  const out = useCallback(() => {
    setHover(null);
    gl.domElement.style.cursor = '';
  }, [gl]);

  const shaftLen = size;
  const shaftR = size * 0.02;
  const tipLen = size * 0.28;
  const tipR = size * 0.07;

  const axisMesh = (axis: 'x' | 'y' | 'z') => {
    const dir = AXIS_DIR[axis];
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const active = hover === axis;
    const color = active ? HOVER_COLOR : AXIS_COLOR[axis];
    return (
      <group key={axis} quaternion={q}>
        {/* Shaft */}
        <mesh
          position={[0, shaftLen / 2, 0]}
          onPointerDown={handleDown(axis)}
          onPointerOver={over(axis)}
          onPointerOut={out}
          renderOrder={1000}
        >
          <cylinderGeometry args={[shaftR, shaftR, shaftLen, 8]} />
          <meshBasicMaterial color={color} depthTest={false} depthWrite={false} transparent opacity={active ? 1 : 0.92} />
        </mesh>
        {/* Tip */}
        <mesh
          position={[0, shaftLen + tipLen / 2, 0]}
          scale={active ? 1.2 : 1}
          onPointerDown={handleDown(axis)}
          onPointerOver={over(axis)}
          onPointerOut={out}
          renderOrder={1000}
        >
          <coneGeometry args={[tipR, tipLen, 16]} />
          <meshBasicMaterial color={color} depthTest={false} depthWrite={false} transparent opacity={active ? 1 : 0.92} />
        </mesh>
        {/* Zona de agarre invisible más gorda (usabilidad) */}
        <mesh
          position={[0, (shaftLen + tipLen) / 2, 0]}
          onPointerDown={handleDown(axis)}
          onPointerOver={over(axis)}
          onPointerOut={out}
          visible={false}
        >
          <cylinderGeometry args={[tipR * 1.3, tipR * 1.3, shaftLen + tipLen, 6]} />
        </mesh>
      </group>
    );
  };

  return (
    <group position={position}>
      {axisMesh('x')}
      {axisMesh('y')}
      {axisMesh('z')}
      {/* Centro: drag libre en el plano de la cámara (el gesto por defecto de CLO3D) */}
      <mesh
        onPointerDown={handleDown('center')}
        onPointerOver={over('center')}
        onPointerOut={out}
        scale={hover === 'center' ? 1.25 : 1}
        renderOrder={1001}
      >
        <sphereGeometry args={[size * 0.11, 20, 14]} />
        <meshBasicMaterial
          color={hover === 'center' ? '#8b7cf8' : CENTER_COLOR}
          depthTest={false}
          depthWrite={false}
          transparent
          opacity={0.95}
        />
      </mesh>
    </group>
  );
}
