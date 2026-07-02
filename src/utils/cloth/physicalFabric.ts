/**
 * Physical Fabric Library — engineering-grade textile properties.
 *
 * Anisotropic warp/weft data, shear, tensile strength, composition metadata.
 * Used as the primary fabric type for sim solver, diagnostic, render, and
 * modern copilot tools (~60 callsites). Values sourced from textile
 * engineering literature (Kawabata KES, FAST system, ISO standards).
 *
 * The basic `FabricMaterial` in fabricLibrary.ts remains as a separate, more
 * public API surface for plugin authors and simple copilot tools — NOT a
 * deprecating legacy. The two types serve distinct consumer audiences.
 *
 * Cross-ref: `docs/reports/2026-04-30-drift-fase2-d6-fabric-types.md`.
 *
 * @module physicalFabric
 */

import type { XPBDCompliance } from './fabricLibrary';

// ─── Types ──────────────────────────────────────────────────────────────────

export type WeaveType =
  | 'plain'           // poplin, broadcloth, muslin
  | 'twill'           // denim, gabardine, herringbone
  | 'satin'           // charmeuse, duchess
  | 'knit-jersey'     // single jersey, t-shirt fabric
  | 'knit-rib'        // 1x1 rib, 2x2 rib
  | 'knit-interlock'  // ponte roma, double knit
  | 'nonwoven'        // felt, interfacing
  | 'leather'         // leather, suede, faux leather
  | 'mesh'            // tulle, net
  | 'pile'            // velvet, fleece, terry
  | 'technical';      // neoprene, ripstop, gore-tex

export type FabricSource = 'library' | 'custom' | 'lab-tested' | 'community';

/**
 * Engineering-grade fabric properties for cloth simulation, diagnostic,
 * and render. Primary modern fabric type (~60 callsites).
 *
 * Anisotropic warp/weft data, shear, tensile strength, composition metadata.
 *
 * For plugin/copilot basic shape, see `FabricMaterial`
 * (`src/utils/cloth/fabricLibrary.ts`). For project catalog entries, see
 * `Fabric` (`src/types/types.ts`).
 *
 * Cross-ref: `docs/reports/2026-04-30-drift-fase2-d6-fabric-types.md`.
 */
export interface PhysicalFabric {
  /** Unique ID (slug format) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Localized name (Spanish) */
  nameEs: string;

  // ─── Composition ───
  composition: string;         // "100% Cotton", "95% Polyester 5% Elastane"
  weaveType: WeaveType;

  // ─── Mass & dimensions ───
  weight: number;              // g/m² (GSM)
  thickness: number;           // mm

  // ─── Stretch (% elongation at standard load) ───
  stretchWarp: number;         // % along grainline (warp direction)
  stretchWeft: number;         // % across grain (weft direction)
  stretchBias: number;         // % at 45° diagonal
  recoveryRate: number;        // 0-1 (1 = full elastic recovery)

  // ─── Bending rigidity (Kawabata units: mN·cm) ───
  bendingWarp: number;         // mN·cm in warp direction
  bendingWeft: number;         // mN·cm in weft direction
  drapeCoefficient: number;    // 0-1 (0 = stiff like cardboard, 1 = fluid like water)

  // ─── Shear ───
  shearStiffness: number;      // N/m (resistance to diagonal distortion)
  shearHysteresis: number;     // N/m (energy lost in shear cycle — wrinkle tendency)

  // ─── Surface ───
  friction: number;            // kinetic friction coefficient (fabric-on-fabric)
  frictionBody: number;        // friction against skin/body
  /** Internal damping (0.0 = fluid/oscillates, 1.0 = heavy/settles quickly) */
  internalDamping: number;
  surfaceRoughness: number;    // 0-1 (0 = smooth, 1 = rough)

  // ─── Strength (for stress/strain maps) ───
  tensileStrengthWarp: number; // N/5cm (force at break, warp direction, ISO 13934)
  tensileStrengthWeft: number; // N/5cm (force at break, weft direction)
  tearStrength: number;        // N (Elmendorf tear test, ISO 13937)
  maxStretchBeforeBreak: number; // % elongation at break

  // ─── Metadata ───
  source: FabricSource;
  supplier?: string;
  articleNumber?: string;
  notes?: string;
  /** Tags for search */
  tags: string[];
  /** Optional texture map paths */
  textures?: FabricTextures;
}

/** Paths to texture map files relative to public/textures/fabrics/ */
export interface FabricTextures {
  diffuse?: string;
  normal?: string;
  roughness?: string;
  ao?: string;
}

// ─── Library ────────────────────────────────────────────────────────────────

