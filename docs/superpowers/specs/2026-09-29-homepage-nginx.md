# Homepage de Vina — lo que falta para publicar

> **Estado:** pendiente. La home está implementada (spec `2026-09-28-homepage-design.md`), pero no
> se publica hasta que Samuel aplique estos tres pasos, en este orden.

## 1. El repo tiene que ser público

`sssamuelll/vina` está en PRIVATE. La home enlaza al repo («Ver el código») y dice «código
abierto»: con el repo privado, el enlace da 404 y la frase es falsa. Hacerlo público **antes** de
desplegar. Sin eso, la home no sale.

## 2. El bloque nginx (spec § 6.3)

En el servidor, fuera del repo:

```nginx
location = /          { try_files /index.html =404; }
location ^~ /app/     { try_files $uri /app/index.html; }
location ^~ /assets/  { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri =404; }
location /            { try_files $uri $uri/ =404; }
```

`/app` sin barra → 301 a `/app/`. Sin el cambio, `/app/` sigue sirviéndose porque el fichero
existe.

Tras publicar, comprobar a mano:

```bash
curl -sI https://vina.sdar.dev/app    # → 301 a /app/
curl -sI https://vina.sdar.dev/app/   # → 200, el taller
curl -sI https://vina.sdar.dev/       # → 200, la home
curl -sI https://vina.sdar.dev/algo   # → 404
```

## 3. Avisar a María antes

María entra hoy por `vina.sdar.dev/`. Desde el deploy verá la home y necesitará un clic en
«Abrir Vina» para llegar al taller. Sus proyectos siguen ahí (mismo origen, misma IndexedDB).
Avisarle antes del deploy, con la ruta nueva `vina.sdar.dev/app/` para su marcador.
