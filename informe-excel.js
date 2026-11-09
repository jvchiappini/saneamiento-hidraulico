"use strict";
/* =====================================================================
   informe-excel.js — Lectura del libro .xlsx, extracción por rótulos,
   comparación con el recálculo de la web y generación del informe.
   Todo ocurre en el navegador: el archivo no se envía a ningún servidor.
   ===================================================================== */
(function (root) {
    const MAP = root.IEMap || (typeof require === "function" ? require("./informe-excel-map.js") : null);
    const norm = MAP.norm;
    const $ = (id) => (typeof document !== "undefined" ? document.getElementById(id) : null);

    /* ---------------- Direcciones y celdas ---------------- */
    function colNum(c) { let n = 0; for (const ch of String(c).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
    function colName(n) { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
    function addr(a) {
        const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(String(a || "").trim());
        if (!m) return { c: "A", r: 1, cn: 1 };
        return { c: m[1].toUpperCase(), r: +m[2], cn: colNum(m[1]) };
    }
    function cellsOf(sheet) {
        const out = {};
        if (!sheet) return out;
        for (const k of Object.keys(sheet)) if (/^\$?[A-Za-z]+\$?\d+$/.test(k)) {
            const a = addr(k); out[a.c + a.r] = sheet[k];
        }
        return out;
    }
    function get(sheet, a) {
        if (!sheet) return null;
        const key = String(a).replace(/\$/g, "").toUpperCase();
        if (sheet[key] != null) return sheet[key];
        const x = addr(key);
        return sheet[x.c + x.r] || null;
    }
    function v(cell) {
        if (cell == null) return null;
        if (typeof cell === "object" && "v" in cell && cell.v !== undefined && cell.v !== null && cell.v !== "") return cell.v;
        if (typeof cell === "object" && cell.w !== undefined && cell.w !== null && cell.w !== "") {
            const s = String(cell.w).trim();
            if (/^#(REF|DIV|NAME|VALUE|N\/A|NUM|NULL)/i.test(s)) return s;
            const n = Number(s.replace(/\s/g, "").replace(",", "."));
            return isFinite(n) && /^[-+]?[\d.,\s]+$/.test(s) ? n : s;
        }
        if (typeof cell !== "object") return cell;
        return null;
    }
    function txt(cell) {
        if (cell == null) return "";
        if (typeof cell === "object") {
            if (cell.v !== undefined && cell.v !== null) return String(cell.v);
            if (cell.w !== undefined && cell.w !== null) return String(cell.w);
            if (cell.f !== undefined && cell.f !== null) return "";
        }
        return String(cell);
    }
    function formula(cell) { return cell && typeof cell === "object" && cell.f ? String(cell.f) : null; }
    function hasFormulaNoValue(cell) { return !!(cell && typeof cell === "object" && cell.f && (cell.v === undefined || cell.v === null || cell.v === "")); }
    function style(cell) {
        const s = cell && cell.s;
        if (!s || typeof s !== "object") return { fill: null, font: null };
        const pick = (o) => o && (o.rgb || o.argb || (o.theme != null ? "theme:" + o.theme : null));
        const fill = s.fill ? pick(s.fill.fgColor) || pick(s.fill.bgColor) || (s.fill.patternType && s.fill.patternType !== "none" ? "pattern:" + s.fill.patternType : null) : null;
        const font = s.font ? pick(s.font.color) : null;
        return { fill: fill || null, font: font || null };
    }
    function isInputStyle(st) {
        return !!(st && ((st.fill && /FFFF00|FFFFF00|FFFF0000|YELLOW/i.test(String(st.fill))) || (st.font && /FF0000|RED/i.test(String(st.font)))));
    }

    /* ---------------- Búsqueda por rótulos ---------------- */
    function scoreLabel(a, label) {
        const na = norm(a), nl = norm(label);
        if (!na || !nl) return 0;
        if (na === nl) return 100;
        if (na.startsWith(nl)) return 88;
        if (nl.startsWith(na) && na.length >= 4) return 72;
        if (na.includes(nl) && nl.length >= 4) return 64;
        const toks = nl.split(" ").filter((t) => t.length > 1);
        if (toks.length && toks.every((t) => na.includes(t))) return 56;
        return 0;
    }
    function labelRows(sheet, labels, cols) {
        const list = (labels || []).filter(Boolean).map(norm);
        const out = [];
        if (!sheet || !list.length) return out;
        const allow = cols || ["A"];
        for (const k of Object.keys(sheet)) {
            const a = addr(k);
            if (!allow.includes(a.c)) continue;
            const t = txt(sheet[k]);
            if (!t) continue;
            let best = 0;
            for (const l of list) best = Math.max(best, scoreLabel(t, l));
            if (best >= 50) out.push({ r: a.r, c: a.c, cn: a.cn, score: best, text: t });
        }
        out.sort((x, y) => y.score - x.score || x.r - y.r);
        return out;
    }
    function pickLabel(sheet, labels, expected, maxDist) {
        let rows = labelRows(sheet, labels, ["A"]);
        // Si se insertó una columna, los rótulos pueden haber corrido a B/C/D.
        if (!rows.length) rows = labelRows(sheet, labels, ["B", "C", "D"]);
        if (!rows.length) return null;
        const top = rows[0].score;
        const cand = rows.filter((x) => x.score >= top - 18);
        cand.sort((x, y) => Math.abs(x.r - expected) - Math.abs(y.r - expected) || y.score - x.score);
        const r = cand[0];
        if (maxDist && Math.abs(r.r - expected) > maxDist && r.score < 100) return null;
        return r;
    }
    function pickRow(sheet, labels, expected, maxDist) {
        const r = pickLabel(sheet, labels, expected, maxDist);
        return r ? r.r : null;
    }
    function locate(sheet, def) {
        const e = addr(def.cell);
        const col = def.col || e.c;
        let row = null, source = "celda", labelCol = "A";
        if (def.label) {
            const pr = pickLabel(sheet, [def.label], e.r, def.maxDist || 18);
            if (pr) { row = pr.r; labelCol = pr.c; source = "rótulo"; }
        }
        // La columna de valores se corre igual que la columna del rótulo.
        const valueCol = labelCol === "A" ? col : colName(addr(labelCol + (row || e.r)).cn + (e.cn - 1));
        let cellAddr = valueCol + (row || e.r);
        let value = v(get(sheet, cellAddr));
        if (value == null && row != null) {
            // Si insertaron una columna entre el rótulo y el valor, se busca el
            // primer valor a la derecha del rótulo.
            const baseCn = addr(labelCol + row).cn;
            for (let off = 1; off <= 4; off++) {
                const ca = colName(baseCn + off) + row;
                const vv = v(get(sheet, ca));
                if (vv != null) { cellAddr = ca; value = vv; source = "rótulo (columna corrida)"; break; }
            }
        }
        if (value == null && row != null) {
            cellAddr = def.cell; value = v(get(sheet, def.cell)); source = "celda (rótulo sin valor)";
        }
        if (value == null) source = "no encontrado";
        return { key: def.key, label: def.label, value, cell: cellAddr, expectedCell: def.cell, unit: def.unit || "", source, row: row || e.r, formula: formula(get(sheet, cellAddr)) };
    }
    function locateAltRow(sheet, def) {
        const expected = typeof def.cell === "number" ? def.cell : addr(def.cell).r;
        let rec = null;
        if (def.labels && def.labels.length) rec = pickLabel(sheet, def.labels, expected, 8);
        return rec ? { row: rec.r, cn: rec.cn } : { row: expected, cn: 1 };
    }
    function altValues(sheet, defs) {
        let out = null;
        for (const def of defs) {
            const at = locateAltRow(sheet, def);
            const row = at.row, cn = at.cn;
            const raw = [1, 2, 3, 4].map((k) => v(get(sheet, colName(cn + k) + row)));
            let start = raw.findIndex((x) => x != null);
            if (start < 0) start = 0;
            const vals = raw.slice(start, start + 3);
            if (!out) out = { __rows: {} };
            out.__rows[def.key] = { row, cell: colName(cn + 1 + start) + row, label: txt(get(sheet, colName(cn) + row)) };
            out[def.key] = vals.map((x) => (typeof x === "string" ? x : (x == null ? null : Number(x))));
        }
        return out || { __rows: {} };
    }

    /* ---------------- Hojas y roles ---------------- */
    function detectRoles(names) {
        const roles = {}, unmatched = [];
        for (const name of names) {
            const n = norm(name);
            let hit = null;
            for (const r of MAP.ROLES) if (r.test(n)) { hit = r.role; break; }
            if (hit) roles[hit] = name; else unmatched.push(name);
        }
        return { roles, unmatched };
    }
    function sheetMax(sheet) {
        let mr = 1, mc = 1;
        for (const k of Object.keys(sheet || {})) {
            if (!/^[A-Za-z]+\d+$/.test(k)) continue;
            const a = addr(k); if (a.r > mr) mr = a.r; if (a.cn > mc) mc = a.cn;
        }
        return { row: mr, col: mc };
    }
    function entriesOf(sheet, minRow, maxRow) {
        const out = [], mx = sheetMax(sheet);
        const r1 = minRow || 1, r2 = maxRow || mx.row;
        for (let r = r1; r <= r2; r++) {
            let label = "", labelCell = null;
            for (const c of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]) {
                const cell = get(sheet, c + r);
                if (txt(cell).trim()) { label = txt(cell).trim(); labelCell = c + r; break; }
            }
            let value = null, cell = null, unit = "";
            for (const c of ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y"]) {
                const cellObj = get(sheet, c + r);
                const val = v(cellObj);
                if (val != null && val !== "" && String(val).trim() !== label) { value = val; cell = c + r; break; }
            }
            if (!label && value == null) continue;
            if (value == null && !formula(get(sheet, (cell || "B") + r))) continue;
            const cellObj = cell ? get(sheet, cell) : null;
            const st = style(cellObj);
            const unitCell = get(sheet, colName(addr(cell || "B" + r).cn + 1) + r);
            if (txt(unitCell) && txt(unitCell).length <= 14) unit = txt(unitCell).trim();
            out.push({ row: r, label, labelCell, value, cell, unit, formula: formula(cellObj), fill: st.fill, font: st.font, input: isInputStyle(st) });
        }
        return out;
    }
    function verificationsFrom(sheet) {
        const out = [];
        for (const k of Object.keys(sheet || {})) {
            const c = sheet[k], t = txt(c).trim();
            if (!t) continue;
            if (/^(verifica|no verifica|aumentar|disminuir|revisar|baja|ok)/i.test(t)) {
                out.push({ cell: k.replace(/\$/g, ""), text: t, label: txt(get(sheet, "A" + addr(k).r)).trim() || txt(get(sheet, "B" + addr(k).r)).trim() });
            }
        }
        return out;
    }

    /* ---------------- Río ---------------- */
    function extractRio(sheet) {
        if (!sheet) return null;
        const inputDefs = MAP.RIO_INPUTS.map((d) => locate(sheet, d));
        const inputs = {};
        inputDefs.forEach((d) => { inputs[d.key] = typeof d.value === "number" ? d.value : Number(d.value); });
        const results = {};
        MAP.RIO_RESULTS.forEach((d) => {
            const l = locate(sheet, d);
            results[d.key] = { value: l.value, cell: l.cell, expectedCell: l.expectedCell, unit: d.unit, source: l.source };
        });
        const alts = altValues(sheet, MAP.RIO_ALTS);
        const etaB = ["H", "I", "J"].map((c) => v(get(sheet, c + 65)));
        const etaM = ["H", "I", "J"].map((c) => v(get(sheet, c + 66)));
        const padop = v(get(sheet, "C69"));
        const pozo = {
            cavitacion: ["B", "C", "D"].map((c) => v(get(sheet, c + 73))),
            seguridad: v(get(sheet, "B74")),
            adoptado: v(get(sheet, "B75")),
        };
        const eco = {
            kwh: v(get(sheet, "B86")), rate: v(get(sheet, "B87")), maint: v(get(sheet, "B88")),
            vidaT: v(get(sheet, "B89")), vidaB: v(get(sheet, "B90")),
            frcT: v(get(sheet, "B91")), frcB: v(get(sheet, "B92")),
        };
        const pipePrices = {}, pumpPrices = {};
        for (let r = 86; r <= 108; r++) {
            const dn = v(get(sheet, "H" + r)), pc = v(get(sheet, "I" + r));
            if (dn != null && pc != null) pipePrices[Number(dn)] = Number(pc);
            const hp = v(get(sheet, "K" + r)), pv = v(get(sheet, "L" + r));
            if (hp != null && pv != null) pumpPrices[Number(hp)] = Number(pv);
        }
        const costRows = {};
        for (let r = 85; r <= 110; r++) {
            const lab = txt(get(sheet, "A" + r)).trim();
            if (!lab) continue;
            const vals = ["B", "C", "D"].map((c) => v(get(sheet, c + r)));
            if (vals.some((x) => x != null)) costRows[lab] = { row: r, values: vals };
        }
        const verif = [];
        for (const c of ["B", "C", "D"]) {
            const cell = get(sheet, c + 102);
            if (txt(cell)) verif.push({ alt: c === "B" ? 1 : c === "C" ? 2 : 3, text: txt(cell) });
        }
        const tabla8 = [];
        for (let c = colNum("N"); c <= colNum("AG"); c++) {
            const x = v(get(sheet, colName(c) + 71));
            if (typeof x === "number") tabla8.push(x);
        }
        return { sheet: true, inputs, inputDefs, results, alts, etaB, etaM, padop, pozo, eco, pipePrices, pumpPrices, costRows, verif, tabla8, verifications: verificationsFrom(sheet) };
    }

    /* ---------------- Tanque ---------------- */
    function extractTanque(sheet) {
        if (!sheet) return null;
        const inputDefs = MAP.TANQUE_INPUTS.map((d) => locate(sheet, d));
        const inputs = {};
        inputDefs.forEach((d) => { inputs[d.key] = typeof d.value === "number" ? d.value : Number(d.value); });
        const alts = altValues(sheet, MAP.TANQUE_ALTS);
        const etaB = ["H", "I", "J"].map((c) => v(get(sheet, c + 49)));
        const etaM = ["H", "I", "J"].map((c) => v(get(sheet, c + 50)));
        const padop = v(get(sheet, "C53"));
        const pozo = {
            cavitacion: ["B", "C", "D"].map((c) => v(get(sheet, c + 57))),
            seguridad: v(get(sheet, "B58")), adoptado: v(get(sheet, "B59")),
        };
        const costRows = {};
        for (let r = 60; r <= 100; r++) {
            const lab = txt(get(sheet, "A" + r)).trim();
            if (!lab) continue;
            const vals = ["B", "C", "D"].map((c) => v(get(sheet, c + r)));
            if (vals.some((x) => x != null)) costRows[lab] = { row: r, values: vals };
        }
        return { sheet: true, inputs, inputDefs, results: {}, alts, etaB, etaM, padop, pozo, costRows, verifications: verificationsFrom(sheet) };
    }

    /* ---------------- Red pública ---------------- */
    function findHeader(sheet, words, range) {
        const r1 = range ? range[0] : 1, r2 = range ? range[1] : sheetMax(sheet).row;
        for (let r = r1; r <= r2; r++) {
            let ok = true;
            for (const w of words) {
                const n = norm(w);
                let found = false;
                for (let c = 1; c <= 16; c++) {
                    if (norm(txt(get(sheet, colName(c) + r))).includes(n)) { found = true; break; }
                }
                if (!found) { ok = false; break; }
            }
            if (ok) return r;
        }
        return null;
    }
    function splitTramoId(id) {
        const s = String(id || "").trim();
        let m = /^([A-Za-z0-9]+)\s*[-–]\s*([A-Za-z0-9]+)$/.exec(s);
        if (m) return { a: m[1], b: m[2] };
        m = /^([A-Za-z])([A-Za-z])$/.exec(s);
        if (m) return { a: m[1], b: m[2] };
        return { a: "", b: "" };
    }
    function readTramosDatosInic(sheet) {
        // Formato completo: Tramo | Nodo a | Nodo b | ...
        let hr = findHeader(sheet, ["tramo", "nodo a", "nodo b"]);
        if (hr) {
            const rows = [];
            for (let r = hr + 1; r <= hr + 90; r++) {
                const id = txt(get(sheet, "A" + r)).trim();
                const a = txt(get(sheet, "B" + r)).trim(), b = txt(get(sheet, "C" + r)).trim();
                if (!id && !a && !b) break;
                if (/total|verific/i.test(id) && !a) break;
                if (!b) break;
                rows.push({
                    row: r, id, a, b, L: v(get(sheet, "D" + r)), lotes: v(get(sheet, "E" + r)),
                    Qa: v(get(sheet, "F" + r)), Q0: v(get(sheet, "G" + r)), Qf: v(get(sheet, "H" + r)),
                    Drec: v(get(sheet, "I" + r)), Dcom: v(get(sheet, "J" + r)), D: v(get(sheet, "K" + r)),
                    Dm: v(get(sheet, "L" + r)), vel: v(get(sheet, "M" + r)), vcheck: txt(get(sheet, "N" + r)),
                });
            }
            return { header: hr, rows, layout: "nodos" };
        }
        // Formato guía original: Anillo | Tramo | Long | Lotes | Qa | Qc | Qt | Qcorr | Drec | Dcom | Dadop | Dm | V | Verif
        hr = findHeader(sheet, ["tramo", "long", "diam"]);
        if (!hr) return { header: null, rows: [], layout: null };
        const rows = [], seen = new Set();
        for (let r = hr + 1; r <= hr + 90; r++) {
            const id = txt(get(sheet, "B" + r)).trim();
            if (!id) break;
            if (/total|verific|caudal|diferen/i.test(id)) break;
            if (seen.has(id)) continue;
            seen.add(id);
            const ab = splitTramoId(id);
            rows.push({
                row: r, id, a: ab.a, b: ab.b, L: v(get(sheet, "C" + r)), lotes: v(get(sheet, "D" + r)),
                Qa: v(get(sheet, "E" + r)), Q0: v(get(sheet, "G" + r)), Qf: v(get(sheet, "H" + r)),
                Drec: v(get(sheet, "I" + r)), Dcom: v(get(sheet, "J" + r)), D: v(get(sheet, "K" + r)),
                Dm: v(get(sheet, "L" + r)), vel: v(get(sheet, "M" + r)), vcheck: txt(get(sheet, "N" + r)),
            });
        }
        return { header: hr, rows, layout: "clasico" };
    }
    function readNodosDatosInic(sheet) {
        const hr = findHeader(sheet, ["nodo", "cota terreno"]);
        if (!hr) return { header: null, rows: [] };
        const rows = [];
        for (let r = hr + 1; r <= hr + 80; r++) {
            const id = txt(get(sheet, "A" + r)).trim();
            if (!id) break;
            if (/desvio|continuidad|total/i.test(id)) break;
            rows.push({ row: r, id, ct: v(get(sheet, "B" + r)), q: v(get(sheet, "C" + r)), cont: v(get(sheet, "D" + r)) });
        }
        return { header: hr, rows };
    }
    function readPresiones(sheet) {
        if (!sheet) return null;
        let hrT = findHeader(sheet, ["tramo", "nodo a", "nodo b"]);
        const modern = !!hrT;
        const tramos = [];
        if (hrT) {
            for (let r = hrT + 1; r <= hrT + 90; r++) {
                const id = txt(get(sheet, "A" + r)).trim();
                if (!id || /nodo|altura|presion|cierre/i.test(id)) break;
                tramos.push({ row: r, id, a: txt(get(sheet, "B" + r)).trim(), b: txt(get(sheet, "C" + r)).trim(), D: v(get(sheet, "D" + r)), L: v(get(sheet, "E" + r)), Q: v(get(sheet, "F" + r)), J: v(get(sheet, "G" + r)), h: v(get(sheet, "H" + r)), cierre: v(get(sheet, "I" + r)) });
            }
        } else {
            hrT = findHeader(sheet, ["tramo", "diametro", "longitud"]);
            if (hrT) {
                for (let r = hrT + 1; r <= hrT + 90; r++) {
                    const id = txt(get(sheet, "B" + r)).trim();
                    if (!id) break;
                    if (/suma|corregir|maximo|minimo|perdida|verific/i.test(id)) break;
                    const ab = splitTramoId(id);
                    tramos.push({ row: r, id, a: ab.a, b: ab.b, D: v(get(sheet, "C" + r)), L: v(get(sheet, "D" + r)), Q: v(get(sheet, "E" + r)), J: v(get(sheet, "F" + r)), h: v(get(sheet, "G" + r)), cierre: null });
                }
            }
        }
        let hrN = findHeader(sheet, ["nodo", "cota terreno"]);
        let nodos = [];
        if (hrN) {
            for (let r = hrN + 1; r <= hrN + 80; r++) {
                const id = txt(get(sheet, "A" + r)).trim();
                if (!id || /altura|presion|cierre|total/i.test(id)) break;
                nodos.push({ row: r, id, desde: txt(get(sheet, "B" + r)).trim(), ct: v(get(sheet, "C" + r)), cp0: v(get(sheet, "D" + r)), hbase: v(get(sheet, "E" + r)), cp: v(get(sheet, "F" + r)), p: v(get(sheet, "G" + r)), check: txt(get(sheet, "H" + r)) });
            }
        }
        if (!modern) {
            // Formato clásico: una fila por nodo (B = nodo, I = cota terreno, J = presión).
            const seen = new Set();
            for (let r = 4; r <= 80; r++) {
                const id = txt(get(sheet, "B" + r)).trim();
                const ct = v(get(sheet, "I" + r)), p = v(get(sheet, "J" + r)), cp = v(get(sheet, "H" + r));
                if (!id || ct == null || p == null) continue;
                if (!/^[A-Za-z0-9]{1,8}$/.test(id)) continue;
                if (/tramo|circuito|nodo|total|suma|maximo|minimo|perdida/i.test(id)) continue;
                if (seen.has(id)) continue;
                seen.add(id);
                nodos.push({ row: r, id, desde: "", ct, cp0: null, hbase: null, cp, p, check: "" });
            }
        }
        const byLabel = (labels, cell) => locate(sheet, { label: labels, cell });
        let hbMin = byLabel("altura minima de la base", "D58");
        let hbAd = byLabel("altura de la base adoptada", "D59");
        let ctTanque = byLabel("cota del terreno en el tanque", "D60");
        let ctBase = byLabel("cota de la base del tanque", "D61");
        let pMin = byLabel("presion minima", "D64");
        const pMax = byLabel("presion maxima dinamica", "D65");
        const pEst = byLabel("presion estatica maxima", "D66");
        let cierre = byLabel("cierre de cotas piezometricas", "D67");
        if (!modern) {
            if (pMin.value == null) pMin = byLabel("minimo", "J22");
            if (pMin.value == null) pMin.value = nodos.length ? Math.min(...nodos.map((n) => Number(n.p)).filter(isFinite)) : null;
            if (hbAd.value == null) hbAd = byLabel("altura de la base del tanque", "J8");
            if (ctBase.value == null) ctBase = byLabel("ubicacion del tanque", "D27");
            if (hbMin.value == null) hbMin.value = hbAd.value;
            if (ctTanque.value == null) ctTanque.value = ctBase.value;
            if (cierre.value == null) {
                const ks = Object.keys(sheet).filter((k) => /^K\d+$/.test(k));
                const vals = ks.map((k) => Math.abs(Number(v(sheet[k])))).filter(isFinite);
                if (vals.length) cierre = { value: Math.max(...vals) };
            }
        }
        return { headerTramos: hrT, tramos, headerNodos: hrN, nodos, hbMin, hbAd, ctTanque, ctBase, pMin, pMax, pEst, cierre, layout: modern ? "nodos" : "clasico" };
    }
    function readCaudales(sheet) {
        if (!sheet) return null;
        let iter = locate(sheet, { label: "iteraciones", cell: "C5" });
        const tol = locate(sheet, { label: "tolerancia", cell: "C3" });
        const chw = locate(sheet, { label: "coeficiente c", cell: "C4" });
        const loops = [];
        for (let c = colNum("E"); c <= colNum("M"); c++) {
            const path = txt(get(sheet, colName(c) + 5)).trim();
            if (/^[A-Za-z0-9]+([-–][A-Za-z0-9]+){2,}$/.test(path)) loops.push(path.replace(/[–]/g, "-"));
        }
        let hr = findHeader(sheet, ["iteracion", "q l1"]);
        const its = [];
        if (hr) {
            for (let r = hr + 1; r <= hr + 80; r++) {
                const it = v(get(sheet, "Q" + r));
                if (it == null) break;
                const dq = [];
                for (let c = colNum("R"); c <= colNum("AA"); c++) {
                    const x = v(get(sheet, colName(c) + r));
                    if (x != null) dq.push(Number(x));
                }
                its.push({ it: Number(it), dq, max: Number(v(get(sheet, "AB" + r))), conv: Number(v(get(sheet, "AC" + r))) });
            }
        }
        if (!hr && iter.value == null) {
            // Formato clásico: bloques "Nda iteración" con SUMA de Hi y Hi/Qi.
            const blocks = [];
            for (let r = 1; r <= sheetMax(sheet).row; r++) {
                if (/^\s*\d+\s*(ra|da|era|ta|ma)?\s*iteraci[oó]n/i.test(txt(get(sheet, "A" + r)))) blocks.push(r);
            }
            if (blocks.length) {
                iter = { value: blocks.length, cell: "A" + blocks[blocks.length - 1], source: "bloques de iteración" };
                blocks.forEach((r, i) => {
                    let sum = null, sumq = null;
                    for (let k = r; k <= r + 12; k++) {
                        const a = v(get(sheet, "I" + k)), b = v(get(sheet, "J" + k));
                        if (a != null && b != null) { sum = a; sumq = b; }
                    }
                    const dq = sum != null && sumq ? Math.abs(-sum / (1.851 * sumq)) : null;
                    its.push({ it: i + 1, dq: dq == null ? [] : [dq], max: dq, conv: null });
                });
            }
        }
        return { iter, tol, chw, loops, its, header: hr };
    }
    function extractRed(roles, wb) {
        const sDI = wb && wb.Sheets ? wb.Sheets[roles.datosInic] : null;
        const sCa = wb && wb.Sheets ? wb.Sheets[roles.caudales] : null;
        const sPr = wb && wb.Sheets ? wb.Sheets[roles.presiones] : null;
        const datosInic = sDI ? {
            sheet: roles.datosInic,
            edificios: locatedVal(sDI, "cantidad de edificios", "C3"),
            qMed: locatedVal(sDI, "caudal medio diario", "C5"),
            Qmd: locatedVal(sDI, "caudal maximo diario", "C6"),
            Qmh: locatedVal(sDI, "caudal maximo horario", "C7"),
            k1: locatedVal(sDI, "k1", "L5"),
            k2: locatedVal(sDI, "k2", "L6"),
            vEc: locatedVal(sDI, "velocidad economica", "C10"),
            Dmin: locatedVal(sDI, "diametro minimo", "C11"),
            Chw: locatedVal(sDI, "coeficiente de hazen", "C12"),
            vMin: locatedVal(sDI, "velocidad minima", "C13"),
            tramos: readTramosDatosInic(sDI),
            nodos: readNodosDatosInic(sDI),
            totals: readTotals(sDI),
            Htanque: v(get(sDI, "J6")) != null ? v(get(sDI, "J6")) : locatedVal(sDI, "altura del tanque", "J6"),
            Hbase: v(get(sDI, "J8")) != null ? v(get(sDI, "J8")) : locatedVal(sDI, "altura de la base del tanque", "J8"),
            tankD: v(get(sDI, "G4")),
            tankVmh: v(get(sDI, "E7")),
            tankHu: v(get(sDI, "G7")),
            verifications: verificationsFrom(sDI),
        } : null;
        const caudales = readCaudales(sCa);
        const presiones = readPresiones(sPr);
        if (presiones && presiones.layout === "clasico" && datosInic) {
            if (datosInic.Hbase != null) {
                presiones.hbAd = { value: datosInic.Hbase, cell: "Datos Inic!J8", source: "Datos Inic" };
                if (presiones.hbMin.value == null || Math.abs(presiones.hbMin.value - presiones.hbAd.value) < 1e-9) presiones.hbMin = { value: datosInic.Hbase, cell: "Datos Inic!J8" };
            }
            const cts = (presiones.nodos || []).map((n) => Number(n.ct)).filter(isFinite);
            const ctT = cts.length ? Math.max(...cts) : null;
            if (ctT != null) {
                presiones.ctTanque = { value: ctT };
                if (presiones.ctBase.value == null || presiones.ctBase.value === presiones.ctTanque.value) presiones.ctBase = { value: ctT + (datosInic.Hbase || 0) };
            }
        }
        return { datosInic, caudales, presiones, verifications: [...(datosInic ? datosInic.verifications : []), ...(sPr ? verificationsFrom(sPr) : [])] };
    }
    function locatedVal(sheet, label, cell) {
        const l = locate(sheet, { label, cell });
        return l.value != null ? l.value : null;
    }
    function readTotals(sheet) {
        const out = {};
        for (let r = 1; r <= sheetMax(sheet).row; r++) {
            const lab = norm(txt(get(sheet, "D" + r)));
            if (lab.includes("total")) {
                out.lotes = v(get(sheet, "E" + r)); out.Qa = v(get(sheet, "F" + r)); out.row = r;
            }
            if (lab.includes("verificacion")) {
                out.verifLotes = txt(get(sheet, "E" + r)); out.verifQa = txt(get(sheet, "F" + r)); out.rowVerif = r;
            }
        }
        return out;
    }

    /* ---------------- Potabilizadora ---------------- */
    function extractPotab(sheet) {
        if (!sheet) return null;
        const entries = entriesOf(sheet, 1, sheetMax(sheet).row);
        const groups = MAP.POTAB_GROUPS.map((g) => ({ id: g.id, title: g.title, entries: [] }));
        const used = new Set();
        for (const e of entries) {
            if (!e.label) continue;
            const n = norm(e.label);
            let g = null;
            for (const gr of MAP.POTAB_GROUPS) if ((gr.words || []).some((w) => n.includes(norm(w)))) { g = gr; break; }
            if (!g) g = MAP.POTAB_GROUPS[0];
            const gg = groups.find((x) => x.id === g.id);
            if (gg) { gg.entries.push(e); used.add(e.row); }
        }
        const sp = {};
        for (const d of MAP.POTAB_SP) {
            const l = locate(sheet, { label: d.label, cell: d.cell });
            if (l.value != null) sp[d.key] = d.cell_scale ? Number(l.value) * d.cell_scale : Number(l.value);
        }
        return { sheet: true, entries, groups, sp, verifications: verificationsFrom(sheet) };
    }

    /* ---------------- Hojas simples (cloacal, tratamiento, laguna) ---------------- */
    function extractSimple(sheet) {
        if (!sheet) return null;
        const entries = entriesOf(sheet, 1, Math.min(sheetMax(sheet).row, 260));
        const tables = [];
        // Tabla de tramos de la red cloacal: encabezado con "Tramo" y "Long".
        const hr = findHeader(sheet, ["tramo", "long"]);
        if (hr) {
            const rows = [];
            for (let r = hr + 1; r <= hr + 120; r++) {
                const id = txt(get(sheet, "A" + r)).trim();
                if (!id) break;
                const vals = [];
                for (let c = 1; c <= 25; c++) vals.push(v(get(sheet, colName(c) + r)));
                if (vals.slice(1).every((x) => x == null || x === "")) continue;
                rows.push({ id, row: r, vals });
            }
            if (rows.length) tables.push({ title: "Tramos / unidades", header: ["Tramo", "N°", "L (m)", "Long. acum.", "Caudal", "Caudal total", "Q diseño", "J", "i (%)", "D (m)", "Cota sup.", "Cota inf.", "Cota terr. sup.", "Cota terr. inf.", "Prof. exc.", "Verificación", "Prof. sal.", "D interno", "Área", "Q cap.", "V", "Q final", "S", "Rh", "Verificación"], rows });
        }
        return { sheet: true, entries, tables, verifications: verificationsFrom(sheet) };
    }

    /* ---------------- Fuente de datos ---------------- */
    function extractFuente(sheet) {
        if (!sheet) return null;
        const rows = [];
        for (let r = 1; r <= sheetMax(sheet).row; r++) {
            const vals = ["A", "B", "C", "D", "E", "F"].map((c) => v(get(sheet, c + r)));
            if (vals.some((x) => x != null && String(x).trim() !== "")) rows.push({ row: r, vals });
        }
        return { sheet: true, rows };
    }

    /* ---------------- Extracción completa ---------------- */
    function extractWorkbook(wb, fileName) {
        if (!wb) throw new Error("El libro está vacío.");
        const names = wb.SheetNames || Object.keys(wb.Sheets || {});
        const { roles, unmatched } = detectRoles(names);
        const data = {
            file: fileName || "archivo.xlsx", sheetNames: names, roles, unmatched,
            hasCachedValues: true, formulaOnly: [], grouped: false, groupedSheets: [],
            observations: [], warnings: [], allCells: {},
            rio: null, potab: null, tanque: null, red: null, cloacal: null, tratamiento: null, laguna: null, fuente: null,
        };
        if (wb.Workbook && wb.Workbook.Sheets) {
            const selected = wb.Workbook.Sheets.filter((s) => s && (s.tabSelected || s.TabSelected)).length;
            if (selected > 1) { data.grouped = true; data.groupedSheets = wb.Workbook.Sheets.filter((s) => s && (s.tabSelected || s.TabSelected)).map((s) => s.name); }
        }
        for (const name of names) {
            const sh = wb.Sheets[name];
            if (!sh) continue;
            const cells = [];
            for (const k of Object.keys(sh)) {
                if (!/^\$?[A-Za-z]+\$?\d+$/.test(k)) continue;
                const c = sh[k], st = style(c);
                if (c && (c.v != null || c.f != null || (c.w != null && String(c.w).trim() !== ""))) {
                    cells.push({ cell: k.replace(/\$/g, "").toUpperCase(), v: c.v != null ? c.v : null, w: c.w != null ? c.w : null, f: formula(c), fill: st.fill, font: st.font, input: isInputStyle(st) });
                }
                // Las fórmulas IF/IFERROR pueden devolver "" legítimamente (por ejemplo,
                // "costo anual si verifica" cuando la alternativa no verifica). No se
                // cuentan como falta de recálculo del archivo.
                if (hasFormulaNoValue(c) && !/^[=+]?\s*(IF|IFERROR)\s*\(/i.test(String(c.f || ""))) data.formulaOnly.push({ sheet: name, cell: k.replace(/\$/g, "").toUpperCase() });
            }
            cells.sort((a, b) => { const A = addr(a.cell), B = addr(b.cell); return A.r - B.r || A.cn - B.cn; });
            data.allCells[name] = cells;
        }
        data.hasCachedValues = data.formulaOnly.length === 0;
        if (!data.hasCachedValues) data.warnings.push(`El archivo no tiene resultados calculados (${data.formulaOnly.length} celdas con fórmula y sin valor en caché). Abrilo y guardalo en Excel; mientras tanto el informe usa el recálculo de la web cuando está disponible.`);
        if (data.grouped) data.warnings.push("El libro tiene varias hojas agrupadas (tabSelected). Con hojas agrupadas, escribir en una celda la sobrescribe en todas las hojas del grupo.");
        if (roles.rio) data.rio = extractRio(wb.Sheets[roles.rio]);
        if (roles.tanque) data.tanque = extractTanque(wb.Sheets[roles.tanque]);
        if (roles.potab) data.potab = extractPotab(wb.Sheets[roles.potab]);
        if (roles.datosInic || roles.caudales || roles.presiones) data.red = extractRed(roles, wb);
        if (roles.cloacal) data.cloacal = extractSimple(wb.Sheets[roles.cloacal]);
        if (roles.tratamiento) data.tratamiento = extractSimple(wb.Sheets[roles.tratamiento]);
        if (roles.laguna) data.laguna = extractSimple(wb.Sheets[roles.laguna]);
        if (roles.fuente) data.fuente = extractFuente(wb.Sheets[roles.fuente]);
        data.variant = {
            tramos: data.red && data.red.datosInic ? data.red.datosInic.tramos.rows.length : 0,
            anillos: data.red && data.red.datosInic ? Math.max(0, data.red.datosInic.tramos.rows.length - (data.red.presiones ? data.red.presiones.nodos.length : 0) + 1) : (data.red && data.red.caudales ? data.red.caudales.loops.length : 0),
            tieneFuente: !!roles.fuente,
            tieneMinimoCosto: !!(data.rio && Object.keys(data.rio.costRows || {}).length),
            tieneTabla8: !!(data.rio && data.rio.tabla8.length),
        };
        // Observaciones de rótulo vs. celda
        const checkDefs = [].concat(MAP.RIO_INPUTS, MAP.RIO_RESULTS, MAP.TANQUE_INPUTS);
        const addObs = (defs, label) => {
            for (const d of defs) {
                if (!d.label) continue;
                const l = locate(wb.Sheets[roles[label]], d);
                if (l.source === "no encontrado") data.observations.push({ level: "warn", text: `No se encontró “${d.label}” (${label}); se esperaba en ${d.cell}. No se inventó ningún valor.` });
                else if (l.row !== addr(d.cell).r && l.value != null) data.observations.push({ level: "info", text: `“${d.label}” se encontró en ${l.cell} y no en ${d.cell}; se usó el valor de la fila con el rótulo.` });
            }
        };
        if (roles.rio) addObs(MAP.RIO_INPUTS.concat(MAP.RIO_RESULTS), "rio");
        if (roles.tanque) addObs(MAP.TANQUE_INPUTS, "tanque");
        // Comparación contra la guía original
        data.changes = [];
        if (data.rio) {
            const g = MAP.GUIDE_DEFAULTS.rio;
            for (const d of MAP.RIO_INPUTS) {
                const val = data.rio.inputs[d.key], ref = g[d.key];
                if (ref != null && val != null && Math.abs(val - ref) > 1e-9) data.changes.push({ sheet: "Impulsión río", key: d.key, label: d.label, guide: ref, value: val, cell: data.rio.inputDefs.find((x) => x.key === d.key).cell });
            }
            const altNames = { dS: "Diámetro de succión", dI: "Diámetro de impulsión", LS: "Longitud de succión", LI: "Longitud de impulsión", hS: "Altura topográfica de succión", hI: "Altura topográfica de impulsión" };
            (data.rio.alts ? Object.keys(altNames) : []).forEach((k) => {
                const a = data.rio.alts[k], ref = g[k];
                if (a && ref) a.forEach((x, i) => {
                    if (x == null || ref[i] == null || Math.abs(x - ref[i]) <= 1e-9) return;
                    const base = data.rio.alts.__rows[k].cell, aa = addr(base);
                    data.changes.push({ sheet: "Impulsión río", key: k + (i + 1), label: `${altNames[k]} — Alt ${i + 1}`, guide: ref[i], value: x, cell: colName(aa.cn + i) + aa.r });
                });
            });
        }
        return data;
    }

    /* ---------------- Formato ---------------- */
    function fmt(n, d) {
        if (n == null || n === "" || !isFinite(n)) return "—";
        return Number(n).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: d == null ? 2 : d });
    }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    function num(x) { if (x == null || x === "" || typeof x === "string") return null; const n = Number(x); return isFinite(n) ? n : null; }
    function badge(state, text) {
        const cls = state === "ok" ? "ok" : state === "fail" ? "fail" : "warn";
        return `<span class="badge-state ${cls}">${state === "ok" ? "✔" : state === "fail" ? "✖" : "⚠"} ${esc(text)}</span>`;
    }

    const IE = {
        norm, addr, get, v, txt, formula, style, isInputStyle, labelRows, locate, extractWorkbook,
        extractRio, extractTanque, extractRed, extractPotab, extractSimple, extractFuente,
        fmt, esc, badge,
    };
    root.IE = IE;
    if (typeof module !== "undefined" && module.exports) module.exports = IE;
})(typeof window !== "undefined" ? window : globalThis);
