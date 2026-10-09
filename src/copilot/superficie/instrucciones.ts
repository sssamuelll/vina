/**
 * Lo que el agente lee antes de llamar a un verbo (spec 2026-10-09, P8): el MCP
 * lo da en `initialize.instructions`, y el agente de Vina lo recibirá igual
 * (spec 2026-10-05, D4). En inglés (D8). Solo dice lo que la superficie cumple.
 */
export const INSTRUCCIONES = [
  "Vina is a CAD for garment patterns, open in the user's browser. These tools read and change the pattern that is open right now.",
  'All lengths are in millimetres.',
  'Read before you act: read_pattern lists the pieces, their edges, seams and notches, with the ids the other tools take.',
  'Every answer carries the project revision. It goes up with every change: if it moved between two of your calls, someone else changed the pattern, so read it again.',
  'Every tool that changes the pattern returns a receipt. done is true only when the measured result confirms the change. done: false is an honest answer, not a crash: read its warnings; nothing was half-changed.',
  'Each change is one undo step for the user (Ctrl+Z). The undo tool reverts only steps made by an agent.',
  'A locked piece is never edited or removed: the tools that would do it answer done: false.',
  'The user works in Spanish: pieza = piece, costura = seam, piquete = notch, pinza = dart, patrón = pattern.',
].join('\n');
