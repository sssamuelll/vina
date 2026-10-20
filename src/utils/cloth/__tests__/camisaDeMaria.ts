/**
 * La camisa de María para las pruebas (tests/fixtures/garments/maria_patrones_samuel_2M.dxf): importada, clasificada,
 * cosida y mallada como en el simulador, con los pasos de implicito/banco/camiseta.ts.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { costurasDeMaria, mallarPiezas, MEDIDAS_DE_MARIA, piezasDeMaria } from '../implicito/banco/camiseta';
import { seamsToInitData } from '../../../components/Viewport3D/costurasDeLaSimulacion';
import type { PatternPiece, Seam } from '../../../types/types';

const DXF = resolve(__dirname, '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');

export { costurasDeMaria, MEDIDAS_DE_MARIA };

export function importarMariaClasificada(): PatternPiece[] {
  return piezasDeMaria(readFileSync(DXF, 'utf-8'));
}

/** El mismo mapeo que manda la app (costurasDeLaSimulacion.ts, seamsToInitData). */
export const aInitData = (costuras: Seam[]) => seamsToInitData(costuras);

/** Las piezas malladas con las opciones de SimulationInitClient.meshPiece, listas para seamInitDataToPairs. */
export const mallarParaCoser = mallarPiezas;
