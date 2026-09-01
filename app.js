"use strict";

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

/* ================= Coeficientes ================= */
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

/* ================= Motor de cálculo ================= */
function calc() {
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

    const alts = S.altSucc.map((dS, i) => {
        const dI = S.altImp[i];
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

        const etaB = S.etaB[i], etaM = S.etaM[i];
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
    });

    return { B11, B12, B15, B16, B17, B18, B19, B23, D23, B26, alts };
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

function renderField(field) {
    const val = S[field.id];
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

function renderDatos() {
    $("datos-form").innerHTML = DATOS_FIELDS.map(renderField).join("");
    DATOS_FIELDS.forEach((fd) => bind(fd.id, (v) => S[fd.id] = v));
}

function renderCaudalUnitario() {
    $("caudales-unitarios-form").innerHTML = CAUDAL_FIELDS.map(renderField).join("");
    CAUDAL_FIELDS.forEach((fd) => bind(fd.id, (v) => S[fd.id] = v));
}

function renderBombeoForm() {
    $("bombeo-form").innerHTML = BOMBEO_FIELDS.map(renderField).join("");
    BOMBEO_FIELDS.forEach((fd) => bind(fd.id, (v) => S[fd.id] = v));
}

function bind(id, setter) {
    const el = $("in-" + id);
    if (!el) return;
    el.addEventListener("input", () => { setter(nf(el)); recompute(); });
}

/* ================= Render: resultados ================= */
function renderAll() {
    const r = calc();
    renderHero(r);
    renderCaudales(r);
    renderBombeo(r);
    renderAlternativas(r);
    renderPerdidas(r);
    renderAltura(r);
    renderPotencia(r);
    renderPozo(r);
    renderReferencias(r);
}

function kpi(label, value, unit) {
    return `<div class="kpi"><div class="kpi-label">${esc(label)}</div>
            <div class="kpi-value">${value}${unit ? ` <small>${esc(unit)}</small>` : ""}</div></div>`;
}

function renderHero(r) {
    const hm1 = r.alts[0].hT;
    const padop1 = r.alts[0].Padop;
    $("hero-kpis").innerHTML =
        kpi("Caudal de bombeo", f(r.D23, 2), "l/s") +
        kpi("Diam. Bresse", "≈ " + f(r.B26 * 1000, 0), "mm") +
        kpi("Alt. manométrica (Alt 1)", f(hm1, 2), "m.c.a.") +
        kpi("Potencia adoptada (Alt 1)", f(padop1, 0), "HP");
}

function formulaBox(label, eq) {
    return `<div class="formula-box"><span class="eq">${esc(label)}</span>&nbsp; ${esc(eq)}</div>`;
}

function renderCaudales(r) {
    const eq11 = `B3×B4×(B5×B6×(B7×B8+B9)) = ${S.manzanas}×${S.lotes}×(${S.pisos}×${S.deptos}×(${S.dorm}×${S.persDorm}+${S.persServ}))`;
    const eq12 = `(B6×B5)×B10/100×B4×B3 = (${S.deptos}×${S.pisos})×${S.pctLog}/100×${S.lotes}×${S.manzanas}`;
    const eq15 = `B11×qDept + B12×qLog = ${f0(r.B11)}×${S.qDept} + ${f0(r.B12)}×${S.qLog}`;

    $("caudales-content").innerHTML = `
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
        </div>
        ${formulaBox("Qm (l/d)", eq15)}
        ${formulaBox("Total pers.", eq11)}
        ${formulaBox("Logística", eq12)}
    `;
}

function renderBombeo(r) {
    const eq23 = `K1×K3×Qm/86400 = ${S.k1}×${S.k3}×${f(r.B16, 2)}/86400`;
    const eq26 = `1,3×√Qb×(horas/24)^(1/4) = 1,3×√${f(r.B23, 5)}×(${S.horasOp}/24)^(1/4)`;
    $("bombeo-content").innerHTML = `
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
        <div class="alt-grid" style="margin-top:1.2rem;grid-template-columns:1fr 1fr;gap:.8rem">
            <div class="panel">${formulaBox("Qb (m³/s)", eq23)}</div>
            <div class="panel">${formulaBox("D Bresse (m)", eq26)}</div>
        </div>
        <p class="footnote">Alrededor del valor de Bresse se eligen tres diámetros comerciales, uno de los cuales se adoptará por mínimo costo.</p>
    `;
}

function vBadge(ok, low) {
    if (!ok) return `<span class="badge-state ${low ? "warn" : "fail"}">${low ? "velocidad baja" : "fuera de rango"}</span>`;
    return `<span class="badge-state ok">✓ verifica</span>`;
}

function renderAlternativas(r) {
    $("alternativas-content").innerHTML = r.alts.map((a, i) => {
        const n = i + 1;
        return `
        <div class="alt-card">
            <div class="alt-head">
                <span class="alt-title">Alternativa ${n}</span>
                <span class="alt-badge">Suc ${a.dS} / Imp ${a.dI} mm</span>
            </div>
            <div class="alt-body">
                <div class="alt-diams">
                    <div class="field">
                        <label>Succión (mm)</label>
                        <input type="number" id="in-altS-${i}" value="${a.dS}" step="1" min="13" inputmode="decimal">
                    </div>
                    <div class="field">
                        <label>Impulsión (mm)</label>
                        <input type="number" id="in-altI-${i}" value="${a.dI}" step="1" min="13" inputmode="decimal">
                    </div>
                </div>
                <div class="alt-diams">
                    <div class="field">
                        <label>η bomba</label>
                        <input type="number" id="in-etaB-${i}" value="${a.etaB}" step="0.01" min="0" max="1" inputmode="decimal">
                    </div>
                    <div class="field">
                        <label>η motor</label>
                        <input type="number" id="in-etaM-${i}" value="${a.etaM}" step="0.01" min="0" max="1" inputmode="decimal">
                    </div>
                </div>
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
                    <span class="m-value">${f(a.leqI, 1)} <small>m</small></span></div>
            </div>
            <div class="alt-foot">
                <div class="big-result">
                    <span class="br-label">Altura manométrica total</span>
                    <span class="br-value">${f(a.hT, 2)} <small>m.c.a.</small></span>
                </div>
                <div class="big-result" style="margin-top:.3rem">
                    <span class="br-label">Potencia adoptada</span>
                    <span class="br-value">${f(a.Padop, 0)} <small>HP</small></span>
                </div>
            </div>
        </div>`;
    }).join("");

    for (let i = 0; i < r.alts.length; i++) {
        const s = $("in-altS-" + i), im = $("in-altI-" + i), b = $("in-etaB-" + i), m = $("in-etaM-" + i);
        s.addEventListener("input", () => { S.altSucc[i] = nf(s); recompute(); });
        im.addEventListener("input", () => { S.altImp[i] = nf(im); recompute(); });
        b.addEventListener("input", () => { S.etaB[i] = nf(b); recompute(); });
        m.addEventListener("input", () => { S.etaM[i] = nf(m); recompute(); });
    }
}

function lossTable(r) {
    const suctComp = ["Válvula de pie", "Curva 90° (×2)", "Tee 2 salidas", "Válvula de cierre"];
    const impComp = ["Curva 90°", "Válvula de retención", "Válvula de cierre", "Tee lateral"];
    const pick = (c, key) => c.map((cc) => f(cc.row[key], 1)).join(" / ");
    const rows = `
        <tr><td>Válvula de pie</td><td>${pick(r.alts.map(a=>a.cS), "valvPie")}</td></tr>
        <tr><td>Curva 90°</td><td>${pick(r.alts.map(a=>a.cS), "curva90")}</td></tr>
        <tr><td>Tee 2 salidas</td><td>${pick(r.alts.map(a=>a.cS), "tee2")}</td></tr>
        <tr><td>Válvula de cierre</td><td>${pick(r.alts.map(a=>a.cS), "valvCierre")}</td></tr>
        <tr class="total-row"><td><strong>Leq succión total</strong></td><td><strong>${r.alts.map(a=>f(a.leqS,1)).join(" / ")}</strong></td></tr>
        <tr><td colspan="2" class="sep"></td></tr>
        <tr><td>Curva 90°</td><td>${pick(r.alts.map(a=>a.cI), "curva90")}</td></tr>
        <tr><td>Válvula de retención</td><td>${pick(r.alts.map(a=>a.cI), "valvRet")}</td></tr>
        <tr><td>Válvula de cierre</td><td>${pick(r.alts.map(a=>a.cI), "valvCierre")}</td></tr>
        <tr><td>Tee lateral</td><td>${pick(r.alts.map(a=>a.cI), "teeLateral")}</td></tr>
        <tr class="total-row"><td><strong>Leq impulsión total</strong></td><td><strong>${r.alts.map(a=>f(a.leqI,1)).join(" / ")}</strong></td></tr>`;
    return rows;
}

function renderPerdidas(r) {
    const dims = r.alts.map(a => `Suc ${a.dS} / Imp ${a.dI}`).join("</th><th>");
    $("perdidas-content").innerHTML = `
        <div class="table-wrap">
            <table>
                <thead><tr><th>Longitudes equivalentes (Tabla 3 · Norma 68)</th>
                    <th>Alt 1<br><small>${dims}</small></th></tr></thead>
                <tbody>${lossTable(r)}</tbody>
            </table>
        </div>
        <div class="table-wrap">
            <table>
                <thead><tr><th>Pérdidas por fricción (Fair–Whipple–Hsiao · acero galvanizado)</th>
                    <th>Alt 1</th><th>Alt 2</th><th>Alt 3</th></tr></thead>
                <tbody>
                    <tr><td>J succión (m/m)</td><td>${f(r.alts[0].JS,5)}</td><td>${f(r.alts[1].JS,5)}</td><td>${f(r.alts[2].JS,5)}</td></tr>
                    <tr><td>J impulsión (m/m)</td><td>${f(r.alts[0].JI,5)}</td><td>${f(r.alts[1].JI,5)}</td><td>${f(r.alts[2].JI,5)}</td></tr>
                </tbody>
            </table>
        </div>
        <p class="footnote">Las longitudes equivalentes se suman a la longitud real de tubería y se multiplican por la pendiente J para obtener la pérdida de carga en metros.</p>`;
}

function renderAltura(r) {
    $("altura-content").innerHTML = `
        <div class="table-wrap">
            <table>
                <thead><tr><th>Componente</th><th>Alt 1</th><th>Alt 2</th><th>Alt 3</th></tr></thead>
                <tbody>
                    <tr><td>Altura topográfica — succión (m)</td>
                        <td>${f(S.hTopoSucc,2)}</td><td>${f(S.hTopoSucc,2)}</td><td>${f(S.hTopoSucc,2)}</td></tr>
                    <tr><td>Altura topográfica — impulsión (m)</td>
                        <td>${f(S.hTopoImp,2)}</td><td>${f(S.hTopoImp,2)}</td><td>${f(S.hTopoImp,2)}</td></tr>
                    <tr><td>Pérdidas en succión (m.c.a.)</td>
                        <td>${f(r.alts[0].hS - S.hTopoSucc, 2)}</td><td>${f(r.alts[1].hS - S.hTopoSucc, 2)}</td><td>${f(r.alts[2].hS - S.hTopoSucc, 2)}</td></tr>
                    <tr><td>Pérdidas en impulsión (m.c.a.)</td>
                        <td>${f(r.alts[0].hI - S.hTopoImp, 2)}</td><td>${f(r.alts[1].hI - S.hTopoImp, 2)}</td><td>${f(r.alts[2].hI - S.hTopoImp, 2)}</td></tr>
                    <tr><td>Presión de llegada al reservorio (m)</td>
                        <td>${f(S.pReservorio,2)}</td><td>${f(S.pReservorio,2)}</td><td>${f(S.pReservorio,2)}</td></tr>
                    <tr class="total-row"><td><strong>Altura manométrica total (m.c.a.)</strong></td>
                        <td><strong>${f(r.alts[0].hT,2)}</strong></td><td><strong>${f(r.alts[1].hT,2)}</strong></td><td><strong>${f(r.alts[2].hT,2)}</strong></td></tr>
                </tbody>
            </table>
        </div>
        <p class="footnote">Hm = altura topográfica + (L + Leq)·J + v²/2g. La succión corresponde al tramo entre la fuente y la bomba; la impulsión, entre la bomba y el reservorio.</p>`;
}

function renderPotencia(r) {
    $("potencia-content").innerHTML = `
        <div class="table-wrap">
            <table>
                <thead><tr><th>Parámetro</th><th>Alt 1</th><th>Alt 2</th><th>Alt 3</th></tr></thead>
                <tbody>
                    <tr><td>Potencia hidráulica — Pb (cv)</td>
                        <td>${f(r.alts[0].Pb,2)}</td><td>${f(r.alts[1].Pb,2)}</td><td>${f(r.alts[2].Pb,2)}</td></tr>
                    <tr><td>Potencia al freno — P (HP)</td>
                        <td>${f(r.alts[0].HP,2)}</td><td>${f(r.alts[1].HP,2)}</td><td>${f(r.alts[2].HP,2)}</td></tr>
                    <tr><td>Rendimiento de la bomba — η<sub>bomba</sub></td>
                        <td>${f(r.alts[0].etaB*100,0)}%</td><td>${f(r.alts[1].etaB*100,0)}%</td><td>${f(r.alts[2].etaB*100,0)}%</td></tr>
                    <tr><td>Potencia del motor — P<sub>mb</sub> (HP)</td>
                        <td>${f(r.alts[0].Pmb,2)}</td><td>${f(r.alts[1].Pmb,2)}</td><td>${f(r.alts[2].Pmb,2)}</td></tr>
                    <tr><td>Rendimiento del motor — η<sub>motor</sub></td>
                        <td>${f(r.alts[0].etaM*100,0)}%</td><td>${f(r.alts[1].etaM*100,0)}%</td><td>${f(r.alts[2].etaM*100,0)}%</td></tr>
                    <tr><td>Holgura por potencia</td>
                        <td>${f(r.alts[0].holg*100,0)}%</td><td>${f(r.alts[1].holg*100,0)}%</td><td>${f(r.alts[2].holg*100,0)}%</td></tr>
                    <tr><td>Potencia con holgura — P<sub>hmb</sub> (HP)</td>
                        <td>${f(r.alts[0].Phmb,2)}</td><td>${f(r.alts[1].Phmb,2)}</td><td>${f(r.alts[2].Phmb,2)}</td></tr>
                    <tr class="total-row"><td><strong>Potencia adoptada (Tabla 8)</strong></td>
                        <td><strong>${f(r.alts[0].Padop,0)} HP</strong></td><td><strong>${f(r.alts[1].Padop,0)} HP</strong></td><td><strong>${f(r.alts[2].Padop,0)} HP</strong></td></tr>
                </tbody>
            </table>
        </div>
        <p class="footnote">Pb = 1000·Hm·Qb/75·ηbomba · P = 1,014·Pb · P<sub>mb</sub> = P/ηmotor · Holgura según potencia: 50% (≤2 HP), 30% (2–5), 20% (5–10), 15% (10–20), 10% (&gt;20 HP).</p>`;
}

function renderPozo(r) {
    $("pozo-content").innerHTML = `
        <div class="table-wrap">
            <table>
                <thead><tr><th>Parámetro</th><th>Alt 1</th><th>Alt 2</th><th>Alt 3</th></tr></thead>
                <tbody>
                    <tr><td>Altura por cavitación — v²/2g + 0,2 (m)</td>
                        <td>${f(r.alts[0].hCav,3)}</td><td>${f(r.alts[1].hCav,3)}</td><td>${f(r.alts[2].hCav,3)}</td></tr>
                    <tr><td>Altura por seguridad (m)</td>
                        <td>${f(r.alts[0].hSeg,2)}</td><td>${f(r.alts[1].hSeg,2)}</td><td>${f(r.alts[2].hSeg,2)}</td></tr>
                    <tr class="total-row"><td><strong>Altura mínima del agua sobre la criba (m)</strong></td>
                        <td><strong>${f(r.alts[0].hPozo,2)}</strong></td><td><strong>${f(r.alts[1].hPozo,2)}</strong></td><td><strong>${f(r.alts[2].hPozo,2)}</strong></td></tr>
                </tbody>
            </table>
        </div>
        <p class="footnote">Se adopta el mayor valor entre la altura por cavitación y la altura de seguridad (0,5 m).</p>`;
}

/* ================= Referencias ================= */
function renderReferencias(r) {
    const used = new Set(r.alts.flatMap(a => [a.dS, a.dI]));

    $("tabla3").innerHTML = `
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

    $("tabla6").innerHTML = `
        <table>
            <thead><tr><th>Q (l/s)</th><th>η<sub>bomba</sub> (%)</th></tr></thead>
            <tbody>${TABLE6.map((row) => `<tr><td>${f(row.q, 1)}</td><td>${row.hb}</td></tr>`).join("")}</tbody>
        </table>`;

    $("tabla7").innerHTML = `
        <table>
            <thead><tr><th>Motor (HP)</th><th>η<sub>motor</sub> (%)</th></tr></thead>
            <tbody>${TABLE7.map((row) => `<tr><td>${row.hp}</td><td>${f(row.hm, 1)}</td></tr>`).join("")}</tbody>
        </table>`;
}

/* ================= Init ================= */
function recompute() { renderAll(); }

renderDatos();
renderCaudalUnitario();
renderBombeoForm();
renderAll();