import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  updateCollisionBodyTransform,
  selectCollisionBody,
} from '../../store/collisionBodySlice';
import type { CollisionBody } from '../../types/collisionBody';
import { importMesh } from '../../utils/import/meshImporter';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

interface CollisionBodyMeshProps {
  body: CollisionBody;
  orbitRef: React.RefObject<THREE.EventDispatcher | null>;
}

export default function CollisionBodyMesh({ body, orbitRef }: CollisionBodyMeshProps) {
  const dispatch = useDispatch<AppDispatch>();
  const selectedBodyId = useSelector((s: RootState) => s.collisionBody.selectedBodyId);
  const isSelected = selectedBodyId === body.id;

  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [clips, setClips] = useState<THREE.AnimationClip[]>([]);

  // Suppress unused-variable lint — orbitRef is accepted for future
  // drag-to-disable-orbit integration (same pattern as DraggablePiece).
  void orbitRef;

  // Load mesh from URL
  useEffect(() => {
    let cancelled = false;
    importMesh(body.meshUrl, body.name, {}).then(result => {
      if (cancelled) return;
      setScene(result.scene);
    }).catch(err => {
      console.warn('[CollisionBodyMesh] Failed to load:', body.name, err);
    });
    return () => { cancelled = true; };
  }, [body.meshUrl, body.name]);

  // Extract animation clips from loaded scene
  useEffect(() => {
    if (!scene) return;
    const foundClips: THREE.AnimationClip[] = [];
    scene.traverse(obj => {
      if (obj.animations?.length) {
        foundClips.push(...obj.animations);
      }
    });
    if (scene.animations?.length) foundClips.push(...scene.animations);
    setClips(foundClips);
  }, [scene]);

  // Setup animation mixer
  useEffect(() => {
    if (!scene || clips.length === 0) return;
    const mixer = new THREE.AnimationMixer(scene);
    mixerRef.current = mixer;
    return () => { mixer.stopAllAction(); mixerRef.current = null; };
  }, [scene, clips]);

  // Play/stop animation based on Redux state
  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer || clips.length === 0) return;
    mixer.stopAllAction();
    if (
      body.animation.clipIndex !== null &&
      body.animation.clipIndex < clips.length &&
      body.animation.playing
    ) {
      const clip = clips[body.animation.clipIndex];
      const action = mixer.clipAction(clip);
      action.loop = body.animation.loop ? THREE.LoopRepeat : THREE.LoopOnce;
      action.clampWhenFinished = !body.animation.loop;
      action.play();
    }
  }, [body.animation.clipIndex, body.animation.playing, body.animation.loop, clips]);

  // Advance mixer each frame
  useFrame((_, delta) => {
    if (mixerRef.current && body.animation.playing) {
      mixerRef.current.update(delta);
    }
  });

  // Apply transform from Redux state
  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(...body.transform.position);
    groupRef.current.rotation.set(
      body.transform.rotation[0] * DEG2RAD,
      body.transform.rotation[1] * DEG2RAD,
      body.transform.rotation[2] * DEG2RAD,
    );
    groupRef.current.scale.set(...body.transform.scale);
  }, [body.transform]);

  // Handle gizmo transform change — dispatch to Redux
  const handleTransformChange = () => {
    if (!groupRef.current) return;
    const p = groupRef.current.position;
    const r = groupRef.current.rotation;
    const s = groupRef.current.scale;
    dispatch(updateCollisionBodyTransform({
      id: body.id,
      transform: {
        position: [p.x, p.y, p.z],
        rotation: [r.x * RAD2DEG, r.y * RAD2DEG, r.z * RAD2DEG],
        scale: [s.x, s.y, s.z],
      },
    }));
  };

  if (!scene || !body.visible) return null;

  return (
    <>
      <group
        ref={groupRef}
        onClick={e => {
          e.stopPropagation();
          dispatch(selectCollisionBody(body.id));
        }}
      >
        <primitive object={scene} />
      </group>
      {isSelected && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode="translate"
          onObjectChange={handleTransformChange}
        />
      )}
    </>
  );
}
