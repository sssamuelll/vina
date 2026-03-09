import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { CustomLight } from '../../store/renderSettingsSlice';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

// Initialize RectAreaLight uniforms once globally
let rectAreaLightInitialized = false;

function RectLight({ light }: { light: CustomLight }) {
  const ref = useRef<THREE.RectAreaLight>(null);

  useEffect(() => {
    if (!rectAreaLightInitialized) {
      RectAreaLightUniformsLib.init();
      rectAreaLightInitialized = true;
    }
  }, []);

  return (
    <rectAreaLight
      ref={ref}
      color={light.color}
      intensity={light.intensity}
      width={light.width}
      height={light.height}
      position={light.position}
      rotation={new THREE.Euler(...light.rotation)}
    />
  );
}

export default function CustomLights() {
  const lights = useSelector((s: RootState) => s.renderSettings.lights);

  return (
    <>
      {lights.map((light) => (
        <RectLight key={light.id} light={light} />
      ))}
    </>
  );
}
