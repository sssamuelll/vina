import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { HDRI_PRESETS } from '../../store/renderSettingsSlice';
import { DIR_SHADOW_PROPS } from './shadowConfig';

const TONE_MAP: Record<string, THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  linear: THREE.LinearToneMapping,
};

export default function EnvironmentSetup() {
  const { gl, scene } = useThree();
  const {
    hdriPreset, hdriRotation, hdriCustomUrl,
    toneMapping, exposure,
    backgroundMode, backgroundColor,
  } = useSelector((s: RootState) => s.renderSettings);

  // Apply tone mapping + exposure
  useEffect(() => {
    gl.toneMapping = TONE_MAP[toneMapping] ?? THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
  }, [gl, toneMapping, exposure]);


  // Apply background
  useEffect(() => {
    if (backgroundMode === 'hdri') {
      // Environment component will set background -- we don't override
    } else if (backgroundMode === 'transparent') {
      scene.background = null;
      gl.setClearColor(0x000000, 0);
    } else {
      // solid
      scene.background = new THREE.Color(backgroundColor);
      gl.setClearColor(new THREE.Color(backgroundColor), 1);
    }
  }, [gl, scene, backgroundMode, backgroundColor]);

  const hdriFile = hdriCustomUrl
    || HDRI_PRESETS.find(p => p.id === hdriPreset)?.file
    || '/hdri/studio-soft.hdr';

  const rotationRad = (hdriRotation * Math.PI) / 180;

  return (
    <>
      <ambientLight intensity={0.3} />
      <hemisphereLight args={['#ffffff', '#b0c4de', 0.3]} />
      {/* Key of THIS rig — casts alongside the CustomLights sun (the scene's
          dominant light at intensity 2.0, which provides most of the visible
          shadow contrast). Fills stay shadowless: each extra caster costs a
          full depth pass. near/far bracket light→avatar (≈7.1m away) through
          the ground patch where the head's shadow lands (≈8.5m). */}
      <directionalLight
        position={[3, 5, 4]}
        intensity={0.5}
        castShadow
        {...DIR_SHADOW_PROPS}
        shadow-camera-near={4}
        shadow-camera-far={10}
      />
      <directionalLight position={[-3, 4, -2]} intensity={0.25} />
      <directionalLight position={[0, 2, 5]} intensity={0.2} />
      {/* environmentIntensity: IBL is unshadowable — at drei's default 1.0 it
          buried the key light's shadow entirely (A/B measured 2026-07-02:
          shadow invisible at 1.0, reads cleanly at 0.3 with the 0.5 key).
          Must be a prop here: drei setEnvProps re-applies its default every
          render, clobbering any scene.environmentIntensity set elsewhere. */}
      <Environment
        files={hdriFile}
        background={backgroundMode === 'hdri'}
        environmentRotation={[0, rotationRad, 0]}
        environmentIntensity={0.3}
      />
    </>
  );
}
