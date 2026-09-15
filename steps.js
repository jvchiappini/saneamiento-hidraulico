"use strict";

/* ============================================================================
   Memoria de cálculo paso a paso
   ----------------------------------------------------------------------------
   Genera grupos de pasos para los informes (HTML y PDF) de las 4 páginas.
   Cada paso tiene:
     name    -> qué se calcula
     formula -> fórmula simbólica (texto plano, compatible con el PDF)
     sub     -> reemplazo numérico "parte por parte"
     result  -> resultado con su unidad
   Las fórmulas usan notación segura para el PDF (WinAnsi): · ² ³ ° >= <=
   y nombres de variables en texto (pi, sqrt, eta, rho, mu, gamma, theta).
   ========================================================================== */

const _fmt = (n, d = 2) => {
    if (n == null || isNaN(n)) return "—";
    const o = { minimumFractionDigits: 0, maximumFractionDigits: d };
    if (d >= 5) o.minimumFractionDigits = d;
    return Number(n).toLocaleString("es-AR", o);
};
const _raw = (n, d = 3) => (n == null || isNaN(n)) ? "—" : Number(n).toLocaleString("es-AR", { maximumFractionDigits: d });
const _sci = (n, d = 3) => (n == null || isNaN(n)) ? "—" : Number(n).toExponential(d).replace(".", ",");
const _step = (name, formula, sub, result) => ({ name, formula, sub, result });
const _grp = (title, steps) => ({ title, steps });

/* ============================================================================
   SISTEMA DE IMPULSIÓN
   ========================================================================== */
function impulsionSteps(r, rows, best) {
    const groups = [];
    const S2 = (typeof S !== "undefined") ? S : {};
    const Opt = (typeof Sopt !== "undefined") ? Sopt : {};

    /* --- 1 · Población y caudales --------------------------------------- */
    const g1 = [];
    g1.push(_step(
        "Total de personas (departamentos)",
        "P_total = M · L · [ P_t · D_p · (D_o · P_e + S) ]",
        `${_raw(S2.manzanas)} · ${_raw(S2.lotes)} · [ ${_raw(S2.pisos)} · ${_raw(S2.deptos)} · (${_raw(S2.dorm)} · ${_raw(S2.persDorm)} + ${_raw(S2.persServ)}) ]`,
        "= " + _fmt(r.B11, 0) + " pers"));
    g1.push(_step(
        "Personal de logística",
        "P_log = (D_p · P_t) · (%_log / 100) · L · M",
        `(${_raw(S2.deptos)} · ${_raw(S2.pisos)}) · (${_raw(S2.pctLog)} / 100) · ${_raw(S2.lotes)} · ${_raw(S2.manzanas)}`,
        "= " + _fmt(r.B12, 0) + " pers"));
    g1.push(_step(
        "Caudal diario — caudal medio de bombeo (l/d)",
        "Q_m = P_total · q_d + P_log · q_o",
        `${_fmt(r.B11, 0)} · ${_raw(S2.qDept)} + ${_fmt(r.B12, 0)} · ${_raw(S2.qLog)}`,
        "= " + _fmt(r.B15, 0) + " l/d"));
    g1.push(_step(
        "Caudal diario — caudal medio de bombeo (m³/d)",
        "Q_m = Q_m(l/d) / 1000",
        `${_fmt(r.B15, 0)} / 1000`,
        "= " + _fmt(r.B16, 2) + " m³/d"));
    g1.push(_step(
        "Caudal diario — caudal medio de bombeo (l/s)",
        "Q_m = Q_m(l/d) / 86400",
        `${_fmt(r.B15, 0)} / 86400`,
        "= " + _fmt(r.B17, 2) + " l/s"));
    g1.push(_step(
        "Caudal por lote (l/d)",
        "Q_lote = Q_m / (M · L)",
        `${_fmt(r.B15, 0)} / (${_raw(S2.manzanas)} · ${_raw(S2.lotes)})`,
        "= " + _fmt(r.B18, 0) + " l/d"));
    g1.push(_step(
        "Caudal por lote (l/s)",
        "Q_lote = Q_lote(l/d) / 86400",
        `${_fmt(r.B18, 0)} / 86400`,
        "= " + _fmt(r.B19, 2) + " l/s"));
    groups.push(_grp("1 · Población y caudales", g1));

    /* --- 2 · Caudal de bombeo y Bresse ---------------------------------- */
    const g2 = [];
    g2.push(_step(
        "Caudal de bombeo (m³/s)",
        "Q_b = K1 · K3 · Q_m(m³/d) / 86400",
        `${_raw(S2.k1)} · ${_raw(S2.k3)} · ${_fmt(r.B16, 2)} / 86400`,
        "= " + _fmt(r.B23, 4) + " m³/s"));
    g2.push(_step(
        "Caudal de bombeo (l/s)",
        "Q_b = Q_b(m³/s) · 1000",
        `${_fmt(r.B23, 4)} · 1000`,
        "= " + _fmt(r.D23, 2) + " l/s"));
    g2.push(_step(
        "Horas de operación de la bomba",
        "H_op : valor adoptado (15 h máx. según guía)",
        `H_op = ${_raw(S2.horasOp)}`,
        "= " + _fmt(S2.horasOp, 1) + " hs/d"));
    g2.push(_step(
        "Diámetro de impulsión (Bresse)",
        "D = 1,3 · Q_b^0,5 · (H_op / 24)^(1/4)",
        `1,3 · ${_fmt(r.B23, 4)}^0,5 · (${_raw(S2.horasOp)} / 24)^(1/4)`,
        "= " + _fmt(r.B26, 3) + " m"));
    groups.push(_grp("2 · Caudal de bombeo y diámetro de Bresse", g2));

    /* --- 3..n · Alternativas de diámetro -------------------------------- */
    (r.alts || []).forEach((a, i) => {
        groups.push(_grp("3." + (i + 1) + " · Alternativa " + (i + 1) +
            " (Suc " + a.dS + " mm / Imp " + a.dI + " mm)", _altSteps(a, r.B23)));
    });

    /* --- 4 · Alternativa óptima (mínimo costo anual) -------------------- */
    if (best) {
        const gO = [];
        const i = Opt.rate / 100;
        const a50 = annFactor(50), a7 = annFactor(7);
        gO.push(_step(
            "Adopción de diámetros por mínimo costo",
            "Se recorren los DN comerciales y se elige el de menor C_anual",
            `DN imp = ${best.dn} mm · DN suc = ${best.succ} mm`,
            "seleccionado"));
        gO.push(_step(
            "Factor de anualidad de la tubería (50 años)",
            "a(n) = i · (1+i)^n / ((1+i)^n - 1)",
            `${_raw(Opt.rate)}/100 · (1 + ${_raw(Opt.rate)}/100)^50 / ((1 + ${_raw(Opt.rate)}/100)^50 - 1)`,
            "= " + _fmt(a50, 4)));
        gO.push(_step(
            "Factor de anualidad de la bomba (7 años)",
            "a(n) = i · (1+i)^n / ((1+i)^n - 1)",
            `${_raw(Opt.rate)}/100 · (1 + ${_raw(Opt.rate)}/100)^7 / ((1 + ${_raw(Opt.rate)}/100)^7 - 1)`,
            "= " + _fmt(a7, 4)));
        gO.push(_step(
            "Inversión en tubería",
            "I_t = c_tubo(DN) · (L_i + L_s)",
            `${_fmt(Opt.pipeCost ? Opt.pipeCost[best.dn] : 0, 0)} · (${_raw(S2.lImp)} + ${_raw(S2.lSucc)})`,
            "= $ " + _fmt(best.pipeCost, 0)));
        gO.push(_step(
            "Inversión en bomba",
            "I_b = c_bomba(P_adop)",
            `c_bomba(${_fmt(best.m.Padop, 0)} HP)`,
            "= $ " + _fmt(best.pumpInv, 0)));
        gO.push(_step(
            "Energía anual consumida",
            "E = P_mb · 0,7457 · H_op · 365",
            `${_fmt(best.m.Pmb, 2)} · 0,7457 · ${_raw(S2.horasOp)} · 365`,
            "= " + _fmt(best.energyKWh, 0) + " kWh/año"));
        gO.push(_step(
            "Costo de la energía",
            "C_e = E · c_kwh",
            `${_fmt(best.energyKWh, 0)} · ${_raw(Opt.kwh)}`,
            "= $ " + _fmt(best.energy, 0) + "/año"));
        gO.push(_step(
            "Mantenimiento anual",
            "M = (I_t + I_b) · %mant / 100",
            `(${_fmt(best.pipeCost, 0)} + ${_fmt(best.pumpInv, 0)}) · ${_raw(Opt.maint)} / 100`,
            "= $ " + _fmt(best.maint, 0) + "/año"));
        gO.push(_step(
            "Costo anual total",
            "C_anual = I_t · a(50) + I_b · a(7) + C_e + M",
            `${_fmt(best.pipeCost, 0)} · ${_fmt(a50, 4)} + ${_fmt(best.pumpInv, 0)} · ${_fmt(a7, 4)} + ${_fmt(best.energy, 0)} + ${_fmt(best.maint, 0)}`,
            "= $ " + _fmt(best.annual, 0) + "/año"));
        groups.push(_grp("4 · Alternativa óptima (mínimo costo anualizado)", gO));
    }

    /* --- 5 · Pozo de bombeo (óptima) ------------------------------------ */
    if (best) {
        const a = best.m;
        const gP = [];
        gP.push(_step(
            "Altura por cavitación",
            "h_cav = v_s² / (2g) + 0,2",
            `${_fmt(a.vS, 3)}² / (2 · 9,81) + 0,2`,
            "= " + _fmt(a.hCav, 3) + " m"));
        gP.push(_step(
            "Altura por seguridad",
            "h_seg = 0,5",
            "0,5",
            "= 0,50 m"));
        gP.push(_step(
            "Altura mínima del agua sobre la criba",
            "h_pozo = max(h_cav ; h_seg)",
            `max(${_fmt(a.hCav, 3)} ; ${_fmt(a.hSeg, 2)})`,
            "= " + _fmt(a.hPozo, 2) + " m"));
        groups.push(_grp("5 · Pozo de bombeo", gP));
    }

    return groups;
}

