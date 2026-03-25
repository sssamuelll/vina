import { useEffect, useRef } from 'react';
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

  // Read pieceFabrics via ref to avoid re-triggering the effect when we dispatch
  // setFabric (which updates pieceFabrics). Without this, the effect would run twice
  // on every colorway switch: once to apply overrides, once to confirm they're set.
  const pieceFabricsRef = useRef(pieceFabrics);
  pieceFabricsRef.current = pieceFabrics;

  useEffect(() => {
    const fabricIds = new Set(Object.keys(FABRIC_LIBRARY));
    const currentPieceFabrics = pieceFabricsRef.current;

    for (const piece of pieces) {
      const baseFabricId = currentPieceFabrics[piece.id] || defaultFabricId;
      const baseFabric = FABRIC_LIBRARY[baseFabricId];
      const fabricCode = (piece as { fabricCode?: string }).fabricCode ?? 'SELF';

      const resolved = resolveColorway(
        { fabricCode, fabricId: piece.fabricId },
        colorways,
        activeColorwayId,
        { [fabricCode]: { color: baseFabric?.color || '#cccccc', fabricId: baseFabricId } },
        fabricIds,
      );

      if (resolved.fabricId !== currentPieceFabrics[piece.id] && resolved.fabricId !== baseFabricId) {
        dispatch(setFabric({ pieceId: piece.id, fabricId: resolved.fabricId }));
      } else if (!activeColorwayId && currentPieceFabrics[piece.id] && currentPieceFabrics[piece.id] !== (piece.fabricId || defaultFabricId)) {
        dispatch(setFabric({ pieceId: piece.id, fabricId: piece.fabricId || defaultFabricId }));
      }
    }
  }, [activeColorwayId, colorways, pieces, defaultFabricId, dispatch]);
}
