/**
 * Placement Worker — offloads vertex transforms from main thread.
 *
 * Takes meshed pieces + placement data, applies rotation + translation
 * to every vertex, returns transformed arrays. Pure math, no Three.js.
 *
 * @module placementWorker
 */

// ─── Message Types ──────────────────────────────────────────────────────────

export interface PlacementRequest {
  type: 'transform';
  pieces: Array<{
    pieceId: string;
    vertices: number[];
    triIds: number[];
    outline: Array<{ type: string; values: number[] }>;
    // Euler rotation [rx, ry, rz] radians
    rotation: [number, number, number];
    // Translation [x, y, z]
    position: [number, number, number];
  }>;
}

export interface PlacementResponse {
  type: 'transformed';
  pieces: Array<{
    pieceId: string;
    vertices: number[];
    triIds: number[];
    outline: Array<{ type: string; values: number[] }>;
  }>;
}

export type PlacementWorkerMsg = PlacementRequest;
export type PlacementWorkerResp = PlacementResponse;

// ─── Pure math rotation (no Three.js dependency) ────────────────────────────

function applyEulerXYZ(
  vx: number, vy: number, vz: number,
  rx: number, ry: number, rz: number,
): [number, number, number] {
  // Rotate X
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const y1 = vy * cx - vz * sx;
  const z1 = vy * sx + vz * cx;
  // Rotate Y
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const x2 = vx * cy + z1 * sy;
  const z2 = -vx * sy + z1 * cy;
  // Rotate Z
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const x3 = x2 * cz - y1 * sz;
  const y3 = x2 * sz + y1 * cz;
  return [x3, y3, z2];
}

// ─── Worker Handler ─────────────────────────────────────────────────────────

const ctx = self as unknown as Worker;

ctx.addEventListener('message', (event: MessageEvent<PlacementWorkerMsg>) => {
  const msg = event.data;

  if (msg.type === 'transform') {
    const result: PlacementResponse['pieces'] = [];

    for (const p of msg.pieces) {
      const numVerts = p.vertices.length / 3;
      const transformed = new Array<number>(p.vertices.length);
      const [rx, ry, rz] = p.rotation;
      const [px, py, pz] = p.position;

      for (let i = 0; i < numVerts; i++) {
        const [x, y, z] = applyEulerXYZ(
          p.vertices[i * 3], p.vertices[i * 3 + 1], p.vertices[i * 3 + 2],
          rx, ry, rz,
        );
        transformed[i * 3] = x + px;
        transformed[i * 3 + 1] = y + py;
        transformed[i * 3 + 2] = z + pz;
      }

      result.push({
        pieceId: p.pieceId,
        vertices: transformed,
        triIds: p.triIds,
        outline: p.outline,
      });
    }

    const resp: PlacementResponse = { type: 'transformed', pieces: result };
    ctx.postMessage(resp);
  }
});