/* Pasos de una alternativa de diámetro de impulsión */
function _altSteps(a, B23) {
    const S2 = (typeof S !== "undefined") ? S : {};
    const st = [];
    const areaS = Math.PI * Math.pow(a.dS / 1000, 2) / 4;
    const areaI = Math.PI * Math.pow(a.dI / 1000, 2) / 4;

    st.push(_step(
        "Velocidad en la succión",
        "v_s = Q_b / (pi · d_s² / 4)",
        `${_fmt(B23, 4)} / (pi · ${_fmt(a.dS / 1000, 4)}² / 4)`,
        "= " + _fmt(a.vS, 2) + " m/s"));
    st.push(_step(
        "Verificación de velocidad en la succión",
        "0,70 <= v_s <= 4,00 m/s",
        `0,70 <= ${_fmt(a.vS, 2)} <= 4,00`,
        a.sState.text));
    st.push(_step(
        "Velocidad en la impulsión",
        "v_i = Q_b / (pi · d_i² / 4)",
        `${_fmt(B23, 4)} / (pi · ${_fmt(a.dI / 1000, 4)}² / 4)`,
        "= " + _fmt(a.vI, 2) + " m/s"));
    st.push(_step(
        "Verificación de velocidad en la impulsión",
        "0,70 <= v_i <= 4,00 m/s",
        `0,70 <= ${_fmt(a.vI, 2)} <= 4,00`,
        a.iState.text));
    st.push(_step(
        "Verificación v > 0,5 m/s (succión)",
        "v_s > 0,50 m/s",
        `${_fmt(a.vS, 2)} > 0,50`,
        a.sStateB.text));
    st.push(_step(
        "Verificación v > 0,5 m/s (impulsión)",
        "v_i > 0,50 m/s",
        `${_fmt(a.vI, 2)} > 0,50`,
        a.iStateB.text));
    st.push(_step(
        "Diámetro de succión mayor que el de impulsión",
        "d_s > d_i",
        `${a.dS} > ${a.dI}`,
        a.sGtI ? "Verifica" : "No verifica"));
    st.push(_step(
        "Pérdida por metro en la succión (FWH)",
        "J_s = (Q_b / (27,113 · d_s^2,596))^(1 / 0,532)",
        `(${_fmt(B23, 4)} / (27,113 · ${_fmt(a.dS / 1000, 4)}^2,596))^(1 / 0,532)`,
        "= " + _fmt(a.JS, 5) + " m/m"));
    st.push(_step(
        "Pérdida por metro en la impulsión (FWH)",
        "J_i = (Q_b / (27,113 · d_i^2,596))^(1 / 0,532)",
        `(${_fmt(B23, 4)} / (27,113 · ${_fmt(a.dI / 1000, 4)}^2,596))^(1 / 0,532)`,
        "= " + _fmt(a.JI, 5) + " m/m"));
    st.push(_step(
        "Longitud equivalente de la succión",
        "L_eq,s = L_vpie + 2·L_c90 + L_tee2 + L_vcierre",
        `${_raw(a.cS.row.valvPie)} + 2 · ${_raw(a.cS.row.curva90)} + ${_raw(a.cS.row.tee2)} + ${_raw(a.cS.row.valvCierre)}`,
        "= " + _fmt(a.leqS, 1) + " m"));
    st.push(_step(
        "Longitud equivalente de la impulsión",
        "L_eq,i = L_c90 + L_vret + L_vcierre + L_tee",
        `${_raw(a.cI.row.curva90)} + ${_raw(a.cI.row.valvRet)} + ${_raw(a.cI.row.valvCierre)} + ${_raw(a.cI.row.teeLateral)}`,
        "= " + _fmt(a.leqI, 1) + " m"));
    st.push(_step(
        "Altura manométrica de la succión",
        "H_s = h_t,s + (L_s + L_eq,s) · J_s + v_s² / (2g)",
        `${_raw(S2.hTopoSucc)} + (${_raw(S2.lSucc)} + ${_fmt(a.leqS, 2)}) · ${_fmt(a.JS, 5)} + ${_fmt(a.vS, 3)}² / (2 · 9,81)`,
        "= " + _fmt(a.hS, 2) + " m.c.a."));
    st.push(_step(
        "Altura manométrica de la impulsión",
        "H_i = h_t,i + (L_i + L_eq,i) · J_i + v_i² / (2g)",
        `${_raw(S2.hTopoImp)} + (${_raw(S2.lImp)} + ${_fmt(a.leqI, 2)}) · ${_fmt(a.JI, 5)} + ${_fmt(a.vI, 3)}² / (2 · 9,81)`,
        "= " + _fmt(a.hI, 2) + " m.c.a."));
    st.push(_step(
        "Altura manométrica total",
        "H_T = H_s + H_i + P_res",
        `${_fmt(a.hS, 2)} + ${_fmt(a.hI, 2)} + ${_raw(S2.pReservorio)}`,
        "= " + _fmt(a.hT, 2) + " m.c.a."));
    st.push(_step(
        "Potencia de la bomba",
        "P_b = 1000 · H_T · Q_b / (75 · eta_bomba)",
        `1000 · ${_fmt(a.hT, 2)} · ${_fmt(B23, 4)} / (75 · ${_fmt(a.etaB, 2)})`,
        "= " + _fmt(a.Pb, 2) + " cv"));
    st.push(_step(
        "Potencia al freno",
        "HP = 1,014 · P_b",
        `1,014 · ${_fmt(a.Pb, 3)}`,
        "= " + _fmt(a.HP, 2) + " HP"));
    st.push(_step(
        "Potencia del motor",
        "P_mb = HP / eta_motor",
        `${_fmt(a.HP, 2)} / ${_fmt(a.etaM, 3)}`,
        "= " + _fmt(a.Pmb, 2) + " HP"));
    st.push(_step(
        "Holgura por potencia",
        "h = 0,50 (P<=2) · 0,30 (2<P<=5) · 0,20 (5<P<=10) · 0,15 (10<P<=20) · 0,10 (P>20)",
        `P_mb = ${_fmt(a.Pmb, 2)} HP → h = ${_fmt(a.holg, 2)}`,
        "= " + _fmt(a.holg, 2)));
    st.push(_step(
        "Potencia con holgura",
        "P_hmb = (1 + h) · P_mb",
        `(1 + ${_fmt(a.holg, 2)}) · ${_fmt(a.Pmb, 2)}`,
        "= " + _fmt(a.Phmb, 2) + " HP"));
    st.push(_step(
        "Potencia adoptada (Tabla 8)",
        "P_adop = primer valor comercial >= P_hmb",
        `primer >= ${_fmt(a.Phmb, 2)} HP`,
        "= " + _fmt(a.Padop, 0) + " HP"));

    /* Pozo por alternativa */
    st.push(_step(
        "Altura por cavitación (pozo)",
        "h_cav = v_s² / (2g) + 0,2",
        `${_fmt(a.vS, 3)}² / (2 · 9,81) + 0,2`,
        "= " + _fmt(a.hCav, 3) + " m"));
    st.push(_step(
        "Altura mínima del agua sobre la criba",
        "h_pozo = max(h_cav ; 0,5)",
        `max(${_fmt(a.hCav, 3)} ; ${_fmt(a.hSeg, 2)})`,
        "= " + _fmt(a.hPozo, 2) + " m"));

    /* Deja constancia de las áreas usadas */
    st.push(_step(
        "Áreas de las secciones (auxiliar)",
        "A = pi · d² / 4",
        `A_s = pi · ${_fmt(a.dS / 1000, 4)}²/4 = ${_fmt(areaS, 6)} m² · A_i = pi · ${_fmt(a.dI / 1000, 4)}²/4 = ${_fmt(areaI, 6)} m²`,
        "—"));
    return st;
}

