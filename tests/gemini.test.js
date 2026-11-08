"use strict";
// Tests del adaptador de Gemini: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const req = (f) => require(path.join(ROOT, f));
const T = req("agent-tools.js");
const A = req("agent.js");
const G = req("gemini.js");

const enc = new TextEncoder();
const ok = (parts, extra = {}) => ({ candidates: [{ content: { role: "model", parts }, ...extra }] });
const sseBody = (chunks, splitAt) => {
    const bytes = enc.encode(chunks.map((c) => "data: " + JSON.stringify(c) + "\r\n\r\n").join(""));
    return new ReadableStream({
        start(ctl) { for (let i = 0; i < bytes.length; i += splitAt || bytes.length) ctl.enqueue(bytes.slice(i, i + (splitAt || bytes.length))); ctl.close(); },
    });
};
const sseRes = (chunks, splitAt) => new Response(sseBody(chunks, splitAt), { status: 200, headers: { "content-type": "text/event-stream" } });
const errRes = (status, message, headers) => new Response(JSON.stringify({ error: { code: status, message, status: "X" } }), { status, headers });

// fetch simulado: cada pedido devuelve el siguiente elemento del guion (función o Response)
function fakeFetch(script) {
    const calls = [];
    const f = async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        const s = script[calls.length - 1];
        if (!s) throw new Error("pedido inesperado #" + calls.length);
        return typeof s === "function" ? s(init) : s;
    };
    f.calls = calls;
    return f;
}
const base = (text) => ({ system: A.buildSystem(null), messages: [{ role: "user", parts: [{ text: text || "hola" }] }] });
const agent = (fetch, o = {}) => new G.GeminiAgent({ apiKey: "K-TEST", fetch, executor: T.createExecutor({}), sleep: async () => { }, ...o });
const fc = (name, args, extra) => ({ functionCall: { name, args, ...(extra && extra.id ? { id: extra.id } : {}) }, ...(extra && extra.sig ? { thoughtSignature: extra.sig } : {}) });

