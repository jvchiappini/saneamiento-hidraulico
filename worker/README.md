# Proxy de OpenCode Go (Cloudflare Worker)

El endpoint de OpenCode Go (`https://opencode.ai/inference/go/openai/v1/chat/completions`) **no se puede llamar
directo desde una web**: no responde el preflight CORS y exige el encabezado `x-opencode-session`. Este Worker
es un reenvío mínimo que resuelve eso. No guarda ni registra nada: cada estudiante manda **su propia key** de
OpenCode Go en el encabezado `Authorization` y el Worker solo la reenvía.

Qué hace (ver `opencode-proxy.mjs`):

- Acepta pedidos solo de los orígenes de `ALLOWED_ORIGINS` (por defecto el GitHub Pages del proyecto y `localhost`).
- Reenvía únicamente `POST /v1/chat/completions` y `GET /v1/models`.
- Agrega un User-Agent propio (OpenCode Go lo pide) y pasa el `x-opencode-session` que manda el chat
  (el id de la conversación).
- Devuelve la respuesta en streaming con los encabezados CORS; no reenvía cookies.

## Desplegarlo

Necesitás una cuenta gratuita de Cloudflare.

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

Wrangler imprime la URL (`https://saneamiento-opencode-proxy.<tu-cuenta>.workers.dev`). Si tu web está en otro
origen, editá `ALLOWED_ORIGINS` en `wrangler.toml` antes de desplegar.

Después, en el chat: **⚙ Configuración → OpenCode Go** → pegá la key de OpenCode y la URL del proxy →
**Probar conexión** (lista los modelos por el proxy) y guardá.

## Notas

- En la consola de OpenCode, para `deepseek-v4.1-flash` hay que elegir **Global** en Settings → Privacy → Regions.
- OpenCode Go está pensado para OpenCode y otros agentes de código; revisá sus condiciones de uso antes de usarlo
  desde una app propia. Tiene límites por 5 horas, semana y mes.
- Probado con `node --test tests/opencode.test.js` (fetch simulado). Con la key real, hay que verificar de punta a punta
  que el modelo y los encabezados sean aceptados.
