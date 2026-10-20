import type { FabricComplianceConfig } from './gpu/tslBuffers';
import { getPhysicalFabric, toXPBDParams } from './physicalFabric';

/**
 * La compliance de la tela activa para el armado TSL. La rama WebGPU de la
 * cascada se la pasa al armado, y entra a la huella de la tela preparada:
 * quien la prepare por adelantado la saca de aquí también, o la huella no
 * coincide y la tela se vuelve a armar.
 *
 * #gummy STEP 3: wire the active fabric's BEND compliance to the GPU (was dead
 * data, omitted — like frictionBody pre-F0). Bend is the material's
 * drape/flexibility differentiator (silk soft, denim stiff), rescaled to the
 * live alpha band in STEP 1. GPU-ahead vs WASM/CPU (still on defaults) — A7
 * divergence.
 *
 * @returns undefined si la tela no está en la biblioteca: el armado usa la
 *   suya por defecto.
 */
export function complianceDeTela(fabricId: string): FabricComplianceConfig | undefined {
  const pf = getPhysicalFabric(fabricId);
  if (!pf) return undefined;
  const xpbd = toXPBDParams(pf);
  return {
    // Stretch stays RIGID (0.0): wiring the compliant fabric stretch
    // let edges compact and the sleeve recoil (verified @gpu-local —
    // sleeve ~6460 stable at 0.0 vs ~3590 at the fabric's 1e-6).
    // Stretch/shear differentiation (lycra) is a follow-up needing
    // two-sided strain handling; toXPBDParams already has them
    // rescaled+ready. Bend alone gives the drape differentiation.
    stretchComplianceWarp: 0.0,
    stretchComplianceWeft: 0.0,
    shearCompliance: 0.001,
    bendComplianceWarp: xpbd.bendComplianceWarp,
    bendComplianceWeft: xpbd.bendComplianceWeft,
    // P7-density: el peso GSM entra a la masa (invMass ∝ 1/ρ)
    // — antes solo tocaba damping y chiffon caía como lona.
    density: xpbd.density,
  };
}
