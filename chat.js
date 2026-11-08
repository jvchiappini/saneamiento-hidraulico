"use strict";
/* =====================================================================
   chat.js — Interfaz del asistente (chat.html).
   Conversaciones en IndexedDB, streaming con Markdown + LaTeX, herramientas
   como chips plegables, panel del proyecto, configuración (API key propia /
   demo) y confirmación de cambios en los datos del proyecto.
   ===================================================================== */
(function () {
    const { Agent, MODELS, DEFAULT_MODEL, buildSystem, describeError, userTurnStarts, textOf } = window.AgentCore;
    const Gem = window.GeminiCore;
    const OC = window.OpenCodeCore;
    const Tools = window.AgentTools;
    const MC = window.MC;

    const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm";
    const SET_KEY = "sh-chat-settings-v1", API_KEY = "sh-chat-apikey", GEMINI_KEY = "sh-chat-gemini-key", OC_KEY = "sh-chat-opencode-key", PJ_KEY = "sh-chat-pj-closed";
    const DEFAULTS = { mode: null, model: DEFAULT_MODEL, geminiModel: Gem.DEFAULT_MODEL, opencodeModel: OC.DEFAULT_MODEL, opencodeProxy: "", effort: "medium", maxTokens: 32000, ctxThreshold: 120000 };
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const fmtInt = (n) => Math.round(n || 0).toLocaleString("es-AR");
    const fmtK = (n) => (n >= 1000 ? (n / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " k" : fmtInt(n));

    /* ---------------- Almacenamiento local ---------------- */
    const storage = {
        getItem(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        setItem(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
        removeItem(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
    };
    let settings = Object.assign({}, DEFAULTS, (() => { try { return JSON.parse(storage.getItem(SET_KEY) || "{}"); } catch (e) { return {}; } })());
    if (!MODELS.some((m) => m.id === settings.model)) settings.model = DEFAULT_MODEL;
    if (!Gem.MODELS.some((m) => m.id === settings.geminiModel)) settings.geminiModel = Gem.DEFAULT_MODEL;
    if (!OC.MODELS.some((m) => m.id === settings.opencodeModel)) settings.opencodeModel = OC.DEFAULT_MODEL;
    if (typeof settings.opencodeProxy !== "string") settings.opencodeProxy = "";
    if (!["gemini", "key", "opencode", "demo"].includes(settings.mode)) settings.mode = null;
    // Proveedor de cada modo. Cada conversación guarda el suyo (los historiales tienen formatos distintos).
    const PROV = { gemini: "gemini", key: "claude", opencode: "opencode", demo: "demo" };
    const PROV_NAME = { gemini: "Gemini", claude: "Claude", opencode: "OpenCode Go (DeepSeek)", demo: "el modo demo" };
    const DISPLAY = { gemini: Gem, opencode: OC };
    const modeProv = () => PROV[settings.mode] || null;
    const convProv = (c) => (c && c.provider) || "claude";
    const view = (c, msgs) => (DISPLAY[convProv(c)] ? DISPLAY[convProv(c)].toDisplay(msgs) : msgs);
    const turnStartsOf = (c) => (DISPLAY[convProv(c)] ? DISPLAY[convProv(c)].userTurnStarts(c.messages) : userTurnStarts(c.messages));
    const modelOf = (prov) => (prov === "gemini" ? settings.geminiModel : prov === "opencode" ? settings.opencodeModel : settings.model);
    const describeFor = (prov, e) => (prov === "gemini" ? Gem.describeError(e) : prov === "opencode" ? OC.describeError(e) : describeError(e));
    const keyOf = (prov) => storage.getItem(prov === "gemini" ? GEMINI_KEY : prov === "opencode" ? OC_KEY : API_KEY);
    const saveSettings = () => storage.setItem(SET_KEY, JSON.stringify(settings));

    /* ---------------- IndexedDB ---------------- */
    const DB = {
        db: null, mem: new Map(), ok: false,
        async open() {
            if (!("indexedDB" in window)) return;
            try {
                this.db = await new Promise((res, rej) => {
                    const r = indexedDB.open("sh-chat", 1);
                    r.onupgradeneeded = () => r.result.createObjectStore("convs", { keyPath: "id" });
                    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
                });
                this.ok = true;
            } catch (e) { this.db = null; }
        },
        tx(mode) { return this.db.transaction("convs", mode).objectStore("convs"); },
        req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
        async all() { if (!this.db) return Array.from(this.mem.values()); return this.req(this.tx("readonly").getAll()); },
        async put(c) { const v = JSON.parse(JSON.stringify(c)); if (!this.db) { this.mem.set(v.id, v); return; } await this.req(this.tx("readwrite").put(v)); },
        async del(id) { if (!this.db) { this.mem.delete(id); return; } await this.req(this.tx("readwrite").delete(id)); },
        async clear() { if (!this.db) { this.mem.clear(); return; } await this.req(this.tx("readwrite").clear()); },
    };

    /* ---------------- Base de conocimiento, herramientas ---------------- */
    const qs = new URLSearchParams(location.search);
    const kbBase = (() => { const k = qs.get("kb"); return k && /^[A-Za-z0-9_\/-]+$/.test(k) && !k.includes("..") ? k : "kb"; })();
    const kb = new window.KBLib.KB(window.KBLib.KB.fetchReader(kbBase));
    const kbReady = kb.load().catch(() => kb.status);
    const calcs = { RedCalc: window.RedCalc, TanqueCalc: window.TanqueCalc, CloacalCalc: window.CloacalCalc, PredialCalc: window.PredialCalc };
    const executor = Tools.createExecutor({ storage, calcs, kb, confirm: (req) => askConfirm(req) });

    /* ---------------- Estado de la interfaz ---------------- */
    let convs = [];          // conversaciones (resumen para la lista)
    let conv = null;         // conversación abierta
    let busy = false, abortCtl = null, live = null;
    let pendingCtx = null;   // contexto de la página de origen (?from=)
    let searchQ = "";

    const newConv = () => ({ id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), title: "Nueva conversación", created: Date.now(), updated: Date.now(), provider: modeProv() || "claude", model: modelOf(modeProv() || "claude"), system: null, messages: [], notices: [], usage: null });

    /* =====================================================================
       Markdown + LaTeX
       ===================================================================== */
    if (window.DOMPurify) {
        window.DOMPurify.addHook("afterSanitizeAttributes", (n) => {
            if (n.tagName === "A" && n.getAttribute("href")) { n.setAttribute("target", "_blank"); n.setAttribute("rel", "noopener"); }
        });
    }
    const MATH_RE = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/g;
    function mdHTML(src) {
        const math = [];
        const s = String(src || "").replace(MATH_RE, (m) => `@@M${math.push(m) - 1}@@`);
        let html;
        if (window.marked && window.DOMPurify) html = window.DOMPurify.sanitize(window.marked.parse(s, { gfm: true, breaks: true }));
        else html = esc(s).replace(/\n/g, "<br>");
        return html.replace(/@@M(\d+)@@/g, (_, i) => esc(math[+i]));
    }
    let mjQueue = Promise.resolve();
    function typeset(el) {
        if (!el) return;
        mjQueue = mjQueue.then(async () => {
            const MJ = window.MathJax;
            if (!MJ || !MJ.startup || !MJ.startup.promise) return;
            await MJ.startup.promise;
            if (MJ.typesetClear) MJ.typesetClear([el]);
            await MJ.typesetPromise([el]);
        }).catch(() => { });
    }
    // MathJax carga async: cuando termine, tipografiar lo que ya está en pantalla.
    (function waitMJ(n) { if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) typeset($("cv-msgs")); else if (n < 60) setTimeout(() => waitMJ(n + 1), 250); })(0);

    /* =====================================================================
       Lista de conversaciones
       ===================================================================== */
    function convText(c) { return [c.title].concat(view(c, c.messages || []).map((m) => textOf(m.content))).join(" "); }
    const nrm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    function renderList() {
        const ul = $("cv-list");
        const list = convs.slice().sort((a, b) => b.updated - a.updated).filter((c) => !searchQ || nrm(convText(c)).includes(nrm(searchQ)));
        if (!list.length) { ul.innerHTML = `<li class="cv-empty">${searchQ ? "Sin resultados." : "Todavía no hay conversaciones."}</li>`; return; }
        ul.innerHTML = list.map((c) => `<li class="cv-item${conv && c.id === conv.id ? " on" : ""}" data-id="${c.id}">
            <a href="#c=${c.id}" data-open="${c.id}"${conv && c.id === conv.id ? ' aria-current="true"' : ""}><span>${esc(c.title)}</span><small>${new Date(c.updated).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</small></a>
            <button type="button" class="icon-btn" data-rename="${c.id}" aria-label="Renombrar «${esc(c.title)}»" title="Renombrar">✎</button>
            <button type="button" class="icon-btn" data-del="${c.id}" aria-label="Borrar «${esc(c.title)}»" title="Borrar">🗑</button></li>`).join("");
    }
    $("cv-list").addEventListener("click", async (e) => {
        const o = e.target.closest("[data-open]"), r = e.target.closest("[data-rename]"), d = e.target.closest("[data-del]");
        if (o) { e.preventDefault(); if (busy) return; await openConv(o.dataset.open); closeDrawers(); }
        if (r) startRename(r.dataset.rename);
        if (d) {
            const c = convs.find((x) => x.id === d.dataset.del);
            if (!c || !confirm(`¿Borrar la conversación «${c.title}»?`)) return;
            if (busy && conv && conv.id === c.id) return;
            await DB.del(c.id); convs = convs.filter((x) => x.id !== c.id);
            if (conv && conv.id === c.id) { conv = null; renderConv(); }
            renderList();
        }
    });
    function startRename(id) {
        const c = convs.find((x) => x.id === id); if (!c) return;
        const li = $("cv-list").querySelector(`[data-id="${id}"]`);
        li.innerHTML = `<label class="sr-only" for="rn-${id}">Nuevo nombre</label><input id="rn-${id}" value="${esc(c.title)}" maxlength="120">`;
        const inp = li.querySelector("input"); inp.focus(); inp.select();
        let done = false;
        const fin = async (save) => {
            if (done) return; done = true;
            const v = inp.value.trim();
            if (save && v) { c.title = v; if (conv && conv.id === id) { conv.title = v; $("cv-title").textContent = v; } await DB.put(conv && conv.id === id ? conv : c); }
            renderList();
        };
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") fin(true); if (e.key === "Escape") fin(false); });
        inp.addEventListener("blur", () => fin(true));
    }
    $("cv-search").addEventListener("input", (e) => { searchQ = e.target.value; renderList(); });
    $("btn-new").addEventListener("click", () => { if (busy) return; conv = null; pendingCtx = null; renderCtxChip(); renderConv(); renderList(); closeDrawers(); $("prompt").focus(); history.replaceState(null, "", location.pathname + location.search); });

    async function openConv(id) {
        const c = convs.find((x) => x.id === id);
        if (!c) return;
        conv = c; pendingCtx = null; renderCtxChip();
        history.replaceState(null, "", "#c=" + id);
        renderConv(); renderList();
    }
    async function persist() {
        if (!conv || !conv.messages.length) return;
        conv.updated = Date.now();
        if (!convs.includes(conv)) convs.push(conv);
        try { await DB.put(conv); } catch (e) { notice("No se pudo guardar la conversación en este navegador.", "warn"); }
        renderList();
    }

    /* =====================================================================
       Render de una conversación
       ===================================================================== */
    const blocks = (m) => (Array.isArray(m.content) ? m.content : [{ type: "text", text: String(m.content || "") }]);
    const TOOL_ICON = { calc: "∑", run_module: "▶", module_full: "▣", project_overview: "◫", kb_lookup: "⌕", module_memo: "≡", project_get: "⌕", project_set: "✎", kb_search: "⌕", kb_read: "¶", kb_table: "▦", kb_formula: "ƒ", kb_criteria: "✓", checklist_get: "☑", checklist_update: "☑", open_page: "↗", report: "▤" };
    const argLine = (name, input) => {
        if (!input) return "";
        if (name === "calc") return input.expression || "";
        if (name === "kb_search" || name === "kb_lookup") return input.query || "";
        if (input.module) return input.module + (input.group ? " · " + input.group : "") + (input.overrides && input.overrides.length ? ` · ${input.overrides.length} override(s)` : "") + (input.patch ? ` · ${input.patch.length} cambio(s)` : "");
        return input.id || input.page || input.query || "";
    };
    function prettyResult(s) { try { return JSON.stringify(JSON.parse(s), null, 2); } catch (e) { return String(s); } }

    function toolChip(name, id) {
        const d = document.createElement("details");
        d.className = "tool"; d.dataset.tool = id || "";
        d.innerHTML = `<summary><span class="tool-ico" aria-hidden="true">${TOOL_ICON[name] || "⚙"}</span><span class="tool-name">${esc(name)}</span><span class="tool-arg"></span><span class="tool-st run">preparando…</span></summary>
            <div class="tool-body"><h5>Entrada</h5><pre class="tool-in"></pre><h5>Resultado</h5><pre class="tool-out">—</pre></div>`;
        return d;
    }
    function fillChip(d, name, input, result) {
        d.querySelector(".tool-arg").textContent = argLine(name, input);
        d.querySelector(".tool-in").textContent = input ? JSON.stringify(input, null, 2) : "";
        const st = d.querySelector(".tool-st");
        if (!result) { st.className = "tool-st run"; st.textContent = "sin resultado"; return; }
        const err = !!result.is_error;
        st.className = "tool-st " + (err ? "err" : "ok"); st.textContent = err ? "✕ error" : "✓ listo";
        const content = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
        d.querySelector(".tool-out").textContent = prettyResult(content);
        if ((name === "open_page" || name === "report") && !err) {
            try {
                const o = JSON.parse(content);
                if (!d.nextElementSibling || !d.nextElementSibling.classList.contains("tool-link")) {
                    const box = document.createElement("div"); box.className = "tool-link";
                    if (o.url) {
                        const a = document.createElement("a"); a.className = "btn-sm"; a.href = o.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = (name === "report" ? "Imprimir / PDF: " : "Abrir ") + o.titulo + " ↗";
                        box.appendChild(a);
                    }
                    if (name === "report" && o.markdown) {
                        const b = document.createElement("button"); b.type = "button"; b.className = "btn-sm"; b.textContent = "Descargar informe (.md)";
                        b.addEventListener("click", () => {
                            const url = URL.createObjectURL(new Blob([o.markdown], { type: "text/markdown;charset=utf-8" }));
                            const a = document.createElement("a"); a.href = url; a.download = (o.titulo || "informe").replace(/[^w-]+/g, "_") + ".md"; a.click();
                            setTimeout(() => URL.revokeObjectURL(url), 2000);
                        });
                        box.appendChild(b);
                    }
                    d.after(box);
                }
            } catch (e) { /* noop */ }
        }
    }
    function thinkEl(text, streaming) {
        const d = document.createElement("details"); d.className = "think";
        d.innerHTML = `<summary>${streaming ? "Razonando…" : "Razonamiento"}</summary><div class="think-body"></div>`;
        d.querySelector(".think-body").textContent = text || "";
        return d;
    }
    function asstGroup() {
        const g = document.createElement("div"); g.className = "msg msg-asst";
        g.innerHTML = `<div class="who">Asistente</div><div class="asst-body"></div>`;
        return g;
    }
    function noticeEl(text, level) { const d = document.createElement("div"); d.className = "notice " + (level || ""); d.setAttribute("role", level === "error" ? "alert" : "status"); d.textContent = text; return d; }

    function userEl(m) {
        const wrap = document.createElement("div"); wrap.className = "msg msg-user";
        let typed = [];
        blocks(m).forEach((b) => {
            if (b.type !== "text") return;
            const t = b.text || "";
            const sum = /^<resumen_conversacion>([\s\S]*?)<\/resumen_conversacion>(?:\s*<resumen_proyecto>([\s\S]*?)<\/resumen_proyecto>)?/.exec(t);
            const ctx = /^<contexto_pagina[^>]*>([\s\S]*?)<\/contexto_pagina>/.exec(t);
            if (sum) {
                const d = document.createElement("details"); d.className = "ctx-sum";
                d.innerHTML = `<summary>Resumen del contexto anterior</summary><div class="md">${mdHTML(sum[1] + (sum[2] ? "\n\n**Proyecto:**\n\n" + sum[2] : ""))}</div>`;
                wrap.appendChild(d);
            } else if (ctx) {
                const d = document.createElement("details"); d.className = "ctx-sum";
                const title = (/«([^»]+)»/.exec(ctx[1]) || [])[1] || "página de cálculo";
                d.innerHTML = `<summary>Contexto: ${esc(title)}</summary><pre class="tool-out" style="white-space:pre-wrap;font-size:.74rem">${esc(ctx[1].trim()).slice(0, 4000)}</pre>`;
                wrap.appendChild(d);
            } else typed.push(t);
        });
        if (typed.length) { const b = document.createElement("div"); b.className = "bubble"; b.textContent = typed.join("\n"); wrap.appendChild(b); }
        return wrap;
    }

    function renderMessages(root, messages, notices) {
        const results = {};
        messages.forEach((m) => { if (m.role === "user") blocks(m).forEach((b) => { if (b.type === "tool_result") results[b.tool_use_id] = b; }); });
        let g = null; const groups = [];
        const putNotice = (n) => (g ? g.querySelector(".asst-body") : root).appendChild(noticeEl(n.text, n.level));
        messages.forEach((m, i) => {
            (notices || []).filter((n) => n.at === i).forEach(putNotice);
            if (m.role === "user") {
                const bs = blocks(m);
                if (bs.length && bs.every((b) => b.type === "tool_result")) return;
                g = null; root.appendChild(userEl(m)); return;
            }
            if (m.role !== "assistant") return;
            if (!g) { g = asstGroup(); g.dataset.from = i; root.appendChild(g); groups.push(g); }
            const body = g.querySelector(".asst-body");
            blocks(m).forEach((b) => {
                if (b.type === "thinking" && b.thinking) body.appendChild(thinkEl(b.thinking));
                else if (b.type === "text" && b.text) { const d = document.createElement("div"); d.className = "md"; d.dataset.src = b.text; d.innerHTML = mdHTML(b.text); body.appendChild(d); }
                else if (b.type === "tool_use") { const c = toolChip(b.name, b.id); body.appendChild(c); fillChip(c, b.name, b.input, results[b.id]); }
                else if (b.type === "fallback") body.appendChild(noticeEl(`Respondió ${b.to && b.to.model ? b.to.model : "otro modelo"} (el modelo elegido no pudo responder este pedido).`, "info"));
            });
        });
        (notices || []).filter((n) => n.at >= messages.length).forEach(putNotice);
        return groups;
    }

    function renderConv() {
        const root = $("cv-msgs");
        root.innerHTML = "";
        $("cv-title").textContent = conv ? conv.title : "Asistente de Saneamiento Hidráulico";
        updateProvNote();
        if (!conv || (!conv.messages.length && !(conv.archived || []).length)) { renderWelcome(root); updateMeter(); return; }
        if (conv.archived && conv.archived.length) {
            const d = document.createElement("details"); d.className = "archived";
            d.innerHTML = `<summary class="divider">${conv.archived.length} mensajes anteriores (ya resumidos)</summary>`;
            renderMessages(d, view(conv, conv.archived), []);
            root.appendChild(d);
            const dv = document.createElement("div"); dv.className = "divider"; dv.textContent = "Contexto resumido"; root.appendChild(dv);
        }
        const groups = renderMessages(root, view(conv, conv.messages), conv.notices);
        groups.forEach((g, k) => {
            const a = document.createElement("div"); a.className = "msg-actions";
            a.innerHTML = `<button type="button" data-copy>Copiar</button>` + (k === groups.length - 1 ? `<button type="button" data-regen>Regenerar</button>` : "");
            g.appendChild(a);
        });
        typeset(root);
        updateMeter();
        scrollBottom(true);
    }
    $("cv-msgs").addEventListener("click", async (e) => {
        const cp = e.target.closest("[data-copy]"), rg = e.target.closest("[data-regen]"), sg = e.target.closest("[data-sugg]"), st = e.target.closest("[data-setup]");
        if (cp) {
            const g = cp.closest(".msg-asst");
            const txt = Array.from(g.querySelectorAll(".md")).map((d) => d.dataset.src || d.textContent).join("\n\n");
            try { await navigator.clipboard.writeText(txt); cp.textContent = "Copiado ✓"; } catch (err) { cp.textContent = "No se pudo copiar"; }
            setTimeout(() => { cp.textContent = "Copiar"; }, 1500);
        }
        if (rg && !busy) regenerate();
        if (sg) { const t = sg.dataset.sugg; if (sg.dataset.fill) { setPrompt(t); $("prompt").focus(); } else send(t); }
        if (st) { if (st.dataset.setup === "demo") { settings.mode = "demo"; saveSettings(); updateModeChip(); renderConv(); } else openSettings(); }
    });

    function renderWelcome(root) {
        const configured = !!settings.mode;
        const kst = kb.loaded ? (kb.status.available ? `Base de conocimiento: ${kb.status.counts.chunks} fragmentos.` : "Base de conocimiento no disponible: el asistente responde sin poder citar las normas.") : "Cargando base de conocimiento…";
        root.innerHTML = `<section class="welcome">
            <h2>Asistente de Saneamiento Hidráulico</h2>
            <p>Te ayudo con el saneamiento público y predial usando tus datos guardados, los cálculos de la web y las normas.</p>
            <p class="kb-st">${esc(kst)}</p>
            ${configured ? "" : `<div class="setup-banner">Para empezar, cargá una API key: la de <b>Gemini</b> es gratuita (con límites) y se saca en un minuto en Google AI Studio. También podés usar la de Anthropic (Claude) o probar la interfaz en modo demo.
                <button type="button" class="btn-primary" data-setup="cfg">Configurar</button><button type="button" class="btn-sm" data-setup="demo">Usar modo demo</button></div>`}
            <div class="sugg">
                <button type="button" data-sugg="¿Por dónde empiezo y qué me falta?"><b>¿Por dónde empiezo?</b><small>Revisa tu avance y te dice por dónde seguir.</small></button>
                <button type="button" data-sugg="Revisá mi red cloacal: ¿qué verificaciones no cumplen y cómo las corrijo?"><b>Revisá mi red cloacal</b><small>Corre el cálculo con tus datos y explica las verificaciones.</small></button>
                <button type="button" data-sugg="¿Qué dice la NP 68 sobre " data-fill="1"><b>¿Qué dice la NP 68 sobre…?</b><small>Busca en la norma y cita la página.</small></button>
                <button type="button" data-sugg="Revisá mi instalación de agua del edificio (predial) y explicame la verificación que falla."><b>Revisá mi predial</b><small>Acometida, tanques, bombas e incendio.</small></button>
            </div></section>`;
    }

    /* =====================================================================
       Streaming en vivo
       ===================================================================== */
    function nearBottom() { const s = $("cv-scroll"); return s.scrollHeight - s.scrollTop - s.clientHeight < 140; }
    function scrollBottom(force) { const s = $("cv-scroll"); if (force || live && live.stick) s.scrollTop = s.scrollHeight; }
    $("cv-scroll").addEventListener("scroll", () => { if (live) live.stick = nearBottom(); }, { passive: true });

    function startLive() {
        const g = asstGroup();
        $("cv-msgs").appendChild(g);
        live = { g, body: g.querySelector(".asst-body"), segs: new Map(), chips: new Map(), stick: true, pending: null };
        const dots = document.createElement("div"); dots.className = "md cursor"; dots.dataset.wait = "1"; live.body.appendChild(dots);
        scrollBottom(true);
    }
    function dropWait() { const w = live && live.body.querySelector("[data-wait]"); if (w) w.remove(); }
    function renderSeg(seg) {
        if (seg.raf) return;
        seg.raf = requestAnimationFrame(() => { seg.raf = 0; seg.el.innerHTML = mdHTML(seg.text); scrollBottom(); });
    }
    function onEvent(e) {
        if (!live) return;
        const key = `${e.iter}:${e.index}`;
        switch (e.type) {
            case "block_start": {
                dropWait();
                const b = e.block;
                if (b.type === "text") { const el = document.createElement("div"); el.className = "md cursor"; live.body.appendChild(el); live.segs.set(key, { type: "text", el, text: "" }); }
                else if (b.type === "thinking") { const el = thinkEl("", true); live.body.appendChild(el); live.segs.set(key, { type: "thinking", el, text: "" }); }
                else if (b.type === "tool_use") { const el = toolChip(b.name, b.id); el.querySelector(".tool-arg").textContent = "…"; live.body.appendChild(el); live.segs.set(key, { type: "tool", el, text: "", name: b.name }); live.chips.set(b.id, el); announce(`Herramienta: ${b.name}`); }
                scrollBottom();
                break;
            }
            case "text": { const s = live.segs.get(key); if (s) { s.text += e.text; renderSeg(s); } break; }
            case "thinking": { const s = live.segs.get(key); if (s) { s.text += e.text; s.el.querySelector(".think-body").textContent = s.text; } break; }
            case "tool_input": { const s = live.segs.get(key); if (s) { s.text += e.partial; s.el.querySelector(".tool-in").textContent = s.text; } break; }
            case "block_stop": {
                const s = live.segs.get(key); if (!s) break;
                if (s.type === "text") { s.el.classList.remove("cursor"); s.el.innerHTML = mdHTML(s.text); s.el.dataset.src = s.text; typeset(s.el); }
                if (s.type === "thinking") { if (!s.text.trim()) s.el.remove(); else s.el.querySelector("summary").textContent = "Razonamiento"; }
                if (s.type === "tool") s.el.querySelector(".tool-st").textContent = "en cola…";
                break;
            }
            case "tool_run": { const c = live.chips.get(e.id); if (c) { c._input = e.input; c.querySelector(".tool-st").textContent = "ejecutando…"; c.querySelector(".tool-arg").textContent = argLine(e.name, e.input); c.querySelector(".tool-in").textContent = JSON.stringify(e.input, null, 2); } break; }
            case "tool_result": {
                const c = live.chips.get(e.id); if (c) fillChip(c, e.name, c._input, e.result);
                if (["run_module", "module_full", "project_overview", "project_set", "checklist_update", "checklist_get"].includes(e.name)) renderProject();
                const w = document.createElement("div"); w.className = "md cursor"; w.dataset.wait = "1"; live.body.appendChild(w);
                scrollBottom();
                break;
            }
            case "notice": case "error": {
                dropWait();
                const level = e.type === "error" ? "error" : e.level;
                if (conv) conv.notices = (conv.notices || []).concat([{ at: conv.messages.length, level, text: e.text }]);
                live.body.appendChild(noticeEl(e.text, level)); scrollBottom();
                break;
            }
            case "usage": updateMeter(); break;
            case "compacted": announce("Se resumió el contexto anterior."); break;
        }
    }
    function announce(t) { $("sr-status").textContent = t; }

    /* =====================================================================
       Enviar, detener, regenerar
       ===================================================================== */
    // Cliente del proveedor: Claude usa el SDK oficial (CDN); Gemini va por fetch directo (sin cliente); la demo es simulada.
    async function getClient(prov) {
        if (prov === "demo") return new window.AgentDemo.DemoClient();
        if (prov === "gemini") { if (!keyOf("gemini")) throw new Error("Falta la API key de Gemini: cargala en Configuración."); return null; }
        if (prov === "opencode") { if (!keyOf("opencode")) throw new Error("Falta la API key de OpenCode Go: cargala en Configuración."); if (!settings.opencodeProxy) throw new Error("Falta la URL del proxy de OpenCode Go: cargala en Configuración."); return null; }
        let mod;
        try { mod = await import(SDK_URL); } catch (e) { throw new Error("No se pudo cargar el SDK de Anthropic desde el CDN (¿sin conexión?)."); }
        const Anthropic = mod.default || mod.Anthropic;
        const key = keyOf("claude");
        if (!key) throw new Error("Falta la API key de Anthropic: cargala en Configuración.");
        return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
    }
    function makeAgent(prov, client) {
        if (prov === "opencode") return new OC.OpenCodeAgent({ apiKey: keyOf("opencode"), proxy: settings.opencodeProxy, executor, model: settings.opencodeModel, maxTokens: settings.maxTokens, onEvent });
        if (prov === "gemini") return new Gem.GeminiAgent({ apiKey: keyOf("gemini"), executor, model: settings.geminiModel, maxTokens: settings.maxTokens, effort: settings.effort, onEvent });
        return new Agent({ client, executor, model: settings.model, maxTokens: settings.maxTokens, effort: settings.effort, onEvent, useFallbacks: prov !== "demo" });
    }
    function setBusy(b) {
        busy = b;
        $("btn-send").hidden = b; $("btn-stop").hidden = !b;
        document.querySelectorAll(".msg-actions [data-regen]").forEach((x) => { x.disabled = b; });
        $("cv-msgs").setAttribute("aria-busy", b ? "true" : "false");
    }

    async function contextBlock(ctx) {
        let data;
        try {
            data = Tools.MODULES[ctx.module] ? executor.summary(ctx.module) : JSON.parse((await executor.exec("project_get", { module: ctx.module })).content);
        } catch (e) { data = { error: e.message }; }
        const json = JSON.stringify(data);
        return `<contexto_pagina page="${ctx.file}">El usuario abrió el asistente desde la página «${ctx.title}». Datos actuales de esa página (resumen, JSON):\n${json.length > 3500 ? json.slice(0, 3500) + " …[recortado]" : json}\n</contexto_pagina>`;
    }

    async function send(text) {
        text = String(text || "").trim();
        if (!text || busy) return;
        // Una conversación se queda con su proveedor; solo las nuevas usan el que está elegido ahora.
        const prov = conv ? convProv(conv) : modeProv();
        if (!prov) { openSettings(); return; }
        let client;
        try { client = await getClient(prov); } catch (e) { notice(e.message, "error"); openSettings(); return; }
        if (!conv) conv = newConv();
        if (!conv.system) { await kbReady; conv.system = buildSystem(kb); }
        const content = [];
        if (pendingCtx) { content.push({ type: "text", text: await contextBlock(pendingCtx) }); pendingCtx = null; renderCtxChip(); }
        content.push({ type: "text", text });
        conv.messages.push(prov === "gemini" ? { role: "user", parts: content.map((b) => ({ text: b.text })) } : prov === "opencode" ? { role: "user", content: content.map((b) => b.text).join("\n\n") } : { role: "user", content });
        if (conv.title === "Nueva conversación") conv.title = text.replace(/\s+/g, " ").slice(0, 60) + (text.length > 60 ? "…" : "");
        setPrompt("");
        await persist();
        await runAgent(prov, client, true);
    }
    async function runAgent(prov, client, compact) {
        conv.model = modelOf(prov);
        renderConv(); startLive(); setBusy(true);
        abortCtl = new AbortController();
        const agent = makeAgent(prov, client);
        try {
            if (compact) await agent.maybeCompact(conv, { threshold: settings.ctxThreshold, signal: abortCtl.signal, projectSummary });
            await agent.run(conv, { signal: abortCtl.signal });
        } catch (e) {
            conv.notices = (conv.notices || []).concat([{ at: conv.messages.length, level: "error", text: describeFor(prov, e) }]);
        } finally {
            live = null; abortCtl = null; setBusy(false);
            await persist(); renderConv(); renderProject();
            announce("Respuesta completa.");
        }
    }
    async function regenerate() {
        if (!conv || busy) return;
        const starts = turnStartsOf(conv);
        if (!starts.length) return;
        const s = starts[starts.length - 1];
        // Se descarta solo la cola (la respuesta del último turno); el historial anterior queda igual.
        conv.messages = conv.messages.slice(0, s + 1);
        conv.notices = (conv.notices || []).filter((n) => n.at <= s);
        const prov = convProv(conv);
        let client;
        try { client = await getClient(prov); } catch (e) { notice(e.message, "error"); return; }
        await runAgent(prov, client, false);
    }
    $("btn-stop").addEventListener("click", () => { if (abortCtl) abortCtl.abort(); });

    // Resumen fijo del proyecto (para el resumen de contexto)
    async function projectSummary() {
        const lines = [];
        for (const m of Object.keys(Tools.MODULES)) {
            try {
                const s = executor.summary(m);
                lines.push(`${s.titulo}: ${s.verificaciones.cumplen}/${s.verificaciones.total} verificaciones cumplen` + (s.verificaciones.no_cumplen.length ? `; no cumplen: ${s.verificaciones.no_cumplen.map((x) => x.n).join("; ")}` : "") + `. Clave: ${s.resultados.slice(0, 4).map((r) => `${r.k} = ${r.v} ${r.u}`).join(", ")}.`);
            } catch (e) { /* módulo no disponible */ }
        }
        try { const ck = JSON.parse((await executor.exec("checklist_get", {})).content); lines.push(`Avance: ${ck.progreso.porcentaje} % (${ck.progreso.hecho} hechos, ${ck.progreso.en_progreso} en progreso).`); } catch (e) { /* noop */ }
        return lines.join("\n");
    }

    /* ---------------- Compositor ---------------- */
    const ta = $("prompt");
    function setPrompt(t) { ta.value = t; autosize(); }
    function autosize() { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 220) + "px"; ta.style.overflowY = ta.scrollHeight > 220 ? "auto" : "hidden"; }
    ta.addEventListener("input", autosize);
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("composer").requestSubmit(); } });
    $("composer").addEventListener("submit", (e) => { e.preventDefault(); send(ta.value); });
    function notice(text, level) { $("cv-msgs").appendChild(noticeEl(text, level)); scrollBottom(true); }

    function renderCtxChip() {
        const c = $("ctx-chip");
        if (!pendingCtx) { c.hidden = true; c.innerHTML = ""; return; }
        c.hidden = false;
        c.innerHTML = `Contexto: ${esc(pendingCtx.title)} <button type="button" aria-label="Quitar el contexto de la página">✕</button>`;
        c.querySelector("button").addEventListener("click", () => { pendingCtx = null; renderCtxChip(); });
    }

    /* ---------------- Medidor de contexto ---------------- */
    function updateMeter() {
        const m = $("ctx-meter");
        if (!conv || !conv.messages.length) { $("ctx-fill").style.width = "0"; $("ctx-label").textContent = "0 tokens"; m.title = "Uso de contexto"; m.classList.remove("warn"); return; }
        const ag = makeAgent(convProv(conv), null);
        const est = conv.system ? ag.estimate(conv) : { tokens: 0, exact: false };
        const thr = settings.ctxThreshold;
        const pct = Math.min(100, 100 * est.tokens / thr);
        $("ctx-fill").style.width = pct + "%";
        m.classList.toggle("warn", pct > 80);
        $("ctx-label").textContent = `${est.exact ? "" : "≈ "}${fmtK(est.tokens)} / ${fmtK(thr)}`;
        const U = conv.usage || {};
        m.title = `Contexto: ${est.exact ? "" : "≈ "}${fmtInt(est.tokens)} tokens. Al pasar ${fmtInt(thr)} se resumen los turnos viejos.\n` +
            (U.requests ? `Total de la conversación: ${U.requests} pedidos · entrada ${fmtInt(U.input)} · caché leída ${fmtInt(U.cacheRead)} · caché escrita ${fmtInt(U.cacheWrite)} · salida ${fmtInt(U.output)} tokens.` : "");
    }

    /* =====================================================================
       Configuración
       ===================================================================== */
    const dlgS = $("dlg-settings");
    const modeOf = () => (dlgS.querySelector('input[name="mode"]:checked') || {}).value || "gemini";
    // El selector de modelo cambia con el proveedor (Gemini o Claude; la demo imita a Claude).
    function fillModels(mode, selected) {
        const list = mode === "gemini" ? Gem.MODELS : mode === "opencode" ? OC.MODELS : MODELS;
        $("set-model").innerHTML = list.map((m) => `<option value="${m.id}">${esc(m.name)} — ${esc(m.desc)}</option>`).join("");
        $("set-model").value = selected || modelOf(PROV[mode]);
    }
    function syncModeFields() {
        const mode = modeOf();
        $("set-gkey").hidden = mode !== "gemini";
        $("set-key").hidden = mode !== "key";
        $("set-okey").hidden = mode !== "opencode";
        $("set-model-wrap").hidden = mode === "demo";
        fillModels(mode);
    }
    function openSettings() {
        const mode = settings.mode || "gemini";
        dlgS.querySelectorAll('input[name="mode"]').forEach((r) => { r.checked = r.value === mode; });
        $("set-gapikey").value = keyOf("gemini") || "";
        $("set-apikey").value = keyOf("claude") || "";
        $("set-oapikey").value = keyOf("opencode") || ""; $("set-oproxy").value = settings.opencodeProxy || "";
        $("set-effort").value = settings.effort;
        $("set-maxtok").value = settings.maxTokens; $("set-ctx").value = settings.ctxThreshold;
        $("set-test-out").textContent = "";
        syncModeFields();
        dlgS.showModal();
    }
    dlgS.addEventListener("change", (e) => { if (e.target.name === "mode") syncModeFields(); });
    const toggleKey = (btnId, inputId) => $(btnId).addEventListener("click", (e) => { const i = $(inputId); const show = i.type === "password"; i.type = show ? "text" : "password"; e.target.textContent = show ? "Ocultar" : "Ver"; e.target.setAttribute("aria-pressed", String(show)); });
    toggleKey("set-showkey", "set-apikey"); toggleKey("set-gshowkey", "set-gapikey"); toggleKey("set-oshowkey", "set-oapikey");
    function readForm() {
        const clamp = (v, lo, hi, d) => { v = parseInt(v, 10); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
        const mode = modeOf();
        const f = {
            mode, effort: $("set-effort").value,
            maxTokens: clamp($("set-maxtok").value, 1000, mode === "gemini" ? 65536 : 128000, DEFAULTS.maxTokens), ctxThreshold: clamp($("set-ctx").value, 20000, 900000, DEFAULTS.ctxThreshold),
        };
        if (mode === "gemini") f.geminiModel = $("set-model").value; else if (mode === "key") f.model = $("set-model").value;
        else if (mode === "opencode") { f.opencodeModel = $("set-model").value; f.opencodeProxy = $("set-oproxy").value.trim(); }
        return f;
    }
    dlgS.addEventListener("close", () => {
        if (dlgS.returnValue !== "ok") return;
        const f = readForm();
        Object.assign(settings, f); saveSettings();
        const gkey = $("set-gapikey").value.trim(), key = $("set-apikey").value.trim();
        if (f.mode === "gemini" && gkey) storage.setItem(GEMINI_KEY, gkey);
        if (f.mode === "key" && key) storage.setItem(API_KEY, key);
        const okey = $("set-oapikey").value.trim();
        if (f.mode === "opencode" && okey) storage.setItem(OC_KEY, okey);
        updateModeChip(); updateMeter(); updateProvNote();
        if (!conv) renderConv();
    });
    $("btn-settings").addEventListener("click", openSettings);
    $("set-test").addEventListener("click", async () => {
        const out = $("set-test-out"); out.textContent = "Probando…";
        const f = readForm();
        try {
            if (f.mode === "demo") { out.textContent = "✓ Modo demo: no necesita conexión."; return; }
            if (f.mode === "gemini") {
                const key = $("set-gapikey").value.trim();
                if (!key) { out.textContent = "✕ Falta la API key de Gemini."; return; }
                // countTokens: verifica key, CORS y modelo sin generar texto.
                const n = await Gem.testConnection({ apiKey: key, model: f.geminiModel });
                out.textContent = `✓ Conexión correcta (${Gem.modelInfo(f.geminiModel).name}; ${n} tokens de prueba).`;
                return;
            }
            if (f.mode === "opencode") {
                const okey = $("set-oapikey").value.trim();
                if (!okey) { out.textContent = "✕ Falta la API key de OpenCode Go."; return; }
                const n = await OC.testConnection({ apiKey: okey, proxy: f.opencodeProxy, model: f.opencodeModel });
                out.textContent = `✓ Proxy y modelo correctos (${OC.modelInfo(f.opencodeModel).name}; ${n} modelos disponibles). La key se valida con el primer mensaje.`;
                return;
            }
            const key = $("set-apikey").value.trim();
            if (!key) { out.textContent = "✕ Falta la API key de Anthropic."; return; }
            const mod = await import(SDK_URL).catch(() => { throw new Error("No se pudo cargar el SDK de Anthropic desde el CDN (¿sin conexión?)."); });
            const client = new (mod.default || mod.Anthropic)({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
            const r = await client.beta.messages.countTokens({ model: f.model, messages: [{ role: "user", content: "Hola" }] });
            out.textContent = `✓ Conexión correcta (${MODELS.find((m) => m.id === f.model).name}; ${r.input_tokens} tokens de prueba).`;
        } catch (e) { out.textContent = "✕ " + (f.mode === "gemini" ? Gem.describeError(e) : f.mode === "opencode" ? OC.describeError(e) : describeError(e)); }
    });
    $("set-delkey").addEventListener("click", () => { storage.removeItem(API_KEY); $("set-apikey").value = ""; $("set-test-out").textContent = "API key de Anthropic borrada de este navegador."; });
    $("set-odelkey").addEventListener("click", () => { storage.removeItem(OC_KEY); $("set-oapikey").value = ""; $("set-test-out").textContent = "API key de OpenCode Go borrada de este navegador."; });
    $("set-gdelkey").addEventListener("click", () => { storage.removeItem(GEMINI_KEY); $("set-gapikey").value = ""; $("set-test-out").textContent = "API key de Gemini borrada de este navegador."; });
    $("set-delall").addEventListener("click", async () => {
        if (!confirm("¿Borrar todas las conversaciones, la configuración, las API keys y el avance del checklist guardado por el asistente? Los datos de las páginas de cálculo no se tocan.")) return;
        await DB.clear(); convs = []; conv = null;
        [SET_KEY, API_KEY, GEMINI_KEY, OC_KEY, PJ_KEY, Tools.CK_KEY].forEach((k) => storage.removeItem(k));
        settings = Object.assign({}, DEFAULTS);
        dlgS.close("cancel");
        updateModeChip(); renderList(); renderConv(); renderProject();
    });
    function updateModeChip() {
        const c = $("chip-mode");
        const m = settings.mode === "gemini" ? Gem.modelInfo(settings.geminiModel) : settings.mode === "opencode" ? OC.modelInfo(settings.opencodeModel) : MODELS.find((x) => x.id === settings.model);
        c.className = "chip-mode" + (settings.mode === "demo" ? " demo" : "");
        c.textContent = !settings.mode ? "Sin configurar" : settings.mode === "demo" ? "Modo demo" : (m ? m.name.replace("Claude ", "") : settings.model);
        $("composer-foot").textContent = settings.mode === "demo" ? "Modo demo: respuestas simuladas; las herramientas y los cálculos son reales." : "Enter envía · Shift+Enter nueva línea. El asistente puede equivocarse: verificá con la memoria de cálculo y la norma.";
    }
    // Aviso en una conversación que sigue con otro proveedor que el elegido ahora.
    function updateProvNote() {
        const n = $("prov-note");
        const cp = conv && conv.messages && conv.messages.length ? convProv(conv) : null, mp = modeProv();
        if (cp && mp && cp !== mp) { n.hidden = false; n.textContent = `Esta conversación sigue con ${PROV_NAME[cp]} (cada una se queda con su proveedor). Para usar ${PROV_NAME[mp]} empezá una conversación nueva con «＋».`; }
        else { n.hidden = true; n.textContent = ""; }
    }

    /* =====================================================================
       Confirmación de project_set
       ===================================================================== */
    let confirmChain = Promise.resolve();
    function askConfirm(req) {
        const p = confirmChain.then(() => new Promise((resolve) => {
            const dlg = $("dlg-confirm");
            const show = (v) => { const s = JSON.stringify(v); return esc(s.length > 300 ? s.slice(0, 300) + "…" : s); };
            $("cf-title").textContent = `¿Aplicar estos cambios en «${req.title}»?`;
            $("cf-sub").textContent = `Se van a guardar en este navegador (datos actuales: ${req.source}). La página ${Tools.MODULES[req.module].page} usa estos datos.`;
            $("cf-diff").innerHTML = `<table class="diff"><thead><tr><th>Dato</th><th>Antes</th><th>Después</th></tr></thead><tbody>${req.diff.map((d) => `<tr><td><code>${esc(d.path)}</code></td><td class="old"><code>${d.nuevo ? "(nuevo)" : show(d.before)}</code></td><td class="new"><code>${show(d.after)}</code></td></tr>`).join("")}</tbody></table>`;
            dlg.returnValue = "";
            dlg.addEventListener("close", function h() { dlg.removeEventListener("close", h); resolve(dlg.returnValue === "yes"); }, { once: true });
            dlg.showModal();
            $("cf-no").focus();
            announce("El asistente pide confirmar cambios en tus datos.");
        }));
        confirmChain = p.catch(() => { });
        return p;
    }

    /* =====================================================================
       Panel del proyecto
       ===================================================================== */
    const ST_LABEL = { pendiente: "Pendiente", en_progreso: "En progreso", hecho: "Hecho", no_aplica: "No aplica" };
    let pjTimer = null;
    function renderProject() { clearTimeout(pjTimer); pjTimer = setTimeout(doRenderProject, 120); }
    async function doRenderProject() {
        const body = $("pj-body");
        let rows = [];
        try { rows = await executor.checklistRows(); } catch (e) { /* noop */ }
        const done = rows.filter((r) => r.status === "hecho").length, appl = rows.filter((r) => r.status !== "no_aplica").length;
        const pct = appl ? Math.round(100 * done / appl) : 0;
        const groups = [];
        rows.forEach((r) => { const k = `${r.area}${r.grupo ? " · " + r.grupo : ""}`; let g = groups.find((x) => x.k === k); if (!g) groups.push(g = { k, rows: [] }); g.rows.push(r); });
        const open = new Set(Array.from(body.querySelectorAll("details.ck-group[open]")).map((d) => d.dataset.k));
        const firstRender = !body.children.length;
        let mods = "";
        for (const [m, info] of Object.entries(Tools.MODULES)) {
            let s = null, err = null;
            try { s = executor.summary(m); } catch (e) { err = e.message; }
            const v = s && s.verificaciones;
            const pills = v ? `<span class="pill ok" title="Cumplen">✓ ${v.cumplen}</span>${v.no_cumplen.length ? `<span class="pill fail" title="No cumplen">✕ ${v.no_cumplen.length}</span>` : ""}${v.advertencias.length ? `<span class="pill warn" title="A revisar">⚠ ${v.advertencias.length}</span>` : ""}` : `<span class="pill fail">error</span>`;
            const src = s ? (/^guardado/.test(executor.loadState(m).source) ? "con tus datos" : "con el ejemplo de la guía") : esc(err);
            mods += `<div class="mod-card"><div class="mt"><a href="${info.page}" target="_blank" rel="noopener">${esc(info.title)}</a>${pills}</div><div class="ms">${src}${v && v.no_cumplen.length ? " · " + esc(v.no_cumplen[0].n) : ""}</div>
                <button type="button" class="ask" data-ask="Revisá mi cálculo de «${esc(info.title)}»: explicame las verificaciones que no cumplen y qué tengo que cambiar.">Preguntar sobre esto →</button></div>`;
        }
        for (const [m, info] of Object.entries(Tools.READONLY)) {
            if (m === "red_resumen") continue;
            const saved = !!storage.getItem(info.key);
            mods += `<div class="mod-card"><div class="mt"><a href="${info.page}" target="_blank" rel="noopener">${esc(info.title)}</a><span class="pill ${saved ? "ok" : "warn"}">${saved ? "guardado" : "sin datos"}</span></div>
                <button type="button" class="ask" data-ask="Ayudame con «${esc(info.title)}»: revisá mis datos guardados y decime qué me falta.">Preguntar sobre esto →</button></div>`;
        }
        const kst = kb.loaded ? (kb.status.available ? `Base de conocimiento: ${kb.status.counts.chunks} fragmentos${kbBase !== "kb" ? ` (${esc(kbBase)})` : ""}.` : "Base de conocimiento no disponible.") : "Cargando base de conocimiento…";
        body.innerHTML = `<section class="pj-sec"><h3>Avance</h3>
            <div class="prog"><div class="prog-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Avance"><div class="prog-fill" style="width:${pct}%"></div></div><b>${pct} %</b></div>
            <p class="ms" style="font-size:.76rem;color:var(--muted)">${done} de ${appl} ítems hechos${kb.checklist ? "" : " · lista del sistema de ponderación 2026"}</p>
            ${groups.map((g, gi) => `<details class="ck-group" data-k="${esc(g.k)}" ${open.has(g.k) || (firstRender && gi === 0) ? "open" : ""}><summary>${esc(g.k)} <small>(${g.rows.filter((r) => r.status === "hecho").length}/${g.rows.length})</small></summary>
                ${g.rows.map((r) => `<div class="ck-item ${r.status}"><select data-ck="${esc(r.id)}" aria-label="Estado de ${esc(r.item)}">${Tools.CK_STATUS.map((s) => `<option value="${s}" ${s === r.status ? "selected" : ""}>${ST_LABEL[s]}</option>`).join("")}</select>
                <span class="ck-t">${esc(r.item)}</span><button type="button" class="ask" data-ask="Ayudame con «${esc(r.item)}»: ¿qué tengo que calcular, con qué criterio de la norma y qué me falta?" aria-label="Preguntar sobre ${esc(r.item)}">Preguntar</button></div>`).join("")}
            </details>`).join("")}</section>
            <section class="pj-sec"><h3>Módulos de cálculo</h3>${mods}</section>
            <p class="ms" style="font-size:.74rem;color:var(--muted);margin-top:.6rem">${kst}</p>`;
    }
    $("pj-body").addEventListener("change", async (e) => {
        const s = e.target.closest("[data-ck]"); if (!s) return;
        await executor.setChecklist(s.dataset.ck, s.value);
        renderProject();
    });
    $("pj-body").addEventListener("click", (e) => {
        const a = e.target.closest("[data-ask]"); if (!a) return;
        closeDrawers();
        if (busy) { setPrompt(a.dataset.ask); return; }
        send(a.dataset.ask);
    });
    $("pj-refresh").addEventListener("click", renderProject);
    window.addEventListener("storage", (e) => { if (e.key && e.key.startsWith("sh-")) renderProject(); });

    /* =====================================================================
       Cajones (celular), impresión
       ===================================================================== */
    const wide = () => window.matchMedia("(min-width: 1151px)").matches;
    function closeDrawers() { document.body.classList.remove("cv-open", "pj-open"); $("backdrop").hidden = true; }
    $("open-cv").addEventListener("click", () => { document.body.classList.add("cv-open"); $("backdrop").hidden = false; $("btn-new").focus(); });
    $("open-pj").addEventListener("click", () => {
        if (wide()) { const c = $("chat-app").classList.toggle("pj-closed"); storage.setItem(PJ_KEY, c ? "1" : "0"); return; }
        const open = document.body.classList.toggle("pj-open"); $("backdrop").hidden = !open;
        if (open) $("pj-refresh").focus();
    });
    document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => {
        if (b.dataset.close === "pj-side" && wide()) { $("chat-app").classList.add("pj-closed"); storage.setItem(PJ_KEY, "1"); }
        closeDrawers();
    }));
    $("backdrop").addEventListener("click", closeDrawers);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && (document.body.classList.contains("cv-open") || document.body.classList.contains("pj-open"))) closeDrawers(); });
    if (storage.getItem(PJ_KEY) === "1") $("chat-app").classList.add("pj-closed");

    let printOpened = [];
    window.addEventListener("beforeprint", () => { printOpened = Array.from($("cv-msgs").querySelectorAll("details:not([open])")); printOpened.forEach((d) => { d.open = true; }); });
    window.addEventListener("afterprint", () => { printOpened.forEach((d) => { d.open = false; }); printOpened = []; });
    $("btn-print").addEventListener("click", () => window.print());

    /* =====================================================================
       Inicio
       ===================================================================== */
    async function init() {
        MC.setupNavToggle();
        updateModeChip();
        await DB.open();
        if (!DB.ok) $("db-note").textContent = "Este navegador no permite guardar conversaciones (IndexedDB): se pierden al cerrar la página.";
        try { convs = await DB.all(); } catch (e) { convs = []; }
        // Contexto de la página de origen (?from=red)
        const from = qs.get("from");
        const module = from && Tools.PAGE_TO_MODULE[from];
        if (module) {
            const info = Tools.MODULES[module] || Tools.READONLY[module];
            pendingCtx = { module, title: info.title, file: info.page };
            setPrompt(Tools.MODULES[module] ? `Revisá mi cálculo de «${info.title}»: ¿qué verificaciones no cumplen y cómo las corrijo?` : `Ayudame con «${info.title}»: ¿qué me falta revisar?`);
        } else {
            const m = /#c=([\w-]+)/.exec(location.hash);
            if (m && convs.some((c) => c.id === m[1])) conv = convs.find((c) => c.id === m[1]);
        }
        renderCtxChip(); renderList(); renderConv(); renderProject();
        kbReady.then(() => { renderProject(); if (!conv || !conv.messages.length) renderConv(); });
        ta.focus();
    }
    init();
})();
