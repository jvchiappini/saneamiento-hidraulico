"use strict";
// Tests del asistente: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const req = (f) => require(path.join(ROOT, f));
const { KB, BM25, norm } = req("kb.js");
const T = req("agent-tools.js");
const A = req("agent.js");
const { DemoClient } = req("demo.js");
const calcs = { RedCalc: req("red.js"), TanqueCalc: req("tanque.js"), CloacalCalc: req("cloacal.js"), PredialCalc: req("predial.js") };
const FIX = path.join(__dirname, "fixtures", "kb");

function memStorage(init) { const m = Object.assign({}, init); return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; }
async function fixtureKB() { const kb = new KB(KB.fsReader(FIX)); await kb.load(); return kb; }
const J = (r) => JSON.parse(r.content);

/* ---------------- BM25 y kb ---------------- */
test("norm quita tildes y mayúsculas", () => {
    assert.equal(norm("Presión MÍNIMA, Ñandú"), "presion minima nandu");
});

test("BM25 ordena por relevancia y respeta el filtro", () => {
    const docs = [{ t: "velocidad en la red" }, { t: "presion minima de servicio presion" }, { t: "tanque de reserva" }];
    const ix = new BM25(docs, [["t", 1]]);
    const r = ix.search("presión");
    assert.equal(r[0].i, 1);
    assert.equal(ix.search("presion", 5, (d) => d.t.startsWith("tanque")).length, 0);
    assert.equal(ix.search("de la y").length, 0, "solo palabras vacías → sin resultados");
});

test("kb de prueba: búsqueda sin tildes, filtros, lectura y tablas", async () => {
    const kb = await fixtureKB();
    assert.equal(kb.status.available, true);
    const r = kb.search("presion minima");
    assert.equal(r[0].id, "np68-6-7");
    assert.deepEqual(r[0].pages, [14]);
    assert.equal(kb.search("bresse", { module: "tanque" })[0].id, "np68-6-17-1", "module como array");
    assert.equal(kb.search("presion", { kind: "formula" }).every((x) => x.kind === "formula"), true);
    const c = await kb.read("np68-6-7");
    assert.match(c.content, /100 kPa/);
    await assert.rejects(kb.read("../secret"), /inválido/);
    const t = await kb.table("np68-tabla-vi", "Q (l/s)=15");
    assert.equal(t.matched, 1);
    assert.deepEqual(t.table.rows[0], [15, 68]);
    assert.equal(kb.formula("bresse").formulas[0].id, "bresse");
    assert.equal(kb.formula("recalque").match, "busqueda");
    assert.equal(kb.criteriaFor("red", "presion").count, 1);
});

test("kb ausente: el estado lo dice y las herramientas devuelven error, no excepción", async () => {
    const kb = new KB(KB.fsReader(path.join(__dirname, "no-existe")));
    await kb.load();
    assert.equal(kb.status.available, false);
    assert.ok(kb.status.missing.includes("index.json"));
    const ex = T.createExecutor({ kb });
    const r = await ex.exec("kb_search", { query: "presion" });
    assert.equal(r.is_error, true);
    assert.match(r.content, /no disponible/);
    assert.equal(A.buildSystem(kb)[0].text.includes("Base de conocimiento no disponible"), true);
});

test("kb_read trunca a 3000 caracteres", async () => {
    const big = "x".repeat(5000);
    const kb = new KB(async (p) => (p === "index.json" ? JSON.stringify([{ id: "a", title: "A" }]) : p === "chunks/a.md" ? big : null));
    await kb.load();
    const r = await kb.read("a");
    assert.equal(r.truncated, true);
    assert.ok(r.content.length < 3100);
});

/* ---------------- calc ---------------- */
test("calc: precedencia, funciones y 6 cifras significativas", () => {
    assert.equal(T.evaluate("2+3*4^2"), 50);
    assert.equal(T.evaluate("-2^2"), -4);
    assert.equal(T.evaluate("2^-1"), 0.5);
    assert.equal(T.evaluate("2^3^2"), 512, "potencia asociativa a derecha");
    assert.equal(T.evaluate("log(100, 10)"), 2);
    assert.equal(T.evaluate("round(pi, 3)"), 3.142);
    assert.equal(T.sig(T.evaluate("1.3*sqrt(Q)*X^0.25", { Q: 0.18546, X: 0.5 })), 0.470772);
    assert.throws(() => T.evaluate("1,5+2"), /posición/);
    assert.throws(() => T.evaluate("1/0"), /finito/);
    assert.throws(() => T.evaluate("foo(2)"), /desconocida/);
    assert.throws(() => T.evaluate("x+1"), /no definida/);
    assert.throws(() => T.evaluate("constructor"), /no definida/);
    assert.throws(() => T.evaluate("2+"), /incompleta/);
});

