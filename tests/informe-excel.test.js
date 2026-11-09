"use strict";
// Tests del extractor y del recálculo de "Informe desde Excel".
// node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { readXlsx, shiftRows, shiftCols } = require(path.join(__dirname, "xlsx-node.js"));
const IE = require(path.join(ROOT, "informe-excel.js"));
const RC = require(path.join(ROOT, "informe-excel-recalc.js"));
const MC = require(path.join(ROOT, "mod-core.js"));

const GUIDE = path.join(ROOT, "GUÍA_TRABAJO_PRACTICO_PÚBLICO.xlsx");
const COMPLETED = "C:/Users/jvchi/CARPETAS/Facultad/Saneamiento/GUÍA_TRABAJO_PRACTICO_PÚBLICO_TP_Chiappini_Britez_Rios.xlsx";
const hasGuide = fs.existsSync(GUIDE), hasCompleted = fs.existsSync(COMPLETED);

function load(file) {
    const wb = readXlsx(file);
    return { wb, data: IE.extractWorkbook(wb, path.basename(file)) };
}
function near(actual, expected, tolPct, msg) {
    const d = Math.abs(Number(actual) - Number(expected)) / Math.abs(Number(expected)) * 100;
    assert.ok(isFinite(d) && d <= tolPct, `${msg || ""} ${actual} vs ${expected} (${d.toFixed(4)} %)`);
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

test("mapa: normaliza rótulos y detecta roles", () => {
    assert.equal(IE.norm("Números de pisos tipo Á"), "numeros de pisos tipo a");
    assert.equal(IE.norm("  Qcap =   "), "qcap");
});

test("guía original: hojas, población, Bresse y red de 2 anillos", { skip: !hasGuide }, () => {
    const { data } = load(GUIDE);
    assert.equal(data.roles.rio, "DATOS Y SISTEMA IMPULSIÓN RÍO");
    assert.equal(data.roles.potab, "POTABILIZADORA");
    assert.equal(data.roles.tanque, "SISTEMA DE IMPULSIÓN AL TANQUE");
    assert.equal(data.roles.fuente, undefined);
    assert.equal(data.rio.inputs.manzanas, 12);
    assert.equal(data.rio.results.poblacion.value, 66528);
    near(data.rio.results.qb_ls.value, 194.733, 0.5, "Qb original");
    near(data.rio.results.bresse.value, 0.482398, 0.5, "Bresse original");
    assert.deepEqual(data.rio.alts.dS, [550, 500, 350]);
    assert.deepEqual(data.rio.alts.dI, [500, 450, 300]);
    near(data.rio.alts.Hm[0], 13.7954768, 0.5, "Hm Alt 1 original");
    assert.equal(data.red.datosInic.tramos.rows.length, 7, "7 tramos únicos (el RQ común no se duplica)");
    assert.equal(data.red.presiones.nodos.length, 6);
    assert.equal(data.variant.anillos, 2);
    assert.equal(data.hasCachedValues, true);
});

test("versión completada: valores de aceptación del TP", { skip: !hasCompleted }, () => {
    const { data } = load(COMPLETED);
    assert.equal(data.variant.tieneFuente, true);
    assert.equal(data.variant.tieneMinimoCosto, true);
    assert.equal(data.variant.tieneTabla8, true);
    assert.equal(data.rio.inputs.manzanas, 10);
    assert.equal(data.rio.inputs.pisos, 11);
    near(data.rio.results.poblacion.value, 6600, 0.5, "población");
    near(data.rio.results.logistica.value, 132, 0.5, "logística");
    near(data.rio.results.qm_m3d.value, 1326.6, 0.5, "Qm m3/d");
    near(data.rio.results.qm_ls.value, 15.354, 0.5, "Qm l/s");
    near(data.rio.results.qb_ls.value, 19.35, 0.5, "Qb río");
    near(data.rio.results.bresse.value, 0.1520, 0.5, "Bresse río");
    assert.equal(data.rio.alts.dS[1], 150);
    assert.equal(data.rio.alts.dI[1], 125);
    near(data.rio.alts.Hm[1], 36.76, 0.5, "Hm río Alt 2");
    near(data.rio.alts.Pmb[1], 15.08, 0.5, "Pmb río Alt 2");
    assert.equal(data.rio.padop, 20);
    const cost = (i) => Object.entries(data.rio.costRows).find(([k]) => /costo anual total/i.test(k))[1].values[i];
    near(cost(0), 9504, 0.5, "costo río Alt 1");
    near(cost(1), 6454, 0.5, "costo río Alt 2");
    near(cost(2), 5957, 0.5, "costo río Alt 3");
    const verif = Object.entries(data.rio.costRows).find(([k]) => /^verifica/i.test(k))[1].values;
    assert.match(String(verif[2]), /no verifica/i, "Alt 3 del río no verifica");

    assert.equal(data.potab.sp.caudalDiario, 1326.6);
    near(data.rio.results.qb_ls.value, 19.35, 0.5, "Qcap = Qb del río");

    near(data.tanque.inputs.qb_ls, 18.42, 0.5, "Qb tanque");
    near(data.tanque.inputs.bresse, 0.1484, 0.5, "Bresse tanque");
    assert.equal(data.tanque.alts.dS[0], 150);
    assert.equal(data.tanque.alts.dI[0], 125);
    near(data.tanque.alts.Hm[0], 53.62, 0.5, "Hm tanque Alt 1");
    near(data.tanque.alts.Pb[0], 18.55, 0.5, "Pb tanque");
    near(data.tanque.alts.Pmb[0], 21.28, 0.5, "Pmb tanque");
    assert.equal(data.tanque.padop, 25);
    const tcost = (i) => Object.entries(data.tanque.costRows).find(([k]) => /costo anual total/i.test(k))[1].values[i];
    near(tcost(0), 9278, 0.5, "costo tanque Alt 1");
    near(tcost(1), 8850, 0.5, "costo tanque Alt 2");
    near(tcost(2), 9966, 0.5, "costo tanque Alt 3");

    assert.equal(data.red.caudales.iter.value, 29);
    near(data.red.presiones.hbAd.value, 11.13, 0.5, "Hbase");
    near(data.red.presiones.ctBase.value, 95.13, 0.5, "cota base tanque");
    near(data.red.presiones.pMin.value, 10.002, 0.5, "presión mínima");
    const a1 = data.red.presiones.nodos.find((n) => n.id === "A1");
    assert.ok(a1, "nodo A1");
    near(a1.p, 10.002, 0.5, "presión en A1");
});

test("recálculo independiente: río, tanque y red coinciden con el Excel del TP", { skip: !hasCompleted }, async () => {
    const { data } = load(COMPLETED);
    const rec = await RC.recalcAll(data);
    near(rec.rio.qb_ls, 19.34625, 0.5, "Qb recalculado");
    near(rec.rio.bresse, 0.152049, 0.5, "Bresse recalculado");
    near(rec.rio.alts[1].Hm, 36.7644, 0.5, "Hm Alt 2 recalculado");
    near(rec.rio.alts[1].Pb, 12.6445, 0.5, "Pb Alt 2 recalculado");
    near(rec.rio.alts[1].annual, 6372.57, 2.5, "costo recalculado (incluye corrección CV→HP)");
    near(rec.tanque.qb_ls, 18.425, 0.5, "Qb tanque recalculado");
    near(rec.tanque.alts[0].Hm, 53.6201, 0.5, "Hm tanque recalculado");
    near(rec.tanque.alts[0].Pmb, 21.2755, 0.5, "Pmb tanque recalculado");
    near(rec.tanque.alts[0].annual, 9278.09, 0.5, "costo tanque recalculado");
    assert.equal(rec.red.result.hc.its.length, 29);
    near(rec.red.result.Hbase, 11.13, 0.5, "Hbase recalculada");
    near(Math.min(...rec.red.result.pres), 10.0018, 0.5, "presión mínima recalculada");
    near(rec.red.result.cierre, 0.001429, 0.5, "cierre recalculado");
    near(rec.red.result.Qf[0] * 1000, data.red.datosInic.tramos.rows[0].Qf, 0.5, "Q tramo A0-B0");
});

test("el recálculo usa los datos del archivo, no valores por defecto", { skip: !hasGuide }, async () => {
    const { wb, data } = load(GUIDE);
    const sh = wb.Sheets[data.roles.rio];
    sh.B3.v = 14; sh.B5.v = 20; sh.B24.v = 10; sh.D29.v = 350; sh.H65.v = 0.8;
    const d = IE.extractWorkbook(wb, "modificado.xlsx");
    assert.equal(d.rio.inputs.manzanas, 14);
    assert.equal(d.rio.inputs.pisos, 20);
    assert.equal(d.rio.inputs.horas, 10);
    assert.equal(d.rio.alts.dI[2], 350);
    assert.equal(d.rio.etaB[0], 0.8);
    const rec = RC.recalcRioCore(d);
    const pop = 14 * 6 * (20 * 6 * (3 * 2 + 1));
    const log = (6 * 20) * 10 / 100 * 6 * 14;
    const qm = pop * 200 + log * 50;
    const qb = 1.2 * 1.05 * (qm / 1000) / 86400;
    near(rec.qm_ls, qm / 86400, 0.5, "Qm con datos modificados");
    near(rec.qb_ls, qb * 1000, 0.5, "Qb con datos modificados");
    near(rec.bresse, MC.bresse(qb, 10 / 24), 0.5, "Bresse con datos modificados");
    assert.equal(rec.alts[2].dI, 350);
    assert.equal(rec.alts[0].etaB, 0.8);
});

test("búsqueda por rótulo: una fila insertada no rompe la extracción", { skip: !hasGuide }, () => {
    const { wb, data } = load(GUIDE);
    shiftRows(wb, data.roles.rio, 1);
    const d = IE.extractWorkbook(wb, "fila-insertada.xlsx");
    assert.equal(d.rio.inputs.manzanas, 12);
    assert.equal(d.rio.inputs.pisos, 22);
    assert.equal(d.rio.results.poblacion.value, 66528);
    const def = d.rio.inputDefs.find((x) => x.key === "manzanas");
    assert.ok(Number(def.cell.replace(/[A-Z]/g, "")) > 3, "el rótulo se encontró en una fila corrida");
});

test("búsqueda por rótulo: una columna insertada tampoco rompe la extracción", { skip: !hasGuide }, () => {
    const { wb, data } = load(GUIDE);
    shiftCols(wb, data.roles.rio, 1);
    const d = IE.extractWorkbook(wb, "columna-insertada.xlsx");
    assert.equal(d.rio.inputs.manzanas, 12);
    assert.equal(d.rio.inputs.pisos, 22);
    assert.equal(d.rio.results.poblacion.value, 66528);
    assert.deepEqual(d.rio.alts.dS, [550, 500, 350]);
});

test("advertencia cuando hay fórmulas sin valor en caché", { skip: !hasGuide }, () => {
    const { wb, data } = load(GUIDE);
    const sh = wb.Sheets[data.roles.rio];
    delete sh.B11.v; delete sh.B11.w; // fórmula sin resultado
    const d = IE.extractWorkbook(wb, "sin-cache.xlsx");
    assert.equal(d.hasCachedValues, false);
    assert.ok(d.warnings.some((w) => /no tiene resultados calculados/i.test(w)));
});

test("errores heredados: la guía original multiplica por 1,014 y usa I50 en D50", { skip: !hasGuide }, () => {
    const { data } = load(GUIDE);
    const rioSheet = data.allCells[data.roles.rio];
    const hp = rioSheet.find((c) => c.cell === "B65");
    assert.ok(hp && /1\.014\*/.test(hp.f), "conversión CV→HP multiplicando en el río");
    const tan = data.allCells[data.roles.tanque];
    const d50 = tan.find((c) => c.cell === "D50");
    assert.ok(d50 && /I50/.test(d50.f), "D50 dividido por I50");
});

test("la versión completada corrige la conversión del tanque", { skip: !hasCompleted }, () => {
    const { data } = load(COMPLETED);
    const tan = data.allCells[data.roles.tanque];
    const b49 = tan.find((c) => c.cell === "B49");
    assert.ok(b49 && /\/1\.014/.test(b49.f), "el tanque divide por 1,014");
    const d50 = tan.find((c) => c.cell === "D50");
    assert.ok(d50 && /J50/.test(d50.f), "D50 usa J50");
});
