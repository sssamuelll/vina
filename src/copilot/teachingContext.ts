/**
 * Teaching Context — contextual pattern-making education attached to tool executions.
 *
 * When teaching mode is enabled, the agent attaches explanations about WHY
 * a particular action was taken, using proper patronaje/pattern-making terminology.
 *
 * @module teachingContext
 */

import type { AgentLanguage } from './perception/languageDetection';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';

/**
 * A teaching snippet attached to a tool execution result.
 */
export interface TeachingSnippet {
  /** Short title for the teaching content */
  title: string;
  /** The teaching explanation in the user's language */
  explanation: string;
  /** Optional tip for best practice */
  tip?: string;
}

/** Storage key for teaching mode preference */
const TEACHING_MODE_KEY = 'openclo-teaching-mode';

/**
 * Check if teaching mode is enabled.
 *
 * @returns Whether teaching mode is active
 */
export function isTeachingModeEnabled(): boolean {
  return safeGetItem(TEACHING_MODE_KEY) !== 'false';
}

/**
 * Set teaching mode on or off.
 *
 * @param enabled - Whether to enable teaching mode
 */
export function setTeachingMode(enabled: boolean): void {
  safeSetItem(TEACHING_MODE_KEY, String(enabled));
}

// ─── Teaching Content Database ──────────────────────────────────────────────

type TeachingEntry = Record<AgentLanguage, TeachingSnippet>;

/**
 * Teaching content indexed by tool name.
 *
 * Each entry contains bilingual explanations that help the user understand
 * the WHY behind each pattern-making action.
 */