test("herramienta calc devuelve 6 cifras y valida la entrada", async () => {
    const ex = T.createExecutor({});
    const r = J(await ex.exec("calc", { expression: "pi*D^2/4", vars: [{ name: "D", value: 0.45 }] }));
    assert.equal(r.result, 0.159043);
    assert.equal(r.result_es, "0,159043");
    const bad = await ex.exec("calc", { expression: 3 });
    assert.equal(bad.is_error, true);
    const extra = await ex.exec("calc", { expression: "1", otra: 1 });
    assert.equal(extra.is_error, true);
    assert.match(extra.content, /no permitida/);
});

/* ---------------- run_module con los 4 módulos ---------------- */
for (const mod of ["red", "tanque", "cloacal", "predial"]) {
    test(`run_module ${mod}: coincide con XCalc.calc y no guarda nada`, async () => {
        const st = memStorage();
        const ex = T.createExecutor({ storage: st, calcs });
        const r = await ex.exec("run_module", { module: mod });
        assert.equal(r.is_error, false, r.content);
        assert.ok(r.content.length <= T.RESULT_MAX, `resumen compacto (${r.content.length})`);
        const o = J(r);
        const X = calcs[T.MODULES[mod].calc];
        const R = X.calc(JSON.parse(JSON.stringify(X.DEF)));
        assert.equal(o.verificaciones.total, R.checks.length);
        assert.equal(o.verificaciones.cumplen, R.checks.filter((c) => c.ok).length);
        assert.equal(o.verificaciones.no_cumplen.length + o.verificaciones.advertencias.length, R.checks.filter((c) => !c.ok).length);
        assert.match(o.fuente_datos, /ejemplo/);
        assert.equal(Object.keys(st.m).length, 0, "run_module no escribe");
        assert.ok(!("memo" in o), "nunca la memoria completa");
    });
}

test("run_module usa el estado guardado y los overrides; rutas inválidas dan error", async () => {
    const X = calcs.RedCalc;
    const saved = JSON.parse(JSON.stringify(X.DEF)); saved.K1 = 1.4;
    const ex = T.createExecutor({ storage: memStorage({ "sh-red-v1": JSON.stringify(saved) }), calcs });
    const o = J(await ex.exec("run_module", { module: "red" }));
    assert.match(o.fuente_datos, /guardado/);
    const Qmd = o.resultados.find((x) => /Qmd/.test(x.k)).v;
    assert.equal(Qmd, T.sig(1.4 * saved.qMed));
    const o2 = J(await ex.exec("run_module", { module: "red", overrides: [{ path: "K1", value: "1.2" }] }));
    assert.equal(o2.resultados.find((x) => /Qmd/.test(x.k)).v, T.sig(1.2 * saved.qMed));
    const bad = await ex.exec("run_module", { module: "red", overrides: [{ path: "tank.X", value: "1" }] });
    assert.equal(bad.is_error, true);
    assert.match(bad.content, /no existe/);
    const tipo = await ex.exec("run_module", { module: "red", overrides: [{ path: "K1", value: "\"alto\"" }] });
    assert.equal(tipo.is_error, true);
    const proto = await ex.exec("run_module", { module: "red", overrides: [{ path: "__proto__.x", value: "1" }] });
    assert.equal(proto.is_error, true);
});

test("estado de otra versión: se usa el ejemplo y se avisa", async () => {
    const ex = T.createExecutor({ storage: memStorage({ "sh-tanque-v1": JSON.stringify({ __v: 1, K1: 9 }) }), calcs });
    const o = J(await ex.exec("run_module", { module: "tanque" }));
    assert.match(o.fuente_datos, /otra versión/);
});

