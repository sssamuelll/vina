import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { CustomLight } from '../../store/renderSettingsSlice';

let rectAreaLightInitialized = false;

function RectLight({ light }: { light: CustomLight }) {
  const ref = useRef<THREE.RectAreaLight>(null);
  useEffect(() => {
    if (rectAreaLightInitialized) return;
    rectAreaLightInitialized = true;
    import('three/examples/jsm/lights/RectAreaLightUniformsLib.js').then(
      ({ RectAreaLightUniformsLib }) => { RectAreaLightUniformsLib.init(); },
    ).catch(() => { /* WebGPU may not need this */ });
  }, []);
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
