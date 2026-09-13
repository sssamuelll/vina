import type { EditableNode } from './nodeEditorUtils';
import { extractNodes } from './nodeEditorUtils';
import type { PatternPiece } from '../../types/types';
import { isSplineManaged, splineRunAt } from './splineSegment';

/** Única proyección de nodos que consumen el dibujo y el hit-test de V. */
export function editableCurveNodes(piece: PatternPiece): EditableNode[] {
  const managedCommands = new Set<number>();

  for (let index = 0; index < piece.outline.length; index++) {
    const run = splineRunAt(piece.outline, index);
    if (!run) continue;
    if (isSplineManaged(piece.outline, run)) {
      for (let commandIndex = run.start; commandIndex <= run.end; commandIndex++) {
        managedCommands.add(commandIndex);
      }
    }
    index = run.end;
  }

  return extractNodes(piece).map((node) => {
    const projected = { ...node };
    if (projected.cp1Ref && managedCommands.has(projected.cp1Ref.commandIndex)) {
      delete projected.cp1;
      delete projected.cp1Ref;
    }
    if (projected.cp2Ref && managedCommands.has(projected.cp2Ref.commandIndex)) {
      delete projected.cp2;
      delete projected.cp2Ref;
    }
    return projected;
  });
}