const TEACHING_DB: Record<string, TeachingEntry> = {
  createPiece: {
    es: {
      title: 'Creación de pieza',
      explanation:
        'Cada pieza de patrón representa un componente del molde que se cortará en tela. ' +
        'Las piezas se crean desde un bloque base calculado con las medidas corporales, ' +
        'que luego se ajustan para el diseño deseado.',
      tip: 'Siempre nombra las piezas claramente: "Delantero", "Espalda", "Manga Derecha".',
    },
    en: {
      title: 'Piece Creation',
      explanation:
        'Each pattern piece represents a garment component to be cut from fabric. ' +
        'Pieces are generated from a base block calculated with body measurements, ' +
        'then adjusted for the desired design.',
      tip: 'Always name pieces clearly: "Front Bodice", "Back Panel", "Right Sleeve".',
    },
  },

  addDart: {
    es: {
      title: 'Pinzas',
      explanation:
        'Las pinzas absorben el exceso de tela para dar forma tridimensional a una pieza plana. ' +
        'La pinza de busto absorbe la diferencia entre el contorno de busto y la cintura. ' +
        'La punta debe quedar 2-3cm antes del punto de pecho — nunca justo encima.',
      tip: 'Si la tela es jersey con buen estiramiento, la pinza puede ser más pequeña o eliminarse.',
    },
    en: {
      title: 'Darts',
      explanation:
        'Darts take in excess fabric to create three-dimensional shape from flat fabric. ' +
        'A bust dart absorbs the difference between bust and waist circumference. ' +
        'The dart tip should end 2-3cm before the bust point — never directly on it.',
      tip: 'For stretchy jersey fabrics, darts can be smaller or eliminated entirely.',
    },
  },

  addGrainline: {
    es: {
      title: 'Línea de hilo',
      explanation:
        'La línea de hilo indica cómo alinear la pieza con el hilo de la tela (urdimbre). ' +
        'El hilo corre paralelo al orillo. Cortando "al hilo" la tela cae recto y no se deforma. ' +
        'Cortando al bies (45°) la tela tiene más elasticidad y caída.',
      tip: 'Para faldas circulares y godets, se usa corte al bies para mejor caída.',
    },
    en: {
      title: 'Grainline',
      explanation:
        'The grainline indicates how to align the piece with the fabric grain (warp). ' +
        'The grain runs parallel to the selvedge. Cutting on-grain means the fabric hangs ' +
        'straight without distortion. Cutting on bias (45°) gives more stretch and drape.',
      tip: 'For circular skirts and godets, bias cutting gives better drape.',
    },
  },

  addNotch: {
    es: {
      title: 'Piquetes',
      explanation:
        'Los piquetes son marcas de alineación en el borde de la pieza. ' +
        'Al coser, los piquetes de una pieza deben coincidir con los de la pieza conectada. ' +
        'Convención: 1 piquete = delantero, 2 piquetes = espalda, 3 = manga.',
      tip: 'Marca siempre los piquetes en el costado, hombro y centro del escote.',
    },
    en: {
      title: 'Notches',
      explanation:
        'Notches are alignment marks on the edge of a pattern piece. ' +
        'When sewing, notches on one piece must match the notches on the connected piece. ' +
        'Convention: 1 notch = front, 2 notches = back, 3 = sleeve cap.',
      tip: 'Always mark notches at side seam, shoulder, and center neckline.',
    },
  },

  setSeamAllowance: {
    es: {
      title: 'Margen de costura',
      explanation:
        'El margen de costura es la distancia entre la línea de diseño y la línea de corte. ' +
        'Estándar: 10mm para costuras normales, 7mm para sisas y escotes (curvas cerradas), ' +
        '15-40mm para dobladillos según el tipo de prenda.',
      tip: 'Verifica que los márgenes sean consistentes entre piezas que se cosen juntas.',
    },
    en: {
      title: 'Seam Allowance',
      explanation:
        'Seam allowance is the distance between the design line and the cutting line. ' +
        'Standard: 10mm for regular seams, 7mm for armholes and necklines (tight curves), ' +
        '15-40mm for hems depending on garment type.',
      tip: 'Verify that seam allowances are consistent between pieces that will be sewn together.',
    },
  },

  setMeasurementsFromSize: {
    es: {
      title: 'Tabla de tallas',
      explanation:
        'Las tallas estándar (EU 36-48) corresponden a medidas corporales estandarizadas. ' +
        'La talla EU se basa en el contorno de busto: talla 40 = 92cm busto. ' +
        'Estas son medidas de referencia — cada persona varía.',
      tip: 'Para patronaje a medida, toma medidas reales del cuerpo en lugar de usar tallas estándar.',
    },
    en: {
      title: 'Size Charts',
      explanation:
        'Standard sizes (EU 36-48) correspond to standardized body measurements. ' +
        'EU sizing is based on bust circumference: size 40 = 92cm bust. ' +
        'These are reference measurements — every body is different.',
      tip: 'For bespoke pattern-making, take actual body measurements instead of using standard sizes.',
    },
  },

  transformPiece: {
    es: {
      title: 'Transformaciones de patrón',
      explanation:
        'Las transformaciones modifican el patrón base para crear variaciones de diseño. ' +
        'De recta a evasé: se abre el costado progresivamente hacia el bajo. ' +
        'Godets: triángulos de tela insertados para agregar vuelo localizado.',
      tip: 'Cuando agregas vuelo, verifica que la circunferencia del bajo sea suficiente para el efecto deseado.',
    },
    en: {
      title: 'Pattern Transformations',
      explanation:
        'Transformations modify the base pattern to create design variations. ' +
        'Straight to A-line: the side seam opens progressively toward the hem. ' +
        'Godets: fabric triangles inserted to add localized flare.',
      tip: 'When adding flare, verify the hem circumference is sufficient for the desired effect.',
    },
  },

  gradePiece: {
    es: {
      title: 'Gradación',
      explanation:
        'La gradación escala un patrón base a otras tallas manteniendo las proporciones. ' +
        'No es simplemente agrandar/reducir — cada punto del patrón tiene una regla de ' +
        'incremento diferente basada en tablas antropométricas.',
      tip: 'Siempre verifica las costuras después de gradar: deben mantener la misma longitud entre piezas conectadas.',
    },
    en: {
      title: 'Grading',
      explanation:
        'Grading scales a base pattern to other sizes while maintaining proportions. ' +
        "It's not simply enlarging/reducing — each pattern point has a different " +
        'increment rule based on anthropometric tables.',
      tip: 'Always check seams after grading: they must maintain the same length between connected pieces.',
    },
  },

  runNesting: {
    es: {
      title: 'Anidamiento (tendido)',
      explanation:
        'El anidamiento acomoda las piezas en la tela para minimizar desperdicio. ' +
        'Un buen tendido logra 70-85% de aprovechamiento. La dirección del hilo ' +
        'de cada pieza debe respetarse al rotar.',
      tip: 'Para telas con estampado direccional, limita la rotación a 180° solamente.',
    },
    en: {
      title: 'Nesting (Marker Making)',
      explanation:
        'Nesting arranges pieces on fabric to minimize waste. ' +
        'A good marker achieves 70-85% utilization. The grainline direction ' +
        'of each piece must be respected when rotating.',
      tip: 'For directional print fabrics, limit rotation to 180° only.',
    },
  },

  setFabric: {
    es: {
      title: 'Selección de tela',
      explanation:
        'La tela afecta cómo cae la prenda. Telas rígidas (denim, canvas) mantienen la forma. ' +
        'Telas fluidas (seda, chiffon) se mueven con el cuerpo. La simulación 3D ' +
        'usa las propiedades físicas (peso, rigidez, elasticidad) para predecir la caída.',
      tip: 'Elige la tela antes de ajustar el patrón — la misma pieza se comporta muy diferente en algodón vs seda.',
    },
    en: {
      title: 'Fabric Selection',
      explanation:
        'Fabric affects how a garment drapes. Stiff fabrics (denim, canvas) hold their shape. ' +
        'Fluid fabrics (silk, chiffon) move with the body. The 3D simulation ' +
        'uses physical properties (weight, stiffness, stretch) to predict drape.',
      tip: 'Choose fabric before adjusting the pattern — the same piece behaves very differently in cotton vs silk.',
    },
  },

  generateFromTemplate: {
    es: {
      title: 'Generación desde plantilla Seamly2D',
      explanation:
        'Se genera el patrón desde una plantilla validada de Seamly2D con geometría de construcción real. ' +
        'Las piezas se calculan paramétricamente según las medidas corporales o talla estándar.',
      tip: 'Usa searchTemplates para encontrar la plantilla correcta antes de generar.',
    },
    en: {
      title: 'Generation from Seamly2D Template',
      explanation:
        'The pattern is generated from a validated Seamly2D template with real construction geometry. ' +
        'Pieces are parametrically calculated from body measurements or standard size.',
      tip: 'Use searchTemplates to find the right template before generating.',
    },
  },
};

/**
 * Get the teaching snippet for a tool execution.
 *
 * Returns null if teaching mode is disabled or no teaching content exists
 * for the given tool.
 *
 * @param toolName - Name of the tool that was executed
 * @param language - User's language preference
 * @returns Teaching snippet, or null if not available
 */
export function getTeachingSnippet(
  toolName: string,
  language: AgentLanguage,
): TeachingSnippet | null {
  if (!isTeachingModeEnabled()) return null;

  const entry = TEACHING_DB[toolName];
  if (!entry) return null;

  return entry[language] ?? entry['en'];
}

/**
 * Format a teaching snippet as a markdown string for display.
 *
 * @param snippet - The teaching snippet to format
 * @returns Formatted markdown string
 */
export function formatTeachingSnippet(snippet: TeachingSnippet): string {
  let text = `📚 **${snippet.title}**\n${snippet.explanation}`;
  if (snippet.tip) {
    text += `\n💡 _${snippet.tip}_`;
  }
  return text;
}
