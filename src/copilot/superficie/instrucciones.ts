/**
 * Lo que el agente lee antes de llamar a un verbo (spec 2026-10-09, P8): el MCP
 * lo da en `initialize.instructions`, y el agente de Vina lo recibirá igual
 * (spec 2026-10-05, D4). En inglés (D8). Solo dice lo que la superficie cumple.
 */
export const INSTRUCCIONES = [
  "Vina is a CAD for garment patterns, open in the user's browser. These tools read and change the pattern that is open right now.",
  'All lengths are in millimetres.',
  'Read before you act: read_pattern gives every piece with its edges and notches, and every seam; read_piece gives one piece in full (its points and internal lines). Use the ids they return.',
  'Every answer carries the project revision, which goes up with every change. A receipt gives revision.before and revision.after: if before is not the revision you last saw, someone else changed the pattern in between, so read it again. The revision starts again from 0 when the user reloads Vina.',
  'Every tool that changes the pattern returns a receipt. done is true only when the measured result confirms the change. done: false is an honest answer, not a crash: read its warnings; nothing was half-changed.',
  'Each change is one undo step for the user (Ctrl+Z). The undo tool reverts only steps made by an agent.',
  'A locked piece keeps its shape: the tools that would change its outline or internal lines, or remove it, answer done: false.',
  "The simulation runs in the user's browser and only advances while Vina is visible on screen. simulate waits for the cloth to settle and says why when it cannot; fit_map reads the result piece by piece.",
  'The user works in Spanish: pieza = piece, costura = seam, piquete = notch, pinza = dart, patrón = pattern.',
].join('\n');