test("SSE: texto y razonamiento en streaming, pedido bien armado, key en el encabezado", async () => {
    const f = fakeFetch([sseRes([
        ok([{ text: "Pienso", thought: true }]),
        ok([{ text: "Hola, " }]),
        ok([{ text: "mundo" }], { finishReason: "STOP" }),
        { usageMetadata: { promptTokenCount: 100, cachedContentTokenCount: 40, candidatesTokenCount: 5, thoughtsTokenCount: 3, totalTokenCount: 108 } },
    ], 17)]);
    const evs = [];
    const conv = base();
    const r = await agent(f, { effort: "high", onEvent: (e) => evs.push(e) }).run(conv);
    assert.equal(r.status, "done");
    assert.deepEqual(conv.messages[1], { role: "model", parts: [{ text: "Pienso", thought: true }, { text: "Hola, mundo" }] });
    const c = f.calls[0];
    assert.equal(c.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse");
    assert.ok(!c.url.includes("K-TEST"), "la key nunca va en la URL");
    assert.equal(c.init.headers["x-goog-api-key"], "K-TEST");
    assert.equal(c.body.generationConfig.thinkingConfig.thinkingLevel, "HIGH");
    assert.equal(c.body.generationConfig.thinkingConfig.includeThoughts, true);
    assert.ok(!("temperature" in c.body.generationConfig) && !("topP" in c.body.generationConfig));
    assert.match(c.body.systemInstruction.parts[0].text, /Saneamiento/);
    const decl = c.body.tools[0].functionDeclarations;
    assert.equal(decl.length, T.TOOL_DEFS.length);
    assert.ok(decl.every((d) => d.parametersJsonSchema && !("parameters" in d) && !("strict" in d) && !("eager_input_streaming" in d)));
    assert.ok(!("toolConfig" in c.body));
    assert.deepEqual(evs.filter((e) => e.type === "block_start").map((e) => e.block.type), ["thinking", "text"]);
    assert.equal(evs.filter((e) => e.type === "text").map((e) => e.text).join(""), "Hola, mundo");
    assert.equal(evs.filter((e) => e.type === "block_stop").length, 2);
    assert.equal(conv.usage.input, 60);
    assert.equal(conv.usage.cacheRead, 40);
    assert.equal(conv.usage.output, 8);
    assert.equal(conv.usage.ctx, 108);
});

test("functionCall en paralelo con thoughtSignature: se reenvía sin tocar, un solo mensaje con todos los functionResponse", async () => {
    const modelParts = [
        { text: "Calculo.", thoughtSignature: "SIG-TEXT" },
        fc("calc", { expression: "2*3" }, { id: "a1", sig: "SIG-A" }),
        fc("calc", { expression: "1/0" }, { id: "a2" }),
    ];
    const f = fakeFetch([
        sseRes([ok([modelParts[0]]), ok([modelParts[1]]), ok([modelParts[2]], { finishReason: "STOP" })]),
        sseRes([ok([{ text: "Da 6." }], { finishReason: "STOP" })]),
    ]);
    const evs = [];
    const conv = base();
    const r = await agent(f, { onEvent: (e) => evs.push(e) }).run(conv);
    assert.equal(r.status, "done");
    assert.equal(conv.messages.length, 4);
    assert.deepEqual(conv.messages[1].parts, modelParts, "las parts del modelo quedan exactamente como llegaron");
    const res = conv.messages[2].parts;
    assert.equal(res.length, 2, "todos los resultados en un solo mensaje");
    assert.equal(conv.messages[2].role, "user");
    assert.deepEqual(res[0].functionResponse.id, "a1");
    assert.equal(res[0].functionResponse.name, "calc");
    assert.equal(res[0].functionResponse.response.result.result, 6);
    assert.equal(res[1].functionResponse.id, "a2");
    assert.match(res[1].functionResponse.response.error, /finito|1\/0/);
    assert.ok(!("result" in res[1].functionResponse.response));
    // el segundo pedido lleva el historial tal cual, incluida la firma
    const sent = f.calls[1].body.contents;
    assert.deepEqual(sent[1].parts, modelParts);
    assert.equal(sent[1].parts[1].thoughtSignature, "SIG-A");
    assert.deepEqual(sent.slice(0, 3).map((m) => m.role), ["user", "model", "user"]);
    assert.deepEqual(evs.filter((e) => e.type === "tool_run").map((e) => e.id), ["a1", "a2"]);
    assert.equal(evs.filter((e) => e.type === "tool_result").length, 2);
});

test("functionCall sin id: el functionResponse tampoco lo lleva y la interfaz recibe ids propios", async () => {
    const f = fakeFetch([sseRes([ok([fc("calc", { expression: "1+1" })], { finishReason: "STOP" })]), sseRes([ok([{ text: "2" }], { finishReason: "STOP" })])]);
    const evs = [], conv = base();
    await agent(f, { onEvent: (e) => evs.push(e) }).run(conv);
    assert.ok(!("id" in conv.messages[2].parts[0].functionResponse));
    const id = evs.find((e) => e.type === "tool_run").id;
    assert.ok(id && evs.find((e) => e.type === "block_start" && e.block.type === "tool_use").block.id === id);
});

test("herramientas: entrada inválida y herramienta desconocida vuelven como {error}", async () => {
    const f = fakeFetch([
        sseRes([ok([fc("calc", { expression: 3 }), fc("borrar_todo", {})], { finishReason: "STOP" })]),
        sseRes([ok([{ text: "ok" }], { finishReason: "STOP" })]),
    ]);
    const conv = base();
    await agent(f).run(conv);
    const [a, b] = conv.messages[2].parts;
    assert.match(a.functionResponse.response.error, /Entrada inválida/);
    assert.match(b.functionResponse.response.error, /desconocida/);
});

test("límite de pasos: en el último, mode NONE y aviso; el historial no se contamina", async () => {
    const loop = () => sseRes([ok([fc("calc", { expression: "1" })], { finishReason: "STOP" })]);
    const f = fakeFetch([loop(), loop(), sseRes([ok([{ text: "fin" }], { finishReason: "STOP" })])]);
    const evs = [], conv = base();
    await agent(f, { maxIter: 3, onEvent: (e) => evs.push(e) }).run(conv);
    assert.equal(f.calls.length, 3);
    assert.ok(!("toolConfig" in f.calls[0].body));
    assert.deepEqual(f.calls[2].body.toolConfig, { functionCallingConfig: { mode: "NONE" } });
    assert.match(f.calls[2].body.systemInstruction.parts[0].text, /límite de herramientas/);
    assert.ok(!/límite de herramientas/.test(f.calls[1].body.systemInstruction.parts[0].text));
    assert.ok(evs.some((e) => e.type === "notice" && /Límite de 3 pasos/.test(e.text)));
    assert.equal(conv.messages[conv.messages.length - 1].role, "model");
    assert.equal(JSON.stringify(conv.messages).includes("límite"), false);
});

test("MAX_TOKENS: con herramienta no guarda nada; con texto lo guarda y avisa", async () => {
    let conv = base(), evs = [];
    let r = await agent(fakeFetch([sseRes([ok([fc("calc", { expression: "1+" })], { finishReason: "MAX_TOKENS" })])]), { onEvent: (e) => evs.push(e) }).run(conv);
    assert.equal(r.status, "max_tokens");
    assert.equal(conv.messages.length, 1);
    assert.ok(evs.some((e) => e.type === "notice" && e.level === "error"));
    conv = base(); evs = [];
    r = await agent(fakeFetch([sseRes([ok([{ text: "corta" }], { finishReason: "MAX_TOKENS" })])]), { onEvent: (e) => evs.push(e) }).run(conv);
    assert.equal(r.status, "done");
    assert.equal(conv.messages.length, 2);
    assert.ok(evs.some((e) => e.type === "notice" && /máximo de tokens/.test(e.text)));
});

test("SAFETY / PROHIBITED_CONTENT / bloqueo del pedido: aviso y sin respuesta incompleta", async () => {
    for (const chunk of [ok([{ text: "a medias" }], { finishReason: "SAFETY" }), ok([], { finishReason: "PROHIBITED_CONTENT" }), { promptFeedback: { blockReason: "OTHER" } }]) {
        const conv = base(), evs = [];
        const r = await agent(fakeFetch([sseRes([chunk])]), { onEvent: (e) => evs.push(e) }).run(conv);
        assert.equal(r.status, "refusal");
        assert.equal(conv.messages.length, 1);
        assert.ok(evs.some((e) => e.type === "notice" && e.level === "error"));
    }
    const conv = base(), evs = [];
    const r = await agent(fakeFetch([sseRes([ok([{ text: "x" }], { finishReason: "MISSING_THOUGHT_SIGNATURE" })])]), { onEvent: (e) => evs.push(e) }).run(conv);
    assert.equal(r.status, "error");
    assert.equal(conv.messages.length, 1);
});

test("errores HTTP: mensajes legibles y retry-after", async () => {
    const cases = [
        [errRes(400, "API key not valid. Please pass a valid API key."), /key no es válida/],
        [errRes(400, "Please use a valid role"), /Pedido inválido \(400\): Please use a valid role/],
        [errRes(403, "API has not been used"), /403[\s\S]*API has not been used/],
        [errRes(429, "quota", { "retry-after": "34" }), /cupo gratuito[\s\S]*mañana[\s\S]*34 s/],
        [errRes(404, "not found"), /modelo no existe/],
    ];
    for (const [res, re] of cases) {
        const evs = [], conv = base();
        const r = await agent(fakeFetch([res]), { onEvent: (e) => evs.push(e) }).run(conv);
        assert.equal(r.status, "error");
        assert.match(evs.find((e) => e.type === "error").text, re);
        assert.equal(conv.messages.length, 1);
    }
    // retryDelay dentro de details
    const body = JSON.stringify({ error: { code: 429, message: "q", status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "21s" }] } });
    const evs = [];
    await agent(fakeFetch([new Response(body, { status: 429 })]), { onEvent: (e) => evs.push(e) }).run(base());
    assert.match(evs.find((e) => e.type === "error").text, /21 s/);
});

