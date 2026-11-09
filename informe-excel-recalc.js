"use strict";
/* =====================================================================
   informe-excel-recalc.js — Recálculo independiente con los módulos de
   la web. Río y tanque usan el núcleo (mod-core.js); la red usa red.js.
   La potabilizadora se recalcula con las mismas funciones de app.js:
   en el navegador dentro de un iframe oculto; en Node, en un sandbox.
   ===================================================================== */
(function (root) {
    const MC = root.MC || (typeof require === "function" ? require("./mod-core.js") : null);
    const RedCalc = root.RedCalc || (typeof require === "function" ? require("./red.js") : null);
    const TanqueCalc = root.TanqueCalc || (typeof require === "function" ? require("./tanque.js") : null);

    const crf = (i, n) => { const f = Math.pow(1 + i, n); return i * f / (f - 1); };
    function priceAt(map, key) {
        if (!map) return null;
        if (map[key] != null) return map[key];
        const ks = Object.keys(map).map(Number).sort((a, b) => a - b);
        const k = ks.find((x) => x >= key - 1e-9);
        return k != null ? map[k] : null;
    }
    function pctDiff(a, b) {
        if (a == null || b == null || !isFinite(a) || !isFinite(b)) return null;
        if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? 0 : null;
        return 100 * Math.abs(b - a) / Math.abs(a);
    }
    function altsOf(data, key) {
        const a = data[key] && data[key].alts;
        if (!a) return [[], [], []];
        return [0, 1, 2].map((i) => ({
            dS: a.dS ? a.dS[i] : null, dI: a.dI ? a.dI[i] : null,
            vS: a.vS ? a.vS[i] : null, vI: a.vI ? a.vI[i] : null,
            JS: a.JS ? a.JS[i] : null, JI: a.JI ? a.JI[i] : null,
            leqS: a.leqS ? a.leqS[i] : null, leqI: a.leqI ? a.leqI[i] : null,
            LS: a.LS ? a.LS[i] : null, LI: a.LI ? a.LI[i] : null,
            hS: a.hS ? a.hS[i] : null, hI: a.hI ? a.hI[i] : null,
            hvS: a.hvS ? a.hvS[i] : null, hvI: a.hvI ? a.hvI[i] : null,
            pRes: a.pRes ? a.pRes[i] : null,
            HmS: a.HmS ? a.HmS[i] : null, HmI: a.HmI ? a.HmI[i] : null, Hm: a.Hm ? a.Hm[i] : null,
            Pb: a.Pb ? a.Pb[i] : null, HP: a.HP ? a.HP[i] : null, Pmb: a.Pmb ? a.Pmb[i] : null,
            holgura: a.holgura ? a.holgura[i] : null, Phmb: a.Phmb ? a.Phmb[i] : null,
        }));
    }

    function calcAlt(base, a, etaB, etaM, opt) {
        const qb = base.qb;
        const dS = a.dS, dI = a.dI;
        const vS = qb / MC.area(dS / 1000), vI = qb / MC.area(dI / 1000);
        const JS = MC.jFWH(qb, dS / 1000), JI = MC.jFWH(qb, dI / 1000);
        const leqS = a.leqS != null ? a.leqS : 0, leqI = a.leqI != null ? a.leqI : 0;
        const LS = a.LS != null ? a.LS : 0, LI = a.LI != null ? a.LI : 0;
        const hS = a.hS != null ? a.hS : 0, hI = a.hI != null ? a.hI : 0;
        const hvS = vS * vS / (2 * MC.G), hvI = vI * vI / (2 * MC.G);
        const HmS = hS + (LS + leqS) * JS + hvS;
        const HmI = hI + (LI + leqI) * JI + hvI;
        const pRes = a.pRes != null ? a.pRes : 0;
        const Hm = HmS + HmI + pRes;
        const eb = etaB != null && isFinite(etaB) ? etaB : MC.etaBomba(qb * 1000).eta;
        const Pb = 1000 * qb * Hm / (75 * eb);
        const HP = Pb / MC.CV_POR_HP; // corrección: 1 HP = 1,014 CV => dividir
        const em = etaM != null && isFinite(etaM) ? etaM : MC.etaMotor(HP).eta;
        const Pmb = HP / em;
        const hg = MC.holgura(Pmb);
        const Phmb = Pmb * (1 + hg.h);
        const Padop = MC.hpComercial(Phmb);
        const vOkS = vS >= (opt.vMin || 0.7) && vS <= (opt.vMax || 4.0);
        const vOkI = vI >= (opt.vMin || 0.7) && vI <= (opt.vMax || 4.0);
        const sGt = dS > dI;
        let pipeCost = null, pumpCost = null, energyKWh = null, energy = null, maint = null, annual = null;
        const eco = opt.eco || {};
        if (opt.pipePrices && opt.pipePrices[dI] != null) {
            pipeCost = opt.pipeMethod === "tanque"
                ? opt.pipePrices[dI] * LI + (opt.pipePrices[dS] != null ? opt.pipePrices[dS] * LS : 0)
                : opt.pipePrices[dI] * (LI + LS || 0);
        }
        if (opt.pumpPrices) pumpCost = priceAt(opt.pumpPrices, Padop);
        const hours = opt.hours != null ? opt.hours : 12;
        energyKWh = Pmb * 0.7457 * hours * 365;
        energy = eco.kwh != null ? energyKWh * eco.kwh : null;
        if (pipeCost != null && pumpCost != null && eco.maint != null) maint = (pipeCost + pumpCost) * eco.maint / 100;
        const i = eco.rate != null ? eco.rate / 100 : 0.08;
        if (pipeCost != null && pumpCost != null) {
            const fT = eco.frcT != null ? eco.frcT : crf(i, eco.vidaT || 50);
            const fB = eco.frcB != null ? eco.frcB : crf(i, eco.vidaB || 7);
            annual = pipeCost * fT + pumpCost * fB + (energy || 0) + (maint || 0);
        }
        return {
            dS, dI, vS, vI, JS, JI, leqS, leqI, LS, LI, hS, hI, hvS, hvI, pRes, HmS, HmI, Hm,
            etaB: eb, Pb, HP, etaM: em, Pmb, holgura: hg.h, Phmb, Padop,
            vOkS, vOkI, sGt, ok: vOkS && vOkI && sGt,
            pipeCost, pumpCost, energyKWh, energy, maint, annual,
        };
    }

    function recalcRioCore(data) {
        if (!data || !data.rio) return null;
        const inp = data.rio.inputs;
        // La población y la logística se recalculan desde las entradas, no desde
        // los resultados en caché, para que un cambio de datos se refleje siempre.
        const pop = inp.manzanas * inp.lotes * (inp.pisos * inp.deptos * (inp.dorm * inp.persDorm + inp.persServ));
        const log = (inp.deptos * inp.pisos) * inp.pctLog / 100 * inp.lotes * inp.manzanas;
        const horas = inp.horas > 0 ? inp.horas : 12;
        const k1 = inp.k1 > 0 ? inp.k1 : 1.2, k3 = inp.k3 > 0 ? inp.k3 : 1.05;
        const qm_ld = pop * inp.qDept + log * inp.qLog;
        const qm_m3d = qm_ld / 1000, qm_ls = qm_ld / 86400;
        const qb = k1 * k3 * qm_m3d / 86400;
        const bresse = MC.bresse(qb, horas / 24);
        const a = altsOf(data, "rio");
        const opt = { vMin: 0.7, vMax: 4.0, hours: horas, eco: data.rio.eco, pipePrices: data.rio.pipePrices, pumpPrices: data.rio.pumpPrices, pipeMethod: "rio" };
        const alts = a.map((x, i) => calcAlt({ qb }, x, data.rio.etaB ? data.rio.etaB[i] : null, data.rio.etaM ? data.rio.etaM[i] : null, opt));
        const ok = alts.filter((x) => x.ok && x.annual != null).sort((x, y) => x.annual - y.annual);
        return {
            pop, log, qm_ld, qm_m3d, qm_ls, qb, qb_ls: qb * 1000, bresse, alts,
            adopted: ok.length ? alts.indexOf(ok[0]) : null,
            adoptedLabel: ok.length ? "Alt " + (alts.indexOf(ok[0]) + 1) : null,
        };
    }

    function recalcTanqueCore(data) {
        if (!data || !data.tanque) return null;
        const inp = data.tanque.inputs;
        const qb = inp.qb_m3s != null ? inp.qb_m3s : (inp.k1 * inp.qMed / 86400);
        const bresse = MC.bresse(qb, inp.horas / 24);
        const Hbase = (data.red && data.red.datosInic && data.red.datosInic.Hbase != null) ? data.red.datosInic.Hbase
            : (data.red && data.red.presiones && data.red.presiones.hbAd.value != null ? data.red.presiones.hbAd.value : 0);
        const Htanque = (data.red && data.red.datosInic && data.red.datosInic.Htanque != null) ? data.red.datosInic.Htanque : 0;
        const a = altsOf(data, "tanque");
        const opt = { vMin: 0.6, vMax: 3.5, hours: inp.horas, eco: data.rio ? data.rio.eco : null, pipePrices: data.rio ? data.rio.pipePrices : null, pumpPrices: data.rio ? data.rio.pumpPrices : null, pipeMethod: "tanque" };
        const alts = a.map((x, i) => {
            const y = Object.assign({}, x);
            if (y.hI != null) y.hI = y.hI; // la altura topográfica ya viene de la hoja
            return calcAlt({ qb }, y, data.tanque.etaB ? data.tanque.etaB[i] : null, data.tanque.etaM ? data.tanque.etaM[i] : null, opt);
        });
        // La hoja del tanque arma H_I con la diferencia de cotas + Hbase + Htanque.
        alts.forEach((x, i) => {
            const base = (inp.cotaTanque - inp.cotaBomba) + Hbase + Htanque;
            const a0 = a[i];
            const hvI = a0.vI != null ? a0.vI * a0.vI / (2 * MC.G) : x.hvI;
            x.hI = base;
            x.HmI = base + (a0.LI != null ? a0.LI : 0) + (a0.leqI != null ? a0.leqI : 0) * 0 + 0; // se corrige abajo
            x.HmI = base + ((a0.LI || 0) + (a0.leqI || 0)) * (a0.JI || x.JI) + hvI;
            x.Hm = x.HmS + x.HmI + (a0.pRes != null ? a0.pRes : 0);
            x.Pb = 1000 * qb * x.Hm / (75 * (x.etaB || 1));
            x.HP = x.Pb / MC.CV_POR_HP;
            x.Pmb = x.HP / (x.etaM || 1);
            const hg = MC.holgura(x.Pmb);
            x.holgura = hg.h; x.Phmb = x.Pmb * (1 + hg.h); x.Padop = MC.hpComercial(x.Phmb);
            x.ok = x.vOkS && x.vOkI && x.sGt;
            if (opt.pipePrices && opt.pipePrices[a0.dI] != null) {
                x.pipeCost = opt.pipePrices[a0.dI] * (a0.LI || 0) + (opt.pipePrices[a0.dS] != null ? opt.pipePrices[a0.dS] * (a0.LS || 0) : 0);
                x.pumpCost = priceAt(opt.pumpPrices, x.Padop);
                x.energyKWh = x.Pmb * 0.7457 * (inp.horas || 12) * 365;
                x.energy = x.energyKWh * (opt.eco && opt.eco.kwh != null ? opt.eco.kwh : 0.06);
                x.maint = (x.pipeCost + (x.pumpCost || 0)) * ((opt.eco && opt.eco.maint) || 0) / 100;
                const i = opt.eco && opt.eco.rate != null ? opt.eco.rate / 100 : 0.08;
                const fT = opt.eco && opt.eco.frcT != null ? opt.eco.frcT : crf(i, (opt.eco && opt.eco.vidaT) || 50);
                const fB = opt.eco && opt.eco.frcB != null ? opt.eco.frcB : crf(i, (opt.eco && opt.eco.vidaB) || 7);
                x.annual = x.pipeCost * fT + (x.pumpCost || 0) * fB + x.energy + x.maint;
            }
        });
        const ok = alts.filter((x) => x.ok && x.annual != null).sort((x, y) => x.annual - y.annual);
        return { qb, qb_ls: qb * 1000, bresse, Hbase, Htanque, alts, adopted: ok.length ? alts.indexOf(ok[0]) : null, adoptedLabel: ok.length ? "Alt " + (alts.indexOf(ok[0]) + 1) : null };
    }

    /* ---------------- Red pública ---------------- */
    function coordsFromId(id, fallback) {
        const m = /^([A-Za-z]+)(\d+)$/.exec(String(id || ""));
        if (m) return { x: m[1].toUpperCase().charCodeAt(0) - 65, y: Number(m[2]), group: m[1].toUpperCase() };
        return { x: fallback % 6, y: Math.floor(fallback / 6), group: "N" };
    }
    function gridLoops(nodes) {
        const pos = {};
        nodes.forEach((n) => { const m = /^([A-Za-z]+)(\d+)$/.exec(String(n.id || "")); if (m) pos[(m[1].toUpperCase().charCodeAt(0) - 65) + "," + Number(m[2])] = n.id; });
        if (!Object.keys(pos).length) return [];
        const loops = [];
        const xs = [...new Set(Object.keys(pos).map((k) => +k.split(",")[0]))].sort((a, b) => a - b);
        const ys = [...new Set(Object.keys(pos).map((k) => +k.split(",")[1]))].sort((a, b) => a - b);
        for (const y of ys) for (const x of xs) {
            const a = pos[x + "," + y], b = pos[(x + 1) + "," + y], c = pos[(x + 1) + "," + (y + 1)], d = pos[x + "," + (y + 1)];
            if (a && b && c && d) loops.push({ id: "L" + (loops.length + 1), path: [a, b, c, d].join("-") });
        }
        return loops;
    }
    function deriveLoops(nodes, pipes) {
        const idx = {}; nodes.forEach((n, i) => { idx[n.id] = i; });
        const adj = nodes.map(() => []);
        pipes.forEach((p, pi) => {
            if (!(p.a in idx) || !(p.b in idx)) return;
            adj[idx[p.a]].push({ to: idx[p.b], pi }); adj[idx[p.b]].push({ to: idx[p.a], pi });
        });
        const seen = new Array(nodes.length).fill(false), parent = new Array(nodes.length).fill(-1), pPipe = new Array(nodes.length).fill(-1), tree = new Set();
        const dfs = (u) => {
            seen[u] = true;
            for (const e of adj[u]) if (!seen[e.to]) { parent[e.to] = u; pPipe[e.to] = e.pi; tree.add(e.pi); dfs(e.to); }
        };
        for (let i = 0; i < nodes.length; i++) if (!seen[i]) dfs(i);
        // Camino entre dos nodos usando solo las aristas del árbol (BFS).
        function treePath(a, b) {
            const prev = new Map([[a, -1]]), q = [a];
            while (q.length) {
                const u = q.shift();
                if (u === b) break;
                for (const e of adj[u]) if (tree.has(e.pi) && !prev.has(e.to)) { prev.set(e.to, u); q.push(e.to); }
            }
            if (!prev.has(b)) return null;
            const path = [];
            let u = b;
            while (u !== -1) { path.push(nodes[u].id); u = prev.get(u); }
            return path.reverse();
        }
        const loops = [];
        pipes.forEach((p, pi) => {
            if (tree.has(pi) || !(p.a in idx) || !(p.b in idx)) return;
            const seq = treePath(idx[p.a], idx[p.b]);
            if (seq && seq.length >= 3) loops.push({ id: "L" + (loops.length + 1), path: seq.join("-") });
        });
        return loops;
    }
    function recalcRedCore(data) {
        if (!data || !data.red || !data.red.datosInic || !RedCalc) return null;
        const di = data.red.datosInic, pr = data.red.presiones, ca = data.red.caudales;
        const seenPipe = new Set();
        const pipes = di.tramos.rows.filter((t) => {
            if (!t.id || !t.a || !t.b || seenPipe.has(t.id)) return false;
            seenPipe.add(t.id);
            return true;
        }).map((t) => ({
            id: t.id, a: t.a, b: t.b, L: Number(t.L), lotes: Number(t.lotes) || 0,
            D: t.D != null ? Number(t.D) : (t.Dcom != null ? Number(t.Dcom) : null),
            // red.js espera Q0 en l/s y lo convierte internamente a m³/s.
            Q0: t.Q0 != null ? Number(t.Q0) : null,
        }));
        const valid = new Set(); pipes.forEach((p) => { valid.add(p.a); valid.add(p.b); });
        const nodeRows = ((pr && pr.nodos.length ? pr.nodos : di.nodos.rows) || []).filter((n) => valid.has(n.id) && isFinite(Number(n.ct)));
        if (!nodeRows.length || !pipes.length) return null;
        const nodes = nodeRows.map((n, i) => { const c = coordsFromId(n.id, i); return { id: n.id, ct: Number(n.ct), x: c.x, y: c.y }; });
        let loops = [];
        const nIndep = pipes.length - nodes.length + 1;
        const grid = gridLoops(nodes);
        if (grid.length === nIndep) loops = grid;
        else {
            if (ca && ca.loops && ca.loops.length) loops = ca.loops.map((path, i) => ({ id: "L" + (i + 1), path }));
            if (!loops.length || loops.length !== nIndep || loops.some((l) => !String(l.path).includes("-"))) loops = deriveLoops(nodes, pipes);
        }
        const source = nodes.reduce((best, n) => (n.ct > best.ct ? n : best), nodes[0]).id;
        const qMed = di.qMed != null ? Number(di.qMed) : (data.rio ? Number(data.rio.results.qm_ls.value) : 15);
        const Hbase = di.Hbase != null ? Number(di.Hbase)
            : (pr && pr.hbAd && pr.hbAd.value != null ? Number(pr.hbAd.value) : null);
        const st = Object.assign(JSON.parse(JSON.stringify(RedCalc.DEF)), {
            mode: "manual", qMed, nEdif: Number(di.edificios) || pipes.reduce((s, p) => s + p.lotes, 0),
            K1: Number(di.k1) || 1.2, K2: Number(di.k2) || 1.5, Chw: Number(di.Chw) || 140,
            vEc: Number(di.vEc) || 1.2, vMin: Number(di.vMin) || 0.6, vMax: 3.5,
            Dmin: Number(di.Dmin) || 75, pMin: pr && pr.pMin && pr.pMin.value != null ? Number(pr.pMin.value) : 10,
            pMaxEst: 40, tolLs: ca && ca.tol && ca.tol.value != null ? Number(ca.tol.value) : 0.001, maxIt: 300,
            fuente: source, Hbase, nodes, pipes, loops,
            tank: { D: Number(di.tankD) || 10, tReg: 2, vRes: 90, borde: 0.3 },
        });
        let R;
        try { R = RedCalc.calc(st); } catch (e) { return { error: e.message, state: st }; }
        // Si el archivo trae magnitudes de Q y no caudales iniciales compatibles,
        // se deja que red.js arme la distribución inicial por continuidad.
        if (R && R.errs && R.errs.some((e) => /continuidad/i.test(String(e)))) {
            const st2 = JSON.parse(JSON.stringify(st));
            st2.pipes.forEach((p) => { p.Q0 = null; });
            try { const R2 = RedCalc.calc(st2); if (!R2.errs || !R2.errs.some((e) => /continuidad/i.test(String(e)))) { return { state: st2, result: R2, nodes, pipes: st2.pipes, loops, source, fallbackQ0: true }; } } catch (e) { /* noop */ }
        }
        return { state: st, result: R, nodes, pipes, loops, source };
    }

    /* ---------------- Potabilizadora ---------------- */
    function potabFromState(SP, potabCalc) {
        const r = potabCalc();
        return {
            qcap: r.qcapLps, qcap_m3s: r.qcap, aqArea: r.aqArea, aqLado: r.aqLado, aqProf: r.aqProf,
            phH: r.phH, phH2: r.phH2, phH3: r.phH3, phH1: r.phH1, phV: r.phV,
            vHmax: r.vHmax, vH1: r.vH1, vH2: r.vH2, vV1: r.vV1, vV2: r.vV2, vT: r.vT,
            gVert: r.gVert, gr: r.gr, estL: r.estL,
            mzVtanque: r.mzVtanque, mzP: r.mzP,
            flB: r.flB, flBAdopt: r.flBAdopt, flV: r.flV, flV1rec: r.flV1rec, flN: r.flN, flY: r.flY, flLt: r.flLt, flHftotal: r.flHftotal, flG: r.flG,
            sedQ: r.sedQ, sedV: r.sedV, sedAs: r.sedAs, sedH: r.sedH, sedL: r.sedL, sedB: r.sedB, sedLH: r.sedLH,
            filA: r.filA, filL1: r.filL1, filL2: r.filL2, filQlav: r.filQlav,
            clV: r.clV, clConsumo: r.clConsumo, clDisol: r.clDisol,
            resV: r.resV, resD: r.resD, resH: r.resH,
            raw: r,
        };
    }
    function recalcPotabBrowser(data) {
        return new Promise((resolve) => {
            if (!data || !data.potab) return resolve(null);
            if (typeof document === "undefined") return resolve(null);
            const frame = document.createElement("iframe");
            frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0;visibility:hidden";
            frame.src = "potabilizadora.html";
            let done = false;
            const finish = (val) => { if (done) return; done = true; try { frame.remove(); } catch (e) { } resolve(val); };
            const timer = setTimeout(() => finish({ error: "La potabilizadora no respondió a tiempo." }), 20000);
            frame.onload = () => {
                try {
                    const w = frame.contentWindow;
                    if (!w || typeof w.potabCalc !== "function") throw new Error("No se cargó el cálculo de la potabilizadora.");
                    // `const SP` es una variable léxica global: no está en window.SP.
                    const spObj = w.eval("typeof SP !== 'undefined' ? SP : null");
                    if (spObj && data.potab.sp) Object.assign(spObj, data.potab.sp);
                    if (typeof w.potabAutoAdopt === "function") w.potabAutoAdopt();
                    const out = potabFromState(spObj, w.potabCalc);
                    clearTimeout(timer);
                    finish({ ...out, sp: JSON.parse(w.eval("JSON.stringify(SP)")) });
                } catch (e) { clearTimeout(timer); finish({ error: e.message }); }
            };
            document.body.appendChild(frame);
        });
    }
    async function recalcPotabNode(data) {
        const vm = require("vm");
        const fs = require("fs");
        const path = require("path");
        const base = __dirname;
        const code = ["data.js", "steps.js", "app.js"].map((f) => fs.readFileSync(path.join(base, f), "utf8")).join("\n")
            .replace(/\/\* ================= Init ================= \*\/[\s\S]*$/, "") +
            "\nglobalThis.__potab={potabCalc,potabAutoAdopt,SP};";
        const sandbox = {
            console, Math, Date, JSON, isFinite, isNaN, parseFloat, parseInt, Number, String, Array, Object, RegExp,
            document: { body: { dataset: { page: "potab-auto" } }, getElementById: () => null, querySelectorAll: () => [], addEventListener: () => { }, activeElement: null, createElement: () => ({ getContext: () => ({}), toDataURL: () => "" }) },
            window: { MathJax: { startup: { promise: Promise.resolve() } }, print: () => { } },
            localStorage: { getItem: () => null, setItem: () => { } },
        };
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);
        const SP = sandbox.__potab.SP;
        if (data && data.potab && data.potab.sp) Object.assign(SP, data.potab.sp);
        sandbox.__potab.potabAutoAdopt();
        return potabFromState(SP, sandbox.__potab.potabCalc);
    }
    async function recalcPotab(data) {
        if (!data || !data.potab) return null;
        if (typeof window !== "undefined" && typeof document !== "undefined") return recalcPotabBrowser(data);
        try { return await recalcPotabNode(data); } catch (e) { return { error: e.message }; }
    }

    async function recalcAll(data) {
        const out = { rio: recalcRioCore(data), tanque: recalcTanqueCore(data), red: recalcRedCore(data), potab: await recalcPotab(data) };
        return out;
    }

    const API = {
        recalcAll, recalcRioCore, recalcTanqueCore, recalcRedCore, recalcPotab, recalcPotabNode,
        pctDiff, priceAt, crf, deriveLoops, calcAlt,
    };
    root.IERecalc = API;
    if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
