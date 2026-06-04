/**
 * Shared UI copy for DXF import errors. Lives in the component layer (not
 * in `utils/dxf`) because it holds user-facing Spanish strings — the
 * pipeline throws typed errors with `code`s; this maps them to toasts.
 * Used by both the canvas drop-zone (AppShell) and the chat attachment
 * (UnifiedBar).
 *
 * @module shell/dxfImport
 */

import { DXFFileError, DXFParseError } from '../../utils/dxf';
import type { PatternPiece } from '../../types/types';

/** A DXF attached to the chat input but not yet sent. Held in chat-local
 *  state (NOT a Redux slice): parsed at attach time, its pieces imported
 *  into the project only when the message is sent. Single consumer (send),
 *  single clear point — no double-import, no staging-slot lifecycle.
 *  See M3 spec §"Chat attachment (v3)". */
export interface PendingDXFAttachment {
  name: string;
  pieces: PatternPiece[];
}

/** Map a DXF import error (file-level or content-level) to toast copy. */
export function dxfErrorMessage(err: unknown): string {
  if (err instanceof DXFFileError) {
    switch (err.code) {
      case 'extension':
        return 'Solo acepto archivos .dxf';
      case 'too-large':
        return 'Ese DXF es muy grande (máx. 10 MB)';
      case 'read':
        return 'No pude leer el archivo';
    }
  }
  if (err instanceof DXFParseError) {
    return err.code === 'no-pieces'
      ? 'El archivo no tiene piezas reconocibles'
      : 'Ese DXF no se pudo interpretar';
  }
  return 'Error inesperado al importar el DXF';
}

/** "5 piezas" / "1 pieza" — shared pluralization for import toasts/chips. */
export function piecesLabel(count: number): string {
  return `${count} pieza${count === 1 ? '' : 's'}`;
}
