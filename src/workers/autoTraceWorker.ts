import { detectEdges } from '../utils/trace/edgeDetection';

self.onmessage = (event: MessageEvent) => {
  const { imageData, width, height, threshold, smoothing, minAreaPx } = event.data;
  try {
    const contours = detectEdges(
      new Uint8ClampedArray(imageData),
      width, height,
      { threshold, smoothing, minAreaPx },
    );
    self.postMessage({ type: 'result', contours });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Edge detection failed',
    });
  }
};
