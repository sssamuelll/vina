import { PathCommand } from '../types/types';
import { optimizePath } from '../utils/utils';

type WorkerMessageData = { pathCommands: PathCommand[], requiresOptimization: boolean };

self.onmessage = (e) => {
  if (e.data === 'init') {
    self.postMessage('ready');
    return;
  }
  try {
    const data = e.data as WorkerMessageData;
    const { pathCommands, requiresOptimization } = data;
    const optimized = requiresOptimization ? optimizePath(pathCommands) : pathCommands;
    self.postMessage(optimized);
  } catch (error) {
    console.error('Error en worker:', error);
    self.postMessage([]);
  }
};