/* ---------------- project_set con confirmación ---------------- */
test("project_set pide confirmación y solo escribe si el usuario acepta", async () => {
    const st = memStorage();
    let asked = null;
    const no = T.createExecutor({ storage: st, calcs, confirm: async (d) => { asked = d; return false; } });
    const r1 = J(await no.exec("project_set", { module: "red", patch: [{ path: "tank.D", value: "22" }] }));
    assert.equal(r1.aplicado, false);
    assert.deepEqual(asked.diff, [{ path: "tank.D", before: 20, after: 22, nuevo: false }]);
    assert.equal(st.getItem("sh-red-v1"), null);
    const si = T.createExecutor({ storage: st, calcs, confirm: async () => true });
    const r2 = J(await si.exec("project_set", { module: "red", patch: [{ path: "tank.D", value: "22" }] }));
    assert.equal(r2.aplicado, true);
    assert.equal(JSON.parse(st.getItem("sh-red-v1")).tank.D, 22);
    assert.ok(st.getItem("sh-red-sum"), "actualiza el resumen que usan tanque y cloacal");
    const ro = await si.exec("project_set", { module: "impulsion", patch: [{ path: "a", value: "1" }] });
    assert.equal(ro.is_error, true, "impulsion es de solo lectura");
});

/* ---------------- project_get, memo, checklist, open_page ---------------- */
test("project_get y module_memo (índice, grupo y paginado)", async () => {
    const ex = T.createExecutor({ storage: memStorage({ "sh-state-v1": JSON.stringify({ S: { manzanas: 10 } }) }), calcs });
    assert.equal(J(await ex.exec("project_get", { module: "impulsion" })).estado.manzanas, 10);
    assert.equal(J(await ex.exec("project_get", { module: "potabilizadora" })).guardado, false);
    const idx = J(await ex.exec("module_memo", { module: "cloacal" }));
    assert.ok(idx.grupos.length > 10);
    const g = await ex.exec("module_memo", { module: "red", group: "tanque" });
    assert.match(g.content, /\\dfrac/);
    assert.match(g.content, /página 1\//);
    const big = await ex.exec("module_memo", { module: "red", group: "5" });
    assert.ok(big.content.length <= T.RESULT_MAX + 200);
    const p2 = await ex.exec("module_memo", { module: "red", group: "5", page: 99 });
    assert.equal(p2.is_error, true);
});

test("checklist: interno sin kb, de la kb si existe, y actualización", async () => {
    const st = memStorage();
    const ex = T.createExecutor({ storage: st });
    const a = J(await ex.exec("checklist_get", {}));
    assert.match(a.fuente, /interna/);
    assert.ok((await ex.exec("checklist_update", { id: "pre-tanques", status: "hecho" })).is_error === false);
    assert.equal(J(await ex.exec("checklist_get", {})).progreso.hecho, 1);
    assert.equal((await ex.exec("checklist_update", { id: "x", status: "hecho" })).is_error, true);
    assert.equal((await ex.exec("checklist_update", { id: "pre-tanques", status: "listo" })).is_error, true);
    const kb = await fixtureKB();
    const ek = T.createExecutor({ storage: st, kb });
    const b = J(await ek.exec("checklist_get", {}));
    assert.equal(b.fuente, "kb/checklist.json");
    assert.equal(b.progreso.hecho, 1, "el estado del usuario se conserva por id");
});

test("open_page arma el enlace y valida el ancla", async () => {
    const ex = T.createExecutor({});
    assert.equal(J(await ex.exec("open_page", { page: "red", anchor: "presiones" })).url, "red.html#presiones");
    assert.equal((await ex.exec("open_page", { page: "red", anchor: "x\"><script>" })).is_error, true);
});

/* ---------------- truncado y nombres ---------------- */
test("los resultados largos se truncan a ~4000 caracteres con aviso", () => {
    const s = T.truncate("a".repeat(9000));
    assert.ok(s.startsWith("a".repeat(4000)));
    assert.match(s, /truncado: se muestran 4000 de 9000/);
    assert.equal(T.truncate("corto"), "corto");
});

test("herramienta desconocida → error; nombre con otra capitalización → se acepta", async () => {
    const ex = T.createExecutor({});
    assert.equal((await ex.exec("borrar_todo", {})).is_error, true);
    assert.equal((await ex.exec("CALC", { expression: "1+1" })).is_error, false);
});

test("definiciones: estrictas, sin claves libres y con ≤ 24 parámetros opcionales", () => {
    let optional = 0;
    const walk = (s) => {
        if (s.type === "object") {
            assert.equal(s.additionalProperties, false);
            for (const [k, v] of Object.entries(s.properties || {})) { if (!(s.required || []).includes(k)) optional++; walk(v); }
        }
        if (s.type === "array") walk(s.items);
        for (const bad of ["minimum", "maximum", "maxItems", "minLength", "maxLength", "oneOf"]) assert.ok(!(bad in s), bad);
    };
    T.TOOL_DEFS.forEach((t) => { assert.equal(t.strict, true); walk(t.input_schema); });
    assert.ok(optional <= 24, `opcionales: ${optional}`);
    const names = T.TOOL_DEFS.map((t) => t.name);
    assert.deepEqual(names, names.slice().sort(), "orden fijo alfabético (caché)");
    assert.ok(T.apiTools().every((t) => t.eager_input_streaming === true));
});

/* ---------------- bucle del agente ---------------- */
function fakeClient(script) {
    // script: array de mensajes finales; cada pedido devuelve el siguiente.
    const calls = [];
    const stream = (params, opts) => {
        calls.push(JSON.parse(JSON.stringify(params)));
        const msg = script[calls.length - 1];
        return {
            async *[Symbol.asyncIterator]() {
                if (msg instanceof Error) throw msg;
                for (const [i, b] of msg.content.entries()) {
                    yield { type: "content_block_start", index: i, content_block: b };
                    if (b.type === "text") yield { type: "content_block_delta", index: i, delta: { type: "text_delta", text: b.text } };
                    if (opts && opts.signal && opts.signal.aborted) { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
                    yield { type: "content_block_stop", index: i };
                }
            },
            finalMessage: async () => Object.assign({ usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 } }, msg),
        };
    };
    return { calls, beta: { messages: { stream, countTokens: async () => ({ input_tokens: 999999 }) } } };
}
const tu = (id, name, input) => ({ type: "tool_use", id, name, input });

test("bucle: ejecuta herramientas en paralelo, devuelve errores como tool_result y termina", async () => {
    const client = fakeClient([
        { stop_reason: "tool_use", content: [{ type: "thinking", thinking: "x", signature: "s" }, { type: "text", text: "Calculo." }, tu("t1", "calc", { expression: "2*3" }), tu("t2", "calc", { expression: "1/0" })] },
        { stop_reason: "end_turn", content: [{ type: "text", text: "Da 6." }] },
    ]);
    const conv = { system: A.buildSystem(null), messages: [{ role: "user", content: [{ type: "text", text: "hola" }] }] };
    const ag = new A.Agent({ client, executor: T.createExecutor({}), model: "claude-sonnet-5-5" });
    const r = await ag.run(conv);
    assert.equal(r.status, "done");
    assert.equal(conv.messages.length, 4);
    const res = conv.messages[2].content;
    assert.equal(res.length, 2, "todos los resultados en un solo mensaje");
    assert.equal(res[0].is_error, false);
    assert.equal(res[1].is_error, true);
    assert.equal(conv.messages[1].content[0].type, "thinking", "el razonamiento se devuelve sin tocar");
    const p = client.calls[0];
    assert.equal(p.system[0].cache_control.type, "ephemeral");
    assert.deepEqual(p.cache_control, { type: "ephemeral" });
    assert.deepEqual(p.thinking, { type: "adaptive", display: "summarized" });
    assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
    assert.equal(p.fallbacks, "default");
    assert.ok(!("temperature" in p));
    assert.deepEqual(client.calls[1].messages.slice(0, 2), client.calls[0].messages.concat([conv.messages[1]]), "historial solo agregar");
});

test("bucle: Haiku sin fallbacks; límite de iteraciones con mensaje de sistema y tool_choice none", async () => {
    const loop = { stop_reason: "tool_use", content: [tu("t", "calc", { expression: "1" })] };
    const client = fakeClient([loop, loop, { stop_reason: "end_turn", content: [{ type: "text", text: "fin" }] }]);
    const conv = { system: A.buildSystem(null), messages: [{ role: "user", content: "x" }] };
    const ag = new A.Agent({ client, executor: T.createExecutor({}), model: "claude-haiku-5-5", maxIter: 3 });
    await ag.run(conv);
    assert.ok(!("betas" in client.calls[0]) && !("fallbacks" in client.calls[0]));
    assert.deepEqual(client.calls[2].tool_choice, { type: "none" });
    const sys = client.calls[2].messages[client.calls[2].messages.length - 1];
    assert.equal(sys.role, "system");
    assert.equal(conv.messages[conv.messages.length - 1].role, "assistant");
});

test("bucle: rechazo, max_tokens con herramienta y error de API no rompen el historial", async () => {
    for (const [msg, status] of [[{ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] }, "refusal"],
    [{ stop_reason: "max_tokens", content: [tu("t", "calc", { expression: "1+" })] }, "max_tokens"],
    [Object.assign(new Error("boom"), { status: 500 }), "error"]]) {
        const conv = { system: [], messages: [{ role: "user", content: "x" }] };
        const evs = [];
        const r = await new A.Agent({ client: fakeClient([msg]), executor: T.createExecutor({}), onEvent: (e) => evs.push(e) }).run(conv);
        assert.equal(r.status, status);
        assert.equal(conv.messages.length, 1, `${status}: no se agrega una respuesta incompleta`);
        assert.ok(evs.some((e) => e.type === "notice" || e.type === "error"));
    }
});

