/**
 * Fabric Material Library for XPBD Cloth Simulation
 *
 * Maps real-world fabric properties to XPBD compliance values.
 * Physical properties are based on typical textile engineering data.
 *
 * @module fabricLibrary
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Basic fabric shape — public API surface for plugins + simple consumers.
 *
 * Used by:
 * - Plugin system (`PluginFabric.material`) — contract for plugin authors.
 * - Copilot `simulationTools` for simple fabric lookup via `FABRIC_LIBRARY`.
 *
 * For modern sim/render/diagnostic paths, see `PhysicalFabric`
 * (`src/utils/cloth/physicalFabric.ts`). NOT a deprecating legacy —
 * intentionally kept as the basic shape that plugin authors can supply
 * without needing the 25+ engineering fields of `PhysicalFabric`.
 *
 * Cross-ref: D6 ratification doc, CLAUDE.md "Fabric type 3-tier API surface".
 */
export interface FabricMaterial {
  /** Human-readable name */
  name: string;
  /** Fabric weight in grams per square meter (GSM) */
  weight: number;
  /** Stretching stiffness 0-1 (1 = very stiff, no stretch) */
  stretchStiffness: number;
  /** Bending stiffness 0-1 (1 = very stiff, no drape) */
  bendStiffness: number;
  /** Surface friction coefficient 0-1 */
  friction: number;
  /** Fabric thickness in millimeters */
  thickness: number;
  /** Display color (hex) for 3D rendering */
  color?: string;
  /** PBR roughness 0-1 (0 = glossy/silk, 1 = matte/canvas) */
  roughness?: number;
}

/**
 * XPBD compliance values derived from fabric properties.
 */
export interface XPBDCompliance {
  /** Stretching compliance for XPBD solver (lower = stiffer) */
  stretchingCompliance: number;
  /** Bending compliance for XPBD solver (higher = more flexible) */
  bendingCompliance: number;
  /** Damping factor 0-1 */
  damping: number;
  /** Ground friction coefficient */
  groundFriction: number;
}

// ─── Fabric Library ─────────────────────────────────────────────────────────

/**
 * Built-in fabric material definitions.
 *
 * Weight (GSM) sources: textile engineering references
 * Stiffness values: approximated from drape coefficients and bending rigidity data
 *
 * | Fabric            | GSM       | Stretch | Bend  | Notes                         |
 * |-------------------|-----------|---------|-------|-------------------------------|
 * | Cotton Poplin     | 110-150   | High    | Med   | Crisp plain weave             |
 * | Denim             | 280-400   | High    | High  | Twill weave, stiff            |
 * | Silk Charmeuse    | 60-90     | Low     | Low   | Satin weave, fluid drape      |
 * | Wool Crepe        | 150-220   | Med     | Med   | Textured, moderate drape      |
 * | Jersey Knit       | 150-250   | Low     | Low   | Knit, very stretchy           |
 * | Organza           | 40-70     | High    | Med   | Sheer, crisp                  |
 * | Linen             | 140-200   | High    | Med   | Natural fiber, moderate drape |
 * | Neoprene          | 200-400   | Med     | High  | Rubber-coated, structured     |
 * | Chiffon           | 30-60     | Med     | Low   | Sheer, floaty                 |
 * | Canvas            | 300-600   | High    | High  | Heavy, very stiff             |
 */
