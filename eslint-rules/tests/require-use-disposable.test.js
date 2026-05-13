/**
 * RuleTester suite for `require-use-disposable`.
 *
 * Coverage maps to the C1 RFC § 5.2 site shapes inventory:
 *   Sites 1-2 — pure recipe (expression body)
 *   Site 3   — multi-geo coupled / wrapper-object (FloorGrid)
 *   Site 4   — nullable initial state with conditional return
 *   Site 5   — two consecutive useMemo + useDisposable pairs (Mannequin)
 *   Site 6   — nullable initial state, block body
 *   Site 7   — block body with side-effect (ClothMesh, GarmentSimulation)
 *
 * Out-of-scope shapes (deliberate false negatives, asserted as `valid`):
 *   - Module-level singletons
 *   - Function-scoped transient helpers
 *   - `useEffect`-based material/texture lifecycle
 *   - Non-disposable THREE types (Vector3, Color, Matrix4, Shape)
 *   - `THREE.Mesh` (no `dispose()` method; see rule JSDoc)
 *   - Wrapper-object useMemo shape (object-return + destructure)
 *   - Nested helper functions inside the useMemo body
 *
 * Cross-ref: docs/reports/2026-05-01-rfc-c1-buffer-lifecycle.md
 */
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import rule from '../rules/require-use-disposable.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

