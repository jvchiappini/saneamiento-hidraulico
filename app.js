"use strict";

/* ================= Pagina actual ================= */
const PAGE = document.body.dataset.page || "index";

/* ================= Estado de entrada ================= */
const S = {
    manzanas: 12, lotes: 6, pisos: 22, deptos: 6, dorm: 3, persDorm: 2, persServ: 1, pctLog: 10,
    qDept: 200, qLog: 50, caudalTipoDept: "", caudalTipoLog: "",
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
    pipeCost: { ...PIPE_COST_DEFAULT },
    bombaCost: { ...BOMBA_COST_DEFAULT },
    kwh: 0.06, rate: 8, maint: 2,
};

// Diametros comerciales considerados por el algoritmo (disponibles en Tabla 3)
const CAND_DN = [100, 125, 150, 200, 250, 300, 350, 400, 450, 500];

/* ================= Persistencia ================= */
const LS_KEY = "sh-state-v1";
const LS_KEY_POTAB = "sh-potab-state-v1";
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
    try { localStorage.setItem(LS_KEY_POTAB, JSON.stringify({ SP })); } catch (e) { /* noop */ }
}
function loadPotabState() {
    try {
        const raw = localStorage.getItem(LS_KEY_POTAB);
        if (raw) {
            const o = JSON.parse(raw);
            Object.assign(SP, o.SP || {});
        }
    } catch (e) { /* noop */ }
}
function savePotabState() {
    try { localStorage.setItem(LS_KEY_POTAB, JSON.stringify({ SP })); } catch (e) { /* noop */ }
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

    // Verificaciones del Excel (fila 32-33, 52-53, F28)
    // 0,7 <= v <= 4,0  ->  "Verifica" / "Aumentar Diametro" / "Disminuir Diametro"
    const vState = (v) => {
        if (v < 0.7) return { ok: false, text: "Disminuir Diámetro", kind: "warn" };
        if (v <= 4.0) return { ok: true, text: "Verifica", kind: "ok" };
        return { ok: false, text: "Aumentar Diámetro", kind: "fail" };
    };
    const vStateB = (v) => {
        if (v <= 0.5) return { ok: false, text: "Disminuir Diámetro", kind: "warn" };
        return { ok: true, text: "Verifica", kind: "ok" };
    };
    const sState = vState(vS);
    const iState = vState(vI);
    const sStateB = vStateB(vS);
    const iStateB = vStateB(vI);
    // La succión debe ser un diámetro superior al de impulsión (nota F28)
    const sGtI = dS > dI;

    return {
        dS, dI, vS, vI, JS, JI,
        cS, cI, leqS, leqI,
        hS, hI, hT,
        etaB, etaM, Pb, HP, Pmb, holg, Phmb, Padop,
        hCav, hSeg, hPozo,
        sState, iState, sStateB, iStateB, sGtI,
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

function bombaCost(hp) {
    const c = Sopt.bombaCost[hp];
    if (c != null) return c;
    const hps = Object.keys(Sopt.bombaCost).map(Number).sort((a, b) => a - b);
    const nearest = hps.find((x) => x >= hp - 1e-9) ?? hps[hps.length - 1];
    if (nearest != null && Sopt.bombaCost[nearest] != null) return Sopt.bombaCost[nearest];
    return 0;
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

        if (!m.sState.ok || !m.iState.ok) continue;

        const perMeter = Sopt.pipeCost[dn] != null ? Sopt.pipeCost[dn] : 0;
        const pipeCost = perMeter * (S.lImp + S.lSucc);
        const pumpInv = bombaCost(m.Padop);
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

const BOMBEO_FIELDS = [
    { id: "k1", label: "K1 — Consumo máx. diario", unit: "" },
    { id: "k2", label: "K2 — Consumo máx. horario", unit: "" },
    { id: "k3", label: "K3 — Línea de impulsión", unit: "" },
    { id: "horasOp", label: "Horas de operación de la bomba", unit: "hs/d" },
];

const OPT_FIELDS = [
    { id: "kwh", label: "Costo de la energía", unit: "$/kWh" },
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
    const tipoOptions = TABLE1.map((row) =>
        `<option value="${esc(row.tipo)}">${esc(row.tipo)}</option>`).join("");
    host.innerHTML = `
        <div class="field">
            <label>Tipo de inmueble — departamentos (Norma 68 · Tabla 1)</label>
            <div class="input-row">
                <select id="in-caudalTipoDept">
                    <option value="">— Seleccionar de la tabla —</option>
                    ${tipoOptions}
                </select>
            </div>
        </div>
        <div class="field">
            <label>Caudal unitario departamentos</label>
            <div class="input-row">
                <input type="number" inputmode="decimal" id="in-qDept" value="${S.qDept}" step="any" min="0">
                <span class="unit">l/pers/d</span>
            </div>
        </div>
        <div class="field">
            <label>Tipo de inmueble — logística (Norma 68 · Tabla 1)</label>
            <div class="input-row">
                <select id="in-caudalTipoLog">
                    <option value="">— Seleccionar de la tabla —</option>
                    ${tipoOptions}
                </select>
            </div>
        </div>
        <div class="field">
            <label>Caudal unitario logística</label>
            <div class="input-row">
                <input type="number" inputmode="decimal" id="in-qLog" value="${S.qLog}" step="any" min="0">
                <span class="unit">l/pers/d</span>
            </div>
        </div>`;
    const tipoDept = $("in-caudalTipoDept");
    tipoDept.value = S.caudalTipoDept || "";
    tipoDept.addEventListener("change", () => {
        S.caudalTipoDept = tipoDept.value;
        const row = TABLE1.find((x) => x.tipo === tipoDept.value);
        if (row) {
            S.qDept = row.consumo;
            $("in-qDept").value = row.consumo;
            saveState();
            scheduleRecompute();
        }
    });
    const tipoLog = $("in-caudalTipoLog");
    tipoLog.value = S.caudalTipoLog || "";
    tipoLog.addEventListener("change", () => {
        S.caudalTipoLog = tipoLog.value;
        const row = TABLE1.find((x) => x.tipo === tipoLog.value);
        if (row) {
            S.qLog = row.consumo;
            $("in-qLog").value = row.consumo;
            saveState();
            scheduleRecompute();
        }
    });
    bind("qDept", (v) => { S.qDept = v; S.caudalTipoDept = ""; });
    bind("qLog", (v) => { S.qLog = v; S.caudalTipoLog = ""; });
}

function renderBombeoForm() {
    const host = $("bombeo-form");
    if (!host) return;
    host.innerHTML = BOMBEO_FIELDS.map((fd) => renderField(fd)).join("");
    BOMBEO_FIELDS.forEach((fd) => bind(fd.id, (v) => S[fd.id] = v));
}

function renderOptForm() {
    const host = $("opt-form");
    if (host) {
        host.innerHTML = OPT_FIELDS.map((fd) => renderField(fd, Sopt)).join("");
        OPT_FIELDS.forEach((fd) => bind(fd.id, (v) => Sopt[fd.id] = v));
    }
    renderCostTable("pipe-cost-form", "Diámetro nominal (mm)", Sopt.pipeCost, (dn) => `in-pipeCost-${dn}`, "$/m");
    renderCostTable("bomba-cost-form", "Potencia de la bomba (HP)", Sopt.bombaCost, (hp) => `in-bombaCost-${hp}`, "$");
}

function renderCostTable(hostId, labelCol, obj, idFor, unit) {
    const pc = $(hostId);
    if (!pc) return;
    const keys = Object.keys(obj).map((k) => Number(k)).sort((a, b) => a - b);
    pc.innerHTML = `
        <div class="table-wrap">
            <table>
                <thead><tr><th>${esc(labelCol)}</th><th>Costo (${esc(unit)})</th></tr></thead>
                <tbody>
                ${keys.map((k) => `
                    <tr>
                        <td><strong>${f(k, 1)}</strong></td>
                        <td><input type="number" id="${idFor(k)}" value="${obj[k]}" step="any" min="0" inputmode="decimal" class="pipe-cost-input"></td>
                    </tr>`).join("")}
                </tbody>
            </table>
        </div>`;
    keys.forEach((k) => {
        const el = $(idFor(k));
        if (!el) return;
        el.addEventListener("input", () => {
            obj[k] = nf(el);
            saveState();
            scheduleRecompute();
        });
    });
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
    if (PAGE === "auto") {
        renderAutoResults();
        renderInforme(calc());
        renderFormulas();
        return;
    }
    if (PAGE === "potab") {
        renderPotabAll(false);
        return;
    }
    if (PAGE === "potab-auto") {
        renderPotabAll(true);
        return;
    }
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

/* ================= Pagina automatica ================= */
const AUTO_SUCC_POOL = [...CAND_DN, 550, 600, 700];

function autoDiameters(b) {
    const bresseMm = b.B26 * 1000;
    const sorted = [...CAND_DN].sort((a, b) => a - b);
    const near = [...sorted]
        .sort((x, y) => Math.abs(x - bresseMm) - Math.abs(y - bresseMm))
        .slice(0, 3)
        .sort((a, b) => a - b);
    const etaB = etaBomba(b.D23);
    return near.map((dI) => {
        const dS = AUTO_SUCC_POOL.find((s) => s > dI) ?? dI;
        let etaM = 0.88, m = null;
        for (let k = 0; k < 3; k++) {
            m = altMetrics(b, dS, dI, etaB, etaM);
            etaM = etaMotor(m.Pmb);
        }
        return { dI, dS, m, etaB, etaM };
    });
}

function renderAutoResults() {
    const r = calc();
    const rows = optimalRows(r);
    const best = rows[0];

    const kpis = $("auto-kpis");
    if (kpis) {
        kpis.innerHTML =
            kpi("Caudal de bombeo", f(r.D23, 2), "l/s") +
            kpi("Diam. Bresse", "≈ " + f(r.B26 * 1000, 0), "mm") +
            kpi("Alt. manométrica", best ? f(best.m.hT, 2) : "—", "m.c.a.") +
            kpi("Potencia adoptada", best ? f(best.m.Padop, 0) : "—", "HP");
    }

    const alts = $("auto-alts");
    if (alts) {
        const auto = autoDiameters(r);
        alts.innerHTML = `
            <div class="table-wrap">
                <table>
                    <thead><tr>
                        <th>Alt.</th><th>Imp (mm)</th><th>Suc (mm)</th><th>v imp (m/s)</th>
                        <th>v suc (m/s)</th><th>Hm (m.c.a.)</th><th>P motor (HP)</th><th>Padop (HP)</th>
                    </tr></thead>
                    <tbody>
                    ${auto.map((a, i) => `
                        <tr>
                            <td><strong>${i + 1}</strong></td>
                            <td><strong>${a.dI}</strong></td><td>${a.dS}</td>
                            <td>${f(a.m.vI, 2)}</td><td>${f(a.m.vS, 2)}</td>
                            <td>${f(a.m.hT, 2)}</td><td>${f(a.m.Pmb, 1)}</td>
                            <td>${f(a.m.Padop, 0)}</td>
                        </tr>`).join("")}
                    </tbody>
                </table>
            </div>
            <p class="footnote">
                Motor calculado automáticamente: η<sub>bomba</sub> ${f(auto[0].etaB * 100, 0)}% (Tabla 6) ·
                η<sub>motor</sub> iterado con la Tabla 7 · holgura según potencia · potencia comercial adoptada
                (Tabla 8).
            </p>`;
    }

    const opt = $("auto-opt");
    if (opt) {
        if (!best) {
            opt.innerHTML = `<p class="footnote">Ningún diámetro comercial verifica las velocidades (0,7–4,0 m/s) con estos parámetros.</p>`;
        } else {
            opt.innerHTML = `
                <div class="results">
                    <div class="result-row highlight"><span class="r-label">Diámetro de impulsión adoptado</span>
                        <span class="r-value"><strong>DN ${best.dn} mm</strong></span></div>
                    <div class="result-row"><span class="r-label">Diámetro de succión</span>
                        <span class="r-value">DN ${best.succ} mm</span></div>
                    <div class="result-row"><span class="r-label">Velocidad en impulsión</span>
                        <span class="r-value">${f(best.m.vI, 2)} m/s ${badge(best.m.iState)}</span></div>
                    <div class="result-row"><span class="r-label">Velocidad en succión</span>
                        <span class="r-value">${f(best.m.vS, 2)} m/s ${badge(best.m.sState)}</span></div>
                    <div class="result-row highlight"><span class="r-label">Altura manométrica total</span>
                        <span class="r-value">${f(best.m.hT, 2)} m.c.a.</span></div>
                    <div class="result-row"><span class="r-label">Potencia del motor</span>
                        <span class="r-value">${f(best.m.Pmb, 2)} HP</span></div>
                    <div class="result-row highlight"><span class="r-label">Potencia adoptada</span>
                        <span class="r-value">${f(best.m.Padop, 0)} HP</span></div>
                    <div class="result-row"><span class="r-label">Inversión tubería + bomba</span>
                        <span class="r-value">${f0(best.pipeCost)} + ${f0(best.pumpInv)} $</span></div>
                    <div class="result-row"><span class="r-label">Energía anual</span>
                        <span class="r-value">${f0(best.energy)} $/año</span></div>
                    <div class="result-row highlight"><span class="r-label">Costo anual total</span>
                        <span class="r-value">${f0(best.annual)} $/año</span></div>
                    <div class="result-row"><span class="r-label">Pozo — altura por cavitación</span>
                        <span class="r-value">${f(best.m.hCav, 2)} m</span></div>
                    <div class="result-row"><span class="r-label">Pozo — altura mínima sobre la criba</span>
                        <span class="r-value">${f(best.m.hPozo, 2)} m</span></div>
                </div>`;
        }
    }

    const chart = $("auto-chart");
    if (chart) {
        if (!rows.length) {
            chart.innerHTML = "";
        } else {
            chart.innerHTML = paretoSVG(
                "Costo anual por combinación tubería × motor ($/año)",
                rows.map((row) => ({ label: `${row.dn} mm · ${f(row.m.Padop, 0)} HP`, value: row.annual, hl: row === best })),
                "Mínimo (óptimo)"
            );
        }
    }
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
    const cards = r.alts.map((a, i) => `
        <div class="res-card">
            <div class="res-card-title">Alternativa ${i + 1}</div>
            <div class="res-card-sub">Suc ${a.dS} / Imp ${a.dI} mm</div>
            <div class="res-card-foot">v suc ${badge(a.sState)}</div>
            <div class="res-card-foot">v imp ${badge(a.iState)}</div>
            <div class="res-card-main">${f(a.hT, 2)} <small>m.c.a.</small></div>
            <div class="res-card-foot">${f(a.Padop, 0)} HP adoptados</div>
        </div>`).join("");
    host.innerHTML = `<div class="res-grid">${cards}</div>
        <p class="footnote">Detalle completo en la sección <a href="#alternativas">Alternativas de diámetro ↓</a> · La alternativa óptima por mínimo costo se calcula en la página <a href="auto.html">Cálculo automático</a>.</p>`;
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

function badge(state, label) {
    if (!state) return `<span class="badge-state fail">✕ no verifica</span>`;
    return `<span class="badge-state ${state.kind}">${state.ok ? "✓ " : "✕ "}${esc(state.text)}</span>`;
}

function diagBadge(ok) {
    return ok
        ? `<span class="badge-state ok">✓ Verifica</span>`
        : `<span class="badge-state fail">✕ Succión debe ser mayor</span>`;
}

function metricsHTML(a) {
    return `
        <div class="metric"><span class="m-label">v succión · 0,7–4,0 m/s</span>
            <span class="m-value">${f(a.vS, 2)} m/s ${badge(a.sState)}</span></div>
        <div class="metric"><span class="m-label">v impulsión · 0,7–4,0 m/s</span>
            <span class="m-value">${f(a.vI, 2)} m/s ${badge(a.iState)}</span></div>
        <div class="metric"><span class="m-label">v &gt; 0,5 m/s (succión)</span>
            <span class="m-value">${badge(a.sStateB)}</span></div>
        <div class="metric"><span class="m-label">v &gt; 0,5 m/s (impulsión)</span>
            <span class="m-value">${badge(a.iStateB)}</span></div>
        <div class="metric"><span class="m-label">Succión &gt; Impulsión</span>
            <span class="m-value">${diagBadge(a.sGtI)}</span></div>
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

    host.innerHTML = manual;

    for (let i = 0; i < r.alts.length; i++) {
        const s = $("in-altS-" + i), im = $("in-altI-" + i), b = $("in-etaB-" + i), m = $("in-etaM-" + i);
        s.addEventListener("input", () => { S.altSucc[i] = nf(s); saveState(); scheduleRecompute(); });
        im.addEventListener("input", () => { S.altImp[i] = nf(im); saveState(); scheduleRecompute(); });
        b.addEventListener("input", () => { S.etaB[i] = nf(b); saveState(); scheduleRecompute(); });
        m.addEventListener("input", () => { S.etaM[i] = nf(m); saveState(); scheduleRecompute(); });
    }
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
            Costo de tubería = ${f0(Sopt.pipeCost[best.dn] != null ? Sopt.pipeCost[best.dn] : 0)} $/m · energía ${Sopt.kwh} $/kWh · tasa ${Sopt.rate}% ·
            mantenimiento ${Sopt.maint}% · η<sub>bomba</sub> ${f(best.etaB * 100, 0)}% (Tabla 6) · η<sub>motor</sub> ${f(best.etaM * 100, 1)}% (Tabla 7).
            Vida útil: tubería 50 años, bomba 7 años.
        </p>`;

    const optEl = $("opt-chart");
    if (optEl) {
        optEl.innerHTML = paretoSVG(
            "Costo anual por combinación tubería × motor ($/año)",
            rows.map((row) => ({ label: `${row.dn} mm · ${f(row.m.Padop, 0)} HP`, value: row.annual, hl: row === best })),
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
                <thead><tr><th>Longitudes equivalentes (<a href="referencias.html#tabla3" class="link-underlined" style="color:#fff;">Tabla 3 de la Norma 68</a>)</th>
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
    const t1 = $("tabla1");
    if (t1) {
        t1.innerHTML = `
            <table>
                <thead><tr><th>Tipo de inmueble</th><th>Consumo mínimo de litros por día</th></tr></thead>
                <tbody>
                ${TABLE1.map((row) => `
                    <tr class="${row.tipo === "Departamentos" ? "selected-row" : ""}">
                        <td>${esc(row.tipo)}</td><td>${f(row.consumo, 1)} <small>${esc(row.unidad)}</small></td>
                    </tr>`).join("")}
                </tbody>
            </table>`;
    }
    const t3 = $("tabla3");
    if (t3) {
        const used = new Set(r.alts.flatMap((a) => [a.dS, a.dI]));
        const fv = (v) => (v != null ? f(v, 1) : "—");
        t3.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>DN (mm)</th>
                        <th>Ref (")</th>
                        <th class="t3-th"><img src="fittings/image_1.png" alt="Curva 90" class="t3-img-header"><span class="t3-lbl">Curva 90°</span></th>
                        <th class="t3-th"><img src="fittings/image_2.png" alt="Accesorio 2" class="t3-img-header"></th>
                        <th class="t3-th"><img src="fittings/image_3.png" alt="Accesorio 3" class="t3-img-header"></th>
                        <th class="t3-th"><img src="fittings/image_4.png" alt="Accesorio 4" class="t3-img-header"></th>
                        <th class="t3-th"><img src="fittings/image_5.png" alt="Accesorio 5" class="t3-img-header"></th>
                        <th class="t3-th"><img src="fittings/image_6.png" alt="Accesorio 6" class="t3-img-header"></th>
                        <th class="t3-th"><img src="fittings/image_7.png" alt="Accesorio 7" class="t3-img-header"></th>
                        <th class="t3-th"><img src="fittings/image_8.png" alt="Accesorio 8" class="t3-img-header"></th>
                        <th class="t3-th"><img src="fittings/image_9.png" alt="Accesorio 9" class="t3-img-header"></th>
                        <th class="t3-th"><img src="fittings/image_10.png" alt="Valv. de cierre" class="t3-img-header"><span class="t3-lbl">Valv. cierre</span></th>
                        <th class="t3-th"><img src="fittings/image_11.png" alt="Valv. de cierre" class="t3-img-header"><span class="t3-lbl">Valv. cierre</span></th>
                        <th class="t3-th"><img src="fittings/image_12.png" alt="Accesorio 12" class="t3-img-header"></th>
                        <th class="t3-th"><img src="fittings/image_13.png" alt="Accesorio 13" class="t3-img-header"></th>
                        <th class="t3-th"><img src="fittings/image_14.png" alt="Tee lateral" class="t3-img-header"><span class="t3-lbl">Tee lateral</span></th>
                        <th class="t3-th"><img src="fittings/image_15.png" alt="Tee 2 salidas" class="t3-img-header"><span class="t3-lbl">Tee 2 salidas</span></th>
                        <th class="t3-th"><img src="fittings/image_16.png" alt="Valv. de Pie" class="t3-img-header"><span class="t3-lbl">Valv. Pie</span></th>
                        <th class="t3-th"><img src="fittings/image_17.png" alt="Accesorio 17" class="t3-img-header"></th>
                        <th class="t3-th"><img src="fittings/image_18.png" alt="Valv. de retención" class="t3-img-header"><span class="t3-lbl">Valv. retención</span></th>
                        <th class="t3-th"><img src="fittings/image_19.png" alt="Valv. de retención" class="t3-img-header"><span class="t3-lbl">Valv. retención</span></th>
                    </tr>
                </thead>
                <tbody>
                ${TABLE3.map((row) => `
                    <tr class="${used.has(row.dn) ? "selected-row" : ""}">
                        <td><strong>${row.dn}</strong></td>
                        <td>${row.ref}</td>
                        <td>${fv(row.curva90)}</td>
                        <td>${fv(row.img2)}</td>
                        <td>${fv(row.img3)}</td>
                        <td>${fv(row.img4)}</td>
                        <td>${fv(row.img5)}</td>
                        <td>${fv(row.img6)}</td>
                        <td>${fv(row.img7)}</td>
                        <td>${fv(row.img8)}</td>
                        <td>${fv(row.img9)}</td>
                        <td>${fv(row.valvCierre)}</td>
                        <td>${fv(row.valvCierre_11)}</td>
                        <td>${fv(row.img12)}</td>
                        <td>${fv(row.img13)}</td>
                        <td>${fv(row.teeLateral)}</td>
                        <td>${fv(row.tee2)}</td>
                        <td>${fv(row.valvPie)}</td>
                        <td>${fv(row.img17)}</td>
                        <td>${fv(row.valvRet)}</td>
                        <td>${fv(row.valvRet_19)}</td>
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
    const pipeCostRows = Object.keys(Sopt.pipeCost).map(Number).sort((a, b) => a - b)
        .map((dn) => kv(`Costo tubería DN ${dn}`, "$ " + Sopt.pipeCost[dn], "$/m"));
    const bombaCostRows = Object.keys(Sopt.bombaCost).map(Number).sort((a, b) => a - b)
        .map((hp) => kv(`Costo bomba ${f(hp, 1)} HP`, "$ " + Sopt.bombaCost[hp], "$"));
    const inputsEco = [
        ...pipeCostRows,
        ...bombaCostRows,
        kv("Costo de la energía", "$ " + Sopt.kwh, "$/kWh"),
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
        "Alt " + (i + 1), a.dS, a.dI, f(a.vS, 2), a.sState.text, f(a.vI, 2), a.iState.text,
        a.sStateB.text, a.iStateB.text, a.sGtI ? "Verifica" : "No verifica",
        f(a.JS, 5), f(a.JI, 5), f(a.leqS, 1), f(a.leqI, 1), f(a.hT, 2), f(a.Pb, 2), f(a.Pmb, 2), f(a.Padop, 0),
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

/* Informe de la página de cálculo automático */
function collectAutoReportData(r) {
    const auto = autoDiameters(r);
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
    const inputsRend = auto.map((a, i) =>
        kv(`Rendimiento bomba/motor — Alt ${i + 1}`, `${f(a.etaB * 100, 0)}% / ${f(a.etaM * 100, 0)}%`, ""));
    const pipeCostRows = Object.keys(Sopt.pipeCost).map(Number).sort((a, b) => a - b)
        .map((dn) => kv(`Costo tubería DN ${dn}`, "$ " + Sopt.pipeCost[dn], "$/m"));
    const bombaCostRows = Object.keys(Sopt.bombaCost).map(Number).sort((a, b) => a - b)
        .map((hp) => kv(`Costo bomba ${f(hp, 1)} HP`, "$ " + Sopt.bombaCost[hp], "$"));
    const inputsEco = [
        ...pipeCostRows,
        ...bombaCostRows,
        kv("Costo de la energía", "$ " + Sopt.kwh, "$/kWh"),
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

    const altsData = auto.map((a, i) => [
        "Alt " + (i + 1), a.dS, a.dI, f(a.m.vS, 2), a.m.sState.text, f(a.m.vI, 2), a.m.iState.text,
        a.m.sStateB.text, a.m.iStateB.text, a.m.sGtI ? "Verifica" : "No verifica",
        f(a.m.JS, 5), f(a.m.JI, 5), f(a.m.leqS, 1), f(a.m.leqI, 1), f(a.m.hT, 2), f(a.m.Pb, 2), f(a.m.Pmb, 2), f(a.m.Padop, 0),
    ]);
    const pozoData = auto.map((a, i) => ["Alt " + (i + 1), f(a.m.hCav, 3), f(a.m.hSeg, 2), f(a.m.hPozo, 2)]);
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
            ${wide(["Alt", "Suc (mm)", "Imp (mm)", "v suc (m/s)", "Verif. suc.", "v imp (m/s)", "Verif. imp.",
        "v>0,5 suc", "v>0,5 imp", "Suc>Imp", "J suc (m/m)", "J imp (m/m)",
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
    host.innerHTML = buildReportHTML(PAGE === "auto" ? collectAutoReportData(r) : collectReportData(r));
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
    wideTable(["Alt", "Suc (mm)", "Imp (mm)", "v suc (m/s)", "Verif. suc.", "v imp (m/s)", "Verif. imp.",
        "v>0,5 suc", "v>0,5 imp", "Suc>Imp", "J suc (m/m)", "J imp (m/m)",
        "Leq suc (m)", "Leq imp (m)", "Hm (m.c.a.)", "Pb (cv)", "P motor (HP)", "Padop (HP)"], d.altsData, 5.5);

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
    btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Generando PDF…";
        const done = () => { btn.disabled = false; btn.textContent = "Descargar PDF"; };
        try {
            if (window.jspdf && window.jspdf.jsPDF) {
                if (PAGE === "potab" || PAGE === "potab-auto") {
                    if (PAGE === "potab-auto") applyPotabAuto();
                    await buildPotabPDF(collectPotabReportData(potabCalc()));
                } else {
                    buildPDF(PAGE === "auto" ? collectAutoReportData(calc()) : collectReportData(calc()));
                }
            } else {
                window.print();
            }
        } catch (e) {
            done();
            window.print();
        }
        done();
    });
}

/* ================= POTABILIZADORA ================= */
/* Estado de entrada de la hoja POTABILIZADORA. Todos los valores
   "adoptado"/"tanteo" de la planilla, con los valores de referencia de la cátedra. */
const SP = {
    caudalDiario: 13353.12, k1: 1.2, k2: 1.5, k3: 1.05,
    vAsc: 8.6, tAq: 31.6,
    parshallW: 0.305, parshallN: 0.229, parshallK: 0.076, parshallA: 1.372,
    cd: 0.6, phi: 90, hadoptado: 0.3, b2hmaxAdopt: 0.3, altParedExt: 0.2,
    kPaletas: 2.3, rpm: 105,
    tCanal: 10,
    mzTiempo: 2.35, mzVolAdopt: 2500, mzAltura: 1.85, mzEfic: 0.7, mzCoef: 1.45, mzPadop: 7.5,
    flocTemp: 23, flocProf: 1.7, flocV1: 0.175, flocV2: 0.425, flocBAdopt: 0.7, flocX: 22, flocE: 0.002, flocK: 2, flocN: 0.01,
    sedTr: 3, sedCsup: 0.1853, sedLb: 3.98, sedNfAdopt: 6,
    sedBaf: 0.234, sedNComp: 4, sedSepPct: 3.6, sedSepFondo: 0.8, sedVorif: 0.3, sedDorif: 0.1,
    sedTasaAdopt: 3.1, sedGrosor: 0.1, sedVCan: 1.2,
    sedCd: 0.61, sedTVaciado: 0.53,
    filTasa: 120, filExp: 30, filArena: 0.7, filVasc: 0.72, filNCan: 3, filACan: 0.2, filSepBorde: 0.665,
    filTLavado: 10, filHoras: 4, filFseg: 2.5, filFrec: 1.5, filTLlenado: 90, filPadop: 20,
    clTContacto: 20, clDosis: 10, clTanque: 750,
    resProf: 3.6,
};

// Tabla de referencia del aforador Parshall según Azevedo y Acosta (Manual de Hidráulica pág. 471)
const PARSHALL_TABLA = [
    { ref: "1''", w: 0.025, min: null, max: null, a: 0.360, b: 0.350, c: 0.093, d: 0.168, e: 0.230, f: 0.076, g: 0.203, k: 0.019, n: 0.029 },
    { ref: '3"', w: 0.076, min: 0.85, max: 53.8, a: 0.467, b: 0.457, c: 0.178, d: 0.259, e: 0.457, f: 0.152, g: 0.305, k: 0.025, n: 0.057 },
    { ref: '6"', w: 0.152, min: 1.52, max: 110.4, a: 0.621, b: 0.610, c: 0.394, d: 0.397, e: 0.610, f: 0.305, g: 0.610, k: 0.076, n: 0.114 },
    { ref: '9"', w: 0.229, min: 2.55, max: 251.9, a: 0.880, b: 0.864, c: 0.381, d: 0.575, e: 0.762, f: 0.305, g: 0.457, k: 0.076, n: 0.114 },
    { ref: "1'", w: 0.305, min: 3.11, max: 455.6, a: 1.372, b: 1.343, c: 0.610, d: 0.845, e: 0.759, f: 0.610, g: 0.915, k: 0.076, n: 0.229 },
    { ref: "1 1/2'", w: 0.457, min: 4.25, max: 696.2, a: 1.448, b: 1.419, c: 0.762, d: 1.026, e: 0.915, f: 0.610, g: 0.915, k: 0.076, n: 0.229 },
    { ref: "2'", w: 0.610, min: 11.89, max: 936.7, a: 1.524, b: 1.495, c: 0.915, d: 1.207, e: 0.915, f: 0.610, g: 0.915, k: 0.076, n: 0.229 },
    { ref: "3'", w: 0.915, min: 17.26, max: 1426.3, a: 1.676, b: 1.645, c: 1.220, d: 1.572, e: 0.915, f: 0.610, g: 0.915, k: 0.076, n: 0.229 },
    { ref: "4'", w: 1.220, min: 36.79, max: 1921.5, a: 1.829, b: 1.794, c: 1.525, d: 1.937, e: 0.915, f: 0.610, g: 0.915, k: 0.076, n: 0.229 },
    { ref: "5'", w: 1.525, min: 62.8, max: 2422.0, a: 1.981, b: 1.943, c: 1.830, d: 2.302, e: 0.915, f: 0.610, g: 0.915, k: 0.076, n: 0.229 },
    { ref: "6'", w: 1.830, min: 74.4, max: 2929.0, a: 2.134, b: 2.092, c: 2.135, d: 2.667, e: 0.915, f: 0.610, g: 0.915, k: 0.076, n: 0.229 },
    { ref: "7'", w: 2.135, min: 115.4, max: 3440.0, a: 2.286, b: 2.242, c: 2.440, d: 3.032, e: 0.915, f: 0.610, g: 0.915, k: 0.076, n: 0.229 },
    { ref: "8'", w: 2.440, min: 130.7, max: 3950.0, a: 2.438, b: 2.391, c: 2.745, d: 3.397, e: 0.915, f: 0.610, g: 0.915, k: 0.076, n: 0.229 },
    { ref: "10'", w: 3.050, min: 200.0, max: 5660.0, a: 2.743, b: 2.690, c: 3.660, d: 4.756, e: 1.220, f: 0.915, g: 1.829, k: 0.152, n: 0.343 },
];

const G_CONST = 9.81;
const ru = (n, d) => Math.ceil(n * Math.pow(10, d)) / Math.pow(10, d);
const rd = (n, d) => Math.floor(n * Math.pow(10, d)) / Math.pow(10, d);

let parshallViewMode = "calc"; // "calc" | "canon"

function setParshallViewMode(mode) {
    parshallViewMode = mode;
    const r = potabCalc();
    renderPotabParshallDibujo(r);
}

function potabCalc() {
    const r = {};

    // 1. Caudal de captación
    r.qd = SP.caudalDiario;                       // m3/d
    r.qcapLps = r.qd * SP.k1 * SP.k3 * 1000 / 86400;   // l/s
    r.qcap = r.qcapLps / 1000;                    // m3/s

    // 2. Cámara de aquietamiento
    r.vAscMs = SP.vAsc / 100;                     // m/s
    r.aqArea = r.qcap / r.vAscMs;                 // m2
    r.aqLado = Math.sqrt(r.aqArea);               // m
    r.aqProf = (r.qcap * SP.tAq) / r.aqArea;      // m (B15)
    r.aqTiempo = SP.tAq;
    r.aqSolera = 0.285;
    r.aqHtot = r.aqProf + r.aqSolera;

    // 3. Parshall
    r.phW = SP.parshallW;
    const tabMatch = PARSHALL_TABLA.find(t => Math.abs(t.w - r.phW) < 0.005) || PARSHALL_TABLA[4];
    r.phH = Math.pow(r.qcap / (2.2 * r.phW), 2 / 3);
    r.phN = SP.parshallN;
    r.phK = SP.parshallK;
    r.phH2 = 0.6 * r.phH;
    r.phH3 = 0.7 * r.phH;
    r.phH1 = r.phH - r.phH3 - r.phK;
    r.phV = r.qcap / (r.phW * r.phH2);
    r.phVerif = r.phV >= 2;
    r.phA = SP.parshallA;
    r.ph2_3A = (2 / 3) * r.phA;
    r.phB = tabMatch.b;
    r.phC = tabMatch.c;
    r.phD = tabMatch.d;
    r.phE = tabMatch.e;
    r.phF = tabMatch.f;
    r.phG = tabMatch.g;

    // 4. Vertedero "V"
    r.vQ = r.qcap;
    r.vCd = SP.cd;
    r.vPhi = SP.phi;
    r.vTan = Math.tan(SP.phi / 2);
    r.vHmax = ru(Math.pow(r.vQ / ((8 / 15) * SP.cd * Math.sqrt(2 * G_CONST) * r.vTan), 2 / 5), 4);
    r.vHadopt = SP.hadoptado;
    r.v2Hmax = r.vHmax * 2;
    r.v2HmaxAdopt = SP.b2hmaxAdopt;
    r.vB = r.vHmax * 2;
    r.vPisoInt = ru(r.vB + r.v2Hmax, 3);
    r.vParedExt = SP.altParedExt;
    r.vAnchoPiso = ru(2 * SP.b2hmaxAdopt + SP.hadoptado * 2, 2);

    // Resalto
    r.vQuni = ru(r.vQ / r.vB, 4);
    r.vHc = Math.pow(Math.pow(r.vQuni, 2) / G_CONST, 1 / 3);
    r.vH1 = (r.vHc * Math.sqrt(2)) / (1.06 + Math.sqrt((r.vHmax / r.vHc) + 1.5));
    r.vV1 = r.vQuni / r.vH1;
    r.vF = rd(r.vV1 / Math.sqrt(G_CONST * r.vH1), 2);
    r.vH2 = (r.vH1 / 2) * Math.sqrt(1 + 8 * Math.pow(r.vF, 2));
    r.vV2 = ru(r.vQuni / r.vH2, 4);
    r.vHp = Math.pow(r.vH2 - r.vH1, 3) / (4 * r.vH1 * r.vH2);
    r.vLm = 6 * (r.vH2 - r.vH1);
    r.vLj = (4.3 * r.vB) * Math.pow(r.vHc / r.vB, 0.9);
    r.vVm = (r.vV1 + r.vV2) / 2;
    r.vT = r.vLm / r.vVm;

    // Gradiente de velocidad
    r.gamma = 1000;
    r.nu = 0.00000131 * (33.3 / (SP.flocTemp + 23.3));   // m2/s
    r.mu = r.nu * r.gamma;
    r.kPaletas = SP.kPaletas;
    r.nRps = SP.rpm / 60;
    r.mzDiam = Math.pow(((SP.mzVolAdopt / 1000) / SP.mzAltura) * 4 / Math.PI, 1 / 3);
    r.paletaD = r.mzDiam * 0.7;
    r.mzVol = SP.mzVolAdopt;   // usada como en la hoja
    r.gr = Math.sqrt((SP.kPaletas * r.gamma * Math.pow(r.nRps, 3) * Math.pow(r.paletaD, 5)) / (r.mu * r.mzVol));
    r.gVert = Math.sqrt((r.gamma * r.vHp) / (r.mu * r.vT));
    r.gVertVerif = r.gVert > r.gr;

    // 5. Canal de estabilización
    r.estT = SP.tCanal;
    r.estV2 = r.vV2;
    r.estL = r.estT * r.estV2;

    // 6. Mezclador rápido para coagulantes
    r.mzQCaudal = r.qcapLps * 3.6;          // m3/h
    r.mzTiempo = SP.mzTiempo;
    r.mzVtanque = ru(r.mzQCaudal * r.mzTiempo / 60, 2);  // m3
    r.mzVAdoptL = SP.mzVolAdopt;
    r.mzVAdopt = SP.mzVolAdopt / 1000;
    r.mzAltura = SP.mzAltura;
    r.mzEfic = SP.mzEfic;
    r.mzCoef = SP.mzCoef;
    r.mzP = SP.mzCoef * (0.0001029 * (SP.mzVolAdopt / 1000) * 1000 * 1000 / 76) / SP.mzEfic;
    r.mzPadop = SP.mzPadop;
    r.mzBrazo = (2 / 3) * SP.mzAltura;

    // 7. Floculador / mezclador lento
    r.flTemp = SP.flocTemp;
    r.flProf = SP.flocProf;
    r.flV1 = SP.flocV1;
    r.flV2 = SP.flocV2;
    r.flB = r.qcap / (SP.flocV1 * SP.flocProf);
    r.flBAdopt = SP.flocBAdopt;
    r.flV1rec = r.qcap / (SP.flocBAdopt * SP.flocProf);
    r.flBp = SP.flocBAdopt * 1.5;
    r.flV = r.qcap * 1800;
    r.flA = r.flV / SP.flocProf;
    r.flX = SP.flocX;
    r.flN = Math.ceil((r.flA / SP.flocX) / SP.flocBAdopt);
    r.flN1 = r.flN - 1;
    r.flE = SP.flocE;
    r.flY = (SP.flocBAdopt * r.flN) + (r.flN1 * SP.flocE);
    r.flL = SP.flocX - 2 * r.flBp;
    r.flLt = r.flL * r.flN;
    r.flHcanales = r.flN * Math.pow(r.flV1rec, 2) / (2 * G_CONST);
    r.flK = SP.flocK;
    r.flHvueltas = SP.flocK * r.flN1 * Math.pow(SP.flocV2, 2) / (2 * G_CONST);
    r.flAm = SP.flocProf * SP.flocBAdopt;
    r.flPm = 2 * SP.flocProf + SP.flocBAdopt;
    r.flRH = r.flAm / r.flPm;
    r.flNman = SP.flocN;
    r.flJ1 = Math.pow((SP.flocN * r.flV1rec) / Math.pow(r.flRH, 2 / 3), 2);
    r.flH1 = r.flJ1 * r.flLt;
    r.flHftotal = r.flH1 + r.flHvueltas + r.flHcanales;
    r.flI = r.flHftotal / SP.flocX;
    r.flG = Math.sqrt((G_CONST * r.flHftotal) / (r.nu * 1800));
    r.flGVerif = r.flG >= 30 && r.flG <= 60;

    // 8. Sedimentador de escurrimiento horizontal
    r.sedTr = SP.sedTr;
    r.sedQ = r.qcapLps / 1000 * 86400;         // m3/d
    r.sedNfCalc = 0.044 * Math.sqrt(r.sedQ);
    r.sedNf = SP.sedNfAdopt;
    r.sedNs = r.sedNf / 2;
    r.sedV = r.sedQ / 24 * SP.sedTr;
    r.sedVs = r.sedV / r.sedNs;
    r.sedCsup = SP.sedCsup;
    r.sedCsupM3 = SP.sedCsup / 1000 * 86400;
    r.sedAs = r.sedQ / r.sedCsupM3;
    r.sedAsNs = r.sedAs / r.sedNs;
    r.sedH = r.sedVs / r.sedAsNs;
    r.sedLb = SP.sedLb;
    r.sedL = Math.sqrt(r.sedAsNs * SP.sedLb);
    r.sedLext = r.sedL + 0.4;
    r.sedB = r.sedL / SP.sedLb;
    r.flLadoAprox = r.flA / r.sedB;
    r.sedBext = (r.sedB + 0.2) * r.sedNs + 0.2;
    r.sedLH = r.sedL / r.sedH;
    r.sedLHVerif = r.sedLH >= 7 && r.sedLH <= 30;

    // Canaleta de agua floculada
    r.scQsMax = r.sedQ * 1000 / 86400 / r.sedNs;   // l/s
    r.scNComp = SP.sedNComp;
    r.scQsMin = r.scQsMax / SP.sedNComp;
    r.scV = r.flV1rec;
    r.scSafMax = r.scQsMax / 1000 / r.scV;
    r.scSafMin = r.scQsMin / 1000 / r.scV;
    r.scBaf = SP.sedBaf;
    r.scHafMax = ru(r.scSafMax / SP.sedBaf, 2);
    r.scHafMin = r.scSafMin / SP.sedBaf;
    r.scVerif = Math.abs(r.scHafMax - SP.flocProf) < 0.03;

    // Dispositivos de entrada
    r.deV = r.scV;
    r.deScomp = r.scQsMin / 1000 / r.deV;
    r.deBcomp = r.deScomp / r.scHafMin;
    r.deHf = Math.pow(r.deV, 2) / (2 * G_CONST);
    r.deSepPct = SP.sedSepPct;
    r.deSepTab = (SP.sedSepPct / 100) * r.sedL;
    r.deSepFondo = SP.sedSepFondo;
    r.deVorif = SP.sedVorif;
    r.deAorif = r.scQsMax / 1000 / SP.sedVorif;
    r.deDorif = SP.sedDorif;
    r.deSorif = Math.PI * Math.pow(SP.sedDorif, 2) / 4;
    r.deNorif = Math.ceil(r.deAorif / r.deSorif);
    r.deVverif = r.scQsMax / 1000 / (r.deSorif * r.deNorif);
    r.deVverifOk = r.deVverif > 0.125;
    r.deHf2 = Math.pow(SP.sedVorif, 2) / (2 * G_CONST);

    // Dispositivo de salida
    r.dsTasa = r.scQsMax / r.sedB;
    r.dsTasaOk = r.dsTasa >= 2 && r.dsTasa <= 7;
    r.dsTasaAdopt = SP.sedTasaAdopt;
    r.dsL = r.scQsMax / SP.sedTasaAdopt;
    r.dsGrosor = SP.sedGrosor;
    r.dsLamina = Math.pow(r.scQsMax / 1000 / SP.sedGrosor / r.dsL, 2 / 3);

    // Canaleta de agua sedimentada
    r.cssV = SP.sedVCan;
    r.cssSeccion = r.sedQ / 86400 / SP.sedVCan;
    r.cssAncho = SP.sedGrosor;
    r.cssH = r.cssSeccion / r.cssAncho;

    // Drenaje
    r.drA = r.sedAsNs;
    r.drHLodos = (r.sedH + 0.031 * (r.sedL / 2)) * 0.1;
    r.drCd = SP.sedCd;
    r.drTVaciado = SP.sedTVaciado;
    r.drD = Math.pow((4 / Math.PI) * ((2 * r.sedAsNs * Math.sqrt(r.drHLodos)) / (SP.sedCd * SP.sedTVaciado * 3600 * Math.sqrt(2 * G_CONST))), 0.5);
    r.drDmm = 300;

    // 9. Filtración
    r.filNf = r.sedNf;
    r.filTasa = SP.filTasa;
    r.filA = r.sedQ / r.filNf / SP.filTasa;
    r.filL1 = (r.sedB - 0.2) / 2;
    r.filL2 = r.filA / r.filL1;
    r.filExp = SP.filExp;
    r.filArena = SP.filArena;
    r.filVasc = SP.filVasc;
    r.filQlav = r.filA * SP.filVasc * 1000 / 60;
    r.filNCan = SP.filNCan;
    r.filACan = SP.filACan;
    r.filQcan = r.filQlav / 1000 / SP.filNCan * 60;
    r.filY = 0.05276 * Math.pow(r.filQcan / SP.filACan, 2 / 3);
    r.filBorde = 0.05;
    r.filAltTot = r.filBorde + r.filY;
    r.filSepBorde = SP.filSepBorde;
    r.filSepCan = (r.filL1 - SP.filNCan * SP.filACan - SP.filSepBorde * 2) / (SP.filNCan - 1);
    
    // Bomba de lavado y tanque
    r.filTLavado = SP.filTLavado;
    r.filTasaLav = SP.filVasc;
    r.filVtanque = r.filA * (SP.filTLavado * SP.filVasc) * Math.pow(SP.filNCan, 1 / 3);
    r.filVdisp = r.qd * 0.05 * SP.k1;
    r.filVtanqueVerif = r.filVdisp > r.filVtanque;
    r.filHoras = SP.filHoras;
    r.filFseg = SP.filFseg;
    r.filFrec = SP.filFrec;
    r.filTLlenado = SP.filTLlenado;
    r.filQb = r.filVtanque * 1000 / (SP.filTLlenado * 60);
    r.filP = 1000 * (r.filQb / 1000) * 12 / 75 / 0.5 * 1.2;
    r.filPadop = SP.filPadop;

    // 10. Cloración
    r.clTContacto = SP.clTContacto;
    r.clV = 1.3 * r.qd / 24 * (SP.clTContacto / 60);
    r.clLb = 2;
    r.clProf = 0.3;
    r.clSup = r.clV / 0.3;
    r.clAncho = Math.sqrt(r.clSup / 2);
    r.clLargo = r.clAncho * 2;
    r.clDosis = SP.clDosis;
    r.clConsumo = r.qd * 1000 * SP.clDosis / 1000000;
    r.clHipo = r.clConsumo / 0.08;
    r.clHipoMes = r.clHipo * 30 * 1.3;
    r.clRel = 0.25;
    r.clDisol = r.clHipo / 0.25;
    r.clTanque = SP.clTanque;
    r.clNecesidad = SP.clTanque * 0.25;
    r.clFrec = SP.clTanque / r.clDisol;
    r.clBomba = r.clDisol / 24;

    // 11. Reservorio de acumulación de agua tratada
    r.resV = r.qd / 24 * SP.k1 * SP.k2 * 2 * 1.5;
    r.resProf = SP.resProf;
    r.resD = Math.sqrt((r.resV / SP.resProf) * 4 / Math.PI);
    r.resH = 0.3 + SP.resProf;

    return r;
}

/* ================= POTAB: adopción automática ================= */
const TANQUES_MEZCLADOR = [2500, 5000, 7500, 10000, 15000, 20000, 25000, 30000, 40000, 50000];
const POTENCIAS_MEZCLADOR = [5, 7.5, 10, 15, 20, 25, 30, 40, 50, 60, 75];
const TANQUES_CLORACION = [750, 1000, 1500, 2000, 5000];
const POTENCIAS_BOMBA = [10, 15, 20, 25, 30, 40];

function potabAutoAdopt() {
    const qd = SP.caudalDiario, k1 = SP.k1, k3 = SP.k3;
    const qcapLps = qd * k1 * k3 * 1000 / 86400;
    const qcap = qcapLps / 1000;

    SP.vAsc = 8.6;
    SP.tAq = 31.6;

    let sel = null;
    for (const row of PARSHALL_TABLA) {
        if (row.min == null) continue;
        if (qcapLps < row.min || qcapLps > row.max) continue;
        const H = Math.pow(qcap / (2.2 * row.w), 2 / 3);
        const v = qcap / (row.w * 0.6 * H);
        if (v >= 2) { sel = row; break; }
    }
    if (!sel) {
        sel = PARSHALL_TABLA.find((row) => row.min != null && qcapLps >= row.min && qcapLps <= row.max)
            || PARSHALL_TABLA[4];
    }
    SP.parshallW = sel.w;
    SP.parshallN = sel.n;
    SP.parshallK = sel.k;
    SP.parshallA = sel.a;

    SP.cd = 0.6; SP.phi = 90; SP.hadoptado = 0.3; SP.b2hmaxAdopt = 0.3; SP.altParedExt = 0.2;
    SP.kPaletas = 2.3; SP.rpm = 105;
    SP.tCanal = 10;

    SP.mzTiempo = 2.35;
    const mzVcalc = (qcapLps * 3.6) * SP.mzTiempo / 60;
    SP.mzVolAdopt = TANQUES_MEZCLADOR.find((t) => t >= mzVcalc * 1000) ?? 2500;
    SP.mzAltura = 1.85;
    SP.mzEfic = 0.7; SP.mzCoef = 1.45;
    const mzP = SP.mzCoef * (0.0001029 * (SP.mzVolAdopt / 1000) * 1000 * 1000 / 76) / SP.mzEfic;
    SP.mzPadop = POTENCIAS_MEZCLADOR.find((p) => p >= mzP) ?? 7.5;

    const sedQ = qcap * 86400;
    let nf = Math.ceil(0.044 * Math.sqrt(sedQ));
    if (nf % 2 !== 0) nf += 1;
    if (nf < 2) nf = 2;
    SP.sedNfAdopt = nf;
    const ns = nf / 2;
    SP.sedLb = 3.98;
    SP.sedCsup = 0.1853;

    SP.flocTemp = 23; SP.flocProf = 1.7; SP.flocV1 = 0.175; SP.flocV2 = 0.425;
    SP.flocBAdopt = 0.7; SP.flocX = 22; SP.flocE = 0.002; SP.flocK = 2; SP.flocN = 0.01;

    SP.sedBaf = 0.234;
    SP.sedNComp = 4;
    SP.sedSepPct = 3.6; SP.sedSepFondo = 0.8; SP.sedVorif = 0.3; SP.sedDorif = 0.1;

    SP.sedTasaAdopt = 3.1; SP.sedGrosor = 0.1; SP.sedVCan = 1.2;
    SP.sedCd = 0.61; SP.sedTVaciado = 0.53;

    SP.filTasa = 120; SP.filExp = 30; SP.filArena = 0.7; SP.filVasc = 0.72; SP.filNCan = 3; SP.filACan = 0.2; SP.filSepBorde = 0.665;
    SP.filTLavado = 10; SP.filHoras = 4; SP.filFseg = 2.5; SP.filFrec = 1.5; SP.filTLlenado = 90; SP.filPadop = 20;

    SP.clTContacto = 20; SP.clDosis = 10; SP.clTanque = 750;
    SP.resProf = 3.6;
}

function applyPotabAuto() {
    potabAutoAdopt();
    savePotabState();
}

async function svgToPngUrl(svgString, w, h) {
    const img = new Image();
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
}

/* ================= POTAB: formularios ================= */
const POTAB_CAP_FIELDS = [
    { id: "caudalDiario", label: "Caudal diario (hoja de datos)", unit: "m³/d" },
    { id: "k1", label: "K1 — Consumo máx. diario", unit: "" },
    { id: "k2", label: "K2 — Consumo máx. horario", unit: "" },
    { id: "k3", label: "K3 — Planta de tratamiento", unit: "" },
];
const POTAB_AQ_FIELDS = [
    { id: "vAsc", label: "Velocidad ascensional (4 a 10)", unit: "cm/s" },
    { id: "tAq", label: "Tiempo de aquietamiento (30 a 60)", unit: "s" },
];
const POTAB_PARSHALL_FIELDS = [
    { id: "parshallW", label: "Ancho de garganta W", unit: "m" },
    { id: "parshallN", label: "Altura del escalón del resalto N", unit: "m" },
    { id: "parshallK", label: "Diferencia piso llegada–salida K", unit: "m" },
    { id: "parshallA", label: "A (dimensiones del canal)", unit: "m" },
];
const POTAB_VERTEDERO_FIELDS = [
    { id: "cd", label: "Cd — coeficiente de descarga", unit: "" },
    { id: "phi", label: "φ — ángulo del vertedero", unit: "°" },
    { id: "hadoptado", label: "H adoptado para el triángulo", unit: "m" },
    { id: "b2hmaxAdopt", label: "2Hmax adoptado", unit: "m" },
    { id: "altParedExt", label: "Altura de las paredes exteriores", unit: "m" },
];
const POTAB_GRADIENTE_FIELDS = [
    { id: "kPaletas", label: "Factor de forma de paletas K (2 a 7)", unit: "" },
    { id: "rpm", label: "Revoluciones por minuto", unit: "rpm" },
];
const POTAB_ESTAB_FIELDS = [
    { id: "tCanal", label: "Tiempo de retención", unit: "s" },
];
const POTAB_MEZCLADOR_FIELDS = [
    { id: "mzTiempo", label: "Tiempo de retención (1 a 3)", unit: "min" },
    { id: "mzVolAdopt", label: "Volumen adoptado", unit: "L" },
    { id: "mzAltura", label: "Altura del tanque", unit: "m" },
    { id: "mzEfic", label: "Eficiencia motor (0,6 a 0,8)", unit: "" },
    { id: "mzCoef", label: "Coef. de seguridad (1,4 a 1,5)", unit: "" },
    { id: "mzPadop", label: "Potencia adoptada del mezclador", unit: "HP" },
];
const POTAB_FLOCULADOR_FIELDS = [
    { id: "flocTemp", label: "Temperatura", unit: "°C" },
    { id: "flocProf", label: "Profundidad h (tanteo)", unit: "m" },
    { id: "flocV1", label: "Velocidad en canales v1 (0,15–0,20)", unit: "m/s" },
    { id: "flocV2", label: "Velocidad en pasos v2 (0,40–0,45)", unit: "m/s" },
    { id: "flocBAdopt", label: "Separación de canales adoptada b", unit: "m" },
    { id: "flocX", label: "Lado X (más ancho que largo)", unit: "m" },
    { id: "flocE", label: "Grosor de bafles e", unit: "m" },
    { id: "flocK", label: "Constante K pérdidas (2 a 3,5)", unit: "" },
    { id: "flocN", label: "Coef. Manning n (chapa lisa)", unit: "" },
];
const POTAB_SED_FIELDS = [
    { id: "sedTr", label: "Tiempo de retención tr (2,0 a 3,5)", unit: "h" },
    { id: "sedCsup", label: "Carga superficial Csup (0,13 a 0,26)", unit: "l/s/m²" },
    { id: "sedLb", label: "Relación Largo/Ancho (3 a 5)", unit: "" },
    { id: "sedNfAdopt", label: "Número de filtros adoptado (par)", unit: "unid" },
];
const POTAB_SED_CANALETA_FIELDS = [
    { id: "sedBaf", label: "Ancho del canal de agua floculada", unit: "m" },
    { id: "sedNComp", label: "Compuertas por sedimentador", unit: "unid" },
];
const POTAB_SED_ENTRADA_FIELDS = [
    { id: "sedSepPct", label: "Separación cortina (3 a 7)", unit: "%" },
    { id: "sedSepFondo", label: "Separación del fondo (0,6 a 0,9)", unit: "m" },
    { id: "sedVorif", label: "Velocidad por orificios (0,125 a 0,6)", unit: "m/s" },
    { id: "sedDorif", label: "Diámetro de cada orificio", unit: "m" },
];
const POTAB_SED_SALIDA_FIELDS = [
    { id: "sedTasaAdopt", label: "Tasa de salida adoptada", unit: "l/s/m" },
    { id: "sedGrosor", label: "Grosor del canal de salida", unit: "m" },
];
const POTAB_SED_SEDIMENTADA_FIELDS = [
    { id: "sedVCan", label: "Velocidad adoptada (> 0,5)", unit: "m/s" },
];
const POTAB_SED_DRENAJE_FIELDS = [
    { id: "sedCd", label: "Cd — coef. de salida del orificio", unit: "" },
    { id: "sedTVaciado", label: "Tiempo de vaciado", unit: "h" },
];
const POTAB_FILTRACION_FIELDS = [
    { id: "filTasa", label: "Tasa de filtración rápida", unit: "m³/m²/d" },
    { id: "filExp", label: "Expansión del lecho (20 a 50)", unit: "%" },
    { id: "filArena", label: "Tamaño efectivo de la arena", unit: "mm" },
    { id: "filVasc", label: "Velocidad ascensional lavado", unit: "m/min" },
    { id: "filNCan", label: "Canaletas de lavado por filtro", unit: "unid" },
    { id: "filACan", label: "Ancho de la canaleta de lavado", unit: "m" },
    { id: "filSepBorde", label: "Separación canaleta–borde lateral", unit: "m" },
];
const POTAB_FILTRACION_BOMBA_FIELDS = [
    { id: "filTLavado", label: "Tiempo de lavado ascensional", unit: "min" },
    { id: "filHoras", label: "Horas de lavado en 24 hs", unit: "h" },
    { id: "filFseg", label: "Factor de seguridad", unit: "" },
    { id: "filFrec", label: "Frecuencia de lavado", unit: "h" },
    { id: "filTLlenado", label: "Tiempo de llenado del tanque", unit: "min" },
    { id: "filPadop", label: "Potencia adoptada de la bomba", unit: "cv" },
];
const POTAB_CLORACION_FIELDS = [
    { id: "clTContacto", label: "Tiempo de contacto (20 a 30)", unit: "min" },
    { id: "clDosis", label: "Dosis aproximada de cloro", unit: "ppm" },
    { id: "clTanque", label: "Tanque de disolución adoptado", unit: "L" },
];
const POTAB_RESERVORIO_FIELDS = [
    { id: "resProf", label: "Profundidad adoptada (1 a 4)", unit: "m" },
];

function potabField(field, src = SP) {
    const val = src[field.id];
    return `
    <div class="field">
        <label>${esc(field.label)}</label>
        <div class="input-row">
            <input type="number" inputmode="decimal" id="in-${field.id}" value="${val}" step="any" min="0">
            ${field.unit ? `<span class="unit">${esc(field.unit)}</span>` : ""}
        </div>
    </div>`;
}

function potabBind(id) {
    const el = $("in-" + id);
    if (!el) return;
    el.addEventListener("input", () => { SP[id] = nf(el); savePotabState(); scheduleRecompute(); });
}

function potabForm(hostId, fields) {
    const host = $(hostId);
    if (!host) return;
    host.innerHTML = fields.map((fd) => potabField(fd)).join("");
    fields.forEach((fd) => potabBind(fd.id));
}

function renderPotabForms() {
    if (PAGE === "potab") {
        potabForm("potab-cap-form", POTAB_CAP_FIELDS);
        potabForm("potab-aq-form", POTAB_AQ_FIELDS);
        potabForm("potab-parshall-form", POTAB_PARSHALL_FIELDS);
        potabForm("potab-vertedero-form", POTAB_VERTEDERO_FIELDS);
        potabForm("potab-gradiente-form", POTAB_GRADIENTE_FIELDS);
        potabForm("potab-estab-form", POTAB_ESTAB_FIELDS);
        potabForm("potab-mezclador-form", POTAB_MEZCLADOR_FIELDS);
        potabForm("potab-floculador-form", POTAB_FLOCULADOR_FIELDS);
        potabForm("potab-sed-form", POTAB_SED_FIELDS);
        potabForm("potab-sed-canaleta-form", POTAB_SED_CANALETA_FIELDS);
        potabForm("potab-sed-entrada-form", POTAB_SED_ENTRADA_FIELDS);
        potabForm("potab-sed-salida-form", POTAB_SED_SALIDA_FIELDS);
        potabForm("potab-sed-sedimentada-form", POTAB_SED_SEDIMENTADA_FIELDS);
        potabForm("potab-sed-drenaje-form", POTAB_SED_DRENAJE_FIELDS);
        potabForm("potab-filtracion-form", POTAB_FILTRACION_FIELDS);
        potabForm("potab-filtracion-bomba-form", POTAB_FILTRACION_BOMBA_FIELDS);
        potabForm("potab-cloracion-form", POTAB_CLORACION_FIELDS);
        potabForm("potab-reservorio-form", POTAB_RESERVORIO_FIELDS);
    } else if (PAGE === "potab-auto") {
        potabForm("potab-base-form", [
            { id: "caudalDiario", label: "Caudal diario (hoja de datos)", unit: "m³/d" },
            { id: "k1", label: "K1 — Consumo máx. diario", unit: "" },
            { id: "k2", label: "K2 — Consumo máx. horario", unit: "" },
            { id: "k3", label: "K3 — Planta de tratamiento", unit: "" },
        ]);
        potabForm("potab-tanteo-form", [
            { id: "flocTemp", label: "Temperatura", unit: "°C" },
            { id: "flocProf", label: "Profundidad del floculador (tanteo)", unit: "m" },
            { id: "flocV1", label: "Velocidad en canales (tanteo)", unit: "m/s" },
            { id: "flocV2", label: "Velocidad en pasos (tanteo)", unit: "m/s" },
            { id: "sedTr", label: "Tiempo de retención sedimentador (tanteo)", unit: "h" },
        ]);
        applyPotabAuto();
    }
}

/* ================= POTAB: helpers de render ================= */
function potabRow(label, value, unit, badgeHtml) {
    return `<div class="result-row"><span class="r-label">${label}</span>
        <span class="r-value">${value}${unit ? ` <small>${esc(unit)}</small>` : ""}${badgeHtml || ""}</span></div>`;
}

function potabHl(label, value, unit, badgeHtml) {
    return `<div class="result-row highlight"><span class="r-label">${label}</span>
        <span class="r-value">${value}${unit ? ` <small>${esc(unit)}</small>` : ""}${badgeHtml || ""}</span></div>`;
}

/* ================= POTAB: renders ================= */
function renderPotabCaptacion(r) {
    const host = $("potab-cap-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabHl("Caudal de captación Q<sub>cap</sub>", f(r.qcapLps, 2), "l/s")}
            ${potabRow("Q<sub>cap</sub> en m³/s", f(r.qcap, 6), "m³/s")}
            ${potabRow("Caudal diario de diseño", f(r.qd, 2), "m³/d")}
            ${potabRow("K1 aplicado (Consumo diario)", f(SP.k1, 2), "")}
            ${potabRow("K3 aplicado (Pérdidas planta 5%)", f(SP.k3, 2), "")}
        </div>
        <p class="footnote">Q<sub>cap</sub> = Caudal diario · K1 · K3 · 1000 / 86400 (Clase 3, slides 5 y 20). K2 = 1.5 se reserva para el reservorio y red de distribución.</p>`;
}

function renderPotabAquietamiento(r) {
    const host = $("potab-aq-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Velocidad ascensional v", f(SP.vAsc, 1), "cm/s", (SP.vAsc >= 4 && SP.vAsc <= 10) ? `<span class="badge-state ok">✓ En rango (4–10)</span>` : `<span class="badge-state fail">✕ Fuera de rango</span>`)}
            ${potabHl("Área sección transversal A", f(r.aqArea, 3), "m²")}
            ${potabRow("Lados del aquietador (cuadrado)", f(r.aqLado, 3), "m")}
            ${potabRow("Tiempo de aquietamiento t", f(r.aqTiempo, 1), "s", (r.aqTiempo >= 30 && r.aqTiempo <= 60) ? `<span class="badge-state ok">✓ En rango (30–60)</span>` : `<span class="badge-state warn">⚠ Ajustar</span>`)}
            ${potabHl("Profundidad útil de la cámara", f(r.aqProf, 3), "m")}
            ${potabRow("Solera / revancha superior", f(r.aqSolera, 3), "m")}
            ${potabRow("Altura total con solera", f(r.aqHtot, 3), "m")}
        </div>
        <p class="footnote">A = Q / v · Profundidad = (Q · t) / A. (Clase 3, slides 21-23: Disipa energía del río para lograr régimen laminar manso sin turbulencias).</p>`;
    
    const figHost = $("potab-aq-dibujo");
    if (figHost) figHost.innerHTML = aquietamientoSVG(r);
}

function renderPotabParshall(r) {
    const host = $("potab-parshall-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Ancho de garganta W adoptado", f(r.phW, 3), "m")}
            ${potabHl("Altura del agua a la llegada H", f(r.phH, 3), "m")}
            ${potabRow("Escalón del resalto N", f(r.phN, 3), "m")}
            ${potabRow("Desnivel de piso K", f(r.phK, 3), "m")}
            ${potabRow("h₂ = 0,6·H (garganta)", f(r.phH2, 3), "m")}
            ${potabRow("H₃ = 0,7·H (salida)", f(r.phH3, 3), "m")}
            ${potabRow("Pérdida de carga h₁ = H − H₃ − K", f(r.phH1, 3), "m")}
            ${potabRow("Longitud A", f(r.phA, 3), "m")}
            ${potabRow("Punto medición carga: 2/3 · A", f(r.ph2_3A, 3), "m")}
            ${potabHl("Velocidad en garganta v = Q/(W·h₂)", f(r.phV, 2), "m/s",
                r.phVerif ? `<span class="badge-state ok">✓ Verifica (≥ 2 m/s) — Apto Mezclador Rápido</span>`
                           : `<span class="badge-state fail">✕ No verifica (&lt; 2 m/s) — Usar Vertedero en V</span>`)}
        </div>
        <p class="footnote">Clase 3 (slides 24-26): Si v ≥ 2 m/s, se inyecta sulfato de aluminio en el resalto y sirve de mezclador rápido. Si no verifica, se recurre a Vertedero en V.</p>`;
}

function renderPotabParshallTabla(r) {
    const host = $("potab-parshall-tabla");
    if (!host) return;
    host.innerHTML = `
        <table>
            <thead><tr><th>Garganta W</th><th>Ancho W (m)</th><th>Caudal mín (l/s)</th><th>Caudal máx (l/s)</th><th>Caudal medio (l/s)</th><th>A (m)</th><th>2/3 A (m)</th><th>N (m)</th><th>K (m)</th></tr></thead>
            <tbody>
            ${PARSHALL_TABLA.map((row) => `
                <tr class="${Math.abs(row.w - r.phW) < 1e-4 ? "selected-row" : ""}">
                    <td><strong>${esc(row.ref)}</strong></td>
                    <td>${f(row.w, 3)}</td>
                    <td>${row.min != null ? f(row.min, 2) : "—"}</td>
                    <td>${row.max != null ? f(row.max, 2) : "—"}</td>
                    <td>${row.min != null && row.max != null ? f((row.min + row.max) / 2, 2) : "—"}</td>
                    <td>${f(row.a, 3)}</td>
                    <td>${f(row.a * 2 / 3, 3)}</td>
                    <td>${f(row.n, 3)}</td>
                    <td>${f(row.k, 3)}</td>
                </tr>`).join("")}
            </tbody>
        </table>`;
}

function renderPotabVertedero(r) {
    const host = $("potab-vertedero-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Caudal Q", f(r.vQ, 6), "m³/s")}
            ${potabRow("Cd (coeficiente de descarga)", f(r.vCd, 2), "")}
            ${potabRow("Ángulo φ", f(r.vPhi, 0), "°")}
            ${potabHl("Hmax (lámina sobre el vertedero)", f(r.vHmax, 4), "m")}
            ${potabRow("H adoptado para el triángulo", f(r.vHadopt, 2), "m")}
            ${potabRow("2·Hmax (B)", f(r.v2Hmax, 3), "m")}
            ${potabRow("2·Hmax adoptado", f(r.v2HmaxAdopt, 2), "m")}
            ${potabRow("Altura del piso interior", f(r.vPisoInt, 3), "m")}
            ${potabRow("Altura de paredes exteriores", f(r.vParedExt, 2), "m")}
            ${potabRow("Ancho del piso", f(r.vAnchoPiso, 2), "m")}
        </div>
        <p class="footnote">Clase 3 (slides 27-28): Hmax = (Q / (8/15 · Cd · tan(φ/2) · √(2g)))^(2/5). Conviene Hmax mayor a la altura del agua.</p>`;
}

function renderPotabResalto(r) {
    const host = $("potab-resalto-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Caudal unitario q", f(r.vQuni, 4), "m³/s·m")}
            ${potabRow("Altura crítica hc", f(r.vHc, 4), "m")}
            ${potabRow("Profundidad después del vertedero h1", f(r.vH1, 4), "m")}
            ${potabRow("Velocidad inicio resalto V1", f(r.vV1, 2), "m/s")}
            ${potabRow("Número de Froude F", f(r.vF, 2), "")}
            ${potabRow("Altura después del resalto h2", f(r.vH2, 3), "m")}
            ${potabRow("Velocidad fin del resalto V2", f(r.vV2, 3), "m/s")}
            ${potabRow("Energía disipada hp", f(r.vHp, 3), "m")}
            ${potabRow("Longitud del resalto Lm", f(r.vLm, 3), "m")}
            ${potabRow("Distancia sección estable Lj", f(r.vLj, 3), "m")}
            ${potabRow("Velocidad promedio Vm", f(r.vVm, 3), "m/s")}
            ${potabRow("Tiempo de mezcla T", f(r.vT, 3), "s")}
        </div>
        <h3 style="margin-top:1.2rem;font-size:1rem;font-weight:700;color:var(--color-primary-dark)">Gradiente de velocidad G vs Gr</h3>
        <div class="results">
            ${potabRow("Peso específico γ", f(r.gamma, 0), "kgf/m³")}
            ${potabRow("Viscosidad cinemática ϑ", r.nu.toExponential(3), "m²/s")}
            ${potabRow("Viscosidad dinámica μ", r.mu.toExponential(3), "kg/m·s")}
            ${potabRow("Factor de forma de paletas K", f(SP.kPaletas, 1), "")}
            ${potabRow("Revoluciones por segundo", f(r.nRps, 2), "rps")}
            ${potabRow("Diámetro de paletas", f(r.paletaD, 3), "m")}
            ${potabRow("Volumen mezclador", f(r.mzVol, 0), "L")}
            ${potabRow("Gradiente mínimo de mezcla Gr", f(r.gr, 2), "s⁻¹")}
            ${potabHl("Gradiente del vertedero G", f(r.gVert, 2), "s⁻¹",
                r.gVertVerif ? `<span class="badge-state ok">✓ VERIFICA (G &gt; Gr)</span>`
                              : `<span class="badge-state fail">✕ NO VERIFICA (G ≤ Gr)</span>`)}
        </div>
        <p class="footnote">Clase 3 (slide 29): El gradiente G debe superar a Gr para garantizar coalescencia entre agua y coagulante.</p>`;

    const figHost = $("potab-vertedero-dibujo");
    if (figHost) figHost.innerHTML = vertederoSVG(r);
}

function renderPotabEstabilizacion(r) {
    const host = $("potab-estab-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Tiempo de retención adoptado t", f(r.estT, 1), "s")}
            ${potabRow("Velocidad fin del resalto V2", f(r.estV2, 3), "m/s")}
            ${potabHl("Longitud del canal de estabilización L", f(r.estL, 2), "m")}
        </div>
        <p class="footnote">L = t · V2 (t = 10 s para amortiguar el flujo antes del floculador).</p>`;
}

function renderPotabMezclador(r) {
    const host = $("potab-mezclador-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Caudal de proyecto", f(r.mzQCaudal, 2), "m³/h")}
            ${potabRow("Tiempo de retención", f(r.mzTiempo, 2), "min")}
            ${potabRow("Volumen del tanque calculado", f(r.mzVtanque, 2), "m³")}
            ${potabRow("Volumen adoptado", f(r.mzVAdoptL, 0), "L")}
            ${potabRow("Altura del tanque", f(r.mzAltura, 2), "m")}
            ${potabHl("Diámetro del tanque", f(r.mzDiam, 3), "m")}
            ${potabRow("Eficiencia del motor (η)", f(r.mzEfic, 2), "")}
            ${potabRow("Coeficiente de seguridad", f(r.mzCoef, 2), "")}
            ${potabRow("Potencia calculada", f(r.mzP, 2), "HP")}
            ${potabHl("Potencia adoptada del motor", f(r.mzPadop, 1), "HP")}
            ${potabRow("Longitud del brazo (2/3 H)", f(r.mzBrazo, 3), "m")}
            ${potabRow("Diámetro de la paleta (70% D)", f(r.paletaD, 3), "m")}
        </div>
        <p class="footnote">Clase 3 (slides 30-31): Mezclador mecánico en caso de no verificar vertedero. Paleta a 2/3 de altura, diámetro 70–80%.</p>`;
}

function renderPotabFloculador(r) {
    const host = $("potab-floculador-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Temperatura del agua", f(r.flTemp, 0), "°C")}
            ${potabRow("Viscosidad cinemática ϑ", r.nu.toExponential(3), "m²/s")}
            ${potabRow("Periodo de retención t", f(1800, 0), "s (30 min)")}
            ${potabRow("Profundidad adoptada h", f(r.flProf, 2), "m")}
            ${potabRow("Velocidad en canales v1 (tanteo)", f(SP.flocV1, 3), "m/s")}
            ${potabRow("Separación canales calculada b", f(r.flB, 3), "m")}
            ${potabRow("Separación canales adoptada b", f(r.flBAdopt, 2), "m")}
            ${potabHl("Velocidad recalculada v1", f(r.flV1rec, 3), "m/s",
                (r.flV1rec >= 0.15 && r.flV1rec <= 0.20) ? `<span class="badge-state ok">✓ En rango (0,15–0,20)</span>`
                    : (r.flV1rec < 0.15 ? `<span class="badge-state warn">⚠ Bajo el mínimo</span>` : `<span class="badge-state fail">✕ Sobre el máximo</span>`))}
            ${potabRow("Ancho del paso en curvas b' = 1,5·b", f(r.flBp, 3), "m")}
            ${potabRow("Volumen de retención V", f(r.flV, 2), "m³")}
            ${potabRow("Área superficial A", f(r.flA, 2), "m²")}
            ${potabRow("Lado aprox. (A / b_sed)", f(r.flLadoAprox, 2), "m")}
            ${potabRow("Lado X adoptado", f(r.flX, 0), "m")}
            ${potabRow("Número de canales N", f(r.flN, 0), "unid")}
            ${potabRow("Número de bafles N1 = N - 1", f(r.flN1, 0), "unid")}
            ${potabRow("Grosor de bafles e", f(r.flE, 3), "m")}
            ${potabRow("Lado Y transversal", f(r.flY, 3), "m")}
            ${potabRow("Longitud recta de un canal L", f(r.flL, 2), "m")}
            ${potabRow("Longitud total de canales Lt", f(r.flLt, 2), "m")}
            ${potabRow("Pérdida en canales Hcanales", f(r.flHcanales, 4), "m")}
            ${potabRow("Pérdida en curvas Hvueltas", f(r.flHvueltas, 4), "m")}
            ${potabRow("Radio hidráulico RH", f(r.flRH, 3), "m")}
            ${potabRow("Pérdida por fricción j1 (Manning n=0.01)", r.flJ1.toExponential(3), "m/m")}
            ${potabRow("Pérdida por fricción total h1", f(r.flH1, 4), "m")}
            ${potabHl("Pérdida de carga total Hftotal", f(r.flHftotal, 4), "m")}
            ${potabRow("Pendiente de fondo i = Hftotal / X", f(r.flI, 4), "")}
            ${potabHl("Gradiente de velocidad G", f(r.flG, 2), "s⁻¹",
                r.flGVerif ? `<span class="badge-state ok">✓ VERIFICA (30 ≤ G ≤ 60 s⁻¹)</span>`
                            : `<span class="badge-state fail">✕ NO VERIFICA (Fuera de 30–60)</span>`)}
        </div>
        <p class="footnote">Clase 3 (slides 32-34): Floculador de pantallas. El gradiente G debe estar entre 30 y 60 s⁻¹ para que los flóculos no sedimenten ni se rompan.</p>`;

    const figHost = $("potab-floculador-dibujo");
    if (figHost) figHost.innerHTML = floculadorSVG(r);
}

function renderPotabSed(r) {
    const host = $("potab-sed-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Tiempo de retención tr", f(r.sedTr, 1), "h")}
            ${potabRow("Caudal de diseño Qcap", f(r.sedQ, 2), "m³/d")}
            ${potabRow("Nº filtros Morril y Wallace", f(r.sedNfCalc, 2), "unid")}
            ${potabRow("Nº filtros adoptado (SIEMPRE PAR)", f(r.sedNf, 0), "unid")}
            ${potabHl("Nº sedimentadores Ns = Nf / 2", f(r.sedNs, 0), "unid")}
            ${potabRow("Volumen total necesario V", f(r.sedV, 2), "m³")}
            ${potabRow("Volumen por sedimentador Vs", f(r.sedVs, 2), "m³")}
            ${potabRow("Carga superficial Csup adoptada", f(r.sedCsup, 4), "l/s/m²")}
            ${potabRow("Csup en m³/d/m²", f(r.sedCsupM3, 2), "")}
            ${potabRow("Área total del sedimentador As", f(r.sedAs, 2), "m²")}
            ${potabRow("Área por sedimentador AsNs", f(r.sedAsNs, 2), "m²")}
            ${potabHl("Altura útil del sedimentador H", f(r.sedH, 3), "m")}
            ${potabRow("Relación Largo/Ancho adoptada (3–5)", f(r.sedLb, 2), "")}
            ${potabHl("Largo interior L", f(r.sedL, 3), "m")}
            ${potabRow("Largo total exterior (muros 20 cm)", f(r.sedLext, 3), "m")}
            ${potabHl("Ancho interior b", f(r.sedB, 3), "m")}
            ${potabRow("Ancho total exterior batería", f(r.sedBext, 3), "m")}
            ${potabRow("Verificación relación Largo/Profundidad", f(r.sedLH, 2),
                r.sedLHVerif ? `<span class="badge-state ok">✓ Verifica (7 ≤ L/H ≤ 30)</span>`
                              : `<span class="badge-state fail">✕ No verifica</span>`)}
        </div>
        <p class="footnote">Clase 3 (slides 35-36): Morril & Wallace define Nf siempre par. Ns = Nf / 2. Muros externos de 20 cm.</p>`;

    const figHost = $("potab-sed-dibujo");
    if (figHost) figHost.innerHTML = sedimentadorSVG(r);
}

function renderPotabSedCanaleta(r) {
    const host = $("potab-sed-canaleta-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Caudal máx por sedimentador Qs max", f(r.scQsMax, 2), "l/s")}
            ${potabRow("Número de compuertas por unidad", f(r.scNComp, 0), "unid")}
            ${potabRow("Caudal a la última compuerta Qs min", f(r.scQsMin, 2), "l/s")}
            ${potabRow("Velocidad de agua floculada adoptada", f(r.scV, 3), "m/s")}
            ${potabRow("Sección canaleta a caudal máx Saf max", f(r.scSafMax, 3), "m²")}
            ${potabRow("Sección canaleta a caudal mín Saf min", f(r.scSafMin, 3), "m²")}
            ${potabRow("Ancho canaleta adoptado baf", f(r.scBaf, 3), "m")}
            ${potabHl("Altura máxima haf max", f(r.scHafMax, 2), "m",
                r.scVerif ? `<span class="badge-state ok">✓ Verifica (= profundidad floculador)</span>`
                           : `<span class="badge-state fail">✕ Cambiar ancho</span>`)}
            ${potabRow("Altura mínima haf min", f(r.scHafMin, 3), "m")}
        </div>
        <p class="footnote">Clase 3 (slide 37): El fondo de la canaleta va subiendo para mantener caudal constante en cada compuerta.</p>`;
}

function renderPotabSedEntrada(r) {
    const host = $("potab-sed-entrada-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Velocidad compuerta adoptada (v < 0,3)", f(r.deV, 3), "m/s")}
            ${potabRow("Sección por compuerta Scomp", f(r.deScomp, 3), "m²")}
            ${potabRow("Ancho compuerta bcomp", f(r.deBcomp, 3), "m")}
            ${potabRow("Pérdida de carga en compuerta hf", f(r.deHf, 4), "m")}
            ${potabRow("Separación cortina distribución", f(r.deSepPct, 1), "%")}
            ${potabRow("Separación tabique compuertas", f(r.deSepTab, 3), "m", (r.deSepTab >= 0.6) ? `<span class="badge-state ok">✓ ≥ 0,6 m (Paso operario)</span>` : `<span class="badge-state fail">✕ Pequeño</span>`)}
            ${potabRow("Separación orificios del fondo", f(r.deSepFondo, 2), "m", (r.deSepFondo >= 0.6 && r.deSepFondo <= 0.9) ? `<span class="badge-state ok">✓ En rango (0,6–0,9)</span>` : `<span class="badge-state warn">⚠ Ajustar</span>`)}
            ${potabRow("Velocidad orificios adoptada (0,125–0,6)", f(r.deVorif, 2), "m/s")}
            ${potabRow("Área total de orificios Aorif", f(r.deAorif, 3), "m²")}
            ${potabRow("Diámetro adoptado para orificios", f(r.deDorif, 2), "m (100 mm)")}
            ${potabRow("Sección por orificio Sorif", f(r.deSorif, 4), "m²")}
            ${potabHl("Número de orificios previstos", f(r.deNorif, 0), "unid")}
            ${potabRow("Verificación velocidad real en orificios", f(r.deVverif, 3), "m/s",
                r.deVverifOk ? `<span class="badge-state ok">✓ Verifica (> 0,125 m/s)</span>`
                              : `<span class="badge-state fail">✕ No verifica</span>`)}
            ${potabRow("Pérdida en orificios hf", f(r.deHf2, 4), "m")}
        </div>`;
}

function renderPotabSedSalida(r) {
    const host = $("potab-sed-salida-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Tasa sobre ancho de sedimentador", f(r.dsTasa, 2), "l/s/m",
                r.dsTasaOk ? `<span class="badge-state ok">✓ En rango (2 a 7 l/s/m)</span>`
                            : `<span class="badge-state fail">✕ Aumentar longitud</span>`)}
            ${potabRow("Tasa adoptada para vertedor", f(r.dsTasaAdopt, 2), "l/s/m")}
            ${potabHl("Longitud total requerida vertedor", f(r.dsL, 3), "m")}
            ${potabRow("Grosor del vertedor de salida", f(r.dsGrosor, 2), "m")}
            ${potabRow("Lámina de agua sobre vertedor", f(r.dsLamina, 3), "m")}
        </div>
        <p class="footnote">Clase 3 (slide 39): Si la longitud requerida supera el ancho del sedimentador, se instalan vertedores perimetrales tipo 'finger weirs'.</p>`;
}

function renderPotabSedSedimentada(r) {
    const host = $("potab-sed-sedimentada-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Velocidad adoptada canaleta (> 0,5)", f(r.cssV, 2), "m/s")}
            ${potabRow("Sección mojada canaleta", f(r.cssSeccion, 3), "m²")}
            ${potabRow("Ancho canaleta adoptado", f(r.cssAncho, 2), "m")}
            ${potabHl("Altura de lámina de agua canaleta", f(r.cssH, 3), "m")}
        </div>`;
}

function renderPotabSedDrenaje(r) {
    const host = $("potab-sed-drenaje-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Área de cada sedimentador", f(r.drA, 2), "m²")}
            ${potabRow("Altura total de lodos a purgar (10%)", f(r.drHLodos, 3), "m")}
            ${potabRow("Cd salida del orificio", f(r.drCd, 2), "")}
            ${potabRow("Tiempo de vaciado adoptado", f(r.drTVaciado, 2), "h")}
            ${potabRow("Diámetro calculado tubería", f(r.drD, 3), "m")}
            ${potabHl("Diámetro comercial adoptado tubería", f(r.drDmm, 0), "mm")}
        </div>
        <p class="footnote">Clase 3 (slide 40): Se purga el 10% de la altura útil de lodos asentados en el fondo con válvula manual.</p>`;
}

function renderPotabFiltracion(r) {
    const host = $("potab-filtracion-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Nº de filtros rápidos Nf", f(r.filNf, 0), "unid")}
            ${potabRow("Tasa de filtración adoptada", f(r.filTasa, 0), "m³/m²/d")}
            ${potabHl("Área filtrante de cada unidad", f(r.filA, 3), "m²")}
            ${potabRow("Lado 1 (ancho filtro)", f(r.filL1, 3), "m")}
            ${potabRow("Lado 2 (largo filtro)", f(r.filL2, 3), "m")}
            ${potabRow("Expansión del lecho de arena", f(r.filExp, 0), "% (Se eleva 30 cm)")}
            ${potabRow("Tamaño efectivo de la arena", f(r.filArena, 1), "mm (Arroyo manso)")}
            ${potabRow("Velocidad ascensional de lavado", f(r.filVasc, 2), "m/min (0,70–0,75)")}
            ${potabHl("Caudal de lavado por filtro", f(r.filQlav, 2), "l/s")}
        </div>
        <h3 style="margin-top:1.2rem;font-size:1rem;font-weight:700;color:var(--color-primary-dark)">Canaleta colectora de agua de lavado</h3>
        <div class="results">
            ${potabRow("Nº de canaletas adoptado", f(r.filNCan, 0), "unid")}
            ${potabRow("Ancho canaleta de lavado", f(r.filACan, 2), "m")}
            ${potabRow("Caudal por canaleta", f(r.filQcan, 3), "m³/min")}
            ${potabRow("Altura de agua en canaleta Y", f(r.filY, 3), "m")}
            ${potabRow("Borde libre y'", f(r.filBorde, 2), "m")}
            ${potabRow("Altura total canaleta", f(r.filAltTot, 3), "m")}
            ${potabRow("Separación canaleta–borde lateral", f(r.filSepBorde, 3), "m",
                r.filSepBorde <= 0.9 ? `<span class="badge-state ok">✓ Verifica (≤ 0,9 m)</span>`
                                     : `<span class="badge-state fail">✕ No verifica</span>`)}
            ${potabRow("Separación entre canaletas", f(r.filSepCan, 3), "m",
                r.filSepCan <= 1.8 ? `<span class="badge-state ok">✓ Verifica (≤ 1,8 m)</span>`
                                   : `<span class="badge-state fail">✕ No verifica</span>`)}
        </div>
        <p class="footnote">Clase 3 (slides 41-44): Filtros rápidos de arena. Se eleva 30 cm el lecho con 30 cm de resguardo obligatorio.</p>`;

    const figHost = $("potab-filtracion-dibujo");
    if (figHost) figHost.innerHTML = filtracionSVG(r);
}

function renderPotabFiltracionBomba(r) {
    const host = $("potab-filtracion-bomba-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Tiempo de lavado ascensional", f(r.filTLavado, 0), "min")}
            ${potabRow("Tasa de flujo de lavado", f(r.filTasaLav, 2), "m³/m²/min")}
            ${potabHl("Volumen del tanque de retrolavado", f(r.filVtanque, 2), "m³")}
            ${potabRow("Volumen disponible de planta (5% Qcap)", f(r.filVdisp, 2), "m³",
                r.filVtanqueVerif ? `<span class="badge-state ok">✓ Verifica (Disponible > Tanque)</span>`
                                  : `<span class="badge-state fail">✕ No verifica</span>`)}
            ${potabRow("Horas de lavado en 24 hs", f(r.filHoras, 0), "h")}
            ${potabRow("Factor de seguridad adoptado", f(r.filFseg, 1), "")}
            ${potabRow("Frecuencia de lavado", f(r.filFrec, 1), "h")}
            ${potabRow("Tiempo de llenado del tanque", f(r.filTLlenado, 0), "min")}
            ${potabRow("Caudal de bombeo de llenado", f(r.filQb, 2), "l/s")}
            ${potabRow("Potencia de la bomba calculada", f(r.filP, 2), "cv")}
            ${potabHl("Potencia adoptada para la bomba", f(r.filPadop, 0), "cv")}
        </div>
        <p class="footnote">Clase 3 (slide 45): Bomba y tanque de lavado con motobomba y circuito de retrolavado.</p>`;
}

function renderPotabCloracion(r) {
    const host = $("potab-cloracion-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabRow("Tiempo de contacto adoptado", f(r.clTContacto, 0), "min (20 a 30 min)")}
            ${potabHl("Volumen de reservorio de contacto (+30%)", f(r.clV, 2), "m³")}
            ${potabRow("Relación largo/ancho", f(r.clLb, 0), "")}
            ${potabRow("Profundidad de la cámara", f(r.clProf, 2), "m (Poco profundo)")}
            ${potabRow("Superficie de contacto", f(r.clSup, 2), "m²")}
            ${potabRow("Ancho", f(r.clAncho, 3), "m")}
            ${potabRow("Largo", f(r.clLargo, 3), "m")}
            ${potabRow("Dosis adoptada", f(r.clDosis, 0), "ppm (8 a 10 mg/L)")}
            ${potabRow("Consumo diario de cloro puro", f(r.clConsumo, 2), "Kg Cl2/d")}
            ${potabHl("Consumo diario Hipoclorito de Sodio (8%)", f(r.clHipo, 2), "l/d")}
            ${potabRow("Consumo mensual (+30% reserva)", f(r.clHipoMes, 2), "l/mes")}
            ${potabRow("Relación de disolución adoptada", "1 / 4 (0.25)", "")}
            ${potabRow("Consumo diario en disolución", f(r.clDisol, 2), "L/d")}
            ${potabRow("Tanque comercial adoptado (polietileno)", f(r.clTanque, 0), "L")}
            ${potabRow("Cloro concentrado necesario por recarga", f(r.clNecesidad, 2), "L")}
            ${potabRow("Frecuencia de recarga del tanque", f(r.clFrec, 3), "d (" + f(r.clFrec * 24, 1) + " h)")}
            ${potabHl("Caudal de la bomba dosadora", f(r.clBomba, 2), "L/h")}
        </div>
        <p class="footnote">Clase 3 (slides 46-47): Se usa hipoclorito de sodio diluido 1:4 en tanques comerciales de polietileno/fibra de vidrio para no corroer el hormigón.</p>`;
}

function renderPotabReservorio(r) {
    const host = $("potab-reservorio-content");
    if (!host) return;
    host.innerHTML = `
        <div class="results">
            ${potabHl("Volumen de regulación y reserva", f(r.resV, 2), "m³")}
            ${potabRow("Profundidad adoptada (1 a 4)", f(r.resProf, 2), "m")}
            ${potabHl("Diámetro del reservorio circular", f(r.resD, 3), "m")}
            ${potabRow("Altura de construcción (+30 cm enterrado)", f(r.resH, 2), "m")}
        </div>
        <p class="footnote">Clase 3 (slide 48): Almacenamiento de agua tratada. Profundidad 1 a 4 m para lograr diámetro cómodo. Se añade 30 cm de revancha enterrado.</p>`;
}

function renderPotabHero(r) {
    const host = $("potab-hero-kpis");
    if (!host) return;
    host.innerHTML =
        kpi("Caudal captación Qcap", f(r.qcapLps, 2), "l/s") +
        kpi("Nº filtros rápidos", f(r.sedNf, 0), "unid") +
        kpi("Nº sedimentadores", f(r.sedNs, 0), "unid") +
        kpi("Vol. reservorio", f(r.resV, 0), "m³");
}

function renderPotabAutoResults(r) {
    const host = $("potab-auto-results");
    if (!host) return;
    host.innerHTML = `
        <div class="panel">
            <h3>1 · Captación y cámara de aquietamiento</h3>
            <div class="results">
                ${potabHl("Caudal de captación Qcap", f(r.qcapLps, 2), "l/s")}
                ${potabRow("Velocidad ascensional adoptada", f(SP.vAsc, 1), "cm/s")}
                ${potabRow("Tiempo de aquietamiento adoptado", f(SP.tAq, 1), "s")}
                ${potabRow("Área de aquietamiento", f(r.aqArea, 3), "m²")}
                ${potabRow("Lados del aquietador", f(r.aqLado, 3), "m")}
                ${potabRow("Profundidad de la cámara", f(r.aqProf, 3), "m")}
            </div>
            <div class="fig-wrap">${aquietamientoSVG(r, "auto")}</div>
        </div>
        <div class="panel" style="margin-top:1.2rem">
            <h3>2 · Canal Parshall — mezclador rápido</h3>
            <div class="results">
                ${potabRow("Garganta W adoptada", f(r.phW, 3), "m")}
                ${potabRow("Altura del agua H", f(r.phH, 3), "m")}
                ${potabRow("Velocidad v", f(r.phV, 2), "m/s",
                    r.phVerif ? `<span class="badge-state ok">✓ Verifica (≥ 2 m/s)</span>` : `<span class="badge-state fail">✕ No verifica</span>`)}
            </div>
            <div class="fig-wrap">${parshallSVG(r, "auto", "calc")}</div>
        </div>
        <div class="panel" style="margin-top:1.2rem">
            <h3>3 · Vertedero en “V” y gradiente</h3>
            <div class="results">
                ${potabRow("Hmax", f(r.vHmax, 3), "m")}
                ${potabRow("Gradiente del vertedor G", f(r.gVert, 1), "s⁻¹",
                    r.gVertVerif ? `<span class="badge-state ok">✓ G &gt; Gr</span>` : `<span class="badge-state fail">✕ No verifica</span>`)}
            </div>
            <div class="fig-wrap">${vertederoSVG(r, "auto")}</div>
        </div>
        <div class="panel" style="margin-top:1.2rem">
            <h3>4 · Floculador / mezclador lento</h3>
            <div class="results">
                ${potabRow("Separación de canales b adoptada", f(r.flBAdopt, 2), "m")}
                ${potabRow("Velocidad recalculada v1", f(r.flV1rec, 3), "m/s")}
                ${potabRow("Lado X adoptado", f(r.flX, 0), "m")}
                ${potabRow("Nº de canales N", f(r.flN, 0), "unid")}
                ${potabRow("Gradiente G", f(r.flG, 1), "s⁻¹",
                    r.flGVerif ? `<span class="badge-state ok">✓ Verifica</span>` : `<span class="badge-state fail">✕ No verifica</span>`)}
            </div>
            <div class="fig-wrap">${floculadorSVG(r, "auto")}</div>
        </div>
        <div class="panel" style="margin-top:1.2rem">
            <h3>5 · Sedimentador</h3>
            <div class="results">
                ${potabRow("Nº filtros / sedimentadores", f(r.sedNf, 0) + " / " + f(r.sedNs, 0), "unid")}
                ${potabRow("Carga superficial Csup adoptada", f(r.sedCsup, 4), "l/s/m²")}
                ${potabRow("Largo / Ancho / Altura", f(r.sedL, 1) + " / " + f(r.sedB, 1) + " / " + f(r.sedH, 2), "m")}
                ${potabRow("Verificación L/H", f(r.sedLH, 1),
                    r.sedLHVerif ? `<span class="badge-state ok">✓ Verifica</span>` : `<span class="badge-state fail">✕ No verifica</span>`)}
            </div>
            <div class="fig-wrap">${sedimentadorSVG(r, "auto")}</div>
        </div>
        <div class="panel" style="margin-top:1.2rem">
            <h3>6 · Filtración</h3>
            <div class="results">
                ${potabRow("Área de cada filtro", f(r.filA, 2), "m²")}
                ${potabRow("Caudal de lavado", f(r.filQlav, 1), "l/s")}
                ${potabRow("Canaletas de lavado adoptadas", f(r.filNCan, 0), "unid")}
                ${potabRow("Volumen del tanque de lavado", f(r.filVtanque, 1), "m³",
                    r.filVtanqueVerif ? `<span class="badge-state ok">✓ Verifica</span>` : `<span class="badge-state fail">✕ No verifica</span>`)}
                ${potabRow("Potencia adoptada de la bomba", f(r.filPadop, 0), "cv")}
            </div>
            <div class="fig-wrap">${filtracionSVG(r, "auto")}</div>
        </div>
        <div class="panel" style="margin-top:1.2rem">
            <h3>7 · Cloración y reservorio</h3>
            <div class="results">
                ${potabRow("Volumen de contacto", f(r.clV, 1), "m³")}
                ${potabRow("Consumo diario de cloro", f(r.clConsumo, 1), "Kg Cl2")}
                ${potabRow("Hipoclorito de sodio (8%)", f(r.clHipo, 0), "l/d")}
                ${potabRow("Bomba dosadora", f(r.clBomba, 1), "L/h")}
                ${potabRow("Tanque de disolución adoptado", f(r.clTanque, 0), "L")}
                ${potabHl("Reservorio de agua tratada", f(r.resV, 0), "m³")}
                ${potabRow("Profundidad adoptada", f(r.resProf, 1), "m")}
                ${potabRow("Diámetro del reservorio", f(r.resD, 1), "m")}
            </div>
        </div>
        <p class="footnote">Los valores adoptados se calculan y redondean de acuerdo con las especificaciones pedagógicas de la Clase 3 y la planilla Excel de la cátedra.</p>`;
}

function renderPotabAll(auto) {
    if (auto) applyPotabAuto();
    const r = potabCalc();
    renderPotabHero(r);
    renderPotabCaptacion(r);
    renderPotabAquietamiento(r);
    renderPotabParshall(r);
    renderPotabParshallTabla(r);
    renderPotabParshallDibujo(r);
    renderPotabVertedero(r);
    renderPotabResalto(r);
    renderPotabEstabilizacion(r);
    renderPotabMezclador(r);
    renderPotabFloculador(r);
    renderPotabSed(r);
    renderPotabSedCanaleta(r);
    renderPotabSedEntrada(r);
    renderPotabSedSalida(r);
    renderPotabSedSedimentada(r);
    renderPotabSedDrenaje(r);
    renderPotabFiltracion(r);
    renderPotabFiltracionBomba(r);
    renderPotabCloracion(r);
    renderPotabReservorio(r);
    if (auto) renderPotabAutoResults(r);
    renderInformePotab(r);
    renderFormulas();
}

/* ================= POTAB: informe ================= */
function collectPotabReportData(r) {
    const fecha = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
    const kv = (l, v, u) => [l, v, u];
    const inputs = [
        kv("Caudal diario", f(r.qd, 2), "m³/d"),
        kv("K1 — Consumo máx. diario", SP.k1, ""),
        kv("K2 — Consumo máx. horario", SP.k2, ""),
        kv("K3 — Planta de tratamiento", SP.k3, ""),
        kv("Caudal de captación Qcap", f(r.qcapLps, 2), "l/s"),
    ];
    const aquiet = [
        kv("Velocidad ascensional", SP.vAsc, "cm/s"),
        kv("Área sección transversal", f(r.aqArea, 3), "m²"),
        kv("Lados del aquietador", f(r.aqLado, 3), "m"),
        kv("Profundidad de la cámara", f(r.aqProf, 3), "m"),
    ];
    const parshall = [
        kv("Ancho de garganta W", f(r.phW, 3), "m"),
        kv("Altura del agua H", f(r.phH, 3), "m"),
        kv("h2 = 0,6·H", f(r.phH2, 3), "m"),
        kv("H3 = 0,7·H", f(r.phH3, 3), "m"),
        kv("Pérdida de carga h1", f(r.phH1, 3), "m"),
        kv("Velocidad", f(r.phV, 2), "m/s"),
        kv("Verificación (≥ 2 m/s)", r.phVerif ? "Verifica" : "No verifica", ""),
    ];
    const vertedero = [
        kv("Hmax", f(r.vHmax, 4), "m"),
        kv("Gradiente G", f(r.gVert, 2), "s⁻¹"),
        kv("Gradiente Gr", f(r.gr, 2), "s⁻¹"),
        kv("Verificación G > Gr", r.gVertVerif ? "Verifica" : "No verifica", ""),
    ];
    const floculador = [
        kv("Separación de canales b", f(r.flBAdopt, 2), "m"),
        kv("Velocidad v1", f(r.flV1rec, 3), "m/s"),
        kv("Nº de canales", f(r.flN, 0), "unid"),
        kv("Pérdida total", f(r.flHftotal, 4), "m"),
        kv("Gradiente G", f(r.flG, 2), "s⁻¹"),
        kv("Verificación (30–60)", r.flGVerif ? "Verifica" : "No verifica", ""),
    ];
    const sedimentador = [
        kv("Tiempo de retención", f(r.sedTr, 1), "h"),
        kv("Nº de filtros", f(r.sedNf, 0), "unid"),
        kv("Nº de sedimentadores", f(r.sedNs, 0), "unid"),
        kv("Largo", f(r.sedL, 2), "m"),
        kv("Ancho", f(r.sedB, 2), "m"),
        kv("Altura útil", f(r.sedH, 3), "m"),
        kv("Verificación L/H", r.sedLHVerif ? "Verifica" : "No verifica", ""),
    ];
    const filtracion = [
        kv("Área de cada filtro", f(r.filA, 3), "m²"),
        kv("Caudal de lavado", f(r.filQlav, 2), "l/s"),
        kv("Volumen del tanque de lavado", f(r.filVtanque, 2), "m³"),
        kv("Potencia de la bomba", f(r.filPadop, 0), "cv"),
    ];
    const cloracion = [
        kv("Volumen de contacto", f(r.clV, 2), "m³"),
        kv("Consumo diario de cloro", f(r.clConsumo, 2), "Kg Cl2"),
        kv("Hipoclorito de sodio (8%)", f(r.clHipo, 2), "l/d"),
        kv("Bomba dosadora", f(r.clBomba, 2), "L/h"),
    ];
    const reservorio = [
        kv("Volumen", f(r.resV, 2), "m³"),
        kv("Diámetro", f(r.resD, 3), "m"),
        kv("Altura de construcción", f(r.resH, 2), "m"),
    ];
    const conclusion = "Planta potabilizadora dimensionada para un caudal de captación de "
        + f(r.qcapLps, 2) + " l/s. Se adoptan " + f(r.sedNf, 0) + " filtros y " + f(r.sedNs, 0)
        + " sedimentadores. El gradiente del vertedero en V " + (r.gVertVerif ? "verifica" : "no verifica")
        + " (G = " + f(r.gVert, 1) + " s⁻¹ vs Gr = " + f(r.gr, 1) + " s⁻¹) y el del floculador "
        + (r.flGVerif ? "verifica" : "no verifica") + " (G = " + f(r.flG, 1) + " s⁻¹). "
        + "Reservorio de agua tratada de " + f(r.resV, 0) + " m³.";
    return {
        fecha, inputs, aquiet, parshall, vertedero, floculador, sedimentador, filtracion, cloracion, reservorio, conclusion,
        parshallSvg: parshallSVG(r, "report", "calc"),
    };
}

function buildPotabReportHTML(d) {
    const row = (t) => `<tr><td class="pl">${esc(t[0])}</td><td class="pv">${t[1]}</td><td class="pu">${esc(t[2])}</td></tr>`;
    const table = (rows) => `<table>
        <thead><tr><th>Parámetro</th><th>Valor</th><th>Unidad</th></tr></thead>
        <tbody>${rows.map(row).join("")}</tbody></table>`;
    const card = (title, rows) => `<div class="info-card"><h5>${esc(title)}</h5>${table(rows)}</div>`;
    return `
    <div class="informe">
        <div class="informe-head">
            <div>
                <h3>Informe técnico — Planta Potabilizadora</h3>
                <p class="informe-sub">Saneamiento (Norma 68) · Hoja POTABILIZADORA · Clase 3</p>
            </div>
            <div class="informe-meta">
                <div>Fecha: ${esc(d.fecha)}</div>
                <div>Grupo Nº: ______________</div>
                <div>Integrantes: ______________________</div>
            </div>
        </div>

        <div class="info-sec">
            <h4>1 · Captación y Aquietamiento</h4>
            <div class="info-grid">
                ${card("Parámetros de Captación", d.inputs)}
                ${card("Cámara de Aquietamiento", d.aquiet)}
            </div>
        </div>

        <div class="info-sec">
            <h4>2 · Mezcla Rápida (Parshall / Vertedero en V)</h4>
            <div class="info-grid">
                ${card("Canal Parshall", d.parshall)}
                ${card("Vertedero en “V” y Gradiente", d.vertedero)}
            </div>
            ${d.parshallSvg ? `<div class="info-fig">${d.parshallSvg}</div>` : ""}
        </div>

        <div class="info-sec">
            <h4>3 · Floculación y Sedimentación</h4>
            <div class="info-grid">
                ${card("Floculador Hidráulico", d.floculador)}
                ${card("Sedimentador de Escurrimiento Horizontal", d.sedimentador)}
            </div>
        </div>

        <div class="info-sec">
            <h4>4 · Filtración Rápida y Cloración</h4>
            <div class="info-grid">
                ${card("Filtración y Retrolavado", d.filtracion)}
                ${card("Sistema de Cloración", d.cloracion)}
            </div>
        </div>

        <div class="info-sec">
            <h4>5 · Reservorio de Agua Tratada</h4>
            <div class="info-grid">
                ${card("Reservorio Final", d.reservorio)}
            </div>
        </div>

        <div class="info-sec concl">
            <h4>Conclusión</h4>
            <p>${esc(d.conclusion)}</p>
        </div>

        <div class="informe-foot">
            <p>Informe técnico generado de acuerdo con las especificaciones de la cátedra de Saneamiento y la Norma 68.</p>
        </div>
    </div>`;
}

function renderInformePotab(r) {
    const host = $("informe-content");
    if (!host) return;
    host.innerHTML = buildPotabReportHTML(collectPotabReportData(r));
}

async function buildPotabPDF(d) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const PW = 210, PH = 297, M = 13;
    let y = 0;
    doc.setFillColor(11, 93, 86);
    doc.rect(0, 0, PW, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("Informe técnico — Planta Potabilizadora", M, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Saneamiento (Norma 68) · Hoja POTABILIZADORA · Clase 3", M, 20);
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
    const section = (title, rows) => { sub(title); kvTable(rows); };
    heading("1 · Captación y Aquietamiento");
    section("Parámetros de Captación", d.inputs);
    section("Cámara de Aquietamiento", d.aquiet);
    heading("2 · Mezcla Rápida");
    section("Canal Parshall", d.parshall);
    if (d.parshallSvg) {
        try {
            const png = await svgToPngUrl(d.parshallSvg, 880, 730);
            const iw = 165, ih = iw * 730 / 880;
            ensure(ih + 6);
            doc.addImage(png, "PNG", M, y, iw, ih);
            doc.setFontSize(8);
            doc.setTextColor(120);
            doc.text("Figura 1 · Aforador Parshall: Planta y Perfil (según Azevedo & Acosta pág. 471)", M, y + ih + 3.5);
            y += ih + 9;
        } catch (e) { /* si no se puede rasterizar, se omite */ }
    }
    section("Vertedero en “V” y Gradiente", d.vertedero);
    heading("3 · Floculación y Sedimentación");
    section("Floculador", d.floculador);
    section("Sedimentador", d.sedimentador);
    heading("4 · Filtración y Cloración");
    section("Filtración y Retrolavado", d.filtracion);
    section("Sistema de Cloración", d.cloracion);
    heading("5 · Reservorio de Agua Tratada");
    section("Reservorio", d.reservorio);
    ensure(20);
    heading("Conclusión");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const splitText = doc.splitTextToSize(d.conclusion, PW - 2 * M);
    doc.text(splitText, M, y);
    doc.save("informe-planta-potabilizadora.pdf");
}