export const FABRIC_LIBRARY: Record<string, FabricMaterial> = {
  'cotton-poplin': {
    name: 'Cotton Poplin',
    weight: 130,
    stretchStiffness: 0.85,
    bendStiffness: 0.45,
    friction: 0.5,
    thickness: 0.3,
    color: '#f5f0e8',
    roughness: 0.75,
  },
  'denim': {
    name: 'Denim',
    weight: 340,
    stretchStiffness: 0.95,
    bendStiffness: 0.80,
    friction: 0.7,
    thickness: 0.9,
    color: '#3a5a8c',
    roughness: 0.85,
  },
  'silk-charmeuse': {
    name: 'Silk Charmeuse',
    weight: 75,
    stretchStiffness: 0.60,
    bendStiffness: 0.10,
    friction: 0.25,
    thickness: 0.15,
    color: '#e8d8c8',
    roughness: 0.15,
  },
  'wool-crepe': {
    name: 'Wool Crepe',
    weight: 185,
    stretchStiffness: 0.70,
    bendStiffness: 0.50,
    friction: 0.55,
    thickness: 0.5,
    color: '#4a4a4a',
    roughness: 0.80,
  },
  'jersey-knit': {
    name: 'Jersey Knit',
    weight: 200,
    stretchStiffness: 0.30,
    bendStiffness: 0.15,
    friction: 0.45,
    thickness: 0.6,
    color: '#2a2a2a',
    roughness: 0.60,
  },
  'organza': {
    name: 'Organza',
    weight: 55,
    stretchStiffness: 0.90,
    bendStiffness: 0.55,
    friction: 0.20,
    thickness: 0.1,
    color: '#f0e8f0',
    roughness: 0.20,
  },
  'linen': {
    name: 'Linen',
    weight: 170,
    stretchStiffness: 0.88,
    bendStiffness: 0.50,
    friction: 0.50,
    thickness: 0.4,
    color: '#d8ccb8',
    roughness: 0.80,
  },
  'neoprene': {
    name: 'Neoprene',
    weight: 300,
    stretchStiffness: 0.55,
    bendStiffness: 0.85,
    friction: 0.75,
    thickness: 2.0,
    color: '#1a1a1a',
    roughness: 0.40,
  },
  'chiffon': {
    name: 'Chiffon',
    weight: 45,
    stretchStiffness: 0.65,
    bendStiffness: 0.08,
    friction: 0.20,
    thickness: 0.1,
    color: '#f8f0f0',
    roughness: 0.10,
  },
  'canvas': {
    name: 'Canvas',
    weight: 450,
    stretchStiffness: 0.97,
    bendStiffness: 0.90,
    friction: 0.70,
    thickness: 1.2,
    color: '#c8b898',
    roughness: 0.95,
  },
};

// ─── Conversion Functions ───────────────────────────────────────────────────

/**
 * Convert a FabricMaterial's physical properties to XPBD compliance values.
 *
 * The mapping follows these principles:
 * - **Stretching compliance**: Inverse exponential of stretchStiffness.
 *   A stiffness of 1.0 maps to ~0 compliance (rigid), 0.0 maps to ~10 (very stretchy).
 * - **Bending compliance**: Inverse relationship with bendStiffness.
 *   Stiff fabrics (denim) get low compliance (~0.1), flowy fabrics (chiffon) get high (~20).
 * - **Damping**: Heavier fabrics have slightly more damping (less bouncy).
 *
 * @param material - Fabric material with physical properties
 * @returns XPBD compliance values for the solver
 */
export function fabricToCompliance(material: FabricMaterial): XPBDCompliance {
  // Stretching: stiffness 0→compliance ~10, stiffness 1→compliance ~0
  // Exponential curve for more physical behavior
  const stretchingCompliance = Math.max(0, (1 - material.stretchStiffness) * 10);

  // Bending: stiffness 0→compliance ~20, stiffness 1→compliance ~0.05
  // Wider range than stretching since drape varies enormously
  const bendingCompliance = Math.max(0.05, (1 - material.bendStiffness) * 20);

  // Damping: heavier fabrics damp more (range 0.95-0.999)
  const weightFactor = Math.min(material.weight / 500, 1.0);
  const damping = 0.95 + weightFactor * 0.049;

  return {
    stretchingCompliance,
    bendingCompliance,
    damping,
    groundFriction: material.friction,
  };
}

/**
 * Get a list of all available fabric IDs.
 *
 * @returns Array of fabric key strings
 */
export function getAllFabricIds(): string[] {
  return Object.keys(FABRIC_LIBRARY);
}

/**
 * Get a fabric material by its ID.
 *
 * @param id - Fabric key (e.g. 'cotton-poplin')
 * @returns FabricMaterial or undefined if not found
 */
export function getFabricById(id: string): FabricMaterial | undefined {
  return FABRIC_LIBRARY[id];
}

/**
 * Get XPBD compliance values for a fabric by ID.
 *
 * @param id - Fabric key
 * @returns XPBDCompliance values or default cotton values if not found
 */
export function getComplianceForFabric(id: string): XPBDCompliance {
  const material = FABRIC_LIBRARY[id] ?? FABRIC_LIBRARY['cotton-poplin'];
  return fabricToCompliance(material);
}

/**
 * Validate that a FabricMaterial has sensible values.
 *
 * @param material - Material to validate
 * @returns true if all values are in valid ranges
 */
export function isValidFabricMaterial(material: FabricMaterial): boolean {
  return (
    typeof material.name === 'string' &&
    material.name.length > 0 &&
    material.weight > 0 &&
    material.weight <= 1000 &&
    material.stretchStiffness >= 0 &&
    material.stretchStiffness <= 1 &&
    material.bendStiffness >= 0 &&
    material.bendStiffness <= 1 &&
    material.friction >= 0 &&
    material.friction <= 1 &&
    material.thickness > 0 &&
    material.thickness <= 10
  );
}
