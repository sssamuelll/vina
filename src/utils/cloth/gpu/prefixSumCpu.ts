/**
 * Serial exclusive prefix sum — CPU reference matching the WGSL parallel scan.
 * Used for testing and as fallback.
 */
export function serialPrefixSum(input: Uint32Array, output: Uint32Array): void {
  let running = 0;
  for (let i = 0; i < input.length; i++) {
    output[i] = running;
    running += input[i];
  }
}
