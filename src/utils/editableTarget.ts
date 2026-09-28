/**
 * Un campo editable es dueño de sus teclas (spec 2026-08-29 § 8).
 *
 * Lo preguntan dos oyentes de teclado del lienzo: el router CF-1 de
 * `useEditorInteractions` y `useShiftSostenido`. Con una copia en cada uno, el
 * día que un campo nuevo (un `contenteditable`, un `<select>`) quede fuera de
 * una de las dos, Shift escrito en el chat vuelve a mover la goma.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
