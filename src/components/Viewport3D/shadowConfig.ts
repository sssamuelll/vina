/**
 * Shared shadow-map config for directional casters (the EnvironmentSetup key
 * light and CustomLights directionals). Ortho box fitted to a ~1.8m avatar at
 * the origin: ±1.5m lateral covers the A-pose silhouette (arm span ≈ ±0.8m in
 * light space). Tight frustum + 2048 map ⇒ ~1.5mm/texel so cloth folds read
 * crisply. bias/normalBias tuned against acne on the thin cloth shell without
 * visible peter-panning (verified on GPU real 2026-07-02). near/far are set
 * per-light — they depend on the light's distance to the origin.
 *
 * Own module (not exported from a component file) so react-refresh stays happy.
 */
export const DIR_SHADOW_PROPS = {
  'shadow-mapSize': [2048, 2048] as [number, number],
  'shadow-camera-left': -1.5,
  'shadow-camera-right': 1.5,
  'shadow-camera-top': 1.5,
  'shadow-camera-bottom': -1.5,
  'shadow-bias': -0.0001,
  'shadow-normalBias': 0.02,
};
