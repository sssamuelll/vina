# Fase 2 — C7: Camera / viewport controls

**Estado:** cerrado como **no-drift, misclassified**. Ningún cambio de código necesario.

**Eje:** C7 — Camera/viewport controls (`drift-inventory-fase1.md` axis C7, classification `(a)` mecánico, originalmente size S, marcado "drift cosmético / justificado").

---

## 1. Hallazgo

El `drift-inventory-fase1.md` capturó C7 así:

> 3D: OrbitControls (drei) + pan manual con PointerCapture (`Viewport3D.tsx:207–237` reimplementa lo que OrbitControls ya tiene, solo para cambiar mapeo de botones).

**Esa lectura es incorrecta.** El custom pan de `Viewport3D.tsx:207–243` no re-implementa OrbitControls native pan — tiene **semántica deliberadamente distinta**.

### Diferencia semántica

**OrbitControls native pan:** mueve `camera.position` Y `controls.target` juntos. La cámara "arrastra" el target.

**Custom pan (Viewport3D.tsx:207–243):** mueve **solo `camera.position`**, target queda fijo. Documentado en líneas 203–204:

```typescript
// Custom pan: middle-click drag translates camera only, keeping orbit target
// locked on the avatar so right-click orbit always rotates around the avatar.
```

La intención: el avatar siempre queda en el centro de orbit. Si el usuario panea con middle-click, la cámara se mueve pero el target sigue en el avatar. El siguiente right-click orbit gira alrededor del avatar, no alrededor del nuevo punto donde quedó el target después del pan.

Eso es **feature de UX intencional**, no re-implementación accidental. Reemplazar con OrbitControls native pan rompería el invariante observable del sistema.

---

## 2. Por qué el inventario lo capturó como drift

Lectura superficial: el inventario vio "código que hace pan + OrbitControls que también puede hacer pan" → asumió re-implementación. No verificó la semántica diferenciada.

**Lección metodológica capturada:** para axes que sospechan "re-implementación de algo", verificar la semántica antes de asumir drift. Re-implementación con semántica deliberadamente distinta es feature, no drift.

Triggers para sospechar feature:

- Comentarios en código documentando la intención (`// keeping orbit target locked on...`).
- Helpers nombrados específicamente (`patchMouseButtons` sugiere intención de modular).
- Tests que verifican el comportamiento específico.

Si encontrás cualquiera de esos cerca de la "re-implementación", parate y leé antes de proponer canónico.

(Esta lección queda capturada en CLAUDE.md como adición a la sección de drift methodology.)

---

## 3. Hallazgo separado durante la investigación — issue #629

Mientras investigaba C7 surgió un **drift secundario real, pero NO parte de C7**:

`Viewport3D.tsx:184–201` implementa `patchMouseButtons`, un callback que re-aplica la config de `mouseButtons` de OrbitControls cada frame vía `onChange`, porque, per el comentario inline, "OrbitControls from drei can reinitialise its internal mouseButtons after mount."

```typescript
const patchMouseButtons = useCallback(() => {
  const controls = orbitRef.current;
  if (!controls) return;
  const mb = controls.mouseButtons;
  if (mb.LEFT !== (-1 as unknown as THREE.MOUSE) || ...) {
    controls.mouseButtons = { ... };
  }
}, []);
```

**Eso es workaround, no solución.** Re-aplicar config cada frame en un polling pattern indica que la config se está perdiendo/reseteando downstream del mount. Ese es drift real (workaround estructural).

**Capturado como axis nuevo:** issue **#629** — "patchMouseButtons polling workaround in Viewport3D suggests config-not-persisting bug". Severity:medium, audit + follow-up. NO se incluye en el cierre de C7 — es un axis distinto, capturado limpio en lugar de mezclado por proximidad.

### Por qué no fold-in a C7

Razones contra mezclar (per Sam's directive):

1. **Trazabilidad.** Si C7 cierra con "custom pan ratificado + patchMouseButtons fixed", en seis meses alguien que busca C7 encuentra dos cosas distintas y tiene que adivinar cuál era el axis original.
2. **Scope creep silencioso justificado por proximidad** — exactamente el anti-patrón que el audit está diseñado para evitar.
3. **Scope desconocido.** El patchMouseButtons workaround puede revelar bug en drei, en strict mode, en cómo se monta el componente. Eso no es S — es scope a investigar antes de decidir tamaño. Resolverlo dentro del cierre rápido de C7 introduce el riesgo "M aprobado → realidad XL" que ya sufrimos en B11-state.

Mejor dos ejes claros (C7 cerrado, #629 abierto) que uno enredado.

---

## 4. Resultado

**C7 cerrado por reclasificación. Cero código a tocar para el axis original.**

- El custom pan es feature intencional documentada.
- El patchMouseButtons workaround es drift real, pero su propio axis (issue #629).
- Lección metodológica capturada en CLAUDE.md.
- Inventario actualizado con anotación inline.

---

## 5. No issues nuevas además de #629

- Custom pan no requiere fix.
- Custom pan no requiere documentación adicional (ya está documentado en código).
- La drift secundaria está limpiamente capturada en su propio issue.

---

**FIN. Eje cerrado por reclasificación.**
