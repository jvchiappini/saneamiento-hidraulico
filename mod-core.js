"use strict";
/* =====================================================================
   mod-core.js — Núcleo compartido de los módulos:
   Red de distribución, Impulsión al tanque, Red cloacal y Predial.

   - Tablas normativas transcritas de la NP 68 (2016) y normas afines.
   - Fórmulas hidráulicas (Fair-Whipple-Hsiao, Flamant, Hazen-Williams, Bazin).
   - Memoria de cálculo: fórmula simbólica + reemplazo numérico + resultado (LaTeX).
   - Utilidades de interfaz: formularios con enlace a estado, insignias, tablas,
     modo Manual / Automático e informe imprimible.
   Las funciones de cálculo no tocan el DOM, así se pueden verificar con Node.
   ===================================================================== */
(function (root) {
    const C = {};
    C.G = 9.81;

    /* ---------------- Formato numérico (es-AR) ---------------- */
    C.f = function (n, d = 2) {
        if (n == null || !isFinite(n)) return "—";
        if (Math.abs(n) < 0.5 * Math.pow(10, -d)) n = 0; // evita "-0"
        return Number(n).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: d });
    };
    C.fx = function (n, d = 2) {
        if (n == null || !isFinite(n)) return "—";
        if (Math.abs(n) < 0.5 * Math.pow(10, -d)) n = 0;
        return Number(n).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
    };
    // Número para LaTeX: decimales fijos y coma decimal sin espacio extra.
    C.tn = function (n, d = 2) {
        if (n == null || !isFinite(n)) return "\\text{—}";
        const s = Number(n).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
        return s.replace(/,/g, "{,}");
    };
    // Número para LaTeX con decimales significativos (sin ceros de relleno).
    C.tg = function (n, d = 4) {
        if (n == null || !isFinite(n)) return "\\text{—}";
        const s = Number(n).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: d });
        return s.replace(/,/g, "{,}");
    };
    C.esc = function (s) {
        return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    };
    C.r10 = (x) => Math.round(x * 1e10) / 1e10;
    // Redondeo hacia arriba al múltiplo de "step" (tolerante a errores de coma flotante).
    C.ceilStep = (x, step) => C.r10(Math.ceil(C.r10(x / step) - 1e-9) * step);
    C.floorStep = (x, step) => C.r10(Math.floor(C.r10(x / step) + 1e-9) * step);
    C.nextIn = (list, x, key) => {
        for (const it of list) { const v = key ? it[key] : it; if (v >= x - 1e-9) return it; }
        return null;
    };
    C.nextAbove = (list, x, key) => {
        for (const it of list) { const v = key ? it[key] : it; if (v > x + 1e-9) return it; }
        return null;
    };
    C.sum = (a) => a.reduce((s, x) => s + x, 0);

    /* ---------------- Diámetros comerciales ----------------
       mm: diámetro nominal usado en las fórmulas (como en la guía de la cátedra).
       t3: fila de la Tabla III del Anexo C de la NP 68 (longitudes equivalentes). */
    C.DIAM = [
        { mm: 15, pul: "½\"", t3: 13 }, { mm: 20, pul: "¾\"", t3: 19 }, { mm: 25, pul: "1\"", t3: 25 },
        { mm: 32, pul: "1¼\"", t3: 32 }, { mm: 40, pul: "1½\"", t3: 38 }, { mm: 50, pul: "2\"", t3: 50 },
        { mm: 60, pul: "2½\"", t3: 63 }, { mm: 75, pul: "3\"", t3: 75 }, { mm: 100, pul: "4\"", t3: 100 },
        { mm: 125, pul: "5\"", t3: 125 }, { mm: 150, pul: "6\"", t3: 150 }, { mm: 200, pul: "8\"", t3: 200 },
        { mm: 250, pul: "10\"", t3: 250 }, { mm: 300, pul: "12\"", t3: 300 }, { mm: 350, pul: "14\"", t3: 350 },
        { mm: 400, pul: "16\"", t3: null }, { mm: 450, pul: "18\"", t3: null }, { mm: 500, pul: "20\"", t3: null },
        { mm: 550, pul: "22\"", t3: null }, { mm: 600, pul: "24\"", t3: null },
    ];
    // Diámetro en pulgadas (valor numérico) de cada comercial
    const INCH = { 15: 0.5, 20: 0.75, 25: 1, 32: 1.25, 40: 1.5, 50: 2, 60: 2.5, 75: 3, 100: 4, 125: 5, 150: 6, 200: 8, 250: 10, 300: 12, 350: 14, 400: 16, 450: 18, 500: 20, 550: 22, 600: 24 };
    C.DIAM.forEach((d) => { d.inch = INCH[d.mm]; });
    C.diamPorPulgadas = (inch) => C.DIAM.find((d) => d.inch >= inch - 1e-9) || C.DIAM[C.DIAM.length - 1];
    C.diam = (mm) => C.DIAM.find((d) => Math.abs(d.mm - mm) < 1e-6) || { mm, pul: C.f(mm, 0) + " mm", t3: null };
    C.pul = (mm) => C.diam(mm).pul;
    C.dLabel = (mm) => `${C.f(mm, 0)} mm (${C.pul(mm)})`;
    C.nextDiam = (mm) => C.nextIn(C.DIAM, mm, "mm");          // primer comercial ≥ mm
    C.diamAbove = (mm) => C.nextAbove(C.DIAM, mm, "mm");      // primer comercial > mm

    /* ---------------- NP 68 · Tabla VI: rendimiento de bombas centrífugas ---------------- */
    C.TABLA_VI = [[2.5, 45], [5, 52], [7.5, 61], [10, 66], [15, 68], [20, 71], [25, 75], [30, 80], [40, 84], [50, 85], [100, 87], [200, 88]];
    // Se adopta el valor tabulado del caudal inmediato superior (criterio de la guía de la cátedra).
    C.etaBomba = function (qls) {
        const row = C.TABLA_VI.find((r) => r[0] >= qls - 1e-9) || C.TABLA_VI[C.TABLA_VI.length - 1];
        return { eta: row[1] / 100, qTab: row[0], fuera: qls > 200 };
    };

    /* ---------------- NP 68 · Tabla VII: rendimiento de motores eléctricos ---------------- */
    C.TABLA_VII = [[0.25, "¼", 61], [1 / 3, "⅓", 63], [0.5, "½", 64], [0.75, "¾", 67], [1, "1", 72], [1.5, "1½", 73],
    [2, "2", 75], [3, "3", 77], [4, "4", 79], [5, "5", 81], [6, "6", 82], [7.5, "7½", 82.4], [10, "10", 83],
    [12, "12", 84], [15, "15", 85], [20, "20", 86], [30, "30", 87], [50, "50", 88], [100, "100", 90]];
    C.etaMotor = function (hp) {
        const row = C.TABLA_VII.find((r) => r[0] >= hp - 1e-9) || C.TABLA_VII[C.TABLA_VII.length - 1];
        return { eta: row[2] / 100, hpTab: row[0], hpLabel: row[1], fuera: hp > 100 };
    };

    /* ---------------- NP 68 · Tabla VIII: holgura de motores ---------------- */
    C.holgura = function (hp) {
        if (hp <= 2) return { h: 0.50, txt: "hasta 2 HP" };
        if (hp <= 5) return { h: 0.30, txt: "de 2 a 5 HP" };
        if (hp <= 10) return { h: 0.20, txt: "de 5 a 10 HP" };
        if (hp <= 20) return { h: 0.15, txt: "de 10 a 20 HP" };
        return { h: 0.10, txt: "más de 20 HP" };
    };
    C.HP_COM = [0.25, 1 / 3, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 7.5, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500];
    C.hpTxt = function (hp) {
        const m = { 0.25: "¼", 0.5: "½", 0.75: "¾", 1.5: "1½", 7.5: "7½" };
        if (Math.abs(hp - 1 / 3) < 1e-6) return "⅓";
        return m[hp] || C.f(hp, 2);
    };
    C.hpComercial = (hp) => C.nextIn(C.HP_COM, hp) || hp;
    // 1 HP = 1,014 CV  →  P[HP] = P[CV] / 1,014  (NP 68, nota 1 del ítem 6.23.6; guía predial)
    C.CV_POR_HP = 1.014;

    /* ---------------- NP 68 · Anexo C, Tabla III: longitudes equivalentes (m) ---------------- */
    C.T3_COLS = [
        { k: "curva90", n: "Curva de 90° (codo radio largo)" },
        { k: "codo90m", n: "Codo 90° radio medio" },
        { k: "codo90c", n: "Codo 90° radio corto" },
        { k: "codo45", n: "Codo 45°" },
        { k: "curva90a", n: "Curva 90° R/D = 1,5" },
        { k: "curva90b", n: "Curva 90° R/D = 1" },
        { k: "curva45", n: "Curva 45°" },
        { k: "entNormal", n: "Entrada normal" },
        { k: "entBorda", n: "Entrada de borda" },
        { k: "regComp", n: "Válvula de cierre (registro de compuerta abierto)" },
        { k: "regGlobo", n: "Registro de globo abierto" },
        { k: "regAngulo", n: "Registro de ángulo abierto" },
        { k: "teeDirecto", n: "Tee de paso directo" },
        { k: "teeLateral", n: "Tee de una salida (lateral)" },
        { k: "teeBilateral", n: "Tee de 2 salidas (bilateral)" },
        { k: "valvPie", n: "Válvula de pie con criba" },
        { k: "salida", n: "Salida de canalización" },
        { k: "retLiviana", n: "Válvula de retención (tipo liviano)" },
        { k: "retPesada", n: "Válvula de retención (tipo pesado)" },
    ];
    C.T3_ROWS = {
        13: [0.3, 0.4, 0.5, 0.2, 0.2, 0.3, 0.2, 0.2, 0.4, 0.1, 4.9, 2.6, 0.3, 1.0, 1.0, 3.6, 0.4, 1.1, 1.6],
        19: [0.4, 0.6, 0.7, 0.3, 0.3, 0.4, 0.2, 0.2, 0.5, 0.1, 6.7, 3.6, 0.4, 1.4, 1.4, 5.6, 0.5, 1.6, 2.4],
        25: [0.5, 0.7, 0.8, 0.4, 0.3, 0.5, 0.2, 0.3, 0.7, 0.2, 8.2, 4.6, 0.5, 1.7, 1.7, 7.3, 0.7, 2.1, 3.2],
        32: [0.7, 0.9, 1.1, 0.5, 0.4, 0.6, 0.3, 0.4, 0.9, 0.2, 11.3, 5.6, 0.7, 2.3, 2.3, 10.0, 0.9, 2.7, 4.0],
        38: [0.9, 1.1, 1.3, 0.6, 0.5, 0.7, 0.3, 0.5, 1.0, 0.3, 13.4, 6.7, 0.9, 2.8, 2.8, 11.6, 1.0, 3.2, 4.8],
        50: [1.1, 1.4, 1.7, 0.8, 0.6, 0.9, 0.4, 0.7, 1.5, 0.4, 17.4, 8.5, 1.1, 3.5, 3.5, 14.0, 1.5, 4.2, 6.4],
        63: [1.3, 1.7, 2.0, 0.9, 0.8, 1.0, 0.5, 0.9, 1.9, 0.4, 21.0, 10.0, 1.3, 4.3, 4.3, 17.0, 1.9, 5.2, 8.1],
        75: [1.6, 2.1, 2.5, 1.2, 1.0, 1.3, 0.6, 1.1, 2.2, 0.5, 26.0, 13.0, 1.6, 5.2, 5.2, 20.0, 2.2, 6.3, 9.7],
        100: [2.1, 2.8, 3.4, 1.5, 1.3, 1.6, 0.7, 1.6, 3.2, 0.7, 34.0, 17.0, 2.1, 6.7, 6.7, 23.0, 3.2, 6.4, 12.9],
        125: [2.7, 3.7, 4.2, 1.9, 1.6, 2.1, 0.9, 2.0, 4.0, 0.9, 43.0, 21.0, 2.7, 8.4, 8.4, 30.0, 4.0, 10.4, 16.1],
        150: [3.4, 4.3, 4.9, 2.3, 1.9, 2.5, 1.1, 2.5, 5.0, 1.1, 51.0, 26.0, 3.4, 10.0, 10.0, 39.0, 5.0, 12.5, 19.3],
        200: [4.3, 5.5, 6.4, 3.0, 2.4, 3.3, 1.5, 3.5, 6.0, 1.4, 67.0, 34.0, 4.3, 13.0, 13.0, 52.0, 6.0, 16.0, 25.0],
        250: [5.5, 6.7, 7.9, 3.8, 3.0, 4.1, 1.8, 4.5, 7.5, 1.7, 85.0, 43.0, 5.5, 16.0, 16.0, 65.0, 7.5, 20.0, 32.0],
        300: [6.1, 7.9, 9.5, 4.6, 3.6, 4.8, 2.2, 5.5, 9.0, 2.1, 102.0, 51.0, 6.1, 19.0, 19.0, 78.0, 9.0, 24.0, 38.0],
        350: [7.3, 9.5, 10.5, 5.3, 4.4, 5.4, 2.5, 6.2, 11.0, 2.4, 120.0, 60.0, 7.3, 22.0, 22.0, 90.0, 11.0, 28.0, 45.0],
    };
    C.t3Name = (k) => (C.T3_COLS.find((c) => c.k === k) || { n: k }).n;
    // Longitud equivalente de un accesorio. Para DN > 350 mm la NP 68 no tabula valores:
    // se extrapola manteniendo constante la relación Leq/D de la fila de 350 mm.
    C.leq = function (mm, k) {
        const idx = C.T3_COLS.findIndex((c) => c.k === k);
        const d = C.diam(mm);
        if (d.t3 && C.T3_ROWS[d.t3]) return { v: C.T3_ROWS[d.t3][idx], dnTab: d.t3, extrap: false };
        if (mm > 350) return { v: C.r10(C.T3_ROWS[350][idx] * mm / 350), dnTab: 350, extrap: true };
        // diámetro fuera de lista: fila más cercana por debajo
        const keys = Object.keys(C.T3_ROWS).map(Number).filter((x) => x <= mm);
        const dn = keys.length ? keys[keys.length - 1] : 13;
        return { v: C.T3_ROWS[dn][idx], dnTab: dn, extrap: true };
    };
    // Suma de longitudes equivalentes de una lista [{k, n}]
    C.leqList = function (mm, list) {
        const rows = (list || []).filter((it) => it && it.n > 0).map((it) => {
            const l = C.leq(mm, it.k);
            return { k: it.k, name: C.t3Name(it.k), n: it.n, unit: l.v, total: it.n * l.v, extrap: l.extrap, dnTab: l.dnTab };
        });
        return { rows, total: C.sum(rows.map((r) => r.total)), extrap: rows.some((r) => r.extrap) };
    };

    /* ---------------- NP 68 · Tabla II: acometida (caudal máx. l/s según presión) ---------------- */
    C.TABLA_II_D = [15, 20, 25, 32, 40, 50];
    C.TABLA_II = [
        [50, 0.28, 0.60, 1.18, 2.02, 3.19, 5.70], [60, 0.33, 0.66, 1.30, 2.22, 3.51, 6.26], [70, 0.35, 0.72, 1.41, 2.40, 3.79, 6.77],
        [80, 0.37, 0.75, 1.48, 2.53, 4.00, 7.13], [90, 0.40, 0.78, 1.56, 2.67, 4.22, 7.46], [100, 0.42, 0.81, 1.63, 2.79, 4.41, 7.87],
        [110, 0.44, 0.84, 1.69, 2.91, 4.60, 8.21], [120, 0.46, 0.87, 1.75, 3.03, 4.79, 8.54], [130, 0.48, 0.90, 1.81, 3.15, 4.98, 8.88],
        [140, 0.49, 0.93, 1.87, 3.24, 5.12, 9.14], [150, 0.51, 0.96, 1.92, 3.32, 5.25, 9.36], [160, 0.56, 0.99, 1.97, 3.40, 5.37, 9.59],
        [170, 0.54, 1.02, 2.02, 3.49, 5.51, 9.84], [180, 0.55, 1.05, 2.08, 3.57, 5.64, 10.07], [190, 0.57, 1.08, 2.13, 3.65, 5.77, 10.29],
        [200, 0.58, 1.11, 2.18, 3.73, 5.89, 10.52], [210, 0.60, 1.14, 2.23, 3.82, 6.04, 10.77], [220, 0.61, 1.17, 2.29, 3.90, 6.16, 11.00],
        [230, 0.62, 1.19, 2.33, 3.97, 6.27, 11.19], [240, 0.63, 1.21, 2.38, 4.05, 6.40, 11.42], [250, 0.64, 1.22, 2.42, 4.12, 6.51, 11.62],
        [260, 0.65, 1.24, 2.47, 4.20, 6.64, 11.84], [270, 0.67, 1.26, 2.61, 4.27, 6.75, 12.04], [280, 0.68, 1.28, 2.55, 4.35, 6.87, 12.27],
        [290, 0.69, 1.30, 2.59, 4.42, 6.98, 12.46], [300, 0.70, 1.32, 2.62, 4.50, 7.11, 12.69], [310, 0.71, 1.34, 2.66, 4.57, 7.22, 12.89],
        [320, 0.72, 1.36, 2.70, 4.65, 7.35, 13.11], [330, 0.73, 1.37, 2.74, 4.72, 7.46, 13.31], [340, 0.74, 1.39, 2.77, 4.80, 7.58, 13.54],
        [350, 0.76, 1.41, 2.81, 4.87, 7.69, 13.73],
    ];
    // Fila de la tabla para la presión disponible: se toma la fila tabulada inmediata inferior (lado seguro).
    C.tablaIIFila = function (kpa) {
        let row = null;
        for (const r of C.TABLA_II) if (r[0] <= kpa + 1e-9) row = r;
        return row;
    };

    /* ---------------- NP 68 · Tabla III: caudales y pesos + Tabla V (sub-ramal mínimo) ---------------- */
    C.ARTEFACTOS = [
        { k: "bebedero", n: "Bebedero", q: 0.05, p: 0.1, dmin: 15 },
        { k: "bidet", n: "Bidet", q: 0.10, p: 0.1, dmin: 15 },
        { k: "inodoroCisterna", n: "Inodoro con cisterna de descarga", q: 0.15, p: 0.3, dmin: 15 },
        { k: "inodoroValvula", n: "Inodoro con válvula de descarga", q: 1.90, p: 40.0, dmin: 40 },
        { k: "mingContinua", n: "Mingitorio de descarga continua (por metro o aparato)", q: 0.15, p: 0.3, dmin: 15 },
        { k: "mingDiscontinua", n: "Mingitorio de descarga discontinua o llave de paso", q: 0.15, p: 0.3, dmin: 15 },
        { k: "mingNoAsp", n: "Mingitorio no aspirante con válvula de descarga o registro", q: 0.15, p: 0.3, dmin: 15 },
        { k: "mingAutoAsp", n: "Mingitorio auto aspirante con válvula de descarga", q: 0.50, p: 2.8, dmin: 15 },
        { k: "ducha", n: "Ducha", q: 0.20, p: 0.5, dmin: 15 },
        { k: "banera", n: "Canilla de bañera", q: 0.30, p: 1.0, dmin: 15 },
        { k: "lavatorio", n: "Lavatorio (canilla o mezcladora, agua fría)", q: 0.20, p: 0.5, dmin: 15 },
        { k: "piletaCocina", n: "Pileta de cocina (canilla o mezcladora, agua fría)", q: 0.25, p: 0.7, dmin: 15 },
        { k: "canillaPatio", n: "Canilla de patio, riego manual o usos varios", q: 0.25, p: 0.7, dmin: 15 },
        { k: "regadora", n: "Canilla para regadora automática de jardín", q: 0.30, p: 1.0, dmin: 15 },
        { k: "piletaLavar", n: "Canilla de pileta de lavar o máquina lavarropas", q: 0.30, p: 1.0, dmin: 20 },
        { k: "lavavajillas", n: "Máquina lavavajillas o lavarropas", q: 0.30, p: 1.0, dmin: 20 },
    ];
    C.art = (k) => C.ARTEFACTOS.find((a) => a.k === k);

    /* ---------------- NP 68 · Tabla IV: velocidades y caudales máximos ---------------- */
    C.TABLA_IV = [[15, 1.60, 0.20], [20, 1.95, 0.60], [25, 2.25, 1.20], [32, 2.50, 2.50], [40, 2.50, 4.00], [50, 2.50, 5.70],
    [60, 2.50, 8.90], [75, 2.50, 12.0], [100, 2.50, 18.0], [125, 2.50, 31.0], [150, 2.50, 40.0]];

    /* ---------------- NP 68 · Anexo C, Figura I: diámetro en función de la suma de pesos ---------------- */
    C.FIG_I = [[0.44, 15], [3.4, 20], [15, 25], [44, 32], [107, 40], [460, 50], [1400, 60], [3900, 75], [12000, 100], [29500, 125], [60000, 150]];
    C.diamPorPesos = function (sp) {
        const r = C.FIG_I.find((x) => sp <= x[0] + 1e-9);
        return r ? { mm: r[1], lim: r[0] } : { mm: 150, lim: 60000, fuera: true };
    };
    C.diamPorCaudalIV = function (qls) {
        const r = C.TABLA_IV.find((x) => qls <= x[2] + 1e-9);
        return r ? { mm: r[0], qmax: r[2], vmax: r[1] } : { mm: 150, qmax: 40, vmax: 2.5, fuera: true };
    };
    C.tablaIV = (mm) => { const r = C.TABLA_IV.find((x) => x[0] === mm); return r ? { vmax: r[1], qmax: r[2] } : null; };

    /* ---------------- Fórmulas hidráulicas ---------------- */
    C.area = (Dm) => Math.PI * Dm * Dm / 4;
    // Fair-Whipple-Hsiao (acero galvanizado), NP 68 6.10.2.1:  Q = 27,113·J^0,532·D^2,596
    C.jFWH = (Q, Dm) => Math.pow(Q / (27.113 * Math.pow(Dm, 2.596)), 1 / 0.532);
    // Flamant (PVC rígido), NP 68 6.10.2.2:  D·J/4 = 0,000135·(V^7/D)^(1/4)
    C.jFlamant = (V, Dm) => 4 * 0.000135 * Math.pow(Math.pow(V, 7) / Dm, 0.25) / Dm;
    // Hazen-Williams:  J = 10,643·C^-1,85·D^-4,87·Q^1,85
    C.jHW = (Q, Dm, Chw) => 10.643 * Math.pow(Chw, -1.85) * Math.pow(Dm, -4.87) * Math.pow(Math.abs(Q), 1.85);
    // Bazin (sección llena): v = 87/(1+γ/√RH)·√(RH·I)
    C.vBazin = (RH, I, gamma) => 87 / (1 + gamma / Math.sqrt(RH)) * Math.sqrt(RH * I);
    // Bresse (NP 68 6.17.1):  D = 1,3·√Q·X^(1/4)
    C.bresse = (Q, X) => 1.3 * Math.sqrt(Q) * Math.pow(X, 0.25);

    /* ---------------- Memoria de cálculo ---------------- */
    // Un ítem: { n: nombre, f: fórmula (TeX), s: reemplazo (TeX), r: resultado (TeX), u: unidad (TeX), nota, ok }
    C.Memo = class {
        constructor() { this.groups = []; this.cur = null; }
        g(title) { this.cur = { title, items: [] }; this.groups.push(this.cur); return this; }
        add(n, f, s, r, u, extra) {
            if (!this.cur) this.g("Cálculo");
            this.cur.items.push(Object.assign({ n, f, s, r, u }, extra || {}));
            return this;
        }
        note(text) { if (!this.cur) this.g("Cálculo"); this.cur.items.push({ note: text }); return this; }
    };

    /* ---------------- Persistencia ---------------- */
    C.load = function (key, defaults) {
        const st = JSON.parse(JSON.stringify(defaults));
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const o = JSON.parse(raw);
                if (o && o.__v === defaults.__v) return Object.assign(st, o);
            }
        } catch (e) { /* almacenamiento no disponible */ }
        return st;
    };
    C.save = function (key, st) { try { localStorage.setItem(key, JSON.stringify(st)); } catch (e) { /* noop */ } };
    C.read = function (key) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch (e) { return null; } };

    /* ---------------- Ruta en el estado ("a.b.0.c") ---------------- */
    C.getPath = (o, p) => p.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
    C.setPath = function (o, p, v) {
        const ks = p.split(".");
        let x = o;
        for (let i = 0; i < ks.length - 1; i++) x = x[ks[i]];
        x[ks[ks.length - 1]] = v;
    };

    /* =====================================================================
       Interfaz (solo en navegador)
       ===================================================================== */
    C.$ = (id) => (typeof document !== "undefined" ? document.getElementById(id) : null);

    // Campo numérico enlazado al estado por ruta. opts: {unit, step, adopt (valor automático), help, type, options}
    C.field = function (path, label, value, opts = {}) {
        const unit = opts.unit ? `<span class="unit">${opts.unit}</span>` : "";
        const help = opts.help ? `<small class="fhelp">${opts.help}</small>` : "";
        if (opts.type === "select") {
            const ops = opts.options.map((o) => `<option value="${C.esc(o.v)}" ${String(o.v) === String(value) ? "selected" : ""}>${C.esc(o.t)}</option>`).join("");
            return `<div class="field"><label>${label}</label><div class="input-row"><select data-bind="${path}" data-type="${opts.num ? "num" : "text"}">${ops}</select>${unit}</div>${help}</div>`;
        }
        if (opts.type === "text") {
            return `<div class="field"><label>${label}</label><div class="input-row"><input type="text" data-bind="${path}" data-type="text" value="${C.esc(value)}">${unit}</div>${help}</div>`;
        }
        // Campo "adoptado": en modo automático muestra el valor del algoritmo y no se edita.
        if (opts.adopt !== undefined) {
            const auto = opts.auto;
            const v = auto ? "" : (value == null ? "" : value);
            const ph = opts.adopt == null || !isFinite(opts.adopt) ? "" : C.f(opts.adopt, opts.dec || 4);
            return `<div class="field adopt ${auto ? "is-auto" : ""}"><label>${label} <span class="tag-adopt">${auto ? "automático" : "adoptado"}</span></label>
                <div class="input-row"><input type="number" step="any" inputmode="decimal" data-bind="${path}" data-type="num-null"
                 value="${v}" placeholder="${ph}" ${auto ? "disabled" : ""}>${unit}</div>${help}</div>`;
        }
        return `<div class="field"><label>${label}</label><div class="input-row"><input type="number" step="any" inputmode="decimal" data-bind="${path}" data-type="num" value="${value == null ? "" : value}">${unit}</div>${help}</div>`;
    };

    // Enlace delegado: cualquier input con data-bind actualiza el estado.
    C.bindAll = function (rootEl, st, onChange) {
        const handler = (ev) => {
            const el = ev.target;
            const path = el.getAttribute && el.getAttribute("data-bind");
            if (!path) return;
            const type = el.getAttribute("data-type");
            let v = el.value;
            if (type === "num") { v = parseFloat(String(v).replace(",", ".")); if (!isFinite(v)) v = 0; }
            else if (type === "num-null") { v = String(v).trim() === "" ? null : parseFloat(String(v).replace(",", ".")); if (v != null && !isFinite(v)) v = null; }
            else if (type === "bool") v = el.checked;
            else if (type === "bool-s") v = el.value === "1";
            C.setPath(st, path, v);
            onChange(path, ev.type);
        };
        rootEl.addEventListener("input", handler);
        rootEl.addEventListener("change", (ev) => {
            const el = ev.target;
            if (el.tagName === "SELECT" || el.type === "checkbox") handler(ev);
        });
    };

    C.debounce = function (fn, ms) { let t = null; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    C.badge = function (ok, okTxt = "Verifica", failTxt = "No verifica", warn = false) {
        if (ok) return `<span class="badge-state ok">✓ ${C.esc(okTxt)}</span>`;
        return `<span class="badge-state ${warn ? "warn" : "fail"}">${warn ? "⚠" : "✕"} ${C.esc(failTxt)}</span>`;
    };

    C.table = function (head, rows, opts = {}) {
        const th = head.map((h) => `<th>${h}</th>`).join("");
        const tr = rows.map((r) => {
            const cls = r.cls ? ` class="${r.cls}"` : "";
            const cells = (r.cells || r).map((c) => `<td>${c == null ? "" : c}</td>`).join("");
            return `<tr${cls}>${cells}</tr>`;
        }).join("");
        return `<div class="table-wrap${opts.cls ? " " + opts.cls : ""}"><table class="mtable"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
    };

    C.kv = function (rows) {
        return `<div class="kv">${rows.map((r) => `<div class="kv-row${r[3] ? " hl" : ""}"><span class="kv-k">${r[0]}</span><span class="kv-v">${r[1]}${r[2] ? ` <small>${r[2]}</small>` : ""}</span></div>`).join("")}</div>`;
    };

    C.kpi = (label, value, unit) => `<div class="kpi"><div class="kpi-label">${C.esc(label)}</div><div class="kpi-value">${value}${unit ? ` <small>${C.esc(unit)}</small>` : ""}</div></div>`;

    // Memoria de cálculo → HTML con LaTeX (MathJax)
    C.memoHTML = function (memo, opts = {}) {
        const groups = memo.groups || memo;
        const item = (it) => {
            if (it.note) return `<div class="mm-note">${it.note}</div>`;
            const u = it.u ? `\\;\\mathrm{${it.u}}` : "";
            let eq = it.f;
            if (it.s) eq += ` = ${it.s}`;
            if (it.r != null) eq += ` = \\boxed{${it.r}${u}}`;
            const chk = it.ok === undefined ? "" : C.badge(it.ok, it.okTxt || "Verifica", it.failTxt || "No verifica", it.warn);
            return `<div class="mm-item"><div class="mm-head"><span class="mm-name">${it.n}</span>${chk}</div>
                <div class="mm-eq">\\[${eq}\\]</div>${it.nota ? `<div class="mm-sub">${it.nota}</div>` : ""}</div>`;
        };
        return groups.map((g) => `<div class="mm-group"><h4>${g.title}</h4>${g.items.map(item).join("")}</div>`).join("");
    };

    C.typeset = function (el) {
        if (!el) return;
        const run = () => { if (window.MathJax && window.MathJax.typesetPromise) { window.MathJax.typesetClear && window.MathJax.typesetClear([el]); window.MathJax.typesetPromise([el]).catch(() => { }); } };
        if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) window.MathJax.startup.promise.then(run);
        else setTimeout(run, 1500);
    };

    // Lista de verificaciones → tabla resumen
    C.checksHTML = function (checks) {
        const ok = checks.filter((c) => c.ok).length;
        const rows = checks.map((c) => [C.esc(c.n), c.d || "", C.badge(c.ok, c.okTxt || "Verifica", c.failTxt || "No verifica", c.warn)]);
        return `<p class="checks-sum">${ok} de ${checks.length} verificaciones cumplen.</p>` + C.table(["Verificación", "Detalle", "Estado"], rows);
    };

    // Barra de modo Manual / Automático
    C.modeBar = function (mode) {
        return `<div class="mode-bar" role="tablist">
            <button type="button" data-mode="manual" class="${mode === "manual" ? "on" : ""}">Manual <small>vos adoptás los valores</small></button>
            <button type="button" data-mode="auto" class="${mode === "auto" ? "on" : ""}">Automático <small>el algoritmo adopta</small></button>
        </div>`;
    };

    // Navegación común (menú superior). active: clave de la página actual.
    C.NAV = [
        { t: "Público", items: [["index.html", "Impulsión río · Manual"], ["auto.html", "Impulsión río · Automático"], ["potabilizadora.html", "Potabilizadora · Manual"], ["potabilizadora-auto.html", "Potabilizadora · Automático"], ["red.html", "Red de distribución (Hardy Cross)"], ["tanque.html", "Impulsión al tanque elevado"], ["cloacal.html", "Red cloacal"]] },
        { t: "Predial", items: [["predial.html", "Agua potable del edificio"]] },
        { t: "Referencias", items: [["referencias.html", "Norma 68"], ["formulas.html", "Fórmulas"]] },
    ];

    // Informe imprimible (Ctrl+P / Guardar como PDF)
    C.informeHTML = function (o) {
        const datos = o.datos && o.datos.length ? `<h3>Datos de entrada</h3>${C.table(["Parámetro", "Valor", "Unidad"], o.datos)}` : "";
        const secs = (o.secciones || []).map((s) => `<h3>${s.t}</h3>${s.html}`).join("");
        return `<div class="informe-toolbar"><button type="button" class="btn-print" onclick="window.print()">Imprimir / Guardar PDF</button>
            <span class="muted">El informe se imprime solo (sin el resto de la página).</span></div>
            <div class="informe mod-informe">
            <header class="inf-head"><div><p class="inf-eyebrow">Saneamiento y Medio Ambiente · Trabajo práctico</p>
            <h2>${o.titulo}</h2><p class="muted">${o.sub || ""}</p></div>
            <div class="inf-meta"><div>Grupo: ____________</div><div>Fecha: ${new Date().toLocaleDateString("es-AR")}</div></div></header>
            ${datos}${secs}
            <h3>Memoria de cálculo</h3><div class="memo">${C.memoHTML(o.memo)}</div>
            <h3>Verificaciones</h3>${C.checksHTML(o.checks || [])}
            ${o.notas ? `<h3>Observaciones</h3>${o.notas}` : ""}
            </div>`;
    };

    C.setupNavToggle = function () {
        const btn = C.$("nav-toggle"), links = C.$("nav-links");
        if (btn && links) btn.addEventListener("click", () => links.classList.toggle("open"));
        document.querySelectorAll(".nav-dd > a").forEach((a) => {
            a.addEventListener("click", (e) => {
                if (window.innerWidth <= 860) { e.preventDefault(); a.parentElement.classList.toggle("open"); }
            });
        });
    };

    root.MC = C;
    if (typeof module !== "undefined") module.exports = C;
})(typeof window !== "undefined" ? window : globalThis);
