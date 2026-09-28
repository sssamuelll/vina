# CAD de moda: cómo se presentan los incumbentes en su portada (estado a 27-sep-2026)

Notas de investigación para el posicionamiento y diseño de la homepage de Vina. Cubre CLO3D, Browzwear, Optitex, Style3D, Marvelous Designer, Lectra (Modaris y Gerber AccuMark, más el lanzamiento Apogy), Tukatech, Assyst, Audaces, Seamly2D, Valentina y Tailornova.

Convenciones de esta nota:

- «[captura]» = observación directa sobre la página viva, renderizada con Playwright/Chromium a 1440×900, `deviceScaleFactor 1`, locale `en-US`, el 27-sep-2026. Los valores de tipografía y color son **estilos computados leídos del DOM** (`getComputedStyle`) o **píxeles muestreados de la captura**, no estimaciones a ojo. Las alturas de página son `scrollHeight`.
- «[Wayback AAAA-MM-DD]» = snapshot de web.archive.org renderizado del mismo modo; la fecha es la del snapshot real servido, no la pedida.
- Las citas en inglés se transcriben tal cual (mayúsculas incluidas). Las capturas PNG viven en el scratchpad de la sesión (`/private/tmp/claude-501/…/scratchpad/sites/{,probe/,wayback/,wayback2/,wayback3/}`); son efímeras.
- Lo que no pude verificar está en «Gaps», no disimulado en el texto.

---

## 1. CLO3D (clo3d.com)

### Takeaway
CLO es la única portada del grupo que lleva **dos años sin cambiar de estructura** (mismos titulares y secciones en sep-2024, jun-2025 y sep-2026): rota únicamente el hero de campaña por versión («CLO 2026.1 is here»), con fotografía editorial de moda —no render— y precios públicos ($25/$50 al mes, prueba de 14 días). Tiene versión en español completa pero con costuras visibles (tagline y campaña sin traducir, «Manténte», «Activos» por *Assets*).

