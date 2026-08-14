#!/usr/bin/env node
/**
 * ui-contract-lint — el guardián del contrato de interfaz.
 *
 * Por qué existe: la auditoría del 2026-08-14 encontró OCHO contratos ya
 * escritos (tokens.css, el glosario de copy, shortcutDisplay.ts, ContextPanel,
 * .icon-btn, los 59 iconos de tools/definitions, PanelErrorBoundary, nameEs) y
 * los ocho rodeados. La conclusión fue que no falta la regla: falta que
 * romperla cueste. Esto es lo que hace que cueste.
 *
 * Cómo funciona: cada regla es un conteo. `ui-contract-baseline.json` guarda el
 * techo vigente. El gate falla si un contador SUBE. Nunca bloquea el trabajo
 * existente — solo impide que la deriva crezca — y a medida que las fases del
 * plan arreglan cosas, el techo se baja con `--update` y queda commiteado.
 * Es un trinquete: solo gira hacia abajo.
 *
 * Uso:
 *   node scripts/ui-contract-lint.mjs            # verifica contra el baseline
 *   node scripts/ui-contract-lint.mjs --update   # baja el techo a lo medido hoy
 *   node scripts/ui-contract-lint.mjs --list R3  # lista los sitios de una regla
 *
 * Informe que lo originó: docs/reports/2026-08-14-auditoria-ui-deriva-de-diseno.md
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'ui-contract-baseline.json');

/** El archivo donde SÍ es legal escribir un color literal. */
const TOKEN_FILES = ['src/styles/tokens.css'];

/**
 * `--capa-*` (Task 4, Grupo 2 de la ley de emplazamiento, § 2.3): variables
 * CSS deliberadamente LOCALES a un `isolation: isolate` de un solo
 * componente — nunca un token global, nunca pensadas para reusarse fuera de
 * su propio archivo. R2 (tokens fantasma) y R4 (archivos que definen
 * tokens) existen para cazar drift de VOCABULARIO GLOBAL; una `--capa-x`
 * definida y usada dentro del mismo árbol aislado no es ese caso — así que
 * ambas reglas la ignoran a propósito, por nombre, en vez de perseguir cada
 * sitio nuevo uno por uno.
 */
const isLocalCapaVar = (name) => name.startsWith('--capa-');

// ── utilidades ──────────────────────────────────────────────────────────────

