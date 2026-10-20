// The i18n launch gate as one command: the ten checks of spec § 8.4, in order, stopping at the
// first that fails.
//   node scripts/i18n-launch-gate.mjs [--dry-run] [--allowed-text-changes <file>]
// Heavy steps go through scripts/pesado.mjs, the machine's lock.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const at = args.indexOf('--allowed-text-changes');
const allowed = at >= 0 ? args[at + 1] : undefined;
if (at >= 0 && (!allowed || allowed.startsWith('--'))) {
  console.error('--allowed-text-changes needs a file');
  process.exit(2);
}

const sha = execSync('git rev-parse --short=8 HEAD', { encoding: 'utf8' }).trim();
const heavy = (cmd) => `node scripts/pesado.mjs -- ${cmd}`;
const today = new Date().toLocaleDateString('en-CA');

const E2E_SPECS = [
  'tests/e2e/i18n-language-switch.spec.ts',
  'tests/e2e/i18n-first-boot.spec.ts',
  'tests/e2e/i18n-pseudo.spec.ts',
  'tests/e2e/i18n-overflow-de.spec.ts',
  'tests/e2e/superficies-por-accion.spec.ts',
  'tests/e2e/contraste-del-cromo.spec.ts',
];

const total = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);
const mustBeZero = (what, n) => {
  if (n !== 0) throw new Error(`${what}: ${n}`);
};

const steps = [
  {
    label: 'debt list is empty',
    describe: 'I18N_CEILINGS and ES_FIELD_CEILINGS have no keys',
    run: async () => {
      const { I18N_CEILINGS, ES_FIELD_CEILINGS } = await import('../eslint-rules/i18n-debt.js');
      mustBeZero('I18N_CEILINGS keys', Object.keys(I18N_CEILINGS).length);
      mustBeZero('ES_FIELD_CEILINGS keys', Object.keys(ES_FIELD_CEILINGS).length);
    },
  },
  {
    label: 'literal census over src/ is zero',
    describe: 'countLiteralSites(sourceFiles()) sums to 0',
    run: async () => {
      const { countLiteralSites, sourceFiles } = await import('./i18n/literal-census.mjs');
      mustBeZero('literal sites', total(countLiteralSites(sourceFiles())));
    },
  },
  {
    label: 'Es-field census is zero',
    describe: 'countEsFields(sourceFiles()) sums to 0',
    run: async () => {
      const { countEsFields, sourceFiles } = await import('./i18n/literal-census.mjs');
      mustBeZero('Es fields', total(countEsFields(sourceFiles())));
    },
  },
  { label: 'i18n lock at launch', command: 'npm run i18n:lock -- --launch' },
  { label: 'sweep report', command: 'npm run i18n:sweep-report' },
  { label: 'deploy rehearsal', command: heavy('bash scripts/deploy-prod.sh --ensayo') },
  { label: 'goldens', command: heavy('npx vitest run tests/goldens') },
  { label: 'persisted surface', command: 'node scripts/persisted-surface.mjs --check' },
  {
    label: 'captures against the Spanish text baseline',
    command: heavy('npx playwright test --config playwright.capturas.config.ts'),
    env: {
      VINA_E2E_BUILD: '1',
      CAPTURAS_FECHA: today,
      CAPTURAS_COMPARE: 'tests/i18n/baseline/texto-es.json',
      ...(allowed ? { CAPTURAS_ALLOWED: allowed } : {}),
    },
  },
  {
    label: 'i18n specs and browser ratchets with the pin on en',
    // Playwright drops a path that matches nothing and prints a pass, so every spec must exist.
    check: () => {
      for (const s of E2E_SPECS) if (!existsSync(s)) throw new Error(`missing spec ${s}`);
    },
    command: heavy(`npx playwright test ${E2E_SPECS.join(' ')} --workers=1 --retries=0`),
    env: { VINA_TEST_LOCALE: 'en' },
  },
];

if (dry) {
  steps.forEach((s, i) => {
    const env = s.env ? Object.entries(s.env).map(([k, v]) => `${k}=${v}`).join(' ') + ' ' : '';
    console.log(`${i + 1}. ${s.label}: ${s.command ? env + s.command : s.describe}`);
  });
  process.exit(0);
}

for (const s of steps) {
  try {
    s.check?.();
    if (s.run) await s.run();
    else execSync(s.command, { stdio: 'inherit', env: { ...process.env, ...s.env } });
    console.log(`✓ ${s.label} @ ${sha}`);
  } catch (e) {
    if (e.message && !e.status) console.error(e.message);
    console.log(`✗ ${s.label} @ ${sha}`);
    process.exit(1);
  }
}
