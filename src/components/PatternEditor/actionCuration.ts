/**
 * actionCuration — tabla declarativa de acciones contextuales del PatternEditor 2D.
 *
 * Módulo ÚNICO que ambas superficies consumen (mandato del dueño):
 *  - ACTIONS  → registro de verbos EXISTENTES (propiedad de ingeniería).
 *  - CURATION → tabla de ranking/selección por contexto (propiedad de María).
 * Curar = editar filas de CURATION; nunca tocar componentes.
 *
 * Surface B (menú derecho) consume `resolveMenuActions`. Surface A (barra) —
 * diferida hasta el merge de T1–T5 — consumirá `resolveBarActions`. La columna
 * `bar` ya está autorada (data lista, apagada por BAR_ENABLED_KINDS) para que
 * Surface A la lea sin cirugía.
 */
import type { AppDispatch } from '../../store';
import type { PatternPiece, InternalLine, InternalLineType, Seam, PieceGroup } from '../../types/types';
import type { WorkflowStage } from '../../store/selectors';
import type { SubMenuItem } from '../shared/SubMenu';
import {
  removePiece, removeSeam, reverseSeam, rotatePiece, duplicatePiece,
  flipPieceH, flipPieceV, linkPieces, unlinkPieces, cloneAsLinked,
  bringToFront, sendToBack, bringForward, sendBackward, lockPiece, unlockPiece,
  addPiece, createGroup, addPiecesToGroup, removePiecesFromGroup, deactivatePiece,
  setLayer, setSublayer, cloneToLayer, removeInternalLine,
} from '../../store/projectSlice';
import { selectPiece, clearSelection, copyPieces, createPastedPieces, enterSuperimposePickMode } from '../../store/editorSlice';
import { dispatchInspectPiece } from '../../store/inspectorSlice';

// ── Vocabulario ──────────────────────────────────────────────────────────────

export type TargetKind =
  | 'piece' | 'multiPiece' | 'seam'
  | 'il.notch' | 'il.grainline' | 'il.fold' | 'il.dart' | 'il.other'
  | 'point.node' | 'point.segment' | 'emptyCanvas';

export type GroupId = 'clipboard' | 'transform' | 'order' | 'organize' | 'linked' | 'identity' | 'danger';

/** Orden fijo de grupos del menú (§2.2). El renderer emite un separador SOLO
 *  entre grupos presentes → N grupos = N−1 separadores, ninguno vacío. */
export const GROUP_ORDER: GroupId[] = ['clipboard', 'transform', 'order', 'organize', 'linked', 'identity', 'danger'];

export type ActionId =
  | 'copy' | 'paste' | 'pasteMirror'
  | 'rotate90' | 'flipH' | 'flipV'
  | 'reverseSeam' | 'unfold' | 'unfoldOutlineOnly' | 'offsetInternalLine' | 'optimizeCurves' | 'convertSegment'
  | 'order' | 'layer' | 'lockToggle' | 'activeToggle' | 'groupCreate' | 'addToGroup' | 'removeFromGroup'
  | 'unlinkPieces' | 'selectLinkedPartner' | 'linkSymmetry' | 'linkInstance' | 'cloneLinkedSymmetry' | 'cloneLinkedInstance'
  | 'duplicate' | 'duplicateAll' | 'rename' | 'properties' | 'select' | 'inspect' | 'selectPieceOfLine' | 'selectSeamA' | 'selectSeamB' | 'zoomToFit'
  | 'deletePiece' | 'deleteSeam' | 'deleteInternalLine';

/** Callbacks que Surface B pasa como props (verbos que no son dispatches puros). */
export interface CurationCallbacks {
  onRename?: (pieceId: string) => void;
  onConvertSegment?: (commandIndex: number, toCurve: boolean) => void;
  onZoomToFit?: () => void;
  onUnfold?: (pieceId: string, foldLineId: string, outlineOnly?: boolean) => void;
  onOffsetInternalLine?: (pieceId: string, lineId: string) => void;
  onOptimizeCurves?: (pieceId: string, lineId?: string) => void;
  onOpenProperties?: (pieceId: string) => void;
}

/** Contexto resuelto que consumen gate/label/run/submenu. Lo arma cada superficie
 *  a partir de su fuente (hit-test en B; selección en A). */
