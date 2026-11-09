"use strict";
/* =====================================================================
   informe-excel-ui.js — Carga del archivo, progreso, KPIs, descargas
   e integración con el índice lateral (ui-shell.js).
   ===================================================================== */
(function () {
    const $ = (id) => document.getElementById(id);
    const LS_KEY = "sh-excel-informe-v1";
    let DATA = null, RECALC = null, CMPS = [], FILE = null;

    function setStep(step, state) {
        const el = document.querySelector(`.pstep[data-step="${step}"]`);
        if (!el) return;
        el.classList.toggle("on", state === "on");
        el.classList.toggle("done", state === "done");
        el.classList.toggle("err", state === "err");
    }
    function resetSteps() { document.querySelectorAll(".pstep").forEach((x) => x.classList.remove("on", "done", "err")); }
    function status(msg, type) {
        const el = $("status");
        if (!el) return;
        el.className = "load-status" + (type ? " " + type : "");
        el.innerHTML = msg || "";
    }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

    function kpi(label, value, unit) {
        return `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}${unit ? ` <small>${esc(unit)}</small>` : ""}</div></div>`;
    }
    function updateKpis(extra) {
        const host = $("hero-kpis");
        if (!host) return;
        if (!extra) { host.innerHTML = kpi("Hojas detectadas", "—") + kpi("Celdas leídas", "—") + kpi("Verificaciones", "—") + kpi("Diferencias", "—"); return; }
        host.innerHTML = kpi("Hojas detectadas", extra.sheets) + kpi("Celdas leídas", extra.cells.toLocaleString("es-AR")) + kpi("Verificaciones OK / total", `${extra.ok} / ${extra.total}`) + kpi("Diferencias encontradas", extra.diff);
    }

    function showReport() {
        const loader = $("loader"), tools = $("report-tools");
        if (loader) loader.classList.add("loaded");
        if (tools) tools.hidden = false;
        document.body.classList.add("has-report");
    }
    function hideReport() {
        const loader = $("loader"), tools = $("report-tools");
        if (loader) loader.classList.remove("loaded");
        if (tools) tools.hidden = true;
        document.body.classList.remove("has-report");
        ["portada", "resumen", "datos", "poblacion", "rio", "potab", "tanque", "tanque-elevado", "red", "cloacal", "verificaciones", "comparacion", "observaciones", "anexos"].forEach((id) => { const el = $(id + "-body"); if (el) el.innerHTML = ""; });
        updateKpis(null);
    }

    function typeset() {
        const main = document.querySelector("main");
        if (!main || !window.MathJax) return;
        try {
            if (MathJax.startup && MathJax.startup.promise) MathJax.startup.promise.then(() => { try { MathJax.typesetPromise([main]); } catch (e) { } }).catch(() => { });
            else if (MathJax.typesetPromise) MathJax.typesetPromise([main]).catch(() => { });
        } catch (e) { /* noop */ }
    }

    function render(data, rec) {
        const report = window.IEReport.render(data, rec);
        Object.keys(report).forEach((k) => {
            if (k === "cmps") return;
            const host = $(k + "-body");
            if (host) host.innerHTML = report[k];
        });
        CMPS = report.cmps || [];
        const diff = CMPS.filter((c) => c.st !== "ok").length;
        const cells = Object.values(data.allCells).reduce((s, a) => s + a.length, 0);
        const vb = document.querySelectorAll("#verificaciones-body .badge-state");
        const vok = document.querySelectorAll("#verificaciones-body .badge-state.ok").length;
        const total = vb.length || CMPS.length;
        const ok = vb.length ? vok : CMPS.filter((c) => c.st === "ok").length;
        updateKpis({ sheets: data.sheetNames.length, cells, ok, total, diff });
        typeset();
    }

    function saveSummary(data, rec, cmps) {
        try {
            const summary = {
                v: 1, file: data.file, date: new Date().toISOString(), roles: data.roles,
                variant: data.variant, warnings: data.warnings, observations: data.observations.slice(0, 80),
                inputs: {
                    rio: data.rio ? data.rio.inputDefs.map((d) => ({ key: d.key, value: d.value, cell: d.cell })) : null,
                    tanque: data.tanque ? data.tanque.inputDefs.map((d) => ({ key: d.key, value: d.value, cell: d.cell })) : null,
                },
                results: {
                    rio: data.rio ? data.rio.results : null,
                    tanque: data.tanque ? data.tanque.inputs : null,
                    red: data.red && data.red.presiones ? { hbAd: data.red.presiones.hbAd, pMin: data.red.presiones.pMin, cierre: data.red.presiones.cierre } : null,
                },
                recalc: {
                    rio: rec && rec.rio ? { qb: rec.rio.qb, bresse: rec.rio.bresse, adopted: rec.rio.adoptedLabel } : null,
                    tanque: rec && rec.tanque ? { qb: rec.tanque.qb, bresse: rec.tanque.bresse, adopted: rec.tanque.adoptedLabel } : null,
                    red: rec && rec.red && rec.red.result ? { iter: rec.red.result.hc ? rec.red.result.hc.its.length : null, Hbase: rec.red.result.Hbase, pMin: rec.red.result.pres ? Math.min(...rec.red.result.pres) : null } : null,
                    potab: rec && rec.potab && !rec.potab.error ? { qcap: rec.potab.qcap } : null,
                },
                comparisons: cmps.map((c) => ({ scope: c.scope, label: c.label, excel: c.excel, recalc: c.recalc, diff: c.diff, st: c.st })),
            };
            localStorage.setItem(LS_KEY, JSON.stringify(summary));
        } catch (e) { /* cuota o modo privado: no es crítico */ }
    }

    async function handleFile(file) {
        if (!file) return;
        if (!/\.xlsx$/i.test(file.name)) { status("⚠ Elegí un archivo .xlsx (Excel).", "warn"); return; }
        if (!window.XLSX) { status("✖ No se pudo cargar la librería SheetJS. Revisá la conexión a internet y recargá la página.", "fail"); return; }
        FILE = file;
        hideReport();
        resetSteps();
        setStep("read", "on"); status("Leyendo el libro…");
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellFormula: true, cellNF: true, cellStyles: true });
            setStep("read", "done"); setStep("extract", "on"); status("Extrayendo datos por rótulos…");
            await new Promise((r) => setTimeout(r, 30));
            DATA = window.IE.extractWorkbook(wb, file.name);
            setStep("extract", "done"); setStep("recalc", "on"); status("Recalculando con los módulos de la web…");
            await new Promise((r) => setTimeout(r, 30));
            RECALC = await window.IERecalc.recalcAll(DATA);
            setStep("recalc", "done"); setStep("report", "on"); status("Generando el informe…");
            await new Promise((r) => setTimeout(r, 30));
            render(DATA, RECALC);
            setStep("report", "done");
            saveSummary(DATA, RECALC, CMPS);
            showReport();
            const total = CMPS.length, ok = CMPS.filter((c) => c.st === "ok").length;
            status(`✔ Informe generado. ${DATA.sheetNames.length} hojas, ${Object.values(DATA.allCells).reduce((s, a) => s + a.length, 0).toLocaleString("es-AR")} celdas leídas, ${ok}/${total} comparaciones coinciden.` + (DATA.warnings.length ? ` <br><span class="warn-text">⚠ ${DATA.warnings.map(esc).join(" ")}</span>` : ""), "ok");
            const tools = $("report-tools");
            if (tools) tools.scrollIntoView({ behavior: "smooth", block: "center" });
            window.scrollTo({ top: $("portada").offsetTop - 10, behavior: "smooth" });
        } catch (e) {
            console.error(e);
            const step = !$("file-input") ? "read" : ($("progress") && document.querySelector(".pstep.on") ? document.querySelector(".pstep.on").dataset.step : "read");
            setStep(step, "err");
            status("✖ No se pudo procesar el archivo: " + esc(e && e.message ? e.message : String(e)) + ". Verificá que sea un .xlsx válido y que no esté protegido.", "fail");
        }
    }

    function download(name, text, type) {
        const blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function safeName(s) { return String(s || "informe").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_"); }

    async function buildHtmlFile() {
        const shellMain = document.querySelector(".shell-main");
        let body = shellMain ? shellMain.innerHTML : document.querySelector("main").innerHTML;
        body = body.replace(/<div class="loader"[\s\S]*?<\/div>\s*<div id="portada-body"/, '<div id="portada-body"');
        body = body.replace(/<div class="report-tools"[\s\S]*?<\/div>/, "");
        body = body.replace(/<div class="toc-fab"[\s\S]*?<\/div>/, "");
        let css = "";
        for (const ss of Array.from(document.styleSheets || [])) {
            try { css += Array.from(ss.cssRules || []).map((r) => r.cssText).join("\n") + "\n"; }
            catch (e) { if (ss.href) css += `@import url("${ss.href}");\n`; }
        }
        return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Informe técnico — ${esc(DATA ? DATA.file : "Excel")}</title>
<style>${css}</style>
<style>body{background:#fff}.topnav,.hero,.toc,.report-tools,.loader{display:none!important}.shell{display:block}.shell-main{max-width:100%}@page{size:A4;margin:15mm}main{max-width:100%;padding:0}.card{box-shadow:none;border:0;padding:0}section{page-break-before:always}section:first-child{page-break-before:auto}</style>
<script>window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"]],displayMath:[["\\\\[","\\\\]"]]},svg:{fontCache:"global"}};<\/script>
<script async src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js"><\/script>
</head><body><main>${body}</main></body></html>`;
    }

    function setup() {
        const dz = $("dropzone"), input = $("file-input"), pick = $("btn-pick");
        if (!dz || !input) return;
        updateKpis(null);
        const open = (e) => { if (e) e.preventDefault(); input.click(); };
        pick.addEventListener("click", open);
        dz.addEventListener("click", (e) => { if (e.target.closest("button")) return; open(e); });
        dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") open(e); });
        ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
        ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
        dz.addEventListener("drop", (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(f); });
        input.addEventListener("change", () => { if (input.files && input.files[0]) handleFile(input.files[0]); input.value = ""; });

        $("btn-print").addEventListener("click", () => window.print());
        $("btn-json").addEventListener("click", () => {
            if (!DATA) return;
            const payload = { archivo: DATA.file, fecha: new Date().toISOString(), extraido: DATA, recalculo: RECALC, comparaciones: CMPS };
            download(safeName(DATA.file.replace(/\.xlsx$/i, "")) + "_datos.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
        });
        $("btn-html").addEventListener("click", async () => {
            if (!DATA) return;
            try { download(safeName(DATA.file.replace(/\.xlsx$/i, "")) + "_informe.html", await buildHtmlFile(), "text/html;charset=utf-8"); }
            catch (e) { status("⚠ No se pudo preparar el HTML: " + esc(e.message), "warn"); }
        });
        $("btn-reset").addEventListener("click", () => { DATA = null; RECALC = null; CMPS = []; FILE = null; hideReport(); status(""); resetSteps(); window.scrollTo({ top: 0, behavior: "smooth" }); });

        // Menú hamburguesa (las páginas de cálculo lo hacen con app.js; acá no se carga).
        const navToggle = $("nav-toggle"), navLinks = $("nav-links");
        if (navToggle && navLinks) {
            navToggle.addEventListener("click", () => navLinks.classList.toggle("open"));
            document.querySelectorAll(".nav-dd > a").forEach((a) => a.addEventListener("click", (e) => {
                if (window.innerWidth <= 860) { e.preventDefault(); a.parentElement.classList.toggle("open"); }
            }));
        }
        // Autoguardado de integrantes (solo en este navegador).
        try {
            const a = $("authors");
            if (a) { a.value = localStorage.getItem("sh-excel-authors") || ""; a.addEventListener("input", () => localStorage.setItem("sh-excel-authors", a.value)); }
        } catch (e) { /* noop */ }
    }

    window.IEUI = { handleFile, state: () => ({ data: DATA, recalc: RECALC, comparisons: CMPS }) };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
    else setup();
})();
