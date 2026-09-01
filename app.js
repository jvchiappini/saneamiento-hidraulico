"use strict";

/* ================= Pagina actual ================= */
const PAGE = document.body.dataset.page || "index";

/* ================= Estado de entrada ================= */
const S = {
    manzanas: 12, lotes: 6, pisos: 22, deptos: 6, dorm: 3, persDorm: 2, persServ: 1, pctLog: 10,
    qDept: 200, qLog: 50,
    k1: 1.2, k2: 1.5, k3: 1.05,
    horasOp: 12,
    lSucc: 2, lImp: 669.35,
    hTopoSucc: 2, hTopoImp: 9,
    pReservorio: 0.5,
    altSucc: [550, 500, 350],
    altImp: [500, 450, 300],
    etaB: [0.88, 0.88, 0.88],
    etaM: [0.88, 0.88, 0.9],
};

// Parametros economicos del algoritmo de minimo costo
const Sopt = {
    pipeA: 40, pipeB: 0.4, kwh: 0.06, pumpCost: 300, rate: 8, maint: 2,
};

// Diametros comerciales considerados por el algoritmo (disponibles en Tabla 3)
const CAND_DN = [100, 125, 150, 200, 250, 300, 350, 400, 450, 500];

/* ================= Persistencia ================= */
const LS_KEY = "sh-state-v1";
function loadState() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const o = JSON.parse(raw);
            Object.assign(S, o.S || {});
            Object.assign(Sopt, o.Sopt || {});
        }
    } catch (e) { /* noop */ }
}
function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ S, Sopt })); } catch (e) { /* noop */ }
}

/* ================= Utilidades ================= */
const $ = (id) => document.getElementById(id);

function f(n, d = 2) {
    if (n == null || isNaN(n)) return "—";
    const opts = { minimumFractionDigits: 0, maximumFractionDigits: d };
    if (d >= 5) { opts.minimumFractionDigits = d; }
    return Number(n).toLocaleString("es-AR", opts);
}
const f0 = (n) => f(n, 0);

function nf(input) {
    const v = parseFloat(input.value.replace(",", "."));
    return isNaN(v) ? 0 : v;
}

function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ================= Coeficientes y rendimientos ================= */
function coeff(dn) {
    const exact = TABLE3.find((r) => r.dn === dn);
    if (exact) return { row: exact, approx: false };
    let best = TABLE3[0], bestD = Infinity;
    for (const r of TABLE3) {
        const d = Math.abs(r.dn - dn);
        if (d < bestD) { bestD = d; best = r; }
    }
    return { row: best, approx: true, dn };
}

function nextStd(v) {
    return MOTOR_STD.find((s) => s >= v - 1e-9) ?? MOTOR_STD[MOTOR_STD.length - 1];
}

function parseHP(s) {
    if (typeof s === "number") return s;
    const parts = String(s).trim().split(/\s+/);
    let v = parseFloat(parts[0]) || 0;
    for (let i = 1; i < parts.length; i++) {
        const [num, den] = parts[i].split("/");
        if (den) v += parseFloat(num) / parseFloat(den);
    }
    return v;
}

function etaBomba(qLps) {
    let best = TABLE6[0], bestD = 1e9;
    for (const r of TABLE6) {
        const d = Math.abs(r.q - qLps);
        if (d < bestD) { bestD = d; best = r; }
    }
    return best.hb / 100;
}

const T7 = TABLE7.map((r) => ({ hp: parseHP(r.hp), hm: r.hm }));
function etaMotor(hp) {
    const pts = T7;
    if (hp <= pts[0].hp) return pts[0].hm / 100;
    if (hp >= pts[pts.length - 1].hp) return pts[pts.length - 1].hm / 100;
    for (let i = 0; i < pts.length - 1; i++) {
        if (hp >= pts[i].hp && hp <= pts[i + 1].hp) {
            const t = (hp - pts[i].hp) / (pts[i + 1].hp - pts[i].hp);
            return (pts[i].hm + t * (pts[i + 1].hm - pts[i].hm)) / 100;
        }
    }
    return 0.88;
}

/* ================= Calculos base ================= */
function baseCalc() {
    const B3 = S.manzanas, B4 = S.lotes, B5 = S.pisos, B6 = S.deptos, B7 = S.dorm,
          B8 = S.persDorm, B9 = S.persServ, B10 = S.pctLog;

    const B11 = B3 * B4 * (B5 * B6 * (B7 * B8 + B9));
    const B12 = (B6 * B5) * B10 / 100 * B4 * B3;
    const B15 = B11 * S.qDept + B12 * S.qLog;
    const B16 = B15 / 1000;
    const B17 = B15 / 86400;
    const B18 = B15 / (B3 * B4);
    const B19 = B18 / 86400;
    const B23 = S.k1 * S.k3 * B16 / 86400;
    const D23 = B23 * 1000;
    const B26 = 1.3 * Math.pow(B23, 0.5) * Math.pow(S.horasOp / 24, 1 / 4);

    return { B11, B12, B15, B16, B17, B18, B19, B23, D23, B26 };
}

/* ================= Metricas de una alternativa ================= */
function altMetrics(b, dS, dI, etaB, etaM) {
    const B23 = b.B23;
    const vS = B23 / (Math.PI * Math.pow(dS / 1000, 2) / 4);
    const vI = B23 / (Math.PI * Math.pow(dI / 1000, 2) / 4);
    const JS = Math.pow(B23 / (27.113 * Math.pow(dS / 1000, 2.596)), 1 / 0.532);
    const JI = Math.pow(B23 / (27.113 * Math.pow(dI / 1000, 2.596)), 1 / 0.532);

    const cS = coeff(dS), cI = coeff(dI);
    const leqS = cS.row.valvPie + cS.row.curva90 * 2 + cS.row.tee2 + cS.row.valvCierre;
    const leqI = cI.row.curva90 + cI.row.valvRet + cI.row.valvCierre + cI.row.teeLateral;

    const hS = S.hTopoSucc + (S.lSucc + leqS) * JS + vS * vS / 19.6;
    const hI = S.hTopoImp + (S.lImp + leqI) * JI + vI * vI / 19.6;
    const hT = hS + hI + S.pReservorio;

    const Pb = 1000 * hT * B23 / 75 / etaB;
    const HP = 1.014 * Pb;
    const Pmb = HP / etaM;
    const holg = Pmb <= 2 ? 0.5 : Pmb <= 5 ? 0.3 : Pmb <= 10 ? 0.2 : Pmb <= 20 ? 0.15 : 0.10;
    const Phmb = (1 + holg) * Pmb;
    const Padop = nextStd(Phmb);

    const hCav = vS * vS / 19.6 + 0.2;
    const hSeg = 0.5;
    const hPozo = Math.max(hCav, hSeg);

    return {
        dS, dI, vS, vI, JS, JI,
        cS, cI, leqS, leqI,
        hS, hI, hT,
        etaB, etaM, Pb, HP, Pmb, holg, Phmb, Padop,
        hCav, hSeg, hPozo,
        vCheckS: vS >= 0.7 && vS <= 4.0,
        vCheckI: vI >= 0.7 && vI <= 4.0,
        vLowS: vS < 0.5, vLowI: vI < 0.5,
    };
}