export interface CurationCtx {
  dispatch: AppDispatch;
  targetKind: TargetKind;
  stage: WorkflowStage;
  altitude: 'body' | 'point';
  pieceId: string | null;
  piece: PatternPiece | null;
  selectedPieceIds: string[];
  seamId: string | null;
  seam: Seam | null;
  internalLineId: string | null;
  internalLineType: InternalLineType | null;
  internalLine: InternalLine | null;
  segmentIndex?: number;
  segmentIsCurve?: boolean;
  clipboard: { pieces: PatternPiece[] } | null;
  groups: PieceGroup[];
  pieces: PatternPiece[];
  cb: CurationCallbacks;
  onClose: () => void;
}

export interface ActionDef {
  id: ActionId;
  label: string | ((ctx: CurationCtx) => string);
  icon: string;
  shortcut?: string;
  group: GroupId;
  danger?: boolean;
  /** Precondición. Si devuelve false, el ítem se OCULTA (hide-not-disable, §4). */
  gate?: (ctx: CurationCtx) => boolean;
  /** Verbo (dispatch/callback existente). El renderer llama run(ctx) y luego onClose. */
  run: (ctx: CurationCtx) => void;
  /** Si está presente, el ítem se renderiza como SubMenu (Orden/Capa/Grupos). */
  submenu?: (ctx: CurationCtx) => SubMenuItem[];
}

export interface CurationRow {
  targetKind: TargetKind;
  stage: WorkflowStage | '*';
  altitude: 'body' | 'point' | '*';
  bar: ActionId[];
  menu: ActionId[];
}

export const BAR_MAX_VISIBLE = 5;
/** En v1 la barra solo monta para pieza/multi (cabalga el transform box de T2).
 *  Las demás filas traen su `bar` autorada pero apagada — flip para v2 sin cirugía. */
export const BAR_ENABLED_KINDS = new Set<TargetKind>(['piece', 'multiPiece']);

// ── Gates compartidos ──────────────────────────────────────────────────────

const notLocked = (ctx: CurationCtx) => !ctx.piece?.locked;
const hasClipboard = (ctx: CurationCtx) => !!ctx.clipboard;
const isLinked = (ctx: CurationCtx) => !!ctx.piece?.linkedPieceId;
const twoSelected = (ctx: CurationCtx) => !ctx.piece?.linkedPieceId && ctx.selectedPieceIds.length === 2;
const cloneable = (ctx: CurationCtx) => !ctx.piece?.linkedPieceId && ctx.selectedPieceIds.length !== 2;
const canAddToGroup = (ctx: CurationCtx) => !!ctx.pieceId && ctx.groups.some(g => !g.pieceIds.includes(ctx.pieceId!));
const canRemoveFromGroup = (ctx: CurationCtx) => !!ctx.pieceId && ctx.groups.some(g => g.pieceIds.includes(ctx.pieceId!));
const seamBothConnected = (ctx: CurationCtx) => !!(ctx.seam?.pieceA.pieceId && ctx.seam?.pieceB.pieceId);
const hasCurveCmds = (ctx: CurationCtx) => !!ctx.internalLine?.path.some(c => c.type === 'C' || c.type === 'Q');

const pasteRun = (mirror: boolean) => (ctx: CurationCtx) => {
  if (!ctx.clipboard) return;
  createPastedPieces(ctx.clipboard, mirror).forEach(p => ctx.dispatch(addPiece(p)));
};
const seamPartnerName = (ctx: CurationCtx, side: 'A' | 'B') => {
  const id = side === 'A' ? ctx.seam?.pieceA.pieceId : ctx.seam?.pieceB.pieceId;
  return ctx.pieces.find(p => p.id === id)?.name || (side === 'A' ? 'Pieza A' : 'Pieza B');
};
const ilDeleteLabel = (ctx: CurationCtx) => {
  switch (ctx.internalLineType) {
    case 'notch': return 'Eliminar piquete';
    case 'grainline': return 'Eliminar hilo';
    case 'dart': return 'Eliminar pinza';
    default: return 'Eliminar';
  }
};

// ── ACTIONS: id → verbo existente (procedencia entre paréntesis) ─────────────