test("bucle: detener conserva el texto parcial como respuesta del asistente", async () => {
    const ac = new AbortController(); ac.abort();
    const conv = { system: [], messages: [{ role: "user", content: "x" }] };
    const r = await new A.Agent({ client: fakeClient([{ stop_reason: "end_turn", content: [{ type: "text", text: "a medias" }] }]), executor: T.createExecutor({}) }).run(conv, { signal: ac.signal });
    assert.equal(r.status, "stopped");
    assert.match(conv.messages[1].content[0].text, /a medias[\s\S]*detenida/);
});

test("contexto: resume turnos viejos, conserva los últimos y quita el razonamiento", async () => {
    const msgs = [];
    for (let i = 0; i < 6; i++) {
        msgs.push({ role: "user", content: [{ type: "text", text: "pregunta " + i }] });
        msgs.push({ role: "assistant", content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: "respuesta " + i }] });
    }
    msgs.push({ role: "user", content: [{ type: "text", text: "nueva" }] });
    const conv = { system: A.buildSystem(null), messages: msgs, usage: { ctx: 200000, ctxAt: msgs.length } };
    const client = fakeClient([{ stop_reason: "end_turn", content: [{ type: "text", text: "- resumen" }] }]);
    const ag = new A.Agent({ client, executor: T.createExecutor({}) });
    const did = await ag.maybeCompact(conv, { threshold: 100000, projectSummary: async () => "proyecto ok" });
    assert.equal(did, true);
    assert.deepEqual(client.calls[0].tool_choice, { type: "none" });
    assert.deepEqual(client.calls[0].messages.slice(0, 6), msgs.slice(0, 6), "el pedido de resumen reutiliza el prefijo");
    assert.equal(A.userTurnStarts(conv.messages).length, A.KEEP_TURNS);
    assert.match(conv.messages[0].content[0].text, /<resumen_conversacion>[\s\S]*- resumen[\s\S]*<resumen_proyecto>[\s\S]*proyecto ok/);
    assert.ok(conv.messages.every((m) => !Array.isArray(m.content) || m.content.every((b) => b.type !== "thinking")));
    assert.equal(conv.archived.length, 6);
});

