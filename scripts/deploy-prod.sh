#!/usr/bin/env bash
# deploy-prod.sh — deploy manual de Vina a vina.sdar.dev (atrium-aws).
#
# CI apagado a propósito desde 2026-08-01 (repo privado, no pagamos Actions):
# el deploy es SIEMPRE local, igual que en Atrium. Build local porque la caja
# tiene 1.9 GB de RAM y un npm ci + vite build allá termina en OOM.
#
# Uso:
#   bash scripts/deploy-prod.sh            # gates → build → enviar → verificar
#   bash scripts/deploy-prod.sh --ensayo   # todo menos enviar (valida sin tocar prod)
#
# Los gates de acá son el subconjunto rápido (typecheck + lint + unit + smoke
# del WASM commiteado). El veredicto completo lo deriva la skill gates-locales
# desde .github/workflows/ci.yml — para un deploy de release, correrla antes.
#
# La carpeta destino sigue siendo /var/www/openclo a propósito (renombre
# OpenClo→Vina 2026-08-01; el vhost nginx `vina` apunta ahí). Git Bash local
# no tiene rsync → tar sobre ssh; el server sí tiene rsync para el swap final.
set -euo pipefail

HOST=atrium-aws
STAGING=/tmp/openclo-deploy
DOCROOT=/var/www/openclo
URL=https://vina.sdar.dev/

ENSAYO=0
[ "${1:-}" = "--ensayo" ] && ENSAYO=1

cd "$(dirname "$0")/.."

echo "── Árbol ──────────────────────────────────────────────"
# Cambios tracked sin commitear = desplegarías algo que el repo no registra.
# Untracked se tolera (docs/research vive así).
#
# El estado de SALIDA se mira aparte, y no es paranoia — medido el 2026-09-18.
# Escrito como `[ -n "$(git status ...)" ]`, este gate daba VERDE con git roto:
# el `$(...)` se come el error, devuelve vacío, y vacío se lee «limpio». Ese día
# otra sesión dejó el repo con `core.bare = true` y toda operación de árbol
# moría con `fatal: this operation must be run in a work tree` — pero
# `git rev-parse` sigue funcionando en un repo bare, así que la línea de abajo
# habría impreso «✓ limpio (fe66add8 en main)» y el deploy habría seguido sin
# saber qué estaba publicando. Un gate que no puede medir tiene que PARAR, no
# asumir lo mejor.
if ! ESTADO=$(git status --porcelain --untracked-files=no); then
  echo "✗ git no pudo leer el árbol de trabajo. No se despliega a ciegas." >&2
  git status --porcelain --untracked-files=no >&2 || true
  exit 1
fi
if [ -n "$ESTADO" ]; then
  echo "✗ Hay cambios tracked sin commitear. Commitea o stashea antes de desplegar." >&2
  git status --short --untracked-files=no >&2
  exit 1
fi
echo "✓ limpio ($(git rev-parse --short HEAD) en $(git branch --show-current))"

echo "── Gates ──────────────────────────────────────────────"
npx tsc -b --noEmit
echo "✓ typecheck"
npm run lint > /dev/null
echo "✓ lint"
node scripts/ui-contract-lint.mjs > /tmp/vina-ui-contract.log 2>&1 \
  || { cat /tmp/vina-ui-contract.log >&2; exit 1; }
echo "✓ contrato de interfaz (trinquete)"
npx vitest run > /tmp/vina-deploy-vitest.log 2>&1 || { tail -20 /tmp/vina-deploy-vitest.log >&2; exit 1; }
grep -E "Test Files|Tests " /tmp/vina-deploy-vitest.log | sed 's/^ */✓ /'
node scripts/verify-wasm-smoke.mjs
echo "✓ smoke del WASM commiteado"

