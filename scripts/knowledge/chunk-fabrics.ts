/**
 * Knowledge Chunking: Physical Fabric Library
 *
 * Extracts fabric knowledge from PHYSICAL_FABRIC_LIBRARY into
 * KnowledgeChunk arrays, organized by category.
 *
 * Run: npx tsx scripts/knowledge/chunk-fabrics.ts
 * Output: scripts/knowledge/output/fabric-chunks.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { KnowledgeChunk, ChunkMetadata } from '../../src/copilot/knowledge/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const chunks: KnowledgeChunk[] = [];
let nextId = 1;

function addChunk(content: string, metadata: ChunkMetadata): void {
  chunks.push({
    id: `fabric-${String(nextId++).padStart(3, '0')}`,
    content,
    metadata,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FABRIC PROPERTY DEFINITIONS — what the numbers mean
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'Fabric property definitions for pattern making and simulation: ' +
  'Weight (GSM / g/m2): mass per unit area. Lightweight < 150 GSM (chiffon, voile), medium 150-300 GSM (poplin, jersey), heavy > 300 GSM (denim, canvas). ' +
  'Thickness (mm): physical thickness affecting drape and seam bulk. Ranges from 0.1mm (chiffon) to 3.0mm (neoprene). ' +
  'Stretch (%): elongation under standard load in warp (along grain), weft (across grain), and bias (45 degrees) directions. ' +
  'Recovery rate (0-1): how much the fabric returns to original size after stretching. 1.0 = full elastic recovery (spandex), 0.1 = permanent deformation (cotton). ' +
  'Bending rigidity (mN.cm, Kawabata units): resistance to bending in warp and weft directions. Lower = more fluid drape.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:definitions-1',
    category: 'fabric-property',
    tags: ['fabric', 'properties', 'GSM', 'stretch', 'bending', 'definitions'],
    difficulty: 'basic',
  },
);

addChunk(
  'Fabric surface and structural property definitions: ' +
  'Drape coefficient (0-1): 0 = stiff like cardboard (canvas, felt), 1 = fluid like water (chiffon, charmeuse). Determines how fabric falls and gathers. ' +
  'Shear stiffness (N/m): resistance to diagonal distortion. High values = fabric resists twisting (denim). Low values = fabric twists easily (jersey). ' +
  'Shear hysteresis (N/m): energy lost in a shear cycle. Higher values indicate greater wrinkle tendency. ' +
  'Friction: kinetic friction coefficient for fabric-on-fabric and fabric-on-body contact. Affects how layers slide over each other. ' +
  'Internal damping (0-1): 0 = fluid, oscillates freely (silk). 1 = heavy, settles quickly (felt). Controls how quickly fabric motion dampens. ' +
  'Surface roughness (0-1): 0 = smooth (satin, leather), 1 = rough (canvas, felt). Affects visual appearance and friction behavior. ' +
  'Tensile strength (N/5cm): force at break in warp and weft directions per ISO 13934. Tear strength (N) measured by Elmendorf test per ISO 13937.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:definitions-2',
    category: 'fabric-property',
    tags: ['fabric', 'properties', 'drape', 'shear', 'friction', 'damping', 'strength'],
    difficulty: 'basic',
  },
);

addChunk(
  'Weave type classifications: ' +
  'Plain weave: most common, threads interlace over-under alternately. Examples: poplin, broadcloth, muslin, voile. Balanced, stable, tends to wrinkle. ' +
  'Twill weave: diagonal rib pattern, threads pass over 2+ then under 1. Examples: denim, gabardine, chino. More durable, slight stretch on bias. ' +
  'Satin weave: long float threads create smooth shiny surface. Examples: charmeuse, duchess satin. Slippery, prone to snagging. ' +
  'Knit jersey: single knit loop structure. Examples: cotton jersey, lycra. High stretch, rolls at edges. ' +
  'Knit rib: alternating face/back stitches create vertical ridges. Examples: 1x1 rib, 2x2 rib. Very high weft stretch, used for cuffs/collars. ' +
  'Knit interlock: double knit, face on both sides. Examples: ponte roma, scuba. More stable than jersey, less roll. ' +
  'Nonwoven: fibers bonded without weaving. Examples: felt, fusible interfacing. No grain direction, does not fray. ' +
  'Leather: natural or synthetic hide. No grain direction in traditional sense, does not fray, cannot be pressed. ' +
  'Mesh: open structure with holes. Examples: tulle, athletic mesh. Lightweight, breathable, sheer. ' +
  'Pile: raised surface fibers. Examples: velvet, fleece, terry. Nap direction matters for cutting. ' +
  'Technical: engineered fabrics. Examples: neoprene, ripstop, gore-tex. Specialized performance properties.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:weave-types',
    category: 'fabric-property',
    tags: ['fabric', 'weave', 'plain', 'twill', 'satin', 'knit', 'nonwoven', 'leather', 'mesh'],
    difficulty: 'basic',
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// WOVEN PLAINS — poplin, broadcloth, muslin, voile
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'Woven plain-weave fabrics in the library: ' +
  'Cotton Poplin (Popelina de Algodon): 100% Cotton, 130 GSM, 0.3mm thick. Low stretch (warp 2%, weft 3%, bias 12%). ' +
  'Moderate bending rigidity (0.8/0.5 mN.cm warp/weft), drape coefficient 0.45. Good for shirts, dresses, and structured garments. ' +
  'Cotton Broadcloth (Percal de Algodon): 100% Cotton, 115 GSM, 0.25mm thick. Similar to poplin but lighter and smoother. ' +
  'Drape coefficient 0.5. Good for dress shirts. ' +
  'Muslin/Toile (Muselina): 100% Cotton, 90 GSM, 0.2mm thick. Very low bending (0.3/0.2 mN.cm), drape 0.6. ' +
  'The standard fabric for prototype garments (toiles). Lightweight, inexpensive, easy to mark and alter. ' +
  'Cotton Voile (Voile de Algodon): 100% Cotton, 70 GSM, 0.15mm thick. Very light and semi-sheer. ' +
  'Excellent drape (0.7). Good for summer blouses, curtains, and overlays.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:woven-plain',
    category: 'fabric-property',
    tags: ['fabric', 'woven', 'plain', 'cotton', 'poplin', 'broadcloth', 'muslin', 'voile'],
    garmentTypes: ['bodice', 'skirt'],
    difficulty: 'intermediate',
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// WOVEN TWILLS — denim, gabardine, chino
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'Woven twill-weave fabrics in the library: ' +
  'Denim 12oz: 100% Cotton, 400 GSM, 0.9mm thick. Very low stretch (warp 1%, weft 2%), high bending rigidity (3.5/2.8 mN.cm). ' +
  'Drape coefficient 0.15 (very stiff). High friction (0.7). Used for jeans, jackets, bags. Requires wider seam allowances due to bulk. ' +
  'Stretch Denim: 98% Cotton 2% Elastane, 350 GSM, 0.8mm thick. Significant weft stretch (15%) with good recovery (0.85). ' +
  'More comfortable than rigid denim while maintaining similar appearance. Used for fitted jeans. ' +
  'Wool Gabardine (Gabardina de Lana): 100% Wool, 260 GSM, 0.6mm thick. Moderate stretch, drape 0.3. ' +
  'Classic suiting and trouser fabric. Presses well, holds creases. Suitable for tailored garments. ' +
  'Cotton Twill/Chino (Sarga de Algodon): 100% Cotton, 220 GSM, 0.5mm thick. Drape 0.35. ' +
  'Workwear and casual trousers. More durable than plain weave but less rigid than denim.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:woven-twill',
    category: 'fabric-property',
    tags: ['fabric', 'woven', 'twill', 'denim', 'gabardine', 'chino', 'wool', 'cotton'],
    garmentTypes: ['bodice', 'skirt'],
    difficulty: 'intermediate',
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SATINS
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'Satin-weave fabrics in the library: ' +
  'Silk Charmeuse (Charmeuse de Seda): 100% Silk, 75 GSM, 0.15mm thick. Moderate stretch (warp 4%, weft 6%, bias 18%). ' +
  'Extremely low bending rigidity (0.1/0.08 mN.cm), drape coefficient 0.9 (very fluid). Very low friction (0.25). ' +
  'The most fluid fabric in the library. Used for evening wear, linings, bias-cut dresses. Difficult to handle due to slipperiness. ' +
  'Duchess Satin (Satin Duquesa): 100% Polyester, 200 GSM, 0.5mm thick. Much stiffer than charmeuse. ' +
  'Bending 1.8/1.2 mN.cm, drape 0.35. Used for structured bridal gowns and evening wear. ' +
  'Holds shape better than charmeuse but maintains the characteristic satin sheen.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:satin',
    category: 'fabric-property',
    tags: ['fabric', 'satin', 'silk', 'charmeuse', 'duchess', 'evening', 'bridal'],
    garmentTypes: ['bodice', 'skirt'],
    difficulty: 'intermediate',
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// KNITS — jersey, ponte, rib, lycra, scuba
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'Knit fabrics in the library (jersey and interlock): ' +
  'Cotton Jersey (Jersey de Algodon): 100% Cotton, 180 GSM, 0.6mm thick. High weft stretch (40%) with moderate recovery (0.6). ' +
  'Low bending (0.2/0.15 mN.cm), drape 0.75. The standard t-shirt fabric. Rolls at edges, needs special needle and stitch types. ' +
  'Ponte Roma: 65% Rayon 30% Nylon 5% Spandex, 280 GSM, 0.8mm thick. Structured double knit with excellent recovery (0.9). ' +
  'Weft stretch 25%, drape 0.55. Used for dresses, trousers, and jackets. More stable than jersey, minimal edge rolling. ' +
  'Scuba Knit (Neopreno Textil): 95% Polyester 5% Spandex, 320 GSM, 1.2mm thick. ' +
  'Weft stretch 20%, drape 0.3 (structured). Holds shape well for architectural designs. Used for modern dresses and skirts.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:knit-jersey-interlock',
    category: 'fabric-property',
    tags: ['fabric', 'knit', 'jersey', 'cotton', 'ponte', 'scuba', 'interlock'],
    garmentTypes: ['bodice', 'skirt'],
    difficulty: 'intermediate',
  },
);

addChunk(
  'Knit fabrics in the library (rib, lycra, athletic mesh): ' +
  'Rib Knit 2x2 (Punto Canale): 95% Cotton 5% Elastane, 220 GSM, 0.7mm thick. Extremely high weft stretch (80%) with excellent recovery (0.9). ' +
  'Used primarily for trims: collars, cuffs, waistbands, and neckline bindings. Not typically used for main garment body. ' +
  'Lycra/Spandex 4-way stretch (Licra): 80% Nylon 20% Spandex, 220 GSM, 0.5mm thick. Highest stretch in library (warp 60%, weft 80%). ' +
  'Near-perfect recovery (0.95), very low bending (0.05 mN.cm), drape 0.85. Used for swimwear, activewear, compression garments. ' +
  'Requires negative ease in pattern (body measurements minus 10-20%). ' +
  'Athletic Mesh (Malla Deportiva): 100% Polyester, 120 GSM, 0.4mm thick. Open mesh structure, highly breathable. ' +
  'Moderate stretch (weft 30%), drape 0.7. Used for sportswear panels and ventilation zones.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:knit-stretch',
    category: 'fabric-property',
    tags: ['fabric', 'knit', 'rib', 'lycra', 'spandex', 'mesh', 'sportswear', 'stretch'],
    garmentTypes: ['bodice', 'sleeve'],
    difficulty: 'intermediate',
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SHEERS — organza, chiffon, tulle
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'Sheer fabrics in the library: ' +
  'Organza: 100% Polyester, 55 GSM, 0.1mm thick. Very low stretch. Bending 0.3/0.2 mN.cm, drape 0.35. ' +
  'Crisp and stiff despite being sheer. Used for structured evening wear, ruffles, and overlays. Frays easily, needs French seams. ' +
  'Chiffon (Gasa): 100% Polyester, 45 GSM, 0.1mm thick. Very low bending (0.05/0.04 mN.cm), drape 0.92 (most fluid after charmeuse). ' +
  'The lightest woven fabric in the library. Extremely difficult to cut and sew due to shifting. Requires tissue paper backing when cutting. ' +
  'Used for evening wear, blouse overlays, scarves. ' +
  'Tulle (Tul): 100% Nylon, 30 GSM, 0.15mm thick. Open mesh structure, drape 0.8. ' +
  'The lightest fabric in the library. Used for bridal veils, ballet tutus, and decorative overlays. Does not fray due to mesh structure.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:sheer',
    category: 'fabric-property',
    tags: ['fabric', 'sheer', 'organza', 'chiffon', 'tulle', 'lightweight', 'evening'],
    garmentTypes: ['bodice', 'skirt'],
    difficulty: 'intermediate',
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// NATURAL FIBERS — linen, wool crepe, wool flannel
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'Natural fiber fabrics in the library: ' +
  'Linen (Lino): 100% Linen, 170 GSM, 0.4mm thick. Low stretch (warp 2%, weft 3%), low recovery (0.15 — wrinkles easily). ' +
  'Bending 1.5/1.0 mN.cm, drape 0.4. Crisp hand, iconic for summer garments. Requires pre-washing as it shrinks. ' +
  'Wool Crepe (Crepe de Lana): 100% Wool, 200 GSM, 0.5mm thick. Moderate stretch and recovery (0.5). ' +
  'Drape 0.55. Excellent for draped dresses and fluid suiting. The crepe twist gives a slightly textured surface. ' +
  'Wool Flannel (Franela de Lana): 100% Wool, 280 GSM, 0.8mm thick. Bending 1.8/1.3 mN.cm, drape 0.35. ' +
  'Brushed surface, soft hand, slightly structured. Classic for suiting, coats, and winter garments. Takes pressing well.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:natural',
    category: 'fabric-property',
    tags: ['fabric', 'natural', 'linen', 'wool', 'crepe', 'flannel', 'summer', 'winter'],
    garmentTypes: ['bodice', 'skirt'],
    difficulty: 'intermediate',
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// HEAVY / STRUCTURED — canvas, ripstop
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'Heavy and structured fabrics in the library: ' +
  'Canvas 12oz (Lona 12oz): 100% Cotton, 500 GSM, 1.2mm thick. Minimal stretch (warp 1%, weft 1%). ' +
  'Highest bending rigidity in library (4.0/3.5 mN.cm), drape 0.08 (extremely stiff). Very high friction (0.7). ' +
  'Used for bags, upholstery, workwear. Requires heavy-duty needles and walking foot machine. ' +
  'Ripstop Nylon: 100% Nylon, 70 GSM, 0.1mm thick. Lightweight but extremely strong (tear strength 40N). ' +
  'Drape 0.65. The reinforced grid structure prevents tear propagation. Used for outdoor jackets, tents, kites, parachutes.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:heavy',
    category: 'fabric-property',
    tags: ['fabric', 'heavy', 'canvas', 'ripstop', 'nylon', 'workwear', 'outdoor'],
    garmentTypes: ['bodice'],
    difficulty: 'intermediate',
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// LEATHER — lambskin, faux leather
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'Leather and faux leather in the library: ' +
  'Lambskin Leather (Cuero de Cordero): Natural leather, 600 GSM, 0.8mm thick. Moderate stretch (warp 15%, weft 25%) but low recovery (0.2). ' +
  'Very high bending rigidity (5.0/4.0 mN.cm), drape 0.2, very high internal damping (0.8). ' +
  'Cannot be pinned (use clips), cannot be pressed with iron (use mallet). Seams are glued open, not pressed. ' +
  'Faux Leather PU (Cuero Sintetico): PU-coated Polyester, 450 GSM, 0.6mm thick. Lower stretch than real leather. ' +
  'Drape 0.25, high damping (0.75). More uniform than natural leather but does not age as well. ' +
  'Both leather types require specialized sewing techniques: longer stitch length, Teflon foot, no pinning, no topstitching do-overs.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:leather',
    category: 'fabric-property',
    tags: ['fabric', 'leather', 'lambskin', 'faux-leather', 'PU', 'specialty'],
    garmentTypes: ['bodice'],
    difficulty: 'advanced',
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SPECIALTY — neoprene, felt, fleece, velvet
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'Specialty fabrics in the library: ' +
  'Neoprene 3mm: CR/SBR Rubber + Nylon lining, 450 GSM, 3.0mm thick (thickest in library). ' +
  'Highest bending rigidity (8.0 mN.cm), drape 0.1. Stretch 15-20% with excellent recovery (0.85). ' +
  'Seams are often glued and blind-stitched rather than conventional stitching. Used for wetsuits and structured fashion pieces. ' +
  'Wool Felt (Fieltro de Lana): 100% Wool nonwoven, 350 GSM, 2.0mm thick. No grain direction, does not fray. ' +
  'Drape 0.1, highest internal damping in library (0.9). Cut edges do not require finishing. Used for hats, bags, and craft. ' +
  'Polar Fleece (Polar): 100% Polyester, 250 GSM, 2.5mm thick. Low bending (0.3), drape 0.55. ' +
  'Warm, lightweight, quick-drying. Does not fray. Used for casual outerwear and blankets. ' +
  'Silk Velvet (Terciopelo de Seda): 82% Rayon 18% Silk, 280 GSM, 1.0mm thick. ' +
  'Drape 0.65, high friction (0.7 — pile grips). Nap direction critical: all pieces must be cut in same direction. Used for evening wear.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:specialty',
    category: 'fabric-property',
    tags: ['fabric', 'neoprene', 'felt', 'fleece', 'velvet', 'specialty', 'pile'],
    garmentTypes: ['bodice'],
    difficulty: 'advanced',
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// LININGS & INTERFACINGS
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'Linings and interfacings in the library: ' +
  'Polyester Lining (Forro de Poliester): 100% Polyester, 60 GSM, 0.1mm thick. Very low friction (0.15). ' +
  'Drape 0.85 (very fluid). Used inside jackets, coats, skirts to allow easy wear and prevent shell fabric from clinging to body. ' +
  'Lining patterns are typically cut 1cm shorter than shell pieces and with wider seam allowances at hems. ' +
  'Fusible Interfacing Medium (Entretela Termoadhesiva): Polyester nonwoven + adhesive, 90 GSM, 0.3mm thick. ' +
  'No stretch (1% all directions), drape 0.1 (very stiff). Fused to fabric with heat and pressure. ' +
  'Used to stabilize collar stands, cuffs, button stands, waistbands, and pocket openings. ' +
  'Must be pre-tested for bond quality and should not be used on heat-sensitive fabrics.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:lining-interfacing',
    category: 'fabric-property',
    tags: ['fabric', 'lining', 'interfacing', 'fusible', 'structure', 'collar', 'cuff'],
    garmentTypes: ['bodice', 'collar'],
    difficulty: 'intermediate',
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION PARAMETER MAPPING — how physical properties map to solver
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'Physical fabric to XPBD simulation parameter mapping: ' +
  'Stretch compliance: % elongation / 10 gives compliance value. Higher stretch = higher compliance = easier to stretch in simulation. ' +
  'Example: cotton poplin (2% warp) = 0.2 compliance; lycra (60% warp) = 6.0 compliance. ' +
  'Bend compliance: inverse of bending rigidity. formula: 1 / (bendingRigidity + 0.05), clamped minimum 0.05. ' +
  'Example: chiffon (0.05 mN.cm) = 10.0 compliance (very floppy); neoprene (8.0 mN.cm) = 0.124 compliance (very stiff). ' +
  'Shear compliance: 10 / (shearStiffness + 1). Example: jersey (10 N/m shear) = 0.91; denim (120 N/m shear) = 0.083. ' +
  'Damping: 0.95 + (weight/500) x 0.049, so heavier fabrics settle faster. ' +
  'Density for gravity: GSM / 1000 gives kg/m2. This affects how fast fabric falls under gravity.',
  {
    source: 'house-rules',
    sourceRef: 'physicalFabric:simulation-mapping',
    category: 'fabric-property',
    tags: ['fabric', 'simulation', 'XPBD', 'compliance', 'solver', 'physics'],
    difficulty: 'advanced',
  },
);

// ─── Write output ────────────────────────────────────────────────────────────

const outputDir = path.join(__dirname, 'output');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, 'fabric-chunks.json'),
  JSON.stringify(chunks, null, 2),
);
console.log(`Generated ${chunks.length} fabric chunks → scripts/knowledge/output/fabric-chunks.json`);
