"use strict";
// Tests del adaptador de OpenCode Go y de su proxy: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");
const req = (f) => require(path.join(ROOT, f));
const T = req("agent-tools.js");
const A = req("agent.js");
const O = req("opencode.js");

const enc = new TextEncoder();
const sseRes = (chunks, splitAt) => {
    const bytes = enc.encode(chunks.map((c) => "data: " + JSON.stringify(c) + "\n\n").join("") + "data: [DONE]\n\n");
    return new Response(new ReadableStream({ start(ctl) { for (let i = 0; i < bytes.length; i += splitAt || bytes.length) ctl.enqueue(bytes.slice(i, i + (splitAt || bytes.length))); ctl.close(); } }), { status: 200 });
};
const errRes = (status, message, headers) => new Response(JSON.stringify({ error: { message } }), { status, headers });
const delta = (d, finish) => ({ choices: [{ index: 0, delta: d, finish_reason: finish || null }] });
function fakeFetch(script) {
    const calls = [];
    const f = async (url, init) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); const s = script[calls.length - 1]; if (!s) throw new Error("pedido inesperado"); return typeof s === "function" ? s(init) : s; };
    f.calls = calls; return f;
}
const base = (text) => ({ id: "c-test1", system: A.buildSystem(null), messages: [{ role: "user", content: text || "hola" }] });
const agent = (fetch, o = {}) => new O.OpenCodeAgent({ apiKey: "K-TEST", proxy: "https://proxy.example.dev/", fetch, executor: T.createExecutor({}), sleep: async () => { }, ...o });
const tc = (index, id, name, args) => ({ tool_calls: [{ index, ...(id ? { id } : {}), type: "function", function: { ...(name ? { name } : {}), arguments: args } }] });

test("streaming: razonamiento + texto, pedido con proxy, key y sesión en encabezados", async () => {
    const f = fakeFetch([sseRes([
        delta({ reasoning_content: "Pienso" }), delta({ content: "Hola, " }), delta({ content: "mundo" }, "stop"),
        { choices: [], usage: { prompt_tokens: 100, completion_tokens: 8, total_tokens: 108, prompt_cache_hit_tokens: 40 } },
    ], 13)]);
    const evs = [], conv = base();
    const r = await agent(f, { onEvent: (e) => evs.push(e) }).run(conv);
    assert.equal(r.status, "done");
    assert.deepEqual(conv.messages[1], { role: "assistant", content: "Hola, mundo", reasoning_content: "Pienso" });
    const c = f.calls[0];
    assert.equal(c.url, "https://proxy.example.dev/v1/chat/completions");
    assert.equal(c.init.headers.Authorization, "Bearer K-TEST");
    assert.equal(c.init.headers["x-opencode-session"], "c-test1", "sesión estable = id de la conversación");
    assert.equal(c.body.model, "deepseek-v4.1-flash");
    assert.equal(c.body.stream, true);
    assert.equal(c.body.messages[0].role, "system");
    assert.equal(c.body.tools.length, T.TOOL_DEFS.length);
    assert.ok(c.body.tools.every((t) => t.type === "function" && t.function.parameters && !("strict" in t.function)));
    assert.deepEqual(evs.filter((e) => e.type === "block_start").map((e) => e.block.type), ["thinking", "text"]);
    assert.equal(evs.filter((e) => e.type === "text").map((e) => e.text).join(""), "Hola, mundo");
    assert.equal(conv.usage.input, 60); assert.equal(conv.usage.cacheRead, 40); assert.equal(conv.usage.ctx, 108);
});

