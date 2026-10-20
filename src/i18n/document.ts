/** Keeps <html lang> and the browser tab title in the active interface language. */
import { t } from './index';
import { getLocale, isPseudo, subscribe } from './locale';

export function applyDocumentLocale(): void {
  document.documentElement.lang = isPseudo() ? 'en' : getLocale();
  document.title = t().app.title;
}

export function installDocumentLocale(): () => void {
  applyDocumentLocale();
  return subscribe(applyDocumentLocale);
}
