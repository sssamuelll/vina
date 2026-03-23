/** Default outline colors for layer indicators (indexed by layer number) */
export const DEFAULT_OUTLINE_COLORS: Record<number, string> = {
  0: '#4ade80',  // green – innermost / body
  1: '#60a5fa',  // blue  – default mid layer
  2: '#f97316',  // orange – outer shell
};

/** Get the outline color for a layer, with user overrides and auto-generated fallback */
export function getOutlineColor(layer: number, overrides: Record<number, string>): string {
  return overrides[layer] ?? DEFAULT_OUTLINE_COLORS[layer] ?? `hsl(${layer * 137.5}, 70%, 60%)`;
}