describe('require-use-disposable', () => {
  it('matches the C1 RFC site shapes', () => {
    ruleTester.run('require-use-disposable', rule, {
      valid: [
        // Site 1/2 — pure recipe, expression body
        {
          code: `
            function PieceMesh() {
              const geometry = useMemo(() => new THREE.ShapeGeometry(shape), [shape]);
              useDisposable(geometry);
              return null;
            }
          `,
        },
        // Site 4 — nullable conditional + block body
        {
          code: `
            function PieceMesh() {
              const geometry = useMemo(() => {
                if (!shape) return null;
                const geo = new THREE.ShapeGeometry(shape, 32);
                geo.rotateX(Math.PI / 2);
                return geo;
              }, [shape]);
              useDisposable(geometry);
              return null;
            }
          `,
        },
        // Site 5 — two consecutive useMemo + useDisposable pairs (Mannequin)
        {
          code: `
            function Mannequin() {
              const bodyGeometry = useMemo(() => {
                const points = buildProfile(measurements);
                const geo = new THREE.LatheGeometry(points, 48);
                geo.computeVertexNormals();
                return geo;
              }, [measurements]);
              useDisposable(bodyGeometry);

              const standGeometry = useMemo(() => {
                const points = buildStandProfile();
                const geo = new THREE.LatheGeometry(points, 32);
                geo.computeVertexNormals();
                return geo;
              }, []);
              useDisposable(standGeometry);

              return null;
            }
          `,
        },
        // Site 6 — nullable initial, block body (SelectedVertexRenderer)
        {
          code: `
            function SelectedVertexRenderer({ livePositions }) {
              const geometry = useMemo(() => {
                if (!livePositions) return null;
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(livePositions, 3));
                return geo;
              }, [livePositions]);
              useDisposable(geometry);
              return null;
            }
          `,
        },
        // Site 7 — block body with side-effect ref store (ClothMesh)
        {
          code: `
            function ClothMesh({ meshData }) {
              const geometryRef = useRef(null);
              const staticGeometry = useMemo(() => {
                if (!meshData) return null;
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(meshData.vertices, 3));
                geo.setIndex(new THREE.BufferAttribute(meshData.triIds, 1));
                geo.computeVertexNormals();
                geometryRef.current = geo;
                return geo;
              }, [meshData]);
              useDisposable(staticGeometry);
              return null;
            }
          `,
        },
        // Material disposable — block body
        {
          code: `
            function MaterialMesh() {
              const material = useMemo(() => new THREE.MeshStandardMaterial({ color: 'red' }), []);
              useDisposable(material);
              return null;
            }
          `,
        },
        // Texture disposable
        {
          code: `
            function TextureMesh({ canvas }) {
              const texture = useMemo(() => new THREE.CanvasTexture(canvas), [canvas]);
              useDisposable(texture);
              return null;
            }
          `,
        },
        // RenderTarget disposable
        {
          code: `
            function RTMesh() {
              const target = useMemo(() => new THREE.WebGLRenderTarget(512, 512), []);
              useDisposable(target);
              return null;
            }
          `,
        },

        // ── Out-of-scope shapes — must NOT warn ──

        // Wrapper-object shape: object literal return, destructured (FloorGrid)
        {
          code: `
            function FloorGrid() {
              const { fineGeo, sectionGeo } = useMemo(() => {
                const buildGeo = (verts) => {
                  const geo = new THREE.BufferGeometry();
                  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
                  return geo;
                };
                return {
                  fineGeo: buildGeo(fineVerts),
                  sectionGeo: buildGeo(sectionVerts),
                };
              }, []);
              useDisposable(fineGeo);
              useDisposable(sectionGeo);
              return null;
            }
          `,
        },
        // Wrapper-object shape: object literal return with direct new inside body
        {
          code: `
            function GarmentSimulation() {
              const { staticGeometry } = useMemo(() => {
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geo.computeVertexNormals();
                return { staticGeometry: geo };
              }, [positions]);
              useDisposable(staticGeometry);
              return null;
            }
          `,
        },
        // Module-level singleton (no useMemo, no enclosing function)
        {
          code: `
            const PIN_GEO = new THREE.CircleGeometry(0.012, 16);
            const PIN_MAT = new THREE.MeshBasicMaterial({ color: 'red' });
          `,
        },
        // Function-scoped transient (helper at module level, no useMemo)
        {
          code: `
            function commandsToShape(outline) {
              const shape = new THREE.Shape();
              const geo = new THREE.ShapeGeometry(shape, 1);
              geo.dispose();
              return shape;
            }
          `,
        },
        // useEffect-based material lifecycle (not a useMemo at all)
        {
          code: `
            function EdgeHighlight() {
              useEffect(() => {
                const m = new THREE.LineBasicMaterial({ color: 'cyan' });
                materialRef.current = m;
                return () => m.dispose();
              }, []);
              return null;
            }
          `,
        },
        // Non-disposable THREE types in useMemo — must NOT warn
        {
          code: `
            function VectorComp() {
              const v = useMemo(() => new THREE.Vector3(0, 1, 0), []);
              const c = useMemo(() => new THREE.Color('red'), []);
              const m = useMemo(() => new THREE.Matrix4(), []);
              const s = useMemo(() => new THREE.Shape(), []);
              const q = useMemo(() => new THREE.Quaternion(), []);
              return null;
            }
          `,
        },
        // Float32BufferAttribute / BufferAttribute (no Geometry/Material/Texture/RenderTarget suffix)
        {
          code: `
            function AttrComp() {
              const attr = useMemo(() => new THREE.Float32BufferAttribute(arr, 3), [arr]);
              const idx = useMemo(() => new THREE.BufferAttribute(arr, 1), [arr]);
              return null;
            }
          `,
        },
        // THREE.Mesh — no dispose() method, deliberately omitted from detection
        {
          code: `
            function MeshComp({ geo, mat }) {
              const mesh = useMemo(() => new THREE.Mesh(geo, mat), [geo, mat]);
              return null;
            }
          `,
        },
        // useMemo result not assigned to anything (used as expression) — skipped
        {
          code: `
            function InlineComp() {
              return useMemo(() => new THREE.BufferGeometry(), []);
            }
          `,
        },
      ],

      invalid: [
        // BufferGeometry, expression body
        {
          code: `
            function MissingDispose() {
              const geometry = useMemo(() => new THREE.BufferGeometry(), []);
              return null;
            }
          `,
          errors: [{ messageId: 'missingUseDisposable', data: { name: 'geometry' } }],
        },
        // MeshStandardMaterial, expression body
        {
          code: `
            function MissingMaterial() {
              const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: 'blue' }), []);
              return null;
            }
          `,
          errors: [{ messageId: 'missingUseDisposable', data: { name: 'mat' } }],
        },
        // CanvasTexture
        {
          code: `
            function MissingTexture({ canvas }) {
              const tex = useMemo(() => new THREE.CanvasTexture(canvas), [canvas]);
              return null;
            }
          `,
          errors: [{ messageId: 'missingUseDisposable', data: { name: 'tex' } }],
        },
        // WebGLRenderTarget
        {
          code: `
            function MissingRT() {
              const rt = useMemo(() => new THREE.WebGLRenderTarget(512, 512), []);
              return null;
            }
          `,
          errors: [{ messageId: 'missingUseDisposable', data: { name: 'rt' } }],
        },
        // Block body, BufferGeometry assigned inside — Site 6/7 shape minus the useDisposable
        {
          code: `
            function MissingBlockBody({ verts }) {
              const geo = useMemo(() => {
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
                return g;
              }, [verts]);
              return null;
            }
          `,
          errors: [{ messageId: 'missingUseDisposable', data: { name: 'geo' } }],
        },
        // useDisposable called with the WRONG identifier — should still warn
        {
          code: `
            function WrongName() {
              const geometry = useMemo(() => new THREE.BufferGeometry(), []);
              useDisposable(somethingElse);
              return null;
            }
          `,
          errors: [{ messageId: 'missingUseDisposable', data: { name: 'geometry' } }],
        },
        // useDisposable for sibling but not for this geometry (Site 5 partial)
        {
          code: `
            function PartialMannequin() {
              const bodyGeometry = useMemo(() => new THREE.LatheGeometry(points, 48), []);
              useDisposable(bodyGeometry);
              const standGeometry = useMemo(() => new THREE.LatheGeometry(points, 32), []);
              return null;
            }
          `,
          errors: [{ messageId: 'missingUseDisposable', data: { name: 'standGeometry' } }],
        },
      ],
    });
  });
});
