/**
 * Edge Detection Pure Functions for Auto-Trace (#430)
 *
 * Implements the Canny edge detection pipeline, Moore-Neighbor contour tracing,
 * and Douglas-Peucker polyline simplification. All functions are pure — no DOM,
 * no canvas, no Web Worker code.
 */

/* ------------------------------------------------------------------ */
/*  1. toGrayscale                                                     */
/* ------------------------------------------------------------------ */

/**
 * Convert RGBA pixel data to grayscale using luminance formula.
 * Formula: 0.299*R + 0.587*G + 0.114*B
 */
export function toGrayscale(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const size = width * height;
  const gray = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const offset = i * 4;
    gray[i] = Math.round(
      0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2],
    );
  }
  return gray;
}

/* ------------------------------------------------------------------ */
/*  2. gaussianBlur                                                    */
/* ------------------------------------------------------------------ */

/**
 * Apply Gaussian blur using a 1D separable kernel (horizontal + vertical pass).
 * Kernel size = 2*radius + 1, sigma = radius / 2. Clamps at edges.
 */
export function gaussianBlur(
  gray: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  if (radius <= 0) return new Uint8Array(gray);

  const sigma = radius / 2;
  const kernelSize = 2 * radius + 1;
  const kernel = new Float32Array(kernelSize);

  // Build 1D Gaussian kernel
  let sum = 0;
  for (let i = 0; i < kernelSize; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  // Normalize
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= sum;
  }

  const size = width * height;
  const temp = new Float32Array(size);
  const result = new Uint8Array(size);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.max(0, Math.min(width - 1, x + k));
        acc += gray[y * width + sx] * kernel[k + radius];
      }
      temp[y * width + x] = acc;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.max(0, Math.min(height - 1, y + k));
        acc += temp[sy * width + x] * kernel[k + radius];
      }
      result[y * width + x] = Math.round(Math.max(0, Math.min(255, acc)));
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  3. sobelGradients                                                  */
/* ------------------------------------------------------------------ */

/**
 * Apply 3x3 Sobel kernels to compute gradient magnitude and direction.
 * Returns magnitude (sqrt(gx^2 + gy^2)) and direction (atan2(gy, gx)) as Float32Arrays.
 */
export function sobelGradients(
  gray: Uint8Array,
  width: number,
  height: number,
): { magnitude: Float32Array; direction: Float32Array } {
  const size = width * height;
  const magnitude = new Float32Array(size);
  const direction = new Float32Array(size);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      // Sobel Gx kernel: [[-1,0,1],[-2,0,2],[-1,0,1]]
      const gx =
        -gray[(y - 1) * width + (x - 1)] +
        gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] +
        2 * gray[y * width + (x + 1)] +
        -gray[(y + 1) * width + (x - 1)] +
        gray[(y + 1) * width + (x + 1)];

      // Sobel Gy kernel: [[-1,-2,-1],[0,0,0],[1,2,1]]
      const gy =
        -gray[(y - 1) * width + (x - 1)] +
        -2 * gray[(y - 1) * width + x] +
        -gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] +
        2 * gray[(y + 1) * width + x] +
        gray[(y + 1) * width + (x + 1)];

      const idx = y * width + x;
      magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
      direction[idx] = Math.atan2(gy, gx);
    }
  }

  return { magnitude, direction };
}

/* ------------------------------------------------------------------ */
/*  4. nonMaxSuppression                                               */
/* ------------------------------------------------------------------ */

/**
 * Thin edges by suppressing non-maximum pixels along the gradient direction.
 * Quantizes direction to 4 angles (0, 45, 90, 135) and checks two neighbors.
 */
