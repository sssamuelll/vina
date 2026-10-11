#!/usr/bin/env bash
# deploy-prod.sh — deploy manual de Vina a vina.sdar.dev (atrium-aws).
#
# CI apagado a propósito desde 2026-08-01 (repo privado, no pagamos Actions):
# el deploy es SIEMPRE local, igual que en Atrium. Build local porque la caja
# tiene 1.9 GB de RAM y un npm ci + vite build allá termina en OOM.
#
# Uso:
#   bash scripts/deploy-prod.sh            # gates → build → e2e del build → enviar → verificar
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

# LA MÁQUINA ES UNA SOLA (2026-10-10). El ensayo y el deploy son lo más pesado que
# corre aquí, una hora de e2e con dos navegadores, y se lanzan de nuevo dentro
# del candado de `scripts/pesado.mjs`: si otra sesión tiene la máquina, hacen cola
# hasta dos horas en vez de aplastar su trabajo, y no arrancan con la memoria o la
# CPU ya ocupadas por otras aplicaciones. Dentro del candado, `VINA_PESADO` está
# puesta y el script sigue de largo.
if [ -z "${VINA_PESADO:-}" ]; then
  exec node scripts/pesado.mjs "--nombre=deploy-prod ${1:-}" --espera=120 --ram=6 --cpu=60 -- bash scripts/deploy-prod.sh "$@"
fi

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

# LA MEMORIA DEL GATE (2026-10-10): lo que ya pasó sobre un árbol no se vuelve
# a correr sobre ese árbol.
#
# El árbol es el contenido commiteado (`HEAD^{tree}`), y el bloque de arriba
# acaba de exigir que no haya nada tracked sin commitear: mismo árbol es mismo
# código, mismos tests, mismas líneas base y mismo lockfile. Cada etapa que
# pasa deja una marca en `<git-common-dir>/vina-gate/<árbol>/`, que comparten
# todos los worktrees; el e2e la deja spec a spec, en cuanto cada uno pasa
# entero (`scripts/memoria-del-gate.mjs`). El merge de una rama sobre una main
# que no se movió tiene el mismo árbol que la rama, así que el ensayo de la
# rama vale para el deploy de main.
#
# Lo que costaba no tenerla, medido. El 06-10, el deploy de la copa repitió
# entero el e2e que el ensayo ya había pasado sobre el mismo árbol (`4fed9ef1`)
# y murió a mitad, por memoria. El 10-10, un test de contraste se pasó de
# tiempo con la máquina cargada, y el segundo intento volvió a correr los 40
# specs, 1,2 h, para repetir uno. Ahora el ensayo deja el deploy en build y
# envío, y un rojo se reintenta corriendo solo lo que faltó.
#
# El verde exige lo mismo que antes: todos los specs de la lista en verde
# sobre ESTE árbol, en una corrida o en varias. Para correrlo todo otra vez:
#   rm -rf "$(git rev-parse --git-common-dir)/vina-gate"
#
# La clave lleva también lo instalado. El lockfile está en el árbol, pero
# node_modules puede no corresponderle: los worktrees comparten el del checkout
# principal, y un `npm ci` después del ensayo cambiaría lo que se compila sin
# cambiar el árbol. npm deja lo que instaló de verdad en
# node_modules/.package-lock.json, y con él viaja la versión de Playwright y,
# por tanto, la de su Chromium.
ARBOL=$(git rev-parse 'HEAD^{tree}')
INSTALADO=$(git hash-object node_modules/.package-lock.json) \
  || { echo "✗ no hay node_modules/.package-lock.json: instala las dependencias (npm ci)" >&2; exit 1; }
MARCAS="$(git rev-parse --git-common-dir)/vina-gate/$ARBOL-${INSTALADO:0:12}"
mkdir -p "$MARCAS"

echo "── Gates ──────────────────────────────────────────────"
if [ -f "$MARCAS/rapidos.ok" ]; then
  echo "✓ typecheck, lint, trinquete, unitarios y WASM: ya pasaron sobre este árbol"
else
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
  touch "$MARCAS/rapidos.ok"
fi

echo "── Build ──────────────────────────────────────────────"
npm run build > /tmp/vina-deploy-build.log 2>&1 || { tail -20 /tmp/vina-deploy-build.log >&2; exit 1; }
# Del index.html del taller, no por glob: assets/ puede tener más de un *.js
# (chunks) y el que importa es el que el index referencia de verdad. La
# entrada se llama como su clave en rollupOptions.input: `app` → app-*.js.
BUNDLE=$(grep -oE 'assets/app-[^"]+\.js' dist/app/index.html | head -1)
[ -n "$BUNDLE" ] || { echo "✗ dist/app/index.html no referencia ningún assets/app-*.js" >&2; exit 1; }
echo "✓ dist listo ($(du -sh dist | cut -f1), bundle ${BUNDLE})"

