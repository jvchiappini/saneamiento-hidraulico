// Proxy mínimo para usar OpenCode Go desde el navegador (Cloudflare Worker).
// El endpoint de OpenCode Go no responde el preflight CORS y exige el encabezado
// x-opencode-session, así que una web estática no puede llamarlo directo. Este Worker:
//   - acepta pedidos solo de los orígenes permitidos (ALLOWED_ORIGINS),
//   - reenvía únicamente POST /v1/chat/completions y GET /v1/models,
//   - pasa la key que manda cada estudiante (no guarda ni registra nada),
//   - agrega un User-Agent propio y devuelve la respuesta en streaming con CORS.
const UPSTREAM = "https://opencode.ai/inference/go/openai";
const UA = "saneamiento-hidraulico-asistente/1.0 (+https://github.com/jvchiappini/saneamiento-hidraulico)";
const DEFAULT_ORIGINS = "https://jvchiappini.github.io,http://localhost:8765,http://127.0.0.1:8765,http://localhost:8000,http://127.0.0.1:8000";
const MAX_BODY = 2_000_000; // bytes

export default {
    async fetch(request, env = {}) {
        const origin = request.headers.get("Origin") || "";
        const allowed = String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);
        const cors = {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "Authorization, Content-Type, x-opencode-session",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Max-Age": "86400",
            "Access-Control-Expose-Headers": "retry-after",
            "Vary": "Origin",
        };
        const json = (status, message) => new Response(JSON.stringify({ error: { message, code: status } }), { status, headers: Object.assign({ "Content-Type": "application/json" }, origin && allowed.includes(origin) ? cors : {}) });

        if (!origin || !allowed.includes(origin)) return json(403, "Origen no permitido.");
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

        const url = new URL(request.url);
        const route = `${request.method} ${url.pathname.replace(/\/+$/, "")}`;
        if (route !== "POST /v1/chat/completions" && route !== "GET /v1/models") return json(404, "Ruta no disponible.");

        const auth = request.headers.get("Authorization") || "";
        if (route.startsWith("POST") && !/^Bearer\s+\S+/.test(auth)) return json(401, "Falta la API key (Authorization: Bearer …).");
        const session = request.headers.get("x-opencode-session") || "";
        if (route.startsWith("POST") && !/^[\w.:-]{1,100}$/.test(session)) return json(400, "Falta o es inválido el encabezado x-opencode-session.");

        const headers = { "User-Agent": UA };
        if (auth) headers["Authorization"] = auth;
        let body;
        if (route.startsWith("POST")) {
            const len = +(request.headers.get("content-length") || 0);
            if (len > MAX_BODY) return json(413, "Pedido demasiado grande.");
            body = await request.text();
            if (body.length > MAX_BODY) return json(413, "Pedido demasiado grande.");
            headers["Content-Type"] = "application/json";
            headers["x-opencode-session"] = session;
        }
        let up;
        try { up = await fetch(UPSTREAM + url.pathname.replace(/\/+$/, ""), { method: request.method, headers, body }); }
        catch (e) { return json(502, "No se pudo conectar con OpenCode Go."); }

        const out = Object.assign({}, cors);
        for (const h of ["Content-Type", "Retry-After", "Cache-Control"]) { const v = up.headers.get(h); if (v) out[h] = v; }
        return new Response(up.body, { status: up.status, headers: out });
    },
};