test("503 se reintenta antes de fallar; si se recupera, sigue normal", async () => {
    const f = fakeFetch([errRes(503, "overloaded"), errRes(503, "overloaded"), sseRes([ok([{ text: "listo" }], { finishReason: "STOP" })])]);
    const conv = base();
    const r = await agent(f).run(conv);
    assert.equal(r.status, "done");
    assert.equal(f.calls.length, 3);
    const evs = [];
    await agent(fakeFetch([errRes(503, "o"), errRes(503, "o"), errRes(503, "o")]), { onEvent: (e) => evs.push(e) }).run(base());
    assert.match(evs.find((e) => e.type === "error").text, /sobrecargado/);
});

test("rol de los resultados: si 'user' da 400 se reintenta con 'function' y queda guardado", async () => {
    const conv = base();
    conv.messages.push({ role: "model", parts: [fc("calc", { expression: "1" })] }, { role: "user", parts: [{ functionResponse: { name: "calc", response: { result: 1 } } }] });
    const f = fakeFetch([errRes(400, "Please use a valid role: user, model."), sseRes([ok([{ text: "ok" }], { finishReason: "STOP" })])]);
    const r = await agent(f).run(conv);
    assert.equal(r.status, "done");
    assert.equal(f.calls[0].body.contents[2].role, "user");
    assert.equal(f.calls[1].body.contents[2].role, "function");
    assert.equal(conv.toolRole, "function");
    assert.equal(conv.messages[2].role, "user", "el historial guardado no cambia");
});