export const PHYSICAL_FABRIC_LIBRARY: PhysicalFabric[] = [

  // ─── WOVENS: Plain weave ──────────────────────────────────────────────
  {
    id: 'cotton-poplin',
    name: 'Cotton Poplin',
    nameEs: 'Popelina de Algodón',
    composition: '100% Cotton',
    weaveType: 'plain',
    weight: 130,
    thickness: 0.3,
    stretchWarp: 2, stretchWeft: 3, stretchBias: 12, recoveryRate: 0.3,
    bendingWarp: 0.8, bendingWeft: 0.5, drapeCoefficient: 0.45,
    shearStiffness: 45, shearHysteresis: 18,
    friction: 0.5, frictionBody: 0.4, internalDamping: 0.3, surfaceRoughness: 0.3,
    tensileStrengthWarp: 450, tensileStrengthWeft: 280, tearStrength: 15, maxStretchBeforeBreak: 8,
    source: 'library', tags: ['cotton', 'woven', 'plain', 'shirt', 'dress', 'lightweight'],
    textures: { diffuse: 'cotton-poplin/diffuse.jpg', normal: 'cotton-poplin/normal.png' },
  },
  {
    id: 'cotton-broadcloth',
    name: 'Cotton Broadcloth',
    nameEs: 'Percal de Algodón',
    composition: '100% Cotton',
    weaveType: 'plain',
    weight: 115,
    thickness: 0.25,
    stretchWarp: 1.5, stretchWeft: 2.5, stretchBias: 10, recoveryRate: 0.25,
    bendingWarp: 0.6, bendingWeft: 0.4, drapeCoefficient: 0.5,
    shearStiffness: 38, shearHysteresis: 15,
    friction: 0.45, frictionBody: 0.35, internalDamping: 0.3, surfaceRoughness: 0.25,
    tensileStrengthWarp: 380, tensileStrengthWeft: 240, tearStrength: 12, maxStretchBeforeBreak: 7,
    source: 'library', tags: ['cotton', 'woven', 'plain', 'shirt', 'lightweight'],
  },
  {
    id: 'muslin',
    name: 'Muslin (Toile)',
    nameEs: 'Muselina (Toile)',
    composition: '100% Cotton',
    weaveType: 'plain',
    weight: 90,
    thickness: 0.2,
    stretchWarp: 2, stretchWeft: 3, stretchBias: 15, recoveryRate: 0.2,
    bendingWarp: 0.3, bendingWeft: 0.2, drapeCoefficient: 0.6,
    shearStiffness: 20, shearHysteresis: 8,
    friction: 0.45, frictionBody: 0.35, internalDamping: 0.25, surfaceRoughness: 0.35,
    tensileStrengthWarp: 200, tensileStrengthWeft: 150, tearStrength: 8, maxStretchBeforeBreak: 12,
    source: 'library', tags: ['cotton', 'woven', 'toile', 'muslin', 'test', 'prototype'],
  },
  {
    id: 'cotton-voile',
    name: 'Cotton Voile',
    nameEs: 'Voile de Algodón',
    composition: '100% Cotton',
    weaveType: 'plain',
    weight: 70,
    thickness: 0.15,
    stretchWarp: 2, stretchWeft: 4, stretchBias: 14, recoveryRate: 0.2,
    bendingWarp: 0.15, bendingWeft: 0.1, drapeCoefficient: 0.7,
    shearStiffness: 15, shearHysteresis: 6,
    friction: 0.35, frictionBody: 0.3, internalDamping: 0.15, surfaceRoughness: 0.2,
    tensileStrengthWarp: 180, tensileStrengthWeft: 120, tearStrength: 6, maxStretchBeforeBreak: 10,
    source: 'library', tags: ['cotton', 'woven', 'sheer', 'lightweight', 'summer'],
  },

  // ─── WOVENS: Twill ────────────────────────────────────────────────────
  {
    id: 'denim-12oz',
    name: 'Denim 12oz',
    nameEs: 'Denim 12oz',
    composition: '100% Cotton',
    weaveType: 'twill',
    weight: 400,
    thickness: 0.9,
    stretchWarp: 1, stretchWeft: 2, stretchBias: 8, recoveryRate: 0.15,
    bendingWarp: 3.5, bendingWeft: 2.8, drapeCoefficient: 0.15,
    shearStiffness: 120, shearHysteresis: 50,
    friction: 0.7, frictionBody: 0.55, internalDamping: 0.6, surfaceRoughness: 0.6,
    tensileStrengthWarp: 800, tensileStrengthWeft: 500, tearStrength: 35, maxStretchBeforeBreak: 5,
    source: 'library', tags: ['denim', 'cotton', 'twill', 'heavy', 'jeans', 'rigid'],
    textures: { diffuse: 'denim-indigo/diffuse.jpg', normal: 'denim-indigo/normal.png', roughness: 'denim-indigo/roughness.jpg' },
  },
  {
    id: 'stretch-denim',
    name: 'Stretch Denim',
    nameEs: 'Denim Elástico',
    composition: '98% Cotton 2% Elastane',
    weaveType: 'twill',
    weight: 350,
    thickness: 0.8,
    stretchWarp: 3, stretchWeft: 15, stretchBias: 20, recoveryRate: 0.85,
    bendingWarp: 2.8, bendingWeft: 2.0, drapeCoefficient: 0.22,
    shearStiffness: 90, shearHysteresis: 35,
    friction: 0.65, frictionBody: 0.5, internalDamping: 0.55, surfaceRoughness: 0.55,
    tensileStrengthWarp: 700, tensileStrengthWeft: 450, tearStrength: 30, maxStretchBeforeBreak: 20,
    source: 'library', tags: ['denim', 'stretch', 'twill', 'jeans', 'elastane'],
  },
  {
    id: 'gabardine',
    name: 'Wool Gabardine',
    nameEs: 'Gabardina de Lana',
    composition: '100% Wool',
    weaveType: 'twill',
    weight: 260,
    thickness: 0.6,
    stretchWarp: 2, stretchWeft: 3, stretchBias: 10, recoveryRate: 0.5,
    bendingWarp: 2.0, bendingWeft: 1.5, drapeCoefficient: 0.3,
    shearStiffness: 65, shearHysteresis: 28,
    friction: 0.55, frictionBody: 0.45, internalDamping: 0.5, surfaceRoughness: 0.35,
    tensileStrengthWarp: 500, tensileStrengthWeft: 350, tearStrength: 20, maxStretchBeforeBreak: 8,
    source: 'library', tags: ['wool', 'twill', 'suiting', 'trousers', 'tailoring'],
  },
  {
    id: 'cotton-twill',
    name: 'Cotton Twill (Chino)',
    nameEs: 'Sarga de Algodón (Chino)',
    composition: '100% Cotton',
    weaveType: 'twill',
    weight: 220,
    thickness: 0.5,
    stretchWarp: 1.5, stretchWeft: 3, stretchBias: 10, recoveryRate: 0.2,
    bendingWarp: 1.2, bendingWeft: 0.8, drapeCoefficient: 0.35,
    shearStiffness: 55, shearHysteresis: 22,
    friction: 0.55, frictionBody: 0.45, internalDamping: 0.45, surfaceRoughness: 0.4,
    tensileStrengthWarp: 550, tensileStrengthWeft: 350, tearStrength: 18, maxStretchBeforeBreak: 7,
    source: 'library', tags: ['cotton', 'twill', 'chino', 'trouser', 'workwear'],
    textures: { diffuse: 'cotton-twill/diffuse.jpg', normal: 'cotton-twill/normal.png' },
  },

  // ─── WOVENS: Satin ────────────────────────────────────────────────────
  {
    id: 'silk-charmeuse',
    name: 'Silk Charmeuse',
    nameEs: 'Charmeuse de Seda',
    composition: '100% Silk',
    weaveType: 'satin',
    weight: 75,
    thickness: 0.15,
    stretchWarp: 4, stretchWeft: 6, stretchBias: 18, recoveryRate: 0.4,
    bendingWarp: 0.1, bendingWeft: 0.08, drapeCoefficient: 0.9,
    shearStiffness: 15, shearHysteresis: 5,
    friction: 0.25, frictionBody: 0.2, internalDamping: 0.1, surfaceRoughness: 0.05,
    tensileStrengthWarp: 250, tensileStrengthWeft: 180, tearStrength: 8, maxStretchBeforeBreak: 18,
    source: 'library', tags: ['silk', 'satin', 'luxury', 'evening', 'lightweight', 'fluid'],
    textures: { diffuse: 'silk-charmeuse/diffuse.jpg', normal: 'silk-charmeuse/normal.png', roughness: 'silk-charmeuse/roughness.jpg' },
  },
  {
    id: 'duchess-satin',
    name: 'Duchess Satin',
    nameEs: 'Satín Duquesa',
    composition: '100% Polyester',
    weaveType: 'satin',
    weight: 200,
    thickness: 0.5,
    stretchWarp: 2, stretchWeft: 3, stretchBias: 10, recoveryRate: 0.3,
    bendingWarp: 1.8, bendingWeft: 1.2, drapeCoefficient: 0.35,
    shearStiffness: 50, shearHysteresis: 20,
    friction: 0.2, frictionBody: 0.15, internalDamping: 0.35, surfaceRoughness: 0.05,
    tensileStrengthWarp: 600, tensileStrengthWeft: 400, tearStrength: 25, maxStretchBeforeBreak: 10,
    source: 'library', tags: ['satin', 'polyester', 'bridal', 'evening', 'structured'],
  },

  // ─── KNITS ────────────────────────────────────────────────────────────
  {
    id: 'cotton-jersey',
    name: 'Cotton Jersey',
    nameEs: 'Jersey de Algodón',
    composition: '100% Cotton',
    weaveType: 'knit-jersey',
    weight: 180,
    thickness: 0.6,
    stretchWarp: 8, stretchWeft: 40, stretchBias: 25, recoveryRate: 0.6,
    bendingWarp: 0.2, bendingWeft: 0.15, drapeCoefficient: 0.75,
    shearStiffness: 10, shearHysteresis: 4,
    friction: 0.45, frictionBody: 0.4, internalDamping: 0.4, surfaceRoughness: 0.35,
    tensileStrengthWarp: 300, tensileStrengthWeft: 200, tearStrength: 12, maxStretchBeforeBreak: 80,
    source: 'library', tags: ['cotton', 'jersey', 'knit', 'tshirt', 'casual', 'stretch'],
    textures: { diffuse: 'jersey-knit/diffuse.jpg', normal: 'jersey-knit/normal.png' },
  },
  {
    id: 'ponte-roma',
    name: 'Ponte Roma',
    nameEs: 'Ponte Roma',
    composition: '65% Rayon 30% Nylon 5% Spandex',
    weaveType: 'knit-interlock',
    weight: 280,
    thickness: 0.8,
    stretchWarp: 5, stretchWeft: 25, stretchBias: 15, recoveryRate: 0.9,
    bendingWarp: 0.6, bendingWeft: 0.4, drapeCoefficient: 0.55,
    shearStiffness: 25, shearHysteresis: 10,
    friction: 0.4, frictionBody: 0.35, internalDamping: 0.45, surfaceRoughness: 0.2,
    tensileStrengthWarp: 400, tensileStrengthWeft: 300, tearStrength: 18, maxStretchBeforeBreak: 60,
    source: 'library', tags: ['ponte', 'knit', 'interlock', 'dress', 'trouser', 'structured-knit'],
  },
  {
    id: 'rib-knit',
    name: 'Rib Knit 2x2',
    nameEs: 'Punto Canalé 2x2',
    composition: '95% Cotton 5% Elastane',
    weaveType: 'knit-rib',
    weight: 220,
    thickness: 0.7,
    stretchWarp: 10, stretchWeft: 80, stretchBias: 40, recoveryRate: 0.9,
    bendingWarp: 0.15, bendingWeft: 0.1, drapeCoefficient: 0.7,
    shearStiffness: 8, shearHysteresis: 3,
    friction: 0.5, frictionBody: 0.4, internalDamping: 0.4, surfaceRoughness: 0.4,
    tensileStrengthWarp: 250, tensileStrengthWeft: 150, tearStrength: 10, maxStretchBeforeBreak: 120,
    source: 'library', tags: ['rib', 'knit', 'cuff', 'collar', 'stretch', 'trim'],
  },
  {
    id: 'lycra-spandex',
    name: 'Lycra/Spandex (4-way stretch)',
    nameEs: 'Licra/Spandex (4 vías)',
    composition: '80% Nylon 20% Spandex',
    weaveType: 'knit-jersey',
    weight: 220,
    thickness: 0.5,
    stretchWarp: 60, stretchWeft: 80, stretchBias: 70, recoveryRate: 0.95,
    bendingWarp: 0.05, bendingWeft: 0.04, drapeCoefficient: 0.85,
    shearStiffness: 5, shearHysteresis: 2,
    friction: 0.35, frictionBody: 0.3, internalDamping: 0.35, surfaceRoughness: 0.15,
    tensileStrengthWarp: 350, tensileStrengthWeft: 280, tearStrength: 15, maxStretchBeforeBreak: 200,
    source: 'library', tags: ['lycra', 'spandex', 'sportswear', 'swimwear', 'activewear', 'compression'],
  },
  {
    id: 'athletic-mesh',
    name: 'Athletic Mesh',
    nameEs: 'Malla Deportiva',
    composition: '100% Polyester',
    weaveType: 'mesh',
    weight: 120,
    thickness: 0.4,
    stretchWarp: 15, stretchWeft: 30, stretchBias: 20, recoveryRate: 0.7,
    bendingWarp: 0.1, bendingWeft: 0.08, drapeCoefficient: 0.7,
    shearStiffness: 8, shearHysteresis: 3,
    friction: 0.3, frictionBody: 0.25, internalDamping: 0.25, surfaceRoughness: 0.5,
    tensileStrengthWarp: 200, tensileStrengthWeft: 150, tearStrength: 8, maxStretchBeforeBreak: 60,
    source: 'library', tags: ['mesh', 'polyester', 'sportswear', 'breathable', 'lightweight'],
  },
  {
    id: 'scuba-knit',
    name: 'Scuba Knit',
    nameEs: 'Neopreno Textil (Scuba)',
    composition: '95% Polyester 5% Spandex',
    weaveType: 'knit-interlock',
    weight: 320,
    thickness: 1.2,
    stretchWarp: 8, stretchWeft: 20, stretchBias: 15, recoveryRate: 0.85,
    bendingWarp: 1.5, bendingWeft: 1.2, drapeCoefficient: 0.3,
    shearStiffness: 40, shearHysteresis: 15,
    friction: 0.35, frictionBody: 0.3, internalDamping: 0.6, surfaceRoughness: 0.2,
    tensileStrengthWarp: 500, tensileStrengthWeft: 400, tearStrength: 22, maxStretchBeforeBreak: 50,
    source: 'library', tags: ['scuba', 'neoprene', 'structured', 'dress', 'modern'],
  },

  // ─── SHEER ────────────────────────────────────────────────────────────
  {
    id: 'organza',
    name: 'Organza',
    nameEs: 'Organza',
    composition: '100% Polyester',
    weaveType: 'plain',
    weight: 55,
    thickness: 0.1,
    stretchWarp: 1, stretchWeft: 2, stretchBias: 8, recoveryRate: 0.2,
    bendingWarp: 0.3, bendingWeft: 0.2, drapeCoefficient: 0.35,
    shearStiffness: 30, shearHysteresis: 12,
    friction: 0.2, frictionBody: 0.15, internalDamping: 0.2, surfaceRoughness: 0.1,
    tensileStrengthWarp: 200, tensileStrengthWeft: 150, tearStrength: 5, maxStretchBeforeBreak: 6,
    source: 'library', tags: ['organza', 'sheer', 'crisp', 'bridal', 'evening'],
  },
  {
    id: 'chiffon',
    name: 'Chiffon',
    nameEs: 'Gasa',
    composition: '100% Polyester',
    weaveType: 'plain',
    weight: 45,
    thickness: 0.1,
    stretchWarp: 3, stretchWeft: 5, stretchBias: 15, recoveryRate: 0.3,
    bendingWarp: 0.05, bendingWeft: 0.04, drapeCoefficient: 0.92,
    shearStiffness: 8, shearHysteresis: 3,
    friction: 0.2, frictionBody: 0.15, internalDamping: 0.1, surfaceRoughness: 0.1,
    tensileStrengthWarp: 120, tensileStrengthWeft: 80, tearStrength: 3, maxStretchBeforeBreak: 12,
    source: 'library', tags: ['chiffon', 'sheer', 'fluid', 'evening', 'blouse', 'lightweight'],
    textures: { diffuse: 'chiffon-sheer/diffuse.jpg', normal: 'chiffon-sheer/normal.png' },
  },
  {
    id: 'tulle',
    name: 'Tulle',
    nameEs: 'Tul',
    composition: '100% Nylon',
    weaveType: 'mesh',
    weight: 30,
    thickness: 0.15,
    stretchWarp: 5, stretchWeft: 8, stretchBias: 20, recoveryRate: 0.4,
    bendingWarp: 0.02, bendingWeft: 0.02, drapeCoefficient: 0.8,
    shearStiffness: 3, shearHysteresis: 1,
    friction: 0.15, frictionBody: 0.1, internalDamping: 0.1, surfaceRoughness: 0.6,
    tensileStrengthWarp: 80, tensileStrengthWeft: 60, tearStrength: 2, maxStretchBeforeBreak: 20,
    source: 'library', tags: ['tulle', 'mesh', 'bridal', 'ballet', 'sheer'],
  },

  // ─── NATURAL FIBERS ───────────────────────────────────────────────────
  {
    id: 'linen',
    name: 'Linen',
    nameEs: 'Lino',
    composition: '100% Linen',
    weaveType: 'plain',
    weight: 170,
    thickness: 0.4,
    stretchWarp: 2, stretchWeft: 3, stretchBias: 10, recoveryRate: 0.15,
    bendingWarp: 1.5, bendingWeft: 1.0, drapeCoefficient: 0.4,
    shearStiffness: 60, shearHysteresis: 25,
    friction: 0.5, frictionBody: 0.4, internalDamping: 0.35, surfaceRoughness: 0.5,
    tensileStrengthWarp: 500, tensileStrengthWeft: 350, tearStrength: 18, maxStretchBeforeBreak: 4,
    source: 'library', tags: ['linen', 'natural', 'summer', 'crisp', 'woven'],
    textures: { diffuse: 'linen-plain/diffuse.jpg', normal: 'linen-plain/normal.png' },
  },
  {
    id: 'wool-crepe',
    name: 'Wool Crepe',
    nameEs: 'Crepé de Lana',
    composition: '100% Wool',
    weaveType: 'plain',
    weight: 200,
    thickness: 0.5,
    stretchWarp: 3, stretchWeft: 5, stretchBias: 12, recoveryRate: 0.5,
    bendingWarp: 0.9, bendingWeft: 0.7, drapeCoefficient: 0.55,
    shearStiffness: 40, shearHysteresis: 16,
    friction: 0.55, frictionBody: 0.45, internalDamping: 0.4, surfaceRoughness: 0.35,
    tensileStrengthWarp: 400, tensileStrengthWeft: 280, tearStrength: 15, maxStretchBeforeBreak: 12,
    source: 'library', tags: ['wool', 'crepe', 'drape', 'dress', 'suiting'],
  },
  {
    id: 'wool-flannel',
    name: 'Wool Flannel',
    nameEs: 'Franela de Lana',
    composition: '100% Wool',
    weaveType: 'twill',
    weight: 280,
    thickness: 0.8,
    stretchWarp: 2, stretchWeft: 4, stretchBias: 10, recoveryRate: 0.4,
    bendingWarp: 1.8, bendingWeft: 1.3, drapeCoefficient: 0.35,
    shearStiffness: 55, shearHysteresis: 22,
    friction: 0.6, frictionBody: 0.5, internalDamping: 0.5, surfaceRoughness: 0.5,
    tensileStrengthWarp: 450, tensileStrengthWeft: 300, tearStrength: 18, maxStretchBeforeBreak: 8,
    source: 'library', tags: ['wool', 'flannel', 'suiting', 'coat', 'winter'],
    textures: { diffuse: 'wool-tweed/diffuse.jpg', normal: 'wool-tweed/normal.png', roughness: 'wool-tweed/roughness.jpg', ao: 'wool-tweed/ao.jpg' },
  },

  // ─── HEAVY / STRUCTURED ───────────────────────────────────────────────
  {
    id: 'canvas-12oz',
    name: 'Canvas 12oz',
    nameEs: 'Lona 12oz',
    composition: '100% Cotton',
    weaveType: 'plain',
    weight: 500,
    thickness: 1.2,
    stretchWarp: 1, stretchWeft: 1, stretchBias: 5, recoveryRate: 0.1,
    bendingWarp: 4.0, bendingWeft: 3.5, drapeCoefficient: 0.08,
    shearStiffness: 150, shearHysteresis: 60,
    friction: 0.7, frictionBody: 0.6, internalDamping: 0.65, surfaceRoughness: 0.7,
    tensileStrengthWarp: 1000, tensileStrengthWeft: 700, tearStrength: 45, maxStretchBeforeBreak: 3,
    source: 'library', tags: ['canvas', 'heavy', 'bag', 'upholstery', 'workwear', 'rigid'],
    textures: { diffuse: 'canvas-heavy/diffuse.jpg', normal: 'canvas-heavy/normal.png', roughness: 'canvas-heavy/roughness.jpg' },
  },
  {
    id: 'ripstop-nylon',
    name: 'Ripstop Nylon',
    nameEs: 'Nylon Ripstop',
    composition: '100% Nylon',
    weaveType: 'technical',
    weight: 70,
    thickness: 0.1,
    stretchWarp: 3, stretchWeft: 5, stretchBias: 12, recoveryRate: 0.4,
    bendingWarp: 0.15, bendingWeft: 0.1, drapeCoefficient: 0.65,
    shearStiffness: 20, shearHysteresis: 8,
    friction: 0.25, frictionBody: 0.2, internalDamping: 0.3, surfaceRoughness: 0.15,
    tensileStrengthWarp: 600, tensileStrengthWeft: 500, tearStrength: 40, maxStretchBeforeBreak: 15,
    source: 'library', tags: ['ripstop', 'nylon', 'outdoor', 'jacket', 'technical', 'lightweight'],
  },

  // ─── LEATHER & FAUX ───────────────────────────────────────────────────
  {
    id: 'lambskin-leather',
    name: 'Lambskin Leather',
    nameEs: 'Cuero de Cordero',
    composition: 'Natural leather',
    weaveType: 'leather',
    weight: 600,
    thickness: 0.8,
    stretchWarp: 15, stretchWeft: 25, stretchBias: 20, recoveryRate: 0.2,
    bendingWarp: 5.0, bendingWeft: 4.0, drapeCoefficient: 0.2,
    shearStiffness: 80, shearHysteresis: 35,
    friction: 0.6, frictionBody: 0.5, internalDamping: 0.8, surfaceRoughness: 0.15,
    tensileStrengthWarp: 200, tensileStrengthWeft: 150, tearStrength: 25, maxStretchBeforeBreak: 40,
    source: 'library', tags: ['leather', 'lambskin', 'jacket', 'luxury', 'natural'],
    textures: { diffuse: 'leather-smooth/diffuse.jpg', normal: 'leather-smooth/normal.png', roughness: 'leather-smooth/roughness.jpg', ao: 'leather-smooth/ao.jpg' },
  },
  {
    id: 'faux-leather',
    name: 'Faux Leather (PU)',
    nameEs: 'Cuero Sintético (PU)',
    composition: 'PU-coated Polyester',
    weaveType: 'leather',
    weight: 450,
    thickness: 0.6,
    stretchWarp: 8, stretchWeft: 12, stretchBias: 10, recoveryRate: 0.3,
    bendingWarp: 3.5, bendingWeft: 3.0, drapeCoefficient: 0.25,
    shearStiffness: 70, shearHysteresis: 30,
    friction: 0.5, frictionBody: 0.4, internalDamping: 0.75, surfaceRoughness: 0.1,
    tensileStrengthWarp: 350, tensileStrengthWeft: 250, tearStrength: 15, maxStretchBeforeBreak: 25,
    source: 'library', tags: ['faux-leather', 'PU', 'vegan', 'jacket', 'bag'],
  },

  // ─── SPECIALTY ────────────────────────────────────────────────────────
  {
    id: 'neoprene-3mm',
    name: 'Neoprene 3mm',
    nameEs: 'Neopreno 3mm',
    composition: 'CR/SBR Rubber + Nylon lining',
    weaveType: 'technical',
    weight: 450,
    thickness: 3.0,
    stretchWarp: 15, stretchWeft: 20, stretchBias: 18, recoveryRate: 0.85,
    bendingWarp: 8.0, bendingWeft: 8.0, drapeCoefficient: 0.1,
    shearStiffness: 200, shearHysteresis: 80,
    friction: 0.75, frictionBody: 0.6, internalDamping: 0.7, surfaceRoughness: 0.3,
    tensileStrengthWarp: 300, tensileStrengthWeft: 250, tearStrength: 20, maxStretchBeforeBreak: 40,
    source: 'library', tags: ['neoprene', 'wetsuit', 'technical', 'structured', 'insulation'],
    textures: { diffuse: 'neoprene/diffuse.jpg', roughness: 'neoprene/roughness.jpg' },
  },
  {
    id: 'felt',
    name: 'Wool Felt',
    nameEs: 'Fieltro de Lana',
    composition: '100% Wool',
    weaveType: 'nonwoven',
    weight: 350,
    thickness: 2.0,
    stretchWarp: 3, stretchWeft: 3, stretchBias: 5, recoveryRate: 0.1,
    bendingWarp: 6.0, bendingWeft: 6.0, drapeCoefficient: 0.1,
    shearStiffness: 180, shearHysteresis: 70,
    friction: 0.7, frictionBody: 0.6, internalDamping: 0.9, surfaceRoughness: 0.8,
    tensileStrengthWarp: 150, tensileStrengthWeft: 150, tearStrength: 10, maxStretchBeforeBreak: 5,
    source: 'library', tags: ['felt', 'nonwoven', 'craft', 'hat', 'rigid'],
  },
  {
    id: 'fleece',
    name: 'Polar Fleece',
    nameEs: 'Polar',
    composition: '100% Polyester',
    weaveType: 'pile',
    weight: 250,
    thickness: 2.5,
    stretchWarp: 10, stretchWeft: 15, stretchBias: 12, recoveryRate: 0.5,
    bendingWarp: 0.3, bendingWeft: 0.3, drapeCoefficient: 0.55,
    shearStiffness: 12, shearHysteresis: 5,
    friction: 0.6, frictionBody: 0.5, internalDamping: 0.55, surfaceRoughness: 0.7,
    tensileStrengthWarp: 250, tensileStrengthWeft: 200, tearStrength: 12, maxStretchBeforeBreak: 35,
    source: 'library', tags: ['fleece', 'polar', 'polyester', 'winter', 'casual', 'soft'],
    textures: { diffuse: 'fleece/diffuse.jpg', normal: 'fleece/normal.png' },
  },
  {
    id: 'velvet',
    name: 'Silk Velvet',
    nameEs: 'Terciopelo de Seda',
    composition: '82% Rayon 18% Silk',
    weaveType: 'pile',
    weight: 280,
    thickness: 1.0,
    stretchWarp: 3, stretchWeft: 5, stretchBias: 12, recoveryRate: 0.3,
    bendingWarp: 0.8, bendingWeft: 0.6, drapeCoefficient: 0.65,
    shearStiffness: 30, shearHysteresis: 12,
    friction: 0.7, frictionBody: 0.6, internalDamping: 0.45, surfaceRoughness: 0.15,
    tensileStrengthWarp: 300, tensileStrengthWeft: 200, tearStrength: 10, maxStretchBeforeBreak: 10,
    source: 'library', tags: ['velvet', 'pile', 'luxury', 'evening', 'drape'],
  },

  // ─── LININGS & INTERFACINGS ───────────────────────────────────────────
  {
    id: 'polyester-lining',
    name: 'Polyester Lining',
    nameEs: 'Forro de Poliéster',
    composition: '100% Polyester',
    weaveType: 'plain',
    weight: 60,
    thickness: 0.1,
    stretchWarp: 2, stretchWeft: 3, stretchBias: 10, recoveryRate: 0.3,
    bendingWarp: 0.08, bendingWeft: 0.06, drapeCoefficient: 0.85,
    shearStiffness: 10, shearHysteresis: 4,
    friction: 0.15, frictionBody: 0.1, internalDamping: 0.2, surfaceRoughness: 0.05,
    tensileStrengthWarp: 300, tensileStrengthWeft: 200, tearStrength: 8, maxStretchBeforeBreak: 15,
    source: 'library', tags: ['lining', 'polyester', 'jacket', 'coat', 'lightweight'],
  },
  {
    id: 'fusible-interfacing-medium',
    name: 'Fusible Interfacing (Medium)',
    nameEs: 'Entretela Termoadhesiva (Media)',
    composition: 'Polyester nonwoven + adhesive',
    weaveType: 'nonwoven',
    weight: 90,
    thickness: 0.3,
    stretchWarp: 1, stretchWeft: 1, stretchBias: 2, recoveryRate: 0.05,
    bendingWarp: 2.5, bendingWeft: 2.5, drapeCoefficient: 0.1,
    shearStiffness: 100, shearHysteresis: 40,
    friction: 0.4, frictionBody: 0.3, internalDamping: 0.85, surfaceRoughness: 0.3,
    tensileStrengthWarp: 150, tensileStrengthWeft: 150, tearStrength: 5, maxStretchBeforeBreak: 3,
    source: 'library', tags: ['interfacing', 'fusible', 'nonwoven', 'structure', 'collar', 'cuff'],
  },
];