export const ACTIONS: Record<ActionId, ActionDef> = {
  // clipboard
  copy: { id: 'copy', group: 'clipboard', icon: '📄', label: 'Copiar', shortcut: 'Ctrl+C',
    run: (ctx) => { if (ctx.piece) ctx.dispatch(copyPieces({ pieces: [ctx.piece] })); } },              // editorSlice.copyPieces
  paste: { id: 'paste', group: 'clipboard', icon: '📋', label: 'Pegar', shortcut: 'Ctrl+V',
    gate: hasClipboard, run: pasteRun(false) },                                                          // editorSlice.createPastedPieces + projectSlice.addPiece
  pasteMirror: { id: 'pasteMirror', group: 'clipboard', icon: '🪞', label: 'Pegar en espejo', shortcut: 'Ctrl+R',
    gate: hasClipboard, run: pasteRun(true) },

  // transform (mutadores de geometría → gate !locked, F2)
  rotate90: { id: 'rotate90', group: 'transform', icon: '↻', label: 'Rotar 90°', shortcut: 'R',
    gate: notLocked, run: (ctx) => ctx.dispatch(rotatePiece({ id: ctx.pieceId!, rotation: (ctx.piece?.rotation ?? 0) + 90 })) }, // projectSlice.rotatePiece
  flipH: { id: 'flipH', group: 'transform', icon: '↔', label: 'Voltear horizontal', shortcut: 'H',
    gate: notLocked, run: (ctx) => ctx.dispatch(flipPieceH(ctx.pieceId!)) },                             // projectSlice.flipPieceH
  flipV: { id: 'flipV', group: 'transform', icon: '↕', label: 'Voltear vertical', shortcut: 'V',
    gate: notLocked, run: (ctx) => ctx.dispatch(flipPieceV(ctx.pieceId!)) },                             // projectSlice.flipPieceV
  reverseSeam: { id: 'reverseSeam', group: 'transform', icon: '↔', label: 'Invertir dirección de costura', shortcut: 'Ctrl+B',
    run: (ctx) => ctx.dispatch(reverseSeam(ctx.seamId!)) },                                              // projectSlice.reverseSeam
  unfold: { id: 'unfold', group: 'transform', icon: '⇔', label: 'Desplegar',
    run: (ctx) => ctx.cb.onUnfold?.(ctx.pieceId!, ctx.internalLineId!) },                                // Surface B prop
  unfoldOutlineOnly: { id: 'unfoldOutlineOnly', group: 'transform', icon: '⇔', label: 'Desplegar solo el contorno',
    run: (ctx) => ctx.cb.onUnfold?.(ctx.pieceId!, ctx.internalLineId!, true) },
  offsetInternalLine: { id: 'offsetInternalLine', group: 'transform', icon: '⏛', label: 'Offset como línea interna',
    run: (ctx) => ctx.cb.onOffsetInternalLine?.(ctx.pieceId!, ctx.internalLineId!) },
  optimizeCurves: { id: 'optimizeCurves', group: 'transform', icon: '◇', label: 'Optimizar puntos de curva',
    gate: hasCurveCmds, run: (ctx) => ctx.cb.onOptimizeCurves?.(ctx.pieceId!, ctx.internalLineId!) },
  convertSegment: { id: 'convertSegment', group: 'transform', icon: '⌒',
    label: (ctx) => (ctx.segmentIsCurve ? 'Convertir en línea' : 'Convertir en curva'),
    run: (ctx) => ctx.cb.onConvertSegment?.(ctx.segmentIndex!, !ctx.segmentIsCurve) },

  // order (submenú z-order — colapsa 4 ítems planos en uno)
  order: { id: 'order', group: 'order', icon: '⇅', label: 'Orden', run: () => {},
    submenu: (ctx) => [
      { label: 'Traer al frente', action: () => { ctx.dispatch(bringToFront(ctx.pieceId!)); ctx.onClose(); } },     // projectSlice.bringToFront
      { label: 'Adelantar', action: () => { ctx.dispatch(bringForward(ctx.pieceId!)); ctx.onClose(); } },           // bringForward
      { label: 'Atrasar', action: () => { ctx.dispatch(sendBackward(ctx.pieceId!)); ctx.onClose(); } },             // sendBackward
      { label: 'Enviar al fondo', action: () => { ctx.dispatch(sendToBack(ctx.pieceId!)); ctx.onClose(); } },       // sendToBack
    ] },

  // organize
  layer: { id: 'layer', group: 'organize', icon: '\u{1F4D1}', label: 'Capa', run: () => {},
    submenu: (ctx) => {
      const pid = ctx.pieceId!;
      return [
        { label: `Cambiar capa... (${ctx.piece?.layer ?? 1})`, action: () => { ctx.dispatch(setLayer({ pieceId: pid, layer: ((ctx.piece?.layer ?? 1) % 10) + 1 })); ctx.onClose(); } },       // setLayer
        { label: `Cambiar subcapa... (${ctx.piece?.sublayer ?? 0})`, action: () => { ctx.dispatch(setSublayer({ pieceId: pid, sublayer: ((ctx.piece?.sublayer ?? 0) + 1) % 5 })); ctx.onClose(); } }, // setSublayer
        { separator: true, label: 'Clonar encima', action: () => { ctx.dispatch(cloneToLayer({ pieceId: pid, direction: 'over' })); ctx.onClose(); } },                                        // cloneToLayer
        { label: 'Clonar debajo', action: () => { ctx.dispatch(cloneToLayer({ pieceId: pid, direction: 'under' })); ctx.onClose(); } },
        { separator: true, label: 'Superponer encima...', action: () => { ctx.dispatch(enterSuperimposePickMode({ sourcePieceId: pid, mode: 'over' })); ctx.onClose(); } },                     // enterSuperimposePickMode
        { label: 'Superponer debajo...', action: () => { ctx.dispatch(enterSuperimposePickMode({ sourcePieceId: pid, mode: 'under' })); ctx.onClose(); } },
        { label: 'Superponer al lado...', action: () => { ctx.dispatch(enterSuperimposePickMode({ sourcePieceId: pid, mode: 'side' })); ctx.onClose(); } },
      ];
    } },
  lockToggle: { id: 'lockToggle', group: 'organize', icon: '🔒',
    label: (ctx) => (ctx.piece?.locked ? 'Desbloquear' : 'Bloquear'),
    run: (ctx) => ctx.dispatch(ctx.piece?.locked ? unlockPiece(ctx.pieceId!) : lockPiece(ctx.pieceId!)) },  // lock/unlockPiece — NUNCA gateado por locked (escape hatch)
  activeToggle: { id: 'activeToggle', group: 'organize', icon: '⏸',
    label: (ctx) => (ctx.piece?.active === false ? 'Activar pieza' : 'Desactivar pieza'),
    run: (ctx) => ctx.dispatch(deactivatePiece({ pieceId: ctx.pieceId!, active: ctx.piece?.active === false })) }, // deactivatePiece
  groupCreate: { id: 'groupCreate', group: 'organize', icon: '📁', label: 'Crear grupo con la selección',
    run: (ctx) => {
      const ids = ctx.selectedPieceIds.length > 0 ? ctx.selectedPieceIds : [ctx.pieceId!];
      ctx.dispatch(createGroup({ name: `Grupo ${ctx.groups.length + 1}`, pieceIds: ids }));                  // createGroup
    } },
  addToGroup: { id: 'addToGroup', group: 'organize', icon: '+', label: 'Agregar a grupo', gate: canAddToGroup, run: () => {},
    submenu: (ctx) => ctx.groups.filter(g => !g.pieceIds.includes(ctx.pieceId!)).map(g => ({
      label: `Agregar a "${g.name}"`, action: () => { ctx.dispatch(addPiecesToGroup({ groupId: g.id, pieceIds: [ctx.pieceId!] })); ctx.onClose(); },  // addPiecesToGroup
    })) },
  removeFromGroup: { id: 'removeFromGroup', group: 'organize', icon: '−', label: 'Quitar de grupo', gate: canRemoveFromGroup, run: () => {},
    submenu: (ctx) => ctx.groups.filter(g => g.pieceIds.includes(ctx.pieceId!)).map(g => ({
      label: `Quitar de "${g.name}"`, action: () => { ctx.dispatch(removePiecesFromGroup({ groupId: g.id, pieceIds: [ctx.pieceId!] })); ctx.onClose(); }, // removePiecesFromGroup
    })) },

  // linked (3-vías, idéntico al if/else-if/else de hoy)
  unlinkPieces: { id: 'unlinkPieces', group: 'linked', icon: '🔗', label: 'Quitar edición vinculada', gate: isLinked,
    run: (ctx) => ctx.dispatch(unlinkPieces({ pieceId: ctx.pieceId! })) },                                   // unlinkPieces
  selectLinkedPartner: { id: 'selectLinkedPartner', group: 'linked', icon: '👆', label: 'Seleccionar patrón vinculado', gate: isLinked,
    run: (ctx) => ctx.dispatch(selectPiece(ctx.piece!.linkedPieceId!)) },
  linkSymmetry: { id: 'linkSymmetry', group: 'linked', icon: '🪞', label: 'Aplicar edición vinculada – simetría', gate: twoSelected,
    run: (ctx) => ctx.dispatch(linkPieces({ pieceIdA: ctx.selectedPieceIds[0], pieceIdB: ctx.selectedPieceIds[1], mode: 'symmetry' })) }, // linkPieces
  linkInstance: { id: 'linkInstance', group: 'linked', icon: '📋', label: 'Aplicar edición vinculada – instancia', gate: twoSelected,
    run: (ctx) => ctx.dispatch(linkPieces({ pieceIdA: ctx.selectedPieceIds[0], pieceIdB: ctx.selectedPieceIds[1], mode: 'instance' })) },
  cloneLinkedSymmetry: { id: 'cloneLinkedSymmetry', group: 'linked', icon: '🪞', label: 'Clonar con edición vinculada – simetría', gate: cloneable,
    run: (ctx) => ctx.dispatch(cloneAsLinked({ pieceId: ctx.pieceId!, mode: 'symmetry' })) },               // cloneAsLinked
  cloneLinkedInstance: { id: 'cloneLinkedInstance', group: 'linked', icon: '📋', label: 'Clonar con edición vinculada – instancia', gate: cloneable,
    run: (ctx) => ctx.dispatch(cloneAsLinked({ pieceId: ctx.pieceId!, mode: 'instance' })) },

  // identity
  duplicate: { id: 'duplicate', group: 'identity', icon: '⧉', label: 'Duplicar', shortcut: 'Ctrl+D',
    run: (ctx) => ctx.dispatch(duplicatePiece(ctx.pieceId!)) },                                              // duplicatePiece
  duplicateAll: { id: 'duplicateAll', group: 'identity', icon: '⧉', label: 'Duplicar',
    run: (ctx) => ctx.selectedPieceIds.forEach(id => ctx.dispatch(duplicatePiece(id))) },                    // loop pieza-a-pieza (verbo existente)
  rename: { id: 'rename', group: 'identity', icon: '✏️', label: 'Renombrar…', shortcut: 'F2',
    run: (ctx) => ctx.cb.onRename?.(ctx.pieceId!) },                                                         // Surface B prop → inline rename
  properties: { id: 'properties', group: 'identity', icon: '🎛', label: 'Propiedades…',
    run: (ctx) => ctx.cb.onOpenProperties?.(ctx.pieceId!) },                                                 // Surface B prop → Properties panel
  select: { id: 'select', group: 'identity', icon: '☐', label: 'Seleccionar',
    run: (ctx) => ctx.dispatch(selectPiece(ctx.pieceId!)) },                                                 // selectPiece
  inspect: { id: 'inspect', group: 'identity', icon: '🔍', label: 'Inspeccionar',
    run: (ctx) => dispatchInspectPiece(ctx.dispatch, ctx.pieceId!) },                                        // inspectorSlice.dispatchInspectPiece
  selectPieceOfLine: { id: 'selectPieceOfLine', group: 'identity', icon: '☐', label: 'Seleccionar pieza',
    run: (ctx) => ctx.dispatch(selectPiece(ctx.pieceId!)) },
  selectSeamA: { id: 'selectSeamA', group: 'identity', icon: '☐', gate: seamBothConnected,
    label: (ctx) => `Seleccionar "${seamPartnerName(ctx, 'A')}"`,
    run: (ctx) => ctx.dispatch(selectPiece(ctx.seam!.pieceA.pieceId)) },
  selectSeamB: { id: 'selectSeamB', group: 'identity', icon: '☐', gate: seamBothConnected,
    label: (ctx) => `Seleccionar "${seamPartnerName(ctx, 'B')}"`,
    run: (ctx) => ctx.dispatch(selectPiece(ctx.seam!.pieceB.pieceId)) },
  zoomToFit: { id: 'zoomToFit', group: 'identity', icon: '⊞', label: 'Ajustar zoom al patrón',
    run: (ctx) => ctx.cb.onZoomToFit?.() },                                                                  // Surface B prop

  // danger (destructivos → gate !locked donde aplica, F2)
  deletePiece: { id: 'deletePiece', group: 'danger', icon: '🗑', label: 'Eliminar pieza', shortcut: 'Del', danger: true,
    gate: notLocked, run: (ctx) => ctx.dispatch(removePiece(ctx.pieceId!)) },                                // projectSlice.removePiece (SIN cascade-clean — POST-SHIP)
  deleteSeam: { id: 'deleteSeam', group: 'danger', icon: '🗑', label: 'Eliminar costura', shortcut: 'Del', danger: true,
    run: (ctx) => { ctx.dispatch(removeSeam(ctx.seamId!)); ctx.dispatch(clearSelection()); } },              // removeSeam + clearSelection
  deleteInternalLine: { id: 'deleteInternalLine', group: 'danger', icon: '🗑', label: ilDeleteLabel, danger: true,
    run: (ctx) => ctx.dispatch(removeInternalLine({ pieceId: ctx.pieceId!, lineId: ctx.internalLineId! })) }, // projectSlice.removeInternalLine (:518)
};

