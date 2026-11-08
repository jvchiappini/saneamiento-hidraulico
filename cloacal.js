"use strict";
/* =====================================================================
   cloacal.js — Red de alcantarillado sanitario (Clase 6 · hoja
   "RED CLOACAL"). Caudales acumulados, infiltración, pendiente mínima
   (NBR 9649), cotas de fondo, profundidades y velocidad de Bazin.
   ===================================================================== */
(function (root) {
    const MC = root.MC || require("./mod-core.js");

    const reg = (id, ct) => ({ id, ct });
    const tr = (de, a, lotes, L, recibe) => ({ de, a, lotes, L: L || 112, recibe: recibe !== false, I: null, D: null });
    const DEF = {
        __v: 2,
        mode: "auto",
        qEdif: 2.146527777777778, ret: 80, K1: 1.2, K2: 1.5, tasaInf: 0.05,
        vMin: 0.6, vMax: 5, gamma: 0.14, hMin: 1.2, hMaxDes: 3.0, Dmin: 0.15, qMinTramo: 1.5, paso: 0.05,
        registros: [
            reg("7", 97), reg("6", 96.667), reg("5", 96.333), reg("4", 96), reg("3", 95.333), reg("2", 94.667), reg("1", 94),
            reg("17", 96), reg("16", 95.796), reg("15", 95.660), reg("14", 95.389), reg("13", 94.593), reg("12", 94.062), reg("11", 93),
            reg("27", 95), reg("26", 94.667), reg("25", 94.444), reg("24", 94), reg("23", 93.333), reg("22", 92.889), reg("21", 92),
            reg("PTAR", 73),
        ],
        tramos: [
            tr("7", "6", 2), tr("6", "5", 2), tr("5", "4", 2), tr("4", "3", 2), tr("3", "2", 2), tr("2", "1", 2), tr("1", "11", 1),
            tr("7", "17", 1, 112, false), tr("6", "16", 2, 112, false), tr("5", "15", 2, 112, false), tr("4", "14", 2, 112, false), tr("3", "13", 2, 112, false), tr("2", "12", 2, 112, false),
            tr("17", "16", 4), tr("16", "15", 4), tr("15", "14", 4), tr("14", "13", 4), tr("13", "12", 4), tr("12", "11", 4),
            tr("17", "27", 1, 112, false), tr("16", "26", 2, 112, false), tr("15", "25", 2, 112, false), tr("14", "24", 2, 112, false), tr("13", "23", 2, 112, false), tr("12", "22", 2, 112, false),
            tr("27", "26", 2), tr("26", "25", 2), tr("25", "24", 2), tr("24", "23", 2), tr("23", "22", 2), tr("22", "21", 2),
            tr("11", "21", 1), tr("21", "PTAR", 0, 500),
        ],
    };
    const D_CLO = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.60, 0.70, 0.80, 1.00];

    function calc(st) {
        const m = new MC.Memo(), checks = [], errs = [], log = [];
        const auto = st.mode === "auto";
        const R = { errs };
        const ctOf = {}; st.registros.forEach((r) => { ctOf[r.id] = r.ct; });
        const T = st.tramos;
        T.forEach((t, i) => {
            if (!(t.de in ctOf)) errs.push(`Tramo ${i + 1}: el registro "${t.de}" no existe.`);
            if (!(t.a in ctOf)) errs.push(`Tramo ${i + 1}: el registro "${t.a}" no existe.`);
        });
        const qMax = st.qEdif * st.ret / 100 * st.K1 * st.K2;
        const Ltot = MC.sum(T.map((t) => t.L));
        const lotes = MC.sum(T.map((t) => t.lotes));
        Object.assign(R, { qMax, Ltot, lotes });
        m.g("1. Caudales de diseño");
        m.add("Caudal máximo de desagüe por edificio", "q_{max} = q_{edif}\\cdot C\\cdot K_1\\cdot K_2", `${MC.tn(st.qEdif, 4)}\\cdot ${MC.tn(st.ret / 100, 2)}\\cdot ${MC.tn(st.K1, 2)}\\cdot ${MC.tn(st.K2, 2)}`, MC.tn(qMax, 4), "l/s/lote");
        m.add("Longitud total de la red", "L_T = \\sum L_{tramo}", "", MC.tn(Ltot, 2), "m");
        if (errs.length) return fin();

        // Orden topológico: un tramo depende de los que terminan en su registro de inicio y le descargan.
        const into = {}; // registro → tramos que llegan
        T.forEach((t, i) => { (into[t.a] = into[t.a] || []).push(i); });
        const salen = {}; T.forEach((t, i) => { (salen[t.de] = salen[t.de] || []).push(i); });
        // En cada registro con aportes, exactamente un tramo saliente debe recibirlos
        Object.keys(into).forEach((r) => {
            const sal = (salen[r] || []);
            const rec = sal.filter((i) => T[i].recibe);
            if (sal.length && rec.length !== 1) errs.push(`En el registro ${r} llegan tramos y ${rec.length === 0 ? "ningún" : "más de un"} tramo saliente está marcado para recibir los aportes.`);
        });
        const outlets = st.registros.filter((r) => !(salen[r.id] || []).length && (into[r.id] || []).length);
        if (outlets.length !== 1) errs.push(`La red debe terminar en un único punto de descarga (hay ${outlets.length}: ${outlets.map((o) => o.id).join(", ") || "ninguno"}).`);
        if (errs.length) return fin();
        const ups = T.map((t) => (t.recibe ? (into[t.de] || []) : []));
        const order = [], state = T.map(() => 0);
        const visit = (i) => {
            if (state[i] === 2) return; if (state[i] === 1) { errs.push("La red tiene un circuito cerrado; una red cloacal debe ser ramificada."); return; }
            state[i] = 1; ups[i].forEach(visit); state[i] = 2; order.push(i);
        };
        T.forEach((_, i) => visit(i));
        if (errs.length) return fin();

        const Dlist = D_CLO.filter((d) => d >= st.Dmin - 1e-9);
        const r = T.map(() => ({}));
        order.forEach((i) => {
            const t = T[i], x = r[i];
            x.qTr = t.lotes * qMax;
            x.qAc = x.qTr + MC.sum(ups[i].map((u) => r[u].qAc));
            x.qInf = st.tasaInf * t.L / 1000 + MC.sum(ups[i].map((u) => r[u].qInf));
            x.qTot = x.qAc + x.qInf;
            x.qDis = Math.max(x.qTot, st.qMinTramo);
            x.Imin = 0.0055 * Math.pow(x.qDis, -0.47); // m/m
            x.ctE = ctOf[t.de]; x.ctS = ctOf[t.a];
            x.Iter = (x.ctE - x.ctS) / t.L;
            const dUp = ups[i].length ? Math.max(...ups[i].map((u) => r[u].D)) : 0;
            const cfUp = ups[i].length ? ups[i].map((u) => ({ cf: r[u].cfS, D: r[u].D })) : [];
            const evalD = (D, I) => {
                const RH = D / 4, v = MC.vBazin(RH, I, st.gamma), Qc = MC.area(D) * v;
                // cota de fondo de entrada: empalme por la clave con los aportes y recubrimiento mínimo
                const cfHead = x.ctE - (st.hMin + D);
                const cfE = cfUp.length ? Math.min(cfHead, ...cfUp.map((u) => u.cf - Math.max(0, D - u.D))) : cfHead;
                const cfS = cfE - I * t.L;
                const pE = x.ctE - cfE, pS = x.ctS - cfS;
                const ok = v >= st.vMin - 1e-9 && v <= st.vMax + 1e-9 && Qc >= x.qTot / 1000 - 1e-12 && I >= x.Imin - 1e-12 && pE >= st.hMin - 1e-9 && pS >= st.hMin - 1e-9 && D >= dUp - 1e-9;
                return { D, I, RH, v, Qc, cfE, cfS, pE, pS, ok };
            };
            let sel = null;
            if (auto) {
                const tries = [], oks = [];
                for (const D of Dlist) {
                    if (D < dUp - 1e-9) continue;
                    const v1 = MC.vBazin(D / 4, 1, st.gamma), Q1 = MC.area(D) * v1; // con I = 1 m/m
                    const Iv = Math.pow(st.vMin / v1, 2), Iq = Math.pow((x.qTot / 1000) / Q1, 2), Ivmax = Math.pow(st.vMax / v1, 2);
                    const Ineed = Math.max(x.Imin, Iv, Iq);
                    if (Ineed > Ivmax) { tries.push({ D, I: Ineed, nota: "v > v máx." }); continue; }
                    // Si el terreno baja más que lo necesario se sigue el terreno (no se profundiza), sin pasar v máx.
                    let I = MC.ceilStep(Math.max(Ineed, Math.min(x.Iter, Ivmax)) * 100, st.paso) / 100;
                    if (I > Ivmax) I = MC.floorStep(Ivmax * 100, st.paso) / 100;
                    if (I < Ineed - 1e-12) { tries.push({ D, I: Ineed, nota: "sin pendiente válida" }); continue; }
                    const e = evalD(D, I);
                    tries.push({ D, I, v: e.v, ok: e.ok, pS: e.pS });
                    if (e.ok) oks.push(e);
                }
                // Menor diámetro que no supere la profundidad máxima deseada (o que al menos no profundice
                // respecto de la entrada); si ninguno, el de menor profundidad de salida.
                sel = oks.find((e) => e.pS <= Math.max(st.hMaxDes, e.pE) + 1e-9) || oks.slice().sort((a, b) => a.pS - b.pS || a.D - b.D)[0] || null;
                log.push({ i, tries, sel: sel ? sel.D : null });
                if (!sel) { const D = Math.max(dUp, Dlist[0]); sel = evalD(D, MC.ceilStep(Math.max(x.Imin, x.Iter) * 100, st.paso) / 100); }
            } else {
                const D = t.D != null ? t.D : Math.max(dUp, Dlist[0]);
                const I = t.I != null ? t.I / 100 : MC.ceilStep(Math.max(x.Imin, x.Iter > 0 ? x.Iter : 0) * 100, st.paso) / 100;
                sel = evalD(D, I);
            }
            Object.assign(x, sel);
            x.desc = x.I * t.L;
            x.chk = {
                v1: x.v >= st.vMin - 1e-9, v2: x.v <= st.vMax + 1e-9, q: x.Qc >= x.qTot / 1000 - 1e-12, I: x.I >= x.Imin - 1e-12,
                pE: x.pE >= st.hMin - 1e-9, pS: x.pS >= st.hMin - 1e-9, Dm: x.D >= st.Dmin - 1e-9, Dup: x.D >= dUp - 1e-9,
            };
            x.ok = Object.values(x.chk).every(Boolean);
        });
        R.r = r; R.order = order; R.ups = ups; R.log = log;
        const outlet = order[order.length - 1];
        R.Qfinal = r[outlet].qTot;

        m.add("Caudal del tramo", "Q_{tr} = n_{lotes}\\cdot q_{max}", "", null, "", { nota: "Caudal acumulado = caudal del tramo + caudales acumulados de los tramos que le descargan. La infiltración se acumula igual: \\(Q_{inf} = t_{inf}\\,L/1000 + \\sum Q_{inf,aguas\\;arriba}\\)." });
        m.add("Caudal de diseño", "Q_d = \\max(Q_{ac} + Q_{inf};\\; 1{,}5\\;\\mathrm{l/s})", "", null, "");
        m.add("Pendiente mínima (NBR 9649)", "I_{min} = 0{,}0055\\, Q_d^{-0{,}47}", "", null, "", { nota: "Q en l/s, I en m/m." });
        m.add("Velocidad a sección llena (Bazin)", "v = \\dfrac{87}{1 + \\gamma/\\sqrt{R_H}}\\sqrt{R_H\\, I}, \\quad R_H = \\dfrac{D}{4}", "", null, "", { nota: `γ = ${MC.f(st.gamma, 3)}.` });
        m.add("Capacidad a sección llena", "Q_{ll} = \\dfrac{\\pi D^2}{4}\\, v", "", null, "");
        m.add("Cota de fondo", "CF_{s} = CF_{e} - I\\cdot L, \\quad CF_e = \\min\\left(CT_e - (h_{min} + D);\\; CF_{s,aporte} - (D - D_{aporte})\\right)", "", null, "", { nota: `Registro de arranque: recubrimiento mínimo ${MC.f(st.hMin, 2)} m sobre la clave. En las uniones se empalman las claves con los tramos que llegan.` });
        order.forEach((i) => {
            const t = T[i], x = r[i];
            m.g(`Tramo ${t.de} → ${t.a}`);
            m.add("Caudal del tramo", "Q_{tr} = n\\cdot q_{max}", `${t.lotes}\\cdot ${MC.tn(qMax, 4)}`, MC.tn(x.qTr, 3), "l/s");
            if (ups[i].length) m.add("Caudal acumulado", "Q_{ac} = Q_{tr} + \\sum Q_{ac,aporte}", `${MC.tn(x.qTr, 3)} + ${ups[i].map((u) => MC.tn(r[u].qAc, 3)).join(" + ")}`, MC.tn(x.qAc, 3), "l/s");
            m.add("Infiltración acumulada", "Q_{inf} = t_{inf}\\,\\dfrac{L}{1000} + \\sum Q_{inf,aporte}", `${MC.tn(st.tasaInf, 3)}\\cdot\\dfrac{${MC.tn(t.L, 1)}}{1000}${ups[i].length ? " + " + ups[i].map((u) => MC.tn(r[u].qInf, 4)).join(" + ") : ""}`, MC.tn(x.qInf, 4), "l/s");
            m.add("Caudal de diseño", "Q_d = \\max(Q_{ac}+Q_{inf};\\,1{,}5)", `\\max(${MC.tn(x.qTot, 3)};\\,1{,}5)`, MC.tn(x.qDis, 3), "l/s");
            m.add("Pendiente mínima", "I_{min} = 0{,}0055\\,Q_d^{-0{,}47}", `0{,}0055\\cdot ${MC.tn(x.qDis, 3)}^{-0{,}47}`, MC.tn(x.Imin * 100, 3), "\\%", { nota: `Pendiente adoptada I = ${MC.f(x.I * 100, 2)} %` });
            m.add("Velocidad (Bazin)", "v = \\dfrac{87}{1+\\gamma/\\sqrt{R_H}}\\sqrt{R_H I}", `\\dfrac{87}{1+${MC.tn(st.gamma, 2)}/\\sqrt{${MC.tn(x.RH, 4)}}}\\sqrt{${MC.tn(x.RH, 4)}\\cdot ${MC.tn(x.I, 4)}}`, MC.tn(x.v, 3), "m/s", { ok: x.chk.v1 && x.chk.v2 });
            m.add("Capacidad", "Q_{ll} = \\dfrac{\\pi D^2}{4}v", `\\dfrac{\\pi\\cdot ${MC.tn(x.D, 2)}^2}{4}\\cdot ${MC.tn(x.v, 3)}`, MC.tn(x.Qc, 4), "m^3/s", { ok: x.chk.q, nota: `Caudal a conducir: ${MC.f(x.qTot / 1000, 5)} m³/s` });
            m.add("Cotas de fondo", "CF_s = CF_e - I\\,L", `${MC.tn(x.cfE, 3)} - ${MC.tn(x.I, 4)}\\cdot ${MC.tn(t.L, 1)}`, MC.tn(x.cfS, 3), "m", { nota: `Profundidad entrada ${MC.f(x.pE, 3)} m · salida ${MC.f(x.pS, 3)} m (mín. ${MC.f(st.hMin, 2)} m)`, ok: x.chk.pE && x.chk.pS });
        });

        // Verificaciones globales
        checks.push({ n: "Nº de lotes de la red = edificios", d: `${lotes} lotes`, ok: true, okTxt: "Informativo" });
        const qMaxEsp = lotes * qMax;
        checks.push({ n: "Caudal en la descarga = Σ(lotes)·q_max + infiltración total", d: `${MC.f(R.Qfinal, 3)} = ${MC.f(qMaxEsp, 3)} + ${MC.f(st.tasaInf * Ltot / 1000, 4)} l/s`, ok: Math.abs(R.Qfinal - qMaxEsp - st.tasaInf * Ltot / 1000) < 1e-6 });
        order.forEach((i) => {
            const x = r[i], t = T[i];
            const bad = Object.entries(x.chk).filter(([, v]) => !v).map(([k]) => ({ v1: "v < v mín.", v2: "v > v máx.", q: "capacidad insuficiente", I: "I < I mín.", pE: "profundidad de entrada < mín.", pS: "profundidad de salida < mín.", Dm: "D < D mín.", Dup: "D menor que aguas arriba" }[k]));
            checks.push({ n: `Tramo ${t.de} → ${t.a}`, d: `D ${MC.f(x.D, 2)} m · I ${MC.f(x.I * 100, 2)} % · v ${MC.f(x.v, 2)} m/s${bad.length ? " · " + bad.join(", ") : ""}`, ok: x.ok });
        });
        return fin();

        function fin() { R.memo = m; R.checks = checks; return R; }
    }

    /* =====================================================================
       Interfaz
       ===================================================================== */
    const KEY = "sh-cloacal-v1";
    let st, R;
    function ui() {
        st = MC.load(KEY, DEF);
        const root = MC.$("app");
        MC.bindAll(root, st, () => { MC.save(KEY, st); recompute(); });
        root.addEventListener("click", onClick);
        renderInputs(); doRecompute(); MC.setupNavToggle();
    }
    function onClick(ev) {
        const b = ev.target.closest("[data-act],[data-mode]");
        if (!b) return;
        if (b.dataset.mode) st.mode = b.dataset.mode;
        const act = b.dataset.act, i = +b.dataset.i;
        if (act === "add-reg") st.registros.push({ id: String(st.registros.length + 1), ct: 0 });
        if (act === "del-reg") st.registros.splice(i, 1);
        if (act === "add-tr") st.tramos.push({ de: st.registros[0].id, a: st.registros[0].id, lotes: 0, L: 112, recibe: true, I: null, D: null });
        if (act === "del-tr") st.tramos.splice(i, 1);
        if (act === "copy-auto" && R && R.r) { st.tramos.forEach((t, k) => { t.I = +(R.r[k].I * 100).toFixed(4); t.D = R.r[k].D; }); st.mode = "manual"; }
        if (act === "clear-man") st.tramos.forEach((t) => { t.I = null; t.D = null; });
        if (act === "import") {
            const red = MC.read("sh-red-sum");
            if (red) { st.qEdif = red.qMed / (MC.read("sh-red-v1") || { nEdif: 72 }).nEdif; st.K1 = red.K1; st.K2 = red.K2; alert(`Importado de la red de distribución: q por edificio ${MC.f(st.qEdif, 4)} l/s, K1 ${st.K1}, K2 ${st.K2}`); }
            else alert("No hay datos guardados de la Red de distribución.");
        }
        if (act === "reset") { if (!confirm("¿Volver a los datos de ejemplo de la guía?")) return; st = JSON.parse(JSON.stringify(DEF)); }
        MC.save(KEY, st); renderInputs(); doRecompute();
    }
    function renderInputs() {
        const auto = st.mode === "auto";
        MC.$("mode").innerHTML = MC.modeBar(st.mode);
        MC.$("in-base").innerHTML = [
            MC.field("qEdif", "Caudal por edificio (agua)", st.qEdif, { unit: "l/s/lote" }),
            MC.field("ret", "Coeficiente de retorno", st.ret, { unit: "%", help: "80 a 90 %" }),
            MC.field("K1", "K1", st.K1), MC.field("K2", "K2", st.K2),
            MC.field("tasaInf", "Tasa de infiltración", st.tasaInf, { unit: "l/s/km" }),
            MC.field("qMinTramo", "Caudal mínimo por tramo", st.qMinTramo, { unit: "l/s" }),
            MC.field("vMin", "Velocidad mínima", st.vMin, { unit: "m/s" }),
            MC.field("vMax", "Velocidad máxima", st.vMax, { unit: "m/s" }),
            MC.field("gamma", "Coeficiente γ de Bazin", st.gamma, { help: "La planilla de la cátedra calcula con 0,14" }),
            MC.field("hMin", "Profundidad mínima (recubrimiento)", st.hMin, { unit: "m" }),
            MC.field("hMaxDes", "Profundidad máxima deseada (algoritmo)", st.hMaxDes, { unit: "m" }),
            MC.field("Dmin", "Diámetro mínimo", st.Dmin, { type: "select", num: true, unit: "m", options: D_CLO.map((d) => ({ v: d, t: MC.f(d, 2) + " m" })) }),
            MC.field("paso", "Redondeo de la pendiente adoptada", st.paso, { unit: "%" }),
        ].join("");
        const ni = (p, v, w) => `<input type="number" step="any" data-bind="${p}" data-type="num" value="${v}" style="width:${w || 70}px">`;
        const ti = (p, v, w) => `<input type="text" data-bind="${p}" data-type="text" value="${MC.esc(v)}" style="width:${w || 60}px">`;
        const rOpts = (p, v) => `<select data-bind="${p}" data-type="text">${st.registros.map((r) => `<option ${r.id === v ? "selected" : ""}>${MC.esc(r.id)}</option>`).join("")}</select>`;
        MC.$("ed-reg").innerHTML = MC.table(["Registro", "Cota de terreno (m)", ""], st.registros.map((r, i) => [ti(`registros.${i}.id`, r.id), ni(`registros.${i}.ct`, r.ct, 90), `<button type="button" class="btn-x" data-act="del-reg" data-i="${i}">✕</button>`])) + `<button type="button" class="btn-sm" data-act="add-reg">+ Registro</button>`;
        MC.$("ed-tr").innerHTML = MC.table(["#", "Desde", "Hasta", "Nº lotes", "L (m)", "Recibe aportes", `Pendiente I (%)${auto ? " · auto" : ""}`, `Diámetro (m)${auto ? " · auto" : ""}`, ""],
            st.tramos.map((t, i) => [i + 1, rOpts(`tramos.${i}.de`, t.de), rOpts(`tramos.${i}.a`, t.a), ni(`tramos.${i}.lotes`, t.lotes, 55), ni(`tramos.${i}.L`, t.L, 65),
            `<select data-bind="tramos.${i}.recibe" data-type="bool-s"><option value="1" ${t.recibe ? "selected" : ""}>sí</option><option value="0" ${!t.recibe ? "selected" : ""}>no (arranque)</option></select>`,
            auto ? `<span class="ro" id="ro-I-${i}">—</span>` : `<input type="number" step="any" data-bind="tramos.${i}.I" data-type="num-null" value="${t.I == null ? "" : t.I}" placeholder="auto" style="width:75px">`,
            auto ? `<span class="ro" id="ro-D-${i}">—</span>` : `<select data-bind="tramos.${i}.D" data-type="num-null"><option value="">auto</option>${D_CLO.map((d) => `<option value="${d}" ${t.D === d ? "selected" : ""}>${MC.f(d, 2)}</option>`).join("")}</select>`,
            `<button type="button" class="btn-x" data-act="del-tr" data-i="${i}">✕</button>`]))
            + `<button type="button" class="btn-sm" data-act="add-tr">+ Tramo</button>` + (auto ? "" : ` <button type="button" class="btn-sm" data-act="clear-man">Borrar pendientes y diámetros manuales</button>`);
    }
    const recompute = MC.debounce(() => doRecompute(), 250);
    function doRecompute() { R = calc(st); render(); }
    function render() {
        MC.$("errs").innerHTML = R.errs.length ? `<div class="alert">${R.errs.map((e) => `<div>⚠ ${MC.esc(e)}</div>`).join("")}</div>` : "";
        MC.$("out-base").innerHTML = MC.kv([["Caudal máximo por edificio", MC.f(R.qMax, 4), "l/s/lote", 1], ["Longitud total de la red", MC.f(R.Ltot, 2), "m"], ["Nº de lotes", R.lotes, ""], ["Caudal en la descarga", R.Qfinal != null ? MC.f(R.Qfinal, 3) : "—", "l/s", 1]]);
        MC.$("hero-kpis").innerHTML = MC.kpi("q máx. por edificio", MC.f(R.qMax, 3), "l/s") + MC.kpi("Longitud de red", MC.f(R.Ltot, 0), "m") + (R.Qfinal != null ? MC.kpi("Caudal a la PTAR", MC.f(R.Qfinal, 2), "l/s") : "");
        if (!R.r) { MC.$("out-tab").innerHTML = ""; renderInforme(); return; }
        const T = st.tramos;
        if (st.mode === "auto") T.forEach((t, i) => { const a = MC.$("ro-I-" + i), b = MC.$("ro-D-" + i); if (a) a.textContent = MC.f(R.r[i].I * 100, 2); if (b) b.textContent = MC.f(R.r[i].D, 2); });
        MC.$("out-tab").innerHTML = MC.table(["Tramo", "Lotes", "L (m)", "Q tramo (l/s)", "Q acum. (l/s)", "Q inf. (l/s)", "Q diseño (l/s)", "I mín (%)", "I adopt. (%)", "Descenso (m)", "CT entrada", "CT salida", "CF entrada", "CF salida", "Prof. entrada (m)", "Prof. salida (m)", "D (m)", "R<sub>H</sub>", "v (m/s)", "Q<sub>ll</sub> (m³/s)", "Q a conducir (m³/s)", "Estado"],
            R.order.map((i) => {
                const t = T[i], x = R.r[i];
                return { cls: x.ok ? "" : "bad", cells: [`T${t.de}-${t.a}`, t.lotes, MC.f(t.L, 1), MC.f(x.qTr, 3), MC.f(x.qAc, 3), MC.fx(x.qInf, 4), MC.f(x.qDis, 3), MC.fx(x.Imin * 100, 3), MC.fx(x.I * 100, 2), MC.fx(x.desc, 3), MC.fx(x.ctE, 3), MC.fx(x.ctS, 3), MC.fx(x.cfE, 3), MC.fx(x.cfS, 3), MC.badge(x.chk.pE, MC.fx(x.pE, 3), MC.fx(x.pE, 3)), MC.badge(x.chk.pS, MC.fx(x.pS, 3), MC.fx(x.pS, 3)), MC.fx(x.D, 2), MC.fx(x.RH, 4), MC.badge(x.chk.v1 && x.chk.v2, MC.fx(x.v, 3), MC.fx(x.v, 3)), MC.fx(x.Qc, 4), MC.fx(x.qTot / 1000, 5), MC.badge(x.ok)] };
            })) + `<p class="footnote">Tramos en orden de cálculo (de aguas arriba hacia la descarga). CT = cota de terreno, CF = cota de fondo (invertida). Velocidad y capacidad a sección llena.</p>`
            + (st.mode === "auto" ? `<details class="notes"><summary>Registro del algoritmo</summary><div class="notes-body"><p>Para cada tramo (de aguas arriba hacia abajo) se prueba desde el diámetro mínimo (sin achicar respecto de aguas arriba) la menor pendiente que cumple I ≥ I<sub>min</sub>, v ≥ v<sub>mín</sub> y capacidad suficiente; si el terreno baja más, se sigue la pendiente del terreno para no profundizar (sin pasar v<sub>máx</sub>). Se redondea hacia arriba a múltiplos de ${MC.f(st.paso, 2)} %.</p>${MC.table(["Tramo", "Intentos (D m · I %)"], R.log.map((l) => [`T${T[l.i].de}-${T[l.i].a}`, l.tries.map((x) => `${MC.f(x.D, 2)} · ${MC.f(x.I * 100, 2)}${x.ok ? " ✓" : x.nota ? " (" + x.nota + ")" : " ✕"}`).join(" → ")]))}</div></details><button type="button" class="btn-sm" data-act="copy-auto">Pasar estos valores a modo manual</button>` : "");
        renderInforme();
    }
    function renderInforme() {
        const T = st.tramos;
        MC.$("informe-body").innerHTML = MC.informeHTML({
            titulo: "Red de alcantarillado sanitario",
            sub: "Caudales · pendientes · cotas · profundidades · velocidades (Bazin)",
            datos: [["Caudal por edificio", MC.f(st.qEdif, 4), "l/s"], ["Coeficiente de retorno", st.ret, "%"], ["K1 / K2", `${st.K1} / ${st.K2}`, ""], ["Tasa de infiltración", st.tasaInf, "l/s/km"], ["γ de Bazin", st.gamma, ""], ["Velocidades", `${st.vMin} – ${st.vMax}`, "m/s"], ["Profundidad mínima", st.hMin, "m"], ["Diámetro mínimo", st.Dmin, "m"]],
            secciones: R.r ? [{ t: "Planilla de la red", html: MC.table(["Tramo", "L", "Q diseño (l/s)", "I (%)", "D (m)", "v (m/s)", "CF entrada", "CF salida", "Prof. e/s (m)"], R.order.map((i) => { const t = T[i], x = R.r[i]; return [`T${t.de}-${t.a}`, MC.f(t.L, 0), MC.f(x.qDis, 3), MC.f(x.I * 100, 2), MC.f(x.D, 2), MC.f(x.v, 3), MC.f(x.cfE, 3), MC.f(x.cfS, 3), `${MC.f(x.pE, 2)} / ${MC.f(x.pS, 2)}`]; })) }] : [],
            memo: R.memo, checks: R.checks,
        });
        MC.typeset(MC.$("informe-body"));
    }

    root.CloacalCalc = { DEF, calc };
    if (typeof module !== "undefined") module.exports = root.CloacalCalc;
    // La interfaz arranca solo en su propia página: así el cálculo se puede cargar desde otra (p. ej. chat.html).
    if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => { if (document.body && document.body.dataset.page === "cloacal" && document.getElementById("app")) ui(); });
})(typeof window !== "undefined" ? window : globalThis);