// ─── Conversion: PhysicalFabric → XPBD solver params ────────────────────

export interface PhysicalXPBDParams extends XPBDCompliance {
  /** Anisotropic stretch compliance (warp direction) */
  stretchComplianceWarp: number;
  /** Anisotropic stretch compliance (weft direction) */
  stretchComplianceWeft: number;
  /** Bending compliance in warp direction */
  bendComplianceWarp: number;
  /** Bending compliance in weft direction */
  bendComplianceWeft: number;
  /** Shear compliance */
  shearCompliance: number;
  /** Internal damping (0.0 = fluid/oscillates, 1.0 = heavy/settles quickly) */
  internalDamping: number;
  /** Maximum stretch before break (for strain map threshold) */
  maxStretchPercent: number;
  /** Tensile strength for stress map (N/5cm, warp) */
  tensileStrengthWarp: number;
  /** Tensile strength for stress map (N/5cm, weft) */
  tensileStrengthWeft: number;
  /** Density in kg/m² */
  density: number;
}

/**
 * Convert PhysicalFabric to full XPBD solver parameters.
 * 
 * Compliance = inverse stiffness. For XPBD:
 *   compliance = 1 / (stiffness * dt²)
 * We simplify to a normalized mapping suitable for the solver.
 */
/**
 * Banda viva ANGULAR del bend dihedral (P1) — compartida cross-tier: los 3
 * tiers consumen estos números vía el flujo fabricCompliance/configBridge.
 * Derivación en el spec 2026-07-02-dihedral-bend-design.md §8. OJO: la banda
 * asume sdt=1/900 (15 substeps) y malla ~7mm — si cualquiera cambia, la banda
 * escala (alpha=compliance/sdt², denom ~1/e²); el gate Cusick es el oráculo
 * que caza la deriva.
 */
