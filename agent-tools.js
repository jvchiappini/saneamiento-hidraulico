"use strict";
/* =====================================================================
   agent-tools.js — Herramientas del asistente y su ejecutor.
   - Definiciones (JSON Schema estricto) que se mandan a la API.
   - Validación de las entradas antes de ejecutar (el stream puede traer JSON cortado).
   - Evaluador matemático propio (sin eval).
   - Ejecutor: base de conocimiento, módulos de cálculo (RedCalc, TanqueCalc,
     CloacalCalc, PredialCalc), estado guardado y avance del TP.
   Sin DOM: el almacenamiento y la confirmación del usuario se inyectan.
   ===================================================================== */
(function (root) {
    const RESULT_MAX = 4000;   // caracteres por resultado de herramienta
    const MEMO_PAGE = 3500;    // caracteres por página de module_memo

    /* =====================================================================
       Evaluador matemático
       ===================================================================== */
    const FUNCS = {
        sqrt: [1, Math.sqrt], cbrt: [1, Math.cbrt], abs: [1, Math.abs], exp: [1, Math.exp],
        ln: [1, Math.log], log10: [1, Math.log10], log2: [1, Math.log2],
        log: [[1, 2], (x, b) => (b === undefined ? Math.log(x) : Math.log(x) / Math.log(b))],
        sin: [1, Math.sin], cos: [1, Math.cos], tan: [1, Math.tan], asin: [1, Math.asin], acos: [1, Math.acos], atan: [1, Math.atan],
        atan2: [2, Math.atan2], sinh: [1, Math.sinh], cosh: [1, Math.cosh], tanh: [1, Math.tanh],
        pow: [2, Math.pow], hypot: [[1, 10], Math.hypot], min: [[1, 50], Math.min], max: [[1, 50], Math.max],
        ceil: [1, Math.ceil], floor: [1, Math.floor], trunc: [1, Math.trunc], sign: [1, Math.sign],
        round: [[1, 2], (x, n) => { const k = Math.pow(10, n || 0); return Math.round(x * k) / k; }],
        deg: [1, (r) => r * 180 / Math.PI], rad: [1, (d) => d * Math.PI / 180],
    };
    const CONSTS = { pi: Math.PI, e: Math.E };
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

    function lex(src) {
        const out = []; let i = 0;
        while (i < src.length) {
            const c = src[i];
            if (/\s/.test(c)) { i++; continue; }
            const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
            if (num) { out.push({ t: "n", v: parseFloat(num[0]), p: i }); i += num[0].length; continue; }
            const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
            if (id) { out.push({ t: "id", v: id[0], p: i }); i += id[0].length; continue; }
            if (src.startsWith("**", i)) { out.push({ t: "^", p: i }); i += 2; continue; }
            if ("+-*/^%(),".includes(c)) { out.push({ t: c, p: i }); i++; continue; }
            if (c === "·" || c === "×") { out.push({ t: "*", p: i }); i++; continue; }
            throw new Error(`Carácter no válido «${c}» en la posición ${i + 1}. Usá punto decimal (1.5), no coma.`);
        }
        return out;
    }

    function evaluate(expr, vars) {
        const src = String(expr || "");
        if (!src.trim()) throw new Error("La expresión está vacía.");
        if (src.length > 1000) throw new Error("La expresión es demasiado larga (máximo 1000 caracteres).");
        const V = Object.create(null);
        for (const [k, v] of Object.entries(vars || {})) {
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`Nombre de variable inválido: «${k}».`);
            if (own(FUNCS, k) || own(CONSTS, k)) throw new Error(`«${k}» es una función o constante reservada; usá otro nombre.`);
            if (typeof v !== "number" || !isFinite(v)) throw new Error(`La variable «${k}» debe ser un número finito.`);
            V[k] = v;
        }
        const T = lex(src); let i = 0, depth = 0;
        const peek = () => T[i], eat = (t) => { if (T[i] && T[i].t === t) return T[i++]; return null; };
        const need = (t) => { const x = eat(t); if (!x) throw new Error(`Se esperaba «${t}»${T[i] ? ` en la posición ${T[i].p + 1}` : " al final"}.`); return x; };
        function add() { let v = mul(); for (;;) { if (eat("+")) v += mul(); else if (eat("-")) v -= mul(); else return v; } }
        function mul() { let v = unary(); for (;;) { if (eat("*")) v *= unary(); else if (eat("/")) v /= unary(); else if (eat("%")) v %= unary(); else return v; } }
        function unary() { if (eat("-")) return -unary(); if (eat("+")) return unary(); return pow(); }
        function pow() { const b = primary(); if (eat("^")) return Math.pow(b, unary()); return b; }
        function primary() {
            if (++depth > 200) throw new Error("Expresión demasiado anidada.");
            try {
                const tk = peek();
                if (!tk) throw new Error("La expresión termina de forma incompleta.");
                if (eat("(")) { const v = add(); need(")"); return v; }
                if (tk.t === "n") { i++; return tk.v; }
                if (tk.t === "id") {
                    i++;
                    const name = tk.v;
                    if (eat("(")) {
                        const f = own(FUNCS, name.toLowerCase()) ? FUNCS[name.toLowerCase()] : null;
                        if (!f) throw new Error(`Función desconocida «${name}». Disponibles: ${Object.keys(FUNCS).join(", ")}.`);
                        const args = [];
                        if (!eat(")")) { do { args.push(add()); } while (eat(",")); need(")"); }
                        const [ar, fn] = f;
                        const [lo, hi] = Array.isArray(ar) ? ar : [ar, ar];
                        if (args.length < lo || args.length > hi) throw new Error(`${name}() recibe ${lo === hi ? lo : `${lo} a ${hi}`} argumento(s), no ${args.length}.`);
                        return fn(...args);
                    }
                    if (name in V) return V[name];
                    if (own(CONSTS, name.toLowerCase())) return CONSTS[name.toLowerCase()];
                    if (own(FUNCS, name)) throw new Error(`«${name}» es una función: escribí ${name}(…).`);
                    throw new Error(`Variable no definida «${name}». Pasala en vars.`);
                }
                throw new Error(`Símbolo inesperado «${tk.t}» en la posición ${tk.p + 1}.`);
            } finally { depth--; }
        }
        const v = add();
        if (i < T.length) throw new Error(`Sobra texto desde la posición ${T[i].p + 1} («${src.slice(T[i].p, T[i].p + 12)}»). ¿Falta un operador?`);
        if (typeof v !== "number" || !isFinite(v)) throw new Error("El resultado no es un número finito (¿división por cero o raíz de un negativo?).");
        return v;
    }
    const sig = (x, n = 6) => (x === 0 ? 0 : Number(Number(x).toPrecision(n)));
    const fmtEs = (x) => String(x).replace(".", ",");

    /* =====================================================================
       Validación de entradas (subconjunto de JSON Schema usado acá)
       ===================================================================== */
    function validate(schema, v, path = "input") {
        const errs = [];
        const t = schema.type;
        const typeOk = t === "object" ? v && typeof v === "object" && !Array.isArray(v)
            : t === "array" ? Array.isArray(v)
                : t === "integer" ? Number.isInteger(v)
                    : t === "number" ? typeof v === "number" && isFinite(v)
                        : t === "string" ? typeof v === "string"
                            : t === "boolean" ? typeof v === "boolean" : true;
        if (!typeOk) { errs.push(`${path}: se esperaba ${t}`); return errs; }
        if (schema.enum && !schema.enum.includes(v)) errs.push(`${path}: debe ser uno de ${schema.enum.join(", ")}`);
        if (t === "object") {
            const props = schema.properties || {};
            for (const r of schema.required || []) if (v[r] === undefined) errs.push(`${path}.${r}: falta`);
            for (const [k, x] of Object.entries(v)) {
                if (!props[k]) { if (schema.additionalProperties === false) errs.push(`${path}.${k}: propiedad no permitida`); continue; }
                errs.push(...validate(props[k], x, `${path}.${k}`));
            }
        }
        if (t === "array" && schema.items) v.forEach((x, k) => errs.push(...validate(schema.items, x, `${path}[${k}]`)));
        return errs;
    }

    /* =====================================================================
       Módulos y estado guardado
       ===================================================================== */
    const MODULES = {
        red: { key: "sh-red-v1", calc: "RedCalc", file: "./red.js", title: "Red de distribución (Hardy Cross)", page: "red.html" },
        tanque: { key: "sh-tanque-v1", calc: "TanqueCalc", file: "./tanque.js", title: "Impulsión al tanque elevado", page: "tanque.html" },
        cloacal: { key: "sh-cloacal-v1", calc: "CloacalCalc", file: "./cloacal.js", title: "Red cloacal", page: "cloacal.html" },
        predial: { key: "sh-predial-v1", calc: "PredialCalc", file: "./predial.js", title: "Agua potable del edificio (predial)", page: "predial.html" },
    };
    // Estados de app.js (impulsión del río y potabilizadora): solo lectura.
    const READONLY = {
        impulsion: { key: "sh-state-v1", title: "Impulsión del río (manual y automático)", page: "index.html", pick: (o) => o && o.S },
        potabilizadora: { key: "sh-potab-state-v1", title: "Planta potabilizadora", page: "potabilizadora.html", pick: (o) => o && o.SP },
        red_resumen: { key: "sh-red-sum", title: "Resumen de la red que usan tanque y cloacal", page: "red.html", pick: (o) => o },
    };
    const PAGES = {
        index: ["index.html", "Impulsión del río · Manual"], auto: ["auto.html", "Impulsión del río · Automático"],
        potabilizadora: ["potabilizadora.html", "Potabilizadora · Manual"], "potabilizadora-auto": ["potabilizadora-auto.html", "Potabilizadora · Automático"],
        red: ["red.html", "Red de distribución"], tanque: ["tanque.html", "Impulsión al tanque"], cloacal: ["cloacal.html", "Red cloacal"],
        predial: ["predial.html", "Predial · agua del edificio"], referencias: ["referencias.html", "Tablas de la Norma 68"], formulas: ["formulas.html", "Fórmulas"],
    };
    const PAGE_TO_MODULE = { red: "red", tanque: "tanque", cloacal: "cloacal", predial: "predial", index: "impulsion", auto: "impulsion", potab: "potabilizadora", "potab-auto": "potabilizadora", potabilizadora: "potabilizadora", "potabilizadora-auto": "potabilizadora" };

    const clone = (o) => JSON.parse(JSON.stringify(o));
    const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

    // Valor de un override: literal JSON ("12.5", "null", "\"auto\"", "[...]") o texto plano.
    function parseValue(s) {
        if (typeof s !== "string") return s;
        const t = s.trim();
        try { return JSON.parse(t); } catch (e) { return s; }
    }
    function splitPath(p) {
        const ks = String(p).split(".").filter((x) => x !== "");
        if (!ks.length) throw new Error("Ruta vacía.");
        for (const k of ks) if (k === "__proto__" || k === "constructor" || k === "prototype") throw new Error(`Ruta no permitida: «${p}».`);
        return ks;
    }
    // Aplica [{path, value}] sobre una copia; valida que la ruta exista y que el tipo sea compatible.
    function applyPatch(state, list, opts = {}) {
        const st = clone(state), diff = [];
        for (const it of list || []) {
            const ks = splitPath(it.path);
            if (ks[0] === "__v") throw new Error("No se puede cambiar la versión del estado (__v).");
            let parent = st;
            for (let j = 0; j < ks.length - 1; j++) {
                const k = ks[j];
                if (parent == null || typeof parent !== "object" || !(k in parent)) throw new Error(`La ruta «${it.path}» no existe (falla en «${ks.slice(0, j + 1).join(".")}»). Claves disponibles: ${parent && typeof parent === "object" ? Object.keys(parent).slice(0, 30).join(", ") : "—"}.`);
                parent = parent[k];
            }
            const last = ks[ks.length - 1];
            if (parent == null || typeof parent !== "object") throw new Error(`La ruta «${it.path}» no existe.`);
            const exists = Array.isArray(parent) ? /^\d+$/.test(last) && +last < parent.length : last in parent;
            const append = Array.isArray(parent) && /^\d+$/.test(last) && +last === parent.length;
            if (!exists && !append) throw new Error(`La ruta «${it.path}» no existe. Claves disponibles: ${Array.isArray(parent) ? `índices 0 a ${parent.length - 1} (o ${parent.length} para agregar)` : Object.keys(parent).slice(0, 40).join(", ")}.`);
            const before = exists ? parent[last] : undefined;
            const value = parseValue(it.value);
            if (exists && before !== null && value !== null) {
                const tb = Array.isArray(before) ? "array" : typeof before, tv = Array.isArray(value) ? "array" : typeof value;
                if (tb !== tv) throw new Error(`«${it.path}» es ${tb} y el valor nuevo es ${tv} (${JSON.stringify(value)}).`);
            }
            if (typeof value === "number" && !isFinite(value)) throw new Error(`«${it.path}»: el valor debe ser finito.`);
            if (ks.join(".") === "mode" && !["auto", "manual"].includes(value)) throw new Error("mode debe ser \"auto\" o \"manual\".");
            parent[last] = value;
            diff.push({ path: ks.join("."), before: before === undefined ? null : before, after: value, nuevo: !exists });
        }
        return { state: st, diff };
    }

    /* ---------- Resúmenes compactos por módulo ---------- */
    const f6 = (x) => (typeof x === "number" && isFinite(x) ? sig(x, 6) : x);
    const kv = (label, v, u) => ({ k: label, v: f6(v), u: u || "" });
    const SUMMARY = {
        red(R, st) {
            const out = [kv("Caudal máximo diario Qmd", R.Qmd, "l/s"), kv("Caudal máximo horario Qmh", R.Qmh, "l/s"),
            kv("Volumen del tanque (Q máx. horario)", R.Vmh, "m³"), kv("Altura útil del tanque", R.Hmh, "m"), kv("Altura total del tanque", R.Htot, "m")];
            if (R.hc) {
                out.push(kv("Iteraciones de Hardy Cross", R.hc.its.length, ""), kv("Converge", R.hc.conv ? "sí" : "no", ""),
                    kv("Altura de la base del tanque adoptada", R.Hbase, "m"), kv("Altura mínima de la base calculada", R.HbaseMin, "m"),
                    kv(`Presión mínima (nodo ${st.nodes[R.iMin].id})`, R.pres[R.iMin], "m.c.a."), kv(`Presión máxima (nodo ${st.nodes[R.iMax].id})`, R.pres[R.iMax], "m.c.a."),
                    kv("Presión estática máxima", R.Pest, "m.c.a."));
                return { resultados: out, tramos: st.pipes.map((p, i) => ({ id: p.id, D_mm: R.Dmm[i], Q_ls: f6(R.Qf[i] * 1000), v_ms: f6(R.vel[i]), h_m: f6(R.hf[i]) })), nodos: st.nodes.map((n, i) => ({ id: n.id, CT_m: n.ct, P_mca: f6(R.pres[i]) })) };
            }
            return { resultados: out };
        },
        tanque(R) {
            const b = R.best || {};
            return {
                resultados: [kv("Caudal de bombeo Qb", R.b.Qb, "m³/s"), kv("Diámetro de Bresse", R.b.Db, "m"), kv("Altura topográfica de impulsión", R.b.Hi, "m"),
                kv("Diámetro de succión adoptado", b.dS, "mm"), kv("Diámetro de impulsión adoptado", b.dI, "mm"), kv("Velocidad en succión", b.vS, "m/s"), kv("Velocidad en impulsión", b.vI, "m/s"),
                kv("Altura manométrica total", b.H, "m.c.a."), kv("Potencia de la bomba", b.Pcv, "CV"), kv("Potencia con holgura (Tabla VIII)", b.Psel, "HP"), kv("Potencia adoptada", b.Padop, "HP"),
                kv("Costo anual", b.anual, "US$/año")],
                alternativas: (R.alts || []).map((a) => ({ dS_mm: a.dS, dI_mm: a.dI, H_mca: f6(a.H), P_HP: a.Padop, anual_USD: f6(a.anual), verifica: !!a.ok })),
            };
        },
        cloacal(R, st) {
            const r = R.r || [];
            const v = r.map((x) => x.v).filter(isFinite), prof = r.flatMap((x) => [x.pE, x.pS]).filter(isFinite);
            return {
                resultados: [kv("Caudal máximo de desagüe por edificio", R.qMax, "l/s/lote"), kv("Longitud total de la red", R.Ltot, "m"), kv("Caudal en la descarga", R.Qfinal, "l/s"),
                kv("Cantidad de tramos", r.length, ""), kv("Velocidad mínima", v.length ? Math.min(...v) : null, "m/s"), kv("Velocidad máxima", v.length ? Math.max(...v) : null, "m/s"),
                kv("Profundidad máxima", prof.length ? Math.max(...prof) : null, "m")],
                tramos_formato: "de→a | D (mm) | I (%) | Q diseño (l/s) | v (m/s) | profundidad entrada/salida (m) | ✓/✕",
                tramos: r.map((x, i) => `${st.tramos[i].de}→${st.tramos[i].a} | ${f6(x.D * 1000)} | ${sig(x.I * 100, 4)} | ${sig(x.qDis, 5)} | ${sig(x.v, 4)} | ${sig(x.pE, 4)}/${sig(x.pS, 4)} | ${x.ok ? "✓" : "✕"}`),
            };
        },
        predial(R) {
            return {
                resultados: [kv("Población de departamentos", R.pob, "pers."), kv("Consumo diario del edificio", R.QD, "l/día"), kv("Caudal mínimo de alimentación QP", R.QP, "l/s"),
                kv("Diámetro de acometida (Tabla II)", R.acFuera ? "fuera de tabla" : R.dAc, R.acFuera ? "" : "mm"), kv("Caudal de bombeo", R.QBlh, "l/h"), kv("Diámetro de impulsión adoptado", R.dImp, "mm"),
                kv("Diámetro de succión adoptado", R.dSucc, "mm"), kv("Volumen total de reserva", R.VT, "l"), kv("Tanque inferior", R.VInf, "m³"), kv("Tanque superior", R.VSup, "m³"),
                kv("Altura manométrica total de la electrobomba", R.HmT, "m.c.a."), kv("Potencia seleccionada (Tabla VIII)", R.Psel, "HP"), kv("Potencia adoptada", R.Padop, "HP"),
                kv("Bomba de incendio adoptada", R.PadI, "HP")],
            };
        },
    };
    function checksSummary(checks) {
        const fails = checks.filter((c) => !c.ok && !c.warn), warns = checks.filter((c) => !c.ok && c.warn);
        const pick = (c) => ({ n: c.n, d: c.d || "", estado: c.failTxt || (c.warn ? "Revisar" : "No verifica") });
        return { total: checks.length, cumplen: checks.length - fails.length - warns.length, no_cumplen: fails.map(pick), advertencias: warns.map(pick) };
    }

    /* =====================================================================
       Avance del TP (sistema de ponderación). Se usa si kb/checklist.json no está.
       ===================================================================== */
    const P = (id, area, grupo, item, module, page) => ({ id, area, grupo, item, module: module || null, page: page || null });
    const DEFAULT_CHECKLIST = [
        P("pub-datos", "Público", "Memoria de cálculo", "Datos preliminares del barrio (manzanas, edificios, densidad)", "impulsion", "index"),
        P("pub-captacion", "Público", "Memoria de cálculo", "Captación y sistema de bombeo (aductora e impulsión del río)", "impulsion", "index"),
        P("pub-aquietamiento", "Público", "Memoria de cálculo", "Cámara de aquietamiento", "potabilizadora", "potabilizadora"),
        P("pub-medidor", "Público", "Memoria de cálculo", "Medidor de caudal (Parshall)", "potabilizadora", "potabilizadora"),
        P("pub-mezcla-rapida", "Público", "Memoria de cálculo", "Mezcla rápida", "potabilizadora", "potabilizadora"),
        P("pub-floculador", "Público", "Memoria de cálculo", "Floculador y mezcla lenta", "potabilizadora", "potabilizadora"),
        P("pub-sedimentacion", "Público", "Memoria de cálculo", "Sedimentación", "potabilizadora", "potabilizadora"),
        P("pub-filtracion", "Público", "Memoria de cálculo", "Filtración, tanque y caudal de lavado", "potabilizadora", "potabilizadora"),
        P("pub-cloracion", "Público", "Memoria de cálculo", "Desinfección (cloración)", "potabilizadora", "potabilizadora"),
        P("pub-reservorio", "Público", "Memoria de cálculo", "Reservorio de agua tratada", "potabilizadora", "potabilizadora"),
        P("pub-red-tanque", "Público", "Memoria de cálculo", "Red de abastecimiento: topografía y tanque de almacenamiento", "red", "red"),
        P("pub-red-diametros", "Público", "Memoria de cálculo", "Diámetros de la malla (válvulas, ventosas)", "red", "red"),
        P("pub-red-presiones", "Público", "Memoria de cálculo", "Presiones mínimas y máximas", "red", "red"),
        P("pub-imp-tanque", "Público", "Memoria de cálculo", "Impulsión al tanque elevado", "tanque", "tanque"),
        P("pub-cloacal", "Público", "Memoria de cálculo", "Red cloacal: definición, pendientes, velocidades y diámetros", "cloacal", "cloacal"),
        P("pub-lagunas", "Público", "Memoria de cálculo", "Lagunas de estabilización y tratamiento preliminar", null, null),
        P("pub-disenos", "Público", "Diseños", "Planos: flujogramas, planta general, perfiles y detalles", null, null),
        P("pre-datos", "Predial", "Memoria de cálculo", "Datos preliminares del edificio", "predial", "predial"),
        P("pre-consumo", "Predial", "Memoria de cálculo", "Provisión y consumo de agua", "predial", "predial"),
        P("pre-acometida", "Predial", "Memoria de cálculo", "Tubería predial (acometida)", "predial", "predial"),
        P("pre-tanques", "Predial", "Memoria de cálculo", "Tanques de reserva y tiempo de retención", "predial", "predial"),
        P("pre-impulsion", "Predial", "Memoria de cálculo", "Sistema de impulsión o recalque", "predial", "predial"),
        P("pre-uh-fria", "Predial", "Memoria de cálculo", "Unidades húmedas de agua fría y columnas de bajada", "predial", "predial"),
        P("pre-caliente", "Predial", "Memoria de cálculo", "Agua caliente y termotanque", "predial", "predial"),
        P("pre-incendio", "Predial", "Memoria de cálculo", "Sistema contra incendio (volumen, columna, BIE)", "predial", "predial"),
        P("pre-cloacal", "Predial", "Memoria de cálculo", "Desagüe cloacal (unidades húmedas, bajadas, interceptores, ramales)", null, null),
        P("pre-pluvial", "Predial", "Memoria de cálculo", "Desagüe pluvial (edificio, patio, salida al cordón)", null, null),
        P("pre-residuos", "Predial", "Memoria de cálculo", "Residuos sólidos (por departamento y del edificio)", null, null),
        P("pre-disenos", "Predial", "Diseños", "Planos: ubicación, cortes, plantas, axonometría", null, null),
    ];
    const CK_KEY = "sh-chat-checklist-v1";
    const CK_STATUS = ["pendiente", "en_progreso", "hecho", "no_aplica"];
    const CK_MARK = { pendiente: "[ ]", en_progreso: "[~]", hecho: "[x]", no_aplica: "[-]" };
    const cap = (s) => ({ publico: "Público", predial: "Predial" }[String(s).toLowerCase()] || String(s));
    function normChecklist(items) {
        return (items || []).map((x, k) => ({
            id: String(x.id || `item-${k + 1}`), area: cap(x.area || x.scope || ""), grupo: x.grupo || x.group || x.section || "",
            item: x.item || x.title || x.name || x.text || String(x.id), module: x.module || null, page: x.page || x.page_hint || null,
            peso: x.peso != null ? x.peso : x.weight != null ? x.weight : x.points != null ? x.points : undefined,
        }));
    }

    /* =====================================================================
       Definiciones de herramientas (orden fijo, alfabético: no cambiar en la conversación)
       ===================================================================== */
    const S = (d, extra) => Object.assign({ type: "string", description: d }, extra || {});
    const MOD_ENUM = ["red", "tanque", "cloacal", "predial"];
    const PATCH_ITEMS = {
        type: "array", description: "Lista de cambios {path, value}.",
        items: {
            type: "object", additionalProperties: false, required: ["path", "value"],
            properties: {
                path: S("Ruta con puntos dentro del estado del módulo, p. ej. \"tank.D\", \"K1\", \"pipes.0.D\" o \"edif.pisos\". Mirá las claves con project_get."),
                value: S("Valor nuevo como literal JSON: \"25\", \"0.5\", \"null\", \"true\", \"\\\"manual\\\"\" o un objeto/array JSON."),
            },
        },
    };
    const TOOL_DEFS = [
        {
            name: "calc", description: "Evalúa una expresión matemática de forma exacta (sin eval). Usala para TODA cuenta, por simple que sea. Operadores + - * / ^ (potencia) % y paréntesis; punto decimal. Funciones: sqrt, cbrt, abs, exp, ln, log (natural; log(x, b) en base b), log10, log2, sin, cos, tan, asin, acos, atan, atan2 (radianes), deg, rad, pow, hypot, min, max, ceil, floor, round(x, n), trunc, sign. Constantes pi y e. Devuelve el valor con 6 cifras significativas.",
            input_schema: {
                type: "object", additionalProperties: false, required: ["expression"],
                properties: {
                    expression: S("Expresión, p. ej. \"1.3*sqrt(Q)*X^0.25\" o \"pi*D^2/4\"."),
                    vars: { type: "array", description: "Variables de la expresión.", items: { type: "object", additionalProperties: false, required: ["name", "value"], properties: { name: S("Nombre (letras, números y _)."), value: { type: "number", description: "Valor numérico." } } } },
                },
            },
        },
        {
            name: "checklist_get", description: "Devuelve el avance del trabajo práctico según el sistema de ponderación de la cátedra (saneamiento público y predial): ítems, su estado y el progreso. Si la lista es larga, sin area devuelve el resumen por sección: pedí después un área.",
            input_schema: { type: "object", additionalProperties: false, properties: { area: S("Filtrar por área: «Público» o «Predial» (opcional).") } },
        },
        {
            name: "checklist_update", description: "Cambia el estado de un ítem del avance del TP (el id sale de checklist_get). Usalo cuando el usuario confirme que terminó o empezó algo.",
            input_schema: {
                type: "object", additionalProperties: false, required: ["id", "status"],
                properties: { id: S("Id del ítem."), status: S("Estado nuevo.", { enum: CK_STATUS }), note: S("Nota breve opcional.") },
            },
        },
        {
            name: "kb_criteria", description: "Criterios y rangos de diseño (velocidades, pendientes, presiones, tiempos, etc.) de la base de conocimiento, filtrados por módulo y/o parámetro.",
            input_schema: { type: "object", additionalProperties: false, properties: { module: S("Módulo, p. ej. red, tanque, cloacal, predial, potabilizadora, impulsion."), param: S("Parámetro o palabra, p. ej. \"velocidad\", \"presion minima\".") } },
        },
        {
            name: "kb_formula", description: "Busca una fórmula de la base de conocimiento por id exacto o por texto. Devuelve LaTeX, variables, unidades y fuente.",
            input_schema: { type: "object", additionalProperties: false, properties: { id: S("Id exacto de la fórmula."), query: S("Texto a buscar, p. ej. \"Bresse\" o \"perdida de carga\".") } },
        },
        {
            name: "kb_read", description: "Lee un fragmento de la base de conocimiento (normas, clases, guías) por su id (sale de kb_search). Máximo 3000 caracteres.",
            input_schema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: S("Id del fragmento.") } },
        },
        {
            name: "kb_search", description: "Búsqueda (BM25) en la base de conocimiento: normas NP 44 y NP 68, desagüe pluvial, agua caliente, tratamiento, ordenanza de incendio, clases y guías de la cátedra. Devuelve id, título, resumen, fuente y páginas. Leé después el fragmento con kb_read antes de citarlo.",
            input_schema: {
                type: "object", additionalProperties: false, required: ["query"],
                properties: {
                    query: S("Palabras clave en español."), module: S("Filtrar por módulo (opcional)."), kind: S("Filtrar por tipo de fragmento (opcional), según el catálogo."),
                    k: { type: "integer", description: "Cantidad de resultados, de 1 a 8 (por defecto 5)." },
                },
            },
        },
        {
            name: "kb_table", description: "Devuelve una tabla normativa de la base de conocimiento por su id; con filter devuelve solo las filas que coinciden (\"columna=valor\" o texto libre).",
            input_schema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: S("Id de la tabla."), filter: S("Filtro opcional.") } },
        },
        {
            name: "module_memo", description: "Devuelve la memoria de cálculo (fórmula, reemplazo numérico y resultado en LaTeX) de un módulo con su estado guardado. Sin group lista los grupos; con group (número o parte del título) devuelve ese grupo, paginado.",
            input_schema: {
                type: "object", additionalProperties: false, required: ["module"],
                properties: { module: S("Módulo.", { enum: MOD_ENUM }), group: S("Número de grupo (1, 2, …) o parte del título."), page: { type: "integer", description: "Página del grupo (1 por defecto)." } },
            },
        },
        {
            name: "open_page", description: "Genera un enlace a una página de la web (y opcionalmente a una sección) para que el usuario la abra.",
            input_schema: { type: "object", additionalProperties: false, required: ["page"], properties: { page: S("Página.", { enum: Object.keys(PAGES) }), anchor: S("Id de la sección, p. ej. \"presiones\" (opcional).") } },
        },
        {
            name: "project_get", description: "Lee el estado guardado del proyecto del usuario para un módulo (datos de entrada). Los módulos impulsion y potabilizadora son de solo lectura.",
            input_schema: { type: "object", additionalProperties: false, required: ["module"], properties: { module: S("Módulo.", { enum: MOD_ENUM.concat(Object.keys(READONLY)) }) } },
        },
        {
            name: "project_set", description: "Propone cambios en los datos guardados de un módulo. El usuario ve la diferencia y tiene que aprobarla en la interfaz; si la rechaza, no se guarda nada. Probá antes con run_module y overrides.",
            input_schema: { type: "object", additionalProperties: false, required: ["module", "patch"], properties: { module: S("Módulo.", { enum: MOD_ENUM }), patch: PATCH_ITEMS } },
        },
        {
            name: "run_module", description: "Corre el cálculo de un módulo con el estado guardado del usuario (o el ejemplo de la guía si no hay) más overrides opcionales, sin guardar nada. Devuelve un resumen: resultados clave, verificaciones que no cumplen y errores.",
            input_schema: { type: "object", additionalProperties: false, required: ["module"], properties: { module: S("Módulo.", { enum: MOD_ENUM }), overrides: Object.assign({}, PATCH_ITEMS, { description: "Cambios temporales {path, value} para probar alternativas." }) } },
        },
    ].map((t) => Object.assign(t, { strict: true }));
    const TOOL_BY_NAME = Object.fromEntries(TOOL_DEFS.map((t) => [t.name, t]));

    // Definiciones para la API: con eager_input_streaming (la entrada llega en el stream sin buffer).
    function apiTools(opts = {}) {
        return TOOL_DEFS.map((t) => Object.assign({}, t, opts.eager === false ? {} : { eager_input_streaming: true }));
    }

    /* =====================================================================
       Ejecutor
       ===================================================================== */
    function truncate(s, max = RESULT_MAX) {
        if (s.length <= max) return s;
        return s.slice(0, max) + `\n[…resultado truncado: se muestran ${max} de ${s.length} caracteres. Pedí una parte más chica (filtro, grupo, página o módulo).]`;
    }
    const nope = (msg) => ({ content: msg, is_error: true });

    function createExecutor(env) {
        const storage = env.storage || { getItem: () => null, setItem: () => { } };
        const calcs = env.calcs || {};
        const kb = env.kb || null;
        const confirm = env.confirm || (async () => false);
        const readJSON = (k) => { try { const r = storage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } };

        function calcOf(module) {
            const m = MODULES[module];
            if (!m) throw new Error(`Módulo desconocido «${module}». Opciones: ${Object.keys(MODULES).join(", ")}.`);
            const X = calcs[m.calc];
            if (!X || typeof X.calc !== "function") throw new Error(`El cálculo de ${module} no está cargado en esta página.`);
            return { m, X };
        }
        function loadState(module) {
            const { m, X } = calcOf(module);
            const st = clone(X.DEF);
            const raw = readJSON(m.key);
            if (raw && raw.__v === X.DEF.__v) return { state: Object.assign(st, raw), source: "guardado por el usuario" };
            return { state: st, source: raw ? "ejemplo de la guía (el estado guardado es de otra versión)" : "ejemplo de la guía (no hay datos guardados)" };
        }
        function runCalc(module, state) {
            const { X } = calcOf(module);
            let R;
            try { R = X.calc(clone(state)); } catch (e) { throw new Error(`El cálculo de ${module} falló: ${e.message}`); }
            return R;
        }
        function summary(module, state, R) {
            const base = { modulo: module, titulo: MODULES[module].title, modo: state.mode };
            const errs = R.errs || [];
            let s = {};
            try { s = errs.length && module === "red" && !R.hc ? SUMMARY.red(R, state) : SUMMARY[module](R, state); } catch (e) { s = { aviso: "No se pudo armar el resumen: " + e.message }; }
            return Object.assign(base, s, { verificaciones: checksSummary(R.checks || []), errores: errs });
        }

        // Compacta un estado grande: escalares completos, arrays largos resumidos.
        function compact(o, budget = 3500) {
            const full = JSON.stringify(o);
            if (full.length <= budget) return o;
            const out = {};
            for (const [k, v] of Object.entries(o)) {
                if (Array.isArray(v)) out[k] = JSON.stringify(v).length < 600 ? v : { _array: v.length, primeros: v.slice(0, 3), nota: `Lista de ${v.length} elementos; se muestran 3. Para cambiar uno usá la ruta "${k}.<índice>.<campo>".` };
                else if (isObj(v) && JSON.stringify(v).length > 800) out[k] = Object.fromEntries(Object.entries(v).map(([a, b]) => [a, isObj(b) || Array.isArray(b) ? (JSON.stringify(b).length < 200 ? b : `{${Array.isArray(b) ? b.length + " elementos" : Object.keys(b).join(", ")}}`) : b]));
                else out[k] = v;
            }
            return out;
        }

        const H = {
            async calc(a) {
                const vars = {};
                for (const x of a.vars || []) {
                    if (x.name in vars) throw new Error(`Variable repetida: «${x.name}».`);
                    vars[x.name] = x.value;
                }
                const v = evaluate(a.expression, vars);
                return { expression: a.expression, vars, result: sig(v, 6), result_es: fmtEs(sig(v, 6)), result_full: Number(v.toPrecision(15)) };
            },

            async kb_search(a) {
                await needKB();
                const k = a.k == null ? 5 : a.k;
                if (k < 1 || k > 8) throw new Error("k debe estar entre 1 y 8.");
                const res = kb.search(a.query, { module: a.module, kind: a.kind, k });
                return { query: a.query, resultados: res, nota: res.length ? "Leé el fragmento con kb_read antes de citarlo." : "Sin resultados: probá con otras palabras o sin filtros." };
            },
            async kb_read(a) { await needKB(); return kb.read(a.id); },
            async kb_table(a) { await needKB(true); return kb.table(a.id, a.filter); },
            async kb_formula(a) {
                await needKB(true);
                if (!a.id && !a.query) throw new Error("Indicá id o query.");
                return kb.formula(a.id || a.query);
            },
            async kb_criteria(a) { await needKB(true); return kb.criteriaFor(a.module, a.param); },

            async run_module(a) {
                const { state, source } = loadState(a.module);
                const { state: st2, diff } = applyPatch(state, a.overrides || []);
                const R = runCalc(a.module, st2);
                return Object.assign({ fuente_datos: source, overrides: diff.map((d) => `${d.path}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`) }, summary(a.module, st2, R));
            },

            async module_memo(a) {
                const { state, source } = loadState(a.module);
                const R = runCalc(a.module, state);
                const groups = (R.memo && R.memo.groups) || [];
                if (a.group == null || a.group === "") {
                    return { modulo: a.module, fuente_datos: source, grupos: groups.map((g, i) => ({ n: i + 1, titulo: g.title, items: g.items.length })), nota: "Pedí un grupo con group (número o parte del título)." };
                }
                let gi = /^\d+$/.test(String(a.group).trim()) ? +a.group - 1 : -1;
                if (gi < 0) { const q = norm(a.group); gi = groups.findIndex((g) => norm(g.title).includes(q)); }
                if (gi < 0 || gi >= groups.length) throw new Error(`No existe el grupo «${a.group}». Hay ${groups.length} grupos: ${groups.map((g, i) => `${i + 1}. ${g.title}`).join(" | ").slice(0, 1500)}`);
                const g = groups[gi];
                const lines = g.items.map((it) => {
                    if (it.note) return `Nota: ${it.note}`;
                    let eq = it.f || "";
                    if (it.s) eq += ` = ${it.s}`;
                    if (it.r != null) eq += ` = ${it.r}${it.u ? `\\;\\mathrm{${it.u}}` : ""}`;
                    const ok = it.ok === undefined ? "" : it.ok ? " [verifica]" : " [NO verifica]";
                    return `• ${it.n}${ok}: $$${eq}$$${it.nota ? ` (${it.nota})` : ""}`;
                });
                const pages = []; let cur = "";
                for (const l of lines) { if (cur && cur.length + l.length + 1 > MEMO_PAGE) { pages.push(cur); cur = ""; } cur += (cur ? "\n" : "") + l; }
                pages.push(cur);
                const p = a.page == null ? 1 : a.page;
                if (p < 1 || p > pages.length) throw new Error(`La página debe estar entre 1 y ${pages.length}.`);
                return `Memoria de cálculo · ${MODULES[a.module].title} · grupo ${gi + 1}/${groups.length}: ${g.title} · página ${p}/${pages.length} · datos: ${source}\n` + pages[p - 1];
            },

            async project_get(a) {
                if (READONLY[a.module]) {
                    const r = READONLY[a.module];
                    const o = r.pick(readJSON(r.key));
                    if (!o) return { modulo: a.module, titulo: r.title, guardado: false, nota: `No hay datos guardados. El usuario tiene que abrir ${r.page} y cargarlos.` };
                    return { modulo: a.module, titulo: r.title, guardado: true, solo_lectura: true, estado: compact(o) };
                }
                const { state, source } = loadState(a.module);
                return { modulo: a.module, titulo: MODULES[a.module].title, fuente_datos: source, estado: compact(state) };
            },

            async project_set(a) {
                if (!a.patch || !a.patch.length) throw new Error("El patch está vacío.");
                const { m } = calcOf(a.module);
                const { state, source } = loadState(a.module);
                const { state: st2, diff } = applyPatch(state, a.patch);
                const R = runCalc(a.module, st2); // verifica que el cálculo corra antes de pedir confirmación
                const ok = await confirm({ module: a.module, title: m.title, source, diff });
                if (!ok) return { aplicado: false, nota: "El usuario rechazó el cambio; no se guardó nada." };
                storage.setItem(m.key, JSON.stringify(st2));
                if (a.module === "red" && R.resumen) storage.setItem("sh-red-sum", JSON.stringify(R.resumen));
                return Object.assign({ aplicado: true, cambios: diff.map((d) => `${d.path}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`), nota: `Guardado. Si ${m.page} está abierta en otra pestaña, recargala.` }, summary(a.module, st2, R));
            },

            async checklist_get(a) {
                const all = await checklistRows();
                const rows = a && a.area ? all.filter((r) => norm(r.area) === norm(a.area)) : all;
                if (a && a.area && !rows.length) throw new Error(`No hay ítems del área «${a.area}». Áreas: ${Array.from(new Set(all.map((r) => r.area))).join(", ")}.`);
                const cuenta = (s) => rows.filter((r) => r.status === s).length;
                const aplica = rows.length - cuenta("no_aplica");
                const secciones = [];
                for (const r of rows) {
                    const key = `${r.area} · ${r.grupo}`;
                    let sec = secciones.find((x) => x.seccion === key);
                    if (!sec) { sec = { seccion: key, items: [] }; secciones.push(sec); }
                    sec.items.push(`${r.id} ${CK_MARK[r.status]} ${r.item}` + (r.peso != null ? ` (peso ${r.peso})` : "") + (r.note ? ` — nota: ${r.note}` : ""));
                }
                const out = {
                    fuente: kbChecklist() ? "kb/checklist.json" : "lista interna (sistema de ponderación 2026)", formato: "id estado ítem; estado: [ ] pendiente, [~] en progreso, [x] hecho, [-] no aplica",
                    progreso: { hecho: cuenta("hecho"), en_progreso: cuenta("en_progreso"), pendiente: cuenta("pendiente"), no_aplica: cuenta("no_aplica"), porcentaje: aplica ? Math.round(100 * cuenta("hecho") / aplica) : 0 },
                    secciones,
                };
                if (a && a.area) out.area = a.area;
                if (!(a && a.area) && JSON.stringify(out).length > RESULT_MAX - 200) {
                    out.secciones = secciones.map((x) => ({ seccion: x.seccion, items: x.items.length, hechos: x.items.filter((i) => / \[x\] /.test(i)).length }));
                    out.nota = `La lista es larga: pedí checklist_get con area (${Array.from(new Set(all.map((r) => r.area))).join(" o ")}) para ver los ítems.`;
                }
                return out;
            },
            async checklist_update(a) {
                const items = await checklistItems();
                const it = items.find((x) => x.id === a.id);
                if (!it) throw new Error(`No existe el ítem «${a.id}». Ids válidos: ${items.map((x) => x.id).join(", ")}.`);
                const user = readJSON(CK_KEY) || {};
                user[a.id] = { status: a.status, note: a.note || (user[a.id] && user[a.id].note) || "", at: new Date().toISOString() };
                storage.setItem(CK_KEY, JSON.stringify(user));
                return { actualizado: true, id: a.id, item: it.item, status: a.status };
            },

            async open_page(a) {
                const p = PAGES[a.page];
                if (!p) throw new Error(`Página desconocida «${a.page}».`);
                if (a.anchor && !/^[A-Za-z0-9_-]{1,60}$/.test(a.anchor)) throw new Error("El anchor solo puede tener letras, números, - y _.");
                return { url: p[0] + (a.anchor ? "#" + a.anchor : ""), titulo: p[1], nota: "Mostrale el enlace al usuario en formato Markdown." };
            },
        };

        async function checklistRows() {
            const items = await checklistItems();
            const user = readJSON(CK_KEY) || {};
            return items.map((x) => {
                const r = { id: x.id, item: x.item, area: x.area, grupo: x.grupo, page: x.page || null, status: (user[x.id] && user[x.id].status) || "pendiente" };
                if (x.module) r.module = x.module;
                if (x.peso != null) r.peso = x.peso;
                if (user[x.id] && user[x.id].note) r.note = user[x.id].note;
                return r;
            });
        }
        const kbChecklist = () => kb && kb.loaded && kb.checklist && kb.checklist.length ? kb.checklist : null;
        async function checklistItems() { if (kb && !kb.loaded) await kb.load(); return normChecklist(kbChecklist() || DEFAULT_CHECKLIST); }
        async function needKB(any) {
            if (!kb) throw new Error("Base de conocimiento no disponible.");
            if (!kb.loaded) await kb.load();
            if (!any && !kb.status.available) throw new Error("Base de conocimiento no disponible (no se encontró kb/index.json). Respondé con lo que sepas aclarando que no pudiste verificar la fuente, y sugerí revisar la norma original.");
        }

        // Ejecuta una herramienta; nunca lanza: los errores vuelven como {is_error: true}.
        async function exec(name, input) {
            let def = TOOL_BY_NAME[name];
            if (!def) {
                const alt = TOOL_DEFS.find((t) => t.name.toLowerCase() === String(name).toLowerCase());
                if (!alt) return nope(`Herramienta desconocida «${name}». Disponibles: ${TOOL_DEFS.map((t) => t.name).join(", ")}.`);
                def = alt;
            }
            const errs = validate(def.input_schema, input == null ? {} : input);
            if (errs.length) return nope(`Entrada inválida para ${def.name}: ${errs.join("; ")}. Corregí la llamada.`);
            try {
                const out = await H[def.name](input || {});
                const text = typeof out === "string" ? out : JSON.stringify(out);
                return { content: truncate(text), is_error: false };
            } catch (e) {
                return nope(`Error en ${def.name}: ${e && e.message ? e.message : String(e)}`);
            }
        }

        return { exec, loadState, runCalc, summary: (module) => { const { state } = loadState(module); return summary(module, state, runCalc(module, state)); }, checklist: () => H.checklist_get(), checklistRows, setChecklist: (id, status, note) => H.checklist_update({ id, status, note }) };
    }

    function norm(s) { return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }

    const api = { TOOL_DEFS, apiTools, createExecutor, evaluate, validate, applyPatch, truncate, sig, MODULES, READONLY, PAGES, PAGE_TO_MODULE, DEFAULT_CHECKLIST, CK_KEY, CK_STATUS, RESULT_MAX };
    root.AgentTools = api;
    if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
