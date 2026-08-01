/**
 * Settle-tether off-switch (B1, plan drape profesional 2026-07-02).
 *
 * Semántica: SUPRIMIR LA CAPTURA — con el flag en 'true', GarmentSimulation
 * nunca dispara `recaptureTetherTargetsFromGpu`, así que `tetherReady` nunca
 * se arma y el kernel tether nunca entra a substepNodes. No libera targets ya
 * capturados (leer el flag pasa solo por el guard de captura, que dispara una
 * única vez por mount).
 *
 * Consumidor principal: el gate Cusick virtual (B2) — mide un drape de disco
 * a 5 s de settle, y el tether capturaría/congelaría la pose a 2.5 s,
 * arrestando exactamente el drape que el gate existe para medir. También
 * sirve como escape hatch de debugging (espejo de 'vina-use-webgpu').
 *
 * Opt-in disable: default = tether ON; solo el literal 'true' lo apaga.
 */
import { safeGetItem } from '../../utils/safeStorage';

export const TETHER_DISABLED_FLAG_KEY = 'vina-tether-disabled';

export function isTetherDisabled(): boolean {
  return safeGetItem(TETHER_DISABLED_FLAG_KEY) === 'true';
}