export const BEND_K_ANGULAR = 1.08;
export const BEND_ANGULAR_MIN = 6e-2;
export const BEND_ANGULAR_MAX = 10;

export function toXPBDParams(pf: PhysicalFabric): PhysicalXPBDParams {
  // Stretch: % elongation → XPBD compliance, RESCALED to the solver live band
  // (#gummy STEP 3): the old `stretchWarp/10` gave 0.2-8 → alpha 160k-6M → null
  // constraint → free stretch. Now stretchPct*5e-7 clamped to [5e-7, 1e-5]:
  // cotton (2%) → 1e-6 (near-rigid), lycra (~50%) → 1e-5 (stretchy). The GPU
  // strain-limiting (STEP 4) caps the extreme; here the material differentiates.
  const stretchComplianceWarp = Math.min(1e-5, Math.max(5e-7, pf.stretchWarp * 5e-7));
  const stretchComplianceWeft = Math.min(1e-5, Math.max(5e-7, pf.stretchWeft * 5e-7));

  // Bending ANGULAR (P1 dihedral, spec 2026-07-02 §8): mN·cm → compliance del
  // constraint DIHEDRAL (C en radianes, ∇C ~ 1/m). La banda viva angular es
  // ~×5.4e4 la de distancia (aritmética verificada: ratio de denoms
  // 2·(1.155/e)² con e≈7mm) → [6e-2, 10] en vez de [1.2e-6, 2e-4], y es
  // mesh-dependent (~1/e²). BARRERA ANTI-BEND-MUERTO: el clamp inferior
  // BEND_ANGULAR_MIN está DENTRO de la banda viva — un valor legacy de la
  // banda de distancia (p.ej. 2.5e-5) queda clampeado a 6e-2 y el bend jamás
  // vuelve a morir en silencio (#gummy). El test de physicalFabric pinnea
  // este piso. BEND_K_ANGULAR = 2e-5 × 5.4e4 ≈ 1.08: cotton (0.8 mN·cm) →
  // ~1.2; chiffon (~0.04) → ~7.7 (fluido); neoprene (~8) → ~0.13 (rígido).
  // La ley inversa se conserva; la magnitud es la angular. Re-sweep contra el
  // gate Cusick (B2) = la otra barrera.
  const bendComplianceWarp = Math.min(BEND_ANGULAR_MAX, Math.max(BEND_ANGULAR_MIN, BEND_K_ANGULAR / (pf.bendingWarp + 0.1)));
  const bendComplianceWeft = Math.min(BEND_ANGULAR_MAX, Math.max(BEND_ANGULAR_MIN, BEND_K_ANGULAR / (pf.bendingWeft + 0.1)));

  // Shear: N/m → compliance (inverse), RESCALED to the live band (#gummy STEP 3).
  const shearCompliance = Math.min(1e-4, Math.max(1e-5, 1e-3 / (pf.shearStiffness + 1)));

  // Damping from weight
  const weightFactor = Math.min(pf.weight / 500, 1.0);
  const damping = 0.95 + weightFactor * 0.049;

  // Basic compliance (backward compat)
  const avgStretchCompliance = (stretchComplianceWarp + stretchComplianceWeft) / 2;
  const avgBendCompliance = (bendComplianceWarp + bendComplianceWeft) / 2;

  return {
    // Basic XPBDCompliance
    stretchingCompliance: avgStretchCompliance,
    bendingCompliance: avgBendCompliance,
    damping,
    groundFriction: pf.friction,
    // Anisotropic
    stretchComplianceWarp,
    stretchComplianceWeft,
    bendComplianceWarp,
    bendComplianceWeft,
    shearCompliance,
    internalDamping: pf.internalDamping,
    // Diagnostic thresholds
    maxStretchPercent: pf.maxStretchBeforeBreak,
    tensileStrengthWarp: pf.tensileStrengthWarp,
    tensileStrengthWeft: pf.tensileStrengthWeft,
    density: pf.weight / 1000, // g/m² → kg/m²
  };
}