function calc() {
    const b = baseCalc();
    const alts = S.altSucc.map((dS, i) => altMetrics(b, dS, S.altImp[i], S.etaB[i], S.etaM[i]));
    return { ...b, alts };
}

/* ================= Algoritmo de minimo costo ================= */
function annFactor(n) {
    const i = Sopt.rate / 100;
    const fm = Math.pow(1 + i, n);
    return i * fm / (fm - 1);
}

function optimalRows(b) {
    const i = Sopt.rate / 100;
    const ann = (n) => { const fm = Math.pow(1 + i, n); return i * fm / (fm - 1); };
    const etaB = etaBomba(b.D23);
    const rows = [];

    for (const dn of CAND_DN) {
        const succ = CAND_DN.find((s) => s > dn);
        if (!succ) continue;

        let etaM = 0.88, m = null;
        for (let k = 0; k < 3; k++) {
            m = altMetrics(b, succ, dn, etaB, etaM);
            etaM = etaMotor(m.Pmb);
        }

        if (!m.vCheckS || !m.vCheckI) continue;

        const pipeCost = (Sopt.pipeA + Sopt.pipeB * dn) * (S.lImp + S.lSucc);
        const pumpInv = Sopt.pumpCost * m.Padop;
        const energyKWh = m.Pmb * 0.7457 * S.horasOp * 365;
        const energy = energyKWh * Sopt.kwh;
        const maint = (pipeCost + pumpInv) * Sopt.maint / 100;
        const annual = pipeCost * ann(50) + pumpInv * ann(7) + energy + maint;

        rows.push({ dn, succ, m, etaB, etaM, pipeCost, pumpInv, energyKWh, energy, maint, annual });
    }

    rows.sort((x, y) => x.annual - y.annual);
    return rows;
}

/* ================= Formularios ================= */
const DATOS_FIELDS = [
    { id: "manzanas", label: "Manzanas del barrio", unit: "" },
    { id: "lotes", label: "Lotes / edificios por manzana", unit: "" },
    { id: "pisos", label: "Pisos tipo por edificio", unit: "" },
    { id: "deptos", label: "Departamentos por piso", unit: "" },
    { id: "dorm", label: "Dormitorios por departamento", unit: "" },
    { id: "persDorm", label: "Personas por dormitorio", unit: "" },
    { id: "persServ", label: "Personal de servicio por depto", unit: "" },
    { id: "pctLog", label: "Personal de logística por lote", unit: "%" },
];

const CAUDAL_FIELDS = [
    { id: "qDept", label: "Caudal unitario departamentos", unit: "l/pers/d" },
    { id: "qLog", label: "Caudal unitario logística", unit: "l/pers/d" },
];

const BOMBEO_FIELDS = [
    { id: "k1", label: "K1 — Consumo máx. diario", unit: "" },
    { id: "k2", label: "K2 — Consumo máx. horario", unit: "" },
    { id: "k3", label: "K3 — Línea de impulsión", unit: "" },
    { id: "horasOp", label: "Horas de operación de la bomba", unit: "hs/d" },
];

const OPT_FIELDS = [
    { id: "pipeA", label: "Costo base de tubería", unit: "$/m" },
    { id: "pipeB", label: "Costo por mm de diámetro", unit: "$/m·mm" },
    { id: "kwh", label: "Costo de la energía", unit: "$/kWh" },
    { id: "pumpCost", label: "Costo de la bomba", unit: "$/HP" },
    { id: "rate", label: "Tasa de descuento", unit: "%/año" },
    { id: "maint", label: "Mantenimiento", unit: "%/año" },
];

const GEOM_FIELDS = [
    { id: "lSucc", label: "Longitud de tubería de succión", unit: "m" },
    { id: "lImp", label: "Longitud de tubería de impulsión", unit: "m" },
    { id: "hTopoSucc", label: "Altura topográfica de succión", unit: "m" },
    { id: "hTopoImp", label: "Altura topográfica de impulsión", unit: "m" },
    { id: "pReservorio", label: "Presión de llegada al reservorio", unit: "m" },
];

function renderField(field, src = S) {
    const val = src[field.id];
    return `
    <div class="field">
        <label>${esc(field.label)}</label>
        <div class="input-row">
            <input type="number" inputmode="decimal" id="in-${field.id}" value="${val}"
                   step="any" min="0">
            ${field.unit ? `<span class="unit">${esc(field.unit)}</span>` : ""}
        </div>
    </div>`;
}

function bind(id, setter) {
    const el = $("in-" + id);
    if (!el) return;
    el.addEventListener("input", () => { setter(nf(el)); saveState(); scheduleRecompute(); });
}

function renderDatos() {
    const host = $("datos-form");
    if (!host) return;
    host.innerHTML = DATOS_FIELDS.map((fd) => renderField(fd)).join("");
    DATOS_FIELDS.forEach((fd) => bind(fd.id, (v) => S[fd.id] = v));
}

function renderCaudalUnitario() {
    const host = $("caudales-unitarios-form");
    if (!host) return;
    host.innerHTML = CAUDAL_FIELDS.map((fd) => renderField(fd)).join("");
    CAUDAL_FIELDS.forEach((fd) => bind(fd.id, (v) => S[fd.id] = v));
}

function renderBombeoForm() {
    const host = $("bombeo-form");
    if (!host) return;
    host.innerHTML = BOMBEO_FIELDS.map((fd) => renderField(fd)).join("");
    BOMBEO_FIELDS.forEach((fd) => bind(fd.id, (v) => S[fd.id] = v));
}

function renderOptForm() {
    const host = $("opt-form");
    if (!host) return;
    host.innerHTML = OPT_FIELDS.map((fd) => renderField(fd, Sopt)).join("");
    OPT_FIELDS.forEach((fd) => bind(fd.id, (v) => Sopt[fd.id] = v));
}

function renderGeomForm() {
    const host = $("geom-form");
    if (!host) return;
    host.innerHTML = GEOM_FIELDS.map((fd) => renderField(fd)).join("");
    GEOM_FIELDS.forEach((fd) => bind(fd.id, (v) => S[fd.id] = v));
}

/* ================= Recalculo con debounce ================= */
let _timer = null, _restore = null;
function scheduleRecompute() {
    const ae = document.activeElement;
    if (ae && ae.id) _restore = { id: ae.id };
    clearTimeout(_timer);
    _timer = setTimeout(() => { renderAll(); doRestore(); }, 220);
}
function doRestore() {
    if (!_restore) return;
    const el = document.getElementById(_restore.id);
    if (el) {
        el.focus();
        const l = el.value.length;
        try { el.setSelectionRange(l, l); } catch (e) { /* noop */ }
    }
    _restore = null;
}

/* ================= Render: resultados ================= */
function renderAll() {
    const r = calc();
    renderHero(r);
    renderResumen(r);
    renderCaudales(r);
    renderBombeo(r);
    renderAlternativas(r);
    renderPerdidas(r);
    renderAltura(r);
    renderPotencia(r);
    renderPozo(r);
    renderReferencias(r);
    renderInforme(r);
    renderFormulas();
}