test("herramientas en paralelo: tool_calls acumulados por index, un mensaje tool por resultado, razonamiento reenviado", async () => {
    const f = fakeFetch([
        sseRes([delta({ reasoning_content: "mm" }), delta(tc(0, "c1", "calc", '{"expres')), delta(tc(0, null, null, 'sion":"2*3"}')), delta(tc(1, "c2", "calc", '{"expression":"1/0"}')), delta({}, "tool_calls")], 7),
        sseRes([delta({ content: "Da 6." }, "stop")]),
    ]);
    const evs = [], conv = base();
    const r = await agent(f, { onEvent: (e) => evs.push(e) }).run(conv);
    assert.equal(r.status, "done");
    assert.deepEqual(conv.messages.map((m) => m.role), ["user", "assistant", "tool", "tool", "assistant"]);
    assert.equal(conv.messages[1].tool_calls[0].function.arguments, '{"expression":"2*3"}');
    assert.equal(conv.messages[1].reasoning_content, "mm");
    assert.equal(JSON.parse(conv.messages[2].content).result, 6);
    assert.equal(conv.messages[2].tool_call_id, "c1");
    assert.match(JSON.parse(conv.messages[3].content).error, /finito|1\/0/);
    const sent = f.calls[1].body.messages;
    assert.equal(sent[2].reasoning_content, "mm");
    assert.ok(sent.every((m) => !("is_error" in m)));
    assert.deepEqual(evs.filter((e) => e.type === "tool_run").map((e) => e.id), ["c1", "c2"]);
    assert.equal(evs.filter((e) => e.type === "block_start" && e.block.type === "tool_use").length, 2);
});

test("argumentos inválidos y herramienta desconocida vuelven como error al modelo", async () => {
    const f = fakeFetch([sseRes([delta(tc(0, "a", "calc", "{roto")), delta(tc(1, "b", "borrar_todo", "{}"), "tool_calls")]), sseRes([delta({ content: "ok" }, "stop")])]);
    const conv = base();
    await agent(f).run(conv);
    assert.match(JSON.parse(conv.messages[2].content).error, /JSON válido/);
    assert.match(JSON.parse(conv.messages[3].content).error, /desconocida/);
});

test("límite de pasos: último con tool_choice none y aviso solo en ese pedido", async () => {
    const loop = () => sseRes([delta(tc(0, "t", "calc", '{"expression":"1"}'), "tool_calls")]);
    const f = fakeFetch([loop(), loop(), sseRes([delta({ content: "fin" }, "stop")])]);
    const conv = base();
    await agent(f, { maxIter: 3 }).run(conv);
    assert.equal(f.calls[2].body.tool_choice, "none");
    assert.ok(!("tool_choice" in f.calls[0].body));
    assert.match(f.calls[2].body.messages[0].content, /límite de herramientas/);
    assert.ok(!/límite de herramientas/.test(f.calls[1].body.messages[0].content));
    assert.equal(conv.messages[conv.messages.length - 1].role, "assistant");
});

test("length y content_filter", async () => {
    let conv = base(), evs = [];
    let r = await agent(fakeFetch([sseRes([delta(tc(0, "t", "calc", '{"expression":"1+'), "length")])]), { onEvent: (e) => evs.push(e) }).run(conv);
    assert.equal(r.status, "max_tokens"); assert.equal(conv.messages.length, 1);
    conv = base();
    r = await agent(fakeFetch([sseRes([delta({ content: "corta" }, "length")])]), { onEvent: (e) => evs.push(e) }).run(conv);
    assert.equal(r.status, "done"); assert.equal(conv.messages.length, 2);
    conv = base();
    r = await agent(fakeFetch([sseRes([delta({ content: "x" }, "content_filter")])])).run(conv);
    assert.equal(r.status, "refusal"); assert.equal(conv.messages.length, 1);
});

test("errores HTTP legibles; 5xx se reintenta; sin proxy configurado avisa", async () => {
    const cases = [[errRes(401, "bad key"), /key de OpenCode Go no es válida/], [errRes(402, "no balance"), /saldo/], [errRes(429, "limit", { "retry-after": "30" }), /límite[\s\S]*30 s/],
    [errRes(400, "model not available in your region"), /Regions[\s\S]*Global/], [errRes(400, "MissingSessionID"), /Pedido inválido \(400\): MissingSessionID/], [errRes(403, "origin"), /403/]];
    for (const [res, re] of cases) {
        const evs = [];
        const r = await agent(fakeFetch([res]), { onEvent: (e) => evs.push(e) }).run(base());
        assert.equal(r.status, "error");
        assert.match(evs.find((e) => e.type === "error").text, re);
    }
    const f = fakeFetch([errRes(503, "o"), sseRes([delta({ content: "listo" }, "stop")])]);
    assert.equal((await agent(f).run(base())).status, "done"); assert.equal(f.calls.length, 2);
    const evs = [];
    await agent(fakeFetch([]), { proxy: "", onEvent: (e) => evs.push(e) }).run(base());
    assert.match(evs.find((e) => e.type === "error").text, /URL del proxy/);
});