// ── CURATION: la tabla que María edita ───────────────────────────────────────
// Leyenda: `bar` rankeada (cap 5, apagada salvo BAR_ENABLED_KINDS); `menu` agrupada por ActionDef.group.

export const CURATION: CurationRow[] = [
  {
    targetKind: 'piece', stage: '*', altitude: 'body',
    bar: ['rotate90', 'duplicate', 'flipH', 'properties', 'lockToggle'],
    menu: [
      'copy', 'paste', 'pasteMirror',
      'rotate90', 'flipH', 'flipV',
      'order',
      'layer', 'lockToggle', 'activeToggle', 'groupCreate', 'addToGroup', 'removeFromGroup',
      'unlinkPieces', 'selectLinkedPartner', 'linkSymmetry', 'linkInstance', 'cloneLinkedSymmetry', 'cloneLinkedInstance',
      'duplicate', 'rename', 'properties', 'select', 'inspect',
      'deletePiece',
    ],
  },
  {
    // Consumida SOLO por Surface A (barra, selección>1). Surface B resuelve por
    // hit-test → siempre pieza única; el caso "2 seleccionadas" lo cubren los
    // gates del row `piece` (linkSymmetry/linkInstance). NO autora deletePiece (F3).
    targetKind: 'multiPiece', stage: '*', altitude: 'body',
    bar: ['duplicateAll', 'groupCreate', 'linkSymmetry', 'linkInstance'],
    menu: ['duplicateAll', 'groupCreate', 'addToGroup', 'linkSymmetry', 'linkInstance'],
  },
  {
    targetKind: 'seam', stage: '*', altitude: 'body',
    bar: ['reverseSeam', 'selectSeamA', 'selectSeamB'], // data v2 (apagada por BAR_ENABLED_KINDS)
    menu: ['reverseSeam', 'selectSeamA', 'selectSeamB', 'deleteSeam'],
  },
  { targetKind: 'il.notch', stage: '*', altitude: 'body', bar: [], menu: ['selectPieceOfLine', 'deleteInternalLine'] },
  { targetKind: 'il.grainline', stage: '*', altitude: 'body', bar: [], menu: ['selectPieceOfLine', 'deleteInternalLine'] },
  {
    targetKind: 'il.fold', stage: '*', altitude: 'body',
    bar: ['unfold', 'unfoldOutlineOnly'], // data v2
    menu: ['unfold', 'unfoldOutlineOnly', 'selectPieceOfLine', 'deleteInternalLine'],
  },
  { targetKind: 'il.dart', stage: '*', altitude: 'body', bar: [], menu: ['optimizeCurves', 'selectPieceOfLine', 'deleteInternalLine'] },
  { targetKind: 'il.other', stage: '*', altitude: 'body', bar: [], menu: ['offsetInternalLine', 'optimizeCurves', 'selectPieceOfLine', 'deleteInternalLine'] },
  { targetKind: 'point.segment', stage: '*', altitude: 'point', bar: [], menu: ['convertSegment'] },
  { targetKind: 'point.node', stage: '*', altitude: 'point', bar: [], menu: [] },
  { targetKind: 'emptyCanvas', stage: '*', altitude: 'body', bar: [], menu: ['paste', 'pasteMirror', 'zoomToFit'] },
];