export function nonMaxSuppression(
  magnitude: Float32Array,
  direction: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const size = width * height;
  const result = new Float32Array(size);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const mag = magnitude[idx];

      // Quantize angle to 0, 45, 90, 135 degrees
      // atan2 returns [-PI, PI], normalize to [0, PI)
      let angle = direction[idx];
      if (angle < 0) angle += Math.PI;

      let n1 = 0;
      let n2 = 0;

      // 0 degrees (horizontal edge, compare left-right)
      if ((angle >= 0 && angle < Math.PI / 8) || angle >= (7 * Math.PI) / 8) {
        n1 = magnitude[y * width + (x + 1)];
        n2 = magnitude[y * width + (x - 1)];
      }
      // 45 degrees (compare top-right, bottom-left)
      else if (angle >= Math.PI / 8 && angle < (3 * Math.PI) / 8) {
        n1 = magnitude[(y - 1) * width + (x + 1)];
        n2 = magnitude[(y + 1) * width + (x - 1)];
      }
      // 90 degrees (vertical edge, compare top-bottom)
      else if (angle >= (3 * Math.PI) / 8 && angle < (5 * Math.PI) / 8) {
        n1 = magnitude[(y - 1) * width + x];
        n2 = magnitude[(y + 1) * width + x];
      }
      // 135 degrees (compare top-left, bottom-right)
      else {
        n1 = magnitude[(y - 1) * width + (x - 1)];
        n2 = magnitude[(y + 1) * width + (x + 1)];
      }

      result[idx] = mag >= n1 && mag >= n2 ? mag : 0;
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  5. hysteresisThreshold                                             */
/* ------------------------------------------------------------------ */

/**
 * Double-threshold with hysteresis. Strong pixels (above highThreshold) are kept.
 * Weak pixels (between lowThreshold and highThreshold) are kept only if connected
 * to a strong pixel via 8-connectivity flood fill.
 */
export function hysteresisThreshold(
  suppressed: Float32Array,
  width: number,
  height: number,
  highThreshold: number,
  lowThreshold: number,
): Uint8Array {
  const size = width * height;
  const result = new Uint8Array(size);

  // Mark strong and weak pixels
  const STRONG = 255;
  const WEAK = 128;

  for (let i = 0; i < size; i++) {
    if (suppressed[i] >= highThreshold) {
      result[i] = STRONG;
    } else if (suppressed[i] >= lowThreshold) {
      result[i] = WEAK;
    }
    // else 0 (already initialized)
  }

  // Flood-fill from strong pixels to promote connected weak pixels
  // Use a stack-based approach for 8-connectivity
  const stack: number[] = [];

  // Collect all strong pixels
  for (let i = 0; i < size; i++) {
    if (result[i] === STRONG) {
      stack.push(i);
    }
  }

  // 8-connectivity offsets
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

  while (stack.length > 0) {
    const idx = stack.pop()!;
    const x = idx % width;
    const y = (idx - x) / width;

    for (let d = 0; d < 8; d++) {
      const nx = x + dx[d];
      const ny = y + dy[d];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        if (result[nIdx] === WEAK) {
          result[nIdx] = STRONG;
          stack.push(nIdx);
        }
      }
    }
  }

  // Remove remaining weak pixels
  for (let i = 0; i < size; i++) {
    if (result[i] !== STRONG) {
      result[i] = 0;
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  6. traceContours                                                   */
/* ------------------------------------------------------------------ */

/** Compute area of a polygon using the shoelace formula. */
function shoelaceArea(points: { x: number; y: number }[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Moore-Neighbor contour tracing on a binary edge map.
 * For each unvisited edge pixel, walk the contour boundary using 8-connectivity.
 * Returns contours sorted by area descending. Filters contours with < 10 points.
 */
export function traceContours(
  edgeMap: Uint8Array,
  width: number,
  height: number,
): { x: number; y: number }[][] {
  const visited = new Uint8Array(width * height);
  const contours: { x: number; y: number }[][] = [];

  // 8-connectivity neighbors in clockwise order starting from right
  // (1,0), (1,1), (0,1), (-1,1), (-1,0), (-1,-1), (0,-1), (1,-1)
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (edgeMap[idx] !== 255 || visited[idx]) continue;

      // Start a new contour from this edge pixel
      const contour: { x: number; y: number }[] = [];

      // Moore-Neighbor tracing
      const startX = x;
      const startY = y;
      let cx = x;
      let cy = y;

      // Initial backtrack direction: come from left (direction 4 = (-1,0))
      // so we start scanning from direction 5
      let backtrackDir = 4;

      let done = false;
      let steps = 0;
      const maxSteps = width * height * 2; // safety limit

      do {
        visited[cy * width + cx] = 1;
        contour.push({ x: cx, y: cy });

        // Scan neighbors clockwise starting from (backtrackDir + 1) % 8
        let found = false;
        const startDir = (backtrackDir + 1) % 8;

        for (let d = 0; d < 8; d++) {
          const dir = (startDir + d) % 8;
          const nx = cx + dx[dir];
          const ny = cy + dy[dir];

          if (nx >= 0 && nx < width && ny >= 0 && ny < height && edgeMap[ny * width + nx] === 255) {
            // Move to this neighbor
            // Backtrack direction is opposite: (dir + 4) % 8
            backtrackDir = (dir + 4) % 8;
            cx = nx;
            cy = ny;
            found = true;
            break;
          }
        }

        if (!found) {
          // Isolated pixel or dead end
          done = true;
        } else if (cx === startX && cy === startY) {
          // Back to start
          done = true;
        }

        steps++;
        if (steps >= maxSteps) done = true;
      } while (!done);

      if (contour.length >= 10) {
        contours.push(contour);
      }
    }
  }

  // Sort by area descending
  contours.sort((a, b) => shoelaceArea(b) - shoelaceArea(a));

  return contours;
}

/* ------------------------------------------------------------------ */
/*  7. douglasPeucker                                                  */
/* ------------------------------------------------------------------ */

/** Perpendicular distance from a point to a line segment. */
function perpendicularDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
): number {
  const dxLine = lineEnd.x - lineStart.x;
  const dyLine = lineEnd.y - lineStart.y;
  const lenSq = dxLine * dxLine + dyLine * dyLine;

  if (lenSq === 0) {
    // lineStart === lineEnd, distance to that point
    const ddx = point.x - lineStart.x;
    const ddy = point.y - lineStart.y;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }

  // Distance from point to infinite line
  const dist =
    Math.abs(dxLine * (lineStart.y - point.y) - (lineStart.x - point.x) * dyLine) /
    Math.sqrt(lenSq);
  return dist;
}

/**
 * Douglas-Peucker polyline simplification.
 * Recursively removes points within epsilon distance of the line between endpoints.
 */
export function douglasPeucker(
  points: { x: number; y: number }[],
  epsilon: number,
): { x: number; y: number }[] {
  if (points.length <= 2) return points.slice();

  // Find point with maximum distance from line between first and last
  let maxDist = 0;
  let maxIdx = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    // Recursively simplify both halves
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    // Merge (remove duplicate point at join)
    return left.slice(0, -1).concat(right);
  } else {
    // All intermediate points are within epsilon, keep only endpoints
    return [first, last];
  }
}

/* ------------------------------------------------------------------ */
/*  8. detectEdges (orchestrator)                                      */
/* ------------------------------------------------------------------ */

/**
 * High-level edge detection pipeline.
 * 1. Grayscale  2. Gaussian blur  3. Sobel gradients
 * 4. Non-max suppression  5. Hysteresis threshold  6. Contour tracing
 * 7. Area filter  8. Sort by area  9. Douglas-Peucker simplification
 */
export function detectEdges(
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  options: { threshold: number; smoothing: number; minAreaPx: number },
): { x: number; y: number }[][] {
  // 1. Grayscale
  const gray = toGrayscale(imageData, width, height);

  // 2. Gaussian blur
  const blurred = gaussianBlur(gray, width, height, options.smoothing);

  // 3. Sobel gradients
  const { magnitude, direction } = sobelGradients(blurred, width, height);

  // 4. Non-max suppression
  const suppressed = nonMaxSuppression(magnitude, direction, width, height);

  // 5. Hysteresis threshold
  const high = options.threshold;
  const low = high * 0.4;
  const edges = hysteresisThreshold(suppressed, width, height, high, low);

  // 6. Trace contours
  const contours = traceContours(edges, width, height);

  // 7. Filter by minAreaPx
  const filtered = contours.filter((c) => shoelaceArea(c) >= options.minAreaPx);

  // 8. Sort by area descending (already done in traceContours, but re-sort after filter)
  filtered.sort((a, b) => shoelaceArea(b) - shoelaceArea(a));

  // 9. Douglas-Peucker simplification (epsilon = 1.5)
  const simplified = filtered.map((contour) => douglasPeucker(contour, 1.5));

  return simplified;
}
