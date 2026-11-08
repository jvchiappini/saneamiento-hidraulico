"use strict";
/* =====================================================================
   demo.js — Cliente simulado para probar la interfaz sin API key.
   Imita client.beta.messages.stream / countTokens del SDK: emite los mismos
   eventos de streaming y decide qué herramientas pedir según el mensaje del
   usuario. Las herramientas se ejecutan de verdad (en el navegador).
   ===================================================================== */
(function (root) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let seq = 0;
    const uid = (p) => `${p}_demo_${Date.now().toString(36)}${(seq++).toString(36)}`;

    function lastTurn(messages) {
        let start = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m.role !== "user") continue;
            const c = Array.isArray(m.content) ? m.content : [{ type: "text", text: m.content }];
            if (c.some((b) => b.type === "text") && !c.some((b) => b.type === "tool_result")) { start = i; break; }
        }
        const user = start >= 0 ? messages[start] : null;
        const text = user ? (Array.isArray(user.content) ? user.content : [{ type: "text", text: user.content }]).filter((b) => b.type === "text").map((b) => b.text).join("\n") : "";
        const after = messages.slice(start + 1);
        const results = [];
        after.forEach((m) => { if (m.role === "user" && Array.isArray(m.content)) m.content.forEach((b) => { if (b.type === "tool_result") results.push(b); }); });
        const calls = [];
        after.forEach((m) => { if (m.role === "assistant" && Array.isArray(m.content)) m.content.forEach((b) => { if (b.type === "tool_use") calls.push(b); }); });
        return { text, results, calls };
    }
    const parse = (r) => { try { return JSON.parse(r.content); } catch (e) { return null; } };
    const fmt = (x, d = 3) => (typeof x === "number" ? x.toLocaleString("es-AR", { maximumFractionDigits: d }) : String(x));

    // Decide la respuesta: {thinking, text, tools:[{name,input}]}
    function plan(params) {
        const { text, results, calls } = lastTurn(params.messages);
        const t = norm(text);
        const step = calls.length;
        const res = (k) => (results[k] ? parse(results[k]) : null);
        const errOf = (k) => results[k] && results[k].is_error ? results[k].content : null;
        const ctx = /<contexto_pagina[^>]*page="([a-z-]+)\.html"/.exec(text);

        if (/resumi la conversacion/.test(t)) {
            return { text: "- Se revisó el avance y los módulos de cálculo en modo demo.\n- Los resultados numéricos salieron de las herramientas (run_module y calc).\n- Pendiente: completar los ítems que siguen en el checklist." };
        }
        // Cambio de datos (project_set → confirmación del usuario)
        if (/cambia|modifica|guarda|aplica|diametro del tanque/.test(t)) {
            if (step === 0) return { thinking: "Primero pruebo el cambio sin guardar y después lo propongo.", text: "Pruebo el cambio con run_module antes de proponerlo.", tools: [{ name: "run_module", input: { module: "red", overrides: [{ path: "tank.D", value: "22" }] } }] };
            if (step === 1) {
                const r = res(0);
                return { text: r ? `Con un tanque de 22 m de diámetro la altura útil queda en **${fmt(r.resultados.find((x) => /útil/.test(x.k)).v)} m**. Te propongo guardarlo:` : "Te propongo guardar el cambio:", tools: [{ name: "project_set", input: { module: "red", patch: [{ path: "tank.D", value: "22" }] } }] };
            }
            const r = res(1);
            if (r && r.aplicado) return { text: `Listo, guardé el cambio (${r.cambios.join("; ")}). Las verificaciones quedan: **${r.verificaciones.cumplen} de ${r.verificaciones.total}** cumplen.\n\nAbrí la [red de distribución](red.html#tanque) para verlo.` };
            return { text: "No guardé nada porque rechazaste el cambio. Si querés, probamos otra alternativa con run_module." };
        }
        // Normativa → kb_search + kb_read
        if (/norma|np ?68|np ?44|que dice|segun la/.test(t)) {
            const q = text.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, "").replace(/¿|\?/g, "").replace(/qu[eé] dice la/i, "").trim() || "presion minima";
            if (step === 0) return { thinking: "Busco en la base de conocimiento antes de responder.", text: "Busco en la base de conocimiento.", tools: [{ name: "kb_search", input: { query: q, k: 3 } }] };
            if (step === 1) {
                if (errOf(0)) return { text: "**Base de conocimiento no disponible**: no pude verificar la fuente. En el modo demo, sin la carpeta `kb/`, solo puedo mostrarte cómo funcionaría la búsqueda.\n\n**Supuesto:** cuando la base esté cargada, la respuesta va a citar el fragmento como [id, p. X]." };
                const r = res(0);
                if (!r || !r.resultados.length) return { text: "No encontré fragmentos para esa consulta. Probá con otras palabras (por ejemplo «presión mínima» o «tanque de reserva»)." };
                return { text: `Encontré ${r.resultados.length} fragmento(s). Leo el más relevante.`, tools: [{ name: "kb_read", input: { id: r.resultados[0].id } }] };
            }
            const r0 = res(0), r1 = res(1), top = r0 && r0.resultados[0];
            const extract = r1 && r1.content ? r1.content.replace(/^---[\s\S]*?---\s*/, "").split(/\n\s*\n/).filter((p) => p.trim()).slice(0, 2).join("\n\n> ") : "";
            return { text: `Según la fuente:\n\n> ${extract.slice(0, 600)}\n\n[${top.id}, p. ${Array.isArray(top.pages) ? top.pages.join("–") : top.pages}]\n\n*(respuesta simulada del modo demo)*` };
        }
        // Revisión de un módulo
        const mod = ctx ? ({ red: "red", tanque: "tanque", cloacal: "cloacal", predial: "predial" }[ctx[1]] || null)
            : /cloacal/.test(t) ? "cloacal" : /tanque/.test(t) ? "tanque" : /predial|edificio/.test(t) ? "predial" : /red|hardy/.test(t) ? "red" : null;
        if (mod && /revis|verific|cumpl|mi |calculo|que falla/.test(t + " ")) {
            if (step === 0) return { thinking: `Corro el módulo ${mod} con los datos guardados.`, text: `Reviso tu cálculo de **${mod}** con los datos guardados.`, tools: [{ name: "run_module", input: { module: mod } }] };
            const r = res(0);
            if (!r) return { text: "No pude correr el módulo: " + (results[0] ? results[0].content : "sin resultado") };
            if (step === 1) {
                const v = r.resultados.find((x) => /Velocidad m[aá]xima|Velocidad en imp|Caudal m[aá]ximo horario|Caudal m[ií]nimo/.test(x.k)) || r.resultados[0];
                return { text: `Para mostrar una cuenta con la herramienta, calculo el doble de «${v.k}».`, tools: [{ name: "calc", input: { expression: "2*x", vars: [{ name: "x", value: Number(v.v) || 0 }] } }] };
            }
            const c = res(1);
            const fails = r.verificaciones.no_cumplen, warns = r.verificaciones.advertencias;
            const lines = r.resultados.slice(0, 6).map((x) => `| ${x.k} | ${fmt(x.v)} | ${x.u} |`).join("\n");
            return {
                text: `**${r.titulo}** · datos: ${r.fuente_datos}.\n\n**${r.verificaciones.cumplen} de ${r.verificaciones.total}** verificaciones cumplen.` +
                    (fails.length ? `\n\nNo cumplen:\n${fails.map((f) => `- ${f.n}: ${f.d}`).join("\n")}` : "\n\nNo hay verificaciones que fallen.") +
                    (warns.length ? `\n\nA revisar:\n${warns.map((f) => `- ${f.n}: ${f.d}`).join("\n")}` : "") +
                    `\n\n| Resultado | Valor | Unidad |\n|---|---|---|\n${lines}\n\nEjemplo de cuenta con calc:\n\\[ 2 \\cdot x = ${c ? String(c.result_es).replace(",", "{,}") : "—"} \\]\n\n*(respuesta simulada del modo demo)*`,
            };
        }
        // Empezar el TP → checklist + enlace
        if (/empec|empez|tp|trabajo practico|por donde|avance|checklist/.test(t)) {
            if (step === 0) return { thinking: "Miro el avance.", text: "Miro tu avance.", tools: [{ name: "checklist_get", input: {} }] };
            const r = res(0);
            const pend = [];
            (r && r.secciones || []).forEach((s) => (Array.isArray(s.items) ? s.items : [`sec [ ] ${s.seccion} (${s.items} ítems)`]).forEach((it) => { const m = /^(\S+) \[(.)\] (.*)$/.exec(it); if (m && m[2] !== "x" && m[2] !== "-") pend.push({ id: m[1], item: m[3], sec: s.seccion }); }));
            if (step === 1) return { text: `Llevás un **${r ? r.progreso.porcentaje : 0} %** hecho. Te dejo el enlace para empezar por lo primero que falta.`, tools: [{ name: "open_page", input: { page: "index" } }] };
            const l = res(1);
            return { text: `Lo que sigue:\n\n${pend.slice(0, 5).map((p, i) => `${i + 1}. ${p.item} *(${p.sec})*`).join("\n")}\n\nEmpezá por los **datos del barrio** en [${l ? l.titulo : "Impulsión"}](${l ? l.url : "index.html"}). Cuando lo tengas, avisame y lo marco como hecho.\n\n*(respuesta simulada del modo demo)*` };
        }
        // Cuenta suelta
        if (/calcul|cuanto|\d/.test(t) && step === 0) {
            return { text: "Hago la cuenta con la herramienta calc (diámetro de Bresse de ejemplo).", tools: [{ name: "calc", input: { expression: "1.3*sqrt(Q)*X^0.25", vars: [{ name: "Q", value: 0.18546 }, { name: "X", value: 0.5 }] } }] };
        }
        if (step >= 1 && calls[0] && calls[0].name === "calc") {
            const c = res(0);
            return { text: `\\[ D = 1{,}3\\,\\sqrt{Q}\\,X^{1/4} = 1{,}3\\cdot\\sqrt{0{,}18546}\\cdot 0{,}5^{0{,}25} = ${c ? String(c.result_es).replace(",", "{,}") : "—"}\\;\\mathrm{m} \\]\n\n*(respuesta simulada del modo demo)*` };
        }
        return {
            text: "Estás en el **modo demo**: las respuestas son simuladas, pero las herramientas (cálculos, base de conocimiento y avance) se ejecutan de verdad.\n\nProbá con:\n- «¿Por dónde empiezo?»\n- «Revisá mi red cloacal»\n- «¿Qué dice la NP 68 sobre la presión mínima?»\n- «Cambiá el diámetro del tanque a 22 m»\n\nUna fórmula de ejemplo:\n\\[ Q = \\frac{\\pi D^2}{4}\\, v \\]",
        };
    }

    class DemoStream {
        constructor(params, opts) {
            this.params = params; this.signal = opts && opts.signal;
            const p = plan(params);
            const content = [];
            if (p.thinking) content.push({ type: "thinking", thinking: p.thinking, signature: "demo" });
            if (p.text) content.push({ type: "text", text: p.text });
            (params.tool_choice && params.tool_choice.type === "none" ? [] : p.tools || []).forEach((t) => content.push({ type: "tool_use", id: uid("toolu"), name: t.name, input: t.input }));
            const inTok = Math.round(JSON.stringify([params.system, params.tools, params.messages]).length / 3.5);
            this.msg = {
                id: uid("msg"), type: "message", role: "assistant", model: params.model, content,
                stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn", stop_sequence: null, stop_details: null,
                usage: { input_tokens: 40, cache_read_input_tokens: Math.max(0, inTok - 40), cache_creation_input_tokens: 0, output_tokens: Math.round(JSON.stringify(content).length / 3.5) },
            };
        }
        async *[Symbol.asyncIterator]() {
            this.started = true;
            const chk = () => { if (this.signal && this.signal.aborted) { const e = new Error("Request was aborted."); e.name = "AbortError"; throw e; } };
            yield { type: "message_start", message: Object.assign({}, this.msg, { content: [], stop_reason: null }) };
            await sleep(250);
            for (let i = 0; i < this.msg.content.length; i++) {
                const b = this.msg.content[i];
                chk();
                const start = b.type === "text" ? { type: "text", text: "" } : b.type === "thinking" ? { type: "thinking", thinking: "", signature: "" } : { type: "tool_use", id: b.id, name: b.name, input: {} };
                yield { type: "content_block_start", index: i, content_block: start };
                const src = b.type === "text" ? b.text : b.type === "thinking" ? b.thinking : JSON.stringify(b.input);
                for (let k = 0; k < src.length; k += 7) {
                    chk();
                    await sleep(b.type === "tool_use" ? 6 : 14);
                    const piece = src.slice(k, k + 7);
                    yield { type: "content_block_delta", index: i, delta: b.type === "text" ? { type: "text_delta", text: piece } : b.type === "thinking" ? { type: "thinking_delta", thinking: piece } : { type: "input_json_delta", partial_json: piece } };
                }
                yield { type: "content_block_stop", index: i };
            }
            yield { type: "message_delta", delta: { stop_reason: this.msg.stop_reason, stop_sequence: null }, usage: { output_tokens: this.msg.usage.output_tokens } };
            yield { type: "message_stop" };
            this.finished = true;
        }
        async finalMessage() {
            if (!this.started) for await (const _ of this) { /* consumir */ }
            return this.msg;
        }
    }

    class DemoClient {
        constructor() {
            const messages = {
                stream: (params, opts) => new DemoStream(params, opts),
                countTokens: async (params) => ({ input_tokens: Math.round(JSON.stringify([params.system, params.tools, params.messages]).length / 3.5) }),
            };
            this.beta = { messages };
            this.messages = messages;
            this.demo = true;
        }
    }

    const api = { DemoClient, plan };
    root.AgentDemo = api;
    if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