// ── Resolvers puros ──────────────────────────────────────────────────────────

export interface TargetInput {
  seamId: string | null;
  pieceId: string | null;
  /** Surface A: selectedPieceIds.length. Surface B (hit-test): 0 ó 1. */
  pieceCount: number;
  internalLineType: InternalLineType | null;
  altitude: 'body' | 'point';
  /** Solo Surface B en altitud POINT (hit-test bajo el cursor). */
  segmentHit?: boolean;
}

function ilBucket(t: InternalLineType): 'notch' | 'grainline' | 'fold' | 'dart' | 'other' {
  return (t === 'notch' || t === 'grainline' || t === 'fold' || t === 'dart') ? t : 'other';
}

/**
 * Puro y compartido. Precedencia (la del hit-test existente): altitud POINT >
 * seam > línea interna > pieza. `point.*` SOLO cuando `altitude==='point'`
 * (F11): Surface A nunca pasa esa altitud — su box está suprimido en POINT (G7).
 */
export function resolveTargetKind(t: TargetInput): TargetKind {
  if (t.altitude === 'point') return t.segmentHit ? 'point.segment' : 'point.node';
  if (t.seamId) return 'seam';
  if (t.internalLineType) return `il.${ilBucket(t.internalLineType)}` as TargetKind;
  if (t.pieceCount > 1) return 'multiPiece';
  if (t.pieceId) return 'piece';
  return 'emptyCanvas';
}

