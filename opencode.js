"use strict";
/* =====================================================================
   opencode.js — Adaptador del asistente para OpenCode Go (DeepSeek V4.1 Flash).
   - API compatible con OpenAI (chat/completions con streaming SSE), sin SDK.
   - El navegador no puede llamar directo a OpenCode Go (no hay CORS y exige el
     encabezado x-opencode-session): se usa un proxy mínimo propio (worker/).
     La key de cada estudiante viaja como "Authorization: Bearer" hacia ese proxy.
   - Mismo contrato de eventos y mismo bucle que agent.js y gemini.js.
   - Historial en formato OpenAI (messages): el razonamiento (reasoning_content)
     se guarda y se reenvía tal como llegó.
   ===================================================================== */
(function (root) {
    const Tools = root.AgentTools || (typeof require !== "undefined" ? require("./agent-tools.js") : null);
    const Core = root.AgentCore || (typeof require !== "undefined" ? require("./agent.js") : null);
    const Gem = root.GeminiCore || (typeof require !== "undefined" ? require("./gemini.js") : null);

    const MODELS = [
        { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", desc: "Rápido y económico (recomendado)" },
        { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", desc: "Más capaz, más lento" },
    ];
    const DEFAULT_MODEL = "deepseek-v4.1-flash";
    const MAX_ITER = Core ? Core.MAX_ITER : 10;
    const KEEP_TURNS = Core ? Core.KEEP_TURNS : 4;
    const BLOCKED = new Set(["content_filter"]);

    class OpenCodeError extends Error {
        constructor(message, o = {}) { super(message); this.name = "OpenCodeError"; this.status = o.status || 0; this.retryAfter = o.retryAfter || 0; this.network = !!o.network; }
    }
    const isAbort = (e, signal) => (signal && signal.aborted) || (e && e.name === "AbortError");

    function describeError(e) {
        if (!e) return "Error desconocido.";
        const st = e.status, msg = e.message || String(e);
        const wait = e.retryAfter ? ` Reintentá en ${e.retryAfter} s.` : "";
        if (e.network) return "No se pudo conectar con el proxy de OpenCode Go (revisá la URL del proxy en Configuración y tu conexión). " + msg;
        if (st === 400 && /region|privacy|not available|no disponible/i.test(msg)) return `El modelo no está disponible para tu cuenta (400): en la consola de OpenCode, Settings → Privacy → Regions, elegí «Global» para DeepSeek V4.1 Flash. Detalle: ${msg}`;
        if (st === 400) return `Pedido inválido (400): ${msg}`;
        if (st === 401) return "La API key de OpenCode Go no es válida (401). Revisala en Configuración.";
        if (st === 402) return "Sin saldo o suscripción de OpenCode Go (402). Revisá tu cuenta en opencode.ai.";
        if (st === 403) return "Acceso denegado (403): la key no tiene permiso, o el origen no está permitido por el proxy. " + msg;
        if (st === 404) return "Ruta o modelo inexistente (404). Revisá la URL del proxy y el modelo elegido. " + msg;
        if (st === 413) return "El pedido es demasiado grande (413).";
        if (st === 429) return "Se alcanzó el límite de uso de OpenCode Go (429): esperá un rato (hay límites por 5 horas, semana y mes)." + wait;
        if (st === 502 || st === 503 || st === 529) return "El servicio está sobrecargado o no responde. Probá de nuevo en unos segundos." + wait;
        if (st >= 500) return `Error del servidor (${st}). Probá de nuevo.`;
        return msg;
    }

    async function httpError(res) {
        let body = null, text = "";
        try { text = await res.text(); body = JSON.parse(text); } catch (e) { /* no JSON */ }
        const err = body && (body.error || body);
        const msg = (err && (typeof err.message === "string" ? err.message : typeof err === "string" ? err : "")) || text.slice(0, 300) || `HTTP ${res.status}`;
        const ra = res.headers && res.headers.get && res.headers.get("retry-after");
        return new OpenCodeError(msg, { status: res.status, retryAfter: ra && isFinite(+ra) ? Math.ceil(+ra) : 0 });
    }

    function proxyBase(url) {
        const u = String(url || "").trim().replace(/\/+$/, "");
        if (!/^https:\/\/[^\s/]+/i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(u)) throw new OpenCodeError("Falta la URL del proxy (https://…) en Configuración.", { status: 400 });
        return u;
    }

    /* ---------------- Historial ---------------- */
    const strOf = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p && p.text) || "").join("\n") : "");
    // Mensajes de usuario: un solo string. Para dibujarlos se separan los bloques con etiqueta del inicio.
    function splitUser(text) {
        const out = []; let rest = String(text || "");
        for (;;) {
            const m = /^(<resumen_conversacion>[\s\S]*?<\/resumen_conversacion>(?:\s*<resumen_proyecto>[\s\S]*?<\/resumen_proyecto>)?|<contexto_pagina[^>]*>[\s\S]*?<\/contexto_pagina>)\s*/.exec(rest);
            if (!m) break;
            out.push({ type: "text", text: m[1] }); rest = rest.slice(m[0].length);
        }
        if (rest || !out.length) out.push({ type: "text", text: rest });
        return out;
    }
    function userTurnStarts(messages) { const out = []; messages.forEach((m, i) => { if (m.role === "user") out.push(i); }); return out; }

    function toDisplay(messages) {
        return messages.map((m) => {
            if (m.role === "assistant") {
                const content = [];
                if (m.reasoning_content) content.push({ type: "thinking", thinking: m.reasoning_content });
                if (strOf(m.content)) content.push({ type: "text", text: strOf(m.content) });
                for (const c of m.tool_calls || []) {
                    let input = {};
                    try { input = JSON.parse((c.function && c.function.arguments) || "{}"); } catch (e) { input = { _argumentos_invalidos: (c.function && c.function.arguments) || "" }; }
                    content.push({ type: "tool_use", id: c.id, name: c.function && c.function.name, input });
                }
                return { role: "assistant", content };
            }
            if (m.role === "tool") {
                const c = strOf(m.content);
                return { role: "user", content: [{ type: "tool_result", tool_use_id: m.tool_call_id, is_error: !!m.is_error, content: c }] };
            }
            return { role: "user", content: splitUser(strOf(m.content)) };
        });
    }

    function systemText(system) {
        if (!system) return "";
        if (typeof system === "string") return system;
        return (Array.isArray(system) ? system : []).map((b) => (b && b.text) || "").join("\n\n");
    }
    const toolDefs = () => Tools.TOOL_DEFS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));

    /* ---------------- Agente ---------------- */
    class OpenCodeAgent {
        constructor(o) {
            this.apiKey = o.apiKey;
            this.proxy = o.proxy;
            this.sessionId = o.sessionId || "sh-" + Math.random().toString(36).slice(2, 12);
            this.fetch = o.fetch || (typeof fetch !== "undefined" ? fetch.bind(root) : null);
            this.sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
            this.executor = o.executor;
            this.model = o.model || DEFAULT_MODEL;
            this.maxTokens = Math.min(o.maxTokens || 32000, 64000);
            this.maxIter = o.maxIter || MAX_ITER;
            this.onEvent = o.onEvent || (() => { });
            this.retries = o.retries == null ? 2 : o.retries;
        }

        body(conv, o = {}) {
            const sys = systemText(conv.system) + (o.systemExtra ? "\n\n" + o.systemExtra : "");
            const messages = (sys ? [{ role: "system", content: sys }] : []).concat((o.messages || conv.messages).map((m) => { const c = Object.assign({}, m); delete c.is_error; return c; }));
            const b = { model: this.model, messages, tools: toolDefs(), stream: true, stream_options: { include_usage: true }, max_tokens: o.maxTokens || this.maxTokens };
            if (o.toolChoice) b.tool_choice = o.toolChoice;
            return b;
        }

        async post(path, init, signal) {
            if (!this.apiKey) throw new OpenCodeError("Falta la API key de OpenCode Go: cargala en Configuración.", { status: 401 });
            const url = proxyBase(this.proxy) + path;
            let attempt = 0;
            for (;;) {
                let res;
                try { res = await this.fetch(url, Object.assign({ signal }, init, { headers: Object.assign({ Authorization: "Bearer " + this.apiKey, "x-opencode-session": this.sessionId }, init.headers) })); }
                catch (e) {
                    if (isAbort(e, signal)) throw e;
                    if (attempt < this.retries) { attempt++; await this.sleep(500 * attempt); continue; }
                    throw new OpenCodeError(e && e.message || "fallo de red", { network: true });
                }
                if (res.ok) return res;
                const err = await httpError(res);
                if (err.status >= 500 && attempt < this.retries) { attempt++; await this.sleep(500 * attempt); continue; }
                throw err;
            }
        }

        async request(conv, o, signal, iter) {
            const ev = this.onEvent;
            let text = "", reasoning = "", finish = "", usage = null;
            const calls = [];          // por index de la API
            let idx = -1, open = null; // bloque de texto/razonamiento abierto
            const closeOpen = () => { if (open) { ev({ type: "block_stop", iter, index: open.idx }); open = null; } };
            try {
                const res = await this.post("/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(this.body(conv, o)) }, signal);
                for await (const chunk of Gem.readSSE(res)) {
                    if (chunk.error) throw new OpenCodeError(chunk.error.message || "Error de la API", { status: chunk.error.code || 500 });
                    if (chunk.usage) usage = chunk.usage;
                    const ch = chunk.choices && chunk.choices[0];
                    if (!ch) continue;
                    if (ch.finish_reason) finish = ch.finish_reason;
                    const d = ch.delta || {};
                    const kinds = [["thinking", d.reasoning_content || d.reasoning], ["text", d.content]];
                    for (const [kind, t] of kinds) {
                        if (!t) continue;
                        if (!open || open.kind !== kind) { closeOpen(); idx++; open = { kind, idx }; ev({ type: "block_start", iter, index: idx, block: { type: kind } }); }
                        if (kind === "text") { text += t; ev({ type: "text", iter, index: idx, text: t }); } else { reasoning += t; ev({ type: "thinking", iter, index: idx, text: t }); }
                    }
                    for (const tc of d.tool_calls || []) {
                        const k = tc.index == null ? calls.length : tc.index;
                        let c = calls[k];
                        if (!c) {
                            closeOpen(); idx++;
                            c = calls[k] = { id: tc.id || `call${iter}_${k}`, name: "", args: "", idx };
                        }
                        if (tc.id) c.id = tc.id;
                        if (tc.function && tc.function.name) c.name += tc.function.name;
                        if (!c.started && c.name) { c.started = true; ev({ type: "block_start", iter, index: c.idx, block: { type: "tool_use", id: c.id, name: c.name } }); }
                        const a = tc.function && tc.function.arguments;
                        if (a) { c.args += a; if (c.started) ev({ type: "tool_input", iter, index: c.idx, partial: a }); }
                    }
                }
                closeOpen();
                const list = calls.filter(Boolean);
                for (const c of list) { if (!c.started) { ev({ type: "block_start", iter, index: c.idx, block: { type: "tool_use", id: c.id, name: c.name || "?" } }); } ev({ type: "block_stop", iter, index: c.idx }); }
                return { text, reasoning, calls: list, finish, usage };
            } catch (e) {
                closeOpen();
                if (isAbort(e, signal)) return { aborted: true, partial: text };
                throw e;
            }
        }

        async run(conv, opts = {}) {
            const signal = opts.signal, ev = this.onEvent;
            conv.usage = conv.usage || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ctx: 0, requests: 0 };
            if (conv.id) this.sessionId = conv.id;
            for (let iter = 1; iter <= this.maxIter; iter++) {
                const last = iter === this.maxIter;
                if (last) ev({ type: "notice", level: "warn", text: `Límite de ${this.maxIter} pasos por turno: se pide la respuesta final.` });
                const o = last ? { toolChoice: "none", systemExtra: "Se alcanzó el límite de herramientas de este turno. Respondé ahora con lo que ya tenés, sin llamar herramientas, y decí qué quedó pendiente." } : {};
                let r;
                try { r = await this.request(conv, o, signal, iter); }
                catch (e) { ev({ type: "error", text: describeError(e), error: e }); return { status: "error" }; }
                if (r.aborted) {
                    if (r.partial.trim()) conv.messages.push({ role: "assistant", content: r.partial + "\n\n*(respuesta detenida)*" });
                    ev({ type: "stopped" });
                    return { status: "stopped" };
                }
                this.trackUsage(conv, r.usage);
                ev({ type: "message", iter, message: { content: r.text, reasoning_content: r.reasoning, tool_calls: r.calls, finish_reason: r.finish, usage: r.usage } });

                if (BLOCKED.has(r.finish)) { ev({ type: "notice", level: "error", text: "El modelo no completó la respuesta por filtros de contenido. Reformulá la pregunta." }); return { status: "refusal" }; }
                if (r.finish === "length" && r.calls.length) { ev({ type: "notice", level: "error", text: "La respuesta se cortó por el máximo de tokens en medio de una herramienta. Subí «Máximo de tokens» en Configuración y regenerá." }); return { status: "max_tokens" }; }
                if (!r.text && !r.reasoning && !r.calls.length) { ev({ type: "notice", level: "warn", text: "El modelo no devolvió contenido. Probá regenerar." }); return { status: "empty" }; }

                const msg = { role: "assistant", content: r.text || null };
                if (r.reasoning) msg.reasoning_content = r.reasoning;
                if (r.calls.length) msg.tool_calls = r.calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args || "{}" } }));
                conv.messages.push(msg);
                if (!r.calls.length) {
                    if (r.finish === "length") ev({ type: "notice", level: "warn", text: "La respuesta se cortó por el máximo de tokens." });
                    ev({ type: "done" });
                    return { status: "done" };
                }

                const results = await Promise.all(r.calls.map(async (c) => {
                    let input, res;
                    try { input = c.args ? JSON.parse(c.args) : {}; } catch (e) { input = null; }
                    ev({ type: "tool_run", id: c.id, name: c.name, input: input || {} });
                    if (input === null) res = { content: "Los argumentos no son un JSON válido. Volvé a llamar la herramienta con argumentos correctos.", is_error: true };
                    else if (signal && signal.aborted) res = { content: "Cancelado por el usuario.", is_error: true };
                    else { try { res = await this.executor.exec(c.name, input); } catch (e) { res = { content: "Error: " + (e && e.message || e), is_error: true }; } }
                    ev({ type: "tool_result", id: c.id, name: c.name, result: res });
                    const m = { role: "tool", tool_call_id: c.id, content: res.is_error ? JSON.stringify({ error: String(res.content) }) : String(res.content) };
                    if (res.is_error) m.is_error = true;
                    return m;
                }));
                results.forEach((m) => conv.messages.push(m));
                if (signal && signal.aborted) { ev({ type: "stopped" }); return { status: "stopped" }; }
            }
            ev({ type: "done" });
            return { status: "done" };
        }

        trackUsage(conv, u) {
            if (!u) return;
            const U = conv.usage;
            const prompt = u.prompt_tokens || 0, cached = u.prompt_cache_hit_tokens || (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0;
            U.input += Math.max(0, prompt - cached); U.cacheRead += cached; U.output += u.completion_tokens || 0;
            U.requests++;
            U.ctx = u.total_tokens || prompt + (u.completion_tokens || 0);
            U.ctxAt = conv.messages.length + 1;
            this.onEvent({ type: "usage", usage: Object.assign({}, U) });
        }

        /* ---------------- Contexto ---------------- */
        estimate(conv) {
            const U = conv.usage || {};
            const after = conv.messages.slice(U.ctxAt || 0);
            const chars = JSON.stringify(after).length;
            if (U.ctx) return { tokens: Math.round(U.ctx + chars / 3.5), exact: !after.length };
            return { tokens: Math.round(JSON.stringify([conv.system, conv.messages]).length / 3.5) + 6000, exact: false };
        }

        async maybeCompact(conv, opts = {}) {
            const threshold = opts.threshold || 120000;
            const est = this.estimate(conv);
            if (est.tokens < threshold) return false;   // sin conteo exacto en esta API: se usa la estimación
            this.onEvent({ type: "context", tokens: est.tokens, threshold });
            return this.compact(conv, opts);
        }

        async compact(conv, opts = {}) {
            const starts = userTurnStarts(conv.messages);
            const keep = opts.keepTurns || KEEP_TURNS;
            if (starts.length <= keep) { this.onEvent({ type: "notice", level: "warn", text: "El contexto es grande pero hay pocos turnos para resumir." }); return false; }
            const cut = starts[starts.length - keep];
            const old = conv.messages.slice(0, cut);
            this.onEvent({ type: "notice", level: "info", text: "Resumiendo los turnos anteriores para liberar contexto…" });
            let summary = "";
            try {
                const messages = old.concat([{ role: "user", content: SUMMARY_INSTRUCTIONS }]);
                const res = await this.post("/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(this.body(conv, { messages, toolChoice: "none", maxTokens: 12000 })) }, opts.signal);
                let usage = null;
                for await (const chunk of Gem.readSSE(res)) {
                    if (chunk.error) throw new OpenCodeError(chunk.error.message || "Error de la API", { status: chunk.error.code || 500 });
                    if (chunk.usage) usage = chunk.usage;
                    const ch = chunk.choices && chunk.choices[0];
                    if (ch && ch.delta && ch.delta.content) summary += ch.delta.content;
                }
                summary = summary.trim();
                if (usage) this.trackUsage(conv, usage);
            } catch (e) {
                this.onEvent({ type: "notice", level: "warn", text: "No se pudo resumir el contexto: " + describeError(e) });
                return false;
            }
            if (!summary) return false;
            const project = opts.projectSummary ? await opts.projectSummary() : "";
            const kept = conv.messages.slice(cut);
            const head = `<resumen_conversacion>\n${summary}\n</resumen_conversacion>` + (project ? `\n<resumen_proyecto>\n${project}\n</resumen_proyecto>` : "");
            kept[0].content = head + "\n\n" + strOf(kept[0].content);
            conv.archived = (conv.archived || []).concat(old);
            conv.messages = kept;
            conv.compactions = (conv.compactions || []).concat([{ at: new Date().toISOString(), removed: old.length, summary }]);
            conv.usage.ctx = 0; conv.usage.ctxAt = 0;
            this.onEvent({ type: "compacted", removed: old.length, summary });
            return true;
        }
    }

    const SUMMARY_INSTRUCTIONS = "Resumí la conversación hasta acá para poder seguir trabajando sin el historial completo. Incluí: qué partes del TP se trabajaron, los datos y resultados numéricos clave con unidades (tal como salieron de las herramientas), las verificaciones que no cumplen, las decisiones y supuestos acordados, los cambios guardados en el proyecto, las fuentes citadas con su [id, p. X] y lo que quedó pendiente. Máximo 400 palabras, en viñetas. No llames herramientas.";

    // Prueba de conexión: lista los modelos por el proxy (verifica URL del proxy, CORS y que el modelo exista).
    async function testConnection(o) {
        const ag = new OpenCodeAgent({ apiKey: o.apiKey || "-", proxy: o.proxy, fetch: o.fetch, retries: 0 });
        const res = await ag.post("/v1/models", { method: "GET", headers: {} });
        const j = await res.json();
        const ids = (j.data || j).map((m) => m.id || m.name);
        if (o.model && !ids.includes(o.model)) throw new OpenCodeError(`El modelo «${o.model}» no figura en la lista de OpenCode Go.`, { status: 404 });
        return ids.length;
    }

    const api = { OpenCodeAgent, OpenCodeError, MODELS, DEFAULT_MODEL, describeError, toDisplay, userTurnStarts, testConnection, modelInfo: (id) => MODELS.find((m) => m.id === id) || { id, name: id }, systemText };
    root.OpenCodeCore = api;
    if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
