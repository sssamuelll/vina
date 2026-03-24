# Annotation Library — Production Notes on Pattern Pieces

**Issue:** #266
**Date:** 2026-03-24

## Problem

No way to add production annotations (cutting instructions, QC notes, care labels) to pattern pieces. Every production pattern needs standardized text labels for the cutting room and sewing floor.

## Design

### Data Model (`src/types/types.ts`)

```typescript
export type AnnotationCategory = 'cutting' | 'sewing' | 'qc' | 'general';
export type AnnotationPosition = 'center' | 'top' | 'bottom' | { x: number; y: number };

export interface PieceAnnotation {
  id: string;
  text: string;
  position: AnnotationPosition;
  category: AnnotationCategory;
  fontSize?: number; // default 8
}
```

Add `annotations?: PieceAnnotation[]` to `PatternPiece`.

### Template Library (`src/utils/annotationTemplates.ts`)

Built-in templates with categories:
- Cutting: "CUT 2", "CUT 2 ON FOLD", "CUT 1", "CUT 4"
- Sewing: "INTERFACE", "STITCH LINE", "EASE"
- General: "GRAIN →", "NOTCH", "CB", "CF"

### Redux (`projectSlice.ts`)

- `addAnnotation({ pieceId, annotation })` — push to piece.annotations
- `removeAnnotation({ pieceId, annotationId })` — filter out
- `updateAnnotation({ pieceId, annotationId, updates })` — partial merge

### UI

**PieceProperties.tsx**: "ANNOTATIONS" section with:
- List of existing annotations (text + delete button)
- Template dropdown to quick-add from library
- Free-text input for custom annotations

**PieceRenderer.tsx**: Render annotations as `<text>` elements offset below piece name, smaller font, colored by category.

### DXF Export

New `ANNOTATION` layer. Each annotation emitted as text entity at computed position.

### Copilot Tools (`annotationTools.ts`)

- `addAnnotation` — `{ pieceId, text, position?, category? }`
- `removeAnnotation` — `{ pieceId, annotationId }`
- `listAnnotationTemplates` — returns built-in templates

### Files

| File | Change |
|------|--------|
| `src/types/types.ts` | PieceAnnotation type, annotations field |
| `src/utils/annotationTemplates.ts` | NEW: templates + categories |
| `src/store/projectSlice.ts` | 3 reducers |
| `src/components/PropertiesPanel/PieceProperties.tsx` | Annotations section |
| `src/components/PatternEditor/renderers/PieceRenderer.tsx` | Render annotation text |
| `src/utils/exportDXF.ts` | ANNOTATION layer |
| `src/copilot/action/tools/definitions/annotationTools.ts` | NEW: 3 tools |
| `src/copilot/action/tools/registry.ts` | Register annotation tools |