# LOS E2E MIDEN EL BUILD, NO EL SERVIDOR DE DESARROLLO (2026-10-10).
#
# Hasta ese día corrían contra Vite en modo desarrollo, que no es lo que se
# publica: pinta en la barra superior un indicador técnico (`top-bar__status`,
# solo con `import.meta.env.DEV`) que producción no tiene, y lleva el React de
# desarrollo. Ahora se compila una vez, arriba, y los dos Playwright sirven ese
# `dist` con `vite preview` (VINA_E2E_BUILD=1 en sus configs), en un puerto que
# no reutilizan: si ya hay algo escuchando, paran y lo dicen. De paso el deploy
# deja de compilar dos veces (la home compilaba la suya).
#
# Medido el mismo día, una pestaña con SwiftShader: arrancar /app/ cuesta 2,5 s
# con el servidor de desarrollo caliente (733 peticiones), 83 s en frío, y
# 0,7 s con el build (8 peticiones). El arranque NO era el grueso del gate,
# contra lo que se escribió aquí el 09-18: son 2,5 s de unos 32 por caso. El
# tiempo está en lo que hace cada spec: superficies-por-accion,
# contraste-del-cromo y las-siete-puertas son el 29 % del reloj-test.
#
# CI=1, también desde el 10-10: los topes de tiempo de CI (120 s por test,
# 240 s por grupo serial, 15 s por expect) y las mismas aserciones. Con los
# topes locales, un test del grupo serial de contraste pasó de 90 s con la
# máquina cargada y tumbó el deploy entero; solo y con la máquina libre pasaba
# en 30 s. Un gate que da falsos rojos se acaba desactivando.
#
# Y no, subir workers no es la salida: se midió el 2026-09-18. A 6 workers el
# reloj-test se duplica (33,8 → 70,2 min sumando casos), porque los Chromium
# con SwiftShader se comen la máquina entre ellos, y el neto son 3 minutos con
# 2 caídos duros. Con GPU real (sin los args de SwiftShader) es peor todavía:
# 78,3 min de reloj y 10 caídos. Esta caja se satura entre 2 y 3 workers, dé
# igual el backend de GL, así que `--workers=2` se queda.
#
# El puerto se escoge con VINA_E2E_PORT (5174 por defecto) y viaja a Playwright
# por el entorno (playwright.config.ts): un worktree sirve y mide su propio
# build, y no el del checkout de al lado.
export VINA_E2E_BUILD=1 CI=1
export VINA_E2E_PORT="${VINA_E2E_PORT:-5174}"

# Un puerto ocupado para antes de lanzar Playwright, y dice por quién. Lo más
# probable es un `vite preview` que sobrevivió a un ensayo cortado: en Windows,
# matar el envoltorio de npx no mata a node (medido el 2026-09-18 y otra vez el
# 10-10, cuando parar el ensayo dejó vivo el Playwright entero con su
# servidor). Playwright tampoco mide lo que ya escucha (reuseExistingServer:
# false), pero su aviso se queda dentro del log, y el gate diría «faltan N
# specs» como si el intento siguiente fuera a salir distinto.
puerto_libre() {
  local pid
  pid=$(netstat -ano | grep -E "[:.]$1 +[^ ]+ +LISTENING" | awk '{print $NF}' | head -1 || true)
  [ -z "$pid" ] && return 0
  echo "✗ el puerto $1 lo tiene el proceso $pid, quizá un ensayo cortado. Ciérralo con: taskkill //F //T //PID $pid" >&2
  exit 1
}

echo "── Home ───────────────────────────────────────────────"
if [ -f "$MARCAS/home.ok" ]; then
  echo "✓ home: ya pasó sobre este árbol"
else
  puerto_libre 4179
  npx playwright test --config playwright.home.config.ts > /tmp/vina-deploy-home.log 2>&1 \
    || { tail -30 /tmp/vina-deploy-home.log >&2; echo "✗ e2e de la home en rojo" >&2; exit 1; }
  grep -E "passed|failed|flaky" /tmp/vina-deploy-home.log | sed 's/^ */✓ home: /'
  touch "$MARCAS/home.ok"
fi

