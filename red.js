"use strict";
/* =====================================================================
   red.js — Datos iniciales, tanque elevado, red de distribución en malla
   (método de Hardy Cross) y verificación de presiones.
   Clase 5 · Hojas "Datos Inic", "Caudales" y "Presiones" de la guía.
   ===================================================================== */
(function (root) {
    const MC = root.MC || require("./mod-core.js");

    const DEF = {
        __v: 2,
        mode: "auto",
        qMed: 154.55, nEdif: 72, K1: 1.2, K2: 1.5,
        Chw: 140, vEc: 1.2, vMin: 0.6, vMax: 3.5, Dmin: 100,
        pMin: 10, pMaxEst: 40, tolLs: 0.001, maxIt: 50,
        tank: { D: 20, tReg: 2, vRes: 90, borde: 0.30 },
        fuente: "G", Hbase: null,
        nodes: [
            { id: "G", ct: 97, x: 0, y: 0 }, { id: "H", ct: 95, x: 1, y: 0 },
            { id: "Q", ct: 96, x: 0, y: 1 }, { id: "R", ct: 94, x: 1, y: 1 },
            { id: "A", ct: 94, x: 0, y: 2 }, { id: "B", ct: 92, x: 1, y: 2 },
        ],
        pipes: [
            { id: "GH", a: "G", b: "H", L: 224, lotes: 7, D: null, Q0: null },
            { id: "GQ", a: "G", b: "Q", L: 336, lotes: 13, D: null, Q0: null },
            { id: "HR", a: "H", b: "R", L: 336, lotes: 13, D: null, Q0: null },
            { id: "QR", a: "Q", b: "R", L: 224, lotes: 6, D: null, Q0: null },
            { id: "QA", a: "Q", b: "A", L: 336, lotes: 13, D: null, Q0: null },
            { id: "RB", a: "R", b: "B", L: 336, lotes: 13, D: null, Q0: null },
            { id: "AB", a: "A", b: "B", L: 224, lotes: 7, D: null, Q0: null },
        ],
        loops: [{ id: "I", path: "Q-R-B-A" }, { id: "II", path: "G-H-R-Q" }],
    };
    // Diámetros comerciales de red (PVC PBA)
    const D_RED = [50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600];

    function dRec(Qm3, vEc) { return Math.sqrt(4 * Math.abs(Qm3) / (Math.PI * vEc)); }
    function dCom(Dm, Dmin) {
        const mm = Math.max(Dm * 1000, Dmin);
        return D_RED.find((d) => d >= mm - 1e-9) || D_RED[D_RED.length - 1];
    }

    /* -------- Topología -------- */
    function topo(st) {
        const errs = [];
        const nodeIdx = {}; st.nodes.forEach((n, i) => { nodeIdx[n.id] = i; });
        st.pipes.forEach((p) => {
            if (!(p.a in nodeIdx)) errs.push(`El tramo ${p.id} usa el nodo "${p.a}", que no existe.`);
            if (!(p.b in nodeIdx)) errs.push(`El tramo ${p.id} usa el nodo "${p.b}", que no existe.`);
            if (p.a === p.b) errs.push(`El tramo ${p.id} empieza y termina en el mismo nodo.`);
        });
        if (!(st.fuente in nodeIdx)) errs.push(`El nodo del tanque "${st.fuente}" no existe.`);
        const loops = st.loops.map((lp) => {
            const seq = String(lp.path).split(/[-–,\s]+/).map((s) => s.trim()).filter(Boolean);
            const items = [];
            if (seq.length < 3) errs.push(`El anillo ${lp.id} necesita al menos 3 nodos.`);
            for (let i = 0; i < seq.length; i++) {
                const u = seq[i], v = seq[(i + 1) % seq.length];
                const pi = st.pipes.findIndex((p) => (p.a === u && p.b === v) || (p.a === v && p.b === u));
                if (pi < 0) { errs.push(`En el anillo ${lp.id} no hay tramo entre ${u} y ${v}.`); continue; }
                items.push({ pi, s: st.pipes[pi].a === u ? 1 : -1 });
            }
            return { id: lp.id, seq, items };
        });
        // Conectividad
        const adj = st.nodes.map(() => []);
        st.pipes.forEach((p, pi) => {
            if (p.a in nodeIdx && p.b in nodeIdx) { adj[nodeIdx[p.a]].push({ pi, to: nodeIdx[p.b] }); adj[nodeIdx[p.b]].push({ pi, to: nodeIdx[p.a] }); }
        });
        const nIndep = st.pipes.length - st.nodes.length + 1;
        if (st.loops.length !== nIndep) errs.push(`Con ${st.pipes.length} tramos y ${st.nodes.length} nodos la red tiene ${nIndep} anillo(s) independiente(s), pero se definieron ${st.loops.length}.`);
        // Cada tramo que cierra un circuito debe pertenecer a algún anillo
        return { nodeIdx, loops, adj, errs, nIndep };
    }

    // Árbol generador desde el tanque (BFS) para la distribución inicial de caudales
    function arbol(st, T) {
        const N = st.nodes.length;
        const src = T.nodeIdx[st.fuente];
        const parent = new Array(N).fill(-1), parentPipe = new Array(N).fill(-1), order = [];
        const seen = new Array(N).fill(false);
        seen[src] = true; const q = [src];
        while (q.length) {
            const u = q.shift(); order.push(u);
            for (const e of T.adj[u]) if (!seen[e.to]) { seen[e.to] = true; parent[e.to] = u; parentPipe[e.to] = e.pi; q.push(e.to); }
        }
        return { src, parent, parentPipe, order, conexo: order.length === N };
    }

    /* -------- Hardy Cross -------- */
    function hardyCross(st, T, Dm, Q0) {
        const P = st.pipes, its = [];
        let Q = Q0.slice(), conv = false;
        const tol = st.tolLs / 1000;
        for (let k = 1; k <= st.maxIt; k++) {
            const lres = T.loops.map((lp) => {
                const rows = lp.items.map(({ pi, s }) => {
                    const q = s * Q[pi];
                    const v = q / MC.area(Dm[pi]);
                    const J = MC.jHW(q, Dm[pi], st.Chw) * Math.sign(q);
                    const h = J * P[pi].L;
                    return { pi, s, q, v, J, h, hq: q !== 0 ? h / q : 0 };
                });
                const sH = MC.sum(rows.map((r) => r.h)), sHQ = MC.sum(rows.map((r) => r.hq));
                const dQ = sHQ > 0 ? -sH / (1.85 * sHQ) : 0;
                return { id: lp.id, rows, sH, sHQ, dQ };
            });
            const Qn = Q.slice();
            T.loops.forEach((lp, li) => lp.items.forEach(({ pi, s }) => { Qn[pi] += s * lres[li].dQ; }));
            // corrección común (para mostrar como en la planilla)
            lres.forEach((lr, li) => lr.rows.forEach((r) => {
                r.dPropia = lr.dQ;
                r.dComun = 0; r.comunCon = [];
                T.loops.forEach((lp2, lj) => {
                    if (lj === li) return;
                    const it2 = lp2.items.find((x) => x.pi === r.pi);
                    if (it2) { r.dComun += r.s * it2.s * lres[lj].dQ; r.comunCon.push(lp2.id); }
                });
                r.qNew = r.s * Qn[r.pi];
            }));
            const maxdQ = Math.max(0, ...lres.map((l) => Math.abs(l.dQ)));
            its.push({ k, loops: lres, maxdQ, Q: Q.slice(), Qn: Qn.slice() });
            Q = Qn;
            if (maxdQ < tol) { conv = true; break; }
        }
        // Residuo final con los caudales corregidos
        const fin = T.loops.map((lp) => {
            const sH = MC.sum(lp.items.map(({ pi, s }) => { const q = s * Q[pi]; return MC.jHW(q, Dm[pi], st.Chw) * Math.sign(q) * P[pi].L; }));
            return { id: lp.id, sH };
        });
        return { its, Q, conv, fin };
    }

    function calc(st) {
        const m = new MC.Memo(), checks = [], log = [];
        const auto = st.mode === "auto";
        const T = topo(st);
        const R = { T, errs: T.errs.slice() };

        // ---- 1. Datos iniciales ----
        const qEdif = st.qMed / st.nEdif;
        const Qmd = st.K1 * st.qMed, Qmh = st.K2 * Qmd;
        Object.assign(R, { qEdif, Qmd, Qmh });
        m.g("1. Datos iniciales");
        m.add("Caudal por edificio", "q_{edif} = \\dfrac{Q_{med}}{N_{edif}}", `\\dfrac{${MC.tn(st.qMed, 2)}}{${MC.tn(st.nEdif, 0)}}`, MC.tn(qEdif, 4), "l/s/lote");
        m.add("Caudal máximo diario", "Q_{md} = K_1 \\cdot Q_{med}", `${MC.tn(st.K1, 2)} \\cdot ${MC.tn(st.qMed, 2)}`, MC.tn(Qmd, 3), "l/s");
        m.add("Caudal máximo horario", "Q_{mh} = K_2 \\cdot Q_{md}", `${MC.tn(st.K2, 2)} \\cdot ${MC.tn(Qmd, 3)}`, MC.tn(Qmh, 3), "l/s");

        // ---- 2. Tanque elevado ----
        const tk = st.tank, A = Math.PI * tk.D * tk.D / 4;
        const Vmd = Qmd * 3600 * tk.tReg / 1000 + tk.vRes;
        const Vmh = Qmh * 3600 * tk.tReg / 1000 + tk.vRes;
        const Hmd = Vmd / A, Hmh = Vmh / A, Htot = Hmh + tk.borde;
        Object.assign(R, { tkA: A, Vmd, Vmh, Hmd, Hmh, Htot, Vpico: Vmh - Vmd });
        m.g("2. Tanque elevado (cilíndrico)");
        m.add("Área del tanque", "A = \\dfrac{\\pi D^2}{4}", `\\dfrac{\\pi \\cdot ${MC.tn(tk.D, 2)}^2}{4}`, MC.tn(A, 2), "m^2");
        m.add("Volumen con Q máximo diario", "V_{md} = \\dfrac{Q_{md}\\cdot 3600 \\cdot t_{reg}}{1000} + V_{res}", `\\dfrac{${MC.tn(Qmd, 3)}\\cdot 3600\\cdot ${MC.tn(tk.tReg, 2)}}{1000} + ${MC.tn(tk.vRes, 2)}`, MC.tn(Vmd, 2), "m^3");
        m.add("Volumen con Q máximo horario", "V_{mh} = \\dfrac{Q_{mh}\\cdot 3600 \\cdot t_{reg}}{1000} + V_{res}", `\\dfrac{${MC.tn(Qmh, 3)}\\cdot 3600\\cdot ${MC.tn(tk.tReg, 2)}}{1000} + ${MC.tn(tk.vRes, 2)}`, MC.tn(Vmh, 2), "m^3");
        m.add("Altura útil (diseño con Q máx. horario)", "H_{u} = \\dfrac{V_{mh}}{A}", `\\dfrac{${MC.tn(Vmh, 2)}}{${MC.tn(A, 2)}}`, MC.tn(Hmh, 3), "m");
        m.add("Altura total del tanque", "H_{T} = H_u + b_{libre}", `${MC.tn(Hmh, 3)} + ${MC.tn(tk.borde, 2)}`, MC.tn(Htot, 3), "m");

        if (T.errs.length) return finish(R, m, checks, log, st);

        // ---- 3. Caudales por tramo y demandas nodales ----
        const P = st.pipes, N = st.nodes;
        const lotesTot = MC.sum(P.map((p) => p.lotes));
        const Qa = P.map((p) => p.lotes * qEdif * st.K1 * st.K2);
        const dem = N.map(() => 0);
        P.forEach((p, i) => { dem[T.nodeIdx[p.a]] += Qa[i] / 2; dem[T.nodeIdx[p.b]] += Qa[i] / 2; });
        const QaTot = MC.sum(Qa);
        Object.assign(R, { Qa, dem, lotesTot, QaTot });
        m.g("3. Caudal de cada tramo y demanda en los nodos");
        P.forEach((p, i) => m.add(`Tramo ${p.id}`, `Q_{a,${p.id}} = n_{lotes}\\cdot q_{edif}\\cdot K_1\\cdot K_2`, `${p.lotes}\\cdot ${MC.tn(qEdif, 4)}\\cdot ${MC.tn(st.K1, 2)}\\cdot ${MC.tn(st.K2, 2)}`, MC.tn(Qa[i], 3), "l/s"));
        m.note("El consumo de cada tramo se reparte en partes iguales entre sus dos nodos extremos: \\(q_n = \\sum Q_{a}/2\\) de los tramos que llegan al nodo.");
        N.forEach((n, i) => {
            const inc = P.map((p, k) => ({ p, k })).filter(({ p }) => p.a === n.id || p.b === n.id);
            m.add(`Demanda en el nodo ${n.id}`, `q_{${n.id}} = \\sum \\dfrac{Q_a}{2}`, inc.map(({ k }) => `\\dfrac{${MC.tn(Qa[k], 3)}}{2}`).join(" + ") || "0", MC.tn(dem[i], 3), "l/s");
        });
        checks.push({ n: "Lotes de la red = edificios del barrio", d: `${lotesTot} lotes en tramos / ${st.nEdif} edificios`, ok: Math.abs(lotesTot - st.nEdif) < 1e-9 });
        checks.push({ n: "Caudal total distribuido = Q máximo horario", d: `${MC.f(QaTot, 3)} l/s / ${MC.f(Qmh, 3)} l/s`, ok: Math.abs(QaTot - Qmh) < 1e-6 });

        // ---- 4. Distribución inicial ----
        const tr = arbol(st, T);
        if (!tr.conexo) { R.errs.push("La red no está conectada: hay nodos sin camino hasta el tanque."); return finish(R, m, checks, log, st); }
        // Caudal en cada rama del árbol = demanda acumulada del subárbol que alimenta (en m³/s)
        const Qtree = P.map(() => 0);
        const sub = dem.map((d) => d / 1000);
        for (let i = tr.order.length - 1; i >= 1; i--) {
            const u = tr.order[i], par = tr.parent[u], pi = tr.parentPipe[u];
            Qtree[pi] = P[pi].a === N[par].id ? sub[u] : -sub[u];
            sub[par] += sub[u];
        }
        const useManualQ0 = !auto && P.every((p) => p.Q0 != null && isFinite(p.Q0));
        const Q0 = useManualQ0 ? P.map((p) => p.Q0 / 1000) : Qtree.slice();
        // Continuidad de la distribución inicial
        const cont = N.map((n, i) => {
            let s = 0;
            P.forEach((p, k) => { if (p.b === n.id) s += Q0[k]; if (p.a === n.id) s -= Q0[k]; });
            if (i === tr.src) s += QaTot / 1000;
            return (s - dem[i] / 1000) * 1000;
        });
        const contOk = cont.every((c) => Math.abs(c) < 0.01);
        Object.assign(R, { Qtree, Q0, cont, contOk, useManualQ0, tree: tr });
        checks.push({ n: "Continuidad de la distribución inicial (Σ entradas − Σ salidas − q = 0 en cada nodo)", d: `máx. desvío ${MC.f(Math.max(...cont.map(Math.abs)), 4)} l/s`, ok: contOk });
        if (!contOk) { R.errs.push("Los caudales iniciales manuales no cumplen continuidad en los nodos. Usá «Completar por continuidad» o corregilos."); return finish(R, m, checks, log, st); }

        // ---- 5. Diámetros + Hardy Cross ----
        let Dmm, hc;
        if (auto) {
            Dmm = Q0.map((q) => dCom(dRec(q, st.vEc), st.Dmin));
            const seen = new Set();
            for (let pass = 1; pass <= 12; pass++) {
                const Dm = Dmm.map((d) => d / 1000);
                hc = hardyCross(st, T, Dm, Q0);
                const nextD = hc.Q.map((q) => dCom(dRec(q, st.vEc), st.Dmin));
                log.push({ pass, D: Dmm.slice(), Q: hc.Q.map((q) => q * 1000), it: hc.its.length, conv: hc.conv });
                const key = nextD.join(",");
                if (nextD.every((d, i) => d === Dmm[i])) break;
                if (seen.has(key)) { log.push({ nota: "Los diámetros oscilan entre dos soluciones; se adopta el mayor de cada tramo." }); Dmm = Dmm.map((d, i) => Math.max(d, nextD[i])); hc = hardyCross(st, T, Dmm.map((d) => d / 1000), Q0); break; }
                seen.add(Dmm.join(","));
                Dmm = nextD;
            }
        } else {
            const sug = Q0.map((q) => dCom(dRec(q, st.vEc), st.Dmin));
            Dmm = P.map((p, i) => (p.D != null && p.D > 0 ? p.D : sug[i]));
            hc = hardyCross(st, T, Dmm.map((d) => d / 1000), Q0);
        }
        const Dm = Dmm.map((d) => d / 1000);
        const Qf = hc.Q;
        const vel = Qf.map((q, i) => Math.abs(q) / MC.area(Dm[i]));
        const Jf = Qf.map((q, i) => MC.jHW(q, Dm[i], st.Chw));
        const hf = Qf.map((q, i) => Jf[i] * P[i].L * Math.sign(q));
        Object.assign(R, { Dmm, Dm, hc, Qf, vel, Jf, hf, dRecQ0: Q0.map((q) => dRec(q, st.vEc)), dRecQf: Qf.map((q) => dRec(q, st.vEc)) });

        m.g("4. Diámetros");
        m.add("Diámetro recomendado (velocidad económica)", "D_{rec} = \\sqrt{\\dfrac{4\\,Q}{\\pi\\, v_{ec}}}", "", null, "", { nota: `con \\(v_{ec} = ${MC.tn(st.vEc, 2)}\\) m/s; se adopta el diámetro comercial inmediato superior, no menor a ${MC.f(st.Dmin, 0)} mm.` });
        P.forEach((p, i) => m.add(`Tramo ${p.id}`, `D_{rec} = \\sqrt{\\dfrac{4\\cdot ${MC.tn(Math.abs(Qf[i]), 5)}}{\\pi\\cdot ${MC.tn(st.vEc, 2)}}}`, "", `${MC.tn(R.dRecQf[i] * 1000, 1)}\\;\\mathrm{mm} \\rightarrow D = ${Dmm[i]}`, "mm"));

        m.g("5. Hardy Cross (Hazen-Williams)");
        m.add("Pérdida unitaria", "J = 10{,}643\\, C^{-1{,}85}\\, D^{-4{,}87}\\, |Q|^{1{,}85}", "", null, "", { nota: `C = ${st.Chw}; Q en m³/s, D en m, J en m/m. Pérdida del tramo \\(h = J\\,L\\) con el signo del caudal en el sentido del anillo.` });
        m.add("Corrección de caudal del anillo", "\\Delta Q = -\\dfrac{\\sum h}{1{,}85 \\sum |h/Q|}", "", null, "", { nota: "Cada tramo recibe la corrección de su anillo (propia) y, si es común a otro anillo, la del otro anillo con el signo relativo (común). Se itera hasta que |ΔQ| < " + MC.f(st.tolLs, 4) + " l/s." });
        hc.its.forEach((it) => it.loops.forEach((lr) => {
            m.add(`Iteración ${it.k} · anillo ${lr.id}`, `\\Delta Q_{${lr.id}} = -\\dfrac{${MC.tn(lr.sH, 4)}}{1{,}85\\cdot ${MC.tn(lr.sHQ, 3)}}`, "", MC.tn(lr.dQ * 1000, 4), "l/s");
        }));
        checks.push({ n: "Convergencia de Hardy Cross", d: `${hc.its.length} iteraciones · |ΔQ| final ${MC.f(hc.its[hc.its.length - 1].maxdQ * 1000, 5)} l/s`, ok: hc.conv });
        hc.fin.forEach((f) => checks.push({ n: `Σh del anillo ${f.id} ≈ 0`, d: `${MC.f(f.sH, 5)} m`, ok: Math.abs(f.sH) < 0.01 }));
        if (hc.its.length > 10) checks.push({ n: "Iteraciones ≤ 10 (si no, conviene aumentar diámetros)", d: `${hc.its.length} iteraciones`, ok: false, warn: true, failTxt: "Revisar" });
        P.forEach((p, i) => {
            checks.push({ n: `Velocidad tramo ${p.id} ≥ ${MC.f(st.vMin, 2)} m/s`, d: `v = ${MC.f(vel[i], 3)} m/s (D ${Dmm[i]} mm)`, ok: vel[i] >= st.vMin, warn: Dmm[i] <= st.Dmin, failTxt: Dmm[i] <= st.Dmin ? "Baja (ya está en D mínimo)" : "Disminuir el diámetro" });
            if (vel[i] > st.vMax) checks.push({ n: `Velocidad tramo ${p.id} ≤ ${MC.f(st.vMax, 2)} m/s`, d: `v = ${MC.f(vel[i], 3)} m/s`, ok: false, failTxt: "Aumentar el diámetro" });
        });

        // Regla de la cátedra: en el sentido de circulación el diámetro no aumenta.
        P.forEach((p, i) => {
            const from = Qf[i] >= 0 ? p.a : p.b;
            if (from === st.fuente) return;
            const ups = P.map((pp, k) => ({ pp, k })).filter(({ pp, k }) => k !== i && ((Qf[k] >= 0 && pp.b === from) || (Qf[k] < 0 && pp.a === from)));
            if (!ups.length) return;
            const dUp = Math.max(...ups.map(({ k }) => Dmm[k]));
            if (Dmm[i] > dUp) checks.push({ n: `Tramo ${p.id}: diámetro no mayor que el que lo alimenta`, d: `D ${Dmm[i]} mm > ${dUp} mm aguas arriba (nodo ${from})`, ok: false, warn: true, failTxt: "Revisar" });
        });

        // ---- 6. Presiones ----
        const CP0 = N.map(() => null);
        CP0[tr.src] = N[tr.src].ct;
        const stack = [tr.src], vis = new Array(N.length).fill(false); vis[tr.src] = true;
        const parentP = new Array(N.length).fill(-1);
        while (stack.length) {
            const u = stack.shift();
            for (const e of T.adj[u]) {
                if (vis[e.to]) continue;
                const p = P[e.pi];
                const hab = hf[e.pi]; // CP(a) − CP(b)
                CP0[e.to] = p.a === N[u].id ? CP0[u] - hab : CP0[u] + hab;
                vis[e.to] = true; parentP[e.to] = e.pi; stack.push(e.to);
            }
        }
        // cierre en los tramos que no pertenecen al árbol de cálculo
        let cierre = 0;
        P.forEach((p, k) => { const a = T.nodeIdx[p.a], b = T.nodeIdx[p.b]; cierre = Math.max(cierre, Math.abs((CP0[a] - CP0[b]) - hf[k])); });
        const req = N.map((n, i) => st.pMin + n.ct - CP0[i]); // Hbase necesario por nodo
        const HbaseMin = Math.max(...req);
        const HbaseAuto = MC.ceilStep(HbaseMin, 0.01);
        const Hbase = !auto && st.Hbase != null ? st.Hbase : HbaseAuto;
        const CP = CP0.map((c) => c + Hbase);
        const pres = CP.map((c, i) => c - N[i].ct);
        const iMin = pres.indexOf(Math.min(...pres)), iMax = pres.indexOf(Math.max(...pres));
        const ctMin = Math.min(...N.map((n) => n.ct));
        const Pest = N[tr.src].ct + Hbase + Hmh - ctMin;
        Object.assign(R, { CP, pres, HbaseMin, HbaseAuto, Hbase, iMin, iMax, cierre, Pest, parentP });
        m.g("6. Presiones");
        m.add("Cota piezométrica en el tanque (tanque vacío, lado seguro)", `CP_{${st.fuente}} = CT_{${st.fuente}} + H_{base}`, `${MC.tn(N[tr.src].ct, 2)} + ${MC.tn(Hbase, 2)}`, MC.tn(CP[tr.src], 3), "m");
        m.note("Se recorre la red desde el tanque: \\(CP_{destino} = CP_{origen} - h\\), con \\(h\\) la pérdida del tramo en el sentido origen → destino (negativa si el agua circula al revés).");
        tr.order.slice(1).forEach((u) => {
            const pi = parentP[u], p = P[pi], par = T.adj[u].find((e) => e.pi === pi).to;
            const hDir = p.a === N[par].id ? hf[pi] : -hf[pi];
            m.add(`Nodo ${N[u].id} (por tramo ${p.id})`, `CP_{${N[u].id}} = CP_{${N[par].id}} - h_{${N[par].id}\\rightarrow ${N[u].id}}`, `${MC.tn(CP[par], 3)} - (${MC.tn(hDir, 3)})`, MC.tn(CP[u], 3), "m");
        });
        N.forEach((n, i) => m.add(`Presión disponible en ${n.id}`, `P_{${n.id}} = CP_{${n.id}} - CT_{${n.id}}`, `${MC.tn(CP[i], 3)} - ${MC.tn(n.ct, 2)}`, MC.tn(pres[i], 3), "m.c.a.", { ok: pres[i] >= st.pMin - 1e-9 }));
        m.add("Altura mínima de la base del tanque", `H_{base,min} = \\max_i\\left(P_{min} + CT_i - CP^{0}_i\\right)`, "", MC.tn(HbaseMin, 3), "m", { nota: `con CP⁰ calculada con H_base = 0; nodo crítico: ${N[req.indexOf(HbaseMin)].id}. Se adopta H_base = ${MC.f(Hbase, 2)} m.` });
        m.add("Presión estática máxima", "P_{est} = CT_{tanque} + H_{base} + H_u - CT_{min}", `${MC.tn(N[tr.src].ct, 2)} + ${MC.tn(Hbase, 2)} + ${MC.tn(Hmh, 3)} - ${MC.tn(ctMin, 2)}`, MC.tn(Pest, 3), "m.c.a.", { ok: Pest <= st.pMaxEst });
        checks.push({ n: `Presión mínima ≥ ${MC.f(st.pMin, 2)} m.c.a.`, d: `mínima ${MC.f(pres[iMin], 3)} m en ${N[iMin].id}`, ok: pres[iMin] >= st.pMin - 1e-9 });
        checks.push({ n: `Presión estática máxima ≤ ${MC.f(st.pMaxEst, 0)} m.c.a.`, d: `${MC.f(Pest, 2)} m.c.a.`, ok: Pest <= st.pMaxEst });
        checks.push({ n: "Cierre de cotas piezométricas en los anillos", d: `error máx. ${MC.f(cierre, 4)} m`, ok: cierre < 0.01 });
        return finish(R, m, checks, log, st);
    }

    function finish(R, m, checks, log, st) {
        R.memo = m; R.checks = checks; R.log = log;
        R.resumen = R.Hbase != null ? { Hbase: R.Hbase, Htot: R.Htot, Hu: R.Hmh, ctTanque: (st.nodes.find((n) => n.id === st.fuente) || {}).ct, qMed: st.qMed, K1: st.K1, K2: st.K2 } : null;
        return R;
    }

    /* =====================================================================
       Interfaz
       ===================================================================== */
    const KEY = "sh-red-v1";
    let st, R;

    function ui() {
        st = MC.load(KEY, DEF);
        const root = MC.$("app");
        MC.bindAll(root, st, (path) => {
            MC.save(KEY, st);
            recompute();
        });
        root.addEventListener("click", onClick);
        renderInputs();
        recompute(true);
        MC.setupNavToggle();
    }

    function onClick(ev) {
        const b = ev.target.closest("[data-act],[data-mode]");
        if (!b) return;
        if (b.dataset.mode) { st.mode = b.dataset.mode; MC.save(KEY, st); renderInputs(); recompute(true); return; }
        const act = b.dataset.act, i = +b.dataset.i;
        if (act === "add-node") st.nodes.push({ id: "N" + (st.nodes.length + 1), ct: 0, x: 0, y: 0 });
        if (act === "del-node") st.nodes.splice(i, 1);
        if (act === "add-pipe") st.pipes.push({ id: "T" + (st.pipes.length + 1), a: st.nodes[0].id, b: st.nodes[1] ? st.nodes[1].id : st.nodes[0].id, L: 100, lotes: 0, D: null, Q0: null });
        if (act === "del-pipe") st.pipes.splice(i, 1);
        if (act === "add-loop") st.loops.push({ id: String(st.loops.length + 1), path: "" });
        if (act === "del-loop") st.loops.splice(i, 1);
        if (act === "fill-q0" && R && R.Qtree) st.pipes.forEach((p, k) => { p.Q0 = +(R.Qtree[k] * 1000).toFixed(4); });
        if (act === "clear-q0") st.pipes.forEach((p) => { p.Q0 = null; });
        if (act === "copy-auto" && R && R.Dmm) { st.pipes.forEach((p, k) => { p.D = R.Dmm[k]; }); st.Hbase = R.Hbase; st.mode = "manual"; }
        if (act === "import") importar();
        if (act === "reset") { if (!confirm("¿Volver a los datos de ejemplo de la guía?")) return; st = JSON.parse(JSON.stringify(DEF)); MC.save(KEY, st); location.reload(); return; }
        MC.save(KEY, st); renderInputs(); recompute(true);
    }

    function importar() {
        const o = MC.read("sh-state-v1");
        if (!o || !o.S) { alert("No hay datos guardados en la página Impulsión del río. Abrila y cargá los datos del barrio primero."); return; }
        const S = o.S;
        const pob = S.manzanas * S.lotes * (S.pisos * S.deptos * (S.dorm * S.persDorm + S.persServ));
        const log = S.deptos * S.pisos * S.pctLog / 100 * S.lotes * S.manzanas;
        const Qd = pob * S.qDept + log * S.qLog; // l/día
        st.qMed = +(Qd / 86400).toFixed(6);
        st.nEdif = S.manzanas * S.lotes;
        st.K1 = S.k1; st.K2 = S.k2;
        alert(`Importado: Qmed = ${MC.f(st.qMed, 3)} l/s · ${st.nEdif} edificios · K1 = ${st.K1} · K2 = ${st.K2}`);
    }

    function renderInputs() {
        const auto = st.mode === "auto";
        MC.$("mode").innerHTML = MC.modeBar(st.mode);
        MC.$("in-datos").innerHTML = [
            MC.field("qMed", "Caudal medio diario del barrio", st.qMed, { unit: "l/s" }),
            MC.field("nEdif", "Cantidad de edificios (lotes)", st.nEdif, { unit: "lotes" }),
            MC.field("K1", "K1 (máximo diario)", st.K1),
            MC.field("K2", "K2 (máximo horario)", st.K2),
        ].join("");
        MC.$("in-tanque").innerHTML = [
            MC.field("tank.D", "Diámetro del tanque", st.tank.D, { unit: "m" }),
            MC.field("tank.tReg", "Tiempo de regulación", st.tank.tReg, { unit: "h" }),
            MC.field("tank.vRes", "Volumen adicional de reserva", st.tank.vRes, { unit: "m³" }),
            MC.field("tank.borde", "Borde libre", st.tank.borde, { unit: "m" }),
        ].join("");
        MC.$("in-crit").innerHTML = [
            MC.field("Chw", "Coeficiente de Hazen-Williams C", st.Chw),
            MC.field("vEc", "Velocidad económica para D recomendado", st.vEc, { unit: "m/s" }),
            MC.field("Dmin", "Diámetro mínimo de red", st.Dmin, { type: "select", num: true, unit: "mm", options: D_RED.map((d) => ({ v: d, t: d + " mm" })) }),
            MC.field("vMin", "Velocidad mínima", st.vMin, { unit: "m/s" }),
            MC.field("vMax", "Velocidad máxima", st.vMax, { unit: "m/s" }),
            MC.field("tolLs", "Tolerancia de Hardy Cross |ΔQ|", st.tolLs, { unit: "l/s" }),
            MC.field("pMin", "Presión mínima en la red", st.pMin, { unit: "m.c.a." }),
            MC.field("pMaxEst", "Presión estática máxima", st.pMaxEst, { unit: "m.c.a." }),
            MC.field("fuente", "Nodo del tanque", st.fuente, { type: "select", options: st.nodes.map((n) => ({ v: n.id, t: n.id })) }),
        ].join("");
        renderEditors();
    }

    function renderEditors() {
        const auto = st.mode === "auto";
        const ni = (path, v, w) => `<input type="number" step="any" data-bind="${path}" data-type="num" value="${v}" style="width:${w || 80}px">`;
        const ti = (path, v, w) => `<input type="text" data-bind="${path}" data-type="text" value="${MC.esc(v)}" style="width:${w || 60}px">`;
        const nodeOpts = (path, v) => `<select data-bind="${path}" data-type="text">${st.nodes.map((n) => `<option ${n.id === v ? "selected" : ""}>${MC.esc(n.id)}</option>`).join("")}</select>`;
        MC.$("ed-nodes").innerHTML = MC.table(["Nodo", "Cota de terreno (m)", "x (dibujo)", "y (dibujo)", ""],
            st.nodes.map((n, i) => [ti(`nodes.${i}.id`, n.id), ni(`nodes.${i}.ct`, n.ct, 90), ni(`nodes.${i}.x`, n.x, 60), ni(`nodes.${i}.y`, n.y, 60), `<button type="button" class="btn-x" data-act="del-node" data-i="${i}">✕</button>`]))
            + `<button type="button" class="btn-sm" data-act="add-node">+ Nodo</button>`;
        MC.$("ed-pipes").innerHTML = MC.table(["Tramo", "Desde (a)", "Hasta (b)", "Longitud (m)", "Nº de lotes", `D adoptado (mm)${auto ? " · auto" : ""}`, `Q inicial a→b (l/s)${auto ? " · auto" : ""}`, ""],
            st.pipes.map((p, i) => [ti(`pipes.${i}.id`, p.id), nodeOpts(`pipes.${i}.a`, p.a), nodeOpts(`pipes.${i}.b`, p.b), ni(`pipes.${i}.L`, p.L, 80), ni(`pipes.${i}.lotes`, p.lotes, 60),
            auto ? `<span class="ro" id="ro-D-${i}">—</span>` : `<select data-bind="pipes.${i}.D" data-type="num-null"><option value="">auto</option>${D_RED.map((d) => `<option value="${d}" ${p.D === d ? "selected" : ""}>${d}</option>`).join("")}</select>`,
            auto ? `<span class="ro" id="ro-Q-${i}">—</span>` : `<input type="number" step="any" data-bind="pipes.${i}.Q0" data-type="num-null" value="${p.Q0 == null ? "" : p.Q0}" placeholder="árbol" style="width:90px">`,
            `<button type="button" class="btn-x" data-act="del-pipe" data-i="${i}">✕</button>`]))
            + `<button type="button" class="btn-sm" data-act="add-pipe">+ Tramo</button>`
            + (auto ? "" : ` <button type="button" class="btn-sm" data-act="fill-q0">Completar Q inicial por continuidad</button> <button type="button" class="btn-sm" data-act="clear-q0">Borrar Q inicial</button>`);
        MC.$("ed-loops").innerHTML = MC.table(["Anillo", "Recorrido (nodos en orden, sentido positivo)", ""],
            st.loops.map((l, i) => [ti(`loops.${i}.id`, l.id), ti(`loops.${i}.path`, l.path, 220), `<button type="button" class="btn-x" data-act="del-loop" data-i="${i}">✕</button>`]))
            + `<button type="button" class="btn-sm" data-act="add-loop">+ Anillo</button>`;
        MC.$("in-hbase").innerHTML = MC.field("Hbase", "Altura de la base del tanque H<sub>base</sub>", st.Hbase, { unit: "m", adopt: R ? R.HbaseAuto : null, auto, dec: 2 });
    }

    const recompute = MC.debounce(function () { doRecompute(); }, 250);
    function doRecompute() {
        R = calc(st);
        if (R.resumen) MC.save("sh-red-sum", R.resumen);
        render();
    }
    recompute.now = doRecompute;

    function render() {
        const N = st.nodes, P = st.pipes, auto = st.mode === "auto";
        MC.$("errs").innerHTML = R.errs.length ? `<div class="alert">${R.errs.map((e) => `<div>⚠ ${MC.esc(e)}</div>`).join("")}</div>` : "";
        MC.$("hero-kpis").innerHTML = MC.kpi("Q máx. horario", MC.f(R.Qmh, 2), "l/s") + MC.kpi("Volumen tanque", MC.f(R.Vmh, 1), "m³")
            + (R.Hbase != null ? MC.kpi("Base del tanque", MC.f(R.Hbase, 2), "m") + MC.kpi("Presión mínima", MC.f(R.pres[R.iMin], 2), "m.c.a.") : "");
        MC.$("out-datos").innerHTML = MC.kv([["Caudal por edificio", MC.f(R.qEdif, 4), "l/s/lote"], ["Caudal máximo diario", MC.f(R.Qmd, 3), "l/s"], ["Caudal máximo horario", MC.f(R.Qmh, 3), "l/s", 1]]);
        MC.$("out-tanque").innerHTML = MC.kv([["Área", MC.f(R.tkA, 2), "m²"], ["Volumen (Q máx. diario)", MC.f(R.Vmd, 2), "m³"], ["Volumen (Q máx. horario)", MC.f(R.Vmh, 2), "m³", 1],
        ["Volumen extra para la hora pico", MC.f(R.Vpico, 2), "m³"], ["Altura útil (Q máx. diario)", MC.f(R.Hmd, 3), "m"], ["Altura útil (Q máx. horario)", MC.f(R.Hmh, 3), "m"], ["Altura total con borde libre", MC.f(R.Htot, 3), "m", 1]]);
        if (!R.hc) { MC.$("out-red").innerHTML = ""; MC.$("out-hc").innerHTML = ""; MC.$("out-pres").innerHTML = ""; MC.$("svg-red").innerHTML = drawNet(); renderInforme(); return; }
        if (auto) P.forEach((p, i) => { const a = MC.$("ro-D-" + i), b = MC.$("ro-Q-" + i); if (a) a.textContent = R.Dmm[i]; if (b) b.textContent = MC.f(R.Q0[i] * 1000, 3); });
        const hb = document.querySelector('[data-bind="Hbase"]'); if (hb) hb.placeholder = MC.f(R.HbaseAuto, 2);
        MC.$("svg-red").innerHTML = drawNet();
        MC.$("out-red").innerHTML = MC.table(["Tramo", "a → b", "L (m)", "Lotes", "Q<sub>a</sub> (l/s)", "Q inicial (l/s)", "D rec. con Q final (mm)", "D adoptado", "Q final a→b (l/s)", "v (m/s)", "J (m/m)", "h (m)", "Verificación"],
            P.map((p, i) => [p.id, `${p.a} → ${p.b}`, MC.f(p.L, 2), p.lotes, MC.f(R.Qa[i], 3), MC.f(R.Q0[i] * 1000, 3), MC.f(R.dRecQf[i] * 1000, 1), `${R.Dmm[i]} mm`, MC.f(R.Qf[i] * 1000, 3), MC.f(R.vel[i], 3), MC.fx(R.Jf[i], 5), MC.f(R.hf[i], 3),
            MC.badge(R.vel[i] >= st.vMin && R.vel[i] <= st.vMax, "Verifica", R.vel[i] > st.vMax ? "Aumentar D" : (R.Dmm[i] <= st.Dmin ? "v baja (D mín.)" : "Disminuir D"), R.vel[i] < st.vMin && R.Dmm[i] <= st.Dmin)]))
            + MC.table(["Nodo", "Cota terreno (m)", "Demanda q (l/s)", "Continuidad inicial (l/s)"], N.map((n, i) => [n.id, MC.f(n.ct, 3), MC.f(R.dem[i], 3), MC.f(R.cont[i], 5)]))
            + (auto && R.log.length ? `<details class="notes"><summary>Registro del algoritmo de dimensionamiento (${R.log.filter((l) => l.pass).length} pasadas)</summary><div class="notes-body">${MC.table(["Pasada", "Diámetros (mm)", "Q final (l/s)", "Iteraciones HC", "Converge"], R.log.filter((l) => l.pass).map((l) => [l.pass, l.D.join(" · "), l.Q.map((q) => MC.f(q, 2)).join(" · "), l.it, l.conv ? "sí" : "no"]))}${R.log.filter((l) => l.nota).map((l) => `<p>${l.nota}</p>`).join("")}<p>Cada pasada dimensiona con la velocidad económica usando los caudales de la pasada anterior, corre Hardy Cross y repite hasta que los diámetros no cambian.</p></div></details>` : "")
            + (auto ? `<button type="button" class="btn-sm" data-act="copy-auto">Pasar estos valores a modo manual</button>` : "");
        // Iteraciones
        MC.$("out-hc").innerHTML = R.hc.its.map((it) => `<details class="iter" ${it.k === 1 || it.k === R.hc.its.length ? "open" : ""}><summary>Iteración ${it.k} · |ΔQ| máx = ${MC.f(it.maxdQ * 1000, 5)} l/s</summary>${it.loops.map((lr) => `<h5>Anillo ${lr.id}</h5>` + MC.table(["Tramo", "D (m)", "L (m)", "Q (m³/s)", "v (m/s)", "J (m/m)", "h (m)", "h/Q", "ΔQ propia", "ΔQ común", "Q corregido (m³/s)"],
            lr.rows.map((r) => [P[r.pi].id + (r.s < 0 ? " (−)" : ""), MC.fx(R.Dm[r.pi], 3), MC.f(P[r.pi].L, 1), MC.fx(r.q, 5), MC.fx(r.v, 3), MC.fx(r.J, 5), MC.fx(r.h, 4), MC.fx(r.hq, 3), MC.fx(r.dPropia, 5), r.comunCon.length ? MC.fx(r.dComun, 5) + " (" + r.comunCon.join(",") + ")" : "—", MC.fx(r.qNew, 5)])
                .concat([{ cls: "tot", cells: ["Σ", "", "", "", "", "", MC.fx(lr.sH, 4), MC.fx(lr.sHQ, 3), "ΔQ = " + MC.fx(lr.dQ, 6), "", ""] }]))).join("")}</details>`).join("")
            + `<p class="footnote">Q y h con el signo del sentido de recorrido de cada anillo (tramos marcados (−) se recorren de b hacia a). Residuo final: ${R.hc.fin.map((f) => `anillo ${f.id}: Σh = ${MC.f(f.sH, 5)} m`).join(" · ")}.</p>`;
        // Presiones
        MC.$("out-pres").innerHTML = MC.table(["Nodo", "Cota terreno (m)", "Cota piezométrica (m)", "Presión disponible (m.c.a.)", `≥ ${st.pMin}`],
            N.map((n, i) => ({ cls: i === R.iMin ? "hl" : "", cells: [n.id + (n.id === st.fuente ? " (tanque)" : ""), MC.f(n.ct, 3), MC.f(R.CP[i], 3), MC.f(R.pres[i], 3), MC.badge(R.pres[i] >= st.pMin - 1e-9)] })))
            + MC.kv([["H base mínima calculada", MC.f(R.HbaseMin, 3), "m"], ["H base adoptada", MC.f(R.Hbase, 2), "m", 1], ["Presión máxima dinámica", MC.f(R.pres[R.iMax], 3), "m.c.a."], ["Presión mínima dinámica", MC.f(R.pres[R.iMin], 3), "m.c.a."], ["Pérdida entre nodos extremos", MC.f(R.pres[R.iMax] - R.pres[R.iMin], 3), "m"], ["Presión estática máxima", MC.f(R.Pest, 2), "m.c.a."]]);
        renderEditorsLight();
        renderInforme();
    }
    function renderEditorsLight() { /* los editores no se regeneran al tipear para no perder el foco */ }

    function drawNet() {
        const N = st.nodes, P = st.pipes;
        if (!N.length) return "";
        const xs = N.map((n) => +n.x || 0), ys = N.map((n) => +n.y || 0);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const W = 560, H = 440, pad = 120;
        const sx = (x) => pad + (maxX > minX ? (x - minX) / (maxX - minX) : 0.5) * (W - 2 * pad);
        const sy = (y) => pad + (maxY > minY ? (y - minY) / (maxY - minY) : 0.5) * (H - 2 * pad);
        const pos = {}; N.forEach((n) => { pos[n.id] = [sx(+n.x || 0), sy(+n.y || 0)]; });
        let s = `<svg viewBox="0 0 ${W} ${H}" class="net-svg" role="img" aria-label="Esquema de la red"><defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arr"/></marker></defs>`;
        P.forEach((p, i) => {
            if (!pos[p.a] || !pos[p.b]) return;
            let [x1, y1] = pos[p.a], [x2, y2] = pos[p.b];
            const q = R && R.Qf ? R.Qf[i] : null;
            if (q != null && q < 0) [x1, y1, x2, y2] = [x2, y2, x1, y1];
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="pipe" />`;
            s += `<line x1="${x1 + (x2 - x1) * 0.35}" y1="${y1 + (y2 - y1) * 0.35}" x2="${x1 + (x2 - x1) * 0.6}" y2="${y1 + (y2 - y1) * 0.6}" class="flow" marker-end="url(#arr)"/>`;
            const lab = R && R.Qf ? `${p.id} · ${MC.f(Math.abs(R.Qf[i]) * 1000, 1)} l/s · Ø${R.Dmm[i]}` : p.id;
            const vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1);
            s += `<text x="${mx + (vertical ? 8 : 0)}" y="${my + (vertical ? 0 : -8)}" class="plab" text-anchor="${vertical ? "start" : "middle"}">${MC.esc(lab)}</text>`;
        });
        st.loops.forEach((lp) => {
            const ids = String(lp.path).split(/[-–,\s]+/).filter((x) => pos[x]);
            if (!ids.length) return;
            const cx = MC.sum(ids.map((id) => pos[id][0])) / ids.length, cy = MC.sum(ids.map((id) => pos[id][1])) / ids.length;
            s += `<text x="${cx}" y="${cy + 6}" class="llab" text-anchor="middle">${MC.esc(lp.id)}</text>`;
        });
        N.forEach((n, i) => {
            const [x, y] = pos[n.id];
            const isT = n.id === st.fuente;
            s += `<circle cx="${x}" cy="${y}" r="${isT ? 11 : 7}" class="${isT ? "node tank" : "node"}"/>`;
            const pr = R && R.pres ? ` · ${MC.f(R.pres[i], 1)} mca` : "";
            const left = x < W / 2;
            s += `<text x="${x + (left ? -14 : 14)}" y="${y - 12}" class="nlab" text-anchor="${left ? "end" : "start"}">${MC.esc(n.id)}</text>`;
            s += `<text x="${x + (left ? -14 : 14)}" y="${y + 4}" class="plab" text-anchor="${left ? "end" : "start"}">CT ${MC.f(n.ct, 1)}${pr}</text>`;
        });
        return s + "</svg>";
    }

    function renderInforme() {
        const P = st.pipes, N = st.nodes;
        const secs = [];
        if (R.hc) {
            secs.push({ t: "Red de distribución · resultados de Hardy Cross", html: MC.table(["Tramo", "L (m)", "D (mm)", "Q (l/s)", "v (m/s)", "h (m)"], P.map((p, i) => [p.id, MC.f(p.L, 1), R.Dmm[i], MC.f(R.Qf[i] * 1000, 3), MC.f(R.vel[i], 3), MC.f(R.hf[i], 3)])) });
            secs.push({ t: "Presiones", html: MC.table(["Nodo", "CT (m)", "CP (m)", "Presión (m.c.a.)"], N.map((n, i) => [n.id, MC.f(n.ct, 2), MC.f(R.CP[i], 3), MC.f(R.pres[i], 3)])) });
            secs.push({ t: "Hardy Cross · iteraciones", html: MC.table(["Iteración", ...st.loops.map((l) => "ΔQ anillo " + l.id + " (l/s)")], R.hc.its.map((it) => [it.k, ...it.loops.map((l) => MC.fx(l.dQ * 1000, 5))])) });
        }
        MC.$("informe-body").innerHTML = MC.informeHTML({
            titulo: "Red de distribución de agua potable",
            sub: "Datos iniciales · tanque elevado · Hardy Cross · presiones",
            datos: [["Caudal medio diario", MC.f(st.qMed, 3), "l/s"], ["Edificios", st.nEdif, "lotes"], ["K1 / K2", `${st.K1} / ${st.K2}`, ""], ["Hazen-Williams C", st.Chw, ""], ["Diámetro del tanque", st.tank.D, "m"], ["Tiempo de regulación", st.tank.tReg, "h"], ["Reserva adicional", st.tank.vRes, "m³"], ["Modo de cálculo", st.mode === "auto" ? "Automático" : "Manual", ""]],
            secciones: secs, memo: R.memo, checks: R.checks,
        });
        MC.typeset(MC.$("informe-body"));
    }

    root.RedCalc = { DEF, calc, D_RED };
    if (typeof module !== "undefined") module.exports = root.RedCalc;
    if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", ui);
})(typeof window !== "undefined" ? window : globalThis);
