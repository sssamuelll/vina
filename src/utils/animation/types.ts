// src/utils/animation/types.ts

export type InterpolationType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bezier';

export interface Keyframe {
  frame: number;
  value: number;
  interpolation: InterpolationType;
}

export interface AnimationProperty {
  id: string;
  path: string;           // e.g. 'position.x', 'joints.LeftArm.z', 'force.x'
  label: string;
  keyframes: Keyframe[];
}

export interface AnimationTrack {
  id: string;
  objectType: 'camera' | 'avatar' | 'wind' | 'light';
  objectId: string;       // e.g. 'main-camera', 'avatar', 'wind-global'
  label: string;
  expanded: boolean;
  properties: AnimationProperty[];
}

export type PlaybackState = 'stopped' | 'playing' | 'paused';
export type FpsOption = 24 | 30 | 60;