// ─── Conversion: PhysicalFabric → MeshPhysicalMaterial params ────────────

/**
 * Render parameters for Three.js MeshPhysicalMaterial.
 * Derived from physical fabric properties for CLO3D-quality rendering.
 */
export interface FabricRenderParams {
  color: string;
  roughness: number;
  metalness: number;
  sheen: number;
  sheenRoughness: number;
  sheenColor: string;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  thickness: number;       // for subsurface (transmission thickness)
  ior: number;
  opacity: number;
  side: 'double';
  /** Loaded texture maps — null if no textures available */
  map: import('three').Texture | null;
  normalMap: import('three').Texture | null;
  roughnessMap: import('three').Texture | null;
  aoMap: import('three').Texture | null;
  /** UV transform */
  mapRepeat: [number, number];
  mapRotation: number;
}

/**
 * Render presets per weave type — base visual appearance derived from textile properties.
 */
const WEAVE_RENDER_DEFAULTS: Record<WeaveType, Partial<FabricRenderParams>> = {
  'plain': { roughness: 0.75, sheen: 0.15, sheenRoughness: 0.7, sheenColor: '#e8e4df' },
  'twill': { roughness: 0.7, sheen: 0.2, sheenRoughness: 0.6, sheenColor: '#d0ccc5' },
  'satin': { roughness: 0.25, sheen: 0.9, sheenRoughness: 0.2, sheenColor: '#fff8f0' },
  'knit-jersey': { roughness: 0.8, sheen: 0.1, sheenRoughness: 0.8, sheenColor: '#e0dcd5' },
  'knit-rib': { roughness: 0.82, sheen: 0.08, sheenRoughness: 0.85, sheenColor: '#ddd8d0' },
  'knit-interlock': { roughness: 0.78, sheen: 0.12, sheenRoughness: 0.75, sheenColor: '#e0dcd5' },
  'nonwoven': { roughness: 0.9, sheen: 0.0, sheenRoughness: 1.0, sheenColor: '#ffffff' },
  'leather': { roughness: 0.45, sheen: 0.3, sheenRoughness: 0.4, sheenColor: '#8b7355', clearcoat: 0.3, clearcoatRoughness: 0.2 },
  'mesh': { roughness: 0.6, sheen: 0.05, sheenRoughness: 0.5, sheenColor: '#ffffff', transmission: 0.3, opacity: 0.7 },
  'pile': { roughness: 0.85, sheen: 0.7, sheenRoughness: 0.3, sheenColor: '#f0e8e0' },
  'technical': { roughness: 0.5, sheen: 0.05, sheenRoughness: 0.6, sheenColor: '#c0c0c0', clearcoat: 0.5, clearcoatRoughness: 0.3 },
};

