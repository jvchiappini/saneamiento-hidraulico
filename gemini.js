"use strict";
/* =====================================================================
   gemini.js — Adaptador del asistente para Google Gemini (generateContent).
   - Sin SDK: fetch + lector SSE propio. La key va en el encabezado x-goog-api-key.
   - Mismo contrato de eventos que agent.js (block_start, text, thinking, tool_input,
     block_stop, tool_run, tool_result, message, usage, notice, error, stopped, done),
     así chat.js muestra ambos proveedores igual.
   - Historial en el formato nativo de Gemini (contents). Las parts del modelo se
     guardan tal como llegaron (con thoughtSignature) y se reenvían sin tocar.
   - Mismo bucle que Claude: herramientas en paralelo (todos los functionResponse en
     un solo mensaje), 10 pasos por turno, errores de herramienta como {error},
     Detener con AbortController, resumen del contexto.
   Este archivo no toca el DOM; fetch se puede inyectar (tests).
   ===================================================================== */
(function (root) {
    const Tools = root.AgentTools || (typeof require !== "undefined" ? require("./agent-tools.js") : null);
    const Core = root.AgentCore || (typeof require !== "undefined" ? require("./agent.js") : null);

    const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    const MODELS = [
        { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", desc: "Equilibrado (recomendado)" },
        { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite", desc: "El más rápido" },
        { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", desc: "Nuevo" },
    ];
    const DEFAULT_MODEL = "gemini-3.6-flash";
    const MAX_ITER = Core ? Core.MAX_ITER : 10;
    const KEEP_TURNS = Core ? Core.KEEP_TURNS : 4;
    const MAX_OUTPUT = 65536;
    const LEVEL = { low: "LOW", medium: "MEDIUM", high: "HIGH" };

    // finishReason que invalidan la respuesta: no se guarda nada en el historial.
    const BLOCKED = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_RECITATION", "LANGUAGE"]);
    const BROKEN = new Set(["MALFORMED_FUNCTION_CALL", "UNEXPECTED_TOOL_CALL", "TOO_MANY_TOOL_CALLS", "MISSING_THOUGHT_SIGNATURE", "OTHER", "FINISH_REASON_UNSPECIFIED"]);

    const clone = (x) => JSON.parse(JSON.stringify(x));
    const modelInfo = (id) => MODELS.find((m) => m.id === id) || { id, name: id };
    const validModel = (id) => /^[A-Za-z0-9._-]+$/.test(String(id || ""));

    /* ---------------- Errores ---------------- */
    class GeminiError extends Error {
        constructor(message, o = {}) { super(message); this.name = "GeminiError"; this.status = o.status || 0; this.apiStatus = o.apiStatus || ""; this.retryAfter = o.retryAfter || 0; this.network = !!o.network; }
    }
    const isAbort = (e, signal) => (signal && signal.aborted) || (e && e.name === "AbortError");

    function describeError(e) {
        if (!e) return "Error desconocido.";
        const st = e.status, msg = e.message || String(e);
        const wait = e.retryAfter ? ` Reintentá en ${e.retryAfter} s.` : "";
        if (e.network) return "No se pudo conectar con la API de Google (revisá la conexión a internet). " + msg;
        if (st === 400 && /API key not valid|API_KEY_INVALID|API key expired/i.test(msg)) return "La API key no es válida (400). Revisala en Configuración.";
        if (st === 400) return `Pedido inválido (400): ${msg}`;
        if (st === 401) return "La API key no es válida (401). Revisala en Configuración.";
        if (st === 403) return "La API key no es válida, o la API de Gemini no está habilitada para su proyecto (403)." + (msg ? ` Detalle: ${msg}` : "");
        if (st === 404) return "El modelo no existe o no está disponible para tu key (404). Elegí otro en Configuración.";
        if (st === 413) return "El pedido es demasiado grande (413).";
        if (st === 429) return "Se agotó el cupo gratuito de Gemini (429): esperá un minuto o probá mañana." + wait;
        if (st === 503 || st === 529) return "El modelo está sobrecargado (503). Probá de nuevo en unos segundos." + wait;
        if (st >= 500) return `Error del servidor de Google (${st}). Probá de nuevo.`;
        return msg;
    }

    function retryAfterOf(res, body) {
        const h = res.headers && res.headers.get && res.headers.get("retry-after");
        if (h && isFinite(+h)) return Math.ceil(+h);
        const details = body && body.error && body.error.details;
        if (Array.isArray(details)) for (const d of details) { const m = d && d.retryDelay && /^(\d+(?:\.\d+)?)s$/.exec(d.retryDelay); if (m) return Math.ceil(+m[1]); }
        return 0;
    }
    async function httpError(res) {
        let body = null, text = "";
        try { text = await res.text(); body = JSON.parse(text); } catch (e) { /* cuerpo no JSON */ }
        const err = body && body.error;
        return new GeminiError((err && err.message) || text.slice(0, 300) || `HTTP ${res.status}`, { status: res.status, apiStatus: err && err.status, retryAfter: retryAfterOf(res, body) });
    }

    /* ---------------- Lector SSE ---------------- */
    // Devuelve los objetos JSON de cada evento "data:" a medida que llegan.
    async function* readSSE(res) {
        const dec = new TextDecoder();
        let buf = "";
        const take = function* (flush) {
            for (;;) {
                const m = /\r?\n\r?\n/.exec(buf);
                if (!m) break;
                const ev = buf.slice(0, m.index); buf = buf.slice(m.index + m[0].length);
                const data = ev.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
                if (data && data !== "[DONE]") yield data;
            }
            if (flush && buf.trim()) {
                const data = buf.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
                buf = "";
                if (data && data !== "[DONE]") yield data;
            }
        };
        const parse = (d) => { try { return JSON.parse(d); } catch (e) { throw new GeminiError("Llegó un evento mal formado desde la API."); } };
        const body = res.body;
        if (body && typeof body.getReader === "function") {
            const reader = body.getReader();
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += dec.decode(value, { stream: true });
                    for (const d of take(false)) yield parse(d);
                }
            } finally { try { reader.releaseLock(); } catch (e) { /* noop */ } }
        } else if (body && body[Symbol.asyncIterator]) {
            for await (const value of body) { buf += typeof value === "string" ? value : dec.decode(value, { stream: true }); for (const d of take(false)) yield parse(d); }
        }
        buf += dec.decode();
        for (const d of take(true)) yield parse(d);
    }

    /* ---------------- Utilidades de historial ---------------- */
    const partsOf = (m) => (m && Array.isArray(m.parts) ? m.parts : []);
    const isToolMsg = (m) => m.role !== "model" && partsOf(m).length > 0 && partsOf(m).every((p) => p.functionResponse);
    const textOf = (parts) => partsOf({ parts }).filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("\n");

    // Índices de los mensajes del usuario que empiezan un turno (texto escrito, no resultados de herramientas).
    function userTurnStarts(messages) {
        const out = [];
        messages.forEach((m, i) => { if (m.role === "user" && partsOf(m).some((p) => typeof p.text === "string") && !partsOf(m).some((p) => p.functionResponse)) out.push(i); });
        return out;
    }

    function toolResponse(res) {
        if (res.is_error) return { error: String(res.content) };
        let v = res.content;
        try { v = JSON.parse(res.content); } catch (e) { /* texto plano */ }
        return { result: v };
    }

    // Convierte el historial de Gemini a bloques "tipo Claude" (1 mensaje ↔ 1 mensaje) para que chat.js lo dibuje igual.
    function toDisplay(messages) {
        const pending = []; // functionCalls del último mensaje del modelo: {id, name, used}
        return messages.map((m, i) => {
            if (m.role === "model") {
                pending.length = 0;
                const content = [];
                partsOf(m).forEach((p, k) => {
                    if (p.functionCall) {
                        const id = p.functionCall.id || `g${i}_${k}`;
                        pending.push({ id, name: p.functionCall.name });
                        content.push({ type: "tool_use", id, name: p.functionCall.name, input: p.functionCall.args || {} });
                    } else if (typeof p.text === "string" && p.text) {
                        const type = p.thought ? "thinking" : "text";
                        const last = content[content.length - 1];
                        if (last && last.type === type) { if (type === "text") last.text += p.text; else last.thinking += p.text; }
                        else content.push(type === "text" ? { type, text: p.text } : { type, thinking: p.text });
                    }
                });
                return { role: "assistant", content };
            }
            const content = [];
            partsOf(m).forEach((p) => {
                if (p.functionResponse) {
                    const fr = p.functionResponse;
                    const call = (fr.id && pending.find((c) => c.id === fr.id)) || pending.find((c) => !c.used && c.name === fr.name) || pending.find((c) => !c.used);
                    if (call) call.used = true;
                    const r = fr.response || {};
                    const err = "error" in r;
                    content.push({ type: "tool_result", tool_use_id: call ? call.id : fr.id || "?", is_error: err, content: typeof (err ? r.error : r.result) === "string" ? (err ? r.error : r.result) : JSON.stringify(err ? r.error : r.result) });
                } else if (typeof p.text === "string") content.push({ type: "text", text: p.text });
            });
            return { role: "user", content };
        });
    }

    // Texto del sistema: acepta el formato compartido (array de bloques) o texto.
    function systemText(system) {
        if (!system) return "";
        if (typeof system === "string") return system;
        if (Array.isArray(system)) return system.map((b) => (b && b.text) || "").join("\n\n");
        return partsOf({ parts: system.parts }).map((p) => p.text || "").join("\n\n");
    }

    function functionDeclarations() {
        return [{ functionDeclarations: Tools.TOOL_DEFS.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema })) }];
    }

    /* ---------------- Agente ---------------- */
    class GeminiAgent {
        constructor(o) {
            this.apiKey = o.apiKey;
            this.fetch = o.fetch || (typeof fetch !== "undefined" ? fetch.bind(root) : null);
            this.sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
            this.executor = o.executor;
            this.model = o.model || DEFAULT_MODEL;
            this.maxTokens = Math.min(o.maxTokens || 32000, MAX_OUTPUT);
            this.effort = o.effort || "medium";
            this.maxIter = o.maxIter || MAX_ITER;
            this.onEvent = o.onEvent || (() => { });
            this.retries = o.retries == null ? 2 : o.retries;
            this.toolRole = o.toolRole || "user";
        }

        // Cuerpo del pedido. `mode`: AUTO (no se manda) o NONE. `contents` ya con el rol de herramientas elegido.
        body(conv, o = {}) {
            const role = this.toolRole;
            const contents = (o.contents || conv.messages).map((m) => (isToolMsg(m) ? Object.assign({}, m, { role }) : m));
            const sys = systemText(conv.system) + (o.systemExtra ? "\n\n" + o.systemExtra : "");
            const b = {
                contents,
                tools: functionDeclarations(),
                generationConfig: {
                    maxOutputTokens: o.maxTokens || this.maxTokens,
                    thinkingConfig: { includeThoughts: true, thinkingLevel: LEVEL[o.effort || this.effort] || "MEDIUM" },
                },
            };
            if (sys) b.systemInstruction = { parts: [{ text: sys }] };
            if (o.mode) b.toolConfig = { functionCallingConfig: { mode: o.mode } };
            return b;
        }

        async post(url, body, signal) {
            if (!this.apiKey) throw new GeminiError("Falta la API key de Gemini: cargala en Configuración.", { status: 401 });
            if (!validModel(this.model)) throw new GeminiError("Modelo inválido.", { status: 400 });
            let attempt = 0;
            for (;;) {
                let res;
                try {
                    res = await this.fetch(url, { method: "POST", signal, headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey }, body: JSON.stringify(body) });
                } catch (e) {
                    if (isAbort(e, signal)) throw e;
                    if (attempt < this.retries) { attempt++; await this.sleep(500 * attempt); continue; }
                    throw new GeminiError(e && e.message || "fallo de red", { network: true });
                }
                if (res.ok) return res;
                const err = await httpError(res);
                if (err.status >= 500 && attempt < this.retries) { attempt++; await this.sleep(500 * attempt); continue; }
                throw err;
            }
        }

        // Un pedido con streaming. Devuelve {parts, finish, usage, blockReason, text} o {aborted, partial}.
        async request(conv, o, signal, iter) {
            const ev = this.onEvent;
            const url = `${BASE_URL}/models/${this.model}:streamGenerateContent?alt=sse`;
            let partial = "";
            const parts = [];
            let finish = "", finishMessage = "", usage = null, blockReason = "";
            let idx = -1, open = null; // bloque abierto: {kind: "text"|"thinking"}
            const closeBlock = () => { if (open) { ev({ type: "block_stop", iter, index: idx }); open = null; } };
            const callIds = [];
            try {
                const res = await this.post(url, this.body(conv, o), signal);
                for await (const chunk of readSSE(res)) {
                    if (chunk.error) throw new GeminiError(chunk.error.message || "Error de la API", { status: chunk.error.code || 500, apiStatus: chunk.error.status });
                    if (chunk.promptFeedback && chunk.promptFeedback.blockReason) blockReason = chunk.promptFeedback.blockReason;
                    if (chunk.usageMetadata) usage = chunk.usageMetadata;
                    const cand = chunk.candidates && chunk.candidates[0];
                    if (!cand) continue;
                    if (cand.finishReason) finish = cand.finishReason;
                    if (cand.finishMessage) finishMessage = cand.finishMessage;
                    for (const p of (cand.content && cand.content.parts) || []) {
                        if (p.functionCall) {
                            closeBlock();
                            parts.push(clone(p));
                            const id = p.functionCall.id || `fc${iter}_${callIds.length}`;
                            callIds.push(id);
                            idx++;
                            ev({ type: "block_start", iter, index: idx, block: { type: "tool_use", id, name: p.functionCall.name } });
                            ev({ type: "tool_input", iter, index: idx, partial: JSON.stringify(p.functionCall.args || {}) });
                            ev({ type: "block_stop", iter, index: idx });
                        } else if (typeof p.text === "string") {
                            const kind = p.thought ? "thinking" : "text";
                            const last = parts[parts.length - 1];
                            // Se juntan fragmentos del mismo tipo salvo que alguno lleve firma (esa part queda aparte).
                            if (last && typeof last.text === "string" && !!last.thought === !!p.thought && !last.thoughtSignature && !p.thoughtSignature && !last.functionCall) last.text += p.text;
                            else parts.push(clone(p));
                            if (p.text) {
                                if (!open || open.kind !== kind) { closeBlock(); idx++; open = { kind }; ev({ type: "block_start", iter, index: idx, block: { type: kind } }); }
                                if (kind === "text") { partial += p.text; ev({ type: "text", iter, index: idx, text: p.text }); }
                                else ev({ type: "thinking", iter, index: idx, text: p.text });
                            }
                        } else parts.push(clone(p)); // otros tipos de part: se guardan tal cual
                    }
                }
                closeBlock();
                return { parts, finish, finishMessage, usage, blockReason, callIds };
            } catch (e) {
                if (isAbort(e, signal)) return { aborted: true, partial };
                throw e;
            }
        }

        async run(conv, opts = {}) {
            const signal = opts.signal, ev = this.onEvent;
            conv.usage = conv.usage || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ctx: 0, requests: 0 };
            let roleRetry = false;
            for (let iter = 1; iter <= this.maxIter; iter++) {
                const last = iter === this.maxIter;
                if (last) ev({ type: "notice", level: "warn", text: `Límite de ${this.maxIter} pasos por turno: se pide la respuesta final.` });
                const o = last ? { mode: "NONE", systemExtra: "Se alcanzó el límite de herramientas de este turno. Respondé ahora con lo que ya tenés, sin llamar herramientas, y decí qué quedó pendiente." } : {};
                if (conv.toolRole) this.toolRole = conv.toolRole;
                let r;
                try { r = await this.request(conv, o, signal, iter); }
                catch (e) {
                    // La documentación se contradice en el rol de los resultados de herramientas: si "user" da 400, se prueba "function".
                    if (e && e.status === 400 && !roleRetry && this.toolRole === "user" && conv.messages.some(isToolMsg) && !/API key/i.test(e.message)) {
                        roleRetry = true; this.toolRole = "function"; conv.toolRole = "function"; iter--;
                        ev({ type: "notice", level: "info", text: "Se reintentó el pedido con otro formato de resultados de herramientas." });
                        continue;
                    }
                    ev({ type: "error", text: describeError(e), error: e });
                    return { status: "error" };
                }
                if (r.aborted) {
                    if (r.partial.trim()) conv.messages.push({ role: "model", parts: [{ text: r.partial + "\n\n*(respuesta detenida)*" }] });
                    ev({ type: "stopped" });
                    return { status: "stopped" };
                }
                this.trackUsage(conv, r.usage);
                ev({ type: "message", iter, message: { parts: r.parts, finishReason: r.finish, usageMetadata: r.usage } });

                const calls = r.parts.map((p, k) => (p.functionCall ? { part: p, id: r.callIds[r.parts.slice(0, k).filter((x) => x.functionCall).length] } : null)).filter(Boolean);
                if (r.blockReason && !r.parts.length) {
                    ev({ type: "notice", level: "error", text: `Gemini bloqueó el pedido (${r.blockReason}). Reformulá la pregunta.` });
                    return { status: "refusal" };
                }
                if (BLOCKED.has(r.finish)) {
                    ev({ type: "notice", level: "error", text: `Gemini no completó la respuesta por sus políticas de seguridad (${r.finish}). Reformulá la pregunta.` });
                    return { status: "refusal" };
                }
                if (BROKEN.has(r.finish)) {
                    ev({ type: "notice", level: "error", text: `Gemini cortó la respuesta (${r.finish}${r.finishMessage ? ": " + r.finishMessage : ""}). Probá regenerar.` });
                    return { status: "error" };
                }
                if (r.finish === "MAX_TOKENS" && calls.length) {
                    ev({ type: "notice", level: "error", text: "La respuesta se cortó por el máximo de tokens en medio de una herramienta. Subí «Máximo de tokens» en Configuración y regenerá." });
                    return { status: "max_tokens" };
                }
                if (!r.parts.length) {
                    ev({ type: "notice", level: "warn", text: "Gemini no devolvió contenido. Probá regenerar." });
                    return { status: "empty" };
                }
                conv.messages.push({ role: "model", parts: r.parts });
                if (!calls.length) {
                    if (r.finish === "MAX_TOKENS") ev({ type: "notice", level: "warn", text: "La respuesta se cortó por el máximo de tokens." });
                    ev({ type: "done" });
                    return { status: "done" };
                }

                // Herramientas en paralelo; todos los resultados van en un solo mensaje.
                const results = await Promise.all(calls.map(async (c) => {
                    const fc = c.part.functionCall;
                    ev({ type: "tool_run", id: c.id, name: fc.name, input: fc.args || {} });
                    let res;
                    if (signal && signal.aborted) res = { content: "Cancelado por el usuario.", is_error: true };
                    else { try { res = await this.executor.exec(fc.name, fc.args || {}); } catch (e) { res = { content: "Error: " + (e && e.message || e), is_error: true }; } }
                    ev({ type: "tool_result", id: c.id, name: fc.name, result: res });
                    const fr = { name: fc.name, response: toolResponse(res) };
                    if (fc.id) fr.id = fc.id;
                    return { functionResponse: fr };
                }));
                conv.messages.push({ role: "user", parts: results });
                if (signal && signal.aborted) { ev({ type: "stopped" }); return { status: "stopped" }; }
            }
            ev({ type: "done" });
            return { status: "done" };
        }

        trackUsage(conv, u) {
            if (!u) return;
            const U = conv.usage;
            const prompt = u.promptTokenCount || 0, cached = u.cachedContentTokenCount || 0;
            const out = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
            U.input += Math.max(0, prompt - cached); U.cacheRead += cached; U.output += out;
            U.requests++;
            U.ctx = u.totalTokenCount || (prompt + out);
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

        async countTokens(conv, signal) {
            const url = `${BASE_URL}/models/${this.model}:countTokens`;
            const b = this.body(conv);
            const res = await this.post(url, { generateContentRequest: { model: "models/" + this.model, contents: b.contents, systemInstruction: b.systemInstruction, tools: b.tools } }, signal);
            return (await res.json()).totalTokens;
        }

        async maybeCompact(conv, opts = {}) {
            const threshold = opts.threshold || 120000;
            const est = this.estimate(conv);
            if (est.tokens < threshold * 0.85) return false;
            let tokens = est.tokens;
            try { tokens = await this.countTokens(conv, opts.signal); } catch (e) { /* sin conteo exacto: se usa la estimación */ }
            this.onEvent({ type: "context", tokens, threshold });
            if (tokens < threshold) return false;
            return this.compact(conv, opts);
        }

        async compact(conv, opts = {}) {
            const starts = userTurnStarts(conv.messages);
            const keep = opts.keepTurns || KEEP_TURNS;
            if (starts.length <= keep) { this.onEvent({ type: "notice", level: "warn", text: "El contexto es grande pero hay pocos turnos para resumir." }); return false; }
            const cut = starts[starts.length - keep];
            const old = conv.messages.slice(0, cut);
            this.onEvent({ type: "notice", level: "info", text: "Resumiendo los turnos anteriores para liberar contexto…" });
            // Pedido derivado: mismo sistema, herramientas y prefijo de mensajes; sin llamar herramientas.
            const contents = old.concat([{ role: "user", parts: [{ text: SUMMARY_INSTRUCTIONS }] }]);
            let summary = "";
            try {
                const url = `${BASE_URL}/models/${this.model}:streamGenerateContent?alt=sse`;
                const res = await this.post(url, this.body(conv, { contents, mode: "NONE", maxTokens: 12000, effort: "low" }), opts.signal);
                let usage = null;
                for await (const chunk of readSSE(res)) {
                    if (chunk.error) throw new GeminiError(chunk.error.message || "Error de la API", { status: chunk.error.code || 500 });
                    if (chunk.usageMetadata) usage = chunk.usageMetadata;
                    const cand = chunk.candidates && chunk.candidates[0];
                    if (cand && cand.content) summary += textOf(cand.content.parts);
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
            kept[0].parts = [{ text: head }].concat(partsOf(kept[0]));
            conv.archived = (conv.archived || []).concat(old);
            conv.messages = kept;
            conv.compactions = (conv.compactions || []).concat([{ at: new Date().toISOString(), removed: old.length, summary }]);
            conv.usage.ctx = 0; conv.usage.ctxAt = 0;
            this.onEvent({ type: "compacted", removed: old.length, summary });
            return true;
        }
    }

    const SUMMARY_INSTRUCTIONS = "Resumí la conversación hasta acá para poder seguir trabajando sin el historial completo. Incluí: qué partes del TP se trabajaron, los datos y resultados numéricos clave con unidades (tal como salieron de las herramientas), las verificaciones que no cumplen, las decisiones y supuestos acordados, los cambios guardados en el proyecto, las fuentes citadas con su [id, p. X] y lo que quedó pendiente. Máximo 400 palabras, en viñetas. No llames herramientas.";

    // Prueba de conexión: countTokens no genera texto (verifica key, CORS y modelo).
    async function testConnection(o) {
        const ag = new GeminiAgent({ apiKey: o.apiKey, model: o.model, fetch: o.fetch, retries: 0 });
        const url = `${BASE_URL}/models/${ag.model}:countTokens`;
        const res = await ag.post(url, { generateContentRequest: { model: "models/" + ag.model, contents: [{ role: "user", parts: [{ text: "Hola" }] }] } });
        return (await res.json()).totalTokens;
    }

    const api = { GeminiAgent, GeminiError, MODELS, DEFAULT_MODEL, BASE_URL, describeError, readSSE, toDisplay, userTurnStarts, testConnection, modelInfo, textOf, functionDeclarations, systemText };
    root.GeminiCore = api;
    if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