/* ============================================================================
   PLANTA POTABILIZADORA
   ========================================================================== */
function potabSteps(r) {
    const P = (typeof SP !== "undefined") ? SP : {};
    const g = [];
    const d = (n, dd) => _fmt(n, dd);
    const raw = _raw;

    /* --- 1 · Captación -------------------------------------------------- */
    g.push(_grp("1 · Caudal de captación", [
        _step(
            "Caudal diario de diseño (dato de entrada)",
            "Q_d",
            `${d(r.qd, 2)}`,
            "= " + d(r.qd, 2) + " m³/d"),
        _step(
            "Caudal de captación",
            "Q_cap = Q_d · K1 · K3 · 1000 / 86400",
            `${d(r.qd, 2)} · ${raw(P.k1)} · ${raw(P.k3)} · 1000 / 86400`,
            "= " + d(r.qcapLps, 2) + " l/s"),
        _step(
            "Caudal de captación (m³/s)",
            "Q_cap = Q_cap(l/s) / 1000",
            `${d(r.qcapLps, 3)} / 1000`,
            "= " + d(r.qcap, 6) + " m³/s"),
    ]));

    /* --- 2 · Cámara de aquietamiento ------------------------------------ */
    g.push(_grp("2 · Cámara de aquietamiento", [
        _step("Velocidad ascensional", "v = v_asc / 100", `${raw(P.vAsc)} / 100`, "= " + d(r.vAscMs, 4) + " m/s"),
        _step("Área sección transversal", "A = Q_cap / v", `${d(r.qcap, 6)} / ${d(r.vAscMs, 4)}`, "= " + d(r.aqArea, 3) + " m²"),
        _step("Lado del aquietador (cuadrado)", "a = sqrt(A)", `sqrt(${d(r.aqArea, 3)})`, "= " + d(r.aqLado, 3) + " m"),
        _step("Profundidad útil de la cámara", "h = Q_cap · t / A", `${d(r.qcap, 6)} · ${raw(P.tAq)} / ${d(r.aqArea, 3)}`, "= " + d(r.aqProf, 3) + " m"),
        _step("Altura total con solera", "H = h + solera", `${d(r.aqProf, 3)} + ${d(r.aqSolera, 3)}`, "= " + d(r.aqHtot, 3) + " m"),
    ]));

    /* --- 3 · Canal Parshall --------------------------------------------- */
    g.push(_grp("3 · Canal aforador Parshall", [
        _step("Altura del agua a la llegada", "H = (Q_cap / (2,2 · W))^(2/3)", `(${d(r.qcap, 6)} / (2,2 · ${d(r.phW, 3)}))^(2/3)`, "= " + d(r.phH, 3) + " m"),
        _step("Altura en la garganta", "h2 = 0,6 · H", `0,6 · ${d(r.phH, 3)}`, "= " + d(r.phH2, 3) + " m"),
        _step("Altura a la salida", "H3 = 0,7 · H", `0,7 · ${d(r.phH, 3)}`, "= " + d(r.phH3, 3) + " m"),
        _step("Pérdida de carga", "h1 = H - H3 - K", `${d(r.phH, 3)} - ${d(r.phH3, 3)} - ${d(r.phK, 3)}`, "= " + d(r.phH1, 3) + " m"),
        _step("Velocidad en la garganta", "v = Q_cap / (W · h2)", `${d(r.qcap, 6)} / (${d(r.phW, 3)} · ${d(r.phH2, 3)})`, "= " + d(r.phV, 2) + " m/s"),
        _step("Verificación mezclador rápido", "v >= 2,00 m/s", `${d(r.phV, 2)} >= 2,00`, r.phVerif ? "Verifica — apto mezclador rápido" : "No verifica — usar vertedero en V"),
        _step("Punto de toma de nivel", "2/3 · A", `2/3 · ${d(r.phA, 3)}`, "= " + d(r.ph2_3A, 3) + " m"),
    ]));

    /* --- 4 · Vertedero en V --------------------------------------------- */
    g.push(_grp("4 · Vertedero triangular en V", [
        _step("Tangente de medio ángulo", "tan(theta/2) = tan(phi/2)", `tan(${raw(P.phi)}/2)`, "= " + d(r.vTan, 3)),
        _step("Lámina máxima sobre el vertedero", "Hmax = (Q / ((8/15) · Cd · sqrt(2g) · tan(φ/2)))^(2/5)",
            `(${d(r.vQ, 6)} / ((8/15) · ${raw(P.cd)} · sqrt(2 · 9,81) · ${d(r.vTan, 3)}))^(2/5)`,
            "= " + d(r.vHmax, 4) + " m"),
        _step("Base del triángulo", "B = 2 · Hmax", `2 · ${d(r.vHmax, 4)}`, "= " + d(r.vB, 4) + " m"),
        _step("Altura del piso interior", "H_piso = B + 2·Hmax", `${d(r.vB, 3)} + ${d(r.v2Hmax, 3)}`, "= " + d(r.vPisoInt, 3) + " m"),
        _step("Ancho del piso", "Ancho = 2 · (2·Hmax)adopt + 2 · h_adopt",
            `2 · ${raw(P.b2hmaxAdopt)} + 2 · ${raw(P.hadoptado)}`,
            "= " + d(r.vAnchoPiso, 2) + " m"),
    ]));

    /* --- 5 · Resalto hidráulico ----------------------------------------- */
    g.push(_grp("5 · Resalto hidráulico (mezcla rápida)", [
        _step("Caudal unitario", "q = Q / B", `${d(r.vQ, 6)} / ${d(r.vB, 3)}`, "= " + d(r.vQuni, 4) + " m³/s·m"),
        _step("Altura crítica", "hc = (q² / g)^(1/3)", `(${d(r.vQuni, 4)}² / 9,81)^(1/3)`, "= " + d(r.vHc, 4) + " m"),
        _step("Profundidad antes del resalto", "h1 = (hc · sqrt(2)) / (1,06 + sqrt(Hmax/hc + 1,5))",
            `(${d(r.vHc, 4)} · sqrt(2)) / (1,06 + sqrt(${d(r.vHmax, 4)}/${d(r.vHc, 4)} + 1,5))`,
            "= " + d(r.vH1, 4) + " m"),
        _step("Velocidad al inicio del resalto", "V1 = q / h1", `${d(r.vQuni, 4)} / ${d(r.vH1, 4)}`, "= " + d(r.vV1, 2) + " m/s"),
        _step("Número de Froude", "F = V1 / sqrt(g · h1)", `${d(r.vV1, 2)} / sqrt(9,81 · ${d(r.vH1, 4)})`, "= " + d(r.vF, 2)),
        _step("Profundidad después del resalto", "h2 = (h1/2) · sqrt(1 + 8·F²)", `(${d(r.vH1, 4)}/2) · sqrt(1 + 8·${d(r.vF, 2)}²)`, "= " + d(r.vH2, 3) + " m"),
        _step("Velocidad al fin del resalto", "V2 = q / h2", `${d(r.vQuni, 4)} / ${d(r.vH2, 3)}`, "= " + d(r.vV2, 4) + " m/s"),
        _step("Energía disipada", "hp = (h2 - h1)³ / (4 · h1 · h2)", `(${d(r.vH2, 3)} - ${d(r.vH1, 4)})³ / (4 · ${d(r.vH1, 4)} · ${d(r.vH2, 3)})`, "= " + d(r.vHp, 3) + " m"),
        _step("Longitud del resalto", "Lm = 6 · (h2 - h1)", `6 · (${d(r.vH2, 3)} - ${d(r.vH1, 4)})`, "= " + d(r.vLm, 3) + " m"),
        _step("Distancia a la sección estable", "Lj = 4,3 · B · (hc / B)^0,9", `4,3 · ${d(r.vB, 3)} · (${d(r.vHc, 4)} / ${d(r.vB, 3)})^0,9`, "= " + d(r.vLj, 3) + " m"),
        _step("Velocidad promedio del resalto", "Vm = (V1 + V2) / 2", `(${d(r.vV1, 2)} + ${d(r.vV2, 4)}) / 2`, "= " + d(r.vVm, 3) + " m/s"),
        _step("Tiempo de mezcla", "T = Lm / Vm", `${d(r.vLm, 3)} / ${d(r.vVm, 3)}`, "= " + d(r.vT, 3) + " s"),
    ]));

    /* --- 6 · Gradiente de velocidad ------------------------------------- */
    g.push(_grp("6 · Gradiente de velocidad G vs Gr", [
        _step("Viscosidad cinemática", "nu = 1,31e-6 · (33,3 / (T + 23,3))", `1,31e-6 · (33,3 / (${raw(P.flocTemp)} + 23,3))`, "= " + _sci(r.nu) + " m²/s"),
        _step("Viscosidad dinámica", "mu = nu · rho", `${_sci(r.nu)} · ${d(r.gamma, 0)}`, "= " + _sci(r.mu) + " kg/m·s"),
        _step("Diámetro de paletas", "D_pal = 0,7 · D_mezclador", `0,7 · ${d(r.mzDiam, 3)}`, "= " + d(r.paletaD, 3) + " m"),
        _step("Revoluciones por segundo", "n = rpm / 60", `${raw(P.rpm)} / 60`, "= " + d(r.nRps, 2) + " rps"),
        _step("Gradiente mínimo requerido", "Gr = sqrt(K · rho · n³ · D_pal⁵ / (mu · V))",
            `sqrt(${raw(P.kPaletas)} · ${d(r.gamma, 0)} · ${d(r.nRps, 2)}³ · ${d(r.paletaD, 3)}⁵ / (${_sci(r.mu)} · ${d(r.mzVol, 0)}))`,
            "= " + d(r.gr, 2) + " s⁻¹"),
        _step("Gradiente del vertedero", "G = sqrt(rho · hp / (mu · T))", `sqrt(${d(r.gamma, 0)} · ${d(r.vHp, 3)} / (${_sci(r.mu)} · ${d(r.vT, 3)}))`, "= " + d(r.gVert, 2) + " s⁻¹"),
        _step("Verificación de mezcla", "G > Gr", `${d(r.gVert, 2)} > ${d(r.gr, 2)}`, r.gVertVerif ? "Verifica" : "No verifica"),
    ]));

    /* --- 7 · Canal de estabilización ------------------------------------ */
    g.push(_grp("7 · Canal de estabilización", [
        _step("Longitud del canal", "L = t · V2", `${raw(P.tCanal)} · ${d(r.estV2, 4)}`, "= " + d(r.estL, 2) + " m"),
    ]));

    /* --- 8 · Mezclador rápido mecánico ---------------------------------- */
    g.push(_grp("8 · Mezclador rápido mecánico para coagulantes", [
        _step("Caudal de proyecto", "Q = Q_cap(l/s) · 3,6", `${d(r.qcapLps, 3)} · 3,6`, "= " + d(r.mzQCaudal, 2) + " m³/h"),
        _step("Volumen del tanque", "V = Q · t / 60", `${d(r.mzQCaudal, 2)} · ${raw(P.mzTiempo)} / 60`, "= " + d(r.mzVtanque, 2) + " m³"),
        _step("Diámetro del tanque", "D = ((V_adopt/1000) / h · 4 / pi)^(1/3)",
            `(((${raw(P.mzVolAdopt)}/1000) / ${raw(P.mzAltura)}) · 4 / pi)^(1/3)`,
            "= " + d(r.mzDiam, 3) + " m"),
        _step("Potencia del agitador", "P = Coef · (0,0001029 · (V/1000) · 1e6 / 76) / eta",
            `${raw(P.mzCoef)} · (0,0001029 · (${raw(P.mzVolAdopt)}/1000) · 1e6 / 76) / ${raw(P.mzEfic)}`,
            "= " + d(r.mzP, 2) + " HP"),
        _step("Longitud del brazo", "brazo = (2/3) · H", `(2/3) · ${raw(P.mzAltura)}`, "= " + d(r.mzBrazo, 3) + " m"),
    ]));

    /* --- 9 · Floculador ------------------------------------------------- */
    g.push(_grp("9 · Floculador hidráulico de pantallas", [
        _step("Separación de canales calculada", "b = Q_cap / (v1 · h)", `${d(r.qcap, 6)} / (${raw(P.flocV1)} · ${raw(P.flocProf)})`, "= " + d(r.flB, 3) + " m"),
        _step("Velocidad recalculada v1", "v1 = Q_cap / (b_adopt · h)", `${d(r.qcap, 6)} / (${raw(P.flocBAdopt)} · ${raw(P.flocProf)})`, "= " + d(r.flV1rec, 3) + " m/s"),
        _step("Verificación v1", "0,15 <= v1 <= 0,20 m/s", `0,15 <= ${d(r.flV1rec, 3)} <= 0,20`, (r.flV1rec >= 0.15 && r.flV1rec <= 0.20) ? "Verifica" : "No verifica"),
        _step("Ancho del paso en curvas", "b' = 1,5 · b_adopt", `1,5 · ${raw(P.flocBAdopt)}`, "= " + d(r.flBp, 3) + " m"),
        _step("Volumen de retención", "V = Q_cap · 1800", `${d(r.qcap, 6)} · 1800`, "= " + d(r.flV, 2) + " m³"),
        _step("Área superficial", "A = V / h", `${d(r.flV, 2)} / ${raw(P.flocProf)}`, "= " + d(r.flA, 2) + " m²"),
        _step("Número de canales", "N = ceil( (A / X) / b_adopt )", `ceil( (${d(r.flA, 2)} / ${raw(P.flocX)}) / ${raw(P.flocBAdopt)} )`, "= " + d(r.flN, 0) + " canales"),
        _step("Número de bafles", "N1 = N - 1", `${d(r.flN, 0)} - 1`, "= " + d(r.flN1, 0) + " bafles"),
        _step("Lado transversal Y", "Y = b_adopt · N + N1 · e", `${raw(P.flocBAdopt)} · ${d(r.flN, 0)} + ${d(r.flN1, 0)} · ${raw(P.flocE)}`, "= " + d(r.flY, 3) + " m"),
        _step("Longitud recta de un canal", "L = X - 2 · b'", `${raw(P.flocX)} - 2 · ${d(r.flBp, 3)}`, "= " + d(r.flL, 2) + " m"),
        _step("Longitud total de canales", "Lt = L · N", `${d(r.flL, 2)} · ${d(r.flN, 0)}`, "= " + d(r.flLt, 2) + " m"),
        _step("Pérdida en canales", "H_canales = N · v1² / (2g)", `${d(r.flN, 0)} · ${d(r.flV1rec, 3)}² / (2 · 9,81)`, "= " + d(r.flHcanales, 4) + " m"),
        _step("Pérdida en curvas", "H_vueltas = K · N1 · v2² / (2g)", `${raw(P.flocK)} · ${d(r.flN1, 0)} · ${raw(P.flocV2)}² / (2 · 9,81)`, "= " + d(r.flHvueltas, 4) + " m"),
        _step("Radio hidráulico", "RH = A_m / P_m ; A_m = h·b ; P_m = 2h + b",
            `A_m = ${raw(P.flocProf)} · ${raw(P.flocBAdopt)} = ${d(r.flAm, 3)} m² ; P_m = 2·${raw(P.flocProf)} + ${raw(P.flocBAdopt)} = ${d(r.flPm, 3)} m`,
            "RH = " + d(r.flRH, 3) + " m"),
        _step("Pérdida por fricción unitaria", "j1 = (N · v1 / RH^(2/3))²", `(${raw(P.flocN)} · ${d(r.flV1rec, 3)} / ${d(r.flRH, 3)}^(2/3))²`, "= " + _sci(r.flJ1) + " m/m"),
        _step("Pérdida por fricción total", "h1 = j1 · Lt", `${_sci(r.flJ1)} · ${d(r.flLt, 2)}`, "= " + d(r.flH1, 4) + " m"),
        _step("Pérdida de carga total", "Hf = h1 + H_vueltas + H_canales", `${d(r.flH1, 4)} + ${d(r.flHvueltas, 4)} + ${d(r.flHcanales, 4)}`, "= " + d(r.flHftotal, 4) + " m"),
        _step("Pendiente de fondo", "i = Hf / X", `${d(r.flHftotal, 4)} / ${raw(P.flocX)}`, "= " + d(r.flI, 4)),
        _step("Gradiente de velocidad", "G = sqrt(g · Hf / (nu · 1800))", `sqrt(9,81 · ${d(r.flHftotal, 4)} / (${_sci(r.nu)} · 1800))`, "= " + d(r.flG, 2) + " s⁻¹"),
        _step("Verificación del gradiente", "30 <= G <= 60 s⁻¹", `30 <= ${d(r.flG, 2)} <= 60`, r.flGVerif ? "Verifica" : "No verifica"),
    ]));

    /* --- 10 · Sedimentador ---------------------------------------------- */
    const gSed = [];
    gSed.push(_step("Caudal de diseño", "Q = Q_cap(l/s) / 1000 · 86400", `${d(r.qcapLps, 3)} / 1000 · 86400`, "= " + d(r.sedQ, 2) + " m³/d"));
    gSed.push(_step("Nº de filtros (Morril y Wallace)", "Nf_calc = 0,044 · sqrt(Q)", `0,044 · sqrt(${d(r.sedQ, 2)})`, "= " + d(r.sedNfCalc, 2) + " → adoptado " + d(r.sedNf, 0)));
    gSed.push(_step("Nº de sedimentadores", "Ns = Nf / 2", `${d(r.sedNf, 0)} / 2`, "= " + d(r.sedNs, 0) + " unid"));
    gSed.push(_step("Volumen total necesario", "V = Q / 24 · tr", `${d(r.sedQ, 2)} / 24 · ${raw(P.sedTr)}`, "= " + d(r.sedV, 2) + " m³"));
    gSed.push(_step("Volumen por sedimentador", "Vs = V / Ns", `${d(r.sedV, 2)} / ${d(r.sedNs, 0)}`, "= " + d(r.sedVs, 2) + " m³"));
    gSed.push(_step("Carga superficial (m³/d/m²)", "Csup = Csup(l/s/m²) / 1000 · 86400", `${raw(P.sedCsup)} / 1000 · 86400`, "= " + d(r.sedCsupM3, 2)));
    gSed.push(_step("Área total del sedimentador", "As = Q / Csup", `${d(r.sedQ, 2)} / ${d(r.sedCsupM3, 2)}`, "= " + d(r.sedAs, 2) + " m²"));
    gSed.push(_step("Área por sedimentador", "AsNs = As / Ns", `${d(r.sedAs, 2)} / ${d(r.sedNs, 0)}`, "= " + d(r.sedAsNs, 2) + " m²"));
    gSed.push(_step("Altura útil", "H = Vs / AsNs", `${d(r.sedVs, 2)} / ${d(r.sedAsNs, 2)}`, "= " + d(r.sedH, 3) + " m"));
    gSed.push(_step("Largo interior", "L = sqrt(AsNs · L/b)", `sqrt(${d(r.sedAsNs, 2)} · ${raw(P.sedLb)})`, "= " + d(r.sedL, 3) + " m"));
    gSed.push(_step("Largo total exterior", "L_ext = L + 0,4", `${d(r.sedL, 3)} + 0,4`, "= " + d(r.sedLext, 3) + " m"));
    gSed.push(_step("Ancho interior", "b = L / (L/b)", `${d(r.sedL, 3)} / ${raw(P.sedLb)}`, "= " + d(r.sedB, 3) + " m"));
    gSed.push(_step("Ancho total exterior de la batería", "B_ext = (b + 0,2) · Ns + 0,2", `(${d(r.sedB, 3)} + 0,2) · ${d(r.sedNs, 0)} + 0,2`, "= " + d(r.sedBext, 3) + " m"));
    gSed.push(_step("Verificación L/H", "7 <= L/H <= 30", `${d(r.sedLH, 2)}`, r.sedLHVerif ? "Verifica" : "No verifica"));

    const gCan = [];
    gCan.push(_step("Caudal máximo por sedimentador", "Qs_max = Q · 1000 / 86400 / Ns", `${d(r.sedQ, 2)} · 1000 / 86400 / ${d(r.sedNs, 0)}`, "= " + d(r.scQsMax, 2) + " l/s"));
    gCan.push(_step("Caudal a la última compuerta", "Qs_min = Qs_max / N_comp", `${d(r.scQsMax, 2)} / ${raw(P.sedNComp)}`, "= " + d(r.scQsMin, 2) + " l/s"));
    gCan.push(_step("Sección canaleta a caudal máximo", "Saf_max = Qs_max / 1000 / v", `${d(r.scQsMax, 2)} / 1000 / ${d(r.scV, 3)}`, "= " + d(r.scSafMax, 3) + " m²"));
    gCan.push(_step("Sección canaleta a caudal mínimo", "Saf_min = Qs_min / 1000 / v", `${d(r.scQsMin, 2)} / 1000 / ${d(r.scV, 3)}`, "= " + d(r.scSafMin, 3) + " m²"));
    gCan.push(_step("Altura máxima haf", "haf_max = Saf_max / b_af", `${d(r.scSafMax, 3)} / ${raw(P.sedBaf)}`, "= " + d(r.scHafMax, 2) + " m"));
    gCan.push(_step("Altura mínima haf", "haf_min = Saf_min / b_af", `${d(r.scSafMin, 3)} / ${raw(P.sedBaf)}`, "= " + d(r.scHafMin, 3) + " m"));
    gCan.push(_step("Verificación haf_max = profundidad floculador", "haf_max ≈ h_floc", `${d(r.scHafMax, 2)} ≈ ${raw(P.flocProf)}`, r.scVerif ? "Verifica" : "Cambiar ancho"));

    const gIng = [];
    gIng.push(_step("Sección por compuerta", "S_comp = Qs_min / 1000 / v", `${d(r.scQsMin, 2)} / 1000 / ${d(r.deV, 3)}`, "= " + d(r.deScomp, 3) + " m²"));
    gIng.push(_step("Ancho de compuerta", "b_comp = S_comp / haf_min", `${d(r.deScomp, 3)} / ${d(r.scHafMin, 3)}`, "= " + d(r.deBcomp, 3) + " m"));
    gIng.push(_step("Pérdida en la compuerta", "hf = v² / (2g)", `${d(r.deV, 3)}² / (2 · 9,81)`, "= " + d(r.deHf, 4) + " m"));
    gIng.push(_step("Separación del tabique", "s = (%sep / 100) · L", `${raw(P.sedSepPct)} / 100 · ${d(r.sedL, 3)}`, "= " + d(r.deSepTab, 3) + " m"));
    gIng.push(_step("Área total de orificios", "A_orif = Qs_max / 1000 / v_orif", `${d(r.scQsMax, 2)} / 1000 / ${raw(P.sedVorif)}`, "= " + d(r.deAorif, 3) + " m²"));
    gIng.push(_step("Sección por orificio", "S_orif = pi · d² / 4", `pi · ${raw(P.sedDorif)}² / 4`, "= " + d(r.deSorif, 4) + " m²"));
    gIng.push(_step("Número de orificios", "N_orif = ceil(A_orif / S_orif)", `ceil(${d(r.deAorif, 3)} / ${d(r.deSorif, 4)})`, "= " + d(r.deNorif, 0) + " unid"));
    gIng.push(_step("Verificación de velocidad en orificios", "v = Qs_max / 1000 / (S_orif · N_orif)", `${d(r.scQsMax, 2)} / 1000 / (${d(r.deSorif, 4)} · ${d(r.deNorif, 0)})`, "= " + d(r.deVverif, 3) + " m/s → " + (r.deVverifOk ? "Verifica" : "No verifica")));
    gIng.push(_step("Pérdida en orificios", "hf = v_orif² / (2g)", `${raw(P.sedVorif)}² / (2 · 9,81)`, "= " + d(r.deHf2, 4) + " m"));

    const gOut = [];
    gOut.push(_step("Tasa sobre el ancho", "tasa = Qs_max / b", `${d(r.scQsMax, 2)} / ${d(r.sedB, 3)}`, "= " + d(r.dsTasa, 2) + " l/s/m → " + (r.dsTasaOk ? "Verifica (2-7)" : "No verifica")));
    gOut.push(_step("Longitud requerida del vertedero", "L_v = Qs_max / tasa_adopt", `${d(r.scQsMax, 2)} / ${raw(P.sedTasaAdopt)}`, "= " + d(r.dsL, 3) + " m"));
    gOut.push(_step("Lámina sobre el vertedero", "lam = (Qs_max / 1000 / g_vert / L_v)^(2/3)", `(${d(r.scQsMax, 2)} / 1000 / ${raw(P.sedGrosor)} / ${d(r.dsL, 3)})^(2/3)`, "= " + d(r.dsLamina, 3) + " m"));

    const gCs = [];
    gCs.push(_step("Sección mojada de la canaleta", "S = Q / 86400 / v_can", `${d(r.sedQ, 2)} / 86400 / ${raw(P.sedVCan)}`, "= " + d(r.cssSeccion, 3) + " m²"));
    gCs.push(_step("Altura de la lámina", "h = S / ancho", `${d(r.cssSeccion, 3)} / ${raw(P.sedGrosor)}`, "= " + d(r.cssH, 3) + " m"));

    const gDr = [];
    gDr.push(_step("Altura de lodos a purgar", "h_lodos = (H + 0,031 · L/2) · 0,1", `(${d(r.sedH, 3)} + 0,031 · ${d(r.sedL, 3)}/2) · 0,1`, "= " + d(r.drHLodos, 3) + " m"));
    gDr.push(_step("Diámetro de la tubería de drenaje", "D = sqrt((4/pi) · (2 · AsNs · sqrt(h_lodos) / (Cd · t · 3600 · sqrt(2g))))",
        `sqrt((4/pi) · (2 · ${d(r.sedAsNs, 2)} · sqrt(${d(r.drHLodos, 3)}) / (${raw(P.sedCd)} · ${raw(P.sedTVaciado)} · 3600 · sqrt(2 · 9,81))))`,
        "= " + d(r.drD, 3) + " m → " + d(r.drDmm, 0) + " mm"));

    g.push(_grp("10.1 · Sedimentador — dimensionamiento general", gSed));
    g.push(_grp("10.2 · Sedimentador — canaleta de agua floculada", gCan));
    g.push(_grp("10.3 · Sedimentador — dispositivos de entrada", gIng));
    g.push(_grp("10.4 · Sedimentador — dispositivo de salida", gOut));
    g.push(_grp("10.5 · Sedimentador — canaleta de agua sedimentada", gCs));
    g.push(_grp("10.6 · Sedimentador — drenaje y purga de lodos", gDr));

    /* --- 11 · Filtración ------------------------------------------------ */
    const gFil = [];
    gFil.push(_step("Área filtrante de cada unidad", "A = Q / Nf / tasa", `${d(r.sedQ, 2)} / ${d(r.filNf, 0)} / ${raw(P.filTasa)}`, "= " + d(r.filA, 3) + " m²"));
    gFil.push(_step("Lado 1 (ancho del filtro)", "L1 = (b_sed - 0,2) / 2", `(${d(r.sedB, 3)} - 0,2) / 2`, "= " + d(r.filL1, 3) + " m"));
    gFil.push(_step("Lado 2 (largo del filtro)", "L2 = A / L1", `${d(r.filA, 3)} / ${d(r.filL1, 3)}`, "= " + d(r.filL2, 3) + " m"));
    gFil.push(_step("Caudal de lavado por filtro", "Q_lav = A · v_asc · 1000 / 60", `${d(r.filA, 3)} · ${raw(P.filVasc)} · 1000 / 60`, "= " + d(r.filQlav, 2) + " l/s"));
    gFil.push(_step("Caudal por canaleta", "Q_can = Q_lav / 1000 / N_can · 60", `${d(r.filQlav, 3)} / 1000 / ${raw(P.filNCan)} · 60`, "= " + d(r.filQcan, 3) + " m³/min"));
    gFil.push(_step("Altura de agua en canaleta", "Y = 0,05276 · (Q_can / A_can)^(2/3)", `0,05276 · (${d(r.filQcan, 3)} / ${raw(P.filACan)})^(2/3)`, "= " + d(r.filY, 3) + " m"));
    gFil.push(_step("Altura total de la canaleta", "H = y' + Y", `0,05 + ${d(r.filY, 3)}`, "= " + d(r.filAltTot, 3) + " m"));
    gFil.push(_step("Separación entre canaletas", "s = (L1 - N_can·A_can - 2·s_borde) / (N_can - 1)",
        `(${d(r.filL1, 3)} - ${raw(P.filNCan)} · ${raw(P.filACan)} - 2 · ${raw(P.filSepBorde)}) / (${raw(P.filNCan)} - 1)`,
        "= " + d(r.filSepCan, 3) + " m → " + (r.filSepCan <= 1.8 ? "Verifica (<=1,8)" : "No verifica")));
    gFil.push(_step("Volumen del tanque de retrolavado", "V = A · (T_lav · v_asc) · N_can^(1/3)", `${d(r.filA, 3)} · (${raw(P.filTLavado)} · ${raw(P.filVasc)}) · ${raw(P.filNCan)}^(1/3)`, "= " + d(r.filVtanque, 2) + " m³"));
    gFil.push(_step("Volumen disponible de planta", "V_disp = Q_d · 0,05 · K1", `${d(r.qd, 2)} · 0,05 · ${raw(P.k1)}`, "= " + d(r.filVdisp, 2) + " m³ → " + (r.filVtanqueVerif ? "Verifica" : "No verifica")));
    gFil.push(_step("Caudal de la bomba de llenado", "Q_b = V_tanque · 1000 / (t_llenado · 60)", `${d(r.filVtanque, 2)} · 1000 / (${raw(P.filTLlenado)} · 60)`, "= " + d(r.filQb, 2) + " l/s"));
    gFil.push(_step("Potencia de la bomba", "P = 1000 · (Q_b/1000) · 12 / 75 / 0,5 · 1,2", `1000 · (${d(r.filQb, 2)}/1000) · 12 / 75 / 0,5 · 1,2`, "= " + d(r.filP, 2) + " cv"));
    g.push(_grp("11 · Filtración rápida y retrolavado", gFil));

    /* --- 12 · Cloración ------------------------------------------------- */
    g.push(_grp("12 · Sistema de cloración", [
        _step("Volumen del reservorio de contacto", "V = 1,3 · Q_d / 24 · (t / 60)", `1,3 · ${d(r.qd, 2)} / 24 · (${raw(P.clTContacto)} / 60)`, "= " + d(r.clV, 2) + " m³"),
        _step("Superficie de contacto", "S = V / 0,3", `${d(r.clV, 2)} / 0,3`, "= " + d(r.clSup, 2) + " m²"),
        _step("Ancho de la cámara", "a = sqrt(S / 2)", `sqrt(${d(r.clSup, 2)} / 2)`, "= " + d(r.clAncho, 3) + " m"),
        _step("Largo de la cámara", "L = 2 · a", `2 · ${d(r.clAncho, 3)}`, "= " + d(r.clLargo, 3) + " m"),
        _step("Consumo diario de cloro", "C = Q_d · 1000 · dosis / 1e6", `${d(r.qd, 2)} · 1000 · ${raw(P.clDosis)} / 1e6`, "= " + d(r.clConsumo, 2) + " kg Cl2/d"),
        _step("Hipoclorito de sodio (8%)", "H = C / 0,08", `${d(r.clConsumo, 2)} / 0,08`, "= " + d(r.clHipo, 2) + " l/d"),
        _step("Consumo mensual (+30% reserva)", "H_mes = H · 30 · 1,3", `${d(r.clHipo, 2)} · 30 · 1,3`, "= " + d(r.clHipoMes, 2) + " l/mes"),
        _step("Consumo en disolución (1:4)", "D = H / 0,25", `${d(r.clHipo, 2)} / 0,25`, "= " + d(r.clDisol, 2) + " L/d"),
        _step("Cloro concentrado por recarga", "C_rec = V_tanque · 0,25", `${raw(P.clTanque)} · 0,25`, "= " + d(r.clNecesidad, 2) + " L"),
        _step("Frecuencia de recarga", "f = V_tanque / D", `${raw(P.clTanque)} / ${d(r.clDisol, 2)}`, "= " + d(r.clFrec, 3) + " d"),
        _step("Caudal de la bomba dosadora", "Q_dos = D / 24", `${d(r.clDisol, 2)} / 24`, "= " + d(r.clBomba, 2) + " L/h"),
    ]));

    /* --- 13 · Reservorio ------------------------------------------------ */
    g.push(_grp("13 · Reservorio de agua tratada", [
        _step("Volumen de regulación y reserva", "V = Q_d / 24 · K1 · K2 · 2 · 1,5", `${d(r.qd, 2)} / 24 · ${raw(P.k1)} · ${raw(P.k2)} · 2 · 1,5`, "= " + d(r.resV, 2) + " m³"),
        _step("Diámetro del reservorio", "D = sqrt((V / prof) · 4 / pi)", `sqrt((${d(r.resV, 2)} / ${raw(P.resProf)}) · 4 / pi)`, "= " + d(r.resD, 3) + " m"),
        _step("Altura de construcción", "H = 0,3 + prof", `0,3 + ${raw(P.resProf)}`, "= " + d(r.resH, 2) + " m"),
    ]));

    return g;
}
