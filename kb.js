"use strict";
/* =====================================================================
   kb.js — Base de conocimiento del asistente (carpeta kb/).
   - Carga perezosa de kb/index.json, catalog.md, formulas.json, criteria.json,
     checklist.json, glossary.json y errata.md (todos opcionales).
   - Búsqueda BM25 en el cliente sobre título, palabras clave, resumen y etiquetas,
     normalizada sin tildes.
   - Lectura de fragmentos (kb/chunks/<id>.md) y tablas (kb/tables/<id>.json).
   Sin DOM: funciona en el navegador (fetch) y en Node (lector de archivos).
   ===================================================================== */
(function (root) {
    const CHUNK_MAX = 3000;

    // Palabras vacías del español (y unas pocas del inglés) que no aportan a la búsqueda.
    const STOP = new Set(("a al algo algun alguna algunas alguno algunos ante antes como con contra cual cuales cuando de del desde donde dos e el ella ellas ellos en entre era es esa esas ese eso esos esta estas este esto estos fue ha hay la las le les lo los mas me mi muy no nos o otra otro para pero por porque que quien se sea segun ser si sin sobre son su sus tambien te tiene todo tu un una uno unos y ya " +
        "the of and to in for is on").split(" "));

    function norm(s) {
        return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9.]+/g, " ").replace(/(^|\s)\.+|\.+(\s|$)/g, " ").trim();
    }
    function tokens(s) {
        const out = [];
        for (const t of norm(s).split(/\s+/)) {
            if (!t || STOP.has(t)) continue;
            out.push(t);
            // "np68" ~ "np 68": también indexa las partes letra/número por separado
            const parts = t.match(/[a-z]+|[0-9.]+/g);
            if (parts && parts.length > 1) parts.forEach((p) => { if (!STOP.has(p)) out.push(p); });
        }
        return out;
    }
    // ¿El campo (texto o lista) contiene la palabra exacta? ("red" no coincide con "predial")
    const hasWord = (v, w) => norm(asText(v)).split(/[\s.]+/).includes(w);
    const asText = (v) => (Array.isArray(v) ? v.join(" ") : v == null ? "" : String(v));

    /* ---------------- BM25 ----------------
       Cada documento es la concatenación de sus campos con un peso (repetición). */
    class BM25 {
        constructor(docs, fields, opts = {}) {
            this.k1 = opts.k1 || 1.2; this.b = opts.b || 0.75;
            this.docs = docs;
            this.tf = []; this.len = []; this.df = new Map();
            docs.forEach((d, i) => {
                const tf = new Map(); let len = 0;
                for (const [f, w] of fields) {
                    for (const t of tokens(asText(d[f]))) { tf.set(t, (tf.get(t) || 0) + w); len += w; }
                }
                this.tf[i] = tf; this.len[i] = len;
                for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
            });
            this.N = docs.length;
            this.avg = this.N ? this.len.reduce((s, x) => s + x, 0) / this.N : 0;
        }
        idf(t) { const n = this.df.get(t) || 0; return Math.log(1 + (this.N - n + 0.5) / (n + 0.5)); }
        // Devuelve [{i, score}] ordenado; filter(doc) opcional.
        search(q, k = 8, filter) {
            const qt = Array.from(new Set(tokens(q)));
            if (!qt.length) return [];
            const res = [];
            for (let i = 0; i < this.N; i++) {
                if (filter && !filter(this.docs[i])) continue;
                const tf = this.tf[i]; let s = 0;
                for (const t of qt) {
                    let f = tf.get(t) || 0;
                    // coincidencia por prefijo (p. ej. "veloc" → "velocidad") con medio peso
                    if (!f && t.length >= 4) for (const [w, c] of tf) if (w.startsWith(t)) { f = Math.max(f, c / 2); }
                    if (!f) continue;
                    const idf = this.idf(t);
                    s += idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * this.len[i] / (this.avg || 1)));
                }
                if (s > 0) res.push({ i, score: s });
            }
            res.sort((a, b) => b.score - a.score || a.i - b.i);
            return res.slice(0, k);
        }
    }

    const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

    class KB {
        // reader(path) → Promise<string|null> (null si no existe)
        constructor(reader) {
            this.reader = reader;
            this.loaded = false;
            this.status = { available: false, missing: [], counts: {} };
        }

        async _text(p) { try { const t = await this.reader(p); return t == null ? null : String(t); } catch (e) { return null; } }
        async _json(p) {
            const t = await this._text(p);
            if (t == null) return null;
            try { return JSON.parse(t); } catch (e) { this.status.missing.push(p + " (JSON inválido)"); return null; }
        }

        async load() {
            if (this._loading) return this._loading;
            this._loading = (async () => {
                const st = this.status;
                const [index, catalog, formulas, criteria, checklist, glossary, errata] = await Promise.all([
                    this._json("index.json"), this._text("catalog.md"), this._json("formulas.json"), this._json("criteria.json"),
                    this._json("checklist.json"), this._json("glossary.json"), this._text("errata.md"),
                ]);
                const list = (x, k) => (Array.isArray(x) ? x : x && Array.isArray(x[k]) ? x[k] : null);
                this.index = list(index, "items") || [];
                this.catalog = catalog || "";
                this.formulas = list(formulas, "formulas") || [];
                this.criteria = list(criteria, "criteria") || [];
                this.checklist = list(checklist, "items") || null;
                this.glossary = list(glossary, "terms") || [];
                this.errata = errata || "";
                [["index.json", index], ["catalog.md", catalog], ["formulas.json", formulas], ["criteria.json", criteria], ["checklist.json", checklist], ["glossary.json", glossary], ["errata.md", errata]]
                    .forEach(([n, v]) => { if (v == null && !st.missing.some((x) => x.startsWith(n))) st.missing.push(n); });
                st.counts = { chunks: this.index.length, formulas: this.formulas.length, criteria: this.criteria.length, checklist: this.checklist ? this.checklist.length : 0, glossary: this.glossary.length };
                st.available = this.index.length > 0;
                this.idx = new BM25(this.index, [["title", 3], ["keywords", 2], ["tags", 2], ["summary", 1], ["section", 1], ["source", 2]]);
                this.fidx = new BM25(this.formulas, [["id", 2], ["name", 3], ["title", 3], ["keywords", 2], ["tags", 2], ["description", 1], ["notes", 1], ["vars", 1], ["variables", 1], ["latex", 1]]);
                this.loaded = true;
                return st;
            })();
            return this._loading;
        }

        _need() { if (!this.status.available) throw new Error("Base de conocimiento no disponible (falta kb/index.json o está vacío)."); }

        search(query, opts = {}) {
            this._need();
            const k = Math.max(1, Math.min(8, Math.round(opts.k || 5)));
            const m = opts.module ? norm(opts.module) : null, kd = opts.kind ? norm(opts.kind) : null;
            const filter = (m || kd) ? (d) => (!m || hasWord(d.module, m)) && (!kd || norm(d.kind) === kd) : null;
            return this.idx.search(query, k, filter).map(({ i, score }) => {
                const d = this.index[i];
                return { id: d.id, title: d.title, source: d.source, pages: d.pages, section: d.section, kind: d.kind, module: d.module, summary: d.summary, score: +score.toFixed(3) };
            });
        }

        async read(id) {
            this._need();
            if (!ID_RE.test(String(id))) throw new Error(`Identificador inválido: «${id}».`);
            const meta = this.index.find((d) => d.id === id);
            // "file" puede ser la ruta del fragmento (.md) o el documento de origen (PDF): solo se usa si es un .md relativo.
            const file = meta && meta.file && /^[A-Za-z0-9._\/-]+\.md$/.test(meta.file) && !meta.file.includes("..") ? meta.file : `chunks/${id}.md`;
            const t = await this._text(file);
            if (t == null) throw new Error(`No existe el fragmento «${id}».` + (meta ? "" : " Buscá el id con kb_search."));
            const truncated = t.length > CHUNK_MAX;
            return { id, title: meta ? meta.title : undefined, source: meta ? meta.source : undefined, pages: meta ? meta.pages : undefined, truncated, content: truncated ? t.slice(0, CHUNK_MAX) + "\n[…fragmento truncado a 3000 caracteres]" : t };
        }

        async table(id, filter) {
            if (!ID_RE.test(String(id))) throw new Error(`Identificador de tabla inválido: «${id}».`);
            const t = await this._json(`tables/${id}.json`);
            if (t == null) throw new Error(`No existe la tabla «${id}».`);
            if (!filter) return t;
            const f = norm(filter);
            const rows = Array.isArray(t) ? t : Array.isArray(t.rows) ? t.rows : null;
            if (!rows) return t;
            const cols = Array.isArray(t.columns) ? t.columns : null;
            // filtro "col=valor" o texto libre en cualquier celda
            const m = String(filter).match(/^\s*([^=]+?)\s*=\s*(.+)\s*$/);
            const cell = (r, c) => (Array.isArray(r) ? (cols ? r[cols.findIndex((x) => norm(x && x.name || x) === norm(c))] : undefined) : r[c] !== undefined ? r[c] : r[Object.keys(r).find((k) => norm(k) === norm(c))]);
            const kept = rows.filter((r) => {
                if (m) { const v = cell(r, m[1]); return v !== undefined && norm(v) === norm(m[2]); }
                return norm(Array.isArray(r) ? r.join(" ") : Object.values(r).join(" ")).includes(f);
            });
            const out = Array.isArray(t) ? kept : Object.assign({}, t, { rows: kept });
            return { filter: String(filter), matched: kept.length, of: rows.length, table: out };
        }

        formula(idOrQuery) {
            if (!this.formulas.length) throw new Error("No hay fórmulas cargadas (falta kb/formulas.json).");
            const q = String(idOrQuery || "");
            const exact = this.formulas.find((f) => f.id === q) || this.formulas.find((f) => norm(f.id) === norm(q));
            if (exact) return { match: "id", formulas: [exact] };
            const hits = this.fidx.search(q, 4).map(({ i }) => this.formulas[i]);
            return hits.length ? { match: "busqueda", formulas: hits } : { match: "ninguna", formulas: [], nota: `No hay una fórmula para «${q}» en la base. Fórmulas disponibles: ${this.formulas.map((f) => f.id).join(", ")}. Probá kb_search.` };
        }

        criteriaFor(module, param) {
            if (!this.criteria.length) throw new Error("No hay criterios cargados (falta kb/criteria.json).");
            const m = module ? norm(module) : null, p = param ? norm(param) : null;
            const rows = this.criteria.filter((c) => (!m || hasWord(c.module, m)) &&
                (!p || norm([c.param, c.name, c.id, c.title, asText(c.keywords)].join(" ")).includes(p)));
            return { count: rows.length, criteria: rows.slice(0, 40) };
        }
    }

    // Lector para el navegador: fetch relativo a la carpeta kb/
    KB.fetchReader = (base) => async (p) => {
        const r = await fetch(base.replace(/\/?$/, "/") + p, { cache: "no-cache" });
        return r.ok ? r.text() : null;
    };
    // Lector para Node: archivos del disco
    KB.fsReader = (dir) => async (p) => {
        const fs = require("fs"), path = require("path");
        const base = path.resolve(dir), full = path.resolve(base, p);
        if (!full.startsWith(base + path.sep)) return null;
        try { return fs.readFileSync(full, "utf8"); } catch (e) { return null; }
    };

    const api = { KB, BM25, norm, tokens, CHUNK_MAX };
    root.KBLib = api;
    if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
