import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { CustomLight } from '../../store/renderSettingsSlice';

// Module-level promise so the LTC lookup textures are initialized exactly once
// and every RectLight instance can await the same resolution. Resolves once
// BOTH the WebGL (RectAreaLightUniformsLib) and the TSL/WebGPU
// (RectAreaLightTexturesLib) lookup tables are ready.
let rectAreaLibPromise: Promise<void> | null = null;
function ensureRectAreaLib(): Promise<void> {
  if (!rectAreaLibPromise) {
    rectAreaLibPromise = Promise.all([
      // WebGL renderer path.
      import('three/examples/jsm/lights/RectAreaLightUniformsLib.js')
        .then(({ RectAreaLightUniformsLib }) => { RectAreaLightUniformsLib.init(); })
        .catch(() => { /* WebGL lib unavailable — WebGPU path still attempted */ }),
      // TSL/WebGPU renderer path. RectAreaLightNode.setupDirectRectArea reads
      // RectAreaLightTexturesLib.LTC_FLOAT_1, which is null until init() runs.
      // Missing this caused "Cannot read properties of null (reading
      // 'LTC_FLOAT_1')" the first frame a rect light rendered.
      import('three/examples/jsm/lights/RectAreaLightTexturesLib.js')
        .then(({ RectAreaLightTexturesLib }) => { RectAreaLightTexturesLib.init(); })
        .catch(() => { /* TSL lib unavailable — WebGL path covered above */ }),
    ]).then(() => undefined);
  }
  return rectAreaLibPromise;
}

function RectLight({ light }: { light: CustomLight }) {
  const ref = useRef<THREE.RectAreaLight>(null);
  // Defer mounting the rectAreaLight until the LTC lookup textures are loaded,
  // so the lighting node never builds against null textures.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    ensureRectAreaLib().then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);
  if (!ready) return null;
  return (
    <rectAreaLight ref={ref} color={light.color} intensity={light.intensity}
      width={light.width ?? 1} height={light.height ?? 1}
      position={light.position} rotation={new THREE.Euler(...light.rotation)} />
  );
}

function PointLightComponent({ light }: { light: CustomLight }) {
  return <pointLight color={light.color} intensity={light.intensity}
    position={light.position} distance={light.distance} decay={light.decay} />;
}

function DirectionalLightComponent({ light }: { light: CustomLight }) {
  return <directionalLight color={light.color} intensity={light.intensity}
    position={light.position} />;
}

function SpotLightComponent({ light }: { light: CustomLight }) {
  return <spotLight color={light.color} intensity={light.intensity}
    position={light.position} angle={THREE.MathUtils.degToRad(light.spotAngle)}
    penumbra={light.spotPenumbra} distance={light.distance} decay={light.decay} />;
}

function LightRenderer({ light }: { light: CustomLight }) {
  switch (light.type) {
    case 'point':       return <PointLightComponent light={light} />;
    case 'directional': return <DirectionalLightComponent light={light} />;
    case 'spot':        return <SpotLightComponent light={light} />;
    case 'rect': default: return <RectLight light={light} />;
  }
}

export default function CustomLights() {
  const lights = useSelector((s: RootState) => s.renderSettings.lights);
  return <>{lights.map((l) => <LightRenderer key={l.id} light={l} />)}</>;
}
