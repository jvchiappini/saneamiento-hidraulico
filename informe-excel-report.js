"use strict";
/* =====================================================================
   informe-excel-report.js — Genera el informe técnico en HTML a partir
   de los datos extraídos y del recálculo independiente.
   ===================================================================== */
(function (root) {
    const IE = root.IE;
    const fmt = IE ? IE.fmt : (n, d) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("es-AR", { maximumFractionDigits: d == null ? 2 : d }));
    const esc = IE ? IE.esc : (s) => String(s == null ? "" : s);
    const badge = (st, txt) => `<span class="badge-state ${st === "ok" ? "ok" : st === "fail" ? "fail" : "warn"}">${st === "ok" ? "✔" : st === "fail" ? "✖" : "⚠"} ${esc(txt)}</span>`;

    let tableNo = 0;
    function tbl(head, rows, opts) {
        const cls = "report-table" + (opts && opts.cls ? " " + opts.cls : "");
        let cap = "";
        if (opts && opts.caption) { tableNo++; cap = `<caption>Tabla ${tableNo}. ${esc(opts.caption)}</caption>`; }
        const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c == null ? "" : c}</td>`).join("")}</tr>`).join("");
        return `<div class="tbl-wrap"><table class="${cls}">${cap}<thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
    }
    function formula(tex) { return `<div class="formula-block">\\[${tex}\\]</div>`; }
    function sectionEmpty(txt) { return `<p class="empty-note">${esc(txt)}</p>`; }
    function val(x, d) { return x == null || x === "" ? "—" : (typeof x === "number" ? fmt(x, d) : esc(x)); }
    function pct(x, d) { return x == null ? "—" : fmt(x, d == null ? 2 : d) + " %"; }
    function stDiff(diff, present) {
        if (!present) return "fail";
        if (diff == null) return "warn";
        return diff <= 0.5 ? "ok" : "warn";
    }
    function cmpRow(scope, label, excel, recalc, unit, tol, note) {
        const present = excel != null || recalc != null;
        const diff = (excel != null && recalc != null && typeof excel === "number" && typeof recalc === "number") ? Math.abs(recalc - excel) / (Math.abs(excel) > 1e-12 ? Math.abs(excel) : 1) * 100 : null;
        const st = diff == null ? (excel != null && recalc != null ? "ok" : stDiff(null, present)) : (diff <= (tol || 0.5) ? "ok" : "warn");
        return { scope, label, excel, recalc, unit, diff, st, note };
    }
    function cmpTable(rows, caption) {
        return tbl(["Concepto", "Excel", "Recálculo web", "Dif. %", "Estado"], rows.map((r) => [
            esc(r.scope ? r.scope + " · " + r.label : r.label), val(r.excel, 4), val(r.recalc, 4), r.diff == null ? "—" : fmt(r.diff, 2),
            badge(r.st, r.st === "ok" ? "coincide" : r.st === "fail" ? "falta" : "difiere") + (r.note ? `<br><small>${esc(r.note)}</small>` : ""),
        ]), { cls: "wide", caption: caption || "Comparación Excel vs. recálculo" });
    }

    function getAltLabel(data, sheet, idx) {
        const a = data[sheet] && data[sheet].alts;
        if (!a) return "Alt " + (idx + 1);
        return `${["Alt 1", "Alt 2", "Alt 3"][idx]} (${a.dS ? a.dS[idx] : "?"}/${a.dI ? a.dI[idx] : "?"} mm)`;
    }
    function costTotal(data, sheet, idx) {
        const rows = data[sheet] && data[sheet].costRows;
        if (!rows) return null;
        for (const k of Object.keys(rows)) if (/costo anual total/i.test(k)) return rows[k].values[idx];
        return null;
    }
    function costVerif(data, sheet, idx) {
        const rows = data[sheet] && data[sheet].costRows;
        if (!rows) return null;
        for (const k of Object.keys(rows)) if (/^verifica/i.test(k)) return rows[k].values[idx];
        return null;
    }

    function comparisons(data, rec) {
        const out = [];
        const R = rec && rec.rio, T = rec && rec.tanque, RED = rec && rec.red;
        if (data.rio) {
            const res = data.rio.results;
            out.push(cmpRow("Río", "Población de departamentos", num(res.poblacion && res.poblacion.value), R ? num(R.qm_ld ? null : null) : null, "pers"));
            // población recalculada no está en R; se usa la fórmula directa
            const pop = res.poblacion && num(res.poblacion.value);
            if (R) {
                const popCalc = (data.rio.inputs.manzanas * data.rio.inputs.lotes * (data.rio.inputs.pisos * data.rio.inputs.deptos * (data.rio.inputs.dorm * data.rio.inputs.persDorm + data.rio.inputs.persServ)));
                out[out.length - 1].recalc = popCalc;
                out[out.length - 1].diff = pop ? Math.abs(popCalc - pop) / Math.abs(pop) * 100 : null;
                out[out.length - 1].st = out[out.length - 1].diff != null && out[out.length - 1].diff <= 0.5 ? "ok" : "warn";
            }
            out.push(cmpRow("Río", "Caudal medio Qm", num(res.qm_ls && res.qm_ls.value), R && R.qm_ls, "l/s"));
            out.push(cmpRow("Río", "Caudal de bombeo Qb", num(res.qb_ls && res.qb_ls.value), R && R.qb_ls, "l/s"));
            out.push(cmpRow("Río", "Diámetro de Bresse", num(res.bresse && res.bresse.value), R && R.bresse, "m", 0.5));
            if (R) {
                R.alts.forEach((a, i) => {
                    const ex = alts(data, "rio", i);
                    const lab = getAltLabel(data, "rio", i);
                    out.push(cmpRow("Río " + lab, "Velocidad succión", ex.vS, a.vS, "m/s"));
                    out.push(cmpRow("Río " + lab, "Velocidad impulsión", ex.vI, a.vI, "m/s"));
                    out.push(cmpRow("Río " + lab, "J succión", ex.JS, a.JS, "m/m"));
                    out.push(cmpRow("Río " + lab, "J impulsión", ex.JI, a.JI, "m/m"));
                    out.push(cmpRow("Río " + lab, "Longitud equivalente succión", ex.leqS, a.leqS, "m"));
                    out.push(cmpRow("Río " + lab, "Longitud equivalente impulsión", ex.leqI, a.leqI, "m"));
                    out.push(cmpRow("Río " + lab, "Altura manométrica Hm", ex.Hm, a.Hm, "m.c.a."));
                    out.push(cmpRow("Río " + lab, "Potencia de bomba Pb", ex.Pb, a.Pb, "CV"));
                    out.push(cmpRow("Río " + lab, "Potencia con motor Pmb", ex.Pmb, a.Pmb, "HP", 0.5, "El recálculo corrige CV→HP dividiendo por 1,014."));
                    out.push(cmpRow("Río " + lab, "Holgura", ex.holgura, a.holgura * 100, "%"));
                    out.push(cmpRow("Río " + lab, "Potencia adoptada", ex.Padop != null ? ex.Padop : (i === 1 ? data.rio.padop : null), a.Padop, "HP"));
                    out.push(cmpRow("Río " + lab, "Costo anual", costTotal(data, "rio", i), a.annual, "US$/año"));
                });
            }
        }
        if (data.tanque) {
            const res = data.tanque.inputs;
            out.push(cmpRow("Tanque", "Caudal de bombeo Qb", num(res.qb_ls), T && T.qb_ls, "l/s"));
            out.push(cmpRow("Tanque", "Diámetro de Bresse", num(res.bresse), T && T.bresse, "m"));
            if (T) {
                T.alts.forEach((a, i) => {
                    const ex = alts(data, "tanque", i);
                    const lab = getAltLabel(data, "tanque", i);
                    out.push(cmpRow("Tanque " + lab, "Velocidad succión", ex.vS, a.vS, "m/s"));
                    out.push(cmpRow("Tanque " + lab, "Velocidad impulsión", ex.vI, a.vI, "m/s"));
                    out.push(cmpRow("Tanque " + lab, "J succión", ex.JS, a.JS, "m/m"));
                    out.push(cmpRow("Tanque " + lab, "J impulsión", ex.JI, a.JI, "m/m"));
                    out.push(cmpRow("Tanque " + lab, "Longitud equivalente succión", ex.leqS, a.leqS, "m"));
                    out.push(cmpRow("Tanque " + lab, "Longitud equivalente impulsión", ex.leqI, a.leqI, "m"));
                    out.push(cmpRow("Tanque " + lab, "Altura manométrica Hm", ex.Hm, a.Hm, "m.c.a."));
                    out.push(cmpRow("Tanque " + lab, "Potencia de bomba Pb", ex.Pb, a.Pb, "CV"));
                    out.push(cmpRow("Tanque " + lab, "Potencia con motor Pmb", ex.Pmb, a.Pmb, "HP"));
                    out.push(cmpRow("Tanque " + lab, "Potencia adoptada", ex.Padop != null ? ex.Padop : (i === 0 ? data.tanque.padop : null), a.Padop, "HP"));
                    out.push(cmpRow("Tanque " + lab, "Costo anual", costTotal(data, "tanque", i), a.annual, "US$/año"));
                });
            }
        }
        if (data.red && data.red.caudales && RED && RED.result) {
            const Rr = RED.result;
            out.push(cmpRow("Red", "Iteraciones de Hardy Cross", num(data.red.caudales.iter && data.red.caudales.iter.value), Rr.hc ? Rr.hc.its.length : null, "iter."));
            if (data.red.presiones) {
                out.push(cmpRow("Red", "Hbase mínima", num(data.red.presiones.hbMin && data.red.presiones.hbMin.value), Rr.HbaseMin, "m"));
                out.push(cmpRow("Red", "Hbase adoptada", num(data.red.presiones.hbAd && data.red.presiones.hbAd.value), Rr.Hbase, "m"));
                out.push(cmpRow("Red", "Presión mínima", num(data.red.presiones.pMin && data.red.presiones.pMin.value), Rr.pres && Rr.pres.length ? Math.min(...Rr.pres) : null, "m.c.a."));
                out.push(cmpRow("Red", "Presión estática máxima", num(data.red.presiones.pEst && data.red.presiones.pEst.value), Rr.Pest, "m.c.a."));
                out.push(cmpRow("Red", "Cierre piezométrico", num(data.red.presiones.cierre && data.red.presiones.cierre.value), Rr.cierre, "m"));
            }
            if (data.red.datosInic) {
                data.red.datosInic.tramos.rows.forEach((tr, i) => {
                    if (Rr.Qf && Rr.Qf[i] != null) out.push(cmpRow("Red tramo " + tr.id, "Caudal final Q", num(tr.Qf), Rr.Qf[i] * 1000, "l/s", 0.5));
                    if (Rr.hf && Rr.hf[i] != null) { const hx = (data.red.presiones && data.red.presiones.tramos.find((x) => x.id === tr.id)); out.push(cmpRow("Red tramo " + tr.id, "Pérdida h", hx ? num(hx.h) : null, Rr.hf[i], "m", 0.5)); }
                });
            }
        }
        if (data.potab && rec && rec.potab && !rec.potab.error) {
            const p = rec.potab;
            const entries = data.potab.entries;
            const find = (re) => { const e = entries.find((x) => x.label && re.test(x.label) && typeof x.value === "number"); return e ? e.value : null; };
            out.push(cmpRow("Potabilizadora", "Qcap", find(/^qcap/i), p.qcap, "l/s"));
            out.push(cmpRow("Potabilizadora", "Altura del agua en Parshall H", find(/altura del agua a la llegada/i), p.phH, "m"));
            out.push(cmpRow("Potabilizadora", "h2 Parshall", find(/altura del agua al final de la garganta/i), p.phH2, "m"));
            out.push(cmpRow("Potabilizadora", "H3 Parshall", find(/altura del agua a la salida/i), p.phH3, "m"));
            out.push(cmpRow("Potabilizadora", "Separación de canales b", find(/separacion de los canales adoptado/i), p.flBAdopt, "m"));
            out.push(cmpRow("Potabilizadora", "Volumen de floculación V", find(/volumen de retencion/i), p.flV || null, "m³"));
            out.push(cmpRow("Potabilizadora", "Área de filtración", find(/area de filtracion|area de los filtros|area superficial/i), p.filA, "m²"));
            out.push(cmpRow("Potabilizadora", "Volumen de cloración", find(/volumen de contacto|volumen de cloracion/i), p.clV, "m³"));
            out.push(cmpRow("Potabilizadora", "Volumen del reservorio", find(/volumen del reservorio|volumen de reserva/i), p.resV, "m³"));
            out.push(cmpRow("Potabilizadora", "Área cámara de aquietamiento", find(/area de la seccion trasversal/i), p.aqArea, "m²"));
            out.push(cmpRow("Potabilizadora", "Lado de la cámara", find(/lados del aquietador/i), p.aqLado, "m"));
            out.push(cmpRow("Potabilizadora", "Profundidad de la cámara", find(/profundidad de la camara de aquietamiento/i), p.aqProf, "m"));
            out.push(cmpRow("Potabilizadora", "Velocidad en garganta Parshall", find(/verificacion de velocidad/i), p.phV, "m/s"));
            out.push(cmpRow("Potabilizadora", "Hmax vertedero V", find(/hmax/i), p.vHmax, "m"));
            out.push(cmpRow("Potabilizadora", "h1 del resalto", find(/profundidad despues del vertedero/i), p.vH1, "m"));
            out.push(cmpRow("Potabilizadora", "h2 del resalto", find(/altura despues del resalto|altura despu/i), p.vH2, "m"));
            out.push(cmpRow("Potabilizadora", "Tiempo de mezcla", find(/tiempo de mezcla/i), p.vT, "s"));
            out.push(cmpRow("Potabilizadora", "N° canales floculador", find(/numeros de canales/i), p.flN, "—"));
            out.push(cmpRow("Potabilizadora", "Lado Y floculador", find(/lado y/i), p.flY, "m"));
            out.push(cmpRow("Potabilizadora", "Pérdida total floculador", find(/perdida de carga total/i), p.flHftotal, "m"));
            out.push(cmpRow("Potabilizadora", "Caudal de lavado", find(/caudal de lavado/i), p.filQlav, "l/s"));
            out.push(cmpRow("Potabilizadora", "Consumo de cloro", find(/consumo de cloro/i), p.clConsumo, "kg/d"));
        }
        return out;
    }
    function alts(data, sheet, i) {
        const a = data[sheet] && data[sheet].alts;
        if (!a) return {};
        const o = {};
        ["dS", "dI", "vS", "vI", "JS", "JI", "leqS", "leqI", "LS", "LI", "hS", "hI", "hvS", "hvI", "pRes", "HmS", "HmI", "Hm", "Pb", "HP", "Pmb", "holgura", "Phmb"].forEach((k) => { o[k] = a[k] ? a[k][i] : null; });
        o.Padop = data[sheet].padop;
        return o;
    }
    function num(x) { const n = Number(x); return x == null || x === "" || !isFinite(n) ? null : n; }

    /* ---------------- Gráficos SVG ---------------- */
    function convChart(its) {
        if (!its || !its.length) return sectionEmpty("El archivo no trae el resumen de iteraciones de Hardy Cross.");
        const vals = its.map((x) => Math.max(1e-9, Math.abs(x.max || 0)));
        const W = 720, H = 300, m = { l: 62, r: 22, t: 20, b: 42 };
        const maxV = Math.max(...vals), minV = Math.min(...vals);
        const lx = (i) => m.l + (W - m.l - m.r) * (its.length === 1 ? 0.5 : i / (its.length - 1));
        const logMin = Math.log10(minV), logMax = Math.log10(maxV);
        const ly = (v) => m.t + (H - m.t - m.b) * (1 - (Math.log10(v) - logMin) / (logMax - logMin || 1));
        const pts = vals.map((v, i) => `${lx(i).toFixed(1)},${ly(v).toFixed(1)}`).join(" ");
        const ticks = [1, 0.1, 0.01, 0.001, 0.0001].filter((t) => t >= minV / 10 && t <= maxV * 10);
        const grid = ticks.map((t) => `<line x1="${m.l}" y1="${ly(t).toFixed(1)}" x2="${W - m.r}" y2="${ly(t).toFixed(1)}" stroke="var(--border)" stroke-dasharray="3 3"/><text x="${m.l - 8}" y="${(ly(t) + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${String(t).replace(".", ",")}</text>`).join("");
        const dots = its.map((x, i) => `<circle cx="${lx(i).toFixed(1)}" cy="${ly(vals[i]).toFixed(1)}" r="3" fill="var(--accent)"><title>Iteración ${x.it}: máx |ΔQ| = ${fmt(x.max, 5)} l/s</title></circle>`).join("");
        return `<figure class="report-fig"><svg viewBox="0 0 ${W} ${H}" class="conv-chart" role="img" aria-label="Convergencia de Hardy Cross">
            <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
            ${grid}
            <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${H - m.b}" stroke="var(--muted)"/>
            <line x1="${m.l}" y1="${H - m.b}" x2="${W - m.r}" y2="${H - m.b}" stroke="var(--muted)"/>
            <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>
            ${dots}
            <text x="${W / 2}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--muted)">Iteración</text>
            <text x="14" y="${H / 2}" text-anchor="middle" font-size="11" fill="var(--muted)" transform="rotate(-90 14 ${H / 2})">máx |ΔQ| (l/s)</text>
        </svg><figcaption>Figura 1. Convergencia de Hardy Cross: máximo |ΔQ| por iteración (escala logarítmica).</figcaption></figure>`;
    }
    function netSVG(red, rec) {
        if (!red || !red.datosInic || !red.datosInic.tramos.rows.length) return sectionEmpty("El archivo no trae la tabla de tramos de la red.");
        const rows = red.datosInic.tramos.rows;
        const nodes = (red.presiones && red.presiones.nodos.length ? red.presiones.nodos : red.datosInic.nodos.rows) || [];
        const ids = new Set(); rows.forEach((p) => { ids.add(p.a); ids.add(p.b); }); nodes.forEach((n) => ids.add(n.id));
        const idsArr = [...ids];
        const coord = (id, i) => {
            const m = /^([A-Za-z]+)(\d+)$/.exec(String(id || ""));
            if (m) return { x: m[1].toUpperCase().charCodeAt(0) - 65, y: Number(m[2]) };
            return { x: i % 6, y: Math.floor(i / 6) };
        };
        const pos = {};
        idsArr.forEach((id, i) => { pos[id] = coord(id, i); });
        const xs = Object.values(pos).map((p) => p.x), ys = Object.values(pos).map((p) => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const W = 760, H = 460, m = 52;
        const sx = (x) => m + (W - 2 * m) * ((x - minX) / (maxX - minX || 1));
        const sy = (y) => m + (H - 2 * m) * ((y - minY) / (maxY - minY || 1));
        const R = rec && rec.result;
        const pres = {};
        if (R && R.pres) nodes.forEach((n, i) => { pres[n.id] = R.pres[i]; });
        const pipeLines = rows.map((p, i) => {
            const A = pos[p.a], B = pos[p.b]; if (!A || !B) return "";
            const D = p.D != null ? Number(p.D) : 0;
            const w = 1.2 + Math.min(5, D / 100);
            const Q = p.Qf != null ? Number(p.Qf) : null;
            const midX = (sx(A.x) + sx(B.x)) / 2, midY = (sy(A.y) + sy(B.y)) / 2;
            const ang = Math.atan2(sy(B.y) - sy(A.y), sx(B.x) - sx(A.x));
            const arrow = `<path d="M${midX},${midY} l${-8 * Math.cos(ang) + 5 * Math.sin(ang)},${-8 * Math.sin(ang) - 5 * Math.cos(ang)} l${10 * Math.cos(ang)},${10 * Math.sin(ang)} l${-8 * Math.cos(ang) - 5 * Math.sin(ang)},${-8 * Math.sin(ang) + 5 * Math.cos(ang)} z" fill="var(--muted)" opacity=".7"/>`;
            return `<line x1="${sx(A.x)}" y1="${sy(A.y)}" x2="${sx(B.x)}" y2="${sy(B.y)}" stroke="var(--accent)" stroke-width="${w}" opacity=".75"><title>${esc(p.id)} · D ${fmt(p.D, 0)} mm · Q ${fmt(Q, 3)} l/s</title></line>${arrow}`;
        }).join("");
        const nodeDots = idsArr.map((id) => {
            const P = pos[id]; const press = pres[id];
            return `<circle cx="${sx(P.x)}" cy="${sy(P.y)}" r="13" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"><title>${esc(id)}${press != null ? " · p = " + fmt(press, 2) + " m.c.a." : ""}</title></circle><text x="${sx(P.x)}" y="${sy(P.y) + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="var(--text)">${esc(id)}</text>${press != null ? `<text x="${sx(P.x)}" y="${sy(P.y) - 18}" text-anchor="middle" font-size="8" fill="var(--muted)">${fmt(press, 1)}</text>` : ""}`;
        }).join("");
        return `<figure class="report-fig"><svg viewBox="0 0 ${W} ${H}" class="net-svg" role="img" aria-label="Esquema de la red de distribución">
            <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
            ${pipeLines}${nodeDots}
            <text x="${W / 2}" y="${H - 12}" text-anchor="middle" font-size="11" fill="var(--muted)">Esquema de la grilla: nodos, tramos y sentido del caudal (número junto al nodo: presión en m.c.a.).</text>
        </svg><figcaption>Figura 2. Esquema de la red de distribución leída del archivo.</figcaption></figure>`;
    }

    /* ---------------- Secciones ---------------- */
    function renderPortada(data, rec, meta) {
        const authors = meta && meta.authors ? meta.authors : "";
        const stats = [
            ["Hojas detectadas", data.sheetNames.length],
            ["Celdas leídas", Object.values(data.allCells).reduce((s, a) => s + a.length, 0)],
            ["Hojas agrupadas", data.grouped ? "Sí" : "No"],
            ["Resultados en caché", data.hasCachedValues ? "Sí" : "No"],
        ];
        return `<div class="cover">
            <p class="eyebrow">Saneamiento y Medio Ambiente · Trabajo práctico</p>
            <h3 class="cover-title">Informe técnico del libro de cálculo</h3>
            <p class="cover-sub">Extracción, recálculo independiente y verificación de la guía <em>GUÍA_TRABAJO_PRACTICO_PUBLICO.xlsx</em>.</p>
            <div class="cover-grid">
                <div><span>Archivo analizado</span><b>${esc(data.file)}</b></div>
                <div><span>Fecha del informe</span><b>${new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}</b></div>
                <div><span>Integrantes</span><b>${authors ? esc(authors) : "— (completar en el formulario)"}</b></div>
                <div><span>Variante detectada</span><b>${data.variant ? `${data.variant.anillos} anillo(s) · ${data.variant.tramos} tramo(s)${data.variant.tieneFuente ? " · con Fuente de datos" : ""}` : "—"}</b></div>
            </div>
            ${statsTable(stats)}
            ${data.warnings.length ? `<div class="warn-box">${data.warnings.map((w) => `<p>⚠ ${esc(w)}</p>`).join("")}</div>` : ""}
        </div>`;
    }
    function statsTable(rows) { return `<div class="stat-grid">${rows.map((r) => `<div class="stat"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join("")}</div>`; }

    function renderResumen(data, rec, cmps) {
        const rows = [];
        const R = data.rio, T = data.tanque;
        if (R) {
            const best = rec && rec.rio ? rec.rio.adopted : null;
            rows.push(["Impulsión río → planta", `Qb = ${fmt(R.results.qb_ls && R.results.qb_ls.value, 2)} l/s · Bresse ${fmt(R.results.bresse && R.results.bresse.value, 4)} m · ${best != null ? "Alt " + (best + 1) : "sin adoptar"} · Hm ${fmt(rec && rec.rio ? rec.rio.alts[best] && rec.rio.alts[best].Hm : null, 2)} m.c.a.`]);
        }
        if (data.potab) {
            const qcap = rec && rec.potab && !rec.potab.error ? rec.potab.qcap
                : (data.potab.sp && data.potab.sp.caudalDiario ? data.potab.sp.caudalDiario * (data.potab.sp.k1 || 1.2) * (data.potab.sp.k3 || 1.05) * 1000 / 86400
                    : (R && R.results.qb_ls ? R.results.qb_ls.value : null));
            rows.push(["Planta potabilizadora", `Qcap = ${fmt(qcap, 2)} l/s · ${data.potab.groups.filter((g) => g.entries.length).length} unidades con datos`]);
        }
        if (T) {
            const best = rec && rec.tanque ? rec.tanque.adopted : null;
            rows.push(["Impulsión planta → tanque", `Qb = ${fmt(T.inputs.qb_ls, 2)} l/s · Bresse ${fmt(T.inputs.bresse, 4)} m · ${best != null ? "Alt " + (best + 1) : "sin adoptar"} · Hm ${fmt(rec && rec.tanque ? rec.tanque.alts[best] && rec.tanque.alts[best].Hm : null, 2)} m.c.a.`]);
        }
        if (data.red) {
            const pr = data.red.presiones || {};
            rows.push(["Tanque elevado", `Hbase = ${fmt(pr.hbAd && pr.hbAd.value, 2)} m · cota de la base = ${fmt(pr.ctBase && pr.ctBase.value, 2)} m s.n.m. · ${rec && rec.red && rec.red.result ? "H útil = " + fmt(rec.red.result.Hmh, 2) + " m" : ""}`]);
            rows.push(["Red pública (Hardy Cross)", `${data.red.caudales && data.red.caudales.iter ? data.red.caudales.iter.value : "—"} iteraciones · presión mínima ${fmt(pr.pMin && pr.pMin.value, 3)} m.c.a. · cierre ${fmt(pr.cierre && pr.cierre.value, 4)} m`]);
        }
        if (data.cloacal) {
            const e = data.cloacal.entries.find((x) => /caudal maximo/i.test(x.label || "") && typeof x.value === "number");
            rows.push(["Red cloacal", e ? `Caudal máximo = ${fmt(e.value, 3)} ${e.unit || ""}` : `${data.cloacal.tables.length} tabla(s) de tramos`]);
        }
        if (data.tratamiento) rows.push(["Tratamiento preliminar", `${data.tratamiento.entries.filter((e) => typeof e.value === "number").length} resultados numéricos extraídos`]);
        if (data.laguna) rows.push(["Laguna facultativa", `${data.laguna.entries.filter((e) => typeof e.value === "number").length} resultados numéricos extraídos`]);
        if (!rows.length) return sectionEmpty("El archivo no contiene hojas reconocibles de la guía.");
        const verif = cmps.filter((c) => c.st === "ok").length;
        return tbl(["Sistema", "Solución adoptada / resultado principal"], rows, { caption: "Resumen ejecutivo por sistema" }) +
            `<p class="report-note">Verificaciones de la comparación Excel ↔ web: <strong>${verif} de ${cmps.length}</strong> coinciden dentro de la tolerancia del 0,5 %.</p>`;
    }

    function renderDatos(data) {
        const rows = [];
        const push = (sistema, defs, sheet) => {
            (defs || []).forEach((d) => {
                if (d.value == null) return;
                rows.push([sistema, esc(d.label || d.key), val(d.value, 6), esc(d.unit || ""), esc(d.cell), d.source === "rótulo" ? "rótulo" : "celda"]);
            });
        };
        if (data.rio) push("Río", data.rio.inputDefs, data.rio);
        if (data.tanque) push("Tanque", data.tanque.inputDefs, data.tanque);
        if (data.potab) {
            const sp = data.potab.sp || {};
            const defs = (root.IEMap && root.IEMap.POTAB_SP) || [];
            Object.keys(sp).forEach((k) => {
                const d = defs.find((x) => x.key === k);
                rows.push(["Potabilizadora", esc(d ? d.label : k), val(sp[k], 6), "", d ? d.cell : "—", "rótulo"]);
            });
        }
        if (data.red && data.red.datosInic) {
            const di = data.red.datosInic;
            [["Cantidad de edificios", di.edificios], ["Caudal medio", di.qMed], ["Caudal máximo diario", di.Qmd], ["Caudal máximo horario", di.Qmh], ["K1", di.k1], ["K2", di.k2], ["Velocidad económica", di.vEc], ["Diámetro mínimo", di.Dmin], ["Hazen-Williams C", di.Chw], ["Velocidad mínima", di.vMin]].forEach(([k, x]) => { if (x != null) rows.push(["Red", esc(k), val(x, 6), "", "—", "rótulo"]); });
        }
        if (data.cloacal) data.cloacal.entries.filter((e) => e.input).forEach((e) => rows.push(["Cloacal", esc(e.label), val(e.value, 6), esc(e.unit), esc(e.cell), "rótulo/formato"]));
        if (data.tratamiento) data.tratamiento.entries.filter((e) => e.input).forEach((e) => rows.push(["Tratamiento", esc(e.label), val(e.value, 6), esc(e.unit), esc(e.cell), "rótulo/formato"]));
        if (data.laguna) data.laguna.entries.filter((e) => e.input).forEach((e) => rows.push(["Laguna", esc(e.label), val(e.value, 6), esc(e.unit), esc(e.cell), "rótulo/formato"]));
        let html = rows.length ? tbl(["Sistema", "Parámetro", "Valor", "Unidad", "Celda", "Origen"], rows, { caption: "Datos de partida" }) : sectionEmpty("No se encontraron datos de entrada.");
        if (data.changes && data.changes.length) {
            html += `<h3>Entradas que difieren de la guía original</h3>` +
                tbl(["Hoja", "Parámetro", "Valor en la guía", "Valor del archivo", "Celda"], data.changes.map((c) => [esc(c.sheet), esc(c.label || c.key), val(c.guide, 6), val(c.value, 6), esc(c.cell)]));
        } else if (data.rio || data.tanque) {
            html += `<p class="report-note">Las entradas principales coinciden con la guía original (no se detectaron cambios en las celdas de datos).</p>`;
        }
        return html;
    }

    function renderPoblacion(data, rec) {
        if (!data.rio) return sectionEmpty("No se detectó la hoja de impulsión río.");
        const i = data.rio.inputs, res = data.rio.results;
        const pop = i.manzanas * i.lotes * (i.pisos * i.deptos * (i.dorm * i.persDorm + i.persServ));
        const log = (i.deptos * i.pisos) * i.pctLog / 100 * i.lotes * i.manzanas;
        const qmLd = pop * i.qDept + log * i.qLog;
        const qb = i.k1 * i.k3 * (qmLd / 1000) / 86400;
        return `<p>Población de los departamentos, personal de logística y caudales de proyecto. Se comparan los valores del archivo con la sustitución numérica explícita.</p>
        ${formula(`P = B_3 \\cdot B_4 \\cdot \\left(B_5 B_6 (B_7 B_8 + B_9)\\right) = ${i.manzanas} \\cdot ${i.lotes} \\cdot \\left(${i.pisos}\\cdot ${i.deptos}\\cdot (${i.dorm}\\cdot ${i.persDorm}+${i.persServ})\\right) = ${fmt(pop, 0)}\\ \\text{pers}`)}
        ${formula(`L = \\frac{B_6 B_5 B_{10}}{100} B_4 B_3 = \\frac{${i.deptos}\\cdot ${i.pisos}\\cdot ${i.pctLog}}{100}\\cdot ${i.lotes}\\cdot ${i.manzanas} = ${fmt(log, 2)}\\ \\text{funcionarios}`)}
        ${formula(`Q_m = P\\,q_{dep} + L\\,q_{log} = ${fmt(pop, 0)}\\cdot ${i.qDept} + ${fmt(log, 2)}\\cdot ${i.qLog} = ${fmt(qmLd, 0)}\\ \\text{l/d} = ${fmt(qmLd / 1000, 2)}\\ \\text{m}^3/\\text{d} = ${fmt(qmLd / 86400, 3)}\\ \\text{l/s}`)}
        ${formula(`Q_b = K_1 K_3 \\frac{Q_m[\\text{m}^3/\\text{d}]}{86400} = ${i.k1}\\cdot ${i.k3}\\cdot \\frac{${fmt(qmLd / 1000, 2)}}{86400} = ${fmt(qb, 6)}\\ \\text{m}^3/\\text{s} = ${fmt(qb * 1000, 3)}\\ \\text{l/s}`)}
        ${formula(`D_{Bresse} = 1{,}3\\sqrt{Q_b}\\left(\\frac{h}{24}\\right)^{1/4} = 1{,}3\\sqrt{${fmt(qb, 6)}}\\left(\\frac{${i.horas}}{24}\\right)^{1/4} = ${fmt(1.3 * Math.sqrt(qb) * Math.pow(i.horas / 24, 0.25), 6)}\\ \\text{m}`)}
        ${tbl(["Concepto", "Valor del Excel", "Valor recalculado", "Diferencia"], [
            ["Población", val(num(res.poblacion && res.poblacion.value), 0), fmt(pop, 0), pct(diff(pop, num(res.poblacion && res.poblacion.value)))],
            ["Logística", val(num(res.logistica && res.logistica.value), 2), fmt(log, 2), pct(diff(log, num(res.logistica && res.logistica.value)))],
            ["Qm (l/s)", val(num(res.qm_ls && res.qm_ls.value), 3), fmt(qmLd / 86400, 3), pct(diff(qmLd / 86400, num(res.qm_ls && res.qm_ls.value)))],
            ["Qb (l/s)", val(num(res.qb_ls && res.qb_ls.value), 3), fmt(qb * 1000, 3), pct(diff(qb * 1000, num(res.qb_ls && res.qb_ls.value)))],
            ["Bresse (m)", val(num(res.bresse && res.bresse.value), 4), fmt(1.3 * Math.sqrt(qb) * Math.pow(i.horas / 24, 0.25), 4), pct(diff(1.3 * Math.sqrt(qb) * Math.pow(i.horas / 24, 0.25), num(res.bresse && res.bresse.value)))],
        ])}`;
    }
    function diff(a, b) { if (a == null || b == null || !isFinite(a) || !isFinite(b)) return null; return Math.abs(a - b) / (Math.abs(b) > 1e-12 ? Math.abs(b) : 1) * 100; }

    function renderImpulsion(data, sheet, titulo, subtitulo, rec) {
        const S = data[sheet];
        if (!S) return sectionEmpty(`No se detectó la hoja “${titulo}”.`);
        const inp = S.inputs || {};
        const rr = rec && rec[sheet];
        const altRows = [0, 1, 2].map((i) => {
            const ex = alts(data, sheet, i);
            const rc = rr && rr.alts ? rr.alts[i] : {};
            return { i, ex, rc, label: getAltLabel(data, sheet, i) };
        });
        const qb = sheet === "rio" ? num(S.results.qb_ls && S.results.qb_ls.value) : num(inp.qb_ls);
        const qbm3 = sheet === "rio" ? num(S.results.qb_m3s && S.results.qb_m3s.value) : num(inp.qb_m3s);
        const bresse = sheet === "rio" ? num(S.results.bresse && S.results.bresse.value) : num(inp.bresse);
        const horas = inp.horas;
        let html = `<p>${esc(subtitulo)}</p>
        ${formula(`D_{Bresse} = 1{,}3\\sqrt{Q_b}\\left(\\frac{h}{24}\\right)^{1/4} = 1{,}3\\sqrt{${fmt(qbm3, 6)}}\\left(\\frac{${fmt(horas, 2)}}{24}\\right)^{1/4} = ${fmt(bresse, 6)}\\ \\text{m}`)}
        <p class="report-note">Caudal de bombeo Q<sub>b</sub> = <strong>${fmt(qb, 3)} l/s</strong>; horas de operación = ${fmt(horas, 2)} h/d.</p>`;
        const head = ["Concepto", "Unidad"].concat(altRows.map((a) => a.label));
        const rows = [
            ["Diámetro de succión", "mm", ...altRows.map((a) => val(a.ex.dS, 0))],
            ["Diámetro de impulsión", "mm", ...altRows.map((a) => val(a.ex.dI, 0))],
            ["Velocidad de succión", "m/s", ...altRows.map((a) => val(a.ex.vS, 3))],
            ["Velocidad de impulsión", "m/s", ...altRows.map((a) => val(a.ex.vI, 3))],
            ["J succión (Fair-Whipple-Hsiao)", "m/m", ...altRows.map((a) => val(a.ex.JS, 6))],
            ["J impulsión (Fair-Whipple-Hsiao)", "m/m", ...altRows.map((a) => val(a.ex.JI, 6))],
            ["Longitud equivalente succión", "m", ...altRows.map((a) => val(a.ex.leqS, 2))],
            ["Longitud equivalente impulsión", "m", ...altRows.map((a) => val(a.ex.leqI, 2))],
            ["Longitud de tubería succión", "m", ...altRows.map((a) => val(a.ex.LS, 2))],
            ["Longitud de tubería impulsión", "m", ...altRows.map((a) => val(a.ex.LI, 2))],
            ["Altura topográfica succión", "m", ...altRows.map((a) => val(a.ex.hS, 2))],
            ["Altura topográfica impulsión", "m", ...altRows.map((a) => val(a.ex.hI, 2))],
            ["v²/2g succión", "m", ...altRows.map((a) => val(a.ex.hvS, 4))],
            ["v²/2g impulsión", "m", ...altRows.map((a) => val(a.ex.hvI, 4))],
            ["Presión de llegada", "m", ...altRows.map((a) => val(a.ex.pRes, 2))],
            ["Hm succión", "m.c.a.", ...altRows.map((a) => val(a.ex.HmS, 3))],
            ["Hm impulsión", "m.c.a.", ...altRows.map((a) => val(a.ex.HmI, 3))],
            ["Hm total", "m.c.a.", ...altRows.map((a) => val(a.ex.Hm, 3))],
            ["Rendimiento de bomba ηb", "—", ...altRows.map((a) => val(S.etaB ? S.etaB[a.i] : null, 3))],
            ["Potencia de bomba Pb", "CV", ...altRows.map((a) => val(a.ex.Pb, 3))],
            ["Potencia convertida a HP", "HP", ...altRows.map((a) => val(a.ex.HP, 3))],
            ["Rendimiento de motor ηm", "—", ...altRows.map((a) => val(S.etaM ? S.etaM[a.i] : null, 3))],
            ["Potencia con motor Pmb", "HP", ...altRows.map((a) => val(a.ex.Pmb, 3))],
            ["Holgura", "%", ...altRows.map((a) => val(a.ex.holgura, 0))],
            ["Phmb", "HP", ...altRows.map((a) => val(a.ex.Phmb, 3))],
            ["Potencia adoptada", "HP", ...altRows.map((a) => val(a.rc.Padop, 2))],
            ["Verificación de velocidades", "—", ...altRows.map((a) => a.rc.ok ? badge("ok", "verifica") : badge("fail", "no verifica"))],
            ["Costo anual", "US$/año", ...altRows.map((a) => val(a.rc.annual, 0))],
        ];
        html += `<h3>Tabla de alternativas</h3>` + tbl(head, rows, { cls: "wide", caption: "Alternativas de diámetro — " + titulo });
        if (sheet === "rio" && S.costRows && Object.keys(S.costRows).length) {
            const costRows = Object.keys(S.costRows).map((k) => [esc(k), ...S.costRows[k].values.map((x) => val(x, 2))]);
            html += `<h3>Análisis de mínimo costo del archivo</h3>` + tbl(["Concepto", "Alt 1", "Alt 2", "Alt 3"], costRows, { caption: "Análisis de mínimo costo del archivo — " + titulo });
        }
        if (S.pozo) html += `<h3>Pozo de bombeo</h3>` + tbl(["Concepto", "Alt 1", "Alt 2", "Alt 3"], [
            ["Altura mínima por cavitación (m)", ...(S.pozo.cavitacion || []).map((x) => val(x, 3))],
            ["Por seguridad (m)", val(S.pozo.seguridad, 2), val(S.pozo.seguridad, 2), val(S.pozo.seguridad, 2)],
            ["Adopta el mayor (m)", val(S.pozo.adoptado, 2), val(S.pozo.adoptado, 2), val(S.pozo.adoptado, 2)],
        ]);
        if (rr) {
            const recRows = [
                cmpRow("", "Qb", num(S.results.qb_ls && S.results.qb_ls.value), rr.qb_ls, "l/s"),
                cmpRow("", "Bresse", bresse, rr.bresse, "m"),
            ];
            rr.alts.forEach((a, i) => recRows.push(cmpRow(getAltLabel(data, sheet, i), "Hm", alts(data, sheet, i).Hm, a.Hm, "m.c.a.")));
            rr.alts.forEach((a, i) => recRows.push(cmpRow(getAltLabel(data, sheet, i), "Padop", i === (sheet === "rio" ? 1 : 0) ? S.padop : null, a.Padop, "HP")));
            html += `<h3>Recálculo independiente</h3>` +
                `<p>El recálculo usa los mismos datos del archivo y las funciones <code>MC.jFWH</code>, <code>MC.bresse</code>, <code>MC.holgura</code> y <code>MC.hpComercial</code>. La conversión CV→HP se hace correctamente: 1 HP = 1,014 CV, por lo que se divide por 1,014.</p>` +
                cmpTable(recRows, "Recálculo independiente — " + titulo);
        }
        return html;
    }

    function renderPotab(data, rec) {
        if (!data.potab) return sectionEmpty("No se detectó la hoja POTABILIZADORA.");
        let html = `<p>Se recorrió la hoja completa por rótulos y se agruparon los datos por unidad de proceso. La comparación con el recálculo de la web se muestra al final de la sección.</p>`;
        data.potab.groups.forEach((g, gi) => {
            if (!g.entries.length) return;
            html += `<h3>${gi + 1}. ${esc(g.title)}</h3>` + tbl(["Concepto", "Valor", "Unidad", "Celda", "Fórmula"], g.entries.slice(0, 90).map((e) => [esc(e.label), val(e.value, 6), esc(e.unit), esc(e.cell || ""), e.formula ? `<code>${esc(e.formula).slice(0, 120)}</code>` : ""]));
        });
        if (rec && rec.potab && !rec.potab.error) {
            const p = rec.potab;
            html += `<h3>Recálculo de la planta</h3>` + tbl(["Concepto", "Valor recalculado", "Unidad"], [
                ["Qcap", fmt(p.qcap, 3), "l/s"], ["Área cámara de aquietamiento", fmt(p.aqArea, 3), "m²"], ["Lado cámara", fmt(p.aqLado, 3), "m"],
                ["Altura Parshall H", fmt(p.phH, 4), "m"], ["h2", fmt(p.phH2, 4), "m"], ["H3", fmt(p.phH3, 4), "m"], ["h1", fmt(p.phH1, 4), "m"], ["Velocidad en garganta", fmt(p.phV, 3), "m/s"],
                ["Hmax vertedero V", fmt(p.vHmax, 4), "m"], ["h1 resalto", fmt(p.vH1, 4), "m"], ["h2 resalto", fmt(p.vH2, 4), "m"], ["Tiempo de mezcla", fmt(p.vT, 3), "s"],
                ["Gradiente vertedero", fmt(p.gVert, 1), "s⁻¹"], ["Gradiente mezclador rápido", fmt(p.gr, 1), "s⁻¹"],
                ["Separación de canales b", fmt(p.flB, 4), "m"], ["b adoptado", fmt(p.flBAdopt, 3), "m"], ["N° canales", fmt(p.flN, 0), "—"], ["Lado Y", fmt(p.flY, 3), "m"], ["Pérdida total floculador", fmt(p.flHftotal, 3), "m"], ["Gradiente floculador", fmt(p.flG, 1), "s⁻¹"],
                ["Caudal sedimentador", fmt(p.sedQ, 1), "m³/d"], ["Área sedimentador", fmt(p.sedAs, 1), "m²"], ["Largo", fmt(p.sedL, 2), "m"], ["Ancho", fmt(p.sedB, 2), "m"], ["L/H", fmt(p.sedLH, 2), "—"],
                ["Área de filtración", fmt(p.filA, 2), "m²"], ["Largo de filtro", fmt(p.filL2, 2), "m"], ["Q de lavado", fmt(p.filQlav, 1), "l/s"],
                ["Volumen de cloración", fmt(p.clV, 2), "m³"], ["Consumo de cloro", fmt(p.clConsumo, 2), "kg/d"], ["Volumen del reservorio", fmt(p.resV, 1), "m³"], ["Diámetro del reservorio", fmt(p.resD, 2), "m"],
            ]);
        } else if (rec && rec.potab && rec.potab.error) {
            html += `<p class="warn-box">⚠ No se pudo recalcular la potabilizadora: ${esc(rec.potab.error)}</p>`;
        }
        return html;
    }

    function renderTanqueElevado(data, rec) {
        if (!data.red || !data.red.presiones) return sectionEmpty("No se detectó la hoja de presiones de la red.");
        const pr = data.red.presiones;
        const R = rec && rec.red && rec.red.result;
        const rows = [
            ["Altura mínima de la base del tanque", val(pr.hbMin && pr.hbMin.value, 3), "m"],
            ["Altura de la base adoptada", val(pr.hbAd && pr.hbAd.value, 3), "m"],
            ["Cota del terreno en el tanque", val(pr.ctTanque && pr.ctTanque.value, 3), "m s.n.m."],
            ["Cota de la base del tanque", val(pr.ctBase && pr.ctBase.value, 3), "m s.n.m."],
            ["Presión mínima", val(pr.pMin && pr.pMin.value, 3), "m.c.a."],
            ["Presión máxima dinámica", val(pr.pMax && pr.pMax.value, 3), "m.c.a."],
            ["Presión estática máxima", val(pr.pEst && pr.pEst.value, 3), "m.c.a."],
            ["Cierre de cotas piezométricas", val(pr.cierre && pr.cierre.value, 5), "m"],
        ];
        const di = data.red.datosInic || {};
        if (di.tankD != null) rows.push(["Diámetro del tanque (archivo)", val(di.tankD, 2), "m"]);
        if (di.tankVmh != null) rows.push(["Volumen con Q máximo horario (archivo)", val(di.tankVmh, 1), "m³"]);
        if (di.tankHu != null) rows.push(["Altura útil del tanque (archivo)", val(di.tankHu, 3), "m"]);
        if (R) rows.push(["Volumen con Q máximo horario (recálculo)", val(R.Vmh, 1), "m³"], ["Altura útil del tanque (recálculo)", val(R.Hmh, 3), "m"], ["Altura total del tanque (recálculo)", val(R.Htot, 3), "m"]);
        return `<p>El tanque se dimensiona con el caudal máximo horario más la reserva adoptada. La altura de la base surge de la presión mínima requerida en el nodo más desfavorable.</p>` +
            formula(`H_{base,min} = \\max_i\\left(P_{min} + CT_i - CP_i^{0}\\right)`) +
            tbl(["Concepto", "Valor", "Unidad"], rows);
    }

    function renderRed(data, rec) {
        if (!data.red) return sectionEmpty("No se detectaron las hojas de la red pública.");
        const di = data.red.datosInic, pr = data.red.presiones, ca = data.red.caudales;
        let html = `<p>Red en malla resuelta por Hardy Cross. La tabla de tramos y la de nodos se leen dinámicamente: la cantidad de anillos, tramos y nodos se adapta a cada archivo.</p>`;
        const nIt = ca && ca.iter && ca.iter.value != null ? ca.iter.value : (ca && ca.its ? ca.its.length : null);
        html += `<p class="report-note">Iteraciones de Hardy Cross: <strong>${nIt == null ? "—" : nIt}</strong> · H<sub>base</sub> adoptada: <strong>${val(pr && pr.hbAd && pr.hbAd.value, 3)} m</strong> · presión mínima: <strong>${val(pr && pr.pMin && pr.pMin.value, 3)} m.c.a.</strong> · cierre: <strong>${val(pr && pr.cierre && pr.cierre.value, 5)} m</strong>.</p>`;
        const loss = {};
        if (pr && pr.tramos) pr.tramos.forEach((t) => { loss[t.id] = t; });
        if (di && di.tramos.rows.length) {
            html += `<h3>Tramos</h3>` + tbl(["Tramo", "Nodo a", "Nodo b", "L (m)", "Lotes", "Qa (l/s)", "D (mm)", "Q final (l/s)", "v (m/s)", "J (m/m)", "h (m)", "Verificación"], di.tramos.rows.map((t) => {
                const x = loss[t.id] || {};
                return [esc(t.id), esc(t.a), esc(t.b), val(t.L, 1), val(t.lotes, 1), val(t.Qa, 3), val(t.D, 0), val(t.Qf, 3), val(t.vel, 3), val(x.J, 6), val(x.h, 4), esc(t.vcheck || "—")];
            }), { cls: "wide", caption: "Tramos de la red" });
        }
        if (pr && pr.tramos.length) {
            html += `<h3>Pérdidas y cierre por tramo</h3>` + tbl(["Tramo", "D (m)", "L (m)", "Q (m³/s)", "J (m/m)", "h (m)", "Cierre (m)"], pr.tramos.map((t) => [esc(t.id), val(t.D, 3), val(t.L, 1), val(t.Q, 5), val(t.J, 6), val(t.h, 4), val(t.cierre, 6)]), { cls: "wide", caption: "Pérdidas y cierre por tramo" });
        }
        if (pr && pr.nodos.length) {
            html += `<h3>Nodos y presiones</h3>` + tbl(["Nodo", "Cota terreno (m)", "CP con Hbase = 0", "Hbase necesaria", "CP final", "Presión (m.c.a.)", "Verificación"], pr.nodos.map((n) => [esc(n.id), val(n.ct, 2), val(n.cp0, 3), val(n.hbase, 3), val(n.cp, 3), val(n.p, 3), esc(n.check || "—")]), { cls: "wide", caption: "Nodos y presiones" });
        }
        html += `<h3>Convergencia de Hardy Cross</h3>` + convChart(ca && ca.its);
        html += `<h3>Esquema de la red</h3>` + netSVG(data.red, rec);
        return html;
    }

    function renderCloacalSimple(data) {
        const parts = [];
        const one = (title, sh) => {
            if (!sh) return;
            parts.push(`<h3>${esc(title)}</h3>`);
            if (sh.tables && sh.tables.length) {
                sh.tables.forEach((t) => {
                    parts.push(tbl(t.header, t.rows.map((r) => r.vals.map((x) => val(x, 3))), { cls: "wide" }));
                });
            }
            const numeric = sh.entries.filter((e) => e.label && (typeof e.value === "number" || e.value != null)).slice(0, 120);
            if (numeric.length) parts.push(tbl(["Concepto", "Valor", "Unidad", "Celda"], numeric.map((e) => [esc(e.label), val(e.value, 5), esc(e.unit), esc(e.cell || "")]), { cls: "wide" }));
            const v = (sh.verifications || []).filter((x) => /verifica|aumentar|disminuir|revisar/i.test(x.text));
            if (v.length) parts.push(`<p class="report-note">Verificaciones detectadas en la hoja: ${v.length}. Se consolidan en la sección de verificaciones.</p>`);
        };
        one("Red cloacal", data.cloacal);
        one("Tratamiento preliminar", data.tratamiento);
        one("Laguna facultativa", data.laguna);
        return parts.length ? parts.join("") : sectionEmpty("No se detectaron las hojas de cloacal, tratamiento o laguna.");
    }

    function renderVerificaciones(data, rec, cmps) {
        const rows = [];
        const add = (sistema, nombre, criterio, valor, st, nota) => rows.push([esc(sistema), esc(nombre), esc(criterio), val(valor, 4), badge(st, st === "ok" ? "verifica" : st === "fail" ? "no verifica" : "revisar"), esc(nota || "")]);
        if (data.rio) {
            const R = rec && rec.rio;
            (data.rio.alts.dS || []).forEach((d, i) => {
                const ex = alts(data, "rio", i);
                add("Río", `Velocidad de succión Alt ${i + 1}`, "0,7 ≤ v ≤ 4,0 m/s", ex.vS, ex.vS >= 0.7 && ex.vS <= 4 ? "ok" : "fail", "NP-68 / guía");
                add("Río", `Velocidad de impulsión Alt ${i + 1}`, "0,7 ≤ v ≤ 4,0 m/s", ex.vI, ex.vI >= 0.7 && ex.vI <= 4 ? "ok" : "fail", "NP-68 / guía");
                add("Río", `Succión > impulsión Alt ${i + 1}`, "D_s > D_i", `${ex.dS}/${ex.dI} mm`, ex.dS > ex.dI ? "ok" : "fail", "Nota F28 de la guía");
            });
            if (data.rio.verif) data.rio.verif.forEach((v) => add("Río", "Costo anual si verifica", "Velocidades y D_s > D_i", `Alt ${v.alt}`, /verifica/i.test(v.text) && !/no/i.test(v.text) ? "ok" : "fail", v.text));
        }
        if (data.tanque) {
            (data.tanque.alts.dS || []).forEach((d, i) => {
                const ex = alts(data, "tanque", i);
                add("Tanque", `Velocidad de succión Alt ${i + 1}`, "0,6 ≤ v ≤ 3,5 m/s", ex.vS, ex.vS >= 0.6 && ex.vS <= 3.5 ? "ok" : "fail", "Guía / NP-68");
                add("Tanque", `Velocidad de impulsión Alt ${i + 1}`, "0,6 ≤ v ≤ 3,5 m/s", ex.vI, ex.vI >= 0.6 && ex.vI <= 3.5 ? "ok" : "fail", "Guía / NP-68");
                add("Tanque", `Succión > impulsión Alt ${i + 1}`, "D_s > D_i", `${ex.dS}/${ex.dI} mm`, ex.dS > ex.dI ? "ok" : "fail", "Nota de la guía");
            });
        }
        if (data.red && data.red.presiones) {
            const p = data.red.presiones;
            add("Red", "Presión mínima", "≥ 10 m.c.a.", p.pMin && p.pMin.value, num(p.pMin && p.pMin.value) >= 10 ? "ok" : "fail", "NP-68");
            add("Red", "Presión estática máxima", "≤ 40 m.c.a.", p.pEst && p.pEst.value, num(p.pEst && p.pEst.value) <= 40 ? "ok" : "fail", "NP-68");
            add("Red", "Cierre piezométrico", "< 0,01 m", p.cierre && p.cierre.value, num(p.cierre && p.cierre.value) < 0.01 ? "ok" : "fail", "Hardy Cross");
            if (data.red.caudales && data.red.caudales.iter) add("Red", "Convergencia", "|ΔQ| < tolerancia", data.red.caudales.iter.value, num(data.red.caudales.iter.value) <= 50 ? "ok" : "warn", "Se adopta la primera iteración convergente");
        }
        if (data.potab) {
            const g = data.potab.groups;
            const check = (re, st, crit) => { const e = data.potab.entries.find((x) => re.test(x.label || "") && typeof x.value === "number"); if (e) add("Potabilizadora", e.label, crit, e.value, st === "auto" ? (/verifica/i.test(String(e.value)) && !/no/i.test(String(e.value)) ? "ok" : "fail") : st, "Guía / NP-68"); };
            check(/velocidad ascencional/i, "auto", "4 a 10 cm/s");
            check(/verificacion de velocidad/i, "auto", "≥ 2 m/s para mezclador");
            check(/gradiente de mezcla rapida/i, "auto", "Verificación de mezcla");
        }
        ["cloacal", "tratamiento", "laguna"].forEach((k) => {
            if (!data[k]) return;
            (data[k].verifications || []).slice(0, 60).forEach((v) => add(k === "cloacal" ? "Cloacal" : k === "tratamiento" ? "Tratamiento" : "Laguna", v.label || "Verificación", "Según guía", v.text, /no verifica|aumentar|disminuir|revisar/i.test(v.text) ? "fail" : "ok", v.cell));
        });
        // Comparaciones con diferencia
        cmps.filter((c) => c.st !== "ok").forEach((c) => add("Comparación", c.scope + " · " + c.label, "Tolerancia 0,5 %", c.diff != null ? c.diff : "—", "warn", c.note || "Ver sección de comparación"));
        return rows.length ? tbl(["Sistema", "Verificación", "Criterio", "Valor", "Estado", "Nota"], rows, { cls: "wide", caption: "Verificaciones consolidadas" }) : sectionEmpty("No se encontraron verificaciones.");
    }

    function renderComparacion(data, rec, cmps) {
        const ok = cmps.filter((c) => c.st === "ok").length, warn = cmps.filter((c) => c.st === "warn").length, fail = cmps.filter((c) => c.st === "fail").length;
        return `<p>Se comparan los resultados del Excel con el recálculo independiente de la web. La tolerancia de coincidencia es del <strong>0,5 %</strong>. Las diferencias por errores heredados de la guía se explican en la sección de observaciones.</p>` +
            `<div class="stat-grid"><div class="stat"><span>Coinciden</span><b>${ok}</b></div><div class="stat"><span>Difieren</span><b>${warn}</b></div><div class="stat"><span>Faltan / error</span><b>${fail}</b></div><div class="stat"><span>Total</span><b>${cmps.length}</b></div></div>` +
            cmpTable(cmps, "Comparación Excel vs. recálculo web");
    }
    function renderObservaciones(data) {
        const items = [];
        data.warnings.forEach((w) => items.push({ level: "warn", text: w }));
        data.observations.forEach((o) => items.push(o));
        if (data.grouped) items.push({ level: "warn", text: "Hojas agrupadas: al escribir en una celda se sobrescribe en todas las hojas del grupo. Revisá que las entradas no se hayan copiado entre hojas." });
        if (!data.hasCachedValues) items.push({ level: "warn", text: "Hay celdas con fórmula sin valor en caché. El informe usa el recálculo de la web; abrí y guardá el archivo en Excel para tener los resultados del libro." });
        const errors = [];
        Object.entries(data.allCells).forEach(([sh, cells]) => cells.forEach((c) => { if (/^#(REF|DIV\/0|NAME|VALUE|N\/A|NUM|NULL)/i.test(String(c.v || c.w || ""))) errors.push(`${sh}!${c.cell}: ${c.v || c.w}`); }));
        errors.forEach((e) => items.push({ level: "fail", text: "Error de Excel detectado: " + e + ". Corregí la fórmula o la referencia." }));
        // Errores heredados de la guía
        if (data.rio) {
            const hp = data.rio.alts.HP || [];
            const pb = data.rio.alts.Pb || [];
            hp.forEach((x, i) => {
                if (x != null && pb[i] != null && x > pb[i] / 1.014 * 1.01) items.push({ level: "warn", text: `Impulsión río, Alt ${i + 1}: la guía convierte CV→HP multiplicando por 1,014 (${fmt(pb[i], 3)} CV → ${fmt(x, 3)} HP). Lo correcto es dividir: ${fmt(pb[i] / 1.014, 3)} HP. Se reporta como error heredado de la guía; puede cambiar la potencia adoptada.` });
            });
        }
        if (data.tanque) {
            const hp = data.tanque.alts.HP || [];
            const pb = data.tanque.alts.Pb || [];
            hp.forEach((x, i) => {
                if (x != null && pb[i] != null && x > pb[i] / 1.014 * 1.01) items.push({ level: "warn", text: `Impulsión al tanque, Alt ${i + 1}: la guía convierte CV→HP multiplicando por 1,014 (${fmt(pb[i], 3)} CV → ${fmt(x, 3)} HP). Lo correcto es dividir: ${fmt(pb[i] / 1.014, 3)} HP.` });
            });
            const D50 = findFormula(data, "tanque", "D50");
            if (D50 && /I50/.test(D50)) items.push({ level: "warn", text: "Impulsión al tanque: la fórmula de Pmb de la Alt 3 divide por I50 (rendimiento del motor de la Alt 2) en lugar de J50. Se reporta como error heredado de la guía y se muestra el valor corregido en la comparación." });
            const row49 = findFormula(data, "tanque", "B49");
            if (row49 && /\*1\.014/.test(row49)) items.push({ level: "warn", text: "Impulsión al tanque: la conversión CV→HP multiplica por 1,014; lo correcto es dividir por 1,014 (1 HP = 1,014 CV)." });
        }
        if (data.red && data.red.datosInic) {
            const lotesAgua = num(data.red.datosInic.totals && data.red.datosInic.totals.lotes);
            const lotesClo = data.cloacal ? (data.cloacal.entries.find((e) => /cantidad de edificios|lotes/i.test(e.label || "") && typeof e.value === "number") || {}).value : null;
            if (lotesAgua != null && lotesClo != null && Math.abs(lotesAgua - lotesClo) > 0.01) items.push({ level: "warn", text: `Los lotes de la red de agua (${fmt(lotesAgua, 0)}) no coinciden con los de la red cloacal (${fmt(lotesClo, 0)}). Revisá la cantidad de edificios de cada red.` });
            if (data.red.caudales && data.red.caudales.iter && num(data.red.caudales.iter.value) > 10) items.push({ level: "info", text: `Hardy Cross requirió ${data.red.caudales.iter.value} iteraciones. La guía sugiere revisar los diámetros si hacen falta más de 10.` });
        }
        // verificaciones que no verifican
        ["rio", "tanque"].forEach((k) => {
            if (!data[k]) return;
            (data[k].verifications || []).forEach((v) => { if (/no verifica|aumentar|disminuir|revisar/i.test(v.text)) items.push({ level: "warn", text: `${k === "rio" ? "Río" : "Tanque"} ${v.cell} (“${v.label || ""}”): ${v.text}.` }); });
        });
        if (!items.length) items.push({ level: "info", text: "No se detectaron observaciones ni errores." });
        return items.map((x) => `<div class="obs ${x.level}"><span>${x.level === "fail" ? "✖" : x.level === "warn" ? "⚠" : "ℹ"}</span><p>${esc(x.text)}</p></div>`).join("");
    }
    function findFormula(data, sheet, cell) {
        const sh = data.roles && data.roles[sheet];
        if (!sh || !data.allCells[sh]) return null;
        const c = data.allCells[sh].find((x) => x.cell === cell);
        return c && c.f ? c.f : null;
    }

    function renderAnexos(data) {
        let html = "";
        if (data.fuente) {
            html += `<h3>Anexo A. Fuente de datos (trazabilidad)</h3>` + tbl(["Hoja", "Celda", "Concepto", "Valor en la guía", "Valor del TP", "Fuente"], data.fuente.rows.slice(1).map((r) => r.vals.map((x) => val(x, 6))), { cls: "wide" });
        }
        html += `<h3>Anexo B. Celdas extraídas por hoja</h3>`;
        Object.keys(data.allCells).forEach((name, i) => {
            const cells = data.allCells[name];
            html += `<details class="cell-details"><summary>${esc(name)} — ${cells.length} celdas con contenido</summary>` +
                tbl(["Celda", "Valor", "Texto mostrado", "Fórmula", "Entrada (amarillo/rojo)"], cells.slice(0, 600).map((c) => [esc(c.cell), val(c.v, 6), esc(c.w || ""), c.f ? `<code>${esc(c.f).slice(0, 160)}</code>` : "", c.input ? "Sí" : ""])) + `</details>`;
        });
        if (root.MC) {
            html += `<h3>Anexo C. Tablas NP-68 usadas</h3>`;
            html += `<h4>Tabla VI — Rendimiento de bombas centrífugas</h4>` + tbl(["Q (l/s)", "ηb (%)"], root.MC.TABLA_VI.map((r) => [r[0], r[1]]));
            html += `<h4>Tabla VII — Rendimiento de motores eléctricos</h4>` + tbl(["HP", "ηm (%)"], root.MC.TABLA_VII.map((r) => [r[1], r[2]]));
            html += `<h4>Tabla VIII — Potencias comerciales</h4><p>${root.MC.HP_COM.map((x) => root.MC.hpTxt(x)).join(" · ")}</p>`;
            html += `<h4>Tabla 3 — Longitudes equivalentes (m)</h4>` + tbl(["DN (mm)", "Curva 90°", "Válv. pie", "Válv. retención", "Válv. cierre", "Tee lateral", "Tee 2 salidas"], [13, 19, 25, 32, 38, 50, 75, 100, 150, 200, 250, 300, 350].map((dn) => {
                const leq = (k) => { const x = root.MC.leq(dn, k); return x && x.v != null ? x.v : "—"; };
                return [dn, leq("curva90"), leq("valvPie"), leq("retLiviana"), leq("regComp"), leq("teeLateral"), leq("teeBilateral")];
            }));
        }
        return html;
    }

    function render(data, rec) {
        tableNo = 0;
        const cmps = comparisons(data, rec);
        return {
            portada: renderPortada(data, rec),
            resumen: renderResumen(data, rec, cmps),
            datos: renderDatos(data),
            poblacion: renderPoblacion(data, rec),
            rio: renderImpulsion(data, "rio", "Impulsión río → planta", "Sistema de impulsión desde el río hasta la planta potabilizadora. Se adoptan tres alternativas de diámetro y se elige por mínimo costo entre las que verifican.", rec),
            potab: renderPotab(data, rec),
            tanque: renderImpulsion(data, "tanque", "Impulsión planta → tanque", "Sistema de impulsión desde el reservorio de la planta hasta el tanque elevado de la red.", rec),
            "tanque-elevado": renderTanqueElevado(data, rec),
            red: renderRed(data, rec),
            cloacal: renderCloacalSimple(data),
            verificaciones: renderVerificaciones(data, rec, cmps),
            comparacion: renderComparacion(data, rec, cmps),
            observaciones: renderObservaciones(data),
            anexos: renderAnexos(data),
            cmps,
        };
    }

    root.IEReport = { render, comparisons, convChart, netSVG };
    if (typeof module !== "undefined" && module.exports) module.exports = root.IEReport;
})(typeof window !== "undefined" ? window : globalThis);
