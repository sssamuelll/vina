// The UI glossary (spec § 7.1, § 7.4): parsing docs/specs/2026-09-29-ui-glossary.md and checking every
// catalog entry against it. Shared by tests/repo/i18n-glossary.test.ts.
import ts from 'typescript';

export const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss');

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const forms = (cell) => (cell === '—' || cell === '' ? [] : cell.split(' · ').map((f) => f.trim()).filter(Boolean));

export function parseGlossary(md) {
  const terms = [];
  const banned = [];
  let section = '';
  let header = true;
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      section = line.slice(3).trim();
      header = true;
      continue;
    }
    if (!line.trim().startsWith('|') || (section !== 'Terms' && section !== 'Banned')) continue;
    if (/^\|[\s|:-]+\|?$/.test(line.trim())) continue;
    if (header) {
      header = false;
      continue;
    }
    const c = cells(line);
    if (section === 'Terms') {
      const en = forms(c[0]);
      const lang = (cell) => (cell === '=en' ? [...en] : forms(cell));
      terms.push({ en, es: lang(c[1]), de: lang(c[2]), note: c[3] ?? '' });
    } else {
      banned.push({ lang: c[0], forms: forms(c[1]), reason: c[2] ?? '' });
    }
  }
  return { terms, banned };
}

const startsWord = (s, at) => at === 0 || !/[\p{L}\p{N}]/u.test(s[at - 1]);

// Rows whose forms occur in `text` for `lang`, longest form first; a matched span is blanked so a shorter
// form cannot match inside it. Returned in order of appearance, without duplicates. A form starts at a
// word (`ease` is not in `release`) and may run on into a suffix (`buttons`). Translations are checked
// as plain substrings instead (checkCatalogs), so a German compound still counts.
export function findTerms(text, rows, lang) {
  let rest = fold(text);
  const candidates = rows
    .flatMap((row) => (row[lang] ?? []).map((f) => ({ row, form: fold(f) })))
    .filter((c) => c.form)
    .sort((a, b) => b.form.length - a.form.length);
  const hits = new Map();
  for (const { row, form } of candidates) {
    for (let at = rest.indexOf(form); at !== -1; at = rest.indexOf(form, at + 1)) {
      if (!startsWord(rest, at)) continue;
      if (!hits.has(row) || at < hits.get(row)) hits.set(row, at);
      rest = rest.slice(0, at) + '\u0001'.repeat(form.length) + rest.slice(at + form.length);
    }
  }
  return [...hits].sort((a, b) => a[1] - b[1]).map(([row]) => row);
}

// String and template parts of a function entry's source; expressions are ignored.
function literalText(source) {
  const sf = ts.createSourceFile('entry.ts', `(${source})`, ts.ScriptTarget.Latest, true);
  const parts = [];
  const visit = (n) => {
    if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) parts.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return parts.join('\n');
}

export const textOf = (e) => (e.isFunction ? literalText(e.text) : e.text);

export function checkCatalogs(catalogs, { terms, banned }) {
  const violations = [];
  const exempt = (entry, names) => {
    const set = new Set(names.map(fold));
    return (entry.glossaryExempt ?? []).some((x) => set.has(fold(x.term)));
  };

  for (const [key, enEntry] of catalogs.en) {
    const found = findTerms(textOf(enEntry), terms, 'en');
    for (const locale of ['es', 'de']) {
      const entry = catalogs[locale].get(key);
      if (!entry) continue;
      const text = fold(textOf(entry));
      for (const row of found) {
        const wanted = row[locale];
        if (!wanted.length || wanted.some((f) => text.includes(fold(f)))) continue;
        if (exempt(entry, [...row.en, ...row.es, ...row.de])) continue;
        violations.push({ key, locale, kind: 'missing', form: row.en[0] });
      }
    }
  }

  for (const locale of ['en', 'es', 'de']) {
    for (const [key, entry] of catalogs[locale]) {
      const text = fold(textOf(entry));
      for (const row of banned.filter((b) => b.lang === locale)) {
        for (const form of row.forms) {
          if (!text.includes(fold(form)) || exempt(entry, [form])) continue;
          violations.push({ key, locale, kind: 'banned', form });
        }
      }
    }
  }
  return violations;
}
