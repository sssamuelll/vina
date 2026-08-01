# Glosario de copy UI en español — Vina

**Decisión (Fase 3, 2026-07-16):** el idioma del producto es **español**. Sin framework
de i18n: strings directos (YAGNI hasta que exista una segunda lengua; cuando llegue,
este glosario es la fuente para extraer claves). Usuaria de referencia: María,
patronista profesional hispanohablante. Regla dura: **cero mezcla de idiomas dentro
de una misma superficie**. Tono: instrumento de precisión — sobrio, sin hype, sin
exclamaciones, verbos que nombran el resultado (protocolo de microcopy solace-wren).

## Términos del oficio (mandan sobre cualquier traducción literal)

| EN (código) | ES (UI) | Nota |
|---|---|---|
| piece | pieza | |
| seam | costura | |
| seam allowance | margen de costura | |
| dart | pinza | |
| notch | piquete | |
| grainline | hilo | "dirección de hilo" si hay espacio |
| grading | escalado | "escalado de tallas" en descripciones |
| interfacing | entretela | |
| fabric | tela | |
| nesting / marker | marcada | término de industria (Optitex); "nesting" solo en descripciones |
| topstitch | pespunte | |
| gather | fruncido | |
| ease | embebido | |
| tech pack | ficha técnica | |
| BOM | lista de materiales (BOM) | la sigla se conserva, es de industria |
| fit | ajuste | fit map = mapa de ajuste |
| stress / strain | tensión / estiramiento | |
| drape | caída | verbo: drapear se acepta |
| turntable | vuelta 360° | |
| avatar | avatar | |
| mismatch (largo de costura) | diferencia | "⚠ 12.3mm de diferencia" |

## Vocabulario UI

| EN | ES | Nota |
|---|---|---|
| Undo / Redo | Deshacer / Rehacer | |
| Import / Export | Importar / Exportar | |
| Delete | Eliminar | los botones nombran el objeto: "Eliminar pieza" |
| Duplicate | Duplicar | |
| Save / Reset | Guardar / Restablecer | |
| Select | Seleccionar | |
| Settings | Ajustes | nunca "configuración" y "ajustes" mezclados |
| Properties | Propiedades | |
| Layers | Capas | |
| View | Vista | |
| Snapshot | Captura | |
| Simulate / Simulating | Simular / SIMULANDO | |
| Arrange | Colocar | colocación 3D de piezas |
| Sew | Coser | |
| Dress Avatar | Vestir avatar | |
| Auto-Sew | Coser automáticamente | el toast ya dice "Auto-sew: N costuras propuestas" → unificar a "Costura automática: N propuestas" |
| Textured / Solid / Wireframe | Texturizado / Sólido / Alambre | modos de superficie |
| Loading... | Cargando... | |
| Refresh | Actualizar | |

## Reglas

1. Vista 2D/Split/3D se quedan como están (símbolos, no palabras).
2. Atajos: los glifos mac se muestran Ctrl+/Shift+/Alt+ fuera de mac (`shortcutDisplay.ts`).
3. Los `aria-label` también van en español (los lee el screen reader de María, no el test runner) — los tests se actualizan con ellos.
4. Términos técnicos del motor (WebGPU, WASM, fps) no se traducen; sus MENSAJES sí.
5. Sin "por favor", sin "¡", sin title case en body copy.