/** Fila más específica: stage exacto sobre '*', altitud exacta sobre '*'.
 *  Sin match → null (F6: el lector devuelve menú vacío, sin crash). */
export function matchRow(key: { targetKind: TargetKind; stage: WorkflowStage; altitude: 'body' | 'point' }): CurationRow | null {
  const viable = CURATION.filter(r =>
    r.targetKind === key.targetKind &&
    (r.stage === key.stage || r.stage === '*') &&
    (r.altitude === key.altitude || r.altitude === '*'));
  if (viable.length === 0) return null;
  const score = (r: CurationRow) =>
    (r.stage === key.stage ? 2 : 1) * 10 + (r.altitude === key.altitude ? 2 : 1);
  return viable.reduce((best, r) => (score(r) > score(best) ? r : best));
}

/** Menú (Surface B): fila → ids → ActionDef → filtro por gate. Agrupación/orden
 *  y separadores los aplica el renderer por GROUP_ORDER. */
export function resolveMenuActions(ctx: CurationCtx): ActionDef[] {
  const row = matchRow({ targetKind: ctx.targetKind, stage: ctx.stage, altitude: ctx.altitude });
  if (!row) return [];
  return row.menu.map(id => ACTIONS[id]).filter(Boolean).filter(def => !def.gate || def.gate(ctx));
}

/** Barra (Surface A): solo BAR_ENABLED_KINDS, sin danger, gate aplicado, cap 5. */
export function resolveBarActions(ctx: CurationCtx): ActionDef[] {
  if (!BAR_ENABLED_KINDS.has(ctx.targetKind)) return [];
  const row = matchRow({ targetKind: ctx.targetKind, stage: ctx.stage, altitude: ctx.altitude });
  if (!row) return [];
  return row.bar
    .map(id => ACTIONS[id]).filter(Boolean)
    .filter(def => !def.danger && (!def.gate || def.gate(ctx)))
    .slice(0, BAR_MAX_VISIBLE);
}