test("detener: aborta el fetch y guarda el texto parcial", async () => {
    const ac = new AbortController();
    const f = fakeFetch([() => new Response(new ReadableStream({
        async start(ctl) {
            ctl.enqueue(enc.encode("data: " + JSON.stringify(ok([{ text: "a medias" }])) + "\n\n"));
            setTimeout(() => { ac.abort(); ctl.error(Object.assign(new Error("abortado"), { name: "AbortError" })); }, 5);
        },
    }), { status: 200 })]);
    const evs = [], conv = base();
    const r = await agent(f, { onEvent: (e) => evs.push(e) }).run(conv, { signal: ac.signal });
    assert.equal(r.status, "stopped");
    assert.match(conv.messages[1].parts[0].text, /a medias[\s\S]*detenida/);
    assert.equal(conv.messages[1].role, "model");
    assert.ok(evs.some((e) => e.type === "stopped"));
    // el signal viaja al fetch
    assert.equal(f.calls[0].init.signal, ac.signal);
});

test("detener antes de empezar a recibir: sin mensaje del modelo", async () => {
    const ac = new AbortController(); ac.abort();
    const f = async (url, init) => { const e = new Error("aborted"); e.name = "AbortError"; throw e; };
    const conv = base();
    const r = await agent(f).run(conv, { signal: ac.signal });
    assert.equal(r.status, "stopped");
    assert.equal(conv.messages.length, 1);
});