function kpi(label, value, unit) {
    return `<div class="kpi"><div class="kpi-label">${esc(label)}</div>
            <div class="kpi-value">${value}${unit ? ` <small>${esc(unit)}</small>` : ""}</div></div>`;
}

function renderHero(r) {
    const host = $("hero-kpis");
    if (!host) return;
    const hm1 = r.alts[0].hT;
    const padop1 = r.alts[0].Padop;
    host.innerHTML =
        kpi("Caudal de bombeo", f(r.D23, 2), "l/s") +
        kpi("Diam. Bresse", "≈ " + f(r.B26 * 1000, 0), "mm") +
        kpi("Alt. manométrica (Alt 1)", f(hm1, 2), "m.c.a.") +
        kpi("Potencia adoptada (Alt 1)", f(padop1, 0), "HP");
}

function renderResumen(r) {
    const host = $("resumen-content");
    if (!host) return;
    const rows = optimalRows(r);
    const cards = r.alts.map((a, i) => `
        <div class="res-card">
            <div class="res-card-title">Alternativa ${i + 1}</div>
            <div class="res-card-sub">Suc ${a.dS} / Imp ${a.dI} mm</div>
            <div class="res-card-main">${f(a.hT, 2)} <small>m.c.a.</small></div>
            <div class="res-card-foot">${f(a.Padop, 0)} HP adoptados</div>
        </div>`).join("");
    const opt = rows[0] ? `
        <div class="res-card res-opt">
            <div class="res-card-title">Óptima (algoritmo)</div>
            <div class="res-card-sub">Suc ${rows[0].succ} / Imp ${rows[0].dn} mm</div>
            <div class="res-card-main">${f0(rows[0].annual)} <small>$/año</small></div>
            <div class="res-card-foot">${f(rows[0].m.hT, 2)} m.c.a. · ${f(rows[0].m.Padop, 0)} HP</div>
        </div>` : "";
    host.innerHTML = `<div class="res-grid">${cards}${opt}</div>
        <p class="footnote">Detalle completo en la sección <a href="#alternativas">Alternativas de diámetro ↓</a></p>`;
}

function formulaBox(label, eq) {
    return `<div class="formula-box"><span class="eq">${esc(label)}</span>&nbsp; ${esc(eq)}</div>`;
}