/** git ls-files, no `find`: excluye node_modules, dist y worktrees sin pensarlo. */
function tracked(pattern) {
  const out = execFileSync('git', ['ls-files', ...pattern], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

const isTest = (f) => /__tests__|\.test\.|\.spec\./.test(f);

const cssFiles = () => tracked(['*.css']).filter((f) => f.startsWith('src/'));
const codeFiles = () =>
  tracked(['*.ts', '*.tsx']).filter((f) => f.startsWith('src/') && !isTest(f));

const read = (f) => readFileSync(join(ROOT, f), 'utf8');

/** Recorre líneas descartando las que son comentario puro (menos falsos positivos). */
function* lines(file) {
  const src = read(file);
  let inBlock = false;
  src.split('\n').forEach((raw, i) => {
    const line = raw;
    const t = line.trim();
    if (inBlock) {
      if (t.includes('*/')) inBlock = false;
      return;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlock = true;
      return;
    }
    if (t.startsWith('//') || t.startsWith('*')) return;
    _emit.push({ file, n: i + 1, line });
  });
}
let _emit = [];
function scan(file) {
  _emit = [];
  // eslint-disable-next-line no-unused-expressions
  [...lines(file)];
  return _emit;
}

function countMatches(files, re, filter) {
  const hits = [];
  for (const f of files) {
    for (const { n, line } of scan(f)) {
      const m = line.match(re);
      if (!m) continue;
      for (const found of line.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) {
        if (filter && !filter(found, f, line)) continue;
        hits.push({ file: f, n, text: (found[0] || '').trim(), line: line.trim().slice(0, 120) });
      }
    }
  }
  return hits;
}

// ── las reglas ──────────────────────────────────────────────────────────────

const RULES = [
  {
    id: 'R1',
    key: 'varFallback',
    label: 'var() con valor de respaldo',
    why: 'El fallback hace invisible un token que no existe: se lee como tokenizado y renderiza bien. Es el mecanismo que silenció la deriva.',
    run: () => countMatches([...cssFiles(), ...codeFiles()], /var\(\s*--[\w-]+\s*,/),
  },
  {
    id: 'R2',
    key: 'phantomTokenRefs',
    label: 'referencias a tokens que no existen',
    why: 'Un nombre de token inventado por una ráfaga que aliasea uno que ya existía.',
    run: () => {
      const defined = new Set();
      for (const f of cssFiles())
        for (const { line } of scan(f)) {
          const m = line.match(/^\s*(--[\w-]+)\s*:/);
          if (m) defined.add(m[1]);
        }
      return countMatches(
        [...cssFiles(), ...codeFiles()],
        /var\(\s*(--[\w-]+)/,
        (m) => !isLocalCapaVar(m[1]) && !defined.has(m[1]),
      );
    },
  },
  {
    id: 'R3',
    key: 'literalColor',
    label: 'color literal fuera del archivo de tokens',
    why: 'Cada literal es una decisión de color tomada sin consultar el sistema.',
    run: () =>
      countMatches(
        [...cssFiles().filter((f) => !TOKEN_FILES.includes(f)), ...codeFiles()],
        /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/,
      ),
  },
  {
    id: 'R4',
    key: 'tokenDefinitionFiles',
    label: 'archivos que definen tokens',
    why: 'Dos registros de tokens = dos vocabularios que se pisan. App.css ya tumbó la paleta entera una vez.',
    run: () => {
      const hits = [];
      for (const f of cssFiles()) {
        const first = scan(f).find(({ line }) => {
          const m = line.match(/^\s*(--[\w-]+)\s*:/);
          return m && !isLocalCapaVar(m[1]);
        });
        if (first) hits.push({ file: f, n: first.n, text: f, line: first.line.trim() });
      }
      return hits;
    },
  },
  {
    id: 'R5',
    key: 'hoverWithoutFocus',
    label: 'selectores con :hover sin :focus-visible hermano',
    why: 'Cada ráfaga estilizó el hover porque es lo que se ve con el mouse. Nadie probó con Tab.',
    run: () => {
      const focusBases = new Set();
      const hoverHits = [];
      for (const f of cssFiles()) {
        for (const { n, line } of scan(f)) {
          const sel = line.match(/^([^{}]+)\{/);
          if (!sel) continue;
          for (const part of sel[1].split(',')) {
            const s = part.trim();
            if (!s) continue;
            if (s.includes(':focus-visible')) focusBases.add(s.replace(/:focus-visible/g, '').trim());
            else if (s.includes(':hover')) hoverHits.push({ f, n, line, base: s.replace(/:hover/g, '').trim() });
          }
        }
      }
      /**
       * Un modificador BEM hereda el anillo de foco de su bloque: un elemento
       * con `.dock__tool--active` TAMBIÉN lleva `.dock__tool`, así que
       * `.dock__tool:focus-visible` ya lo cubre y exigirle regla propia sería
       * ruido. Se acepta la cobertura del bloque, no la de cualquier ancestro:
       * solo se quitan los `--modificadores`, nunca se recorta el selector.
       */
      const cubierto = (base) =>
        focusBases.has(base) || focusBases.has(base.replace(/--[\w-]+/g, ''));

      return hoverHits
        .filter((h) => h.base !== '' && !cubierto(h.base))
        .map((h) => ({ file: h.f, n: h.n, text: h.base, line: h.line.trim().slice(0, 120) }));
    },
  },
  {
    id: 'R6',
    key: 'outlineNone',
    label: 'outline:none',
    why: 'Quitarle el contorno a un control sin poner otra señal es una barrera de teclado.',
    run: () => countMatches(cssFiles(), /outline:\s*none/),
  },
  {
    id: 'R7',
    key: 'nativeDialog',
    label: 'confirm / alert / prompt nativos',
    why: 'El navegador puede desactivarlos: una acción destructiva se vuelve un no-op silencioso. Ya existe el sistema de Toast ratificado.',
    run: () =>
      countMatches(codeFiles(), /(?:^|[^.\w])(?:window\.)?(confirm|alert|prompt)\s*\(/, (m, f, line) =>
        !/typeof\s+window/.test(line),
      ),
  },
  {
    id: 'R8',
    key: 'zIndexLiteral',
    label: 'z-index literal',
    why: '41 valores en un único contexto de apilamiento plano, con escaladas hasta 10000.',
    run: () => [
      ...countMatches(cssFiles(), /z-index:\s*-?\d+/),
      ...countMatches(codeFiles(), /zIndex:\s*-?\d+/),
    ],
  },
];

// ── ejecución ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const wantUpdate = args.includes('--update');
const listIdx = args.indexOf('--list');
const listRule = listIdx >= 0 ? args[listIdx + 1] : null;

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  : { _doc: 'Techos del contrato de UI. Solo bajan. Ver scripts/ui-contract-lint.mjs', rules: {} };

const results = RULES.map((r) => {
  const hits = r.run();
  return { ...r, count: hits.length, hits };
});

if (listRule) {
  const r = results.find((x) => x.id === listRule || x.key === listRule);
  if (!r) {
    console.error(`No existe la regla "${listRule}". Opciones: ${RULES.map((x) => x.id).join(', ')}`);
    process.exit(2);
  }
  console.log(`\n${r.id} · ${r.label} — ${r.count} sitios\n${r.why}\n`);
  for (const h of r.hits) console.log(`  ${h.file}:${h.n}  ${h.text}`);
  process.exit(0);
}

const W = 44;
let failed = 0;
let improved = 0;

console.log('\n  Contrato de interfaz de Vina — trinquete\n');
console.log(`  ${'regla'.padEnd(W)} ${'hoy'.padStart(6)} ${'techo'.padStart(7)}   estado`);
console.log(`  ${'─'.repeat(W)} ${'─'.repeat(6)} ${'─'.repeat(7)}   ${'─'.repeat(18)}`);

for (const r of results) {
  const ceil = baseline.rules[r.key];
  let status;
  if (ceil === undefined) {
    status = 'nuevo (se fija)';
  } else if (r.count > ceil) {
    status = `SUBIÓ +${r.count - ceil}`;
    failed++;
  } else if (r.count < ceil) {
    status = `bajó −${ceil - r.count}`;
    improved++;
  } else {
    status = r.count === 0 ? 'limpio' : 'sin cambio';
  }
  const label = `${r.id} ${r.label}`;
  console.log(
    `  ${label.slice(0, W).padEnd(W)} ${String(r.count).padStart(6)} ${String(ceil ?? '—').padStart(7)}   ${status}`,
  );
}

console.log('');

if (wantUpdate) {
  const next = { ...baseline, rules: { ...baseline.rules } };
  let lowered = 0;
  for (const r of results) {
    const ceil = next.rules[r.key];
    if (ceil === undefined || r.count < ceil) {
      if (ceil !== undefined) lowered++;
      next.rules[r.key] = r.count;
    } else if (r.count > ceil) {
      console.error(`  ✗ ${r.id} subió (${ceil} → ${r.count}). El trinquete no gira hacia arriba: arregla antes de fijar.`);
      process.exit(1);
    }
  }
  next._actualizado = new Date().toISOString().slice(0, 10);
  writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log(`  Techo actualizado (${lowered} regla(s) bajaron). Commitea ${relative(ROOT, BASELINE_PATH)}.\n`);
  process.exit(0);
}

if (failed) {
  console.error(`  ✗ ${failed} regla(s) subieron. El contrato es un trinquete: solo baja.`);
  console.error(`    Mira los sitios con:  node scripts/ui-contract-lint.mjs --list R1\n`);
  process.exit(1);
}

if (improved) {
  console.log(`  ${improved} regla(s) bajaron. Fija el techo nuevo:  node scripts/ui-contract-lint.mjs --update\n`);
}
console.log('  ✓ ningún contador subió.\n');