# EL SERVIDOR VA CALIENTE, Y NO ES COSMÉTICO — medido el 2026-09-18.
#
# Playwright monta Vite él solo (`webServer` del config, con
# `reuseExistingServer: true`), y arrancarlo EN FRÍO dentro del gate se paga por
# los dos lados. Mismos 25 specs, mismo commit, mismos 2 workers, misma máquina:
#
#   · en frío    24,3 min y 2 flaky  (`newPage` y `waitForSelector` agotados)
#   · caliente   19,2 min y 0 flaky
#
# Un 21% menos y los flaky desaparecen, porque el primer caso deja de esperar el
# arranque de Vite con su propio reloj corriendo.
#
# Y NO, subir workers no era la salida — se midió el mismo día. A 6 workers el
# RELOJ-TEST se duplica (33,8 → 70,2 min sumando casos): los Chromium con
# SwiftShader se comen la máquina entre ellos. El paralelismo sube a 4,36× y el
# neto son 3 minutos, con 2 caídos duros. Con GPU real (sin los args de
# SwiftShader) es peor todavía: 78,3 min de reloj y 10 caídos. Esta caja se
# satura entre 2 y 3 workers, dé igual el backend de GL, así que `--workers=2`
# se queda — ahora por una razón medida aquí y no heredada de los runners.
#
# Lo que queda por bajar es el reloj-test: 33,8 min en 150 casos son 13,5 s por
# caso, y casi todo es arrancar la app 150 veces contra el dev server. Eso se
# ataca sirviendo el `dist` en vez de Vite, y es otra conversación.
#
# El puerto se escoge con VINA_E2E_PORT (5174 por defecto) y viaja a Playwright
# por el entorno (playwright.config.ts): un worktree con su propio Vite mide su
# árbol, y no el del checkout de al lado que escucha en el 5174.
PUERTO="${VINA_E2E_PORT:-5174}"
export VINA_E2E_PORT="$PUERTO"
if curl -sf -o /tmp/vina-deploy-port.html "http://localhost:$PUERTO/" 2>/dev/null; then
  # Un servidor ajeno en el puerto lo reutilizaría Playwright EN SILENCIO y el
  # gate mediría otra app. Ya pasó en esta máquina con otro proyecto del portafolio.
  grep -q "Patronaje" /tmp/vina-deploy-port.html \
    || { echo "✗ el puerto $PUERTO lo tiene otra app — el gate mediría lo que no es" >&2; exit 1; }
  echo "✓ Vite ya estaba arriba en $PUERTO"
else
  # El servidor se queda vivo a propósito cuando el script termina. Aquí había
  # un `trap ... EXIT` con `kill` y NO funcionaba: en Git Bash el `kill` se lleva
  # el envoltorio de `npx` y el node de Vite sobrevive — medido, el puerto seguía
  # escuchando después de que el bloque saliera. Antes que un trap que miente,
  # la verdad escrita: queda UN Vite escuchando, y la rama de arriba hace que el
  # siguiente deploy lo reutilice en vez de levantar otro, así que la fuga está
  # acotada a uno y no a uno por deploy. De paso, el segundo deploy del día
  # arranca caliente gratis. Para matarlo a mano:
  #   taskkill //F //PID $(netstat -ano | grep ":$PUERTO" | grep LISTENING | head -1 | awk '{print $NF}')
  npx vite --port "$PUERTO" --strictPort > /tmp/vina-deploy-vite.log 2>&1 &
  for _ in $(seq 60); do
    if curl -sf -o /dev/null "http://localhost:$PUERTO/"; then break; fi
    sleep 1
  done
  curl -sf -o /dev/null "http://localhost:$PUERTO/" \
    || { echo "✗ Vite no respondió en 60 s — ver /tmp/vina-deploy-vite.log" >&2; exit 1; }
  echo "✓ Vite caliente en $PUERTO"
fi

