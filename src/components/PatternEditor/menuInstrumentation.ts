import { pushJournal } from '../../utils/telemetry/journal';
import type { SubMenuItem } from '../shared/SubMenu';

/** Envuelve cada `action` de un submenú para que, al dispararse, deje el
 *  mismo rastro en la bitácora que ya deja un botón plano del menú (#1095
 *  ronda 2: los submenús eran un punto ciego de la caja negra). */
export function instrumentSubmenuItems(actionId: string, items: SubMenuItem[]): SubMenuItem[] {
  return items.map(item => ({
    ...item,
    action: item.action && (() => {
      pushJournal('ui', 'menu:action', { id: actionId });
      item.action!();
    }),
  }));
}
