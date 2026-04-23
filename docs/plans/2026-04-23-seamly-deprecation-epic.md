# Epic proposal: Deprecar Seamly como fuente primaria (migración a lectura por archivo)

## Nota de corrección
- Terminología corregida: **no es “Swanky”**, es **Seamly**.

## Comentarios para PR (listos para publicar)

### Comment 1 — Scope correction
Gracias por el feedback. Corregido el alcance: la conversación y el plan aplican a **Seamly** (no Swanky).

### Comment 2 — Why an epic first
Totalmente de acuerdo en no deprecar de inmediato. Tiene más sentido abrir un **Epic** primero para evitar regresiones y migrar de forma controlada.

### Comment 3 — Quality rationale
La motivación principal queda explícita: muchos patrones de Seamly disponibles hoy son demasiado básicos para el estándar actual; se conserva compatibilidad leyendo patrones desde archivo cuando sean necesarios.

---

## Epic (GitHub issue)

**Title**
Deprecate Seamly as primary pattern source; keep file-based compatibility path

**Body**
### Context
Seamly se ha usado como fuente principal de patrones, pero una parte relevante del catálogo actual resulta demasiado básica o de baja calidad para los flujos de producción objetivo.

### Decision (proposed)
- Dejar de tratar Seamly como fuente primaria.
- Mantener una ruta de compatibilidad leyendo patrones desde archivo.
- Ejecutar migración por fases con feature flag y métricas.

### Goals
- Reducir dependencia operativa de Seamly en runtime.
- Preservar compatibilidad de importación vía archivo.
- Evitar regresiones funcionales y de performance.

### Non-goals
- Eliminar Seamly inmediatamente del código.
- Romper compatibilidad con patrones existentes en proyectos de usuario.

### Success metrics
- % de flujos que usan fallback por archivo vs Seamly primario.
- 0 regresiones críticas en tests de importación/adaptación.
- Tiempo de importación estable o mejorado en datasets reales.

### Risks
- Inconsistencias de parsing entre fuentes.
- Cobertura insuficiente de tests sobre patrones edge-case.
- Dependencias ocultas en módulos legacy.

### Rollout plan
1. Inventario de dependencias de Seamly.
2. Feature flag para desactivar Seamly primario.
3. Ruta de lectura por archivo como default progresivo.
4. Observabilidad + estabilización.
5. Sunset final con fecha objetivo.

---

## Child issues (propuestas)

### 1) Inventory Seamly dependencies
- Mapear todos los módulos, rutas y comandos que dependen de Seamly como fuente primaria.
- Entregable: matriz de dependencias + criticidad.

### 2) Add feature flag for Seamly primary source
- Introducir flag de runtime/config para activar/desactivar Seamly primario.
- Criterio: fallback funcional sin cambios de API externa.

### 3) Implement file-based ingestion as preferred path
- Priorizar lectura desde archivo con validaciones mínimas.
- Mantener compatibilidad con formatos actuales soportados.

### 4) Add migration-safe adapter contract tests
- Tests de contrato para asegurar equivalencia funcional entre rutas.
- Incluir fixtures representativos + edge cases.

### 5) Add telemetry for source usage
- Instrumentar métricas de uso (Seamly primario vs archivo).
- Dashboard mínimo para seguimiento de rollout.

### 6) Deprecation communication + docs
- Documentar deprecación gradual, timeline, fallback y notas de versión.
- Checklist de readiness para sunset final.
