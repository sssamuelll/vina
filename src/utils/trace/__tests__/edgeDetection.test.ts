import { describe, it, expect } from 'vitest';
import {
  toGrayscale,
  gaussianBlur,
  sobelGradients,
  nonMaxSuppression,
  hysteresisThreshold,
  traceContours,
  douglasPeucker,
  detectEdges,
} from '../edgeDetection';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Create an RGBA Uint8ClampedArray for a single-color image. */
function solidImage(
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return data;
}

/** Paint a filled rectangle into an RGBA buffer. */
function paintRect(
  data: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  rw: number,
  rh: number,
  r: number,
  g: number,
  b: number,
) {
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) {
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  toGrayscale                                                        */
/* ------------------------------------------------------------------ */

describe('toGrayscale', () => {
  it('converts white pixel to 255', () => {
    const data = solidImage(1, 1, 255, 255, 255);
    const gray = toGrayscale(data, 1, 1);
    expect(gray[0]).toBe(255);
  });

  it('converts black pixel to 0', () => {
    const data = solidImage(1, 1, 0, 0, 0);
    const gray = toGrayscale(data, 1, 1);
    expect(gray[0]).toBe(0);
  });

  it('converts pure red pixel to ~76', () => {
    const data = solidImage(1, 1, 255, 0, 0);
    const gray = toGrayscale(data, 1, 1);
    // 0.299 * 255 ≈ 76.245
    expect(gray[0]).toBeGreaterThanOrEqual(76);
    expect(gray[0]).toBeLessThanOrEqual(77);
  });

  it('returns correct dimensions', () => {
    const data = solidImage(10, 5, 128, 128, 128);
    const gray = toGrayscale(data, 10, 5);
    expect(gray.length).toBe(50);
  });
});

/* ------------------------------------------------------------------ */
/*  gaussianBlur                                                       */
/* ------------------------------------------------------------------ */

describe('gaussianBlur', () => {
  it('all-zero image stays zero', () => {
    const gray = new Uint8Array(25); // 5x5 black
    const blurred = gaussianBlur(gray, 5, 5, 1);
    expect(blurred.every((v) => v === 0)).toBe(true);
  });

  it('impulse (single white pixel) spreads to neighbors', () => {
    const gray = new Uint8Array(25); // 5x5 black
    gray[12] = 255; // center pixel
    const blurred = gaussianBlur(gray, 5, 5, 1);
    // center should still be brightest
    expect(blurred[12]).toBeGreaterThan(0);
    // neighbors should have some energy
    expect(blurred[7]).toBeGreaterThan(0); // above
    expect(blurred[11]).toBeGreaterThan(0); // left
    // center should be less than 255 because energy is spread
    expect(blurred[12]).toBeLessThan(255);
  });

  it('uniform image stays unchanged', () => {
    const gray = new Uint8Array(25).fill(100);
    const blurred = gaussianBlur(gray, 5, 5, 1);
    for (let i = 0; i < 25; i++) {
      expect(blurred[i]).toBeGreaterThanOrEqual(99);
      expect(blurred[i]).toBeLessThanOrEqual(101);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  douglasPeucker                                                     */
/* ------------------------------------------------------------------ */

describe('douglasPeucker', () => {
  it('reduces a straight line with colinear points to 2 endpoints', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ];
    const result = douglasPeucker(points, 0.5);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[1]).toEqual({ x: 4, y: 0 });
  });

  it('preserves L-shape corner', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ];
    const result = douglasPeucker(points, 0.5);
    expect(result.length).toBe(3);
  });

  it('reduces a circle approximation', () => {
    // Generate 36 points on a circle
    const circle: { x: number; y: number }[] = [];
    for (let i = 0; i < 36; i++) {
      const angle = (i / 36) * 2 * Math.PI;
      circle.push({ x: 50 + 20 * Math.cos(angle), y: 50 + 20 * Math.sin(angle) });
    }
    const result = douglasPeucker(circle, 1.0);
    expect(result.length).toBeLessThan(36);
    expect(result.length).toBeGreaterThan(2);
  });

  it('handles two points', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    const result = douglasPeucker(points, 1.0);
    expect(result.length).toBe(2);
  });

  it('handles single point', () => {
    const result = douglasPeucker([{ x: 5, y: 5 }], 1.0);
    expect(result.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  hysteresisThreshold                                                */
/* ------------------------------------------------------------------ */

describe('hysteresisThreshold', () => {
  it('keeps strong pixels', () => {
    // 3x3 image, center is above high threshold
    const mag = new Float32Array(9);
    mag[4] = 200; // center
    const result = hysteresisThreshold(mag, 3, 3, 100, 50);
    expect(result[4]).toBe(255);
  });

  it('removes isolated weak pixels', () => {
    // weak pixel (between low and high) with no strong neighbor
    const mag = new Float32Array(9);
    mag[4] = 75; // center, between 50 and 100
    const result = hysteresisThreshold(mag, 3, 3, 100, 50);
    expect(result[4]).toBe(0);
  });

  it('keeps weak pixels connected to strong', () => {
    // center = strong, neighbor = weak
    const mag = new Float32Array(9);
    mag[4] = 200; // center = strong
    mag[5] = 75; // right neighbor = weak
    const result = hysteresisThreshold(mag, 3, 3, 100, 50);
    expect(result[4]).toBe(255);
    expect(result[5]).toBe(255);
  });

  it('removes pixels below low threshold', () => {
    const mag = new Float32Array(9);
    mag[4] = 30; // below low
    const result = hysteresisThreshold(mag, 3, 3, 100, 50);
    expect(result[4]).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  traceContours                                                      */
/* ------------------------------------------------------------------ */

describe('traceContours', () => {
  it('extracts contour from a rectangle of edge pixels', () => {
    // 10x10 binary edge map with a rectangle outline
    const edgeMap = new Uint8Array(100);
    // Draw rectangle outline from (2,2) to (7,7)
    for (let x = 2; x <= 7; x++) {
      edgeMap[2 * 10 + x] = 255; // top edge
      edgeMap[7 * 10 + x] = 255; // bottom edge
    }
    for (let y = 2; y <= 7; y++) {
      edgeMap[y * 10 + 2] = 255; // left edge
      edgeMap[y * 10 + 7] = 255; // right edge
    }
    const contours = traceContours(edgeMap, 10, 10);
    expect(contours.length).toBeGreaterThanOrEqual(1);
    // The largest contour should have points
    expect(contours[0].length).toBeGreaterThan(5);
  });

  it('returns empty array for blank image', () => {
    const edgeMap = new Uint8Array(100);
    const contours = traceContours(edgeMap, 10, 10);
    expect(contours.length).toBe(0);
  });

  it('sorts contours by area descending', () => {
    // Two separate rectangles of different sizes
    const edgeMap = new Uint8Array(400); // 20x20
    // Small rectangle (3x3 outline at top-left)
    for (let x = 1; x <= 3; x++) {
      edgeMap[1 * 20 + x] = 255;
      edgeMap[3 * 20 + x] = 255;
    }
    for (let y = 1; y <= 3; y++) {
      edgeMap[y * 20 + 1] = 255;
      edgeMap[y * 20 + 3] = 255;
    }
    // Large rectangle (8x8 outline at bottom-right)
    for (let x = 10; x <= 17; x++) {
      edgeMap[10 * 20 + x] = 255;
      edgeMap[17 * 20 + x] = 255;
    }
    for (let y = 10; y <= 17; y++) {
      edgeMap[y * 20 + 10] = 255;
      edgeMap[y * 20 + 17] = 255;
    }
    const contours = traceContours(edgeMap, 20, 20);
    if (contours.length >= 2) {
      // Compute areas using shoelace
      const area = (pts: { x: number; y: number }[]) => {
        let a = 0;
        for (let i = 0; i < pts.length; i++) {
          const j = (i + 1) % pts.length;
          a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
        }
        return Math.abs(a) / 2;
      };
      expect(area(contours[0])).toBeGreaterThanOrEqual(area(contours[1]));
    }
  });
});

/* ------------------------------------------------------------------ */
/*  detectEdges (integration)                                          */
/* ------------------------------------------------------------------ */

describe('detectEdges', () => {
  it('produces contours from a white square on black background', () => {
    const w = 20;
    const h = 20;
    const data = solidImage(w, h, 0, 0, 0);
    // Paint a white 8x8 square in the center
    paintRect(data, w, 6, 6, 8, 8, 255, 255, 255);

    const contours = detectEdges(data, w, h, {
      threshold: 50,
      smoothing: 1,
      minAreaPx: 4,
    });
    expect(contours.length).toBeGreaterThanOrEqual(1);
    // The contour should have multiple points forming the square boundary
    expect(contours[0].length).toBeGreaterThanOrEqual(4);
  });

  it('returns contours sorted by area descending', () => {
    const w = 40;
    const h = 40;
    const data = solidImage(w, h, 0, 0, 0);
    // Small square
    paintRect(data, w, 2, 2, 5, 5, 255, 255, 255);
    // Large square
    paintRect(data, w, 20, 20, 15, 15, 255, 255, 255);

    const contours = detectEdges(data, w, h, {
      threshold: 50,
      smoothing: 1,
      minAreaPx: 2,
    });
    if (contours.length >= 2) {
      const area = (pts: { x: number; y: number }[]) => {
        let a = 0;
        for (let i = 0; i < pts.length; i++) {
          const j = (i + 1) % pts.length;
          a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
        }
        return Math.abs(a) / 2;
      };
      expect(area(contours[0])).toBeGreaterThanOrEqual(area(contours[1]));
    }
  });

  it('returns empty for uniform image', () => {
    const data = solidImage(10, 10, 128, 128, 128);
    const contours = detectEdges(data, 10, 10, {
      threshold: 50,
      smoothing: 1,
      minAreaPx: 5,
    });
    expect(contours.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  sobelGradients                                                     */
/* ------------------------------------------------------------------ */

describe('sobelGradients', () => {
  it('detects vertical edge', () => {
    // 5x5 image: left half black, right half white
    const gray = new Uint8Array(25);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        gray[y * 5 + x] = x >= 3 ? 255 : 0;
      }
    }
    const { magnitude } = sobelGradients(gray, 5, 5);
    // center column (x=2) should have high gradient
    const centerMag = magnitude[2 * 5 + 2]; // (2,2)
    expect(centerMag).toBeGreaterThan(0);
  });

  it('returns zero for uniform image', () => {
    const gray = new Uint8Array(9).fill(100); // 3x3
    const { magnitude } = sobelGradients(gray, 3, 3);
    // inner pixel (1,1) should be 0
    expect(magnitude[4]).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  nonMaxSuppression                                                  */
/* ------------------------------------------------------------------ */

describe('nonMaxSuppression', () => {
  it('suppresses non-maximum pixels', () => {
    // 3x3: center is maximum, others are lower
    const magnitude = new Float32Array([10, 20, 10, 20, 100, 20, 10, 20, 10]);
    const direction = new Float32Array(9).fill(0); // horizontal gradient
    const result = nonMaxSuppression(magnitude, direction, 3, 3);
    // center should be kept
    expect(result[4]).toBe(100);
  });
});
