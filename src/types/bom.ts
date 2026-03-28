// ─── BOM (Bill of Materials) & Tech Pack Types ───

/** Categories of BOM items */
export type BOMCategory = 'fabric' | 'interfacing' | 'thread' | 'seam-tape' | 'elastic' | 'trim' | 'label' | 'other';

/** Units for BOM quantities */
export type BOMUnit = 'meters' | 'yards' | 'cm' | 'pieces' | 'rolls';

/** A single BOM line item */
export interface BOMEntry {
  id: string;
  category: BOMCategory;
  name: string;
  description: string;
  quantity: number;
  unit: BOMUnit;
  unitCost: number;
  currency: string;
  colorwayOverrides: Record<string, { name?: string; unitCost?: number }>;
  autoPopulated: boolean;
  sourcePieceIds: string[];
}

/** BOM entry with colorway overrides resolved */
export interface BOMEntryResolved extends BOMEntry {
  resolvedName: string;
  resolvedUnitCost: number;
  totalCost: number;
}

/** Redux BOM state */
export interface BOMState {
  entries: BOMEntry[];
  currency: string;
  lastExtractedAt: number | null;
  extractedProjectVersion: number | null;
}

/** Tech pack PDF configuration */
export interface TechPackConfig {
  include3DViews: boolean;
  views: ('front' | 'back' | 'left' | 'right')[];
  renderWidth: number;
  renderHeight: number;
  includeBOM: boolean;
  includeMeasurements: boolean;
  includeConstructionNotes: boolean;
  includeColorways: boolean;
  branding?: {
    logoUrl?: string;
    companyName?: string;
    headerColor?: string;
  };
}

/** Data passed to the tech pack PDF generator */
export interface TechPackData {
  garmentName: string;
  styleNumber: string;
  season: string;
  designer: string;
  date: string;
  description: string;
  bomEntries: BOMEntryResolved[];
  measurements: { name: string; category: string; value: number; tolerance?: number }[];
  constructionNotes: string[];
  colorways: { name: string; swatches: { fabricCode: string; color: string }[] }[];
  images: { view: string; dataUrl: string }[];
  totalCost: number;
  currency: string;
}
