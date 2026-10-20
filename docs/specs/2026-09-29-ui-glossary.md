# UI glossary — Vina

One row per concept: the English source term, its Spanish and German forms, and a note. `src/i18n/` follows it, and `tests/repo/i18n-glossary.test.ts` checks every catalog entry against it: if an English message uses a term below, the Spanish and German messages for the same key must use theirs.

In a language cell, forms are separated by ` · ` (`seam allowance · seam allowances`); `=en` means the language keeps the English term; `—` means pending and is skipped. A form matches as a substring after folding (accents, umlauts and case removed, `ß` as `ss`), so a plural or an inflected form counts when the first form already sits inside it.

The German column is pending: every `de` cell is `—` until the native reviewer approves the glossary (spec § 7.1 item 2). The Banned table below lists the German forms as proposed. This file replaces `docs/specs/2026-07-16-ui-copy-es-glosario.md`, kept as a record.

## Terms

| en | es | de | note |
|---|---|---|---|
| piece | pieza | — | |
| seam | costura | — | |
| seam allowance | margen de costura · márgenes de costura | — | |
| dart | pinza | — | |
| notch | piquete | — | |
| grainline | hilo | — | "dirección de hilo" when there is room. |
| thread | hilo | — | Sewing thread (hilo de coser). Shares the word with grainline on purpose: "Color del hilo" lives in the three topstitch tools, between "Tipo de puntada" and "Largo de puntada", where nobody reads it as the weave direction, and grainline has its long form to disambiguate from the other side. Decided in #1049. |
| flat-felled | =en | — | Not translated, same rule as `overlock`: an industry term that is kept. The three Spanish candidates each had a problem: "ribeteada" in a workshop often means overlock and would sit in the same dropdown, "rebatida" is regional and not known to be María's word, "tipo jean" is exact but colloquial for a professional tool. Samuel's decision (#1049). If María uses her own, it changes in one place. |
| french seam | costura francesa | — | |
| overlock | =en | — | Industry term, not translated. |
| grading | escalado | — | "escalado de tallas" in descriptions. |
| interfacing | entretela | — | |
| fabric | tela | — | |
| nesting · marker | marcada | — | Industry term (Optitex); "nesting" only in descriptions. |
| topstitch | pespunte | — | |
| gather | fruncido | — | |
| ease | embebido | — | |
| tech pack | ficha técnica | — | |
| BOM | lista de materiales · BOM | — | The acronym is kept, it is an industry term. |
| fit | ajuste | — | fit map = "mapa de ajuste". |
| stress | tensión | — | |
| strain | estiramiento | — | |
| drape | caída | — | Verb: "drapear" is accepted. |
| turntable | vuelta 360° | — | |
| avatar | =en | — | |
| mismatch | diferencia | — | Seam length (largo de costura): "⚠ 12.3mm de diferencia". |
| construction line | trazo · construcción | — | "trazo" for the line; "Construcción" for the switch in the layer row. Spec 2026-09-12. |
| undo | deshacer | — | |
| redo | rehacer | — | |
| import | importar | — | |
| export | exportar | — | |
| delete | eliminar | — | Buttons name the object: "Eliminar pieza". |
| duplicate | duplicar | — | |
| save | guardar | — | |
| reset | restablecer | — | |
| select | seleccionar | — | |
| settings | ajustes | — | Never "configuración" and "ajustes" mixed. |
| properties | propiedades | — | |
| layers | capas | — | |
| view | vista | — | |
| snapshot | captura | — | |
| simulate · simulating | simular · simulando | — | Sentence case. The status line at the foot says "Simulando · N fps · motor" (P5), no longer "SIMULANDO" in capitals. From the click on "Simular" to the first frame, the status says "Preparando la tela · motor". |
| arrange | colocar | — | 3D placement of pieces. |
| sew | coser | — | |
| dress avatar | vestir avatar | — | |
| auto-sew | coser automáticamente · costura automática | — | The toast used to say "Auto-sew: N costuras propuestas"; unify to "Costura automática: N propuestas". |
| textured | texturizado | — | Surface modes. |
| solid | sólido | — | Surface modes. |
| wireframe | alambre | — | Surface modes. |
| loading | cargando | — | |
| refresh | actualizar | — | |

## Banned

| lang | forms | reason |
|---|---|---|
| es | heredar · heredado · heredada · heredados · hereda · heredan | Not a pattern-making word; name the concrete relation instead ("usa el margen de la pieza"). María [25:01]: "Esto de heredar, no sé muy bien a qué se refiere… un poco antiguo en español". Rule 6 of the 2026-07-16 glossary. |
| en | inherit · inherits · inherited · inheriting | Same ban in English: name the concrete relation. |
| de | vererben · vererbt · geerbt | Proposed forms of the same ban; the native reviewer confirms them. |

## Open questions for the reviewer

1. Notch: `Knipse`, `Passzeichen` or `Kerbe`? The sources checked attest these three and not `Knipser`.
2. `flat-felled` and BOM: does German have an established term, or is the English kept?
3. `du` or `Sie`, wherever the text addresses the person: the copilot and the home's calls to action.
