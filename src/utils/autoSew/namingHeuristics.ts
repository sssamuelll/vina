/**
 * Naming Heuristics — patternmaking domain knowledge for seam matching.
 * 
 * Professional patternmakers follow conventions: Front↔Back side seams,
 * Bodice↔Sleeve armholes, Collar↔Neckline, etc. These rules encode
 * that domain knowledge into computable scores.
 *
 * Supports English, Spanish, French, German, Italian pattern naming.
 *
 * @module autoSew/namingHeuristics
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NamingScore {
  /** 0-1 score: how likely these two pieces should be sewn together */
  score: number;
  /** Which edges are likely candidates (by position keyword) */
  edgeHints: EdgeHint[];
  /** Human-readable reason */
  reason: string;
}

export interface EdgeHint {
  /** Which side/position of the piece the seam likely falls on */
  position: 'side' | 'top' | 'bottom' | 'armhole' | 'neckline' | 'shoulder' | 'waist' | 'inseam' | 'outseam' | 'crotch' | 'center' | 'unknown';
  /** Applies to piece A or B */
  applies: 'A' | 'B' | 'both';
}

// ─── Piece name normalization ───────────────────────────────────────────────

const TRANSLATIONS: Record<string, string> = {
  // Spanish
  'delantero': 'front', 'frente': 'front', 'trasero': 'back', 'espalda': 'back',
  'manga': 'sleeve', 'cuello': 'collar', 'puño': 'cuff', 'cintura': 'waist',
  'falda': 'skirt', 'pantalon': 'trouser', 'cuerpo': 'bodice', 'corpino': 'bodice',
  'forro': 'lining', 'bolsillo': 'pocket', 'solapa': 'lapel', 'capucha': 'hood',
  'hombro': 'shoulder', 'costado': 'side', 'lateral': 'side',
  'izquierdo': 'left', 'derecho': 'right', 'superior': 'upper', 'inferior': 'lower',
  // French
  'devant': 'front', 'dos': 'back', 'manche': 'sleeve', 'col': 'collar',
  'poignet': 'cuff', 'jupe': 'skirt', 'corsage': 'bodice',
  'doublure': 'lining', 'poche': 'pocket', 'revers': 'lapel', 'capuche': 'hood',
  // German
  'vorderteil': 'front', 'rückenteil': 'back', 'ruckteil': 'back', 'ärmel': 'sleeve',
  'aermel': 'sleeve', 'kragen': 'collar', 'manschette': 'cuff', 'rock': 'skirt',
  'hose': 'trouser', 'mieder': 'bodice', 'futter': 'lining', 'tasche': 'pocket',
  'kapuze': 'hood',
  // Italian
  'davanti': 'front', 'dietro': 'back', 'manica': 'sleeve', 'colletto': 'collar',
  'polsino': 'cuff', 'gonna': 'skirt', 'pantalone': 'trouser', 'corpetto': 'bodice',
  'fodera': 'lining', 'tasca': 'pocket', 'cappuccio': 'hood',
  // Russian / Ukrainian — many converted Seamly2D patterns (jacket1-6, pants1)
  // carry Cyrillic piece names. Without these the naming heuristic returned null
  // for every pair and seams only formed by arc-length coincidence (#518).
  'спинка': 'back', 'полочка': 'front', 'перед': 'front', 'передняя': 'front',
  'задняя': 'back', 'рукав': 'sleeve', 'воротник': 'collar', 'комір': 'collar',
  'манжета': 'cuff', 'манжет': 'cuff', 'юбка': 'skirt', 'спідниця': 'skirt',
  'брюки': 'trouser', 'штани': 'trouser', 'лиф': 'bodice', 'подборт': 'facing',
  'обтачка': 'facing', 'обтачкa': 'facing', 'карман': 'pocket', 'кишеня': 'pocket',
  'капюшон': 'hood', 'кокетка': 'yoke', 'левый': 'left', 'левая': 'left',
  'правый': 'right', 'правая': 'right', 'верх': 'upper', 'низ': 'lower',
};

/** Normalize a piece name to lowercase English tokens */
function normalize(name: string): string[] {
  const lower = name
    // Split camelCase / PascalCase BEFORE lowercasing so compound names like
    // "FrontPanel" or "ShortSleeve" tokenize into ["front","panel"] / ["short",
    // "sleeve"] and actually hit the naming rules. Without this, "FrontPanel"
    // stayed a single token "frontpanel" and `has(tokens,'front')` never matched —
    // so the naming heuristic silently did nothing for every camelCase pattern
    // (#518). The range à-ɏ keeps accented Latin lowercase letters as
    // word-internal so e.g. "Empiècement" isn't split mid-accent.
    .replace(/([a-zà-ɏ])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_\-./\\]/g, ' ')
    .replace(/\d+/g, ' ')
    .trim();

  return lower.split(/\s+/).map(word => TRANSLATIONS[word] || word);
}