# Emplazamiento: el trinquete estático cuenta literales, no ve QUIÉN TAPA A
# QUIÉN. La revisión adversarial del 2026-09-04 encontró tres colisiones vivas
# con los 7742 unitarios en verde (jsdom no calcula apilamiento) y una cuarta
# el 09-05: los chips de cota se comían dos mandos del transform box, y tirar
# del "asa este" le subía el ALTO a María en vez del ancho.
#
# Se corren estos y no `npm run audit:ui`, que era lo que pedía el informe
# (§ 7.1 punto 7): el censo tarda 13,6 min, tuvo 3 timeouts reales en su última
# corrida, y —lo que lo descalifica como gate— sus contadores BAJAN cuando un
# estado no carga (42/42 con 136 fallos de contraste el 14-08; 39/42 con 107 el
# 09-04). Un techo sobre esos números se gana dejando que algo se rompa. El
# censo sigue siendo la herramienta de diagnóstico manual que dice ser.
# --workers=2 NO es cosmético: sin él este gate falló en su primer uso real con
# seis timeouts de `waitForSelector` sobre la carga de la app y tres flaky, y
# los mismos cinco specs dan verde con 2. Es el patrón ya medido en este repo:
# Vite arrancando en frío con tantos workers como CPUs se queda sin aire y los
# tests se caen esperando a que monte, no por lo que miden. Un gate que da
# falsos rojos se acaba desactivando, que es peor que no tenerlo.
#
# LA SEGUNDA MITAD DE LA LISTA — los specs de CONTRATO (#1169, 2026-09-14).
#
# Los doce de arriba vigilan emplazamiento y gestos. Faltaba la otra clase: los
# que fijan una FIRMA de María o una decisión de producto escrita. Esos son los
# que se pudren, porque se pudren cuando la decisión cambia y alguien actualiza
# unos archivos y no sus hermanos. Medido dos veces seguidas, con el mismo
# cambio de fondo (la firma D6: el clic derecho abre la pareja Largo/Angulo):
#
#   · PR #1166 — `medidas-escritas-gramatica` se quedo afirmando el contrato
#     viejo. Se cazo, y solo porque ese archivo SI estaba en esta lista.
#   · PR #1168 — `linea-interna-gramatica`, su hermano de la Linea interna,
#     llevaba rojo desde ese mismo merge y nadie lo vio. No estaba en la lista.
#     Aparecio de casualidad, corriendo una barrida amplia por otra razon.
#
# El mecanismo que protegio en el primero es el que faltaba en el segundo. No
# fue mala suerte, fue cobertura. De paso salio un tercero: `bundle-split`
# esperaba el rotulo «IK Mode» que el repo ya habia traducido a «Modo IK».
#
# MEDIDO el 2026-09-14 con la maquina libre: los doce viejos son 69 casos en
# 8,6 min; los veintidos son 114 casos en 21,1 min. Doce minutos y medio mas.
# Se dice aqui, y no en el informe de la PR, porque el numero es lo que decide
# si alguien bypasea el gate un viernes: si duele, la conversacion es recortar
# esta lista a conciencia, no saltarsela.
#
# Los dos ultimos entraron tarde, por el mismo argumento con el que entraron los
# otros: `cotas-de-pieza` es el PR A de cotas vivas y su hermano el PR B
# (`226-cotas-linea-interna`) ya estaba — dejar uno y no el otro es exactamente
# la pareja que se pudre. Y `supr-borra-lo-que-se-ve` ejercita el menu Edicion
# del propio `LogoMenu`, que esta rama refactoriza entero.
#
# Y `supr-con-algo-delante` va pegado a el: misma familia (#1172/#1173), la
# misma `resolverBorrado` y el mismo item de menu. Separarlos es la pareja
# que se pudre otra vez.
#
# No entran los 97 specs enteros: esta lista es la CLASE que se pudre, no un
# intento de correrlo todo. El resto sigue sin gate y eso esta dicho en #1169.
# Y no entra `bundle-split`: tiene un rojo real del tier TSL (#1171), y meterlo
# bloquearia despliegues por un bug ajeno a lo que se este tocando.
#
# Y los tres trinquetes de la interfaz (spec 2026-10-02 «la interfaz en papel»
# § 9): reposo, superficies por accion y contraste. Corrian «antes de cada PR»,
# o sea cuando alguien se acordaba, y la ley «se mide» era prosa: nada impedia
# desplegar con un contador subido. MEDIDO el 2026-10-02 con la maquina libre:
# superficies y contraste son 27 casos en 14,3 min con dos workers; reposo es
# 1 caso en 30 s. El gate pasa de unos 21 a unos 36 min. Si duele, lo primero
# que sale es `superficies-por-accion` (18 casos): reposo y contraste cazan lo
# que rompe un cambio de piel.
npx playwright test --workers=2 \
  tests/e2e/emplazamiento-lienzo-2d.spec.ts \
  tests/e2e/emplazamiento-modales.spec.ts \
  tests/e2e/emplazamiento-paneles.spec.ts \
  tests/e2e/linea-al-pie.spec.ts \
  tests/e2e/ia-convocada.spec.ts \
  tests/e2e/la-cabina-de-la-pieza.spec.ts \
  tests/e2e/la-cota-de-lo-que-se-pone.spec.ts \
  tests/e2e/la-puerta-de-vuelta.spec.ts \
  tests/e2e/los-paneles-a-peticion.spec.ts \
  tests/e2e/emplazamiento-imagenes-de-referencia.spec.ts \
  tests/e2e/las-siete-puertas.spec.ts \
  tests/e2e/1102-la-pluma-engancha.spec.ts \
  tests/e2e/1112-mover-el-punto-con-numero.spec.ts \
  tests/e2e/maria-195-siguiente-punto.spec.ts \
  tests/e2e/medidas-escritas-gramatica.spec.ts \
  tests/e2e/cotas-no-tapan-el-transform-box.spec.ts \
  tests/e2e/trazos.spec.ts \
  tests/e2e/linea-interna-gramatica.spec.ts \
  tests/e2e/seis-firmas-maria.spec.ts \
  tests/e2e/shift-endereza-a-la-hoja.spec.ts \
  tests/e2e/q-edita-internas.spec.ts \
  tests/e2e/lo-que-se-ve-y-cuando.spec.ts \
  tests/e2e/tanda4-puertas-y-defaults.spec.ts \
  tests/e2e/tanda5-un-cuadro-y-un-aviso.spec.ts \
  tests/e2e/tanda6-el-tramo-es-el-sujeto.spec.ts \
  tests/e2e/1161-reproduccion-tab.spec.ts \
  tests/e2e/226-cotas-linea-interna.spec.ts \
  tests/e2e/1152-los-largos-no-se-quedan-clavados.spec.ts \
  tests/e2e/replay-maria-07-09.spec.ts \
  tests/e2e/cotas-de-pieza.spec.ts \
  tests/e2e/supr-borra-lo-que-se-ve.spec.ts \
  tests/e2e/supr-con-algo-delante.spec.ts \
  tests/e2e/avatar-por-defecto.spec.ts \
  tests/e2e/reposo-solo-lo-que-perdura.spec.ts \
  tests/e2e/superficies-por-accion.spec.ts \
  tests/e2e/contraste-del-cromo.spec.ts \
  tests/e2e/marca-de-escala.spec.ts \
  tests/e2e/margen-de-herramientas.spec.ts \
  tests/e2e/barra-superior.spec.ts \
  > /tmp/vina-deploy-e2e.log 2>&1 || {
    echo "  log completo: /tmp/vina-deploy-e2e.log" >&2
    tail -60 /tmp/vina-deploy-e2e.log >&2
    exit 1
  }
