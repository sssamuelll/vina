# Third-party notices

Vina is released under the MIT License ([`LICENSE`](LICENSE)). Parts of the
repository adapt or include work by others, listed below with their licenses.
npm and Rust dependencies are not copied into the repository and keep their own
licenses; the inventory is in
[`docs/specs/LEGAL-IP-COMPLIANCE.md`](docs/specs/LEGAL-IP-COMPLIANCE.md).

## Code and formulations

### Ten Minute Physics — Matthias Müller

XPBD cloth, spatial hashing and self-collision (tutorials 11, 14 and 15),
adapted in `src/utils/cloth/xpbdSolver.ts`, `src/utils/cloth/selfCollision.ts`,
`src/utils/cloth/gpu/shaders/cloth.wgsl`,
`src/utils/cloth/gpu/shaders/selfCollision.wgsl`,
`src/utils/cloth/gpu/tslSelfCollision.ts` and `crates/xpbd-wasm/src/lib.rs`.
Source: <https://github.com/matthias-research/pages/tree/master/tenMinutePhysics>

    Copyright 2022 Matthias Müller - Ten Minute Physics

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

### PositionBasedDynamics

Dihedral bending gradients (`solve_DihedralConstraint`), in
`src/utils/cloth/dihedral.ts` and its transcriptions in
`crates/xpbd-wasm/src/lib.rs` and `src/utils/cloth/gpu/tslSolver.ts`.
Source: <https://github.com/InteractiveComputerGraphics/PositionBasedDynamics>

    The MIT License (MIT)

    Copyright (c) 2015-present, PositionBasedDynamics contributors

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

### Tissu

The formulation of the bending angle as `atan2(sin θ, cos θ)`, in
`src/utils/cloth/dihedral.ts`, `crates/xpbd-wasm/src/lib.rs` and
`src/utils/cloth/gpu/tslSolver.ts`.
Source: <https://github.com/evanrock520-ciencias/Tissu>, licensed under the
Apache License, Version 2.0 (<https://www.apache.org/licenses/LICENSE-2.0>).

## Data and assets

### Avatars — `public/avatares/`

Generated with MPFB 2.0.17 for Blender from the MakeHuman base mesh and targets,
which the MakeHuman project releases under CC0 1.0
(<https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md>,
sections C and D). Body measurements come from ANSUR II and NHANES; sources and
checksums in `scripts/avatares/tallas.json`. `scripts/avatares/medir.py` uses
vertex indices of the MakeHuman base mesh (hm08), the same loops MakeHuman
measures along.

### HDRI maps — `public/hdri/`

From Poly Haven (<https://polyhaven.com>), CC0 1.0.

### Fonts

Inter and JetBrains Mono, SIL Open Font License 1.1. The home page serves them
from `home/fonts/`, next to their licenses; the app loads them from Google
Fonts.

### Test patterns — `tests/fixtures/garments/`

Four DXF files are derived from Seamly2D sample patterns. Seamly2D is
distributed under the GNU GPL v3, and these files are not covered by Vina's MIT
license. Provenance of every fixture:
[`tests/fixtures/garments/README.md`](tests/fixtures/garments/README.md).

## Trademarks

Product names that appear in the code and docs belong to their owners and are
used only to describe compatibility or compare behaviour. Vina is not affiliated
with or endorsed by any of them.
