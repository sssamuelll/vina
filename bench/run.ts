/**
 * Meta-runner: executes every bench in this directory and exits non-zero if
 * any threshold gate fails. Intended for `npm run bench` and for CI.
 *
 * Each bench module exports a `run<Name>Bench()` function; this file wires
 * them up explicitly rather than auto-discovering, so adding a new bench is
 * a deliberate two-line change here.
 */

import { runMatchVerticesBench } from './matchVertices.bench';
import { runBuildLRAConstraintsBench } from './buildLRAConstraints.bench';
import { reportAndGate } from './_lib';

const benches = [runMatchVerticesBench, runBuildLRAConstraintsBench];

let failed = 0;
for (const run of benches) {
  const result = run();
  failed |= reportAndGate(result);
}

if (failed) {
  process.stdout.write('FAIL: one or more bench thresholds breached.\n');
  process.exit(1);
}
process.stdout.write('PASS: all bench thresholds OK.\n');