function renderCaudales(r) {
    const host = $("caudales-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            <div class="result-row"><span class="r-label">Total personas de los departamentos</span>
                <span class="r-value">${f0(r.B11)} <small>pers</small></span></div>
            <div class="result-row"><span class="r-label">Personal de logística</span>
                <span class="r-value">${f0(r.B12)} <small>pers</small></span></div>
            <div class="result-row highlight"><span class="r-label">Caudal medio de bombeo (Q<sub>m</sub>)</span>
                <span class="r-value">${f0(r.B15)} <small>l/d</small></span></div>
            <div class="result-row"><span class="r-label">Q<sub>m</sub> en m³/d</span>
                <span class="r-value">${f(r.B16, 2)} <small>m³/d</small></span></div>
            <div class="result-row"><span class="r-label">Q<sub>m</sub> en l/s</span>
                <span class="r-value">${f(r.B17, 2)} <small>l/s</small></span></div>
            <div class="result-row"><span class="r-label">Caudal por lote</span>
                <span class="r-value">${f0(r.B18)} <small>l/d</small></span></div>
            <div class="result-row"><span class="r-label">Caudal por lote</span>
                <span class="r-value">${f(r.B19, 2)} <small>l/s</small></span></div>
        </div>`;
}

function renderBombeo(r) {
    const host = $("bombeo-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            <div class="result-row highlight"><span class="r-label">Caudal de bombeo (Q<sub>b</sub>)</span>
                <span class="r-value">${f(r.B23, 4)} <small>m³/s</small></span></div>
            <div class="result-row highlight"><span class="r-label">Caudal de bombeo</span>
                <span class="r-value">${f(r.D23, 2)} <small>l/s</small></span></div>
            <div class="result-row"><span class="r-label">Horas de operación de la bomba</span>
                <span class="r-value">${f(S.horasOp, 1)} <small>hs/d</small></span></div>
            <div class="result-row highlight"><span class="r-label">Diámetro de impulsión (Bresse)</span>
                <span class="r-value">${f(r.B26, 3)} m ≈ ${f(r.B26 * 1000, 0)} <small>mm</small></span></div>
        </div>
        <p class="footnote">Alrededor del valor de Bresse se eligen tres diámetros comerciales, uno de los cuales se adoptará por mínimo costo.</p>`;
}

function vBadge(ok, low) {
    if (!ok) return `<span class="badge-state ${low ? "warn" : "fail"}">${low ? "velocidad baja" : "fuera de rango"}</span>`;
    return `<span class="badge-state ok">✓ verifica</span>`;
}

function metricsHTML(a) {
    return `
        <div class="metric"><span class="m-label">v succión</span>
            <span class="m-value">${f(a.vS, 2)} m/s ${vBadge(a.vCheckS, a.vLowS)}</span></div>
        <div class="metric"><span class="m-label">v impulsión</span>
            <span class="m-value">${f(a.vI, 2)} m/s ${vBadge(a.vCheckI, a.vLowI)}</span></div>
        <div class="metric"><span class="m-label">J succión</span>
            <span class="m-value">${f(a.JS, 5)} <small>m/m</small></span></div>
        <div class="metric"><span class="m-label">J impulsión</span>
            <span class="m-value">${f(a.JI, 5)} <small>m/m</small></span></div>
        <div class="metric"><span class="m-label">Leq succión</span>
            <span class="m-value">${f(a.leqS, 1)} <small>m</small></span></div>
        <div class="metric"><span class="m-label">Leq impulsión</span>
            <span class="m-value">${f(a.leqI, 1)} <small>m</small></span></div>`;
}

function renderAlternativas(r) {
    const host = $("alternativas-content");
    if (!host) return;

    const rows = optimalRows(r);
    const best = rows[0];

    const manual = r.alts.map((a, i) => `
        <div class="alt-card">
            <div class="alt-head">
                <span class="alt-title">Alternativa ${i + 1}</span>
                <span class="alt-badge">Suc ${a.dS} / Imp ${a.dI} mm</span>
            </div>
            <div class="alt-body">
                <div class="alt-diams">
                    <div class="field"><label>Succión (mm)</label>
                        <input type="number" id="in-altS-${i}" value="${a.dS}" step="1" min="13" inputmode="decimal"></div>
                    <div class="field"><label>Impulsión (mm)</label>
                        <input type="number" id="in-altI-${i}" value="${a.dI}" step="1" min="13" inputmode="decimal"></div>
                </div>
                <div class="alt-diams">
                    <div class="field"><label>η bomba</label>
                        <input type="number" id="in-etaB-${i}" value="${a.etaB}" step="0.01" min="0" max="1" inputmode="decimal"></div>
                    <div class="field"><label>η motor</label>
                        <input type="number" id="in-etaM-${i}" value="${a.etaM}" step="0.01" min="0" max="1" inputmode="decimal"></div>
                </div>
                ${metricsHTML(a)}
            </div>
            <div class="alt-foot">
                <div class="big-result"><span class="br-label">Altura manométrica total</span>
                    <span class="br-value">${f(a.hT, 2)} <small>m.c.a.</small></span></div>
                <div class="big-result" style="margin-top:.3rem"><span class="br-label">Potencia adoptada</span>
                    <span class="br-value">${f(a.Padop, 0)} <small>HP</small></span></div>
            </div>
        </div>`).join("");

    const optCard = best ? `
        <div class="alt-card alt-opt">
            <div class="alt-head">
                <span class="alt-title">Alternativa óptima</span>
                <span class="alt-badge opt-badge">ALGORITMO</span>
            </div>
            <div class="alt-body">
                <p class="opt-desc">Elegida por <strong>mínimo costo anualizado</strong> entre todos los diámetros que verifican velocidad.</p>
                <div class="alt-diams">
                    <div class="field"><label>Succión (mm)</label>
                        <input type="number" value="${best.m.dS}" disabled></div>
                    <div class="field"><label>Impulsión (mm)</label>
                        <input type="number" value="${best.m.dI}" disabled></div>
                </div>
                ${metricsHTML(best.m)}
            </div>
            <div class="alt-foot">
                <div class="big-result"><span class="br-label">Altura manométrica total</span>
                    <span class="br-value">${f(best.m.hT, 2)} <small>m.c.a.</small></span></div>
                <div class="big-result" style="margin-top:.3rem"><span class="br-label">Potencia adoptada</span>
                    <span class="br-value">${f(best.m.Padop, 0)} <small>HP</small></span></div>
                <div class="big-result opt-cost" style="margin-top:.3rem"><span class="br-label">Costo anual total</span>
                    <span class="br-value">${f0(best.annual)} <small>$/año</small></span></div>
            </div>
        </div>` : "";

    host.innerHTML = manual + optCard;

    for (let i = 0; i < r.alts.length; i++) {
        const s = $("in-altS-" + i), im = $("in-altI-" + i), b = $("in-etaB-" + i), m = $("in-etaM-" + i);
        s.addEventListener("input", () => { S.altSucc[i] = nf(s); saveState(); scheduleRecompute(); });
        im.addEventListener("input", () => { S.altImp[i] = nf(im); saveState(); scheduleRecompute(); });
        b.addEventListener("input", () => { S.etaB[i] = nf(b); saveState(); scheduleRecompute(); });
        m.addEventListener("input", () => { S.etaM[i] = nf(m); saveState(); scheduleRecompute(); });
    }

    renderOptResult(r);
}

function renderOptResult(r) {
    const host = $("opt-result");
    if (!host) return;
    const rows = optimalRows(r);
    if (!rows.length) {
        host.innerHTML = `<p class="footnote">Ningún diámetro comercial verifica las velocidades (0,7–4,0 m/s) con estos parámetros.</p>`;
        if ($("opt-chart")) $("opt-chart").innerHTML = "";
        if ($("comp-chart")) $("comp-chart").innerHTML = "";
        return;
    }
    const best = rows[0];
    host.innerHTML = `
        <div class="table-wrap">
            <table>
                <thead><tr>
                    <th>DN Imp (mm)</th><th>DN Suc (mm)</th><th>v imp (m/s)</th><th>Hm (m.c.a.)</th>
                    <th>P motor (HP)</th><th>Padop (HP)</th><th>Inv. tubería ($)</th><th>Inv. bomba ($)</th>
                    <th>Energía ($/año)</th><th>Costo anual ($)</th>
                </tr></thead>
                <tbody>
                ${rows.map((row, i) => `
                    <tr class="${i === 0 ? "winner-row" : ""}">
                        <td><strong>${row.dn}</strong></td><td>${row.succ}</td>
                        <td>${f(row.m.vI, 2)}</td><td>${f(row.m.hT, 2)}</td>
                        <td>${f(row.m.Pmb, 1)}</td><td>${f(row.m.Padop, 0)}</td>
                        <td>${f0(row.pipeCost)}</td><td>${f0(row.pumpInv)}</td>
                        <td>${f0(row.energy)}</td><td><strong>${f0(row.annual)}</strong></td>
                    </tr>`).join("")}
                </tbody>
            </table>
        </div>
        <p class="footnote">
            Se adopta <strong>impulsión DN ${best.dn} mm</strong> con <strong>succión DN ${best.succ} mm</strong>.
            Costo de tubería = ${Sopt.pipeA}+${Sopt.pipeB}·DN $/m · energía ${Sopt.kwh} $/kWh · tasa ${Sopt.rate}% ·
            mantenimiento ${Sopt.maint}% · η<sub>bomba</sub> ${f(best.etaB * 100, 0)}% (Tabla 6) · η<sub>motor</sub> ${f(best.etaM * 100, 1)}% (Tabla 7).
            Vida útil: tubería 50 años, bomba 7 años.
        </p>`;

    const optEl = $("opt-chart");
    if (optEl) {
        optEl.innerHTML = paretoSVG(
            "Costo anual por diámetro ($/año)",
            rows.map((row) => ({ label: row.dn, value: row.annual, hl: row === best })),
            "Mínimo (óptimo)"
        );
    }
    const compEl = $("comp-chart");
    if (compEl) {
        compEl.innerHTML = paretoSVG(
            `Composición del costo anual — DN ${best.dn} mm ($/año)`,
            [
                { label: "Tubería", value: best.pipeCost * annFactor(50) },
                { label: "Energía", value: best.energy },
                { label: "Bomba", value: best.pumpInv * annFactor(7) },
                { label: "Manten.", value: best.maint },
            ],
            "Mayor componente"
        );
    }
}

/* ================= Diagramas de Pareto ================= */
function paretoSVG(title, items, hlLabel) {
    if (!items.length) return "";
    const n = items.length;
    const W = 560, H = 300, mT = 22, mB = 34, mL = 8, mR = 12;
    const pw = W - mL - mR, ph = H - mT - mB;
    const maxV = Math.max(...items.map((i) => i.value));
    const total = items.reduce((a, i) => a + i.value, 0);
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const bw = pw / n * 0.62;

    let cum = 0, bars = "", pts = [];
    sorted.forEach((it, idx) => {
        const x = mL + idx * (pw / n) + (pw / n - bw) / 2;
        const h = it.value / maxV * ph;
        const y = mT + ph - h;
        cum += it.value;
        const cp = cum / total * 100;
        const cx = mL + idx * (pw / n) + pw / n / 2;
        pts.push([cx, mT + ph - cp / 100 * ph]);
        bars += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3"
            fill="${it.hl ? "var(--accent)" : "var(--primary)"}">
            <title>${esc(it.label)}: ${f0(it.value)} $/año</title></rect>
            <text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" class="bar-val">${f0(it.value)}</text>
            <text x="${x + bw / 2}" y="${H - mB + 15}" text-anchor="middle" class="bar-label">${esc(it.label)}</text>`;
    });

    const line = pts.map((p, k) => `${k ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    let grid = "";
    for (let g = 0; g <= 100; g += 25) {
        const y = mT + ph - g / 100 * ph;
        grid += `<line x1="${mL}" y1="${y}" x2="${W - mR}" y2="${y}" class="grid-line"/>
            <text x="${W - mR + 5}" y="${y + 3}" class="axis-right">${g}</text>`;
    }

    return `<div class="chart-wrap">
        <svg viewBox="0 0 ${W} ${H}" class="pareto" role="img" aria-label="${esc(title)}">
            ${grid}
            ${bars}
            <polyline points="${line}" class="cum-line"/>
            ${pts.map((p, k) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${k === pts.length - 1 ? 4 : 2.5}" class="cum-dot"/>`).join("")}
            <text x="${mL}" y="${mT - 6}" class="chart-title">${esc(title)}</text>
            <text x="${W - mR}" y="${mT - 6}" text-anchor="end" class="chart-title">Acumulado %</text>
        </svg>
        <div class="chart-legend">
            <span><i class="lg lg-teal"></i> Valor</span>
            <span><i class="lg lg-amber"></i> ${esc(hlLabel)}</span>
            <span><i class="lg lg-line"></i> % acumulado</span>
        </div>
    </div>`;
}

function renderPerdidas(r) {
    const host = $("perdidas-content");
    if (!host) return;
    const pick = (key) => r.alts.map((a) => f(a.cS.row[key], 1)).join("</td><td>");
    const pickI = (key) => r.alts.map((a) => f(a.cI.row[key], 1)).join("</td><td>");
    host.innerHTML = `
        <div class="table-wrap">
            <table>
                <thead><tr><th>Longitudes equivalentes (Tabla 3 · Norma 68)</th>
                    <th>Alt 1<br><small>Suc ${r.alts[0].dS} / Imp ${r.alts[0].dI}</small></th>
                    <th>Alt 2<br><small>Suc ${r.alts[1].dS} / Imp ${r.alts[1].dI}</small></th>
                    <th>Alt 3<br><small>Suc ${r.alts[2].dS} / Imp ${r.alts[2].dI}</small></th></tr></thead>
                <tbody>
                    <tr><td>Válvula de pie</td><td>${pick("valvPie")}</td></tr>
                    <tr><td>Curva 90°</td><td>${pick("curva90")}</td></tr>
                    <tr><td>Tee 2 salidas</td><td>${pick("tee2")}</td></tr>
                    <tr><td>Válvula de cierre</td><td>${pick("valvCierre")}</td></tr>
                    <tr class="total-row"><td><strong>Leq succión total</strong></td><td><strong>${r.alts.map((a) => f(a.leqS, 1)).join("</strong></td><td><strong>")}</strong></td></tr>
                    <tr><td colspan="4" class="sep"></td></tr>
                    <tr><td>Curva 90°</td><td>${pickI("curva90")}</td></tr>
                    <tr><td>Válvula de retención</td><td>${pickI("valvRet")}</td></tr>
                    <tr><td>Válvula de cierre</td><td>${pickI("valvCierre")}</td></tr>
                    <tr><td>Tee lateral</td><td>${pickI("teeLateral")}</td></tr>
                    <tr class="total-row"><td><strong>Leq impulsión total</strong></td><td><strong>${r.alts.map((a) => f(a.leqI, 1)).join("</strong></td><td><strong>")}</strong></td></tr>
                </tbody>
            </table>
        </div>
        <div class="table-wrap">
            <table>
                <thead><tr><th>Pérdidas por fricción (Fair–Whipple–Hsiao · acero galvanizado)</th>
                    <th>Alt 1</th><th>Alt 2</th><th>Alt 3</th></tr></thead>
                <tbody>
                    <tr><td>J succión (m/m)</td><td>${f(r.alts[0].JS, 5)}</td><td>${f(r.alts[1].JS, 5)}</td><td>${f(r.alts[2].JS, 5)}</td></tr>
                    <tr><td>J impulsión (m/m)</td><td>${f(r.alts[0].JI, 5)}</td><td>${f(r.alts[1].JI, 5)}</td><td>${f(r.alts[2].JI, 5)}</td></tr>
                </tbody>
            </table>
        </div>
        <p class="footnote">Las longitudes equivalentes se suman a la longitud real de tubería y se multiplican por la pendiente J para obtener la pérdida de carga en metros.</p>`;
}

function renderAltura(r) {
    const host = $("altura-content");
    if (!host) return;
    host.innerHTML = `
        <div class="table-wrap">
            <table>
                <thead><tr><th>Componente</th><th>Alt 1</th><th>Alt 2</th><th>Alt 3</th></tr></thead>
                <tbody>
                    <tr><td>Altura topográfica — succión (m)</td>
                        <td>${f(S.hTopoSucc, 2)}</td><td>${f(S.hTopoSucc, 2)}</td><td>${f(S.hTopoSucc, 2)}</td></tr>
                    <tr><td>Altura topográfica — impulsión (m)</td>
                        <td>${f(S.hTopoImp, 2)}</td><td>${f(S.hTopoImp, 2)}</td><td>${f(S.hTopoImp, 2)}</td></tr>
                    <tr><td>Pérdidas en succión (m.c.a.)</td>
                        <td>${f(r.alts[0].hS - S.hTopoSucc, 2)}</td><td>${f(r.alts[1].hS - S.hTopoSucc, 2)}</td><td>${f(r.alts[2].hS - S.hTopoSucc, 2)}</td></tr>
                    <tr><td>Pérdidas en impulsión (m.c.a.)</td>
                        <td>${f(r.alts[0].hI - S.hTopoImp, 2)}</td><td>${f(r.alts[1].hI - S.hTopoImp, 2)}</td><td>${f(r.alts[2].hI - S.hTopoImp, 2)}</td></tr>
                    <tr><td>Presión de llegada al reservorio (m)</td>
                        <td>${f(S.pReservorio, 2)}</td><td>${f(S.pReservorio, 2)}</td><td>${f(S.pReservorio, 2)}</td></tr>
                    <tr class="total-row"><td><strong>Altura manométrica total (m.c.a.)</strong></td>
                        <td><strong>${f(r.alts[0].hT, 2)}</strong></td><td><strong>${f(r.alts[1].hT, 2)}</strong></td><td><strong>${f(r.alts[2].hT, 2)}</strong></td></tr>
                </tbody>
            </table>
        </div>
        <p class="footnote">Hm = altura topográfica + (L + Leq)·J + v²/2g. La succión corresponde al tramo entre la fuente y la bomba; la impulsión, entre la bomba y el reservorio.</p>`;
}

function renderPotencia(r) {
    const host = $("potencia-content");
    if (!host) return;
    host.innerHTML = `
        <div class="table-wrap">
            <table>
                <thead><tr><th>Parámetro</th><th>Alt 1</th><th>Alt 2</th><th>Alt 3</th></tr></thead>
                <tbody>
                    <tr><td>Potencia hidráulica — Pb (cv)</td>
                        <td>${f(r.alts[0].Pb, 2)}</td><td>${f(r.alts[1].Pb, 2)}</td><td>${f(r.alts[2].Pb, 2)}</td></tr>
                    <tr><td>Potencia al freno — P (HP)</td>
                        <td>${f(r.alts[0].HP, 2)}</td><td>${f(r.alts[1].HP, 2)}</td><td>${f(r.alts[2].HP, 2)}</td></tr>
                    <tr><td>Rendimiento de la bomba — η<sub>bomba</sub></td>
                        <td>${f(r.alts[0].etaB * 100, 0)}%</td><td>${f(r.alts[1].etaB * 100, 0)}%</td><td>${f(r.alts[2].etaB * 100, 0)}%</td></tr>
                    <tr><td>Potencia del motor — P<sub>mb</sub> (HP)</td>
                        <td>${f(r.alts[0].Pmb, 2)}</td><td>${f(r.alts[1].Pmb, 2)}</td><td>${f(r.alts[2].Pmb, 2)}</td></tr>
                    <tr><td>Rendimiento del motor — η<sub>motor</sub></td>
                        <td>${f(r.alts[0].etaM * 100, 0)}%</td><td>${f(r.alts[1].etaM * 100, 0)}%</td><td>${f(r.alts[2].etaM * 100, 0)}%</td></tr>
                    <tr><td>Holgura por potencia</td>
                        <td>${f(r.alts[0].holg * 100, 0)}%</td><td>${f(r.alts[1].holg * 100, 0)}%</td><td>${f(r.alts[2].holg * 100, 0)}%</td></tr>
                    <tr><td>Potencia con holgura — P<sub>hmb</sub> (HP)</td>
                        <td>${f(r.alts[0].Phmb, 2)}</td><td>${f(r.alts[1].Phmb, 2)}</td><td>${f(r.alts[2].Phmb, 2)}</td></tr>
                    <tr class="total-row"><td><strong>Potencia adoptada (Tabla 8)</strong></td>
                        <td><strong>${f(r.alts[0].Padop, 0)} HP</strong></td><td><strong>${f(r.alts[1].Padop, 0)} HP</strong></td><td><strong>${f(r.alts[2].Padop, 0)} HP</strong></td></tr>
                </tbody>
            </table>
        </div>
        <p class="footnote">Pb = 1000·Hm·Qb/75·ηbomba · P = 1,014·Pb · P<sub>mb</sub> = P/ηmotor · Holgura según potencia: 50% (≤2 HP), 30% (2–5), 20% (5–10), 15% (10–20), 10% (&gt;20 HP).</p>`;
}

function renderPozo(r) {
    const host = $("pozo-content");
    if (!host) return;
    host.innerHTML = `
        <div class="table-wrap">
            <table>
                <thead><tr><th>Parámetro</th><th>Alt 1</th><th>Alt 2</th><th>Alt 3</th></tr></thead>
                <tbody>
                    <tr><td>Altura por cavitación — v²/2g + 0,2 (m)</td>
                        <td>${f(r.alts[0].hCav, 3)}</td><td>${f(r.alts[1].hCav, 3)}</td><td>${f(r.alts[2].hCav, 3)}</td></tr>
                    <tr><td>Altura por seguridad (m)</td>
                        <td>${f(r.alts[0].hSeg, 2)}</td><td>${f(r.alts[1].hSeg, 2)}</td><td>${f(r.alts[2].hSeg, 2)}</td></tr>
                    <tr class="total-row"><td><strong>Altura mínima del agua sobre la criba (m)</strong></td>
                        <td><strong>${f(r.alts[0].hPozo, 2)}</strong></td><td><strong>${f(r.alts[1].hPozo, 2)}</strong></td><td><strong>${f(r.alts[2].hPozo, 2)}</strong></td></tr>
                </tbody>
            </table>
        </div>
        <p class="footnote">Se adopta el mayor valor entre la altura por cavitación y la altura de seguridad (0,5 m).</p>`;
}

/* ================= Referencias ================= */
function renderReferencias(r) {
    const t3 = $("tabla3");
    if (t3) {
        const used = new Set(r.alts.flatMap((a) => [a.dS, a.dI]));
        t3.innerHTML = `
            <table>
                <thead><tr>
                    <th>DN (mm)</th><th>Ref</th><th>Curva 90°</th><th>Válv. cierre</th>
                    <th>Tee lateral</th><th>Tee 2 salidas</th><th>Válv. pie</th><th>Válv. retención</th>
                </tr></thead>
                <tbody>
                ${TABLE3.map((row) => `
                    <tr class="${used.has(row.dn) ? "selected-row" : ""}">
                        <td>${row.dn}</td><td>${row.ref}</td>
                        <td>${f(row.curva90, 1)}</td><td>${f(row.valvCierre, 1)}</td>
                        <td>${f(row.teeLateral, 1)}</td><td>${f(row.tee2, 1)}</td>
                        <td>${f(row.valvPie, 1)}</td><td>${f(row.valvRet, 1)}</td>
                    </tr>`).join("")}
                </tbody>
            </table>`;
    }
    const t6 = $("tabla6");
    if (t6) {
        t6.innerHTML = `
            <table>
                <thead><tr><th>Q (l/s)</th><th>η<sub>bomba</sub> (%)</th></tr></thead>
                <tbody>${TABLE6.map((row) => `<tr><td>${f(row.q, 1)}</td><td>${row.hb}</td></tr>`).join("")}</tbody>
            </table>`;
    }
    const t7 = $("tabla7");
    if (t7) {
        t7.innerHTML = `
            <table>
                <thead><tr><th>Motor (HP)</th><th>η<sub>motor</sub> (%)</th></tr></thead>
                <tbody>${TABLE7.map((row) => `<tr><td>${row.hp}</td><td>${f(row.hm, 1)}</td></tr>`).join("")}</tbody>
            </table>`;
    }
}

/* ================= Fórmulas ================= */
function formulaFigure(id) {
    const meta = FORMULA_META[id] || id;
    const fdata = FORMULAS.find((x) => x.id === id);
    const vars = fdata && fdata.vars ? fdata.vars.map(([sym, desc]) =>
        `<li><code>${esc(sym)}</code><span>${esc(desc)}</span></li>`).join("") : "";
    return `
    <figure class="formula" data-fid="${id}">
        <img src="formulas/${id}.svg" alt="${esc(meta)}" loading="lazy">
        <figcaption>
            <span class="f-name">${esc(meta)}</span>
            ${vars ? `<ul class="f-vars">${vars}</ul>` : ""}
        </figcaption>
    </figure>`;
}

function renderFormulas() {
    document.querySelectorAll(".formulas[data-formulas]").forEach((el) => {
        const spec = el.getAttribute("data-formulas").trim();
        if (spec === "all") {
            el.innerHTML = FORMULAS.map((fdata) => formulaFigure(fdata.id)).join("");
        } else {
            el.innerHTML = spec.split(",").map((id) => formulaFigure(id.trim())).join("");
        }
    });
}

/* ================= Toggle de fórmulas ================= */
function setupFormulasToggle() {
    const btn = document.getElementById("toggle-formulas");
    const count = FORMULAS.length;
    if (btn) {
        const apply = (show) => {
            document.body.classList.toggle("show-formulas", show);
            btn.textContent = show ? "Ocultar fórmulas" : `Ver fórmulas (${count})`;
            btn.classList.toggle("on", show);
        };
        btn.addEventListener("click", () => {
            const show = !document.body.classList.contains("show-formulas");
            apply(show);
            try { localStorage.setItem("sh-formulas", show ? "1" : "0"); } catch (e) { /* noop */ }
        });
        let pref = "0";
        try { pref = localStorage.getItem("sh-formulas") || "0"; } catch (e) { /* noop */ }
        if (pref === "1") apply(true);
    }
}

/* ================= Informe técnico ================= */
function collectReportData(r) {
    const rows = optimalRows(r);
    const best = rows[0];
    const fecha = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
    const kv = (l, v, u) => [l, v, u];

    const inputsUrban = [
        kv("Manzanas del barrio", S.manzanas, "manz."),
        kv("Lotes / edificios por manzana", S.lotes, "lotes"),
        kv("Pisos tipo por edificio", S.pisos, "pisos"),
        kv("Departamentos por piso", S.deptos, "deptos"),
        kv("Dormitorios por departamento", S.dorm, "dorm."),
        kv("Personas por dormitorio", S.persDorm, "pers"),
        kv("Personal de servicio por depto.", S.persServ, "pers"),
        kv("Personal de logística por lote", S.pctLog, "%"),
    ];
    const inputsCaud = [
        kv("Caudal unitario — departamentos", S.qDept, "l/pers/d"),
        kv("Caudal unitario — logística", S.qLog, "l/pers/d"),
        kv("K1 — Consumo máx. diario", S.k1, ""),
        kv("K2 — Consumo máx. horario", S.k2, ""),
        kv("K3 — Línea de impulsión", S.k3, ""),
        kv("Horas de operación de la bomba", S.horasOp, "hs/d"),
    ];
    const inputsGeom = [
        kv("Longitud de succión", S.lSucc, "m"),
        kv("Longitud de impulsión", S.lImp, "m"),
        kv("Altura topográfica de succión", S.hTopoSucc, "m"),
        kv("Altura topográfica de impulsión", S.hTopoImp, "m"),
        kv("Presión de llegada al reservorio", S.pReservorio, "m"),
    ];
    const inputsRend = r.alts.map((a, i) =>
        kv(`Rendimiento bomba/motor — Alt ${i + 1}`, `${f(a.etaB * 100, 0)}% / ${f(a.etaM * 100, 0)}%`, ""));
    const inputsEco = [
        kv("Costo base de tubería", "$ " + Sopt.pipeA, "$/m"),
        kv("Costo por mm de diámetro", "$ " + Sopt.pipeB, "$/m·mm"),
        kv("Costo de la energía", "$ " + Sopt.kwh, "$/kWh"),
        kv("Costo de la bomba", "$ " + Sopt.pumpCost, "$/HP"),
        kv("Tasa de descuento", Sopt.rate, "%/año"),
        kv("Mantenimiento", Sopt.maint, "%/año"),
    ];

    const resCaud = [
        kv("Total de personas de los departamentos", f0(r.B11), "pers"),
        kv("Personal de logística", f0(r.B12), "pers"),
        kv("Caudal medio de bombeo (Qm)", f0(r.B15), "l/d"),
        kv("Caudal medio de bombeo", f(r.B16, 2), "m³/d"),
        kv("Caudal medio de bombeo", f(r.B17, 2), "l/s"),
        kv("Caudal por lote", f0(r.B18), "l/d"),
        kv("Caudal por lote", f(r.B19, 2), "l/s"),
    ];
    const resBombeo = [
        kv("Caudal de bombeo (Qb)", f(r.B23, 4), "m³/s"),
        kv("Caudal de bombeo", f(r.D23, 2), "l/s"),
        kv("Diámetro de impulsión (Bresse)", f(r.B26, 3), "m"),
    ];

    const altsData = r.alts.map((a, i) => [
        "Alt " + (i + 1), a.dS, a.dI, f(a.vS, 2), f(a.vI, 2), f(a.JS, 5), f(a.JI, 5),
        f(a.leqS, 1), f(a.leqI, 1), f(a.hT, 2), f(a.Pb, 2), f(a.Pmb, 2), f(a.Padop, 0),
    ]);
    const pozoData = r.alts.map((a, i) => ["Alt " + (i + 1), f(a.hCav, 3), f(a.hSeg, 2), f(a.hPozo, 2)]);
    const optData = best ? [[
        best.dn, best.succ, f(best.m.vI, 2), f(best.m.hT, 2), f(best.m.Pmb, 1), f(best.m.Padop, 0),
        f0(best.pipeCost), f0(best.pumpInv), f0(best.energy), f0(best.annual),
    ]] : [["—"]];

    const conclusion = best
        ? "Se adopta la alternativa óptima: línea de impulsión de DN " + best.dn + " mm con tubería de succión de DN "
          + best.succ + " mm. La altura manométrica resultante es de " + f(best.m.hT, 2) + " m.c.a., con una potencia "
          + "adoptada de " + f(best.m.Padop, 0) + " HP y un costo anual de " + f0(best.annual) + " $/año."
        : "Sin datos suficientes.";

    return {
        r, rows, best, fecha,
        inputsUrban, inputsCaud, inputsGeom, inputsRend, inputsEco,
        resCaud, resBombeo, altsData, pozoData, optData, conclusion,
    };
}

function buildReportHTML(d) {
    const row = (t) => `<tr><td class="pl">${esc(t[0])}</td><td class="pv">${t[1]}</td><td class="pu">${esc(t[2])}</td></tr>`;
    const table = (rows) => `<table>
        <thead><tr><th>Parámetro</th><th>Valor</th><th>Unidad</th></tr></thead>
        <tbody>${rows.map(row).join("")}</tbody></table>`;
    const wide = (head, rows) => `<div class="wide-wrap"><table class="wide">
        <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((c) => `<tr>${c.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

    return `
    <div class="informe">
        <div class="informe-head">
            <div>
                <h3>Informe técnico</h3>
                <p class="informe-sub">Sistema de impulsión — Río · Saneamiento (Norma 68)</p>
            </div>
            <div class="informe-meta">
                <div>Fecha: ${esc(d.fecha)}</div>
                <div>Grupo Nº: ______________</div>
                <div>Integrantes: ______________________</div>
            </div>
        </div>

        <div class="info-sec">
            <h4>1 · Datos de entrada</h4>
            <div class="info-grid">
                <div class="info-card"><h5>Urbanísticos</h5>${table(d.inputsUrban)}</div>
                <div class="info-card"><h5>Caudales unitarios y coeficientes</h5>${table(d.inputsCaud)}</div>
                <div class="info-card"><h5>Geometría</h5>${table(d.inputsGeom)}</div>
                <div class="info-card"><h5>Rendimientos</h5>${table(d.inputsRend)}</div>
                <div class="info-card"><h5>Parámetros económicos</h5>${table(d.inputsEco)}</div>
            </div>
        </div>

        <div class="info-sec">
            <h4>2 · Caudales y bombeo</h4>
            <div class="info-grid">
                <div class="info-card"><h5>Caudales</h5>${table(d.resCaud)}</div>
                <div class="info-card"><h5>Caudal de bombeo y Bresse</h5>${table(d.resBombeo)}</div>
            </div>
        </div>

        <div class="info-sec">
            <h4>3 · Alternativas de diámetro</h4>
            ${wide(["Alt", "Suc (mm)", "Imp (mm)", "v suc (m/s)", "v imp (m/s)", "J suc (m/m)", "J imp (m/m)",
                "Leq suc (m)", "Leq imp (m)", "Hm (m.c.a.)", "Pb (cv)", "P motor (HP)", "Padop (HP)"], d.altsData)}
        </div>

        <div class="info-sec">
            <h4>4 · Alternativa óptima (mínimo costo anualizado)</h4>
            ${wide(["DN Imp (mm)", "DN Suc (mm)", "v imp (m/s)", "Hm (m.c.a.)", "P motor (HP)", "Padop (HP)",
                "Inv. tubería ($)", "Inv. bomba ($)", "Energía ($/año)", "Costo anual ($)"], d.optData)}
        </div>

        <div class="info-sec">
            <h4>5 · Pozo de bombeo</h4>
            ${wide(["Alternativa", "Por cavitación (m)", "Por seguridad (m)", "Adoptada (m)"], d.pozoData)}
        </div>

        <div class="info-sec concl">
            <h4>Conclusión</h4>
            <p>${esc(d.conclusion)}</p>
        </div>

        <div class="informe-foot">
            <p>El presente informe fue generado automáticamente con los parámetros de la hoja de cálculo.
            Verificar caudales unitarios y coeficientes según la Norma 68.</p>
        </div>
    </div>`;
}

function renderInforme(r) {
    const host = $("informe-content");
    if (!host) return;
    host.innerHTML = buildReportHTML(collectReportData(r));
}

function buildPDF(d) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const PW = 210, PH = 297, M = 13;
    let y = 0;

    doc.setFillColor(11, 93, 86);
    doc.rect(0, 0, PW, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("Informe técnico", M, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Sistema de impulsión — Río  ·  Saneamiento (Norma 68)", M, 20);
    doc.setFontSize(8);
    doc.text("Fecha: " + d.fecha, PW - M, 12, { align: "right" });
    doc.text("Grupo Nº: ______________", PW - M, 17, { align: "right" });
    doc.text("Integrantes: ______________________", PW - M, 22, { align: "right" });
    doc.setTextColor(20, 39, 31);
    y = 36;

    const ensure = (need) => { if (y + need > 272) { doc.addPage(); y = 20; } };
    const heading = (txt) => {
        ensure(12);
        doc.setFillColor(11, 93, 86);
        doc.rect(M, y - 4.5, 2, 6, "F");
        doc.setTextColor(11, 93, 86);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(txt, M + 4, y);
        y += 7;
    };
    const sub = (txt) => {
        ensure(10);
        doc.setTextColor(20, 39, 31);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.text(txt, M, y);
        y += 4;
    };
    const kvTable = (rows) => {
        doc.autoTable({
            startY: y,
            head: [["Parámetro", "Valor", "Unidad"]],
            body: rows,
            theme: "grid",
            headStyles: { fillColor: [11, 93, 86], textColor: 255, fontSize: 8, fontStyle: "bold" },
            bodyStyles: { fontSize: 8, textColor: [22, 39, 31] },
            alternateRowStyles: { fillColor: [247, 250, 249] },
            columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
            styles: { cellPadding: 1.7 },
            margin: { left: M, right: M },
        });
        y = doc.lastAutoTable.finalY + 6;
    };
    const wideTable = (head, rows, fs) => {
        doc.autoTable({
            startY: y,
            head: [head],
            body: rows,
            theme: "striped",
            headStyles: { fillColor: [11, 93, 86], textColor: 255, fontSize: 7.5, fontStyle: "bold" },
            bodyStyles: { fontSize: fs || 7, textColor: [22, 39, 31] },
            styles: { cellPadding: 1.4, halign: "right" },
            columnStyles: { 0: { halign: "left" } },
            margin: { left: M, right: M },
        });
        y = doc.lastAutoTable.finalY + 6;
    };

    heading("1 · Datos de entrada");
    sub("Urbanísticos");
    kvTable(d.inputsUrban);
    sub("Caudales unitarios y coeficientes");
    kvTable(d.inputsCaud);
    sub("Geometría");
    kvTable(d.inputsGeom);
    sub("Rendimientos de las alternativas");
    kvTable(d.inputsRend);
    sub("Parámetros económicos");
    kvTable(d.inputsEco);

    heading("2 · Caudales y bombeo");
    sub("Caudales");
    kvTable(d.resCaud);
    sub("Caudal de bombeo y Bresse");
    kvTable(d.resBombeo);

    heading("3 · Alternativas de diámetro");
    wideTable(["Alt", "Suc (mm)", "Imp (mm)", "v suc (m/s)", "v imp (m/s)", "J suc (m/m)", "J imp (m/m)",
        "Leq suc (m)", "Leq imp (m)", "Hm (m.c.a.)", "Pb (cv)", "P motor (HP)", "Padop (HP)"], d.altsData, 6.5);

    heading("4 · Alternativa óptima (mínimo costo anualizado)");
    wideTable(["DN Imp (mm)", "DN Suc (mm)", "v imp (m/s)", "Hm (m.c.a.)", "P motor (HP)", "Padop (HP)",
        "Inv. tubería ($)", "Inv. bomba ($)", "Energía ($/año)", "Costo anual ($)"], d.optData, 6.5);

    heading("5 · Pozo de bombeo");
    wideTable(["Alternativa", "Por cavitación (m)", "Por seguridad (m)", "Adoptada (m)"], d.pozoData);

    heading("Conclusión");
    ensure(24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(20, 39, 31);
    const lines = doc.splitTextToSize(d.conclusion, PW - 2 * M);
    doc.text(lines, M, y);
    y += lines.length * 4.5;

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(140);
        doc.text("Informe generado automáticamente · Saneamiento (Norma 68)", M, PH - 8);
        doc.text("Página " + i + " de " + pages, PW - M, PH - 8, { align: "right" });
    }

    doc.save("informe-sistema-impulsion.pdf");
}

function setupPdf() {
    const btn = $("pdf-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
        btn.disabled = true;
        btn.textContent = "Generando PDF…";
        const done = () => { btn.disabled = false; btn.textContent = "Descargar PDF"; };
        if (window.jspdf && window.jspdf.jsPDF) {
            try {
                buildPDF(collectReportData(calc()));
            } catch (e) {
                done();
                window.print();
            }
            done();
        } else {
            done();
            window.print();
        }
    });
}

/* ================= Init ================= */
loadState();
renderDatos();
renderCaudalUnitario();
renderBombeoForm();
renderOptForm();
renderGeomForm();
renderAll();
setupFormulasToggle();
setupPdf();