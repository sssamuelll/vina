export interface CollisionBodyTransform {
  position: [number, number, number];
  rotation: [number, number, number]; // euler degrees
  scale: [number, number, number];
}

export interface CollisionBodyCollision {
  enabled: boolean;
  friction: number;  // 0-1, default 0.3
  offset: number;    // meters, default 0.005
}

export interface CollisionBodyAnimation {
  clipIndex: number | null;
  playing: boolean;
  time: number;
  loop: boolean;
}

export interface CollisionBody {
  id: string;
  name: string;
  meshUrl: string;
  format: 'obj' | 'fbx' | 'glb' | 'gltf';
  transform: CollisionBodyTransform;
  collision: CollisionBodyCollision;
  animation: CollisionBodyAnimation;
  visible: boolean;
}