### Cited Findings
- Título de la pestaña: «CLO | 3D Fashion Design Software». Navegación: «Product ▾ · Pricing · Solution ▾ · Learn ▾ · Support ▾ · Assets 🛍», más «START FREE TRIAL» (botón #40a9ff, radio 4 px, Poppins 14 px peso 500, mayúsculas) y «Sign In» [captura] — [clo3d.com/en/](https://www.clo3d.com/en/)
- Hero de campaña (slide 1 de un carrusel con 4 vídeos autoplay): fotografía de estudio a sangre —modelo de pelo negro largo, blusa blanca, falda plisada gris sobre pantalón, de pie sobre un montículo de tierra con amapolas rojas—, crédito en la esquina «© 2026. Yoon Dasom. All Rights Reserved.»; encima, logotipo CLO + «2026.1 is here» en blanco fino y la tagline «Make it, for real.»; botones «NEW FEATURE» (#40a9ff) y «WEBINAR SCHEDULE» (#6e7175 gris). El fondo fotográfico muestrea entre #b8b7b3 y #d4d0cc (gris cálido de ciclorama) [captura] — [clo3d.com/en/](https://www.clo3d.com/en/)
- Titular H1 real (slide 2): «CHANGING THE WORLD WITH VIRTUAL GARMENTS», Poppins 32 px/32 px peso 700, mayúsculas, blanco; subtítulo «Create and alter true-to-life 3D garments so you can perfect your ideas before they go into production.» y CTA «START YOUR FREE TRIAL» [captura y Wayback 2024-09-16] — [clo3d.com/en/](https://www.clo3d.com/en/); [Wayback 2024-09-16](https://web.archive.org/web/20240916175321/https://clo3d.com/en/)
- Secciones (H2 Poppins 50 px peso 700 negro sobre blanco, mucho aire): «CREATE REAL GARMENTS IN REAL-TIME» (render de figura con abrigo), «SIMPLE, YET INTUITIVE» (render de vestido amarillo sobre avatar gris), «EFFICIENT FROM END-TO-END» (diagrama lineal «Without 3D Software: Materials → Design → Sample → Review → Market» vs «With 3D Software: … 3D Sample → Review → Sample → Market»), «CREATE SUSTAINABLY» (render de figura con prenda-flor y lirios araña rojos sobre gris claro), «SEE HOW CLO IS TRANSFORMING THE INDUSTRY» (carrusel de historias: Jaeyong Lee/VGlab, An Bo «Fashion Designer, Founder of ANNBOO Collection», «2026 User Summit Bengaluru»), newsletter y footer oscuro. Altura total 4327 px [captura] — [clo3d.com/en/](https://www.clo3d.com/en/)
- No hay muro de logos de clientes en la home; la prueba social son tres testimonios con retrato circular [captura] — [clo3d.com/en/](https://www.clo3d.com/en/)
- IA en portada: únicamente un botón flotante «Open AI Chatbot» (#7a90fb, esquina inferior derecha); existía ya en sep-2024 (#879cff). Ninguna función de IA del producto se anuncia en la home [captura; Wayback 2024-09-16] — [clo3d.com/en/](https://www.clo3d.com/en/); [Wayback 2024-09-16](https://web.archive.org/web/20240916175321/https://clo3d.com/en/)
- Precios (página «Plans»): «Choose a plan that's right for you.» · toggle «Monthly / Yearly (Save 25%)» · **Student $25 USD / monthly** · **Individual $50 USD / monthly** («Tax, VAT not included.») · Enterprise «CONTACT US» · Academic «CONTACT US» · «Start your 14-day free trial». Elegibilidad Individual: «Hobbyist / Freelancer / Self-employed Individual / One-person Company» [captura] — [clo3d.com/en/plans](https://www.clo3d.com/en/plans)
- Idiomas: `hreflang` en, ko, ja, zh, **es**, pt, fr. La versión española traduce nav y secciones («Producto · Precios · Soluciones · Formación · Soporte · Activos», «INICIA UNA PRUEBA GRATUITA», «CAMBIANDO EL MUNDO CON PRENDAS VIRTUALES», «CREA PRENDAS REALES EN TIEMPO REAL», «SIMPLE E INTUITIVO», «EFICIENTE DE PRINCIPIO A FIN», «CREAR DE FORMA SOSTENIBLE») pero deja en inglés el hero de campaña («CLO 2026.1 is here / Make it, for real.»), «2026 User Summit Bengaluru» y «Open AI Chatbot»; escribe «Manténte al día con CLO» (tilde incorrecta) y traduce *Assets* como «Activos» [captura] — [clo3d.com/es/](https://www.clo3d.com/es/)
- Tipografía: Poppins 300/400/500/700 en todo el sitio (más BIZ UDGothic para japonés); cuerpo 16 px [captura] — [clo3d.com/en/](https://www.clo3d.com/en/)
- Evolución 2024→2026: en sep-2024 la nav iba en mayúsculas «PRODUCT · PLANS · ENTERPRISE · LEARNING · RESOURCES · ASSETS · FREE TRIAL · SIGN IN» y los testimonios eran «2024 User Summit New York / Hong Kong» y Monica Findeis «Freelance 3D Designer»; en jun-2025 ya estaba la nav actual en Title Case y el widget de accesibilidad. Titulares y estructura idénticos en los tres cortes [Wayback 2024-09-16; Wayback 2025-06-20; captura] — [Wayback 2024-09-16](https://web.archive.org/web/20240916175321/https://clo3d.com/en/); [Wayback 2025-06-20](https://web.archive.org/web/20250620044747/https://www.clo3d.com/en/)
- Reseñas G2: «huge learning curve», «months to full proficiency», aunque «easier to get started with due to its user-friendly interface, public tutorials, and active creator community» (resumen de búsqueda) — [G2 CLO 3D Fashion](https://www.g2.com/products/clo-3d-fashion/reviews)

### Inferences
- CLO se dirige a una mezcla de marca y freelance/estudiante (plan Individual con «Hobbyist / Freelancer»; testimonios de diseñadores independientes), pero la retórica del hero («CHANGING THE WORLD») es de marca-mundo, no de oficio.
- El producto no aparece en la portada: ni un pixel de interfaz above the fold ni debajo; la pieza de moda es lo que se vende. Es la portada con más «lujo fotográfico» del grupo y a la vez la más genérica en texto.
- Que la campaña rote y la estructura permanezca sugiere una plantilla estable con slot de hero; el sistema visual (Poppins + azul #40a9ff + radio 4 px) es el mismo desde al menos 2024.

### Gaps
- No verifiqué si «Open AI Chatbot» es soporte o asistente de producto, ni qué es «CLO-Vise» (aparece en el footer bajo Solution).
- La calidad del español la juzgo solo por la home; no revisé planes ni soporte en español.

---

## 2. Browzwear — VStitcher / Lotta / Stylezone (browzwear.com)

### Takeaway
Browzwear es el rediseño más reciente y más «SaaS 2026» del grupo: entre el 6-ene-2026 y sep-2026 pasó de hero oscuro con píldora verde neón (#13ff04) a **papel cálido #f9f5f3, tinta #0a1120 y un solo acento naranja #ff5724**, con titular «From vision to reality, driven by AI & 3D» y **precios públicos para freelancers** ($750/año). Sigue sin español (solo inglés y chino simplificado).

### Cited Findings
- Título: «Browzwear | #1 Digital Apparel Design & Development Software». CMS HubSpot. Nav: «Platform · Solutions · Resources · Company · Pricing», globo de idioma y «Request a Demo» (píldora #ff5724, radio 100 px, Inter 14 px peso 600, texto blanco) [captura] — [browzwear.com](https://browzwear.com/)
- Hero: H1 «From vision to reality, driven by AI & 3D» en Gilroy 60 px/60 px peso 600, tinta #0a1120, con «AI & 3D» en naranja #ff5724; subtítulo «Speed up time-to-market and boost revenue with our digital platform that helps fashion brands design, sell, and make products in one connected workflow.»; CTAs «Explore Plans» (píldora contorno 2 px #0a1120) y «Book a Demo» (píldora rellena #0a1120). Fondo #f9f5f3 (muestreado en 5 puntos) [captura] — [browzwear.com](https://browzwear.com/)
- Imagen del hero: fotografía de una mujer con camiseta blanca y vaquero negro, rodeada de tarjetas flotantes que imitan una interfaz: «✓ Style Request», «Tech Pack ✓ / 3D Renders / Pattern Pieces», «Approved ✓ / In Review / Rejected», una tarjeta con boceto sobre maniquí + «vs» y un chip «✨ AI Generated Model». No es la interfaz real de VStitcher [captura] — [browzwear.com](https://browzwear.com/)
- Bajo el hero: «TRUSTED BY THE BEST» con bonprix, odlo, Nike, TARGET, Under Armour, VF (carrusel con Otto, Walmart, Puma) [captura] — [browzwear.com](https://browzwear.com/)
- Secciones (eyebrow naranja en versalitas + H2 Gilroy 44 px con una palabra en naranja): «THE GLOBAL STANDARD — Powering the digital fashion Industry» con cuatro tarjetas de cifras «1000+ Fashion & Apparel Companies · 10M+ Digital Garments Created · 30+ Countries · 50%-80% Fewer Physical Samples»; «SEAMLESS AUTOMATION — Intelligent workflows that turn ideas into digital assets» («Most 3D tools stop at design. Browzwear connects every stage, from first sketch to factory floor, so nothing gets lost in translation.»); banda azul-negra #0a1120 «PERFORMANCE THAT MATTERS — From idea to approval in hours - not months»; «ENDORSED BY INDUSTRY LEADERS — What leading brands are saying»; «GET STARTED — See Browzwear in action» con la línea «Available for enterprise teams, brands, and independent creators.»; newsletter. Altura 4896 px [captura] — [browzwear.com](https://browzwear.com/)
- Tipografía: Gilroy (títulos, 600) + Inter (cuerpo 16 px y botones); se sigue cargando Lato desde Google Fonts (residuo) [captura] — [browzwear.com](https://browzwear.com/)
- Precios («Digital Product Creation, Built to Scale» / «From first projects to enterprise-wide adoption, choose the plan that fits your workflow today and scales with your growth.»): **Freelancer $750 /yr · FreelancerPlus $1500 /yr · Teams $3950 /yr · Enterprise Custom**, «Save 16% on yearly plan!», toggle Yearly/Monthly; Teams = «up to three named users and 100 styles per year»; «Teams plans may be subject to a price increase of up to 7% at renewal»; IA/render en Teams «Limited – 50 credits total»; estudiantes: «Approved applicants receive a free six-month Learner li[cense]» [captura] — [browzwear.com/pricing-plans](https://browzwear.com/pricing-plans)
- Toggle mensual: la lectura textual de la página devuelve «$75/mo» y «$150/mo» para Freelancer/FreelancerPlus (coherente con el 16 % anual sobre $900/$1800) — [browzwear.com/pricing-plans](https://browzwear.com/pricing-plans)
- Chatbot: «👋 Hey there! I'm Stitch, your Virtual Prototype sidekick. Looking to speed up prototyping, cut down on samples, or just explore how Browzwear fits your flow? I'm here for it!» [captura] — [browzwear.com/pricing-plans](https://browzwear.com/pricing-plans)
- IA anunciada: «AI Ideation in Whiteboard» (release 2026.1, 30-mar-2026): «Designers can create sketches, garment images, mood boards, and photorealistic photoshoot images for e-commerce use in seconds, through text and picture prompts.» — [Browzwear blog 2026.1](https://browzwear.com/blog/browzwear-2026.1-closing-the-gaps-in-your-digital-fashion-workflow)
- Idiomas: `hreflang` en, zh-cn; selector «English / 简体中文». Sin español [captura] — [browzwear.com](https://browzwear.com/)
- Historial: 2024-09-12 → hero azul marino oscuro, H1 «Accelerate Workflows, from Sketch to Store.» (Gilroy 48 px), sub «Empowering over 1,000 fashion and apparel companies as they navigate their path toward digital transformation.», píldora verde #13ff04 «Customer Stories», secciones «Connected by Creation», «Fewer Samples, Faster Decisions», «Gain Back Your Time»; 2025-05-26 → «Rapid Apparel Development, With Unparalleled Precision.» (aparece «Pricing» en la nav, sigue el verde); 2025-10-11 y 2026-01-06 → mismo titular, foto clara de una mujer con camisa de rayas y gemelo dorado, píldora verde, logos «TRUSTED BY THE WORLD'S BIGGEST BRANDS» (target, odlo, PVH, Walmart, OTTO, Lidl). La versión actual (papel cálido + naranja + «AI & 3D») es posterior al 6-ene-2026 — [Wayback 2024-09-12](https://web.archive.org/web/20240912175659/https://browzwear.com/); [Wayback 2025-05-26](https://web.archive.org/web/20250526124340/https://browzwear.com/); [Wayback 2025-10-11](https://web.archive.org/web/20251011012827/https://browzwear.com/); [Wayback 2026-01-06](https://web.archive.org/web/20260106042720/https://browzwear.com/)
- La identidad (logotipo de líneas onduladas) es obra de YummyColours, reseñada en Brand New — [UnderConsideration](https://www.underconsideration.com/brandnew/archives/new_logo_and_identity_for_browzwear_by_yummycolours.php)
- Reseñas: quejas de soporte tras contrato enterprise («support became slow»), «sudden crashes, tools not showing up», «More options required in the 2D window to make corrections for patterns» (resumen de búsqueda) — [Capterra VStitcher](https://www.capterra.ca/software/89380/vstitcher); [G2 Browzwear pros/cons](https://www.g2.com/products/browzwear/reviews?qs=pros-and-cons)

### Inferences
- Es la portada que más se parece a un producto de software «premium 2026» (paleta contenida, una fuente de display y una de texto, eyebrows, tarjetas de cifras) y la única que ha convertido el precio en argumento de portada («Explore Plans» junto a «Book a Demo»).
- El público sigue siendo la marca («fashion brands design, sell, and make»); el freelance entra por la puerta de atrás del pricing. La palabra «pattern» solo aparece en un chip.
- Las tarjetas flotantes son el sustituto de mostrar la interfaz: cuentan un flujo (solicitud → tech pack → aprobación) sin enseñar el CAD.

### Gaps
- No pude fijar el mes exacto del rediseño 2026 (acotado entre 2026-01-06 y 2026-09-27). Wayback devolvió 429 en varios intentos intermedios.
- Los precios mensuales ($75/$150) proceden de la lectura textual, no de captura con el toggle activado.

---

## 3. Optitex (optitex.com)

### Takeaway
Optitex es la portada **más estática y más ajena a la moda**: fondo negro, titulares en Montserrat 300 con palabras en caligrafía Caveat («from GREAT ART to PERFECT FIT»), un asiento de coche renderizado en el hero, sin CTA en el hero, sin IA y con un formulario de contacto de 11 campos. Idéntica a sep-2024. Sí tiene español (WPML), con fugas de inglés y una H1 más pequeña que la inglesa.

### Cited Findings
- Título: «Fashion Design Software | 2D/3D CAD CAM – Optitex». WordPress + WPML 4.6.11. Nav: icono de rejilla, lupa, «OPTITEX», «Solutions · Products · Services · About · Support», «Book a Demo» (botón blanco #ffffff/#231f20, radio 0, Inter UI 15 px) y «Contact us» (amarillo #ffc000, texto negro, radio 0), bandera «English» [captura] — [optitex.com](https://optitex.com/)
- Hero: carrusel de 3 slides sobre fondo negro desenfocado (píxeles entre #070709 y #27282a). Titulares H1 en Montserrat 300, 48 px/68 px, mayúsculas, blanco, con las palabras pequeñas en Caveat cursiva: «from GREAT ART / to PERFECT FIT» y «driven by PRECISION / powered by EFFICIENCY» (este último repetido para dos industrias). Slide visible: un avatar 3D translúcido detrás de un **asiento de automóvil** renderizado con sus piezas de patrón 2D a la derecha. **Sin botón de acción dentro del hero** [captura] — [optitex.com](https://optitex.com/)
- Secciones: ticker «Recent news — Sep 24, 2025 / Optitex to Present End-to-End Pattern Development and Production Solutions at CISMA 2025»; banner degradado rojo-naranja «OPTITEX O/26.1 Release Available Now — Learn More»; bloque «why OPTITEX» (H2 Montserrat 68 px peso 300, «why» en Caveat) sobre degradado magenta→violeta con seis viñetas: «Interoperable 2D/3D portfolio · Open to all standard software or hardware formats · Flexible, user-friendly patternmaking and nesting tools · Functional grading to achieve full production-ready digital patterns · Seamless collaboration tools across the entire supply chain · Automatic nesting for early costing»; «OUR CUSTOMERS» con 20 logos (M&S, asos, next, GAP, Rapha, carmel, GROUPE ERAM, Nike, FORVIA, MAGNA, adidas, TOMMY HILFIGER, RECARO, LEAR, ADIENT, Yanfeng, ASU, ATHOS PALLAS, LI & FUNG, CIOVITA); cierre «Curious how Optitex can work for you? Get in touch.» en Caveat rosa y formulario de 11 campos (First/Last Name, Work Email, Job Title, Company Name, Country, Work Phone, Website, Market Segment, «What is your occupancy?», «Do you currently use any in-house digital development software? If yes, please specify.», «Which type of product / garment are you currently developing?») con «Submit» amarillo. Altura 3967 px [captura] — [optitex.com](https://optitex.com/)
- IA: ninguna mención en la home [captura] — [optitex.com](https://optitex.com/)
- Tipografía: Montserrat 300/400/500/600 + Caveat 400 (Google Fonts); cuerpo en «Inter UI» 16 px [captura] — [optitex.com](https://optitex.com/)
- Idiomas: English · Español · Italiano (`hreflang` en-us, it-it, en-gb, es). En español: H1 «desde EL BUEN DISEÑO / hasta EL AJUSTE PERFECTO» a **32 px/50 px** (frente a 48 px en inglés); nav «Soluciones · Productos · Servicios · Asistencia · Acerca de · Solicitar una demostración · Contacto»; secciones «ÚLTIMAS NOTICIAS», «NUESTRAS SOLUCIONES» («Moda y ropa», «Interior de transportes», «Tapicería de muebles»), «por qué OPTITEX», «NUESTROS CLIENTES», «Ponerse en contacto». Fugas: «Contact Us», «About», «Country *», «Select...» y la lista de países en inglés; nombres de producto sin traducir («2D/3D Pattern Design Software», «Sketch & Fill», «CutPlan»); «Ultima versión» sin tilde; «Cargo Laboral Actual» [captura] — [optitex.com/es/](https://optitex.com/es/)
- Precios/prueba: nada; solo «Book a Demo» y «Contact us» [captura] — [optitex.com](https://optitex.com/)
- Historial: el snapshot de 2024-09-17 tiene los mismos tres titulares, la misma pareja Montserrat 300 + Caveat y ya ofrecía English/Español/Italiano. No hay rediseño 2024→2026 — [Wayback 2024-09-17](https://web.archive.org/web/20240917224118/https://optitex.com/)
- Reseñas G2 (6 reseñas, 4,6/5): «It could be more user friendly and few things are really difficult to handle»; «optitex 3D platform, which is much complex and vast» (resumen de búsqueda) — [G2 Optitex Creative](https://www.g2.com/products/optitex-creative/reviews)

### Inferences
- La mitad del muro de logos es asiento de automóvil (FORVIA, MAGNA, RECARO, LEAR, ADIENT, Yanfeng): la portada refleja una empresa que ya no prioriza la moda, lo que deja a la patronista de confección sin un espejo.
- La caligrafía Caveat es el único gesto «humano» del grupo y, combinada con Montserrat 300 y degradados magenta, lee como plantilla de 2018, no como lujo.
- Un hero sin CTA y un formulario de 11 campos son el extremo opuesto de «abrir en el navegador».

### Gaps
- No revisé el contenido del banner O/26.1 ni si «Recent news» de sep-2025 es la última noticia real (el snapshot 2024 medía 22 094 px; la home actual 3967 px, probablemente por carga diferida).

---

## 4. Style3D (style3d.com) — y Assyst como filial

### Takeaway
Style3D cambió de discurso entre mar-2025 y sep-2026: de «Digital Garment Modeling Software / Studio V8.0 is Here!» con vídeo de una mano trazando un patrón con stylus, a **«Powering Physical Intelligence for the Next Digital Era»** con un lazo de seda azul formando las letras «AI» sobre negro absoluto; el software de moda queda relegado al segundo nivel (Studio V10.0 vive en studio.style3d.com con precio $40/mes). Sin español en ningún dominio.

### Cited Findings
- Título: «Reshaping Fashion with AI and 3D – Style3D». Barra superior: «Create AI fashion designs and e-commerce visuals with Style3D AI. [Try] ×». Nav: «Home · Products · Solutions · Customer Success · About», globo, «Try Now» y «Contact Us» (píldoras de contorno blanco). Submenú Products: Style3D Studio, Fabric, MixMatch, Cloud, GoShop, Atelier, Simulator, StyleWork, «Style3D AI - Try It Free» [captura] — [style3d.com](https://www.style3d.com/)
- Hero: fondo #000000; H1 «Powering Physical Intelligence for / the Next Digital Era» en Montserrat **34 px/41 px peso 400** (el titular más pequeño y ligero del grupo); párrafo «Style3D develops a world leading simulation engine for deformable materials, a foundational technology for Physical AI. Building on this core capability, we provide industrial software and a general purpose physical AI platform that power innovation across fashion and textiles, gaming and animation, and embodied intelligence.»; CTA «Book A Demo» (píldora blanca, texto negro). Derecha: render/vídeo de una cinta de seda iridiscente azul-violeta anudada formando «AI» [captura] — [style3d.com](https://www.style3d.com/)
- Secciones (H2 Montserrat 48 px peso 500 blanco): «Why Style3D? — Trusted by world's brands» (UR, ANTA, Löffler, OLYMP, BRAX, SCOTT, 波司登); «Empower End-to-End Fashion Workflows» (DESIGN / DEVELOPMENT / COLLABORATION / MANAGEMENT / MARKETING); «Leading Technology» con tres tarjetas negras «World-leading Deformable Body Simulation · GPU-Accelerated Modeling and Visualization · Generative and Agentic AI + 3D» y botón «Read More About Style3D AI»; «Hear From Our Customers» (cita de «Bodywear Lab»); «Trusted by Partners and Clients Worldwide»; banda topo «Start Transforming Your Fashion Workflow with AI + 3D Today — Book A Demo»; footer claro. Altura 5435 px; la captura de página completa muestra grandes vacíos negros (contenido disparado por scroll) [captura] — [style3d.com](https://www.style3d.com/)
- Tipografía cargada: Montserrat 300/400/500/700, «NeuePowerW05-Bold», «HarmonyOS Sans SC», «BoutiqueBitmap9x9» (fuente de píxeles) [captura] — [style3d.com](https://www.style3d.com/)
- Idiomas: sin `hreflang` ni selector; solo inglés [captura] — [style3d.com](https://www.style3d.com/)
- Producto y precio (subdominio): «Style3D Studio V10.0 — Professional AI+3D Fashion Design Software / Efficient, Precise, User-Friendly.», botones «Free Trial» y «Contact Sales»; hero negro con letras pintadas en cian y avatar 3D con gorro y bufanda. Planes: «30-day Free Trial»; plan «Free» («Non-commercial», «After trial/paid license expires, the account will auto-convert to this plan.»); **Individual $40/ month o $380/ year** («Best for freelancers, hobbyists and one-person companies.»); Enterprise y Academic; FAQ: «AI features are currently available only in the Enterprise plan.» [captura] — [studio.style3d.com](https://studio.style3d.com/en/home)
- Historial: 2025-03-16 → título «Revolutioner of Fashion & Sustainability – Style3D»; hero de vídeo a sangre con una mano y un stylus trazando una pieza de patrón sobre tableta; copy «Digital Garment Modeling Software / Studio V8.0 is Here! / From Vision to Decision / Grow Your Business with AI+3D Realism», «AI Elevates Efficiency to New Heights», «Cutting-edge Research in AI and 3D … ACM SIGGRAPH, NeurIPS and CVPR» — [Wayback 2025-03-16](https://web.archive.org/web/20250316023324/https://www.style3d.com/)
- Assyst: assyst.de redirige (301) a style3d-assyst.com; pie «Assyst is a Style3D company». Hero negro con vídeo, H1 «CREATE. MAKE. SELL.» en Poppins 90 px/94 px peso 800, mayúsculas, tracking 4 px; sub «The first seamless software fashion design end-to-end 3D / 2D software for brands, suppliers, retail and textile.» (sic); CTA único «Download Whitepaper» (púrpura #6f42c1, radio 25 px). Un modal «PRIVACY PREFERENCE» con cuatro botones púrpura tapa el hero al entrar. Productos: «STYLE 3D FABRIC · STUDIO · MixMatch · AI (autogenerate designs, try-ons, and photoshoots) · ASSYST CAD (2D pattern, grading and fitting) · AUTO.MARKER · AUTO.COST · Style3D Cloud · 3D/2D.Connect»; muro «TRUSTED BY GLOBAL BRANDS» (Adidas, Bogner, Benetton, s.Oliver, Vaude, Wolf Lingerie, BMW, bonprix, Brax, Akris…). Idiomas EN/DE/IT. WordPress 7.1.2 + Elementor, cuerpo Poppins 20 px [captura] — [style3d-assyst.com](https://style3d-assyst.com/)
- Precios Studio según blog del propio vendor (SEO, no verificado en la web de producto): «Studio Basic: $99/month · Pro: $299/month» — [style3d.ai blog](https://www.style3d.ai/blog/what-is-the-real-cost-of-style3d-pricing/)

### Inferences
- Style3D quiere ser leída como empresa de «Physical AI» (robótica, juegos), no como CAD de moda; el asiento del patrón lo ocupa una metáfora abstracta. Es la portada más «keynote de Nvidia» y la menos útil para una patronista.
- La incoherencia entre el blog ($99/$299) y la página de producto ($40/mes) sugiere SEO agresivo sobre precio; para Vina, cualquier claim de precio de Style3D debe citarse con la página de producto.
- Assyst, que era la casa del CAD 2D alemán, se ha subsumido en la retórica Style3D (whitepaper de IA como único CTA).

### Gaps
- El snapshot de sep-2024 de style3d.com no renderizó en Wayback (app JS); solo consta el título «Style3D».
- No verifiqué si el plan «Free» de Studio muestra «$30/Month» tachado (el texto aparece junto a «FREE»).

---

## 5. Marvelous Designer (marvelousdesigner.com)

### Takeaway
La portada de Marvelous Designer se dirige a artistas 3D de juegos y VFX, no a patronistas: negro #18181c, Poppins, píldoras amarillas (#ffb500/#fbc400), un **modal de lanzamiento («Pinch, Rip, Refine : MARVELOUS DESIGNER 2026.1») más un panel de cookies que tapan el hero** al entrar, y debajo —esto sí— una captura real de la interfaz. Precio público $39/mes con prueba de 14 días. Cambió de sistema tipográfico desde 2024 (Crimson Text + Avenir → Poppins).

### Cited Findings
- Título: «The Ultimate Digital Cloth Creation Tool - Marvelous Designer». Nav: logotipo (cubo naranja), «Product ▾ · Plan · Learn ▾ · Support ▾ · CONNECT 🛍 · News&Events», «Try Now» (píldora #ffb500, radio 19,5 px, Poppins 14 px peso 500), «Sign In», globo [captura] — [marvelousdesigner.com](https://www.marvelousdesigner.com/)
- Primer viewport tal como llega la usuaria: modal centrado de 2 slides sobre render rojo/negro de una figura con vaqueros y manos estilizadas: «Pinch, Rip, Refine : / MARVELOUS DESIGNER 2026.1 / KEY FEATURES / [Beta] Seamline Ripping Tool | Brush Pinching / Pinching Simulation Override | Blend Shape Animation / What's New?» (crédito «© UV-朱 All Rights Reserved.»); slide 2 «New Flexible Student Plan + 3 Months Free … Offer valid until October 31st 2026» (© Gergő Pfeiffer). Simultáneamente, panel de cookies con cuatro categorías y botones «CONFIRM MY CHOICES / ACCEPT ALL». Enlace «Don't show again» [captura] — [marvelousdesigner.com](https://www.marvelousdesigner.com/)
- Hero real (tras cerrar el modal): fondo negro; eyebrow «FROM DESIGN TO MOTION» en versalitas espaciadas; titular «MAKE YOUR IMAGINATION REAL» (Poppins negrita, mayúsculas, tracking amplio, blanco); sub «Design, simulate, and animate your garments all in one place»; CTA «Start For Free!» (píldora amarilla). Debajo asoma una **captura real de la aplicación** (menú «File Edit 3D Garment 2D Pattern Sewing Materials Avatar Retopology Animation Render CONNECT…», vista 3D con avatares en traje de pirata y ventana de patrón 2D). `scrollHeight` 900 px: la home es un carrusel a pantalla completa [captura] — [marvelousdesigner.com](https://www.marvelousdesigner.com/)
- Paleta medida: tinta #18181c, amarillos #ffb500 («Try Now») y #fbc400 («What's New?», «Start Now»), naranja #ff8a00 («Subscribe», H2 del modal 28 px peso 600) [captura] — [marvelousdesigner.com](https://www.marvelousdesigner.com/)
- Precios: «PLAN — PERSONAL | ENTERPRISE | ACADEMICS»; Personal «Single User For Personal» **$39/month** (toggle Monthly/Annual), etiqueta «Two Week Trial Available», «Windows and macOS · Single-user license · In-app assets access (Connect & CLO-SET) · Automatic updates · Technical support via Contact Us», botón «Start Now»; FAQ «we provide a 14-days free trial»; reembolso solo dentro de 24 h si la prueba convirtió a mensual. Fondo con resplandor violeta [captura] — [marvelousdesigner.com/pricing](https://www.marvelousdesigner.com/pricing)
- Precios según prensa especializada: Personal «$39/month or $280/year»; Enterprise «$199/month or $2,000/year» ($2,300/año con edición Linux); plan Indie para estudios con ingresos < $500 000/año «hasn't publicly disclosed their cost» — [CG Channel, abr-2026](https://www.cgchannel.com/2026/04/clo-virtual-fashion-releases-marvelous-designer-2026-0/); [Digital Production, 12-ene-2026](https://digitalproduction.com/2026/01/12/marvelous-designer-adds-indie-pricing-quietly/); [80.lv](https://80.lv/articles/marvelous-designer-launches-new-pricing-plan-for-indie-studios)
- Contenido editorial de la página de planes: «Bringing Ancient History to Life with Marvelous Designer: An Interview with Pablo Aparicio Resco», «RAID: Shadow Legends Alice Fan Art … Marvelous Designer and ZBrush», «Fabric as Storytelling in The Abandoned Orphanage» (3D Environment Artist) [captura] — [marvelousdesigner.com/pricing](https://www.marvelousdesigner.com/pricing)
- Idiomas: `hreflang` en, ko, ja, zh. Sin español [captura] — [marvelousdesigner.com](https://www.marvelousdesigner.com/)
- IA: ninguna mención en la home ni en planes [captura] — [marvelousdesigner.com](https://www.marvelousdesigner.com/)
- Historial: el snapshot 2024-09-12 se titulaba «Marvelous Designer | Official Site» y cargaba «Crimson Text» (serif) y «Avenir Next LT Pro»; la página no renderizó visualmente en Wayback. Hoy todo es Poppins — [Wayback 2024-09-12 (id_)](https://web.archive.org/web/20240912211049id_/https://marvelousdesigner.com/)

### Inferences
- MD es el pariente «entretenimiento» de CLO: mismo dueño (CLO Virtual Fashion), misma Poppins, pero amarillo en vez de azul y público de artistas 3D (ZBrush, RAID). No compite por la patronista, pero fija la expectativa de «Start For Free!» + precio visible en la portada.
- Es el peor caso de fold secuestrado: modal + cookies + widget de accesibilidad antes de leer una sola frase de producto.

### Gaps
- No pude describir visualmente la home de 2024 (Wayback sirvió solo tipografías y título).
- Los precios Enterprise/Indie son de prensa, no de la web.

---

## 6. Lectra — Modaris, Gerber AccuMark y Apogy (lectra.com)

### Takeaway
Lectra rediseñó todo el sitio entre sep-2024 y jul-2025 (de Open Sans + granate #bd1a41 a **Plus Jakarta Sans variable, papel #f8f5f2, rojo #eb0a32 y esquinas rectas**) y en sep-2026 sustituyó el hero corporativo («We pioneer. You lead.» sobre vídeo de interior de coche) por la campaña **Apogy, «the AI-native apparel product development solution»**, anunciada el 15/16-sep-2026. Modaris y AccuMark se presentan con ilustraciones vectoriales de personas junto a un maniquí, nunca con la interfaz real. Sin español (`/es` redirige a `/en`).

### Cited Findings
- Título home: «Spark your transformation with Lectra | Lectra». Barra utilitaria negra: «Accessibility · About us ▾ · Content Hub · Events · Innovation · Sustainability | Investors ↗ · My Solutions ↗ · Languages ▾»; nav principal por industria: «Fashion ▾ · Automotive ▾ · Furniture ▾ · More industries ▾», «Contact us», «Search» [captura] — [lectra.com/en](https://www.lectra.com/en)
- Hero (27-sep-2026): vídeo a sangre de textura pixelada/«glitch» rosa-violeta-azul; a la derecha «Reinventing product development» (Plus Jakarta Sans negrita, blanco, ~3 líneas de ~72 px), sub «Apogy is the AI-native apparel product development solution that connects creative design to production reality.», CTAs «Register for the reveal event →» (rojo #eb0a32, esquinas rectas) y «Discover Apogy →» (papel #f8f5f2). Indicador de 2 slides, icono «Scroll Down» y tarjeta de chat «How can we help? / Find the sharpest solution for your business!». El segundo fotograma muestra una pila de láminas de acrílico iluminadas en rosa [captura] — [lectra.com/en](https://www.lectra.com/en)
- Sistema tipográfico: una sola fuente variable, `PlusJakartaSans_wght.woff2` autoalojada; cuerpo 16 px; H1 de producto 64 px/70,4 px peso 700 tinta #0d0c0c; H2 56 px peso 700; fondo de cuerpo #f8f5f2 [captura] — [lectra.com/en](https://www.lectra.com/en); [Modaris](https://www.lectra.com/en/fashion/products/modaris)
- Secciones de la home: párrafo largo «Today's industries are evolving fast. Disconnected systems, fragmented data and rising complexity make it harder to stay ahead. Lectra unites human expertise with cutting-edge industrial intelligence…»; tarjeta «We deliver success beyond expectation — Get to know Lectra»; tres tarjetas «Spark your innovation» («…particularly agentic AI…»), «Spark your sustainability», «Spark your experience»; banda negra «Relationships built on trust» con filtro All/Fashion/Automotive/Furniture (logos: Jacquemus, Etam, IKKS, Farm Rio, Gérard Darel, Promod, Vilebrequin, Piquadro, Schott NYC, Armedangels, La Redoute, Pimkie, Aubade, Kokatat…); banda con degradado teal→magenta→azul «Spark your transformation»; «Blending deep industry expertise with industrial intelligence — The clothes in your wardrobe. The interior of your car. The sofa in your living room. We help bring them to life.» con acordeón por industria y foto de bailarina bajo neón; «What our customers say»; «Join the Apogy reveal digital event». Altura 8646 px [captura] — [lectra.com/en](https://www.lectra.com/en)
- Apogy: «Reinventing product development»; «Generative Designer … enables teams to create and explore new visual concepts from prompt, sketch, or image, quickly transforming inspirations into photo-realistic design proposals.»; clientes tempranos Intimissimi, Oniverse, O'Neills, JFV, Siena; sin precio ni prueba; CTA «Register for the reveal event» — [lectra.com Apogy](https://www.lectra.com/en/fashion/products/apogy)
- Lanzamiento: anunciado en París el 15/16-sep-2026 como «cloud-based solution dedicated to product development», SaaS, con «agentic artificial intelligence»; Modaris, ModarisPGS y Gerber AccuMark citados como generación anterior; cita de Maximilien Abadie (Deputy CEO): «With Apogy, we are launching the first and only solution designed to bring together all involved parties, data and processes that shape a product.» — [The Interline, 16-sep-2026](https://www.theinterline.com/2026/09/16/lectra-unveils-apogy-the-first-solution-embedding-agentic-artificial-intelligence-to-reinvent-fashion-product-development/); [GlobeNewswire, 15-sep-2026](https://www.globenewswire.com/news-release/2026/09/15/3362519/0/en/lectra-unveils-apogy-the-first-solution-embedding-agentic-artificial-intelligence-to-reinvent-fashion-product-development.html)
- Modaris: H1 «Modaris / Create superior patterns to deliver products of the perfect fit and quality»; «Modaris capitalizes on best product development practices, allowing patternmakers to turn design visions into viable products. It ensures a consistent level of pattern quality throughout, from the creation of base patterns to the approval of final patterns and 3D prototypes.» Imagen: **ilustración vectorial plana** de dos personas ante un maniquí con un mono violeta y una tarjeta «PATTERNMAKING» con curvas esquemáticas; secciones «The Modaris subscription at a glance», «Get more with Modaris», «The Modaris range» (Expert / Classic and Essential / 3D), «Modaris add-ons», testimonios (GGZ, Shoulder), logos Falconieri, Kurabo Fashion, Wacoal, Shoulder; CTAs «Contact us» / «Register»; sin precio. Altura 11 244 px [captura] — [Modaris](https://www.lectra.com/en/fashion/products/modaris)
- Gerber AccuMark: H1 «Gerber AccuMark / Simplify design processes with 2D/3D patternmaking»; «…a fully integrated suite of CAD software applications, from concept to completion.»; misma familia de ilustración (persona arrodillada ante un maniquí, tarjeta de tallas «1,1 / 1,0», tarjeta «PATTERNMAKING»). Altura 10 106 px [captura] — [AccuMark](https://www.lectra.com/en/fashion/products/gerber-accumark-fashion)
- Idiomas: «English · Français · Italian · Chinese»; `hreflang` en, fr, it; `lectra.com/es` sirve la versión inglesa [captura] — [lectra.com/es → /en](https://www.lectra.com/es)
- Historial: 2024-09-14 → sitio anterior: banner oscuro con red de nodos, «We pioneer. You lead.» a 20 px, Open Sans/Montserrat, botones granate #bd1a41 rectos («Contact», «Fashion and Lectra»), nav «CUTTING ROOM · PRODUCT DEVELOPMENT · FASHION DIGITAL MANAGEMENT · ABOUT US · RESOURCES · EVENTS», bloques «Succeed with style», «You'll be in good company» (F&D, Calzedonia, Falconieri, TEXDATA, Tartine et Chocolat, Marck & Balsan), «Latest news». 2025-07-15 → sistema actual ya desplegado (Plus Jakarta Sans, #f8f5f2, «We pioneer. You lead.» enorme sobre vídeo de interior de coche, ticker «Join our LinkedIn community…»). 2026-03-15 → idéntico (ticker «Lectra ranks 28th among the Top 250 French software publishers») — [Wayback 2024-09-14](https://web.archive.org/web/20240914181632/https://www.lectra.com/en); [Wayback 2025-07-15](https://web.archive.org/web/20250715031612/https://www.lectra.com/en); [Wayback 2026-03-15](https://web.archive.org/web/20260315013140/https://www.lectra.com/en)
- Reseñas: Modaris 3D «currently has no reviews on Capterra» (resumen de búsqueda) — [Capterra Modaris 3D](https://www.capterra.com/p/2910/Modaris-3D/alternatives/)

### Inferences
- Lectra es la única con disciplina de sistema (una fuente variable, un acento, esquinas rectas, papel cálido), pero lo gasta en un hero corporativo multi-industria; la moda comparte portada con asientos de coche y sofás.
- Las ilustraciones de personajes en Modaris/AccuMark esconden un software de 1990s-2000s: es la señal más clara de que el incumbente no quiere que se vea la interfaz.
- Apogy confirma la tendencia: la IA se vende como «reinvención» y se visualiza con texturas abstractas (glitch), no con la herramienta.

### Gaps
- No encontré fecha exacta del rediseño (acotado 2024-09-14 → 2025-07-15).
- No revisé la versión francesa/italiana ni si Lectra tiene sitios locales en español fuera de lectra.com.

---

## 7. Tukatech (tukatech.com)

### Takeaway
Tukatech es el único incumbente que habla en registro de **ingeniería de fábrica**: eyebrow en IBM Plex Mono, titular Archivo 900 a 74 px con tracking negativo («Engineer it right. / Make it better.»), esquinas rectas, teal #00a0b2, cifras duras y **precio en la primera frase de la página de producto («starting at $19/mo»)**, con «TALK TO AN ENGINEER» en lugar de «Book a Demo». Solo inglés, sin IA nombrada.

### Cited Findings
- Título: «Fashion CAD Software & Apparel Design Solutions | Tukatech». Barra de anuncio teal: «NEW  Thousands of dollars of pattern & 3D assets — now FREE for every TUKAcad 2026 subscriber. [See what's included →]» (botón amarillo #ffe94a). Nav: «TUKATECH» en caja negra, «Solutions · Products · Industries · Results · Resources · News · Company», lupa, «Sign in», «TALK TO AN ENGINEER» (teal #00a0b2, texto #062e33, radio 0, 13 px mayúsculas espaciadas) [captura] — [tukatech.com](https://www.tukatech.com/)
- Hero: fondo #1c1e20; eyebrow monoespaciado teal «DIGITAL ENGINEERING · MEASURABLE MANUFACTURING»; H1 «Engineer it right. / Make it better.» en Archivo **74 px/71 px peso 900, letter-spacing −2,59 px**, segunda línea en teal; sub «One connected platform for product development, fit validation, fabric optimization, cutting, sewing-room productivity, and real-time manufacturing visibility. No handoffs. No lock-in.»; CTAs «FIND YOUR SOLUTION» (teal, recto) y «SEE ALL PRODUCTS» (contorno gris); cifras «31+ YEARS OF INNOVATION · 20,000+ SYSTEMS REPLACED · 66+ COUNTRIES SERVED · UP TO 12% POTENTIAL FABRIC SAVINGS ACROSS THE COMPLETE MATERIAL WORKFLOW.» con etiquetas en mono. Derecha: fotografía de una mujer con conjunto gris deportivo apoyada en un escritorio con un monitor que muestra una prenda 3D (aspecto de stock/IA) [captura] — [tukatech.com](https://www.tukatech.com/)
- Secciones: «THE BIGGEST GAINS BEGIN BEFORE PRODUCTION — Stop treating design, fabric, cutting, and sewing as separate problems.» (Reduce material cost → SMARTmark; Validate before making → TUKA3D; Increase output → TUKAmover; See the factory → TUKAStyleHub); «ONE PLATFORM · FROM IDEA TO PRODUCTION — Technology that works together.» con pestañas Develop / Validate / Optimize / Manufacture / Manage («TUKACAD · TUKA APM — Engineer accurate patterns, automatically.»); «BUILT FOR ANYTHING MADE FROM FLEXIBLE MATERIALS» (Fashion & Apparel, Defense & Uniforms, Education & Startups); «MEASURE WHAT CHANGES» con contadores que en captura estática leen «0%» (animación por scroll); «Customer voices» (Matrix Sourcing, Creative Group, Arvind, Hirdaramani); «Solution finder»; «Innovation Center by Tukatech»; «Knowledge that moves the industry». Altura 9349 px; la captura completa muestra enormes zonas vacías (revelado por scroll) [captura] — [tukatech.com](https://www.tukatech.com/)
- Página TUKAcad: «TUKAcad — Your complete solution for fashion CAD software.» / «Digital pattern making, grading, and marker making starting at $19/mo.» / botones «PRICING OPTIONS» y «WATCH THE OVERVIEW»; banda teal «In fashion, if it doesn't fit, it doesn't sell!». Planes: **TUKAcad CLE «LEARNING EDITION» $19/mo** («14 pattern pieces per file · 4 graded sizes per file · Markers up to 59×120 inches»), **TUKAdesign CPE «PROFESSIONAL EDITION» $99/mo**, **TUKAcad CPE «PROFESSIONAL EDITION» $199/mo**; «Software subscriptions and free trials are handled by TUKAweb» [captura] — [tukatech.com/products/tukacad](https://tukatech.com/products/tukacad)
- Tipografía declarada: Archivo variable y IBM Plex Mono autoalojadas (`/assets/fonts/archivo-var-latin.woff2`, `ibm-plex-mono-400-latin.woff2`); en la ejecución headless los woff2 devolvieron estado `error`, así que el render pudo usar la fuente de respaldo (los tamaños medidos son CSS computado, válidos igual) [captura] — [tukatech.com](https://www.tukatech.com/)
- Idiomas: ninguno (sin `hreflang`). IA: ninguna palabra «AI» en la home [captura] — [tukatech.com](https://www.tukatech.com/)

### Inferences
- Es el único que se acerca a hablarle al oficio («Engineer accurate patterns», «if it doesn't fit, it doesn't sell», precio sin rodeos), pero lo hace con estética de contratista industrial y foto de stock; el resultado es creíble, no elegante.
- «No handoffs. No lock-in.» y «Talk to an engineer» son las dos frases más honestas del corpus y merecen estudiarse como tono.

### Gaps
- No comparé con Wayback (no sé cuándo se rediseñó).
- No confirmé si las fuentes fallan también en navegadores reales.

---

## 8. Audaces (audaces.com)

### Takeaway
Audaces es el único incumbente con **español nativo de verdad** (WPML: en, pt-br, es, it; «Tecnología para confección que garantiza el máximo de eficiencia.»), con una portada de fotografía editorial (modelo con vestido de terciopelo negro sobre fondo azul grisáceo), Sora 72 px + Poppins, azul #0066ff en píldoras y **sin ningún CTA en el hero** ni precio en la home. La IA aparece como productos (LooksMaker, Clickfy.ai), no como titular.

### Cited Findings
- Títulos: «Home | Audaces – Technology for fashion manufacturing» / «Inicio | Audaces – Tecnología para la confección de moda». WordPress + WPML 4.7.4; `hreflang` en, pt-br, es, it. Barra utilitaria negra «Audaces around the world · Audaces Academy · Segments» (ES añade «Sé un partner»), redes, «Language: English» / «Idioma: Español». Nav: logotipo, «Audaces360 · Solutions ▾ · Plans ▾ · Services ▾ | Content ▾ · Success stories · Help ▾ · [Client Area]» (píldora #0066ff radio 40 px) [captura] — [audaces.com/en](https://audaces.com/en); [audaces.com/es](https://audaces.com/es)
- Hero: fotografía a sangre —modelo con melena negra al viento y vestido negro de terciopelo con mangas abullonadas sobre fondo azul grisáceo (#3f5a6c a #aec1cf)—; H1 «Audaces» en Sora 72 px/72 px peso 700 blanco, subtítulo H2 Sora 30 px peso 300 «Fashion technology that delivers maximum efficiency.» / «Tecnología para confección que garantiza el máximo de eficiencia.» junto a un filete vertical fino. **Sin botón en el hero.** Burbuja de chat con retrato de mujer abajo a la derecha y widget de accesibilidad a la izquierda [captura] — [audaces.com/en](https://audaces.com/en)
- Secciones: «Who we are — From design to cutting, we empower people to revolutionize the fashion world. Innovation is our legacy.» (con «DNA» gigante en marca de agua); «Our ecosystem — Audaces360 has evolved!» («More than a software suite, Audaces360 is now a complete ecosystem connecting every stage of your fashion business…»); «Our solutions» en carrusel de tarjetas: «LooksMaker — Create fashion faster with AI built for your design process», «Audaces Isa — Plan and manage your collection in real time with Fashion PLM», «Audaces Digiflash Device — Store all your patterns digitally with just one photo» (las imágenes de tarjeta se renderizan como degradados grises vacíos en la captura); «Segments» (Fashion and apparel, Furniture, Automotive… en tarjetas con degradado azul); «Success stories» (LIVE!, Zerbinato, Amibo); «Plans»; «Sustainability»; «Blog». Altura 9994 px (ES 10 849 px) [captura] — [audaces.com/en](https://audaces.com/en)
- Cifras de la home (EN): «100+ countries», «100,000 professionals», «3 million annual» accesos, «+20k brands» — [audaces.com/en](https://audaces.com/en)
- IA: «LooksMaker: Create fashion faster with AI built for your design process», «Clickfy.ai: Create realistic e-commerce images with artificial intelligence» — [audaces.com/en](https://audaces.com/en)
- Español: copy nativo («Del diseño al corte, empoderamos personas para revolucionar el mundo de la moda», «Historias de éxito», «Área del Cliente», «Descubre Audaces360», «Conoce nuestras soluciones»); única fuga detectada: el enlace de salto «Saltar para o conteúdo» en portugués (también en la versión inglesa) [captura] — [audaces.com/es](https://audaces.com/es)
- Precios: menú «Plans/Planes» y páginas «/planes», «/contactenos»; sin cifras en la home [captura] — [audaces.com/es](https://audaces.com/es)
- Reseñas Capterra (13, 4,8/5): pros «Ease of Use», «Intuitive Interface»; con «long learning curve» (resumen de búsqueda) — [Capterra Audaces 360](https://www.capterra.com/p/207192/Audaces-360/reviews/)

### Inferences
- Para el mercado hispanohablante Audaces es el rival directo en idioma y en tono («confección», no «fashion tech»), pero su portada vende un ecosistema empresarial (PLM, corte, e-commerce), no una herramienta que la patronista pueda abrir hoy.
- Una H1 que es solo el nombre de la empresa y un hero sin CTA indican portada de marca corporativa, no de producto.

### Gaps
- Sin comparación Wayback.
- No verifiqué la página «Planes» (si muestra precios en LatAm/España).

---

## 9. Seamly2D (seamly.io)

### Takeaway
Seamly es la única portada que dice **«Free and Open Source» en el hero** y enseña la interfaz real (un portátil con Seamly2D dibujando un corpiño), pero con estética de plantilla Elementor: degradados púrpura (#523683 → #c2bdd1), Comfortaa redondeada, siete familias tipográficas cargadas, tres H1 en la misma página y un modal de cookies que tapa el tercio inferior. Sin español pese a tener un testimonio en español.

### Cited Findings
- Título: «Seamly – Fashion Design Software». WordPress 7.1.2 + Elementor. Nav: logotipo, «Home · Pattern Shop · About Us · Software · Investors · Forum» sobre cabecera lavanda [captura] — [seamly.io](https://seamly.io/)
- Hero: banda púrpura (#523683 arriba, #c2bdd1 abajo) con foto inclinada de un portátil corriendo Seamly2D (menús «File Edit View Tools Measurements», «New Draft Block», «Draft Block: Front», caja de herramientas y trazado de corpiño con etiquetas de puntos «NeckCF», «C43»…); encima, etiqueta blanca redondeada «Apparel CAD Software» (Comfortaa ~46 px púrpura), botón «⤓ DOWNLOAD NOW» (#866ab7, radio 10 px, Work Sans 19 px peso 600) y la línea «Seamly is Free and Open Source». Debajo, panel lavanda con iconos circulares: «Less Time — Automatic. Accurate. Seams always match.», «Better Fit — Use size charts, made-to-measure data, and convert body scans.», «Adapt previous designs to meet your current needs.», «Apparel, costumes, athletic wear, pet gear, outdoor products, upholstery, and more.» [captura] — [seamly.io](https://seamly.io/)
- Un modal de cookies («This website uses cookies … Customize / Deny / Accept All», «Cookie Consent by [Elementor]») cubre desde y≈645 px en la primera visita [captura] — [seamly.io](https://seamly.io/)
- Secciones: «About SEAMLY» (H1 Comfortaa 46 px), mapa mundial de usuarios en púrpura, «User Feedback» (H1) con testimonios: José R. («Great piece of software for developing, from basic slopers to any pattern made to specific measurements…»), Andi B., y Kelemochi Colour World Patchwork **en español**: «Es un sistema de patronaje completo y fácil de utilizar que te permite hacer trabajos muy profesionales y con un montón de funcionalidades.»; bloque de vídeo negro (no cargó); «Try Seamly Today» (H1) → «Download Seamly Now for Windows, Linux, and MacOS»; «Seamly is used in Research and Industry» (The University of Manchester, INPEACES, KITAC); «The Future of Fashion» (cuatro columnas: «over $700 billion in losses», «sizing systems dating back to 1868», «save up to $5,000 per design», sostenibilidad); banner «Seamly2D — DIGITAL APPAREL DESIGN.»; noticias; logo GPLv3. Altura 6630 px [captura] — [seamly.io](https://seamly.io/)
- Tipografía: Comfortaa (títulos), Work Sans (botón), Inter, Roboto, Outfit, Aboreto, Alexandria cargadas; el cuerpo cae en `-apple-system` 16 px (sin familia propia) [captura] — [seamly.io](https://seamly.io/)
- IA: «Unlock Seamless Tailoring: Convert Your 3DLook.ai Body Scan to Precise Seamly Measurements» (Beta) [captura] — [seamly.io](https://seamly.io/)
- Idiomas: ninguno. Precio: gratuito, GPLv3; nav «Investors» y «Pattern Shop» [captura] — [seamly.io](https://seamly.io/)
- Historial: 2024-09-13 → titular «DIGITAL DESIGN. / VIRTUALLY SEAMLESS.», sub «Easily create better fit for higher profits and reduced returns.», descarga **gateada por formulario** («Operating System», «I Plan to Use Seamly for: Business / Hobby/Fun / School», opt-in de email); nav «Shop» (hoy «Pattern Shop»). Hoy el titular es «Apparel CAD Software» y la descarga es directa — [Wayback 2024-09-13](https://web.archive.org/web/20240913122123/https://seamly.io/)

### Inferences
- Seamly demuestra que «gratis + open source + enseña el software» no basta si el envoltorio parece un tema de WordPress: la promesa de Vina («gratis, en el navegador») debe venir con una factura visual que Seamly no tiene.
- El testimonio en español sin versión en español es un indicio de demanda hispanohablante desatendida en el segmento libre.

### Gaps
- No revisé la página «Software» ni la tienda de patrones (precios).

---

## 10. Valentina (smart-pattern.com.ua)

### Takeaway
La web oficial de Valentina es hoy una tienda ucraniana (Smart Pattern) con plantilla Colorlib y Bootstrap: «Free, open-source software for parametric clothing patterns», GPLv3+, pero **los binarios actuales exigen registro y suscripción («Basic»/«Premium»)**; solo las versiones anteriores son gratuitas. Sin español (inglés y ucraniano), sin captura de interfaz en el primer viewport.

### Cited Findings
- valentinaproject.bitbucket.io redirige a `smart-pattern.com.ua/en/valentina/download/`; título «Download Valentina pattern design software | Smart pattern». Cabecera negra con selects «English / Українська», «Select currency (USD/EUR/UAH)», «Login or register»; nav «SMART PATTERN 🇺🇦 · HOME · SHOP ▾ · ABOUT · BLOG · VALENTINA ▾ · CONTACT · 🛒 [€0.00]» [captura] — [smart-pattern.com.ua](https://smart-pattern.com.ua/en/valentina/download/)
- Hero: foto desenfocada de una mesa de madera; H1 «DOWNLOAD VALENTINA PROGRAM» (Open Sans 800, 30 px/45 px, mayúsculas, tracking 3 px); icono «V» de la app; «Free, open-source software for parametric clothing patterns.»; «Learn more about the project · GPLv3+ licensed» [captura] — [smart-pattern.com.ua](https://smart-pattern.com.ua/en/valentina/download/)
- Caja «What a subscription gives you»: Basic «Download Current Versions (Binary) · Support from Developers · User Manual Access»; Premium «All Basic Plan Features · Download Current Versions (Binary) for legacy platform versions · Multi-size Tables Files Access»; botón «See subscription plans» (naranja #ffa45c). «Stable version (included with a subscription) … You must be logged in to download a package.» Valentina v1.0.5 (AppImage, Windows 7+ 32-bit, Windows 10+ 64-bit, macOS 10.15+ Intel, macOS 11+ Apple Silicon, macOS 12+ Universal). «Just want a free version? Previous releases are free — get a free download.» [captura] — [smart-pattern.com.ua](https://smart-pattern.com.ua/en/valentina/download/)
- Pie: «©2026 Smart pattern. All rights reserved | This template is made with ♥ by Colorlib»; contactos Discord, Viber, WhatsApp; widget «Found a spelling error in the English version of the site? Select it with your mouse and press Ctrl + Enter» [captura] — [smart-pattern.com.ua](https://smart-pattern.com.ua/en/valentina/download/)
- Tipografía y color: Open Sans 300–800, cuerpo 18 px gris #808080; botones Bootstrap (#0dcaf0 cian «Go», #ffa45c) [captura] — [smart-pattern.com.ua](https://smart-pattern.com.ua/en/valentina/download/)

### Inferences
- Valentina ya no compite en «gratis sin fricción»: exige cuenta para el binario actual. Vina puede reclamar «gratis, sin cuenta, en el navegador» como diferencia literal frente a los dos proyectos libres.
- Ninguno de los dos proyectos libres (Seamly, Valentina) tiene ambición estética; el hueco «open source que parece caro» está vacío.

### Gaps
- La URL `smart-pattern.com.ua/en/valentina/` devuelve 404; solo la página de descarga es alcanzable desde la redirección. No revisé la comunidad ni el fork.

---

## 11. Tailornova (tailornova.com)

### Takeaway
Tailornova es una app web para pública amateur/indie («DIY Sewing Community», «$49/mo Subscription price») cuya portada **no ha cambiado ni un píxel desde sep-2024**: Open Sans 300 rosa #e0557e a 48 px, «THE WORLD'S SMARTEST 3D FASHION DESIGN SOFTWARE», y —a su favor— una captura real de la interfaz con boceto plano, prenda 3D y piezas de patrón lado a lado en el hero.

### Cited Findings
- Título: «Tailornova | Online clothing design software». Nav: logotipo caligráfico rosa, «3D CONFIGURATORS · EDUCATION · EXPLORE · PRICE · ABOUT · CONTEST · TECHNOLOGY · FAQ», «SIGN IN | SIGN UP» [captura] — [tailornova.com](https://tailornova.com/)
- Hero: fondo blanco; H1 «THE WORLD'S SMARTEST 3D FASHION DESIGN SOFTWARE» en Open Sans 300, 48 px/60 px, rosa #e0557e; sub «Tailornova is a patent-pending online fashion design software that helps you create unlimited designs easier and faster than ever. Visualize your creations in 3D and get custom-fitted patterns in seconds.»; botón «DESIGN NOW» (#e0557e, radio 5 px, etiqueta de **10 px** peso 700 dentro de un botón de 200×46 px). Derecha: captura de la app con tres paneles «FRONT BACK BOTH» (boceto plano de vestido palabra de honor), «3D VIEW» (vestido magenta sobre maniquí) y «SEWING PATTERN» (piezas) [captura] — [tailornova.com](https://tailornova.com/)
- Secciones: banda magenta «Who needs it» sobre foto duotono de una mujer junto a un maniquí, lista numerada «DIY Sewing Community · Fashion Students · Fashion Merchandisers · Clothing Boutiques · Tailors & Dressmakers · Indie Designers · Apparel Brands · Pattern Retailers · Specialty Apparel Manufacturers»; «Design a complete fashion collection in minutes.»; «Customize Your 3D FitModel™»; «SEAMLESS AUTOMATION OF ON-DEMAND MANUFACTURING» (Your Own StyleCustomizer™ App · Sell Bespoke Fashion · Automated MTM Patterns · Print/Plot, Cut and Sew On Demand); cifras «210K Pattern users · 40+B Design possibilities · 3 SEC Generate MTM patterns · $49/mo Subscription price»; «What Our Customers Say...»; «See Tailornova in Action»; newsletter. Altura 4871 px [captura] — [tailornova.com](https://tailornova.com/)
- Tipografía: Open Sans 300/400/500/700 + Noto Sans + Material Icons (Google Fonts); cuerpo 14 px #4b5b5e [captura] — [tailornova.com](https://tailornova.com/)
- Idiomas: ninguno. IA: ninguna («smartest», «patent-pending») [captura] — [tailornova.com](https://tailornova.com/)
- Historial: snapshot 2024-09-16 con hero, secciones y cifras idénticos — [Wayback 2024-09-16](https://web.archive.org/web/20240916131218/https://tailornova.com/)

### Inferences
- Es el único que enseña 2D + 3D + patrón en una sola imagen de hero: el formato correcto para Vina, ejecutado con estética de 2017 y para un público que no es la patronista profesional.
- «Design now» es un «sign up» encubierto; nadie del grupo permite usar la herramienta desde la portada.

### Gaps
- No revisé la página «Price» ni si existe plan gratuito.

---

## 12. Corte transversal: el «mar de lo mismo»

### Takeaway
Doce portadas, cuatro plantillas: (a) **foto de moda a sangre + titular grande** (CLO, Audaces, Browzwear 2025, Tukatech), (b) **negro con render abstracto o de producto y píldoras de color** (Optitex, Style3D, Marvelous Designer, Assyst), (c) **papel cálido de plataforma enterprise** (Browzwear 2026 #f9f5f3, Lectra #f8f5f2), (d) **plantilla WordPress/Bootstrap de proyecto libre** (Seamly, Valentina, Tailornova). Todas usan una sans de Google o similar, ninguna enseña un lienzo vivo, casi ninguna habla español y ninguna le habla a la patronista.

### Cited Findings
- Tipografías por vendor (computadas): Poppins (CLO, Marvelous Designer, Assyst, cuerpo de Audaces), Montserrat (Optitex, Style3D), Open Sans (Tailornova, Valentina), Gilroy + Inter (Browzwear), Plus Jakarta Sans (Lectra), Sora + Poppins (Audaces), Archivo + IBM Plex Mono (Tukatech), Comfortaa + Work Sans + otras cinco (Seamly). Ni una serif, ni una tipografía propia [capturas] — [clo3d.com](https://www.clo3d.com/en/); [optitex.com](https://optitex.com/); [style3d.com](https://www.style3d.com/); [browzwear.com](https://browzwear.com/); [lectra.com](https://www.lectra.com/en); [audaces.com](https://audaces.com/en); [tukatech.com](https://www.tukatech.com/); [seamly.io](https://seamly.io/); [tailornova.com](https://tailornova.com/)
- Fondos y acentos medidos: CLO blanco + azul #40a9ff; Browzwear #f9f5f3 + #ff5724 + tinta #0a1120; Optitex negro + amarillo #ffc000 + degradado magenta-violeta; Style3D #000 + píldoras blancas (+ cian en Studio); MD #18181c + amarillo #ffb500/#fbc400 + naranja #ff8a00; Lectra #f8f5f2 + rojo #eb0a32; Tukatech #1c1e20 + teal #00a0b2 + amarillo #ffe94a; Assyst #171716 + púrpura #6f42c1; Audaces #f2f2f2 + azul #0066ff; Seamly púrpuras #523683/#866ab7/#c2bdd1; Valentina Bootstrap #0dcaf0/#ffa45c; Tailornova blanco + rosa #e0557e [capturas] — mismas URLs
- Radios de botón: píldora completa (Browzwear 100 px, Style3D 90–100 px, MD 19,5 px/9999 px, Audaces 40 px, Assyst 25 px) o recto (Lectra 0, Tukatech 0, Optitex 0); CLO 4 px, Seamly 10 px, Tailornova 5 px [capturas] — mismas URLs
- CTA primario: «Request/Book a Demo» (Browzwear, Optitex, Style3D, Assyst «Download Whitepaper», Lectra «Register for the reveal event», Tukatech «TALK TO AN ENGINEER», Audaces «Client Area»); prueba gratuita (CLO 14 días, MD 14 días, Style3D Studio 30 días); descarga (Seamly, Valentina); «Design now» → registro (Tailornova). **Ninguna portada abre la herramienta en el navegador** [capturas] — mismas URLs
- Precios visibles en portada o a un clic: CLO $25/$50 mes; MD $39 mes; Browzwear $750/$1500/$3950 año; Style3D Studio $40 mes (subdominio); TUKAcad $19/$99/$199 mes; Tailornova $49 mes; Optitex, Lectra, Assyst, Audaces: ninguno — [clo3d.com/en/plans](https://www.clo3d.com/en/plans); [marvelousdesigner.com/pricing](https://www.marvelousdesigner.com/pricing); [browzwear.com/pricing-plans](https://browzwear.com/pricing-plans); [studio.style3d.com](https://studio.style3d.com/en/home); [tukatech.com/products/tukacad](https://tukatech.com/products/tukacad); [tailornova.com](https://tailornova.com/)
- Muros de logos y contadores: Browzwear («1000+ · 10M+ · 30+ · 50%-80%»), Tukatech («31+ · 20,000+ · 66+ · UP TO 12%»), Tailornova («210K · 40+B · 3 SEC · $49/mo»), Audaces («100+ countries · 100,000 professionals · 3 million · +20k brands»); logos en Browzwear (9), Optitex (20), Style3D (7+), Lectra (~20), Assyst (~70), Seamly (3) [capturas] — mismas URLs
- Retórica del titular: «CHANGING THE WORLD WITH VIRTUAL GARMENTS» (CLO), «From vision to reality, driven by AI & 3D» (Browzwear), «from GREAT ART to PERFECT FIT» (Optitex), «Powering Physical Intelligence for the Next Digital Era» (Style3D), «MAKE YOUR IMAGINATION REAL» (MD), «Reinventing product development» / «Spark your transformation» (Lectra), «Engineer it right. Make it better.» (Tukatech), «CREATE. MAKE. SELL.» (Assyst), «…we empower people to revolutionize the fashion world» (Audaces), «THE WORLD'S SMARTEST 3D FASHION DESIGN SOFTWARE» (Tailornova) [capturas] — mismas URLs
- IA en portada y cómo se dibuja: Browzwear → palabra «AI» en naranja en el H1 + chip «✨ AI Generated Model»; Style3D → lazo de seda formando «AI» + «Generative and Agentic AI + 3D»; Lectra → «AI-native», «agentic AI», textura glitch; Assyst → «AI inspirations & AI photoshoots», whitepaper; Audaces → productos LooksMaker/Clickfy.ai; CLO → solo el botón «Open AI Chatbot»; Optitex, MD, Tukatech, Seamly (salvo 3DLook.ai), Valentina, Tailornova → nada [capturas] — mismas URLs
- Interfaz real above the fold: sí en Tailornova y Seamly (captura estática), parcial en Marvelous Designer (bajo el modal); no en CLO, Browzwear (tarjetas simuladas), Optitex, Style3D, Lectra (ilustraciones vectoriales), Tukatech (monitor en foto), Assyst, Audaces, Valentina [capturas] — mismas URLs
- Elementos que secuestran el primer viewport a 1440×900: MD (modal + cookies), Style3D (cookies 500×195 px sobre el CTA), Seamly (cookies desde y≈645), Assyst (modal GDPR completo), Lectra y Browzwear (tarjetas de chat «How can we help?» / «Stitch»), CLO y Audaces (widgets flotantes). Con 768 px de alto, en Audaces el subtítulo del hero (y 700–780 px) queda al borde y en Browzwear los logos (y≈705) desaparecen [capturas] — mismas URLs
- Español: CLO (sí, con fugas), Optitex (sí, con fugas y H1 más pequeña), Audaces (sí, nativo); no en Browzwear (en/zh-cn), Style3D, MD (en/ko/ja/zh), Lectra (en/fr/it/zh; `/es`→`/en`), Tukatech, Assyst (en/de/it), Seamly, Valentina (en/uk), Tailornova [capturas] — mismas URLs
- Rediseños 2024→2026: Browzwear (después de 2026-01-06), Lectra (entre 2024-09-14 y 2025-07-15, más hero Apogy sep-2026), Style3D (reposicionamiento entre 2025-03-16 y sep-2026), MD (tipografía cambiada desde 2024-09-12), Seamly (titular y gate de descarga cambiados desde 2024-09-13); sin cambios: CLO (solo nav y campaña), Optitex, Tailornova [Wayback citados arriba]
- Alturas de página: MD 900 px (carrusel), Optitex 3967, CLO 4327, Tailornova 4871, Browzwear 4896, Assyst 5203, Style3D 5435, Seamly 6630, Lectra home 8646, Tukatech 9349, Audaces 9994, AccuMark 10 106, Modaris 11 244 [capturas] — mismas URLs
- Contexto de prensa: The Interline describe la Digital Product Creation como «the fashion industry's most widely-publicised and most mis-characterised technology segment» y habla de un paso de «blind adoption» a «strategic calibration» (resumen de búsqueda) — [The Interline: Separating DPC Skepticism From DPC Success](https://www.theinterline.com/2025/03/19/separating-dpc-skepticism-from-dpc-success/); [The Interline: Spotlight On 3D/DPC/CG](https://www.theinterline.com/2026/08/25/spotlight-on-3d-dpc-cg/)

### Inferences
- **Clichés compartidos** (≥ 6 de 12): sans geométrica de Google; una palabra del titular en color de acento; foto/render a sangre sin interfaz; eyebrow en versalitas + H2 de 44–56 px; muro de logos + cuatro contadores; «Book a Demo» como acción principal; chat/cookies/accesibilidad flotando sobre el hero; verbo grandilocuente (revolutionize/reinvent/transform/changing the world); IA como sustantivo del titular ilustrada con abstracción (seda, glitch, sparkle).
- **La patronista no existe** en ninguna portada: los sujetos son «fashion brands», «designers», «companies», «3D artists», «manufacturers». La palabra «pattern» solo aparece en primer plano en Tukatech («Engineer accurate patterns»), Tailornova («custom-fitted patterns») y la página interior de Modaris («allowing patternmakers…»).
- **El patrón 2D es invisible**: salvo Tailornova y Seamly, nadie muestra una pieza de patrón en el primer viewport; el 3D (avatar, tela) ha borrado al 2D del imaginario de portada, aunque todos venden CAD 2D.
- **Lo que sí hacen bien y merece copiarse**: (1) Browzwear 2026: precio para freelance a un clic desde el hero, papel cálido + un acento + dos fuentes, tarjetas de cifras y eyebrows como sistema; (2) Lectra 2025: una sola fuente variable autoalojada, esquinas rectas, jerarquía hero derecha con dos CTAs de peso distinto, declaración de accesibilidad; (3) Tukatech: tono de oficio («No handoffs. No lock-in.», «Talk to an engineer», «$19/mo» en la primera frase) y eyebrow monoespaciado; (4) Tailornova/Seamly: enseñar la herramienta y el patrón; (5) CLO: precio y prueba sin cuenta comercial, fotografía de autor acreditada en el hero, siete idiomas.

### Gaps
- No encontré ningún teardown de prensa de diseño sobre estas homepages en concreto; The Interline critica el hype de la DPC, no su diseño web.
- Las reseñas G2/Capterra hablan de curva de aprendizaje y soporte, no de la web ni del onboarding desde la portada.
- No medí rendimiento (LCP, peso) ni comportamiento real a 1366×768; las inferencias de fold provienen de las coordenadas a 1440×900.

---

## 13. Lo que ninguno hace: espacio visual y verbal para Vina

### Takeaway
Hay siete posiciones vacías y verificables: nadie abre el CAD en el navegador desde la portada; nadie enseña un lienzo vivo 2D+3D; nadie habla español primero ni nombra a la patronista; nadie usa tipografía como identidad (todo es Google sans); nadie diseña el primer viewport para 1366×768 sin modales; nadie es «gratis sin cuenta»; y nadie combina «gratis/abierto» con una factura visual cara (los dos proyectos libres parecen plantillas).

### Cited Findings
- Todos los CTAs primarios del corpus son demo, prueba, descarga o registro; ninguno ejecuta la aplicación en la propia página (Tailornova «DESIGN NOW» lleva a sign-up; Style3D Studio, pese al dominio, ofrece «Free Trial» de descarga) [capturas] — [tailornova.com](https://tailornova.com/); [studio.style3d.com](https://studio.style3d.com/en/home); [clo3d.com](https://www.clo3d.com/en/); [browzwear.com](https://browzwear.com/)
- Ninguna portada incluye un `<canvas>` interactivo en el primer viewport (conteo de `canvas` visible = 0 en las doce capturas); los vídeos autoplay son la única «vida»: CLO 4, Assyst 3, Lectra 3, Style3D 1, MD 1, Seamly 1 [capturas] — mismas URLs
- Solo tres vendors tienen español y dos de ellos con fugas de inglés; el testimonio en español de Seamly convive con una web solo en inglés [capturas] — [clo3d.com/es/](https://www.clo3d.com/es/); [optitex.com/es/](https://optitex.com/es/); [audaces.com/es](https://audaces.com/es); [seamly.io](https://seamly.io/)
- Los dos proyectos libres usan plantillas genéricas (Elementor; Colorlib «made with ♥») y Valentina condiciona el binario actual a suscripción [capturas] — [seamly.io](https://seamly.io/); [smart-pattern.com.ua](https://smart-pattern.com.ua/en/valentina/download/)
- Cuatro portadas tapan el hero con modales o paneles al entrar (MD, Assyst, Style3D, Seamly) y otras cuatro superponen chat/widgets (Lectra, Browzwear, CLO, Audaces) [capturas] — mismas URLs
- Solo Tukatech y Tailornova ponen un precio en la primera pantalla de una página («starting at $19/mo», «$49/mo Subscription price») [capturas] — [tukatech.com/products/tukacad](https://tukatech.com/products/tukacad); [tailornova.com](https://tailornova.com/)

### Inferences
- **Verbal**: la frase que ninguno puede decir es «Ábrelo ahora. Gratis. En español. Sin cuenta.» acompañada del verbo del oficio (trazar, probar, ajustar, escalar) en vez de «revolucionar». El sujeto disponible es «la patronista» / «quien traza el patrón», nunca usado.
- **Visual**: el hueco es una portada que **sea** el producto —lienzo 2D con el patrón y el drapeado 3D lado a lado, vivo, en el primer viewport a 1366×768—, con una tipografía que no sea Poppins/Montserrat/Inter (una serif o una grotesca con carácter, o una sola variable propia como Lectra pero con intención), paleta de tinta y papel sin acento neón, esquinas rectas, sin modales ni chat, y con el precio (cero) dicho en la primera línea. Nada de esto lo ocupa nadie.
- **Riesgo**: los incumbentes que se acercan al «papel cálido + un acento» (Browzwear, Lectra) lo han adoptado en 2025-2026; Vina no puede diferenciarse solo por paleta cálida. La diferencia defendible es *mostrar el CAD funcionando* y *hablar del patrón*, que ninguno hace.

### Gaps
- No verifiqué competidores web-native menores fuera del encargo (p. ej. herramientas de patronaje online en español) que pudieran ocupar parte de este hueco.
- La calidad real del español de CLO/Optitex en páginas interiores y soporte queda sin evaluar.
