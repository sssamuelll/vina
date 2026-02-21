/**
 * Type declarations for cdt2d package
 * Constrained Delaunay Triangulation implementation
 */
declare module 'cdt2d' {
  /**
   * Constrained Delaunay Triangulation
   *
   * @param points - Array of 2D points [[x, y], ...]
   * @param edges - Array of constraint edges [[i, j], ...] where i, j are point indices
   * @param options - Triangulation options
   * @returns Array of triangles [[i, j, k], ...] where i, j, k are point indices
   */
  function cdt2d(
    points: number[][],
    edges: number[][],
    options?: {
      /** Include exterior triangles (default: true) */
      exterior?: boolean;
      /** Include interior triangles (default: true) */
      interior?: boolean;
    }
  ): number[][];
  
  export = cdt2d;
}