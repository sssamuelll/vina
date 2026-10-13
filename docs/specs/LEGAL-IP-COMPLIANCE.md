# Legal & IP compliance

> Last reviewed 2026-10-13. What can be checked in the repository; not legal advice.

## 1. Vina's code

- Vina is released under the MIT License ([`LICENSE`](../../LICENSE)); `package.json` and the Rust crate (`crates/xpbd-wasm/Cargo.toml`) declare the same.
- It contains no source code from proprietary products, and no such code was accessed or decompiled to write it.
- Parts of the cloth solver adapt open-source code under MIT and Apache-2.0. Each source is credited in [`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md) and in a comment in the file that uses it.
- The algorithms come from published research (Position Based Dynamics and XPBD, Müller et al.; dihedral bending, Bridson et al.) and from standard computational geometry (constrained Delaunay triangulation, PSLG cleaning).

## 2. Interoperability

- DXF import and export follow the layer conventions of AAMA and ASTM D6673. Vina does not claim certified conformance with either.
- The Seamly2D importer (`src/utils/seamly2d/`) reads Seamly2D pattern files.

## 3. Assets and data

- Bundled avatars, HDRI maps and fonts, with their sources and licenses: [`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md).
- Test patterns and their provenance: [`tests/fixtures/garments/README.md`](../../tests/fixtures/garments/README.md).
- An avatar, texture or font added to the repository is original, CC0 or licensed for redistribution, and its provenance is written down next to it.
- Icons come from `lucide-react` (ISC).

## 4. Dependencies (inventory of 2026-10-13)

- **npm**: 887 packages in `package-lock.json`, 248 of them outside dev: 742 MIT, 56 Apache-2.0, 36 ISC, 22 BSD, plus a few other permissive licenses. No GPL, AGPL, SSPL or non-commercial license. The exceptions, one by one:
  - LGPL-3.0: only the optional native builds of `sharp`, a dev dependency pulled by `@gltf-transform/functions` through `ndarray-pixels`. It never reaches the browser bundle.
  - MPL-2.0: `axe-core` and `@axe-core/playwright`, dev only, for the e2e accessibility checks.
  - `clipper2-js` (production): Boost Software License, permissive.
  - `webgl-constants` (production, via `@react-three/drei` → `detect-gpu`) declares no license field; its package ships an MIT license. Two dev-only packages, `console-browserify` and `querystring-es3`, also lack the field and ship a license file.
- **Rust** (`crates/xpbd-wasm/Cargo.lock`): `wasm-bindgen`, `console_error_panic_hook` and their 11 transitive crates are MIT OR Apache-2.0; `unicode-ident` adds Unicode-3.0.
- The npm count reads the `license` field of every entry in `package-lock.json`; the Rust one, each crate's metadata on crates.io.

## 5. Trademarks

Product names that appear in the code and docs belong to their owners and are used only to describe compatibility or compare behaviour. Vina is not affiliated with or endorsed by any of them.
