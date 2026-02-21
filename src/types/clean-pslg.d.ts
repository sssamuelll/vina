/**
 * Type declarations for clean-pslg package
 * Planar Straight Line Graph (PSLG) cleaner
 */
declare module 'clean-pslg' {
  /**
   * Clean a Planar Straight Line Graph by removing self-intersections and T-junctions
   *
   * @param points - Array of 2D points [[x, y], ...] (modified in place)
   * @param edges - Array of constraint edges [[i, j], ...] (modified in place)
   * @returns True if cleaning was successful, false otherwise
   */
  function cleanPSLG(points: number[][], edges: number[][]): boolean;
  
  export = cleanPSLG;
}