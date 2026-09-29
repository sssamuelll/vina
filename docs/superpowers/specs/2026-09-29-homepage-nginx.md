# Homepage de Vina — lo que falta para publicar

> **Estado:** pendiente. La home está implementada (spec `2026-09-28-homepage-design.md`), pero no
> se publica hasta que Samuel haga estos pasos. El orden es el real: el deploy solo ya convierte `/`
> en la home, así que todo lo que tiene que pasar antes de que María la vea va antes del deploy.

## 1. El repo tiene que ser público

`sssamuelll/vina` está en PRIVATE. La home enlaza al repo («Ver el código») y dice «código
abierto»: con el repo privado, el enlace da 404 y la frase es falsa. Hacerlo público **antes** de
desplegar. Sin eso, la home no sale.

## 2. Revisar el póster del hero

El póster del visor (`home/img/caida-poster.webp`, lo genera `scripts/home/activos.mjs`) salió del
tier WASM y trae una franja negra dentada en la costura lateral derecha de la camiseta (spec § 12,
«Al implementar»). Está arriba del pliegue a 1366: es lo primero que se ve del 3D. Mirarlo antes de
publicar y, si no se sostiene, regenerarlo o cambiarlo por otro fotograma. Es salida real del
solver: no se retoca a mano.

## 3. Lighthouse, a mano

El gate de Lighthouse de la spec § 8 es manual: `scripts/deploy-prod.sh` todavía no lo corre. Va en
la máquina de Samuel, sobre el build local (`npm run build && npx vite preview --port 4179
--strictPort`): `lhci autorun` con `preset: desktop`, `categories:performance ≥ 0.95`,
LCP ≤ 1.200 ms y CLS ≤ 0,01. Si no pasa, no se publica.

## 4. Avisar a María

María entra hoy por `vina.sdar.dev/`. En cuanto corra el deploy verá la home y necesitará un clic
en «Abrir Vina» para llegar al taller. Sus proyectos siguen ahí (mismo origen, misma IndexedDB).
Avisarle **antes** del paso 5, con la ruta nueva `vina.sdar.dev/app/` para su marcador.

## 5. Deploy

`scripts/deploy-prod.sh` desde la máquina de Samuel. Desde aquí `/` ya es la home.

## 6. El bloque nginx (spec § 6.3)

En el servidor, fuera del repo. Estos cuatro `location` van **junto a** los que ya existen para
`/api/` (el copiloto llama a `/api/anthropic` en producción): se añaden dentro del `server` actual,
no lo reemplazan.

```nginx
location = /          { try_files /index.html =404; }
location ^~ /app/     { try_files $uri /app/index.html; }
location ^~ /assets/  { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri =404; }
location /            { try_files $uri $uri/ =404; }
```

Ojo con `add_header` en `location ^~ /assets/`: en nginx, un `add_header` dentro de un `location`
anula **todos** los `add_header` heredados del `server`. Si el `server` pone cabeceras de seguridad
(`Strict-Transport-Security`, `X-Content-Type-Options`, `Content-Security-Policy`…), hay que
repetirlas dentro de ese `location` o `/assets/` sale sin ellas.

`/app` sin barra → 301 a `/app/`. Sin el cambio, `/app/` sigue sirviéndose porque el fichero
existe.

Tras publicar, comprobar a mano:

```bash
curl -sI https://vina.sdar.dev/app          # → 301 a /app/
curl -sI https://vina.sdar.dev/app/         # → 200, el taller
curl -sI https://vina.sdar.dev/             # → 200, la home
curl -sI https://vina.sdar.dev/algo         # → 404
curl -sI https://vina.sdar.dev/assets/…     # → las cabeceras de seguridad siguen ahí
```

Y abrir el copiloto en `/app/` una vez: si `/api/anthropic` responde, los `location` de `/api/`
siguen en su sitio.
