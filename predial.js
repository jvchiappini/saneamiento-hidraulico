"use strict";
/* =====================================================================
   predial.js — Instalación domiciliaria de agua potable de un edificio
   (Clase 7 · Guía de memoria de cálculo predial · NP 68, Norma de agua
   caliente 2016 y Ordenanza N° 038 de prevención de incendios).
   ===================================================================== */
(function (root) {
    const MC = root.MC || require("./mod-core.js");

    const DEF = {
        __v: 2,
        mode: "auto",
        edif: { pisos: 22, deptos: 6, dorm: 3, pd: 2, serv: 1, pctLog: 10, qDept: 200, qLog: 50, subsuelos: 1, hPiso: 3.0, areaPB: 2205, areaTot: 15000 },
        ambientes: [
            { id: "B1", n: "Baño Tipo 1", items: [{ a: "ducha", c: 1 }, { a: "lavatorio", c: 1 }, { a: "inodoroCisterna", c: 1 }] },
            { id: "B2", n: "Baño Tipo 2", items: [{ a: "lavatorio", c: 1 }, { a: "inodoroCisterna", c: 1 }] },
            { id: "LAV", n: "Lavadero", items: [{ a: "lavavajillas", c: 1 }] },
            { id: "COC", n: "Cocina", items: [{ a: "piletaCocina", c: 1 }, { a: "lavavajillas", c: 2 }] },
        ],
        unidades: [
            { id: "D1", n: "Departamento Tipo 1", items: [{ r: "B1", c: 2 }, { r: "COC", c: 1 }, { r: "LAV", c: 1 }] },
            { id: "D2", n: "Departamento Tipo 2", items: [{ r: "B1", c: 2 }, { r: "B2", c: 1 }, { r: "COC", c: 1 }, { r: "LAV", c: 1 }] },
        ],
        columnas: [
            { n: "Columna 1", pb: [{ r: "B2", c: 3 }], tipo: [{ r: "D1", c: 1 }, { r: "D2", c: 1 }] },
            { n: "Columna 2", pb: [{ r: "B2", c: 2 }], tipo: [{ r: "D1", c: 2 }] },
            { n: "Columna 3", pb: [{ r: "B2", c: 3 }], tipo: [{ r: "D1", c: 1 }, { r: "D2", c: 1 }] },
        ],
        acom: { TLLh: 6, Pkpa: 100 },
        bomb: { pctQh: 15, usoH: 6.66, nLlenado: 2 },
        tanq: { hInf: 1.5, relBA: 2, hSupObj: 4.0, paso: 0.10 },
        limp: { Ttrab: 18, Tlav: 2, Tdesc: 1 },
        eb: {
            HsSucc: 0.70, LrSucc: 2.40, LrImp: 78,
            fitS: [{ k: "curva90", n: 2 }, { k: "valvPie", n: 1 }, { k: "teeBilateral", n: 1 }],
            fitI: [{ k: "curva90", n: 3 }, { k: "retLiviana", n: 1 }, { k: "regComp", n: 1 }, { k: "teeLateral", n: 1 }, { k: "teeBilateral", n: 1 }],
        },
        ac: { tipo: "Departamento", termos: [{ n: "Termotanque por baño", cant: 2, items: [{ a: "Ducha", c: 1 }, { a: "Lavatorio", c: 1 }] }] },
        inc: { clase: 1, nSim: 2, dz: 0, perd: 0, jockeyKW: 0.9, dDist: 75, dBIE: 40 },
        adop: {},
    };

    // Norma de agua caliente 2016, Tabla III: litros por punto de utilización (60 °C) y coeficiente de consumo máximo
    const AC_TABLA = {
        Departamento: { c: 0.27, l: { Lavatorio: 8, "Bañera": 75, "Pileta de lavar platos": 40, Ducha: 280, Bidet: 8 } },
        Residencia: { c: 0.27, l: { Lavatorio: 8, "Bañera": 75, "Pileta de lavar platos": 40, Ducha: 280, Bidet: 8 } },
        Club: { c: 0.30, l: { Lavatorio: 8, "Lavatorio público": 25, "Pileta de lavar platos": 80, Ducha: 560, Bidet: 8 } },
        Hotel: { c: 0.25, l: { Lavatorio: 8, "Lavatorio público": 30, "Bañera": 75, "Pileta de lavar platos": 80, Ducha: 280, Bidet: 8 } },
        Oficina: { c: 0.30, l: { Lavatorio: 8, "Lavatorio público": 25 } },
        "Fábrica": { c: 0.40, l: { Lavatorio: 8, "Lavatorio público": 45, "Pileta de lavar platos": 80, Ducha: 840 } },
        Escuela: { c: 0.40, l: { Lavatorio: 8, "Lavatorio público": 55, "Pileta de lavar platos": 40, Ducha: 840 } },
    };
    const TERMO_COM = [30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500];
    // Ordenanza 038 (Ciudad del Este), Art. 50.1 y 50.2
    const ORD_CLASES = { 1: { q: 250, p: 6 }, 2: { q: 500, p: 15 }, 3: { q: 750, p: 30 } };
    const ordTiempo = (area) => (area <= 20000 ? 30 : area <= 30000 ? 45 : area <= 50000 ? 60 : 120);
    const PISO = ["Planta baja", "Primer", "Segundo", "Tercer", "Cuarto", "Quinto", "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo"];
    const pisoNombre = (k) => (k === 0 ? "Planta baja" : k <= 10 ? PISO[k] + " piso" : `Piso ${k}`);

    function calc(st) {
        const m = new MC.Memo(), checks = [], errs = [];
        const auto = st.mode === "auto";
        const A = (k, v) => (!auto && st.adop[k] != null && isFinite(st.adop[k]) ? st.adop[k] : v); // valor adoptado
        const R = { errs, auto: {} };
        const au = (k, v) => { R.auto[k] = v; return A(k, v); };
        const E = st.edif;

        /* ---------- I. Datos de entrada ---------- */
        const persDep = E.dorm * E.pd + E.serv;
        const pob = E.pisos * E.deptos * persDep;
        const logi = E.pisos * E.deptos * E.pctLog / 100;
        const QD = pob * E.qDept + logi * E.qLog;
        Object.assign(R, { persDep, pob, logi, QD });
        m.g("I. Datos de entrada del sistema");
        m.add("Personas por departamento", "n_{dep} = n_{dorm}\\cdot n_{p/dorm} + n_{serv}", `${E.dorm}\\cdot ${E.pd} + ${E.serv}`, MC.tn(persDep, 0), "pers.");
        m.add("Población de departamentos", "P_{dep} = n_{pisos}\\cdot n_{deptos}\\cdot n_{dep}", `${E.pisos}\\cdot ${E.deptos}\\cdot ${persDep}`, MC.tn(pob, 0), "pers.");
        m.add("Personal de logística", "P_{log} = n_{pisos}\\cdot n_{deptos}\\cdot \\dfrac{\\%_{log}}{100}", `${E.pisos}\\cdot ${E.deptos}\\cdot ${MC.tn(E.pctLog / 100, 2)}`, MC.tn(logi, 1), "pers.");
        m.add("Consumo diario del edificio", "Q_D = P_{dep}\\cdot q_{dep} + P_{log}\\cdot q_{log}", `${pob}\\cdot ${E.qDept} + ${MC.tn(logi, 1)}\\cdot ${E.qLog}`, MC.tn(QD, 0), "l/día");

        /* ---------- II.1 Pesos por ambiente ---------- */
        const ambOf = {}, uniOf = {};
        const amb = st.ambientes.map((a) => {
            const rows = a.items.map((it) => { const x = MC.art(it.a) || { n: it.a, p: 0, dmin: 15, q: 0 }; return { art: x, c: it.c, p: x.p * it.c }; });
            const P = MC.sum(rows.map((r) => r.p));
            const fig = MC.diamPorPesos(P);
            const dminArt = Math.max(15, ...rows.map((r) => r.art.dmin));
            const res = { a, rows, P, fig, dmin: Math.max(fig.mm, dminArt), Q: 0.3 * Math.sqrt(P) };
            ambOf[a.id] = res; return res;
        });
        m.g("II.1 Pesos relativos por ambiente (Tabla III y V, Figura I · NP 68)");
        amb.forEach((x) => m.add(x.a.n, `\\sum P_{${x.a.id}}`, x.rows.map((r) => `${r.c}\\cdot ${MC.tn(r.art.p, 1)}`).join(" + "), MC.tn(x.P, 2), "", { nota: `Sección mínima del ramal (Figura I, ΣP ≤ ${MC.f(x.fig.lim, 2)}): ${MC.pul(x.dmin)}. Sub-ramales: ${x.rows.map((r) => `${r.art.n} ${MC.pul(r.art.dmin)}`).join(" · ")}.` }));
        const uni = st.unidades.map((u) => {
            const rows = u.items.map((it) => { const ref = ambOf[it.r]; if (!ref) errs.push(`${u.n}: el ambiente "${it.r}" no existe.`); return { ref, id: it.r, c: it.c, pu: ref ? ref.P : 0, p: (ref ? ref.P : 0) * it.c }; });
            const P = MC.sum(rows.map((r) => r.p));
            const res = { u, rows, P }; uniOf[u.id] = res; return res;
        });
        m.g("II.1 Pesos por tipo de departamento");
        uni.forEach((x) => m.add(x.u.n, `\\sum P_{${x.u.id}}`, x.rows.map((r) => `${r.c}\\cdot ${MC.tn(r.pu, 2)}`).join(" + "), MC.tn(x.P, 2), ""));
        const refP = (id) => (uniOf[id] ? uniOf[id].P : ambOf[id] ? ambOf[id].P : (errs.push(`No existe el ambiente o departamento "${id}".`), 0));
        const refN = (id) => (uniOf[id] ? uniOf[id].u.n : ambOf[id] ? ambOf[id].a.n : id);

        /* ---------- II.2 Columnas de bajada ---------- */
        const nPisos = E.pisos;
        const cols = st.columnas.map((c) => {
            const pPB = MC.sum(c.pb.map((it) => it.c * refP(it.r)));
            const pT = MC.sum(c.tipo.map((it) => it.c * refP(it.r)));
            const rows = [];
            let acc = 0;
            for (let k = 0; k <= nPisos; k++) {
                const p = k === 0 ? pPB : pT;
                acc += p;
                const Q = 0.3 * Math.sqrt(acc);
                const fig = MC.diamPorPesos(acc), t4 = MC.diamPorCaudalIV(Q);
                const D = Math.max(fig.mm, t4.mm);
                rows.push({ k, p, acc, Q, fig, t4, D });
            }
            const Dtop = rows[rows.length - 1].D;
            return { c, pPB, pT, rows, Dtop, Ptot: acc };
        });
        R.cols = cols;
        const PBtot = MC.sum(cols.map((x) => x.pPB)), Ttot = MC.sum(cols.map((x) => x.pT));
        Object.assign(R, { amb, uni, PBtot, Ttot });
        m.g("II.2 Columnas de bajada (acumulado desde planta baja hasta el último piso)");
        m.add("Caudal probable", "Q = c\\sqrt{\\sum P},\\quad c = 0{,}30\\;\\mathrm{l/s}", "", null, "", { nota: "El tramo de columna que alimenta un piso conduce el peso acumulado de ese piso y todos los inferiores. Diámetro: Figura I (ΣP) y verificación del caudal máximo de la Tabla IV; se adopta el mayor." });
        cols.forEach((x) => {
            m.add(`${x.c.n}: peso por planta`, "P_{PB},\\; P_{tipo}", `${x.c.pb.map((it) => `${it.c}\\cdot ${MC.tn(refP(it.r), 2)}`).join(" + ") || "0"};\\;\\; ${x.c.tipo.map((it) => `${it.c}\\cdot ${MC.tn(refP(it.r), 2)}`).join(" + ") || "0"}`, `${MC.tn(x.pPB, 2)};\\; ${MC.tn(x.pT, 2)}`, "");
            const top = x.rows[x.rows.length - 1];
            m.add(`${x.c.n}: tramo superior (sale del tanque)`, "\\sum P = P_{PB} + n_{pisos}\\,P_{tipo}", `${MC.tn(x.pPB, 2)} + ${nPisos}\\cdot ${MC.tn(x.pT, 2)}`, MC.tn(top.acc, 2), "", { nota: `Q = 0,3·√${MC.f(top.acc, 2)} = ${MC.f(top.Q, 3)} l/s → Figura I: ${MC.pul(top.fig.mm)} · Tabla IV: ${MC.pul(top.t4.mm)} → se adopta ${MC.pul(top.D)}` });
        });

        /* ---------- III. Acometida ---------- */
        const TLLs = st.acom.TLLh * 3600;
        const QP = QD / TLLs;
        const fila = MC.tablaIIFila(st.acom.Pkpa);
        let dAcAuto = null, qmaxAc = null;
        if (fila) for (let j = 0; j < MC.TABLA_II_D.length; j++) if (fila[j + 1] >= QP - 1e-9) { dAcAuto = MC.TABLA_II_D[j]; qmaxAc = fila[j + 1]; break; }
        const acFuera = dAcAuto == null;
        const dAc = au("dAc", acFuera ? 50 : dAcAuto);
        const qmaxAdop = fila ? fila[MC.TABLA_II_D.indexOf(dAc) + 1] : null;
        Object.assign(R, { TLLs, QP, fila, dAc, acFuera, qmaxAdop });
        m.g("III. Tubería predial o acometida");
        m.add("Caudal mínimo de alimentación", "Q_P = \\dfrac{Q_D}{T_{LL}}", `\\dfrac{${MC.tn(QD, 0)}}{${MC.tn(TLLs, 0)}}`, MC.tn(QP, 3), "l/s", { nota: `T<sub>LL</sub> = ${MC.f(st.acom.TLLh, 2)} h/día (1 h ≤ T<sub>LL</sub> ≤ 6 h).` });
        m.add("Diámetro (Tabla II, NP 68)", `P_{d} = ${st.acom.Pkpa}\\;\\mathrm{kPa}\\;(${MC.tg(st.acom.Pkpa / 9.80665, 2)}\\;\\mathrm{m.c.a.})`, fila ? `\\text{fila } ${fila[0]}\\;\\mathrm{kPa}` : "\\text{fuera de tabla}", acFuera ? "\\text{ningún diámetro de la tabla alcanza}" : `${MC.pul(dAcAuto).replace(/"/g, "''")}\\;(Q_{max} = ${MC.tn(qmaxAc, 2)}\\;\\mathrm{l/s})`, "", { nota: `Se adopta Ø principal = Ø predial = ${MC.pul(dAc)}.` });
        checks.push({ n: "Acometida: caudal Q_P dentro de la capacidad de la Tabla II", d: `Q_P = ${MC.f(QP, 3)} l/s · Ø ${MC.pul(dAc)} admite ${qmaxAdop != null ? MC.f(qmaxAdop, 2) : "—"} l/s a ${fila ? fila[0] : "—"} kPa`, ok: qmaxAdop != null && qmaxAdop >= QP - 1e-9, failTxt: acFuera ? "Fuera de tabla (aumentar T_LL o presión)" : "No verifica" });
        checks.push({ n: "Tiempo de llenado 1 h ≤ T_LL ≤ 6 h", d: `${MC.f(st.acom.TLLh, 2)} h`, ok: st.acom.TLLh >= 1 && st.acom.TLLh <= 6 });

        /* ---------- IV/V. Impulsión y succión ---------- */
        const QBlh = st.bomb.pctQh / 100 * QD;
        const QB = QBlh / 3.6e6;
        const X = st.bomb.usoH / 24;
        const Dimp = MC.bresse(QB, X);
        const dImp = au("dImp", MC.nextDiam(Dimp * 1000).mm);
        const vImp = QB / MC.area(dImp / 1000);
        const dSucc = au("dSucc", MC.diamAbove(dImp).mm);
        const vSucc = QB / MC.area(dSucc / 1000);
        Object.assign(R, { QBlh, QB, X, Dimp, dImp, vImp, dSucc, vSucc });
        m.g("IV. Tubería de impulsión");
        m.add("Caudal de bombeo (15 % del consumo diario por hora, NP 68 6.16.3.1)", "Q_B = 0{,}15\\cdot Q_D", `${MC.tn(st.bomb.pctQh / 100, 2)}\\cdot ${MC.tn(QD, 0)}`, MC.tn(QBlh, 0), "l/h");
        m.add("Caudal de bombeo en m³/s", "Q_B = \\dfrac{Q_B[\\mathrm{l/h}]}{3600\\cdot 1000}", `\\dfrac{${MC.tn(QBlh, 0)}}{3\\,600\\,000}`, MC.tn(QB, 6), "m^3/s");
        m.add("Fracción de uso de la bomba", "X = \\dfrac{\\text{uso de bomba}}{24\\,h}", `\\dfrac{${MC.tn(st.bomb.usoH, 2)}}{24}`, MC.tn(X, 4), "");
        m.add("Diámetro de impulsión (Bresse)", "\\varnothing_{imp} = 1{,}30\\sqrt{Q_B}\\,\\sqrt[4]{X}", `1{,}30\\cdot\\sqrt{${MC.tn(QB, 6)}}\\cdot\\sqrt[4]{${MC.tn(X, 4)}}`, MC.tn(Dimp, 4), "m", { nota: `Se adopta ${MC.dLabel(dImp)}.` });
        m.add("Velocidad en impulsión", "V_{imp} = \\dfrac{Q_B}{\\pi(\\varnothing_{imp}/2)^2}", `\\dfrac{${MC.tn(QB, 6)}}{\\pi\\cdot(${MC.tn(dImp / 1000, 3)}/2)^2}`, MC.tn(vImp, 3), "m/s", { ok: vImp <= 2.5 + 1e-9, okTxt: "≤ 2,50 m/s" });
        m.g("V. Tubería de succión");
        m.add("Diámetro de succión", "\\varnothing_{succ} > \\varnothing_{imp}", "", `${MC.tn(dSucc, 0)}`, "mm", { nota: `Un diámetro comercial superior al de impulsión: ${MC.dLabel(dSucc)}.` });
        m.add("Velocidad en succión", "V_{succ} = \\dfrac{Q_B}{\\pi(\\varnothing_{succ}/2)^2}", `\\dfrac{${MC.tn(QB, 6)}}{\\pi\\cdot(${MC.tn(dSucc / 1000, 3)}/2)^2}`, MC.tn(vSucc, 3), "m/s", { ok: vSucc <= 2.5 + 1e-9, okTxt: "≤ 2,50 m/s" });
        checks.push({ n: "Velocidad de impulsión ≤ 2,50 m/s (NP 68 6.9.2)", d: `${MC.f(vImp, 3)} m/s`, ok: vImp <= 2.5 + 1e-9 });
        checks.push({ n: "Velocidad de succión ≤ 2,50 m/s", d: `${MC.f(vSucc, 3)} m/s`, ok: vSucc <= 2.5 + 1e-9 });
        checks.push({ n: "Ø succión > Ø impulsión (NP 68 6.18.1)", d: `${MC.pul(dSucc)} > ${MC.pul(dImp)}`, ok: dSucc > dImp });
        checks.push({ n: "Ø impulsión ≥ Bresse", d: `${dImp} mm ≥ ${MC.f(Dimp * 1000, 1)} mm`, ok: dImp >= Dimp * 1000 - 1e-6, warn: true, failTxt: "Menor que Bresse" });

        /* ---------- VI. Tanques ---------- */
        const T = st.tanq;
        const V1 = 10 * E.areaPB, V2 = 0.2 * QD, V3 = 30000;
        const VI = Math.max(V1, V2, V3);
        const VT = QD + VI;
        const ratio = VT / QD;
        m.g("VI. Tanques de agua");
        m.add("Incendio por superficie", "V_1 = 10\\;\\mathrm{l/m^2}\\cdot A", `10\\cdot ${MC.tn(E.areaPB, 2)}`, MC.tn(V1, 0), "l");
        m.add("Incendio por consumo", "V_2 = 0{,}20\\cdot Q_D", `0{,}20\\cdot ${MC.tn(QD, 0)}`, MC.tn(V2, 0), "l");
        m.add("Incendio mínimo", "V_3 = 30\\;\\mathrm{m^3}", "", MC.tn(V3, 0), "l");
        m.add("Volumen de incendio adoptado (el mayor, NP 68 6.13.7)", "V_I = \\max(V_1, V_2, V_3)", "", MC.tn(VI, 0), "l");
        m.add("Volumen total", "V_T = Q_D + V_I", `${MC.tn(QD, 0)} + ${MC.tn(VI, 0)}`, MC.tn(VT, 0), "l");
        m.add("Verificación de reserva (NP 68 6.13.1)", "\\dfrac{V_T}{Q_D} \\le 2\\;\\text{días}", `\\dfrac{${MC.tn(VT, 0)}}{${MC.tn(QD, 0)}}`, MC.tn(ratio, 2), "días", { ok: ratio <= 2 && ratio >= 1 });
        checks.push({ n: "Reserva total entre 1 y 2 días de consumo", d: `${MC.f(ratio, 2)} días`, ok: ratio <= 2 && ratio >= 1 });
        // Inferior
        const VInf = 3 / 5 * QD / 1000; // m³
        const AInf = VInf / T.hInf;
        const aCalc = Math.sqrt(AInf / T.relBA);
        const aInf = au("aInf", MC.ceilStep(aCalc, T.paso));
        const bInf = au("bInf", MC.ceilStep(AInf / aInf, T.paso));
        const hInfReq = VInf / (aInf * bInf);
        const Nmin = vSucc * vSucc / (2 * MC.G) + 0.2;
        const NminAd = Math.max(Nmin, 0.5);
        Object.assign(R, { V1, V2, V3, VI, VT, ratio, VInf, AInf, aCalc, aInf, bInf, hInfReq, Nmin, NminAd });
        m.g("VI.3 Tanque de reserva inferior (3/5 del consumo, NP 68 6.13.5.1)");
        m.add("Volumen", "V_{Tinf} = \\tfrac{3}{5}\\,Q_D", `\\tfrac{3}{5}\\cdot ${MC.tn(QD, 0)}`, MC.tn(VInf, 3), "m^3");
        m.add("Área", "A = \\dfrac{V_{Tinf}}{N_{max}}", `\\dfrac{${MC.tn(VInf, 3)}}{${MC.tn(T.hInf, 2)}}`, MC.tn(AInf, 3), "m^2");
        m.add("Lado menor con b = " + MC.f(T.relBA, 2) + "·a", "a = \\sqrt{\\dfrac{A}{b/a}}", `\\sqrt{\\dfrac{${MC.tn(AInf, 3)}}{${MC.tn(T.relBA, 2)}}}`, MC.tn(aCalc, 3), "m", { nota: `Dimensiones adoptadas: a = ${MC.f(aInf, 2)} m, b = ${MC.f(bInf, 2)} m, h = ${MC.f(T.hInf, 2)} m.` });
        m.add("Altura útil necesaria con las dimensiones adoptadas", "h = \\dfrac{V_{Tinf}}{a\\,b}", `\\dfrac{${MC.tn(VInf, 3)}}{${MC.tn(aInf, 2)}\\cdot ${MC.tn(bInf, 2)}}`, MC.tn(hInfReq, 3), "m", { ok: hInfReq <= T.hInf + 1e-9, okTxt: `≤ ${MC.f(T.hInf, 2)} m` });
        m.add("Altura mínima de agua sobre la succión (NP 68 6.15.3)", "N_{min} = \\dfrac{V^2}{2g} + 0{,}20 \\ge 0{,}50", `\\dfrac{${MC.tn(vSucc, 3)}^2}{2\\cdot 9{,}81} + 0{,}20`, MC.tn(Nmin, 3), "m", { nota: `Se adopta N<sub>min</sub> = ${MC.f(NminAd, 2)} m.` });
        checks.push({ n: "Tanque inferior: 1 ≤ b/a ≤ 2 (NP 68 6.15.3)", d: `${MC.f(bInf / aInf, 3)}`, ok: bInf / aInf >= 1 - 1e-9 && bInf / aInf <= 2 + 1e-9 });
        checks.push({ n: "Tanque inferior: a·b·h ≥ 3/5·Q_D", d: `${MC.f(aInf * bInf * T.hInf, 2)} m³ ≥ ${MC.f(VInf, 2)} m³`, ok: aInf * bInf * T.hInf >= VInf - 1e-9 });
        // Superior
        const VSup = 2 / 5 * QD / 1000;
        const aSc = Math.sqrt(VSup / T.hSupObj / T.relBA);
        const aSup = au("aSup", MC.ceilStep(aSc, T.paso));
        const bSup = au("bSup", MC.r10(MC.ceilStep(aSc, T.paso) * T.relBA));
        const hSup = VSup / (aSup * bSup);
        const aInc = au("aInc", aSup), bInc = au("bInc", bSup);
        const hInc = VI / 1000 / (aInc * bInc);
        Object.assign(R, { VSup, aSup, bSup, hSup, aInc, bInc, hInc });
        m.g("VI.4 Tanque de reserva superior (2/5 del consumo, NP 68 6.13.5.2)");
        m.add("Volumen", "V_{Tsup} = \\tfrac{2}{5}\\,Q_D", `\\tfrac{2}{5}\\cdot ${MC.tn(QD, 0)}`, MC.tn(VSup, 3), "m^3", { nota: `Dimensiones adoptadas: a = ${MC.f(aSup, 2)} m, b = ${MC.f(bSup, 2)} m.${VSup > 4 ? " Por ser mayor a 4 m³ se proyecta en dos compartimientos (NP 68 6.16.2)." : ""}` });
        m.add("Altura", "h_{Tsup} = \\dfrac{V_{Tsup}}{a\\,b}", `\\dfrac{${MC.tn(VSup, 3)}}{${MC.tn(aSup, 2)}\\cdot ${MC.tn(bSup, 2)}}`, MC.tn(hSup, 3), "m");
        m.g("VI.5 Tanque de agua para incendios");
        m.add("Altura", "h_{Tinc} = \\dfrac{V_I}{a\\,b}", `\\dfrac{${MC.tn(VI / 1000, 3)}}{${MC.tn(aInc, 2)}\\cdot ${MC.tn(bInc, 2)}}`, MC.tn(hInc, 3), "m", { nota: `a = ${MC.f(aInc, 2)} m, b = ${MC.f(bInc, 2)} m.` });

        /* ---------- VI.6–12 Accesorios del tanque ---------- */
        const dVentInf = au("dVentInf", MC.diamAbove(dSucc).mm);
        const dRebInf = au("dRebInf", MC.diamAbove(dAc).mm);
        const dRebSup = au("dRebSup", MC.diamAbove(dImp).mm);
        // Limpieza del tanque superior
        const VTlimp = VSup + VI / 1000;
        const TLL = VTlimp / (st.bomb.nLlenado * QB) / 3600;
        const TV = st.limp.Ttrab - TLL - st.limp.Tlav - st.limp.Tdesc;
        const AL = TV > 0 ? VTlimp / (TV * 3600 * 2.5) : NaN;
        const DL = Math.sqrt(4 * AL / Math.PI);
        const dLimpT = TV > 0 ? MC.nextDiam(DL * 1000).mm : NaN;
        const dLimpN = MC.diamAbove(dImp).mm;
        const dLimp = au("dLimp", Math.max(dLimpT || 0, dLimpN));
        // Puente de empalme
        const colIn = cols.map((x) => MC.diam(x.Dtop).inch);
        const areas = colIn.map((d) => Math.PI * d * d / 4);
        const iMax = areas.indexOf(Math.max(...areas));
        const Ap = areas[iMax] + MC.sum(areas.filter((_, i) => i !== iMax)) / 2;
        const Dp = Math.sqrt(4 * Ap / Math.PI);
        const dPuente = au("dPuente", MC.diamPorPulgadas(Dp).mm);
        const dVentSup = au("dVentSup", MC.diamAbove(dPuente).mm);
        const dCBmax = Math.max(...cols.map((x) => x.Dtop));
        const dRuptor = au("dRuptor", MC.diamAbove(dCBmax).mm);
        Object.assign(R, { dVentInf, dRebInf, dRebSup, VTlimp, TLL, TV, AL, DL, dLimpT, dLimpN, dLimp, colIn, areas, Ap, Dp, dPuente, dVentSup, dCBmax, dRuptor });
        m.g("VI.6–12 Ventilaciones, rebosaderos, limpieza, puente y ruptor");
        m.add("Ventilación inferior", "\\varnothing_{VentInf} > \\varnothing_{succ}", "", null, "", { nota: `${MC.pul(dSucc)} → ${MC.dLabel(dVentInf)}` });
        m.add("Rebosadero inferior (NP 68 6.14.1)", "\\varnothing_{RebInf} > \\varnothing_{alimentador} = \\varnothing_{principal}", "", null, "", { nota: `${MC.pul(dAc)} → ${MC.dLabel(dRebInf)}` });
        m.add("Rebosadero superior (NP 68 6.14.1)", "\\varnothing_{RebSup} > \\varnothing_{alimentador} = \\varnothing_{imp}", "", null, "", { nota: `El tanque superior se alimenta por la impulsión (${MC.pul(dImp)}) → ${MC.dLabel(dRebSup)}` });
        m.add("Volumen a vaciar (tanque superior + incendio)", "V_T = V_{Tsup} + V_I", `${MC.tn(VSup, 3)} + ${MC.tn(VI / 1000, 3)}`, MC.tn(VTlimp, 3), "m^3");
        m.add("Tiempo de llenado", `T_{LL} = \\dfrac{V_T}{${st.bomb.nLlenado}\\,Q_B}`, `\\dfrac{${MC.tn(VTlimp, 3)}}{${st.bomb.nLlenado}\\cdot ${MC.tn(QB, 6)}}\\cdot\\dfrac{1}{3600}`, MC.tn(TLL, 3), "h");
        m.add("Tiempo disponible para vaciar", "T_{V} = T_{trab} - T_{LL} - T_{lav} - T_{desc}", `${MC.tn(st.limp.Ttrab, 2)} - ${MC.tn(TLL, 3)} - ${MC.tn(st.limp.Tlav, 2)} - ${MC.tn(st.limp.Tdesc, 2)}`, MC.tn(TV, 3), "h", { ok: TV > 0 });
        m.add("Área de la tubería de limpieza (NP 68 6.20.4)", "A_L = \\dfrac{V_T}{T_V\\cdot V_{max}}", `\\dfrac{${MC.tn(VTlimp, 3)}}{${MC.tn(TV * 3600, 0)}\\cdot 2{,}50}`, MC.tn(AL, 6), "m^2");
        m.add("Diámetro de limpieza", "\\varnothing_L = \\sqrt{\\dfrac{4 A_L}{\\pi}}", `\\sqrt{\\dfrac{4\\cdot ${MC.tn(AL, 6)}}{\\pi}}`, MC.tn(DL * 1000, 1), "mm", { nota: `Por tiempo de vaciado: ${isFinite(dLimpT) ? MC.pul(dLimpT) : "—"}. Mínimo por norma (una medida mayor que el alimentador ${MC.pul(dImp)}): ${MC.pul(dLimpN)}. Se adopta ${MC.dLabel(dLimp)}.` });
        m.add("Puente de empalme (NP 68 6.22.2)", "A_p = A_{max} + \\dfrac{\\sum A_n}{2}", `${MC.tn(areas[iMax], 3)} + \\dfrac{${areas.filter((_, i) => i !== iMax).map((a) => MC.tn(a, 3)).join(" + ") || "0"}}{2}`, MC.tn(Ap, 3), "pulg^2", { nota: `Columnas: ${colIn.map((d) => MC.f(d, 2) + "\"").join(", ")}. A = π·Ø²/4 en pulg².` });
        m.add("Diámetro del puente", "\\varnothing_p = \\sqrt{\\dfrac{4 A_p}{\\pi}}", `\\sqrt{\\dfrac{4\\cdot ${MC.tn(Ap, 3)}}{\\pi}}`, MC.tn(Dp, 3), "pulg", { nota: `Se adopta ${MC.dLabel(dPuente)}.` });
        m.add("Ventilación superior", "\\varnothing_V > \\varnothing_p", "", null, "", { nota: `${MC.pul(dPuente)} → ${MC.dLabel(dVentSup)}` });
        m.add("Ruptor de vacío (NP 68 6.21.1)", "\\varnothing_{RV} > \\varnothing_{CB,max}", "", null, "", { nota: `Columna mayor ${MC.pul(dCBmax)} → ${MC.dLabel(dRuptor)}` });
        checks.push({ n: "Tiempo de vaciado del tanque superior positivo", d: `${MC.f(TV, 2)} h`, ok: TV > 0 });

        /* ---------- VII. Electrobombas ---------- */
        const eb = st.eb;
        const Hi = (E.pisos + 1 + E.subsuelos) * E.hPiso + hSup;
        const lqS = MC.leqList(dSucc, eb.fitS), lqI = MC.leqList(dImp, eb.fitI);
        const LtS = lqS.total + eb.LrSucc, LtI = lqI.total + eb.LrImp;
        const JS = MC.jFlamant(vSucc, dSucc / 1000), JI = MC.jFlamant(vImp, dImp / 1000);
        const JmS = JS * LtS, JmI = JI * LtI;
        const HmS = eb.HsSucc + JmS, HmI = Hi + JmI, HmT = HmS + HmI;
        const ebB = MC.etaBomba(QB * 1000);
        const Pcv = 1000 * QB * HmT / (75 * ebB.eta);
        const Php = Pcv / MC.CV_POR_HP;
        const em = MC.etaMotor(Php);
        const Pmb = Php / em.eta;
        const hg = MC.holgura(Pmb);
        const Psel = Pmb * (1 + hg.h);
        const Padop = au("Padop", MC.hpComercial(Psel));
        Object.assign(R, { Hi, lqS, lqI, LtS, LtI, JS, JI, JmS, JmI, HmS, HmI, HmT, ebB, Pcv, Php, em, Pmb, hg, Psel, Padop });
        m.g("VII. Cálculo de electrobombas");
        m.add("Pérdidas por succión: longitud total (Tabla 3, NP 68)", "L_{T,s} = \\sum n\\,L_{eq} + L_{real}", lqS.rows.map((r) => `${r.n}\\cdot ${MC.tn(r.unit, 2)}`).join(" + ") + ` + ${MC.tn(eb.LrSucc, 2)}`, MC.tn(LtS, 2), "m", { nota: lqS.rows.map((r) => r.name).join(" · ") });
        m.add("Pérdida por metro en succión (Flamant, PVC rígido)", "J = \\dfrac{4\\cdot 0{,}000135}{\\varnothing}\\sqrt[4]{\\dfrac{V^7}{\\varnothing}}", `\\dfrac{4\\cdot 0{,}000135}{${MC.tn(dSucc / 1000, 3)}}\\sqrt[4]{\\dfrac{${MC.tn(vSucc, 3)}^7}{${MC.tn(dSucc / 1000, 3)}}}`, MC.tn(JS, 5), "m/m");
        m.add("Pérdida en succión", "J_{M,s} = J\\cdot L_{T,s}", `${MC.tn(JS, 5)}\\cdot ${MC.tn(LtS, 2)}`, MC.tn(JmS, 3), "m.c.a.");
        m.add("Altura manométrica de succión", "H_{MAN,s} = H_{top,s} + J_{M,s}", `${MC.tn(eb.HsSucc, 2)} + ${MC.tn(JmS, 3)}`, MC.tn(HmS, 3), "m.c.a.");
        m.add("Altura topográfica de impulsión (altura del edificio)", "H_{top,i} = (n_{pisos} + 1 + n_{sub})\\,h_{piso} + h_{Tsup}", `(${E.pisos} + 1 + ${E.subsuelos})\\cdot ${MC.tn(E.hPiso, 2)} + ${MC.tn(hSup, 3)}`, MC.tn(Hi, 3), "m");
        m.add("Pérdidas por impulsión: longitud total", "L_{T,i} = \\sum n\\,L_{eq} + L_{real}", lqI.rows.map((r) => `${r.n}\\cdot ${MC.tn(r.unit, 2)}`).join(" + ") + ` + ${MC.tn(eb.LrImp, 2)}`, MC.tn(LtI, 2), "m", { nota: lqI.rows.map((r) => r.name).join(" · ") });
        m.add("Pérdida por metro en impulsión (Flamant)", "J = \\dfrac{4\\cdot 0{,}000135}{\\varnothing}\\sqrt[4]{\\dfrac{V^7}{\\varnothing}}", `\\dfrac{4\\cdot 0{,}000135}{${MC.tn(dImp / 1000, 3)}}\\sqrt[4]{\\dfrac{${MC.tn(vImp, 3)}^7}{${MC.tn(dImp / 1000, 3)}}}`, MC.tn(JI, 5), "m/m");
        m.add("Pérdida en impulsión", "J_{M,i} = J\\cdot L_{T,i}", `${MC.tn(JI, 5)}\\cdot ${MC.tn(LtI, 2)}`, MC.tn(JmI, 3), "m.c.a.");
        m.add("Altura manométrica de impulsión", "H_{MAN,i} = H_{top,i} + J_{M,i}", `${MC.tn(Hi, 3)} + ${MC.tn(JmI, 3)}`, MC.tn(HmI, 3), "m.c.a.");
        m.add("Altura manométrica total", "H_{MAN,T} = H_{MAN,s} + H_{MAN,i}", `${MC.tn(HmS, 3)} + ${MC.tn(HmI, 3)}`, MC.tn(HmT, 3), "m.c.a.");
        m.add("Rendimiento de la bomba (Tabla VI)", "\\eta_B", `Q_B = ${MC.tn(QB * 1000, 2)}\\;\\mathrm{l/s}\\rightarrow ${MC.tg(ebB.qTab)}\\;\\mathrm{l/s}`, MC.tn(ebB.eta, 2), "");
        m.add("Potencia de la electrobomba", "P_B = \\dfrac{\\gamma_{H_2O}\\,Q_B\\,H_{MAN,T}}{75\\,\\eta_B}", `\\dfrac{1000\\cdot ${MC.tn(QB, 6)}\\cdot ${MC.tn(HmT, 3)}}{75\\cdot ${MC.tn(ebB.eta, 2)}}`, MC.tn(Pcv, 3), "CV");
        m.add("En HP (1 HP = 1,014 CV)", "P_B = \\dfrac{P_B[CV]}{1{,}014}", `\\dfrac{${MC.tn(Pcv, 3)}}{1{,}014}`, MC.tn(Php, 3), "HP");
        m.add("Rendimiento del motor (Tabla VII)", "\\eta_m", `P_B = ${MC.tn(Php, 2)}\\;\\mathrm{HP}\\rightarrow ${em.hpLabel}\\;\\mathrm{HP}`, MC.tn(em.eta, 3), "");
        m.add("Potencia motor-bomba", "P_{MB} = \\dfrac{P_B}{\\eta_m}", `\\dfrac{${MC.tn(Php, 3)}}{${MC.tn(em.eta, 3)}}`, MC.tn(Pmb, 3), "HP");
        m.add("Potencia seleccionada (Tabla VIII)", "P_{selecc} = P_{MB}\\,(1 + Holg)", `${MC.tn(Pmb, 3)}\\cdot(1 + ${MC.tn(hg.h, 2)})`, MC.tn(Psel, 3), "HP", { nota: `Holgura ${MC.f(hg.h * 100, 0)} % (${hg.txt}). Se adopta ${MC.hpTxt(Padop)} HP (2 electrobombas: una de reserva, NP 68 6.16.4).` });
        checks.push({ n: "Potencia adoptada ≥ potencia seleccionada", d: `${MC.hpTxt(Padop)} HP ≥ ${MC.f(Psel, 2)} HP`, ok: Padop >= Psel - 1e-9 });

        /* ---------- VIII. Agua caliente ---------- */
        const act = AC_TABLA[st.ac.tipo] || AC_TABLA.Departamento;
        const termos = st.ac.termos.map((t) => {
            const rows = t.items.map((it) => ({ a: it.a, c: it.c, l: act.l[it.a] != null ? act.l[it.a] : 0, ok: act.l[it.a] != null }));
            rows.forEach((r) => { if (!r.ok) errs.push(`Agua caliente: "${r.a}" no tiene consumo tabulado para ${st.ac.tipo}.`); });
            const tot = MC.sum(rows.map((r) => r.l * r.c));
            const V = act.c * tot;
            const Vad = (TERMO_COM.find((x) => x >= V - 1e-9)) || V;
            return { t, rows, tot, V, Vad };
        });
        R.termos = termos; R.acC = act.c;
        m.g("VIII. Agua caliente (Norma de agua caliente 2016, Tabla III)");
        termos.forEach((x) => {
            m.add(`${x.t.n}: consumo de los puntos`, "\\sum = \\sum n\\cdot l", x.rows.map((r) => `${r.c}\\cdot ${r.l}`).join(" + "), MC.tn(x.tot, 2), "l");
            m.add(`${x.t.n}: capacidad`, "V_{TC} = c\\cdot \\sum", `${MC.tn(act.c, 2)}\\cdot ${MC.tn(x.tot, 2)}`, MC.tn(x.V, 2), "l", { nota: `c = ${MC.f(act.c, 2)} (${st.ac.tipo}). Se adopta termotanque comercial de ${x.Vad} l (${x.t.cant} por departamento).` });
        });

        /* ---------- IX. Incendio ---------- */
        const I = st.inc, cl = ORD_CLASES[I.clase] || ORD_CLASES[1];
        const Qt_lmin = I.nSim * cl.q;
        const Qt = Qt_lmin / 60000; // m³/s
        const HaAuto = cl.p + I.dz + I.perd;
        const Ha = au("HaInc", HaAuto);
        const ebI = MC.etaBomba(Qt * 1000);
        const PcvI = 1000 * Qt * Ha / (75 * ebI.eta);
        const PhpI = PcvI / MC.CV_POR_HP;
        const emI = MC.etaMotor(PhpI);
        const PmbI = PhpI / emI.eta;
        const hgI = MC.holgura(PmbI);
        const PselI = PmbI * (1 + hgI.h);
        const PadI = au("PadInc", MC.hpComercial(PselI));
        const tRes = ordTiempo(E.areaTot);
        const Vord = Math.max(Qt_lmin * tRes, 5000);
        Object.assign(R, { cl, Qt_lmin, Qt, Ha, HaAuto, ebI, PcvI, PhpI, emI, PmbI, hgI, PselI, PadI, tRes, Vord, jockeyHP: I.jockeyKW / 0.7457 });
        m.g("IX. Prevención de incendios (Ordenanza N° 038)");
        m.add("Caudal por boca (riesgo clase " + I.clase + ")", "Q_{BIE}", "", MC.tn(cl.q, 0), "l/min", { nota: `Presión dinámica mínima en la boca más desfavorable: ${cl.p} m.c.a. Una BIE por piso con manguera de 30 m y una BIS en planta baja.` });
        m.add(`Caudal total (${I.nSim} BIE simultáneas)`, "Q_t = n\\cdot Q_{BIE}", `${I.nSim}\\cdot ${cl.q}\\;\\mathrm{l/min} = \\dfrac{${MC.tn(Qt_lmin, 0)}}{60\\,000}`, MC.tn(Qt, 5), "m^3/s");
        m.add("Altura de la bomba", "H_a = P_{din} + \\Delta z + h_f", `${MC.tn(cl.p, 2)} + ${MC.tn(I.dz, 2)} + ${MC.tn(I.perd, 2)}`, MC.tn(HaAuto, 2), "m.c.a.", { nota: `Se adopta H<sub>a</sub> = ${MC.f(Ha, 2)} m.c.a.` });
        m.add("Rendimiento de la bomba (Tabla VI)", "\\eta_B", `Q_t = ${MC.tn(Qt * 1000, 2)}\\;\\mathrm{l/s}\\rightarrow ${MC.tg(ebI.qTab)}`, MC.tn(ebI.eta, 2), "");
        m.add("Potencia teórica", "P = \\dfrac{\\gamma\\,Q_t\\,H_a}{75\\,\\eta_B}", `\\dfrac{1000\\cdot ${MC.tn(Qt, 5)}\\cdot ${MC.tn(Ha, 2)}}{75\\cdot ${MC.tn(ebI.eta, 2)}}`, MC.tn(PcvI, 3), "CV");
        m.add("En HP", "P = \\dfrac{P[CV]}{1{,}014}", `\\dfrac{${MC.tn(PcvI, 3)}}{1{,}014}`, MC.tn(PhpI, 3), "HP");
        m.add("Potencia real (Tabla VII)", "P_{MB} = \\dfrac{P}{\\eta_m}", `\\dfrac{${MC.tn(PhpI, 3)}}{${MC.tn(emI.eta, 3)}}`, MC.tn(PmbI, 3), "HP");
        m.add("Potencia seleccionada (Tabla VIII)", "P_{selecc} = P_{MB}(1 + Holg)", `${MC.tn(PmbI, 3)}\\cdot(1 + ${MC.tn(hgI.h, 2)})`, MC.tn(PselI, 3), "HP", { nota: `Se adopta bomba principal de ${MC.hpTxt(PadI)} HP. Bomba jockey por catálogo (UNE 23-500-90): ${MC.f(I.jockeyKW, 2)} kW = ${MC.f(I.jockeyKW / 0.7457, 2)} HP.` });
        m.add("Reserva técnica por ordenanza (Art. 50.2 y 50.3)", "V_{ord} = \\max(Q_t\\cdot t;\\;5000\\;\\mathrm{l})", `\\max(${MC.tn(Qt_lmin, 0)}\\cdot ${tRes};\\;5000)`, MC.tn(Vord, 0), "l", { nota: `t = ${tRes} min para ${MC.f(E.areaTot, 0)} m² construidos.`, ok: VI >= Vord - 1e-9, okTxt: "V_I ≥ V_ord" });
        checks.push({ n: "Volumen de incendio NP 68 ≥ reserva técnica de la Ordenanza 038", d: `${MC.f(VI, 0)} l ≥ ${MC.f(Vord, 0)} l`, ok: VI >= Vord - 1e-9 });
        checks.push({ n: "Bomba de incendio adoptada ≥ potencia seleccionada", d: `${MC.hpTxt(PadI)} HP ≥ ${MC.f(PselI, 2)} HP`, ok: PadI >= PselI - 1e-9 });
        cols.forEach((x) => {
            const bad = x.rows.filter((r) => r.Q > (MC.tablaIV(r.D) || { qmax: Infinity }).qmax + 1e-9);
            checks.push({ n: `${x.c.n}: caudal ≤ caudal máximo de la Tabla IV en todos los tramos`, d: `Ø superior ${MC.pul(x.Dtop)} · Q = ${MC.f(x.rows[x.rows.length - 1].Q, 3)} l/s`, ok: !bad.length });
        });
        R.memo = m; R.checks = checks;
        return R;
    }

    /* =====================================================================
       Interfaz
       ===================================================================== */
    const KEY = "sh-predial-v1";
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
        const act = b.dataset.act, i = +b.dataset.i, j = +b.dataset.j, list = b.dataset.list;
        if (act === "add-amb") st.ambientes.push({ id: "A" + (st.ambientes.length + 1), n: "Nuevo ambiente", items: [{ a: "lavatorio", c: 1 }] });
        if (act === "del-amb") st.ambientes.splice(i, 1);
        if (act === "add-amb-it") st.ambientes[i].items.push({ a: "lavatorio", c: 1 });
        if (act === "del-amb-it") st.ambientes[i].items.splice(j, 1);
        if (act === "add-uni") st.unidades.push({ id: "D" + (st.unidades.length + 1), n: "Nuevo departamento", items: [] });
        if (act === "del-uni") st.unidades.splice(i, 1);
        if (act === "add-uni-it") st.unidades[i].items.push({ r: st.ambientes[0].id, c: 1 });
        if (act === "del-uni-it") st.unidades[i].items.splice(j, 1);
        if (act === "add-col") st.columnas.push({ n: "Columna " + (st.columnas.length + 1), pb: [], tipo: [] });
        if (act === "del-col") st.columnas.splice(i, 1);
        if (act === "add-col-it") st.columnas[i][list].push({ r: (st.unidades[0] || st.ambientes[0]).id, c: 1 });
        if (act === "del-col-it") st.columnas[i][list].splice(j, 1);
        if (act === "add-fs") st.eb.fitS.push({ k: "curva90", n: 1 });
        if (act === "del-fs") st.eb.fitS.splice(i, 1);
        if (act === "add-fi") st.eb.fitI.push({ k: "curva90", n: 1 });
        if (act === "del-fi") st.eb.fitI.splice(i, 1);
        if (act === "add-termo") st.ac.termos.push({ n: "Termotanque", cant: 1, items: [{ a: "Ducha", c: 1 }] });
        if (act === "del-termo") st.ac.termos.splice(i, 1);
        if (act === "add-termo-it") st.ac.termos[i].items.push({ a: "Lavatorio", c: 1 });
        if (act === "del-termo-it") st.ac.termos[i].items.splice(j, 1);
        if (act === "copy-auto" && R) { Object.assign(st.adop, R.auto); st.mode = "manual"; }
        if (act === "clear-adop") st.adop = {};
        if (act === "import") {
            const o = MC.read("sh-state-v1");
            if (o && o.S) { const S = o.S; Object.assign(st.edif, { pisos: S.pisos, deptos: S.deptos, dorm: S.dorm, pd: S.persDorm, serv: S.persServ, pctLog: S.pctLog, qDept: S.qDept, qLog: S.qLog }); alert("Datos del edificio importados de la página Impulsión del río."); }
            else alert("No hay datos guardados en la página Impulsión del río.");
        }
        if (act === "reset") { if (!confirm("¿Volver a los datos de ejemplo de la guía?")) return; st = JSON.parse(JSON.stringify(DEF)); }
        MC.save(KEY, st); renderInputs(); doRecompute();
    }

    const ni = (p, v, w) => `<input type="number" step="any" data-bind="${p}" data-type="num" value="${v}" style="width:${w || 70}px">`;
    const ti = (p, v, w) => `<input type="text" data-bind="${p}" data-type="text" value="${MC.esc(v)}" style="width:${w || 140}px">`;
    const xb = (act, i, j, extra) => `<button type="button" class="btn-x" data-act="${act}" data-i="${i}"${j != null ? ` data-j="${j}"` : ""}${extra || ""}>✕</button>`;

    function renderInputs() {
        const E = st.edif, auto = st.mode === "auto";
        MC.$("mode").innerHTML = MC.modeBar(st.mode);
        MC.$("in-edif").innerHTML = [
            MC.field("edif.pisos", "Número de pisos tipo", E.pisos, { unit: "pisos" }), MC.field("edif.deptos", "Departamentos por piso", E.deptos),
            MC.field("edif.dorm", "Dormitorios por departamento", E.dorm), MC.field("edif.pd", "Personas por dormitorio", E.pd),
            MC.field("edif.serv", "Personal de servicio por departamento", E.serv), MC.field("edif.pctLog", "Personal de logística", E.pctLog, { unit: "% de los deptos." }),
            MC.field("edif.qDept", "Caudal unitario departamentos (NP 68 Tabla I)", E.qDept, { unit: "l/pers/día" }), MC.field("edif.qLog", "Caudal unitario logística (oficinas)", E.qLog, { unit: "l/pers/día" }),
            MC.field("edif.subsuelos", "Subsuelos", E.subsuelos), MC.field("edif.hPiso", "Altura de entrepiso", E.hPiso, { unit: "m" }),
            MC.field("edif.areaPB", "Área de construcción en planta baja", E.areaPB, { unit: "m²" }), MC.field("edif.areaTot", "Superficie cubierta total (ordenanza)", E.areaTot, { unit: "m²" }),
        ].join("");
        const artOpts = (v) => MC.ARTEFACTOS.map((a) => `<option value="${a.k}" ${a.k === v ? "selected" : ""}>${MC.esc(a.n)} (P ${MC.f(a.p, 1)})</option>`).join("");
        MC.$("ed-amb").innerHTML = `<div class="ed-cards">${st.ambientes.map((a, i) => `<div class="panel"><h3>${ti(`ambientes.${i}.n`, a.n, 150)} <small>id</small> ${ti(`ambientes.${i}.id`, a.id, 50)} ${xb("del-amb", i)}</h3>
            ${MC.table(["Artefacto (Tabla III)", "Cant.", ""], a.items.map((it, j) => [`<select data-bind="ambientes.${i}.items.${j}.a" data-type="text">${artOpts(it.a)}</select>`, ni(`ambientes.${i}.items.${j}.c`, it.c, 55), xb("del-amb-it", i, j)]))}
            <button type="button" class="btn-sm" data-act="add-amb-it" data-i="${i}">+ Artefacto</button><div class="amb-out" id="amb-out-${i}"></div></div>`).join("")}</div>
            <button type="button" class="btn-sm" data-act="add-amb">+ Ambiente</button>`;
        const ambOpts = (v) => st.ambientes.map((a) => `<option value="${MC.esc(a.id)}" ${a.id === v ? "selected" : ""}>${MC.esc(a.n)}</option>`).join("");
        MC.$("ed-uni").innerHTML = `<div class="ed-cards">${st.unidades.map((u, i) => `<div class="panel"><h3>${ti(`unidades.${i}.n`, u.n, 170)} <small>id</small> ${ti(`unidades.${i}.id`, u.id, 50)} ${xb("del-uni", i)}</h3>
            ${MC.table(["Ambiente", "Cant.", ""], u.items.map((it, j) => [`<select data-bind="unidades.${i}.items.${j}.r" data-type="text">${ambOpts(it.r)}</select>`, ni(`unidades.${i}.items.${j}.c`, it.c, 55), xb("del-uni-it", i, j)]))}
            <button type="button" class="btn-sm" data-act="add-uni-it" data-i="${i}">+ Ambiente</button><div class="amb-out" id="uni-out-${i}"></div></div>`).join("")}</div>
            <button type="button" class="btn-sm" data-act="add-uni">+ Tipo de departamento</button>`;
        const refOpts = (v) => `<optgroup label="Departamentos">${st.unidades.map((u) => `<option value="${MC.esc(u.id)}" ${u.id === v ? "selected" : ""}>${MC.esc(u.n)}</option>`).join("")}</optgroup><optgroup label="Ambientes">${ambOpts(v)}</optgroup>`;
        const colList = (c, i, list) => MC.table(["Elemento", "Cant.", ""], c[list].map((it, j) => [`<select data-bind="columnas.${i}.${list}.${j}.r" data-type="text">${refOpts(it.r)}</select>`, ni(`columnas.${i}.${list}.${j}.c`, it.c, 55), xb("del-col-it", i, j, ` data-list="${list}"`)]))
            + `<button type="button" class="btn-sm" data-act="add-col-it" data-i="${i}" data-list="${list}">+ Elemento</button>`;
        MC.$("ed-col").innerHTML = `<div class="ed-cards">${st.columnas.map((c, i) => `<div class="panel"><h3>${ti(`columnas.${i}.n`, c.n, 150)} ${xb("del-col", i)}</h3>
            <p class="mini">Planta baja</p>${colList(c, i, "pb")}<p class="mini">Cada planta tipo</p>${colList(c, i, "tipo")}</div>`).join("")}</div>
            <button type="button" class="btn-sm" data-act="add-col">+ Columna de bajada</button>`;
        MC.$("in-acom").innerHTML = [MC.field("acom.TLLh", "Tiempo de llenado del tanque T<sub>LL</sub>", st.acom.TLLh, { unit: "h/día" }), MC.field("acom.Pkpa", "Presión mínima disponible", st.acom.Pkpa, { unit: "kPa" })].join("");
        MC.$("in-bomb").innerHTML = [MC.field("bomb.pctQh", "Caudal horario mínimo de bombeo", st.bomb.pctQh, { unit: "% de Q_D" }), MC.field("bomb.usoH", "Uso de la bomba", st.bomb.usoH, { unit: "h/día" }), MC.field("bomb.nLlenado", "Bombas funcionando al llenar el tanque superior", st.bomb.nLlenado)].join("");
        MC.$("in-tanq").innerHTML = [MC.field("tanq.hInf", "Altura útil del tanque inferior N<sub>máx</sub>", st.tanq.hInf, { unit: "m" }), MC.field("tanq.relBA", "Relación b/a", st.tanq.relBA), MC.field("tanq.hSupObj", "Altura objetivo del tanque superior (algoritmo)", st.tanq.hSupObj, { unit: "m" }), MC.field("tanq.paso", "Redondeo de dimensiones", st.tanq.paso, { unit: "m" }),
        MC.field("limp.Ttrab", "Tiempo de trabajo de limpieza", st.limp.Ttrab, { unit: "h" }), MC.field("limp.Tlav", "Tiempo de lavado", st.limp.Tlav, { unit: "h" }), MC.field("limp.Tdesc", "Tiempo de descanso", st.limp.Tdesc, { unit: "h" })].join("");
        const fitEd = (list, pref, path) => MC.table(["Accesorio (Tabla 3 · NP 68)", "Cant.", ""], list.map((it, k) => [`<select data-bind="${path}.${k}.k" data-type="text">${MC.T3_COLS.map((c) => `<option value="${c.k}" ${c.k === it.k ? "selected" : ""}>${MC.esc(c.n)}</option>`).join("")}</select>`, ni(`${path}.${k}.n`, it.n, 55), xb("del-" + pref, k)])) + `<button type="button" class="btn-sm" data-act="add-${pref}">+ Accesorio</button>`;
        MC.$("in-eb").innerHTML = `<div class="grid-3">${[MC.field("eb.HsSucc", "Altura topográfica de succión", st.eb.HsSucc, { unit: "m" }), MC.field("eb.LrSucc", "Longitud real de succión", st.eb.LrSucc, { unit: "m" }), MC.field("eb.LrImp", "Longitud real de impulsión", st.eb.LrImp, { unit: "m" })].join("")}</div>
            <div class="grid-2"><div class="panel"><h3>Succión</h3>${fitEd(st.eb.fitS, "fs", "eb.fitS")}</div><div class="panel"><h3>Impulsión</h3>${fitEd(st.eb.fitI, "fi", "eb.fitI")}</div></div>`;
        const tipoOpts = Object.keys(AC_TABLA).map((k) => ({ v: k, t: `${k} (c = ${AC_TABLA[k].c})` }));
        const ptos = (tipo) => Object.keys((AC_TABLA[tipo] || AC_TABLA.Departamento).l);
        MC.$("in-ac").innerHTML = `<div class="grid-3">${MC.field("ac.tipo", "Tipo de inmueble", st.ac.tipo, { type: "select", options: tipoOpts })}</div>
            <div class="ed-cards">${st.ac.termos.map((t, i) => `<div class="panel"><h3>${ti(`ac.termos.${i}.n`, t.n, 170)} ${xb("del-termo", i)}</h3>${MC.field(`ac.termos.${i}.cant`, "Cantidad por departamento", t.cant)}
            ${MC.table(["Punto de utilización", "Cant.", ""], t.items.map((it, j) => [`<select data-bind="ac.termos.${i}.items.${j}.a" data-type="text">${ptos(st.ac.tipo).map((p) => `<option ${p === it.a ? "selected" : ""}>${MC.esc(p)}</option>`).join("")}</select>`, ni(`ac.termos.${i}.items.${j}.c`, it.c, 55), xb("del-termo-it", i, j)]))}
            <button type="button" class="btn-sm" data-act="add-termo-it" data-i="${i}">+ Punto</button></div>`).join("")}</div><button type="button" class="btn-sm" data-act="add-termo">+ Termotanque</button>`;
        MC.$("in-inc").innerHTML = [MC.field("inc.clase", "Riesgo (Ordenanza 038, Art. 50.1)", st.inc.clase, { type: "select", num: true, options: [{ v: 1, t: "Clase I · 250 l/min · 6 m.c.a." }, { v: 2, t: "Clase II · 500 l/min · 15 m.c.a." }, { v: 3, t: "Clase III · 750 l/min · 30 m.c.a." }] }),
        MC.field("inc.nSim", "BIE funcionando simultáneamente", st.inc.nSim), MC.field("inc.dz", "Desnivel bomba → boca más desfavorable", st.inc.dz, { unit: "m" }), MC.field("inc.perd", "Pérdidas de carga hasta la boca", st.inc.perd, { unit: "m" }), MC.field("inc.jockeyKW", "Bomba jockey (catálogo UNE 23-500)", st.inc.jockeyKW, { unit: "kW" })].join("");
        renderAdop();
    }

    // Valores adoptados editables (modo manual) o mostrados (modo automático)
    const ADOP = [
        ["dAc", "Ø acometida", "mm"], ["dImp", "Ø impulsión", "mm"], ["dSucc", "Ø succión", "mm"], ["aInf", "Tanque inferior a", "m"], ["bInf", "Tanque inferior b", "m"],
        ["aSup", "Tanque superior a", "m"], ["bSup", "Tanque superior b", "m"], ["aInc", "Tanque incendio a", "m"], ["bInc", "Tanque incendio b", "m"],
        ["dVentInf", "Ø ventilación inferior", "mm"], ["dRebInf", "Ø rebosadero inferior", "mm"], ["dRebSup", "Ø rebosadero superior", "mm"], ["dLimp", "Ø limpieza", "mm"],
        ["dPuente", "Ø puente de empalme", "mm"], ["dVentSup", "Ø ventilación superior", "mm"], ["dRuptor", "Ø ruptor de vacío", "mm"], ["Padop", "Potencia electrobomba", "HP"],
        ["HaInc", "Altura bomba de incendio", "m.c.a."], ["PadInc", "Potencia bomba de incendio", "HP"],
    ];
    function renderAdop() {
        const auto = st.mode === "auto";
        MC.$("in-adop").innerHTML = `<div class="grid-3">${ADOP.map(([k, l, u]) => MC.field(`adop.${k}`, l, st.adop[k], { unit: u, adopt: R && R.auto ? R.auto[k] : null, auto })).join("")}</div>
            ${auto ? `<button type="button" class="btn-sm" data-act="copy-auto">Pasar los valores automáticos a modo manual</button>` : `<button type="button" class="btn-sm" data-act="clear-adop">Borrar valores manuales (usar los automáticos)</button>`}
            <p class="footnote">En modo manual, un campo vacío usa el valor automático (que se muestra como sugerencia). Los diámetros se ingresan en mm nominales (15, 20, 25, 32, 40, 50, 60, 75, 100, 125, 150…).</p>`;
    }

    const recompute = MC.debounce(() => doRecompute(), 250);
    function doRecompute() {
        R = calc(st);
        render();
        // actualizar sugerencias de los adoptados sin regenerar (conserva el foco)
        ADOP.forEach(([k]) => { const el = document.querySelector(`[data-bind="adop.${k}"]`); if (el) { el.placeholder = R.auto[k] != null ? MC.f(R.auto[k], 4) : ""; if (st.mode === "auto") el.value = R.auto[k] != null ? +(+R.auto[k]).toFixed(4) : ""; } });
    }

    function render() {
        MC.$("errs").innerHTML = R.errs.length ? `<div class="alert">${[...new Set(R.errs)].map((e) => `<div>⚠ ${MC.esc(e)}</div>`).join("")}</div>` : "";
        MC.$("hero-kpis").innerHTML = MC.kpi("Consumo diario", MC.f(R.QD, 0), "l/día") + MC.kpi("Acometida", MC.pul(R.dAc), "") + MC.kpi("Electrobomba", MC.hpTxt(R.Padop), "HP") + MC.kpi("Reserva total", MC.f(R.VT / 1000, 1), "m³");
        MC.$("out-edif").innerHTML = MC.kv([["Personas por departamento", R.persDep, ""], ["Población de departamentos", R.pob, "pers."], ["Personal de logística", MC.f(R.logi, 1), "pers."], ["Consumo diario Q<sub>D</sub>", MC.f(R.QD, 0), "l/día/edificio", 1]]);
        R.amb.forEach((x, i) => { const el = MC.$("amb-out-" + i); if (el) el.innerHTML = `ΣP = <strong>${MC.f(x.P, 2)}</strong> · Q = ${MC.f(x.Q, 3)} l/s · ramal mínimo <strong>${MC.pul(x.dmin)}</strong>`; });
        R.uni.forEach((x, i) => { const el = MC.$("uni-out-" + i); if (el) el.innerHTML = `ΣP = <strong>${MC.f(x.P, 2)}</strong>`; });
        MC.$("out-col").innerHTML = MC.kv([["Peso total planta baja", MC.f(R.PBtot, 2), ""], ["Peso total planta tipo", MC.f(R.Ttot, 2), ""]]) + R.cols.map((x) => `<h4>${MC.esc(x.c.n)}</h4>` + MC.table(["Ítem", "Planta", "Peso", "Peso acumulado", "Q = 0,3√ΣP (l/s)", "Figura I", "Tabla IV (Q máx.)", "Sección mínima"],
            x.rows.map((r, k) => [k + 1, pisoNombre(r.k), MC.f(r.p, 2), MC.f(r.acc, 2), MC.f(r.Q, 3), MC.pul(r.fig.mm), MC.pul(r.t4.mm), `<strong>${MC.pul(r.D)}</strong>`]), { cls: "tbl-scroll" })).join("");
        MC.$("out-acom").innerHTML = MC.kv([["Q<sub>P</sub>", MC.f(R.QP, 3), "l/s"], ["Fila de la Tabla II", R.fila ? R.fila[0] + " kPa" : "—", ""], ["Ø principal adoptado", MC.dLabel(R.dAc), "", 1], ["Q máx. para ese Ø", R.qmaxAdop != null ? MC.f(R.qmaxAdop, 2) : "—", "l/s"]]) + (R.acFuera ? `<div class="alert">La Tabla II no tiene ningún diámetro para ${MC.f(R.QP, 2)} l/s a ${st.acom.Pkpa} kPa (máximo 2"). La guía adopta 2", pero no verifica: conviene aumentar T<sub>LL</sub> (hasta 6 h) o tomar una presión disponible mayor, o prever más de una conexión.</div>` : "");
        MC.$("out-bomb").innerHTML = MC.kv([["Q<sub>B</sub>", MC.f(R.QBlh, 0), "l/h"], ["Q<sub>B</sub>", MC.fx(R.QB, 6), "m³/s"], ["Ø Bresse", MC.f(R.Dimp * 1000, 1), "mm"], ["Ø impulsión", MC.dLabel(R.dImp), "", 1], ["V impulsión", MC.f(R.vImp, 3), "m/s"], ["Ø succión", MC.dLabel(R.dSucc), "", 1], ["V succión", MC.f(R.vSucc, 3), "m/s"]]);
        MC.$("out-tanq").innerHTML = MC.table(["Elemento", "Valor"], [
            ["Volumen de incendio V<sub>I</sub>", `${MC.f(R.VI, 0)} l (V₁ ${MC.f(R.V1, 0)} · V₂ ${MC.f(R.V2, 0)} · V₃ ${MC.f(R.V3, 0)})`], ["Volumen total", `${MC.f(R.VT, 0)} l · ${MC.f(R.ratio, 2)} días ${MC.badge(R.ratio <= 2 && R.ratio >= 1)}`],
            ["Tanque inferior", `${MC.f(R.VInf, 3)} m³ · ${MC.f(R.aInf, 2)} × ${MC.f(R.bInf, 2)} × ${MC.f(st.tanq.hInf, 2)} m · N<sub>min</sub> ${MC.f(R.NminAd, 2)} m`],
            ["Tanque superior", `${MC.f(R.VSup, 3)} m³ · ${MC.f(R.aSup, 2)} × ${MC.f(R.bSup, 2)} × ${MC.f(R.hSup, 3)} m`], ["Tanque de incendio", `${MC.f(R.VI / 1000, 3)} m³ · ${MC.f(R.aInc, 2)} × ${MC.f(R.bInc, 2)} × ${MC.f(R.hInc, 3)} m`],
            ["Ventilación inferior", MC.dLabel(R.dVentInf)], ["Rebosadero inferior", MC.dLabel(R.dRebInf)], ["Rebosadero superior", MC.dLabel(R.dRebSup)],
            ["Limpieza del tanque superior", `T<sub>LL</sub> ${MC.f(R.TLL, 2)} h · T<sub>V</sub> ${MC.f(R.TV, 2)} h · Ø calc. ${MC.f(R.DL * 1000, 1)} mm → ${MC.dLabel(R.dLimp)}`],
            ["Puente de empalme", `A<sub>p</sub> ${MC.f(R.Ap, 3)} pulg² · Ø ${MC.f(R.Dp, 3)}" → ${MC.dLabel(R.dPuente)}`], ["Ventilación superior", MC.dLabel(R.dVentSup)], ["Ruptor de vacío", MC.dLabel(R.dRuptor)]]);
        MC.$("out-eb").innerHTML = MC.table(["", "Succión", "Impulsión"], [
            ["Ø / V", `${MC.pul(R.dSucc)} · ${MC.f(R.vSucc, 3)} m/s`, `${MC.pul(R.dImp)} · ${MC.f(R.vImp, 3)} m/s`],
            ["Accesorios", R.lqS.rows.map((r) => `${r.n}× ${MC.esc(r.name)} (${MC.f(r.unit, 2)} m)`).join("<br>"), R.lqI.rows.map((r) => `${r.n}× ${MC.esc(r.name)} (${MC.f(r.unit, 2)} m)`).join("<br>")],
            ["Longitud total (m)", MC.f(R.LtS, 2), MC.f(R.LtI, 2)], ["J Flamant (m/m)", MC.fx(R.JS, 5), MC.fx(R.JI, 5)], ["Pérdida (m.c.a.)", MC.f(R.JmS, 3), MC.f(R.JmI, 3)],
            ["Altura topográfica (m)", MC.f(st.eb.HsSucc, 2), MC.f(R.Hi, 3)], ["Altura manométrica (m.c.a.)", MC.f(R.HmS, 3), MC.f(R.HmI, 3)]])
            + MC.kv([["H<sub>MAN</sub> total", MC.f(R.HmT, 3), "m.c.a.", 1], ["η bomba (Tabla VI)", MC.f(R.ebB.eta * 100, 0), "%"], ["P<sub>B</sub>", `${MC.f(R.Pcv, 3)} CV = ${MC.f(R.Php, 3)}`, "HP"], ["η motor (Tabla VII)", MC.f(R.em.eta * 100, 1), "%"], ["P<sub>MB</sub>", MC.f(R.Pmb, 3), "HP"], ["Holgura (Tabla VIII)", MC.f(R.hg.h * 100, 0), "%"], ["P seleccionada", MC.f(R.Psel, 3), "HP"], ["Potencia adoptada (×2 bombas)", MC.hpTxt(R.Padop), "HP", 1]]);
        MC.$("out-ac").innerHTML = MC.table(["Termotanque", "Σ litros", "c", "V calculado (l)", "Adoptado (l)", "Por depto."], R.termos.map((x) => [MC.esc(x.t.n), MC.f(x.tot, 2), MC.f(R.acC, 2), MC.f(x.V, 2), `<strong>${x.Vad}</strong>`, x.t.cant]));
        MC.$("out-inc").innerHTML = MC.kv([["Caudal por BIE", R.cl.q, "l/min"], ["Caudal total", `${MC.f(R.Qt_lmin, 0)} l/min = ${MC.fx(R.Qt, 5)}`, "m³/s"], ["Altura de la bomba", MC.f(R.Ha, 2), "m.c.a."], ["P teórica", `${MC.f(R.PcvI, 3)} CV = ${MC.f(R.PhpI, 3)}`, "HP"], ["P real (η motor " + MC.f(R.emI.eta * 100, 0) + " %)", MC.f(R.PmbI, 3), "HP"], ["Holgura", MC.f(R.hgI.h * 100, 0), "%"], ["P seleccionada", MC.f(R.PselI, 3), "HP"], ["Bomba principal adoptada", MC.hpTxt(R.PadI), "HP", 1], ["Bomba jockey", `${MC.f(st.inc.jockeyKW, 2)} kW = ${MC.f(R.jockeyHP, 2)}`, "HP"], ["Reserva por ordenanza", `${MC.f(R.Vord, 0)} l (${R.tRes} min)`, ""], ["Volumen de incendio NP 68", MC.f(R.VI, 0), "l"]])
            + `<p class="footnote">Tubería de distribución de incendio ${MC.pul(st.inc.dDist)} · conexión a las BIE ${MC.pul(st.inc.dBIE)} (riesgo bajo o normal) · una BIE por piso con manguera de 30 m · una BIS en planta baja.</p>`;
        renderInforme();
    }

    function renderInforme() {
        MC.$("informe-body").innerHTML = MC.informeHTML({
            titulo: "Memoria de cálculo · Provisión de agua del edificio",
            sub: "NP 68 · Norma de agua caliente 2016 · Ordenanza N° 038",
            datos: [["Pisos tipo", st.edif.pisos, ""], ["Departamentos por piso", st.edif.deptos, ""], ["Dormitorios por departamento", st.edif.dorm, ""], ["Personas por dormitorio", st.edif.pd, ""], ["Personal de servicio por depto.", st.edif.serv, ""], ["Logística", st.edif.pctLog, "%"], ["Caudal unitario departamentos", st.edif.qDept, "l/pers/día"], ["Caudal unitario logística", st.edif.qLog, "l/pers/día"], ["Consumo diario Q_D", MC.f(R.QD, 0), "l/día"]],
            secciones: [
                { t: "Pesos por ambiente", html: MC.table(["Ambiente", "Artefactos", "ΣP", "Sección mínima"], R.amb.map((x) => [MC.esc(x.a.n), x.rows.map((r) => `${r.c}× ${MC.esc(r.art.n)} (${MC.f(r.art.p, 1)})`).join("<br>"), MC.f(x.P, 2), MC.pul(x.dmin)])) },
                { t: "Departamentos", html: MC.table(["Tipo", "Composición", "ΣP"], R.uni.map((x) => [MC.esc(x.u.n), x.rows.map((r) => `${r.c}× ${MC.esc(r.ref ? r.ref.a.n : r.id)}`).join(", "), MC.f(x.P, 2)])) },
                ...R.cols.map((x) => ({ t: `Columna de bajada · ${MC.esc(x.c.n)}`, html: MC.table(["Planta", "Peso", "Acumulado", "Q (l/s)", "Sección mínima"], x.rows.map((r) => [pisoNombre(r.k), MC.f(r.p, 2), MC.f(r.acc, 2), MC.f(r.Q, 3), MC.pul(r.D)])) })),
                { t: "Resumen de diámetros y equipos", html: MC.table(["Elemento", "Adoptado"], [["Acometida (principal)", MC.dLabel(R.dAc)], ["Impulsión", MC.dLabel(R.dImp)], ["Succión", MC.dLabel(R.dSucc)], ["Ventilación inferior", MC.dLabel(R.dVentInf)], ["Rebosadero inferior", MC.dLabel(R.dRebInf)], ["Rebosadero superior", MC.dLabel(R.dRebSup)], ["Limpieza", MC.dLabel(R.dLimp)], ["Puente de empalme", MC.dLabel(R.dPuente)], ["Ventilación superior", MC.dLabel(R.dVentSup)], ["Ruptor de vacío", MC.dLabel(R.dRuptor)], ["Electrobombas (2)", MC.hpTxt(R.Padop) + " HP"], ["Bomba de incendio", MC.hpTxt(R.PadI) + " HP + jockey " + MC.f(st.inc.jockeyKW, 2) + " kW"], ["Termotanques", R.termos.map((x) => `${x.t.cant}× ${x.Vad} l`).join(", ")]]) },
            ],
            memo: R.memo, checks: R.checks,
        });
        MC.typeset(MC.$("informe-body"));
    }

    root.PredialCalc = { DEF, calc };
    if (typeof module !== "undefined") module.exports = root.PredialCalc;
    if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", ui);
})(typeof window !== "undefined" ? window : globalThis);