/**
 * Convert PhysicalFabric to MeshPhysicalMaterial parameters.
 *
 * Maps physical textile properties to visual rendering:
 * - surfaceRoughness → roughness
 * - drapeCoefficient → sheen (fluid fabrics shimmer more)
 * - thickness + weight → subsurface hints
 * - weaveType → base visual preset
 *
 * @param pf Physical fabric definition
 * @param baseColor Optional base color (default: neutral off-white)
 */
export function toMeshPhysicalParams(
  pf: PhysicalFabric,
  baseColor?: string,
  loadedTextures?: {
    map?: import('three').Texture | null;
    normalMap?: import('three').Texture | null;
    roughnessMap?: import('three').Texture | null;
    aoMap?: import('three').Texture | null;
  },
): FabricRenderParams {
  const defaults = WEAVE_RENDER_DEFAULTS[pf.weaveType] || WEAVE_RENDER_DEFAULTS['plain'];

  // Surface roughness: combine physical roughness with weave preset
  const roughness = Math.min(1, (pf.surfaceRoughness * 0.6 + (defaults.roughness ?? 0.7) * 0.4));

  // Sheen: high-drape fabrics (silk, chiffon) have more surface sheen
  // Also affected by weave type (satin = high sheen)
  const drapeSheen = pf.drapeCoefficient > 0.7 ? 0.3 : 0;
  const sheen = Math.min(1, (defaults.sheen ?? 0.1) + drapeSheen);
  const sheenRoughness = defaults.sheenRoughness ?? 0.5;

  // Transmission: very light + thin fabrics are slightly translucent
  let transmission = defaults.transmission ?? 0;
  if (pf.weight < 60 && pf.thickness < 0.3) {
    transmission = Math.max(transmission, 0.15); // chiffon, organza
  }

  // Opacity for mesh/sheer fabrics
  const opacity = defaults.opacity ?? (transmission > 0.1 ? 0.9 : 1.0);

  // Clearcoat for leather/technical
  const clearcoat = defaults.clearcoat ?? 0;
  const clearcoatRoughness = defaults.clearcoatRoughness ?? 0;

  return {
    color: baseColor ?? '#e8e4df',
    roughness,
    metalness: 0,
    sheen,
    sheenRoughness,
    sheenColor: defaults.sheenColor ?? '#e8e4df',
    clearcoat,
    clearcoatRoughness,
    transmission,
    thickness: pf.thickness,
    ior: 1.5,
    opacity,
    side: 'double',
    map: loadedTextures?.map ?? null,
    normalMap: loadedTextures?.normalMap ?? null,
    roughnessMap: loadedTextures?.roughnessMap ?? null,
    aoMap: loadedTextures?.aoMap ?? null,
    mapRepeat: [4, 4],
    mapRotation: 0,
  };
}