test("contexto: resume los turnos viejos con NONE, conserva los últimos y arma el resumen", async () => {
    const msgs = [];
    for (let i = 0; i < 6; i++) {
        msgs.push({ role: "user", parts: [{ text: "pregunta " + i }] });
        msgs.push({ role: "model", parts: [{ text: "respuesta " + i, thoughtSignature: "s" }] });
    }
    msgs.push({ role: "user", parts: [{ text: "nueva" }] });
    const conv = { system: A.buildSystem(null), messages: msgs, usage: { ctx: 200000, ctxAt: msgs.length, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 } };
    const f = fakeFetch([
        (init) => new Response(JSON.stringify({ totalTokens: 200000 }), { status: 200 }),
        sseRes([ok([{ text: "- resumen" }], { finishReason: "STOP" })]),
    ]);
    const evs = [];
    const did = await agent(f, { onEvent: (e) => evs.push(e) }).maybeCompact(conv, { threshold: 100000, projectSummary: async () => "proyecto ok" });
    assert.equal(did, true);
    assert.match(f.calls[0].url, /:countTokens$/);
    assert.deepEqual(f.calls[0].body.generateContentRequest.model, "models/gemini-3.6-flash");
    const sum = f.calls[1].body;
    assert.deepEqual(sum.toolConfig, { functionCallingConfig: { mode: "NONE" } });
    assert.equal(sum.tools[0].functionDeclarations.length, T.TOOL_DEFS.length, "mismas herramientas");
    assert.equal(sum.systemInstruction.parts[0].text, G.systemText(conv.system) || sum.systemInstruction.parts[0].text);
    assert.deepEqual(sum.contents.slice(0, 6), msgs.slice(0, 6));
    assert.equal(sum.generationConfig.maxOutputTokens, 12000);
    assert.equal(G.userTurnStarts(conv.messages).length, A.KEEP_TURNS);
    assert.match(conv.messages[0].parts[0].text, /<resumen_conversacion>[\s\S]*- resumen[\s\S]*<resumen_proyecto>[\s\S]*proyecto ok/);
    assert.equal(conv.messages[0].parts[1].text, "pregunta 3");
    assert.equal(conv.archived.length, 6);
    assert.ok(evs.some((e) => e.type === "compacted"));
});

test("contexto: pocos turnos no se resumen", async () => {
    const conv = { system: [], messages: [{ role: "user", parts: [{ text: "a" }] }], usage: { ctx: 500000, ctxAt: 1 } };
    const f = fakeFetch([new Response(JSON.stringify({ totalTokens: 500000 }), { status: 200 })]);
    assert.equal(await agent(f).maybeCompact(conv, { threshold: 100000 }), false);
});

test("toDisplay: el historial de Gemini se dibuja como bloques de Claude (1 a 1)", () => {
    const msgs = [
        { role: "user", parts: [{ text: "hola" }] },
        { role: "model", parts: [{ text: "pienso", thought: true }, { text: "voy", thoughtSignature: "s" }, fc("calc", { expression: "1" }, { id: "x" }), fc("kb_search", { query: "q" })] },
        { role: "user", parts: [{ functionResponse: { id: "x", name: "calc", response: { result: { result: 1 } } } }, { functionResponse: { name: "kb_search", response: { error: "no disponible" } } }] },
        { role: "model", parts: [{ text: "listo" }] },
    ];
    const d = G.toDisplay(msgs);
    assert.equal(d.length, msgs.length);
    assert.deepEqual(d[1].content.map((b) => b.type), ["thinking", "text", "tool_use", "tool_use"]);
    assert.equal(d[1].content[2].id, "x");
    const [r1, r2] = d[2].content;
    assert.equal(r1.tool_use_id, "x");
    assert.equal(r1.is_error, false);
    assert.equal(JSON.parse(r1.content).result, 1);
    assert.equal(r2.tool_use_id, d[1].content[3].id);
    assert.equal(r2.is_error, true);
    assert.equal(r2.content, "no disponible");
    assert.equal(A.userTurnStarts(d).length, 1, "userTurnStarts de Claude también entiende la vista");
});

test("testConnection usa countTokens sin generar texto", async () => {
    const f = fakeFetch([new Response(JSON.stringify({ totalTokens: 3 }), { status: 200 })]);
    assert.equal(await G.testConnection({ apiKey: "K", model: "gemini-3.6-flash", fetch: f }), 3);
    assert.match(f.calls[0].url, /gemini-3\.6-flash:countTokens$/);
    assert.equal(f.calls[0].init.headers["x-goog-api-key"], "K");
    await assert.rejects(G.testConnection({ apiKey: "K", model: "../x", fetch: f }), /Modelo inválido/);
    await assert.rejects(G.testConnection({ apiKey: "", model: "gemini-3.6-flash", fetch: f }), /Falta la API key/);
});
