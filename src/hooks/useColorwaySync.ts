import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { setFabric } from '../store/simulationSlice';
import { resolveColorway } from '../utils/colorwayResolver';
import { FABRIC_LIBRARY } from '../utils/cloth/fabricLibrary';

export function useColorwaySync(): void {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const colorways = useSelector((s: RootState) => s.project.colorways);
  const activeColorwayId = useSelector((s: RootState) => s.project.activeColorwayId);
  const pieceFabrics = useSelector((s: RootState) => s.simulation.pieceFabrics);
  const defaultFabricId = useSelector((s: RootState) => s.simulation.defaultFabricId);

  useEffect(() => {
    const fabricIds = new Set(Object.keys(FABRIC_LIBRARY));
    for (const piece of pieces) {
      const baseFabricId = pieceFabrics[piece.id] || defaultFabricId;
      const baseFabric = FABRIC_LIBRARY[baseFabricId];
      const fabricCode = (piece as { fabricCode?: string }).fabricCode ?? 'SELF';

      const resolved = resolveColorway(
        { fabricCode, fabricId: piece.fabricId },
        colorways,
        activeColorwayId,
        { [fabricCode]: { color: baseFabric?.color || '#cccccc', fabricId: baseFabricId } },
        fabricIds,
      );

      if (resolved.fabricId !== pieceFabrics[piece.id] && resolved.fabricId !== baseFabricId) {
        dispatch(setFabric({ pieceId: piece.id, fabricId: resolved.fabricId }));
      } else if (!activeColorwayId && pieceFabrics[piece.id] && pieceFabrics[piece.id] !== (piece.fabricId || defaultFabricId)) {
        // Restore base when colorway deactivated
        dispatch(setFabric({ pieceId: piece.id, fabricId: piece.fabricId || defaultFabricId }));
      }
    }
  }, [activeColorwayId, colorways, pieces, pieceFabrics, defaultFabricId, dispatch]);
}