// ─── Search & Lookup ────────────────────────────────────────────────────

/** Get all physical fabrics. */
export function getAllPhysicalFabrics(): PhysicalFabric[] {
  return PHYSICAL_FABRIC_LIBRARY;
}

/** Get physical fabric by ID. */
export function getPhysicalFabric(id: string): PhysicalFabric | undefined {
  return PHYSICAL_FABRIC_LIBRARY.find(f => f.id === id);
}

/** Search fabrics by keyword (name, composition, tags). */
export function searchPhysicalFabrics(query: string): PhysicalFabric[] {
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/);

  return PHYSICAL_FABRIC_LIBRARY
    .map(fabric => {
      const searchText = [
        fabric.name, fabric.nameEs, fabric.composition,
        fabric.weaveType, ...fabric.tags,
      ].join(' ').toLowerCase();

      let score = 0;
      for (const token of tokens) {
        if (searchText.includes(token)) score++;
        if (fabric.tags.includes(token)) score += 2;
        if (fabric.name.toLowerCase().includes(token)) score += 2;
      }
      return { fabric, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(r => r.fabric);
}

/** Filter fabrics by weave type. */
export function getFabricsByWeave(weaveType: WeaveType): PhysicalFabric[] {
  return PHYSICAL_FABRIC_LIBRARY.filter(f => f.weaveType === weaveType);
}

/** Filter fabrics by weight range (g/m²). */
export function getFabricsByWeight(minGSM: number, maxGSM: number): PhysicalFabric[] {
  return PHYSICAL_FABRIC_LIBRARY.filter(f => f.weight >= minGSM && f.weight <= maxGSM);
}

/** Validate a PhysicalFabric has sensible values. */
export function isValidPhysicalFabric(pf: PhysicalFabric): boolean {
  return (
    typeof pf.id === 'string' && pf.id.length > 0 &&
    typeof pf.name === 'string' && pf.name.length > 0 &&
    pf.weight > 0 && pf.weight <= 2000 &&
    pf.thickness > 0 && pf.thickness <= 20 &&
    pf.stretchWarp >= 0 && pf.stretchWarp <= 500 &&
    pf.stretchWeft >= 0 && pf.stretchWeft <= 500 &&
    pf.recoveryRate >= 0 && pf.recoveryRate <= 1 &&
    pf.bendingWarp >= 0 && pf.bendingWeft >= 0 &&
    pf.friction >= 0 && pf.friction <= 1 &&
    pf.internalDamping >= 0 && pf.internalDamping <= 1 &&
    pf.tensileStrengthWarp > 0 && pf.tensileStrengthWeft > 0 &&
    pf.maxStretchBeforeBreak > 0
  );
}
