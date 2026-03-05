# Open Couture Initiative — Project Charter

**ID:** OC-2026-001
**Fecha:** 27 de Enero, 2026
**Líder / Arquitecto Principal:** Samuel Dario
**Tipo:** Desarrollo de Software / I+D Open Source
**Licencia:** MIT

---

## Estado del Proyecto (Marzo 2026)

- **Versión Actual:** v0.6.0 "Architectural Shift"
- **Hitos:** Implementación de XPBD en Rust/WASM, Motor Semántico consolidado, y Copilot con Memoria Durable.
- **Próximo Objetivo:** v0.7.0 "Precision & UX" (Ver [Roadmap](../ROADMAP.md)).

## Resumen Ejecutivo

La industria de la moda digital está fragmentada: soluciones propietarias de alto costo (CLO3D, Marvelous Designer) dominan el mercado profesional, mientras que soluciones open source potentes (Seamly2D/Valentina para patronaje CAD, Blender para simulación/renderizado) existen aisladas, sin comunicación fluida entre ellas.

**Open Couture** crea un ecosistema unificado de código abierto capaz de competir en calidad visual y precisión técnica con los estándares de la industria, democratizando el acceso a la tecnología de moda de alto nivel.

## El Problema

- Diseñadores independientes, estudiantes y pequeñas marcas enfrentan barreras de entrada prohibitivas por costos de licenciamiento
- El flujo de trabajo actual en Open Source es ineficiente: exportaciones manuales destructivas que rompen la parametricidad
- No existe solución unificada que conecte patrón 2D ↔ simulación 3D sin pérdida de datos

## La Oportunidad

- Demanda creciente de digitalización en moda (muestreo virtual, metaverso, reducción de desperdicio textil)
- Herramienta gratuita que iguale CLO3D = el "Linux" de la industria de la moda
- AI como diferenciador que el software legacy no puede replicar rápidamente

## Valor Propuesto

1. **Reducción de Costos** — eliminación de licencias recurrentes
2. **Calidad Superior** — renderizado de nivel producción
3. **Integridad de Datos** — flujo no destructivo entre patrón 2D y simulación 3D
4. **AI-Native** — generación de patrones, ajuste automático de tallas, copilot integrado

## Alcance

### In-Scope
- Núcleo lógico (middleware) que interprete archivos de definición de patrones paramétricos
- Algoritmos de meshing: vectores 2D → mallas 3D optimizadas para física de telas
- Lógica de ensamblaje virtual (definición de costuras y uniones)
- GUI unificada para manipulación de variables del patrón dentro del entorno 3D
- Sistema de simulación física en tiempo real (drapeado y colisiones)
- Compatibilidad de formatos industriales (DXF ASTM, CLO3D .zprj, Gerber AccuMark)

### Out-of-Scope (v1.0)
- Motor de renderizado propio (se usa Three.js / potencial bridge a Blender Cycles)
- Núcleo matemático CAD desde cero (se usan librerías de geometría existentes)
- PLM / gestión de inventario
- Salida directa a hardware de corte industrial (plotters/cutters)

## Objetivos SMART

1. **Funcionalidad:** MVP que permita importación, costura y simulación de prenda básica sin errores de topología
2. **Calidad Visual:** Renders de calidad producción
3. **Rendimiento:** Actualización 3D tras modificación 2D en tiempo casi-real
4. **Interoperabilidad:** Import/export compatible con CLO3D, Gerber AccuMark, ASTM DXF
5. **Licenciamiento:** Código bajo MIT, repositorio público, contribución comunitaria

## Riesgos Principales

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Complejidad de topología (triangulación de curvas: sisas, cuellos) | Crítico | Pruebas tempranas con remeshing adaptativo |
| Estabilidad de simulación ("explosiones" de malla, colisiones fallidas) | Alto | Solvers de física probados, márgenes de seguridad en colisiones |
| Curva de aprendizaje para diseñadores de moda | Medio | UX en terminología de modistería, no de ingeniería 3D |
| Rendimiento en browser (simulación pesada) | Alto | Web Workers, WASM para cálculos críticos, LOD progresivo |

## Entregables

1. **Código fuente** — repositorio estructurado y documentado
2. **Aplicación web** — PWA accesible desde cualquier navegador
3. **Documentación de arquitectura** — specs técnicos, diagramas de flujo
4. **Guía de usuario** — tutoriales y documentación para el usuario final

## Stakeholders

- **Arquitecto & Lead:** Samuel Dario
- **Usuario principal:** María (patronista, Adidas) — validación real de workflows profesionales
- **Comunidad potencial:** Seamly2D, Blender Foundation, fashion-tech community
- **Usuarios finales:** Patronistas, diseñadores de moda, artistas 3D, instituciones educativas