echo "── Emplazamiento y contratos ──────────────────────────"

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
#
# La lista es un array y no un comando partido con barras: un CR colado al
# final de un renglón ya no corta el comando en silencio
# (tests/repo/los-scripts-de-shell-no-llevan-cr.test.ts). Ese spec se queda sin
# marca, y el gate lo nombra al fallar.
SPECS_DEL_GATE=(
  tests/e2e/emplazamiento-lienzo-2d.spec.ts
  tests/e2e/emplazamiento-modales.spec.ts
  tests/e2e/emplazamiento-paneles.spec.ts
  tests/e2e/linea-al-pie.spec.ts
  tests/e2e/ia-convocada.spec.ts
  tests/e2e/puente-mcp.spec.ts
  tests/e2e/ia-ciclo-del-ajuste.spec.ts
  tests/e2e/simular-pausar-reanudar.spec.ts
  tests/e2e/la-cabina-de-la-pieza.spec.ts
  tests/e2e/la-cota-de-lo-que-se-pone.spec.ts
  tests/e2e/la-puerta-de-vuelta.spec.ts
  tests/e2e/los-paneles-a-peticion.spec.ts
  tests/e2e/emplazamiento-imagenes-de-referencia.spec.ts
  tests/e2e/las-siete-puertas.spec.ts
  tests/e2e/1102-la-pluma-engancha.spec.ts
  tests/e2e/1112-mover-el-punto-con-numero.spec.ts
  tests/e2e/maria-195-siguiente-punto.spec.ts
  tests/e2e/medidas-escritas-gramatica.spec.ts
  tests/e2e/cotas-no-tapan-el-transform-box.spec.ts
  tests/e2e/trazos.spec.ts
  tests/e2e/linea-interna-gramatica.spec.ts
  tests/e2e/seis-firmas-maria.spec.ts
  tests/e2e/shift-endereza-a-la-hoja.spec.ts
  tests/e2e/q-edita-internas.spec.ts
  tests/e2e/lo-que-se-ve-y-cuando.spec.ts
  tests/e2e/tanda4-puertas-y-defaults.spec.ts
  tests/e2e/tanda5-un-cuadro-y-un-aviso.spec.ts
  tests/e2e/tanda6-el-tramo-es-el-sujeto.spec.ts
  tests/e2e/1161-reproduccion-tab.spec.ts
  tests/e2e/226-cotas-linea-interna.spec.ts
  tests/e2e/1152-los-largos-no-se-quedan-clavados.spec.ts
  tests/e2e/replay-maria-07-09.spec.ts
  tests/e2e/cotas-de-pieza.spec.ts
  tests/e2e/supr-borra-lo-que-se-ve.spec.ts
  tests/e2e/supr-con-algo-delante.spec.ts
  tests/e2e/avatar-por-defecto.spec.ts
  tests/e2e/reposo-solo-lo-que-perdura.spec.ts
  tests/e2e/superficies-por-accion.spec.ts
  tests/e2e/contraste-del-cromo.spec.ts
  tests/e2e/marca-de-escala.spec.ts
  tests/e2e/margen-de-herramientas.spec.ts
  tests/e2e/barra-superior.spec.ts
  tests/e2e/el-3d-en-papel.spec.ts
)
# Los specs de la lista que todavía no pasaron sobre este árbol.
sin_marca() { for s in "${SPECS_DEL_GATE[@]}"; do [ -f "$MARCAS/$(basename "$s").ok" ] || echo "$s"; done; }
mapfile -t PENDIENTES < <(sin_marca)
if [ ${#PENDIENTES[@]} -eq 0 ]; then
  echo "✓ emplazamiento y contratos: los ${#SPECS_DEL_GATE[@]} specs ya pasaron sobre este árbol"
else
  if [ ${#PENDIENTES[@]} -lt ${#SPECS_DEL_GATE[@]} ]; then
    echo "  corren ${#PENDIENTES[@]} de ${#SPECS_DEL_GATE[@]} specs: los demás ya pasaron sobre este árbol"
  fi
  puerto_libre "$VINA_E2E_PORT"
  E2E=0
  VINA_GATE_MARCAS="$MARCAS" npx playwright test --workers=2 \
    --reporter=list,./scripts/memoria-del-gate.mjs "${PENDIENTES[@]}" \
    > /tmp/vina-deploy-e2e.log 2>&1 || E2E=$?
  mapfile -t FALTAN < <(sin_marca)
  if [ "$E2E" -ne 0 ] || [ ${#FALTAN[@]} -gt 0 ]; then
    echo "  log completo: /tmp/vina-deploy-e2e.log" >&2
    tail -60 /tmp/vina-deploy-e2e.log >&2
    if [ ${#FALTAN[@]} -gt 0 ]; then
      echo "✗ faltan ${#FALTAN[@]} specs por pasar sobre este árbol. El intento siguiente corre solo estos:" >&2
      printf '    %s\n' "${FALTAN[@]}" >&2
    else
      echo "✗ Playwright salió con $E2E aunque cada spec pasó entero: mira el log" >&2
    fi
    exit 1
  fi
  # Sin `tail -1`: Playwright imprime «X flaky» en su PROPIA linea, ANTES de
  # «N passed», asi que quedarse con la ultima se los tragaba en silencio. Un
  # flaky en el gate no lo tumba (paso al reintento) pero es justo lo que hay
  # que ver antes de desplegar: con 114 casos en vez de 69 salen mas a menudo,
  # y uno que nadie mira es un rojo esperando su turno.
  grep -E "passed|failed|flaky" /tmp/vina-deploy-e2e.log | sed 's/^ */✓ emplazamiento y contratos: /'
fi

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