test("detener guarda el texto parcial", async () => {
    const ac = new AbortController();
    const f = fakeFetch([() => new Response(new ReadableStream({ start(ctl) { ctl.enqueue(enc.encode("data: " + JSON.stringify(delta({ content: "a medias" })) + "\n\n")); setTimeout(() => { ac.abort(); ctl.error(Object.assign(new Error("x"), { name: "AbortError" })); }, 5); } }), { status: 200 })]);
    const conv = base();
    const r = await agent(f).run(conv, { signal: ac.signal });
    assert.equal(r.status, "stopped");
    assert.match(conv.messages[1].content, /a medias[\s\S]*detenida/);
});

test("contexto: resume turnos viejos y antepone el resumen al primer mensaje conservado", async () => {
    const msgs = [];
    for (let i = 0; i < 6; i++) { msgs.push({ role: "user", content: "pregunta " + i }); msgs.push({ role: "assistant", content: "respuesta " + i }); }
    msgs.push({ role: "user", content: "nueva" });
    const conv = { id: "c1", system: A.buildSystem(null), messages: msgs, usage: { ctx: 200000, ctxAt: msgs.length, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 } };
    const f = fakeFetch([sseRes([delta({ content: "- resumen" }, "stop")])]);
    assert.equal(await agent(f).maybeCompact(conv, { threshold: 100000, projectSummary: async () => "proyecto ok" }), true);
    assert.equal(f.calls[0].body.tool_choice, "none");
    assert.equal(f.calls[0].body.messages.slice(1, 7).length, 6);
    assert.equal(O.userTurnStarts(conv.messages).length, A.KEEP_TURNS);
    assert.match(conv.messages[0].content, /<resumen_conversacion>[\s\S]*- resumen[\s\S]*<resumen_proyecto>[\s\S]*proyecto ok[\s\S]*pregunta 3/);
    assert.equal(conv.archived.length, 6);
    assert.equal(await agent(fakeFetch([])).maybeCompact({ system: [], messages: [{ role: "user", content: "a" }], usage: { ctx: 10, ctxAt: 1 } }, { threshold: 100000 }), false);
});

test("toDisplay: bloques tipo Claude, resumen/contexto separados del texto escrito", () => {
    const msgs = [
        { role: "user", content: "<contexto_pagina page=\"red.html\">datos «Red»</contexto_pagina>\n\nhola" },
        { role: "assistant", content: "voy", reasoning_content: "pienso", tool_calls: [{ id: "x", type: "function", function: { name: "calc", arguments: '{"expression":"1"}' } }] },
        { role: "tool", tool_call_id: "x", content: '{"result":1}' },
        { role: "tool", tool_call_id: "y", content: '{"error":"no"}', is_error: true },
        { role: "assistant", content: "listo" },
    ];
    const d = O.toDisplay(msgs);
    assert.equal(d.length, msgs.length);
    assert.deepEqual(d[0].content.map((b) => b.text.slice(0, 9)), ["<contexto", "hola"]);
    assert.deepEqual(d[1].content.map((b) => b.type), ["thinking", "text", "tool_use"]);
    assert.deepEqual(d[1].content[2].input, { expression: "1" });
    assert.equal(d[2].content[0].tool_use_id, "x");
    assert.equal(d[3].content[0].is_error, true);
    assert.equal(A.userTurnStarts(d).length, 1);
});

