"use strict";
/* =====================================================================
   tanque.js — Sistema de impulsión desde el reservorio de la planta
   potabilizadora al tanque elevado de la red (Clase 5 · hoja
   "SISTEMA DE IMPULSIÓN AL TANQUE").
   ===================================================================== */
(function (root) {
    const MC = root.MC || require("./mod-core.js");

    const DEF = {
        __v: 2,
        mode: "auto",
        qMed: 13353.12, K1: 1.2, N: 12,
        cotaBomba: 97, cotaTanque: 97, Hbase: 10.46, Htanque: 6.962, hRes: 3.6,
        Li: 2045.86, Pll: 1.0, vMin: 0.6, vMax: 3.5, extraS: 2.0, sobreS: 1.5,
        alts: [{ dS: 550, dI: 500 }, { dS: 500, dI: 450 }, { dS: 350, dI: 300 }],
        sel: null, padop: null,
        fitS: [{ k: "valvPie", n: 1 }, { k: "curva90", n: 2 }, { k: "teeBilateral", n: 1 }, { k: "regComp", n: 1 }],
        fitI: [{ k: "curva90", n: 1 }, { k: "retLiviana", n: 1 }, { k: "regComp", n: 1 }, { k: "teeLateral", n: 1 }],
        cost: {
            kwh: 0.06, tasa: 8, mant: 2, vidaB: 7, vidaT: 50,
            tubo: { 100: 35, 125: 45, 150: 55, 200: 75, 250: 95, 300: 115, 350: 140, 400: 165, 450: 190, 500: 220, 550: 250, 600: 280 },
            bomba: { 1: 500, 1.5: 600, 2: 700, 3: 850, 5: 1200, 7.5: 1600, 10: 2000, 15: 2800, 20: 3500, 25: 4200, 30: 4900, 40: 6200, 50: 7500, 60: 8700, 75: 10500, 100: 13500, 125: 16500, 150: 19500, 200: 25000, 300: 36000, 400: 47000, 500: 58000 },
        },
    };
    const DN_CAND = [100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600];

    function crf(i, n) { const f = Math.pow(1 + i, n); return i * f / (f - 1); }
    function costoBomba(st, hp) {
        const ks = Object.keys(st.cost.bomba).map(Number).sort((a, b) => a - b);
        const k = ks.find((x) => x >= hp - 1e-9);
        return k != null ? st.cost.bomba[k] : st.cost.bomba[ks[ks.length - 1]] * hp / ks[ks.length - 1];
    }

    function base(st) {
        const Qb = st.K1 * st.qMed / 86400;
        const X = st.N / 24;
        const Db = MC.bresse(Qb, X);
        const Hs = st.hRes + st.sobreS;
        const Ls = Hs + st.extraS;
        const Hi = (st.cotaTanque - st.cotaBomba) + st.Hbase + st.Htanque;
        const eb = MC.etaBomba(Qb * 1000);
        return { Qb, X, Db, Hs, Ls, Hi, eb };
    }

    function alt(st, b, dS, dI, padopMan) {
        const g = MC.G;
        const vS = b.Qb / MC.area(dS / 1000), vI = b.Qb / MC.area(dI / 1000);
        const JS = MC.jFWH(b.Qb, dS / 1000), JI = MC.jFWH(b.Qb, dI / 1000);
        const lqS = MC.leqList(dS, st.fitS), lqI = MC.leqList(dI, st.fitI);
        const hvS = vS * vS / (2 * g), hvI = vI * vI / (2 * g);
        const HmS = b.Hs + (b.Ls + lqS.total) * JS + hvS;
        const HmI = b.Hi + (st.Li + lqI.total) * JI + hvI;
        const H = HmS + HmI + st.Pll;
        const etaB = b.eb.eta;
        const Pcv = 1000 * b.Qb * H / (75 * etaB);
        const Php = Pcv / MC.CV_POR_HP;
        const em = MC.etaMotor(Php);
        const Pmb = Php / em.eta;
        const hg = MC.holgura(Pmb);
        const Psel = Pmb * (1 + hg.h);
        const PadAuto = MC.hpComercial(Psel);
        const Padop = padopMan != null ? padopMan : PadAuto;
        const hCav = hvS + 0.2, hPozo = Math.max(hCav, 0.5);
        const vOkS = vS >= st.vMin && vS <= st.vMax, vOkI = vI >= st.vMin && vI <= st.vMax;
        const sGt = dS > dI;
        // costos
        const c = st.cost, i = c.tasa / 100;
        const tubo = (c.tubo[dI] || 0) * st.Li + (c.tubo[dS] || 0) * b.Ls;
        const bomba = costoBomba(st, Padop);
        const kWh = Pmb * 0.7457 * st.N * 365;
        const energia = kWh * c.kwh;
        const mant = (tubo + bomba) * c.mant / 100;
        const anual = tubo * crf(i, c.vidaT) + bomba * crf(i, c.vidaB) + energia + mant;
        return { dS, dI, vS, vI, JS, JI, lqS, lqI, hvS, hvI, HmS, HmI, H, etaB, Pcv, Php, em, Pmb, hg, Psel, PadAuto, Padop, hCav, hPozo, vOkS, vOkI, sGt, ok: vOkS && vOkI && sGt, tubo, bomba, kWh, energia, mant, anual, crfT: crf(i, c.vidaT), crfB: crf(i, c.vidaB) };
    }

    function calc(st) {
        const b = base(st), auto = st.mode === "auto";
        const m = new MC.Memo(), checks = [], log = [];
        let alts, cand = [];
        // Todos los diámetros comerciales candidatos (impulsión) con succión = comercial inmediato superior
        DN_CAND.forEach((dI) => {
            const s = DN_CAND.find((x) => x > dI);
            if (!s) return;
            const a = alt(st, b, s, dI);
            cand.push(a);
            log.push({ dI, dS: s, vS: a.vS, vI: a.vI, ok: a.ok, anual: a.anual, P: a.PadAuto });
        });
        const valid = cand.filter((a) => a.ok);
        const best = valid.slice().sort((x, y) => x.anual - y.anual)[0] || null;
        if (auto) {
            // Tres alternativas en torno a Bresse: una inferior, la comercial de Bresse y una superior (que verifiquen).
            const dB = (DN_CAND.find((d) => d >= b.Db * 1000 - 1e-9) || DN_CAND[DN_CAND.length - 2]);
            const iB = cand.findIndex((a) => a.dI === dB);
            const pick = [cand[iB - 1], cand[iB], cand[iB + 1]].filter(Boolean);
            alts = pick;
            if (best && !alts.some((a) => a.dI === best.dI)) alts.push(best);
            alts.sort((x, y) => x.dI - y.dI);
        } else {
            alts = st.alts.map((a, k) => alt(st, b, a.dS, a.dI, k === (st.sel == null ? -1 : st.sel) ? st.padop : null));
        }
        const okAlts = alts.filter((a) => a.ok);
        let selIdx;
        if (!auto && st.sel != null && alts[st.sel]) selIdx = st.sel;
        else {
            const sorted = okAlts.slice().sort((x, y) => x.anual - y.anual);
            selIdx = sorted.length ? alts.indexOf(sorted[0]) : 0;
        }
        const A = alts[selIdx];

        // ---- Memoria ----
        m.g("1. Caudal de bombeo y diámetro de Bresse");
        m.add("Caudal de bombeo", "Q_b = \\dfrac{K_1\\cdot Q_{med}}{86400}", `\\dfrac{${MC.tn(st.K1, 2)}\\cdot ${MC.tn(st.qMed, 2)}}{86400}`, MC.tn(b.Qb, 5), "m^3/s");
        m.add("Fracción de horas de bombeo", "X = \\dfrac{N}{24}", `\\dfrac{${MC.tn(st.N, 2)}}{24}`, MC.tn(b.X, 4), "");
        m.add("Diámetro de Bresse", "D = 1{,}3\\,\\sqrt{Q_b}\\;X^{1/4}", `1{,}3\\cdot\\sqrt{${MC.tn(b.Qb, 5)}}\\cdot ${MC.tn(b.X, 4)}^{1/4}`, MC.tn(b.Db, 4), "m");
        m.g("2. Alturas topográficas y longitudes");
        m.add("Altura topográfica de succión", "H_s = h_{res} + 1{,}50", `${MC.tn(st.hRes, 2)} + ${MC.tn(st.sobreS, 2)}`, MC.tn(b.Hs, 2), "m", { nota: "Profundidad del reservorio de agua tratada + 1,00 m + 0,50 m (guía de la cátedra)." });
        m.add("Longitud de succión", "L_s = H_s + 2{,}00", `${MC.tn(b.Hs, 2)} + ${MC.tn(st.extraS, 2)}`, MC.tn(b.Ls, 2), "m");
        m.add("Altura topográfica de impulsión", "H_i = (CT_{tanque} - CT_{bomba}) + H_{base} + H_{tanque}", `(${MC.tn(st.cotaTanque, 2)} - ${MC.tn(st.cotaBomba, 2)}) + ${MC.tn(st.Hbase, 2)} + ${MC.tn(st.Htanque, 3)}`, MC.tn(b.Hi, 3), "m");
        if (A) {
            m.g(`3. Alternativa adoptada: succión ${A.dS} mm · impulsión ${A.dI} mm`);
            m.add("Velocidad en succión", "v_s = \\dfrac{4\\,Q_b}{\\pi D_s^2}", `\\dfrac{4\\cdot ${MC.tn(b.Qb, 5)}}{\\pi\\cdot ${MC.tn(A.dS / 1000, 3)}^2}`, MC.tn(A.vS, 3), "m/s", { ok: A.vOkS });
            m.add("Velocidad en impulsión", "v_i = \\dfrac{4\\,Q_b}{\\pi D_i^2}", `\\dfrac{4\\cdot ${MC.tn(b.Qb, 5)}}{\\pi\\cdot ${MC.tn(A.dI / 1000, 3)}^2}`, MC.tn(A.vI, 3), "m/s", { ok: A.vOkI });
            m.add("Pérdida unitaria en succión (Fair-Whipple-Hsiao)", "J_s = \\left(\\dfrac{Q_b}{27{,}113\\,D_s^{2{,}596}}\\right)^{1/0{,}532}", `\\left(\\dfrac{${MC.tn(b.Qb, 5)}}{27{,}113\\cdot ${MC.tn(A.dS / 1000, 3)}^{2{,}596}}\\right)^{1/0{,}532}`, MC.tn(A.JS, 6), "m/m");
            m.add("Pérdida unitaria en impulsión (Fair-Whipple-Hsiao)", "J_i = \\left(\\dfrac{Q_b}{27{,}113\\,D_i^{2{,}596}}\\right)^{1/0{,}532}", `\\left(\\dfrac{${MC.tn(b.Qb, 5)}}{27{,}113\\cdot ${MC.tn(A.dI / 1000, 3)}^{2{,}596}}\\right)^{1/0{,}532}`, MC.tn(A.JI, 6), "m/m");
            m.add("Longitud equivalente en succión (Tabla 3, NP 68)", "L_{eq,s} = \\sum n\\cdot L_{eq}", A.lqS.rows.map((r) => `${r.n}\\cdot ${MC.tn(r.unit, 2)}`).join(" + "), MC.tn(A.lqS.total, 2), "m", { nota: A.lqS.rows.map((r) => `${r.name}${r.extrap ? " (extrapolado: L/D constante desde DN 350)" : ""}`).join(" · ") });
            m.add("Longitud equivalente en impulsión (Tabla 3, NP 68)", "L_{eq,i} = \\sum n\\cdot L_{eq}", A.lqI.rows.map((r) => `${r.n}\\cdot ${MC.tn(r.unit, 2)}`).join(" + "), MC.tn(A.lqI.total, 2), "m", { nota: A.lqI.rows.map((r) => `${r.name}${r.extrap ? " (extrapolado: L/D constante desde DN 350)" : ""}`).join(" · ") });
            m.add("Altura manométrica de succión", "H_{m,s} = H_s + (L_s + L_{eq,s})\\,J_s + \\dfrac{v_s^2}{2g}", `${MC.tn(b.Hs, 2)} + (${MC.tn(b.Ls, 2)} + ${MC.tn(A.lqS.total, 2)})\\cdot ${MC.tn(A.JS, 6)} + \\dfrac{${MC.tn(A.vS, 3)}^2}{2\\cdot 9{,}81}`, MC.tn(A.HmS, 3), "m.c.a.");
            m.add("Altura manométrica de impulsión", "H_{m,i} = H_i + (L_i + L_{eq,i})\\,J_i + \\dfrac{v_i^2}{2g}", `${MC.tn(b.Hi, 3)} + (${MC.tn(st.Li, 2)} + ${MC.tn(A.lqI.total, 2)})\\cdot ${MC.tn(A.JI, 6)} + \\dfrac{${MC.tn(A.vI, 3)}^2}{2\\cdot 9{,}81}`, MC.tn(A.HmI, 3), "m.c.a.");
            m.add("Altura manométrica total", "H_m = H_{m,s} + H_{m,i} + P_{ll}", `${MC.tn(A.HmS, 3)} + ${MC.tn(A.HmI, 3)} + ${MC.tn(st.Pll, 2)}`, MC.tn(A.H, 3), "m.c.a.");
            m.g("4. Potencia");
            m.add("Rendimiento de la bomba (Tabla VI)", "\\eta_b", `Q_b = ${MC.tn(b.Qb * 1000, 2)}\\;\\mathrm{l/s} \\rightarrow Q_{tab} = ${MC.tg(b.eb.qTab)}`, MC.tn(A.etaB, 2), "");
            m.add("Potencia de la bomba", "P_b = \\dfrac{\\gamma\\, Q_b\\, H_m}{75\\,\\eta_b}", `\\dfrac{1000\\cdot ${MC.tn(b.Qb, 5)}\\cdot ${MC.tn(A.H, 3)}}{75\\cdot ${MC.tn(A.etaB, 2)}}`, MC.tn(A.Pcv, 2), "CV");
            m.add("Conversión a HP (1 HP = 1,014 CV)", "P = \\dfrac{P_b}{1{,}014}", `\\dfrac{${MC.tn(A.Pcv, 2)}}{1{,}014}`, MC.tn(A.Php, 2), "HP");
            m.add("Rendimiento del motor (Tabla VII)", "\\eta_m", `P = ${MC.tn(A.Php, 2)}\\;\\mathrm{HP} \\rightarrow ${A.em.hpLabel}\\;\\mathrm{HP}`, MC.tn(A.em.eta, 3), "");
            m.add("Potencia del conjunto motor-bomba", "P_{mb} = \\dfrac{P}{\\eta_m}", `\\dfrac{${MC.tn(A.Php, 2)}}{${MC.tn(A.em.eta, 3)}}`, MC.tn(A.Pmb, 2), "HP");
            m.add("Potencia con holgura (Tabla VIII)", "P_{sel} = P_{mb}\\,(1 + h)", `${MC.tn(A.Pmb, 2)}\\cdot(1 + ${MC.tn(A.hg.h, 2)})`, MC.tn(A.Psel, 2), "HP", { nota: `Holgura ${MC.f(A.hg.h * 100, 0)} % (${A.hg.txt}). Potencia comercial adoptada: ${MC.hpTxt(A.Padop)} HP.` });
            m.g("5. Pozo de bombeo");
            m.add("Sumergencia por cavitación", "h_{cav} = \\dfrac{v_s^2}{2g} + 0{,}20", `\\dfrac{${MC.tn(A.vS, 3)}^2}{2\\cdot 9{,}81} + 0{,}20`, MC.tn(A.hCav, 3), "m", { nota: `Se adopta el mayor entre h_cav y 0,50 m por seguridad: ${MC.f(A.hPozo, 2)} m.` });
            m.g("6. Costo anual de la alternativa");
            m.add("Factor de recuperación de capital", "FRC = \\dfrac{i(1+i)^n}{(1+i)^n - 1}", "", `${MC.tn(A.crfT, 5)}\\;(n=${st.cost.vidaT}) \\quad ${MC.tn(A.crfB, 5)}\\;(n=${st.cost.vidaB})`, "");
            m.add("Costo anual", "C_a = C_{tub}\\,FRC_{tub} + C_{bomba}\\,FRC_{bomba} + C_{energ} + C_{mant}", `${MC.tn(A.tubo, 0)}\\cdot ${MC.tn(A.crfT, 5)} + ${MC.tn(A.bomba, 0)}\\cdot ${MC.tn(A.crfB, 5)} + ${MC.tn(A.energia, 0)} + ${MC.tn(A.mant, 0)}`, MC.tn(A.anual, 0), "US\\$/año");

            checks.push({ n: `Velocidad de succión entre ${st.vMin} y ${st.vMax} m/s`, d: `${MC.f(A.vS, 3)} m/s`, ok: A.vOkS, failTxt: A.vS < st.vMin ? "Disminuir diámetro" : "Aumentar diámetro" });
            checks.push({ n: `Velocidad de impulsión entre ${st.vMin} y ${st.vMax} m/s`, d: `${MC.f(A.vI, 3)} m/s`, ok: A.vOkI, failTxt: A.vI < st.vMin ? "Disminuir diámetro" : "Aumentar diámetro" });
            checks.push({ n: "Diámetro de succión mayor que el de impulsión", d: `${A.dS} > ${A.dI} mm`, ok: A.sGt });
            checks.push({ n: "Potencia adoptada ≥ potencia con holgura", d: `${MC.hpTxt(A.Padop)} HP ≥ ${MC.f(A.Psel, 2)} HP`, ok: A.Padop >= A.Psel - 1e-9 });
            if (A.lqS.extrap || A.lqI.extrap) checks.push({ n: "Longitudes equivalentes dentro de la Tabla 3 (DN ≤ 350 mm)", d: "Para DN > 350 se extrapoló con L/D constante", ok: false, warn: true, failTxt: "Extrapolado" });
            if (best) checks.push({ n: "Alternativa adoptada = mínimo costo anual entre las que verifican", d: `óptima: ${best.dI} mm (${MC.f(best.anual, 0)} US$/año)`, ok: A.dI === best.dI && A.dS === best.dS, warn: true, failTxt: "Hay otra más económica" });
        }
        return { b, alts, selIdx, A, cand, best, log, memo: m, checks };
    }

    /* =====================================================================
       Interfaz
       ===================================================================== */
    const KEY = "sh-tanque-v1";
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
        if (b.dataset.mode) { st.mode = b.dataset.mode; }
        const act = b.dataset.act, i = +b.dataset.i;
        if (act === "sel") st.sel = i;
        if (act === "add-fs") st.fitS.push({ k: "curva90", n: 1 });
        if (act === "add-fi") st.fitI.push({ k: "curva90", n: 1 });
        if (act === "del-fs") st.fitS.splice(i, 1);
        if (act === "del-fi") st.fitI.splice(i, 1);
        if (act === "copy-auto" && R) { st.alts = R.alts.slice(0, 3).map((a) => ({ dS: a.dS, dI: a.dI })); while (st.alts.length < 3) st.alts.push({ dS: 500, dI: 450 }); st.sel = Math.min(R.selIdx, 2); st.mode = "manual"; }
        if (act === "import") importar();
        if (act === "reset") { if (!confirm("¿Volver a los datos de ejemplo de la guía?")) return; st = JSON.parse(JSON.stringify(DEF)); }
        MC.save(KEY, st); renderInputs(); doRecompute();
    }
    function importar() {
        const red = MC.read("sh-red-sum");
        const o = MC.read("sh-state-v1");
        const msg = [];
        if (red) { st.Hbase = red.Hbase; st.Htanque = +red.Htot.toFixed(3); st.cotaTanque = red.ctTanque; st.K1 = red.K1; st.qMed = +(red.qMed * 86.4).toFixed(3); msg.push(`De la red: H base ${MC.f(red.Hbase, 2)} m, H tanque ${MC.f(red.Htot, 3)} m, cota ${red.ctTanque}, Qmed ${MC.f(st.qMed, 2)} m³/d`); }
        else if (o && o.S) {
            const S = o.S;
            const pob = S.manzanas * S.lotes * (S.pisos * S.deptos * (S.dorm * S.persDorm + S.persServ));
            const lg = S.deptos * S.pisos * S.pctLog / 100 * S.lotes * S.manzanas;
            st.qMed = +((pob * S.qDept + lg * S.qLog) / 1000).toFixed(3); st.K1 = S.k1;
            msg.push(`De la impulsión del río: Qmed ${MC.f(st.qMed, 2)} m³/d`);
        }
        alert(msg.length ? "Importado. " + msg.join(" · ") : "No hay datos guardados de la Red de distribución ni de la Impulsión del río.");
    }

    function fitEditor(list, pref, path) {
        const opts = (v) => MC.T3_COLS.map((c) => `<option value="${c.k}" ${c.k === v ? "selected" : ""}>${MC.esc(c.n)}</option>`).join("");
        return MC.table(["Accesorio (Tabla 3 · NP 68)", "Cantidad", ""], list.map((it, i) => [
            `<select data-bind="${path}.${i}.k" data-type="text">${opts(it.k)}</select>`,
            `<input type="number" step="1" min="0" data-bind="${path}.${i}.n" data-type="num" value="${it.n}" style="width:70px">`,
            `<button type="button" class="btn-x" data-act="del-${pref}" data-i="${i}">✕</button>`])) + `<button type="button" class="btn-sm" data-act="add-${pref}">+ Accesorio</button>`;
    }

    function renderInputs() {
        const auto = st.mode === "auto";
        MC.$("mode").innerHTML = MC.modeBar(st.mode);
        MC.$("in-base").innerHTML = [
            MC.field("qMed", "Caudal medio diario", st.qMed, { unit: "m³/d" }),
            MC.field("K1", "K1", st.K1),
            MC.field("N", "Horas de operación de la bomba por día", st.N, { unit: "h" }),
            MC.field("cotaBomba", "Cota de la base de la motobomba", st.cotaBomba, { unit: "msnm" }),
            MC.field("cotaTanque", "Cota de terreno en la base del tanque elevado", st.cotaTanque, { unit: "msnm" }),
            MC.field("Hbase", "Altura de la base del tanque (de Presiones)", st.Hbase, { unit: "m" }),
            MC.field("Htanque", "Altura total del tanque elevado", st.Htanque, { unit: "m" }),
            MC.field("hRes", "Profundidad del reservorio de agua tratada", st.hRes, { unit: "m" }),
            MC.field("sobreS", "Altura adicional de succión (1,00 + 0,50)", st.sobreS, { unit: "m" }),
            MC.field("extraS", "Longitud adicional de succión", st.extraS, { unit: "m" }),
            MC.field("Li", "Longitud real de la impulsión", st.Li, { unit: "m" }),
            MC.field("Pll", "Presión de llegada al tanque", st.Pll, { unit: "m" }),
            MC.field("vMin", "Velocidad mínima", st.vMin, { unit: "m/s" }),
            MC.field("vMax", "Velocidad máxima", st.vMax, { unit: "m/s" }),
        ].join("");
        MC.$("in-fit").innerHTML = `<div class="grid-2"><div class="panel"><h3>Succión</h3>${fitEditor(st.fitS, "fs", "fitS")}</div><div class="panel"><h3>Impulsión</h3>${fitEditor(st.fitI, "fi", "fitI")}</div></div>`;
        const dOpts = (path, v) => `<select data-bind="${path}" data-type="num">${DN_CAND.map((d) => `<option value="${d}" ${d === v ? "selected" : ""}>${d} mm</option>`).join("")}</select>`;
        MC.$("in-alts").innerHTML = auto ? `<p class="lede">En modo automático el algoritmo evalúa todos los diámetros comerciales (succión = comercial inmediato superior), propone tres alternativas en torno a Bresse y adopta la de <strong>mínimo costo anual</strong> entre las que verifican.</p>`
            : MC.table(["Alternativa", "Succión", "Impulsión"], st.alts.map((a, i) => [`Alt ${i + 1}`, dOpts(`alts.${i}.dS`, a.dS), dOpts(`alts.${i}.dI`, a.dI)]))
            + `<div class="grid-3">${MC.field("padop", "Potencia comercial adoptada (alternativa elegida)", st.padop, { unit: "HP", adopt: null, auto: false })}</div>`;
        const c = st.cost;
        MC.$("in-cost").innerHTML = `<div class="grid-3">${[MC.field("cost.kwh", "Costo de la energía", c.kwh, { unit: "US$/kWh" }), MC.field("cost.tasa", "Tasa de interés", c.tasa, { unit: "%" }), MC.field("cost.mant", "Mantenimiento anual", c.mant, { unit: "% de la inversión" }), MC.field("cost.vidaT", "Vida útil de la tubería", c.vidaT, { unit: "años" }), MC.field("cost.vidaB", "Vida útil de la bomba", c.vidaB, { unit: "años" })].join("")}</div>
            <details class="notes"><summary>Costos unitarios de referencia (editables)</summary><div class="notes-body grid-2">
            ${MC.table(["DN (mm)", "US$/m"], DN_CAND.map((d) => [d, `<input type="number" step="any" data-bind="cost.tubo.${d}" data-type="num" value="${c.tubo[d] || 0}" style="width:90px">`]))}
            ${MC.table(["HP", "US$"], Object.keys(c.bomba).map(Number).sort((a, b) => a - b).map((h) => [h, `<input type="number" step="any" data-bind="cost.bomba.${h}" data-type="num" value="${c.bomba[h]}" style="width:90px">`]))}
            </div></details>`;
    }

    const recompute = MC.debounce(() => doRecompute(), 250);
    function doRecompute() { R = calc(st); render(); }

    function render() {
        const A = R.A, b = R.b;
        MC.$("hero-kpis").innerHTML = MC.kpi("Caudal de bombeo", MC.f(b.Qb * 1000, 2), "l/s") + MC.kpi("Bresse", MC.f(b.Db * 1000, 0), "mm")
            + (A ? MC.kpi("Altura manométrica", MC.f(A.H, 2), "m.c.a.") + MC.kpi("Potencia adoptada", MC.hpTxt(A.Padop), "HP") : "");
        MC.$("out-base").innerHTML = MC.kv([["Caudal de bombeo Q<sub>b</sub>", MC.fx(b.Qb, 5), "m³/s"], ["Q<sub>b</sub>", MC.f(b.Qb * 1000, 3), "l/s"], ["Diámetro de Bresse", MC.f(b.Db, 4), "m", 1], ["H<sub>s</sub> succión", MC.f(b.Hs, 2), "m"], ["L<sub>s</sub> succión", MC.f(b.Ls, 2), "m"], ["H<sub>i</sub> impulsión", MC.f(b.Hi, 3), "m"], ["η bomba (Tabla VI)", MC.f(b.eb.eta * 100, 0), "%"]]);
        const head = ["", ...R.alts.map((a, i) => `Alt ${i + 1}${i === R.selIdx ? " ★" : ""}`)];
        const row = (lab, fn) => [lab, ...R.alts.map(fn)];
        MC.$("out-alts").innerHTML = MC.table(head, [
            row("Succión / impulsión (mm)", (a) => `${a.dS} / ${a.dI}`),
            row("v succión (m/s)", (a) => `${MC.f(a.vS, 3)} ${MC.badge(a.vOkS, "ok", a.vS < st.vMin ? "baja" : "alta")}`),
            row("v impulsión (m/s)", (a) => `${MC.f(a.vI, 3)} ${MC.badge(a.vOkI, "ok", a.vI < st.vMin ? "baja" : "alta")}`),
            row("J succión (m/m)", (a) => MC.fx(a.JS, 5)), row("J impulsión (m/m)", (a) => MC.fx(a.JI, 5)),
            row("L<sub>eq</sub> succión (m)", (a) => MC.f(a.lqS.total, 2) + (a.lqS.extrap ? "*" : "")), row("L<sub>eq</sub> impulsión (m)", (a) => MC.f(a.lqI.total, 2) + (a.lqI.extrap ? "*" : "")),
            row("H<sub>m</sub> succión (m)", (a) => MC.f(a.HmS, 3)), row("H<sub>m</sub> impulsión (m)", (a) => MC.f(a.HmI, 3)), row("<strong>H<sub>m</sub> total (m)</strong>", (a) => `<strong>${MC.f(a.H, 3)}</strong>`),
            row("P<sub>b</sub> (CV)", (a) => MC.f(a.Pcv, 2)), row("P (HP)", (a) => MC.f(a.Php, 2)), row("η motor (Tabla VII)", (a) => MC.f(a.em.eta * 100, 1) + " %"),
            row("P<sub>mb</sub> (HP)", (a) => MC.f(a.Pmb, 2)), row("Holgura (Tabla VIII)", (a) => MC.f(a.hg.h * 100, 0) + " %"), row("P con holgura (HP)", (a) => MC.f(a.Psel, 2)),
            row("<strong>P adoptada (HP)</strong>", (a) => `<strong>${MC.hpTxt(a.Padop)}</strong>`), row("Pozo: sumergencia (m)", (a) => MC.f(a.hPozo, 2)),
            row("Costo anual (US$/año)", (a) => MC.f(a.anual, 0)),
            row("", (a, i) => st.mode === "manual" ? `<button type="button" class="btn-sm" data-act="sel" data-i="${R.alts.indexOf(a)}">${R.alts.indexOf(a) === R.selIdx ? "Adoptada" : "Adoptar"}</button>` : (R.alts.indexOf(a) === R.selIdx ? "<strong>Adoptada</strong>" : "")),
        ]) + `<p class="footnote">* Longitud equivalente extrapolada (la Tabla 3 de la NP 68 llega a DN 350 mm; se mantiene L/D constante).</p>`
            + (st.mode === "auto" ? `<button type="button" class="btn-sm" data-act="copy-auto">Pasar estas alternativas a modo manual</button>` : "");
        MC.$("out-cand").innerHTML = MC.table(["Impulsión", "Succión", "v succ.", "v imp.", "Verifica", "P (HP)", "Costo anual (US$)"],
            R.cand.map((a) => ({ cls: R.best && a.dI === R.best.dI ? "hl" : "", cells: [a.dI, a.dS, MC.f(a.vS, 2), MC.f(a.vI, 2), MC.badge(a.ok), MC.hpTxt(a.PadAuto), MC.f(a.anual, 0)] })));
        renderInforme();
    }

    function renderInforme() {
        const A = R.A;
        MC.$("informe-body").innerHTML = MC.informeHTML({
            titulo: "Sistema de impulsión al tanque elevado",
            sub: "Caudal de bombeo · diámetros · pérdidas · altura manométrica · potencia · pozo · costos",
            datos: [["Caudal medio diario", MC.f(st.qMed, 2), "m³/d"], ["K1", st.K1, ""], ["Horas de bombeo", st.N, "h/día"], ["Cota base motobomba", st.cotaBomba, "msnm"], ["Cota base del tanque", st.cotaTanque, "msnm"], ["Altura base del tanque", st.Hbase, "m"], ["Altura del tanque", st.Htanque, "m"], ["Profundidad del reservorio", st.hRes, "m"], ["Longitud de impulsión", st.Li, "m"], ["Presión de llegada", st.Pll, "m"]],
            secciones: [{ t: "Alternativas evaluadas", html: MC.table(["Alt", "Succión (mm)", "Impulsión (mm)", "H<sub>m</sub> (m)", "P adoptada (HP)", "Costo anual (US$)", "Verifica"], R.alts.map((a, i) => [i + 1 + (i === R.selIdx ? " ★" : ""), a.dS, a.dI, MC.f(a.H, 2), MC.hpTxt(a.Padop), MC.f(a.anual, 0), a.ok ? "sí" : "no"])) }],
            memo: R.memo, checks: R.checks,
            notas: A ? `<p>Se adopta la alternativa de succión ${A.dS} mm e impulsión ${A.dI} mm con una motobomba de ${MC.hpTxt(A.Padop)} HP y sumergencia mínima de ${MC.f(A.hPozo, 2)} m en el pozo de bombeo.</p>` : "",
        });
        MC.typeset(MC.$("informe-body"));
    }

    root.TanqueCalc = { DEF, calc };
    if (typeof module !== "undefined") module.exports = root.TanqueCalc;
    if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", ui);
})(typeof window !== "undefined" ? window : globalThis);
