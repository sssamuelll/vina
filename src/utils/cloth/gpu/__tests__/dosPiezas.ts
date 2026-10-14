/**
 * Prenda 1 de los tests del armado TSL: dos quads con costura y una tela propia.
 * La comparten `prepararTela.test.ts` (sus huellas fijadas salen de estos
 * valores exactos), `telasPreparadas.test.ts` y `huella.test.ts`. Sin three:
 * de gpuSolverClient, seamPairs y tslBuffers solo entran tipos.
 */

import type { PieceMeshData } from '../gpuSolverClient';
import type { SeamPair } from '../../seamPairs';
import type { FabricComplianceConfig } from '../tslBuffers';

/** Quad de 4 vértices (2 triángulos), con UV para clasificar las aristas. */
export function makeQuadPiece(id: string): PieceMeshData {
  return {
    pieceId: id,
    vertices: new Float32Array([
      -0.5, 1.0, 0.0,
       0.5, 1.0, 0.0,
       0.5, 0.0, 0.0,
      -0.5, 0.0, 0.0,
    ]),
    triIds: new Int32Array([0, 1, 2, 0, 2, 3]),
    uvs: new Float32Array([0, 1,  1, 1,  1, 0,  0, 0]),
  };
}

/** El quad corrido +dx en x del mundo: los índices locales no cambian. */
export function makeQuadPieceAt(id: string, dx: number): PieceMeshData {
  const p = makeQuadPiece(id);
  for (let i = 0; i < p.vertices.length; i += 3) p.vertices[i] += dx;
  return p;
}

export const dosPiezas = () => [makeQuadPiece('A'), makeQuadPieceAt('B', 0.3)];

// Las dos costuras del behavior #11 de gpuSolverClient.test.ts (un par sembrado
// a 0,3 × 0,5; dos pares que comparten el vértice 0 de B y se parten en dos
// colores) y dos que ese bloque no trae: el borde 1-2 de A contra el 0-3 de B,
// dos pares seguidos sobre aristas de frontera, que es lo que arma un quad
// entre piezas; y una que apunta a una pieza que no existe, que el armado
// salta con un aviso.
export const COSTURAS = [
  { pieceAId: 'A', pieceBId: 'B', vertexPairs: [[0, 0]], compliance: 0.0001, tensionFactor: 0.5 },
  { pieceAId: 'A', pieceBId: 'B', vertexPairs: [[0, 0], [1, 0]], compliance: 0.0001, tensionFactor: 1.0 },
  { pieceAId: 'A', pieceBId: 'B', vertexPairs: [[1, 0], [2, 3]], compliance: 0.0002, tensionFactor: 0.9 },
  { pieceAId: 'A', pieceBId: 'fantasma', vertexPairs: [[3, 3]], compliance: 0.0001, tensionFactor: 1.0 },
] as unknown as SeamPair[];

// Tela propia con densidad: la masa pasa por fabricInvMassScale, y urdimbre,
// trama y sesgo llevan cada uno su valor, así cada mapeo deja su marca. La
// camisa de María va con la tela por defecto: sin banda F3, su flexión sale
// del default que el armado le pasa a createTslBuffers.
export const TELA: FabricComplianceConfig = {
  stretchComplianceWarp: 1e-6,
  stretchComplianceWeft: 2e-6,
  shearCompliance: 0.002,
  bendComplianceWarp: 1.2e4,
  bendComplianceWeft: 3e4,
  density: 0.2,
};