test("modo demo: recorre los escenarios con las herramientas reales", async () => {
    const st = memStorage();
    const ex = T.createExecutor({ storage: st, calcs, kb: await fixtureKB(), confirm: async () => true });
    const cases = [["Empecemos el TP", ["checklist_get", "open_page"]], ["Revisá mi red cloacal", ["run_module", "calc"]],
    ["¿Qué dice la NP 68 sobre la presión mínima?", ["kb_search", "kb_read"]], ["Cambiá el diámetro del tanque a 22 m", ["run_module", "project_set"]]];
    for (const [q, tools] of cases) {
        const conv = { system: [], messages: [{ role: "user", content: [{ type: "text", text: q }] }] };
        const r = await new A.Agent({ client: new DemoClient(), executor: ex }).run(conv);
        assert.equal(r.status, "done", q);
        const used = conv.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "tool_use").map((b) => b.name);
        assert.deepEqual(used, tools, q);
        const results = conv.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "tool_result");
        assert.ok(results.every((b) => !b.is_error), q + ": " + results.map((b) => b.content).join(" | "));
    }
    assert.equal(JSON.parse(st.getItem("sh-red-v1")).tank.D, 22);
});

/* ---------------- herramientas "de una sola vez" ---------------- */
test("module_full: datos + resultados + verificaciones + memoria completa en una llamada, sin guardar", async () => {
    for (const mod of ["red", "tanque", "cloacal", "predial"]) {
        const st = memStorage();
        const ex = T.createExecutor({ storage: st, calcs });
        const r = await ex.exec("module_full", { module: mod });
        assert.equal(r.is_error, false, r.content);
        assert.ok(r.content.length <= T.BIG_MAX.module_full, `${mod}: ${r.content.length}`);
        const o = J(r);
        assert.ok(o.datos && o.resultados && o.verificaciones && o.memoria_de_calculo, mod);
        assert.match(o.memoria_de_calculo, /\$\$/, "fórmulas en LaTeX");
        assert.equal(Object.keys(st.m).length, 0);
    }
    const ex = T.createExecutor({ storage: memStorage(), calcs });
    const o = J(await ex.exec("module_full", { module: "red", overrides: [{ path: "tank.D", value: "22" }] }));
    assert.match(o.overrides[0], /tank\.D/);
});