test("testConnection lista los modelos por el proxy y verifica el modelo", async () => {
    const f = fakeFetch([new Response(JSON.stringify({ data: [{ id: "deepseek-v4.1-flash" }, { id: "deepseek-v4-pro" }] }), { status: 200 }), new Response(JSON.stringify({ data: [{ id: "otro" }] }), { status: 200 })]);
    assert.equal(await O.testConnection({ apiKey: "K", proxy: "https://p.dev", model: "deepseek-v4.1-flash", fetch: f }), 2);
    assert.equal(f.calls[0].url, "https://p.dev/v1/models");
    assert.equal(f.calls[0].init.method, "GET");
    await assert.rejects(O.testConnection({ apiKey: "K", proxy: "https://p.dev", model: "deepseek-v4.1-flash", fetch: f }), /no figura/);
    await assert.rejects(O.testConnection({ apiKey: "K", proxy: "ftp://x", model: "m", fetch: f }), /URL del proxy/);
});

/* ---------------- Proxy (Cloudflare Worker) ---------------- */
test("proxy: CORS, rutas permitidas, encabezados reenviados y streaming", async () => {
    const { default: worker } = await import(pathToFileURL(path.join(ROOT, "worker", "opencode-proxy.mjs")).href);
    const ORIGIN = "https://jvchiappini.github.io";
    const real = globalThis.fetch; const seen = [];
    globalThis.fetch = async (url, init) => { seen.push({ url, init }); return new Response("data: {}\n\n", { status: 200, headers: { "Content-Type": "text/event-stream", "Set-Cookie": "x=1" } }); };
    try {
        const mk = (method, p, headers, body) => new Request("https://w.dev" + p, { method, headers, body });
        let r = await worker.fetch(mk("OPTIONS", "/v1/chat/completions", { Origin: ORIGIN }), {});
        assert.equal(r.status, 204);
        assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);
        assert.match(r.headers.get("access-control-allow-headers"), /x-opencode-session/);
        r = await worker.fetch(mk("POST", "/v1/chat/completions", { Origin: "https://malo.example", Authorization: "Bearer k", "x-opencode-session": "s1" }, "{}"), {});
        assert.equal(r.status, 403); assert.equal(r.headers.get("access-control-allow-origin"), null);
        assert.equal((await worker.fetch(mk("POST", "/v1/otra", { Origin: ORIGIN }, "{}"), {})).status, 404);
        assert.equal((await worker.fetch(mk("POST", "/v1/chat/completions", { Origin: ORIGIN, "x-opencode-session": "s1" }, "{}"), {})).status, 401);
        assert.equal((await worker.fetch(mk("POST", "/v1/chat/completions", { Origin: ORIGIN, Authorization: "Bearer k" }, "{}"), {})).status, 400);
        assert.equal(seen.length, 0, "los pedidos rechazados no salen hacia OpenCode");
        r = await worker.fetch(mk("POST", "/v1/chat/completions", { Origin: ORIGIN, Authorization: "Bearer k", "x-opencode-session": "s1", "Content-Type": "application/json" }, '{"a":1}'), {});
        assert.equal(r.status, 200);
        assert.equal(seen[0].url, "https://opencode.ai/inference/go/openai/v1/chat/completions");
        assert.equal(seen[0].init.headers.Authorization, "Bearer k");
        assert.equal(seen[0].init.headers["x-opencode-session"], "s1");
        assert.match(seen[0].init.headers["User-Agent"], /saneamiento-hidraulico-asistente/);
        assert.equal(seen[0].init.body, '{"a":1}');
        assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);
        assert.equal(r.headers.get("set-cookie"), null, "no se reenvían cookies");
        r = await worker.fetch(mk("GET", "/v1/models", { Origin: ORIGIN }), { ALLOWED_ORIGINS: ORIGIN });
        assert.equal(r.status, 200); assert.equal(seen[1].url, "https://opencode.ai/inference/go/openai/v1/models");
        r = await worker.fetch(mk("GET", "/v1/models", { Origin: "http://localhost:8765" }), { ALLOWED_ORIGINS: ORIGIN });
        assert.equal(r.status, 403, "ALLOWED_ORIGINS reemplaza la lista por defecto");
    } finally { globalThis.fetch = real; }
});