# Sin `tail -1`: Playwright imprime «X flaky» en su PROPIA linea, ANTES de
# «N passed», asi que quedarse con la ultima se los tragaba en silencio. Un
# flaky en el gate no lo tumba (paso al reintento) pero es justo lo que hay que
# ver antes de desplegar: con 114 casos en vez de 69 salen mas a menudo, y uno
# que nadie mira es un rojo esperando su turno.
grep -E "passed|failed|flaky" /tmp/vina-deploy-e2e.log | sed 's/^ */✓ emplazamiento y contratos: /'

echo "── Home ───────────────────────────────────────────────"
npx playwright test --config playwright.home.config.ts > /tmp/vina-deploy-home.log 2>&1 \
  || { tail -30 /tmp/vina-deploy-home.log >&2; echo "✗ e2e de la home en rojo" >&2; exit 1; }
grep -E "passed|failed|flaky" /tmp/vina-deploy-home.log | sed 's/^ */✓ home: /'

echo "── Build ──────────────────────────────────────────────"
npm run build > /tmp/vina-deploy-build.log 2>&1 || { tail -20 /tmp/vina-deploy-build.log >&2; exit 1; }
# Del index.html del taller, no por glob: assets/ puede tener más de un *.js
# (chunks) y el que importa es el que el index referencia de verdad. La
# entrada se llama como su clave en rollupOptions.input: `app` → app-*.js.
BUNDLE=$(grep -oE 'assets/app-[^"]+\.js' dist/app/index.html | head -1)
[ -n "$BUNDLE" ] || { echo "✗ dist/app/index.html no referencia ningún assets/app-*.js" >&2; exit 1; }
echo "✓ dist listo ($(du -sh dist | cut -f1), bundle ${BUNDLE})"

if [ "$ENSAYO" = "1" ]; then
  echo "── Ensayo: no se envía nada. ──────────────────────────"
  exit 0
fi

echo "── Enviar ─────────────────────────────────────────────"
tar -C dist -czf - . | ssh "$HOST" "rm -rf $STAGING && mkdir -p $STAGING && tar -C $STAGING -xzf -"
ssh "$HOST" "sudo rsync -a --delete $STAGING/ $DOCROOT/ && sudo chown -R www-data:www-data $DOCROOT/ && rm -rf $STAGING"
echo "✓ publicado en $DOCROOT"

echo "── Verificar ──────────────────────────────────────────"
# Desde local, no desde la caja: el hairpin contra la Elastic IP da 404 falso.
# $URL ya termina en barra: "${URL}app/", no "$URL/app/", que pediría //app/.
CODE=$(curl -s -o /tmp/vina-deploy-index.html -w "%{http_code}" "${URL}app/")
[ "$CODE" = "200" ] || { echo "✗ ${URL}app/ devolvió $CODE" >&2; exit 1; }
# El taller publicado tiene que referenciar EXACTAMENTE el bundle que compilamos.
grep -q "$BUNDLE" /tmp/vina-deploy-index.html \
  || { echo "✗ el taller servido no referencia $BUNDLE — se publicó otra cosa" >&2; exit 1; }
CODE=$(curl -s -o /tmp/vina-deploy-home.html -w "%{http_code}" "$URL")
[ "$CODE" = "200" ] && grep -q "Traza el patrón" /tmp/vina-deploy-home.html \
  || { echo "✗ $URL no sirve la home" >&2; exit 1; }
echo "✓ ${URL}app/ → 200 y sirve $BUNDLE; $URL sirve la home"
echo "Deploy completo: $(git rev-parse --short HEAD)"