test("project_overview: los 4 módulos y el avance del TP en una llamada", async () => {
    const ex = T.createExecutor({ storage: memStorage(), calcs });
    const r = await ex.exec("project_overview", {});
    assert.equal(r.is_error, false, r.content);
    assert.ok(r.content.length <= T.BIG_MAX.project_overview);
    const o = J(r);
    assert.deepEqual(o.modulos.map((m) => m.modulo), ["red", "tanque", "cloacal", "predial"]);
    assert.ok(o.modulos.every((m) => m.verificaciones && m.resultados_clave.length));
    assert.ok(o.avance_tp.total && o.avance_tp.por_area);
});

test("kb_lookup: busca y devuelve los fragmentos ya leídos", async () => {
    const ex = T.createExecutor({ kb: await fixtureKB() });
    const o = J(await ex.exec("kb_lookup", { query: "presion minima", k: 2 }));
    assert.equal(o.fragmentos[0].id, "np68-6-7");
    assert.match(o.fragmentos[0].texto, /100 kPa/);
    assert.deepEqual(o.fragmentos[0].paginas, [14]);
    assert.equal((await ex.exec("kb_lookup", { query: "x", k: 9 })).is_error, true);
    assert.deepEqual(J(await ex.exec("kb_lookup", { query: "zzzzqqq" })).fragmentos, []);
});

test("calc en lote: varias cuentas en una llamada, errores indicados por posición", async () => {
    const ex = T.createExecutor({});
    const o = J(await ex.exec("calc", { expression: "2*3", vars: [], also: [{ expression: "pi*D^2/4", vars: [{ name: "D", value: 0.45 }] }, { expression: "sqrt(16)", vars: [] }] }));
    assert.equal(o.result, 6);
    assert.deepEqual(o.tambien.map((x) => x.result), [0.159043, 4]);
    const bad = await ex.exec("calc", { expression: "1", vars: [], also: [{ expression: "1/0", vars: [] }] });
    assert.equal(bad.is_error, true);
    assert.match(bad.content, /also\[0\]/);
});

test("report: informe en Markdown por módulo y global, JSON válido y dentro del presupuesto", async () => {
    const ex = T.createExecutor({ storage: memStorage(), calcs });
    for (const mod of ["red", "tanque", "cloacal", "predial"]) {
        const r = await ex.exec("report", { scope: mod });
        assert.equal(r.is_error, false, r.content);
        assert.ok(r.content.length <= T.BIG_MAX.report, `${mod}: ${r.content.length}`);
        const o = J(r);
        assert.equal(o.url, T.MODULES[mod].page + "#informe");
        assert.match(o.markdown, /^# Informe — /);
        for (const sec of ["## Datos de entrada", "## Resultados", "## Verificaciones", "## Memoria de cálculo"]) assert.ok(o.markdown.includes(sec), mod + " " + sec);
        assert.match(o.markdown, /\$\$/);
    }
    const all = J(await ex.exec("report", { scope: "todo" }));
    assert.match(all.markdown, /^# Informe del proyecto/);
    for (const m of Object.values(T.MODULES)) assert.ok(all.markdown.includes(m.title), m.title);
    assert.match(all.markdown, /Avance del trabajo práctico/);
    assert.equal((await ex.exec("report", { scope: "otro" })).is_error, true);
});