function has(tokens: string[], ...keywords: string[]): boolean {
  return keywords.some(k => tokens.includes(k));
}

// ─── Pairing rules ──────────────────────────────────────────────────────────

interface PairingRule {
  /** Test if this rule applies to pieces A and B (order-independent) */
  match: (a: string[], b: string[]) => boolean;
  score: number;
  edgeHints: EdgeHint[];
  reason: string;
}

const RULES: PairingRule[] = [
  // Front ↔ Back — side seams
  {
    match: (a, b) => has(a, 'front') && has(b, 'back') || has(b, 'front') && has(a, 'back'),
    score: 0.9,
    edgeHints: [{ position: 'side', applies: 'both' }],
    reason: 'Front↔Back: side seams',
  },
  // Front ↔ Back — shoulder seams (when both are bodice-related)
  {
    match: (a, b) => {
      const aFront = has(a, 'front') && (has(a, 'bodice') || has(a, 'upper') || !has(a, 'skirt', 'trouser'));
      const bBack = has(b, 'back') && (has(b, 'bodice') || has(b, 'upper') || !has(b, 'skirt', 'trouser'));
      return (aFront && bBack) || (has(b, 'front') && has(a, 'back'));
    },
    score: 0.85,
    edgeHints: [{ position: 'shoulder', applies: 'both' }],
    reason: 'Front↔Back: shoulder seams',
  },
  // Bodice/Front ↔ Sleeve — armhole
  {
    match: (a, b) => {
      const hasBody = (t: string[]) => has(t, 'front', 'back', 'bodice', 'body', 'upper');
      const hasSleeve = (t: string[]) => has(t, 'sleeve');
      return (hasBody(a) && hasSleeve(b)) || (hasBody(b) && hasSleeve(a));
    },
    score: 0.95,
    edgeHints: [{ position: 'armhole', applies: 'both' }],
    reason: 'Body↔Sleeve: armhole seam',
  },
  // Collar ↔ Body — neckline
  {
    match: (a, b) => {
      const hasBody = (t: string[]) => has(t, 'front', 'back', 'bodice', 'body', 'upper', 'yoke');
      const hasCollar = (t: string[]) => has(t, 'collar', 'neckband', 'stand');
      return (hasBody(a) && hasCollar(b)) || (hasBody(b) && hasCollar(a));
    },
    score: 0.9,
    edgeHints: [{ position: 'neckline', applies: 'both' }],
    reason: 'Body↔Collar: neckline seam',
  },
  // Cuff ↔ Sleeve
  {
    match: (a, b) => {
      const hasSleeve = (t: string[]) => has(t, 'sleeve');
      const hasCuff = (t: string[]) => has(t, 'cuff');
      return (hasSleeve(a) && hasCuff(b)) || (hasSleeve(b) && hasCuff(a));
    },
    score: 0.9,
    edgeHints: [{ position: 'bottom', applies: 'both' }],
    reason: 'Sleeve↔Cuff: cuff seam',
  },
  // Bodice ↔ Skirt — waist seam
  {
    match: (a, b) => {
      const hasTop = (t: string[]) => has(t, 'bodice', 'upper', 'body');
      const hasBottom = (t: string[]) => has(t, 'skirt', 'peplum', 'lower');
      return (hasTop(a) && hasBottom(b)) || (hasTop(b) && hasBottom(a));
    },
    score: 0.85,
    edgeHints: [{ position: 'waist', applies: 'both' }],
    reason: 'Bodice↔Skirt: waist seam',
  },
  // Waistband ↔ Trouser/Skirt
  {
    match: (a, b) => {
      const hasWaistband = (t: string[]) => has(t, 'waistband', 'waist') && !has(t, 'skirt', 'trouser');
      const hasGarment = (t: string[]) => has(t, 'skirt', 'trouser', 'pant', 'front', 'back');
      return (hasWaistband(a) && hasGarment(b)) || (hasWaistband(b) && hasGarment(a));
    },
    score: 0.85,
    edgeHints: [{ position: 'waist', applies: 'both' }],
    reason: 'Waistband↔Garment: waist seam',
  },
  // Trouser Front ↔ Back — inseam + outseam
  {
    match: (a, b) => {
      const isTrouserPart = (t: string[]) => has(t, 'trouser', 'pant', 'leg');
      return isTrouserPart(a) && isTrouserPart(b) &&
        ((has(a, 'front') && has(b, 'back')) || (has(b, 'front') && has(a, 'back')));
    },
    score: 0.9,
    edgeHints: [
      { position: 'inseam', applies: 'both' },
      { position: 'outseam', applies: 'both' },
    ],
    reason: 'Trouser Front↔Back: inseam + outseam',
  },
  // Hood ↔ Body — neckline
  {
    match: (a, b) => {
      const hasBody = (t: string[]) => has(t, 'front', 'back', 'bodice', 'body');
      const hasHood = (t: string[]) => has(t, 'hood');
      return (hasBody(a) && hasHood(b)) || (hasBody(b) && hasHood(a));
    },
    score: 0.8,
    edgeHints: [{ position: 'neckline', applies: 'both' }],
    reason: 'Body↔Hood: neckline seam',
  },
  // Yoke ↔ Body
  {
    match: (a, b) => {
      const hasBody = (t: string[]) => has(t, 'front', 'back', 'bodice', 'body') && !has(t, 'yoke');
      const hasYoke = (t: string[]) => has(t, 'yoke');
      return (hasBody(a) && hasYoke(b)) || (hasBody(b) && hasYoke(a));
    },
    score: 0.85,
    edgeHints: [{ position: 'top', applies: 'both' }],
    reason: 'Body↔Yoke: yoke seam',
  },
  // Facing ↔ Body — same edge reinforcement
  {
    match: (a, b) => {
      const hasMain = (t: string[]) => !has(t, 'facing', 'lining', 'interfacing');
      const hasFacing = (t: string[]) => has(t, 'facing');
      return (hasMain(a) && hasFacing(b)) || (hasMain(b) && hasFacing(a));
    },
    score: 0.7,
    edgeHints: [{ position: 'unknown', applies: 'both' }],
    reason: 'Body↔Facing: edge reinforcement',
  },
  // Lining ↔ corresponding shell piece (same base name)
  {
    match: (a, b) => {
      const isLining = (t: string[]) => has(t, 'lining');
      const baseName = (t: string[]) => t.filter(w => w !== 'lining').join(' ');
      if (isLining(a) && !isLining(b)) {
        return baseName(a).length > 0 && b.some(w => baseName(a).includes(w));
      }
      if (isLining(b) && !isLining(a)) {
        return baseName(b).length > 0 && a.some(w => baseName(b).includes(w));
      }
      return false;
    },
    score: 0.75,
    edgeHints: [{ position: 'unknown', applies: 'both' }],
    reason: 'Shell↔Lining: lining attachment',
  },
  // Same piece name (left/right or mirrored) — center seam
  {
    match: (a, b) => {
      const base = (t: string[]) => t.filter(w => !['left', 'right', 'l', 'r', 'izquierdo', 'derecho'].includes(w)).join(' ');
      return base(a) === base(b) && base(a).length > 0 &&
        ((has(a, 'left', 'l', 'izquierdo') && has(b, 'right', 'r', 'derecho')) ||
         (has(b, 'left', 'l', 'izquierdo') && has(a, 'right', 'r', 'derecho')));
    },
    score: 0.85,
    edgeHints: [{ position: 'center', applies: 'both' }],
    reason: 'Left↔Right: center seam',
  },
];

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Score how likely two pieces should be sewn together based on naming conventions.
 * Returns null if no naming rule matches.
 */
export function scorePieceNames(nameA: string, nameB: string): NamingScore | null {
  const tokensA = normalize(nameA);
  const tokensB = normalize(nameB);

  // Try all rules, return the highest-scoring match
  let best: NamingScore | null = null;

  for (const rule of RULES) {
    if (rule.match(tokensA, tokensB)) {
      if (!best || rule.score > best.score) {
        best = {
          score: rule.score,
          edgeHints: rule.edgeHints,
          reason: rule.reason,
        };
      }
    }
  }

  return best;
}

/**
 * Get all naming-based pair candidates from a list of piece names.
 * Returns pairs sorted by score (highest first).
 */
export function findNamingCandidates(
  pieces: Array<{ id: string; name: string }>
): Array<{ pieceAId: string; pieceBId: string; score: NamingScore }> {
  const candidates: Array<{ pieceAId: string; pieceBId: string; score: NamingScore }> = [];

  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const score = scorePieceNames(pieces[i].name, pieces[j].name);
      if (score) {
        candidates.push({
          pieceAId: pieces[i].id,
          pieceBId: pieces[j].id,
          score,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.score.score - a.score.score);
}
