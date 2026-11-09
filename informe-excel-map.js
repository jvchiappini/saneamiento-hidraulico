"use strict";
/* =====================================================================
   informe-excel-map.js — Mapa de celdas y rótulos de la guía del TP.
   La búsqueda es por rótulo (columna A normalizada); las direcciones son
   el valor esperado para la guía original y sirven de validación cruzada.
   El mapa de la versión Chiappini/Britez/Rios se detecta por estructura.
   ===================================================================== */
(function (root) {
    function norm(s) {
        return String(s == null ? "" : s)
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    const ROLES = [
        { role: "fuente", test: (n) => n.includes("fuente de datos") || n === "fuente" },
        { role: "rio", test: (n) => n.includes("datos y sistema") && (n.includes("rio") || n.includes("impulsion")) },
        { role: "potab", test: (n) => n.includes("potabilizadora") },
        { role: "tanque", test: (n) => n.includes("impulsion") && n.includes("tanque") },
        { role: "datosInic", test: (n) => n.includes("datos inic") },
        { role: "caudales", test: (n) => n === "caudales" || n.includes("caudales") },
        { role: "presiones", test: (n) => n.includes("presion") },
        { role: "cloacal", test: (n) => n.includes("cloacal") },
        { role: "tratamiento", test: (n) => n.includes("tratamiento") },
        { role: "laguna", test: (n) => n.includes("laguna") },
    ];

    /* Entradas del sistema de impulsión río → planta. */
    const RIO_INPUTS = [
        { key: "manzanas", label: "seleccionar un barrio de", cell: "B3", unit: "manzanas" },
        { key: "lotes", label: "numeros de lotes edificios por manzanas", cell: "B4", unit: "lotes" },
        { key: "pisos", label: "numeros de pisos tipo", cell: "B5", unit: "pisos" },
        { key: "deptos", label: "numeros de departamentos por pisos", cell: "B6", unit: "depto" },
        { key: "dorm", label: "numeros de dormitorios por departamentos", cell: "B7", unit: "dorm" },
        { key: "persDorm", label: "numeros de personas por dormitorios", cell: "B8", unit: "pers" },
        { key: "persServ", label: "numeros de personal de servicio por departamento", cell: "B9", unit: "pers" },
        { key: "pctLog", label: "porcentaje de personal de logistica por lote", cell: "B10", unit: "%" },
        { key: "qDept", label: "caudal unitario por persona por departamento", cell: "B13", unit: "l/pers/d" },
        { key: "qLog", label: "caudal unitario por trabajadores de logisticas", cell: "B14", unit: "l/pers/d" },
        { key: "k1", label: "k1", cell: "B20", unit: "—" },
        { key: "k2", label: "k2", cell: "B21", unit: "—" },
        { key: "k3", label: "k3", cell: "B22", unit: "—" },
        { key: "horas", label: "numero de horas de operacion de la bomba por dia", cell: "B24", unit: "hs" },
    ];

    const RIO_RESULTS = [
        { key: "poblacion", label: "total de personas de los departamentos", cell: "B11", unit: "pers" },
        { key: "logistica", label: "personales de logistica", cell: "B12", unit: "funcionarios" },
        { key: "qm_ls", label: null, cell: "B17", unit: "l/s" },
        { key: "qm_m3d", label: null, cell: "B16", unit: "m³/d" },
        { key: "qm_ld", label: null, cell: "B15", unit: "l/d" },
        { key: "qa_lote", label: "caudal por lotes edificios", cell: "B18", unit: "l/d/lote" },
        { key: "qb_m3s", label: "caudal de bombeo", cell: "B23", unit: "m³/s" },
        { key: "qb_ls", label: null, cell: "D23", unit: "l/s" },
        { key: "bresse", label: "diametro impulsion formula de bresse", cell: "B26", unit: "m" },
    ];

    const RIO_ALTS = [
        { key: "dS", labels: ["succion"], cell: 28, unit: "mm" },
        { key: "dI", labels: ["impulsion"], cell: 29, unit: "mm" },
        { key: "vS", labels: ["velocidad de succion"], cell: 32, unit: "m/s" },
        { key: "vI", labels: ["velocidad de impulsion"], cell: 33, unit: "m/s" },
        { key: "JS", labels: ["j succion"], cell: 36, unit: "m/m" },
        { key: "JI", labels: ["j impulsion"], cell: 37, unit: "m/m" },
        { key: "leqS", labels: ["succion"], cell: 40, unit: "m" },
        { key: "leqI", labels: ["impulsion"], cell: 41, unit: "m" },
        { key: "LS", labels: ["succion"], cell: 44, unit: "m" },
        { key: "LI", labels: ["impulsion"], cell: 45, unit: "m" },
        { key: "hS", labels: ["succion"], cell: 48, unit: "m" },
        { key: "hI", labels: ["impulsion"], cell: 49, unit: "m" },
        { key: "hvS", labels: ["succion"], cell: 52, unit: "m" },
        { key: "hvI", labels: ["impulsion"], cell: 53, unit: "m" },
        { key: "pRes", labels: ["presion de llegada al reservorio"], cell: 55, unit: "m" },
        { key: "HmS", labels: ["succion"], cell: 58, unit: "m.c.a." },
        { key: "HmI", labels: ["impulsion"], cell: 59, unit: "m.c.a." },
        { key: "Hm", labels: ["total"], cell: 60, unit: "m.c.a." },
        { key: "Pb", labels: ["pb"], cell: 64, unit: "CV" },
        { key: "HP", labels: [null], cell: 65, unit: "HP" },
        { key: "Pmb", labels: ["pmb"], cell: 66, unit: "HP" },
        { key: "holgura", labels: ["holgura"], cell: 67, unit: "%" },
        { key: "Phmb", labels: ["phmb"], cell: 68, unit: "HP" },
    ];

    const TANQUE_INPUTS = [
        { key: "qMed", label: "caudal medio", cell: "B2", unit: "m³/d" },
        { key: "cotaBomba", label: "cota de la base de la motobomba", cell: "B3", unit: "msnm" },
        { key: "cotaTanque", label: "cota de la base de la base del tanque elevado", cell: "B4", unit: "msnm" },
        { key: "k1", label: "k1", cell: "B6", unit: "—" },
        { key: "qb_m3s", label: "caudal de bombeo", cell: "B7", unit: "m³/s" },
        { key: "qb_ls", label: null, cell: "D7", unit: "l/s" },
        { key: "horas", label: "numero de horas de operacion de la bomba por dia", cell: "B8", unit: "hs" },
        { key: "bresse", label: "diametro impulsion formula de bresse", cell: "B10", unit: "m" },
    ];

    const TANQUE_ALTS = [
        { key: "dS", labels: ["succion"], cell: 12, unit: "mm" },
        { key: "dI", labels: ["impulsion"], cell: 13, unit: "mm" },
        { key: "vS", labels: ["velocidad de succion"], cell: 16, unit: "m/s" },
        { key: "vI", labels: ["velocidad de impulsion"], cell: 17, unit: "m/s" },
        { key: "JS", labels: ["j succion"], cell: 20, unit: "m/m" },
        { key: "JI", labels: ["j impulsion"], cell: 21, unit: "m/m" },
        { key: "leqS", labels: ["succion"], cell: 24, unit: "m" },
        { key: "leqI", labels: ["impulsion"], cell: 25, unit: "m" },
        { key: "LS", labels: ["succion"], cell: 28, unit: "m" },
        { key: "LI", labels: ["impulsion"], cell: 29, unit: "m" },
        { key: "hS", labels: ["succion"], cell: 32, unit: "m" },
        { key: "hI", labels: ["impulsion"], cell: 33, unit: "m" },
        { key: "hvS", labels: ["succion"], cell: 36, unit: "m" },
        { key: "hvI", labels: ["impulsion"], cell: 37, unit: "m/s" },
        { key: "pRes", labels: ["presion de llegada al reservorio"], cell: 39, unit: "m" },
        { key: "HmS", labels: ["succion"], cell: 42, unit: "m.c.a." },
        { key: "HmI", labels: ["impulsion"], cell: 43, unit: "m.c.a." },
        { key: "Hm", labels: ["total"], cell: 44, unit: "m.c.a." },
        { key: "Pb", labels: ["pb"], cell: 48, unit: "CV" },
        { key: "HP", labels: [null], cell: 49, unit: "HP" },
        { key: "Pmb", labels: ["pmb"], cell: 50, unit: "HP" },
        { key: "holgura", labels: ["holgura"], cell: 51, unit: "%" },
        { key: "Phmb", labels: ["phmb"], cell: 52, unit: "HP" },
    ];

    /* Valores de la guía original, para detectar qué cambió cada grupo. */
    const GUIDE_DEFAULTS = {
        rio: { manzanas: 12, lotes: 6, pisos: 22, deptos: 6, dorm: 3, persDorm: 2, persServ: 1, pctLog: 10, qDept: 200, qLog: 50, k1: 1.2, k2: 1.5, k3: 1.05, horas: 12, dS: [550, 500, 350], dI: [500, 450, 300], LS: [2, 2, 2], LI: [669.35, 669.35, 669.35], hS: [2, 2, 2], hI: [9, 9, 9], pRes: 0.5 },
        tanque: { qMed: 13353.12, cotaBomba: 97, cotaTanque: 97, k1: 1.2, horas: 12, dS: [550, 500, 350], dI: [500, 450, 300], pRes: 1 },
    };

    /* Mapa de la potabilizadora: variable del estado SP ← celda y rótulo. */
    const POTAB_SP = [
        { key: "caudalDiario", label: "caudal diario", cell: "B2" },
        { key: "k1", label: "k1", cell: "B4" },
        { key: "k2", label: "k2", cell: "B5" },
        { key: "k3", label: "k3", cell: "B6" },
        { key: "vAsc", label: "velocidad ascencional", cell: "B10" },
        { key: "tAq", label: "tiempo de aquietamiento", cell: "B14" },
        { key: "parshallW", label: "ancho de la garganta", cell: "B25" },
        { key: "parshallN", label: "altura del escalon del resalto", cell: "B27" },
        { key: "parshallK", label: "diferencia entre el piso de llegada y salida", cell: "B28" },
        { key: "parshallA", label: "a =", cell: "B33" },
        { key: "cd", label: "cd", cell: "B41" },
        { key: "phi", label: "phi", cell: "B42" },
        { key: "hadoptado", label: "hadoptado para el triangulo", cell: "B47" },
        { key: "b2hmaxAdopt", label: "2hmax adoptado", cell: "B49" },
        { key: "kPaletas", label: "factor de forma de las paletas", cell: "B70" },
        { key: "rpm", label: "revoluciones por segundo", cell_scale: 60, cell: "B71" },
        { key: "tCanal", label: "tiempo de retencion", cell: "B81" },
        { key: "mzTiempo", label: "tiempo de retencion 1 a 3 min", cell: "B88" },
        { key: "mzVolAdopt", label: "volumen adoptado", cell: "B91" },
        { key: "mzAltura", label: "altura del tanque", cell: "B92" },
        { key: "mzEfic", label: "eficiencia del motor y compresor", cell: "B94" },
        { key: "mzCoef", label: "coeficiente de seguridad", cell: "B95" },
        { key: "mzPadop", label: "potencia del mezclador adoptado", cell: "B97" },
        { key: "flocTemp", label: "temperatura =", cell: "B103" },
        { key: "flocProf", label: "profundidad: h", cell: "B106" },
        { key: "flocV1", label: "velocidad en los canales", cell: "B107" },
        { key: "flocV2", label: "velocidad en los pasos o vueltas", cell: "B108" },
        { key: "flocBAdopt", label: "separacion de los canales adoptado", cell: "B110" },
        { key: "flocX", label: "lados x", cell: "B116" },
        { key: "flocE", label: "grosor de los bafles", cell: "B119" },
        { key: "flocK", label: "constante coeficiente de perdida", cell: "B124" },
        { key: "flocN", label: "coeficiente de carga de manning", cell: "B129" },
        { key: "sedTr", label: "periodo de retencion", cell: "B134" },
        { key: "sedCsup", label: "carga superficial", cell: "B139" },
        { key: "sedLb", label: "relacion largo ancho", cell: "B145" },
        { key: "sedNfAdopt", label: "numero de filtros adoptado", cell: "B148" },
        { key: "sedBaf", label: "ancho del canal", cell: "B155" },
        { key: "sedNComp", label: "numero de compuertas", cell: "B158" },
        { key: "sedSepPct", label: "separacion de la pared", cell: "B160" },
        { key: "sedSepFondo", label: "separacion del fondo", cell: "B161" },
        { key: "sedVorif", label: "velocidad en los orificios", cell: "B164" },
        { key: "sedDorif", label: "diametro de los orificios", cell: "B165" },
        { key: "sedTasaAdopt", label: "tasa adoptada", cell: "B171" },
        { key: "sedGrosor", label: "grosor de la lamina", cell: "B174" },
        { key: "sedVCan", label: "velocidad en la canaleta", cell: "B178" },
        { key: "sedCd", label: "coeficiente de descarga", cell: "B183" },
        { key: "sedTVaciado", label: "tiempo de vaciado", cell: "B184" },
        { key: "filTasa", label: "tasa de filtracion", cell: "B188" },
        { key: "filExp", label: "expansion", cell: "B191" },
        { key: "filArena", label: "altura de la arena", cell: "B192" },
        { key: "filVasc", label: "velocidad ascensional", cell: "B193" },
        { key: "filNCan", label: "numero de canaletas", cell: "B195" },
        { key: "filACan", label: "ancho de la canaleta", cell: "B196" },
        { key: "filSepBorde", label: "separacion al borde", cell: "B198" },
        { key: "filTLavado", label: "tiempo de lavado", cell: "B201" },
        { key: "filHoras", label: "horas de operacion", cell: "B203" },
        { key: "filFseg", label: "factor de seguridad", cell: "B204" },
        { key: "filFrec", label: "frecuencia de lavado", cell: "B205" },
        { key: "filTLlenado", label: "tiempo de llenado", cell: "B206" },
        { key: "filPadop", label: "potencia adoptada", cell: "B208" },
        { key: "clTContacto", label: "tiempo de contacto", cell: "B211" },
        { key: "clDosis", label: "dosis", cell: "B216" },
        { key: "clTanque", label: "capacidad del tanque", cell: "B221" },
        { key: "resProf", label: "profundidad del reservorio", cell: "B268" },
    ];

    const POTAB_GROUPS = [
        { id: "captacion", title: "Captación y cámara de aquietamiento", words: ["caudal diario", "caudal de captacion", "k1", "k2", "k3", "qcap", "aquietamiento", "area de la seccion", "lados del aquietador", "tiempo de aquietamiento", "profundidad de la camara"] },
        { id: "parshall", title: "Canal aforador Parshall y vertedero en V", words: ["parshall", "garganta", "altura del agua", "escalon del resalto", "vertedero", "resalto", "gradiente", "mezclador rapido", "canal de estabilizacion"] },
        { id: "floculacion", title: "Floculador / mezclador lento", words: ["floculador", "mezclador lento", "temperatura", "viscosidad", "periodo de retencion", "velocidad en los canales", "separacion de los canales", "bafles", "perdida de carga", "radio hidraulico", "manning"] },
        { id: "sedimentacion", title: "Sedimentador de escurrimiento horizontal", words: ["sedimentador", "carga superficial", "relacion largo ancho", "numero de filtros", "canaleta de agua floculada", "dispositivo de entrada", "dispositivo de salida", "drenaje", "lamina"] },
        { id: "filtracion", title: "Filtración rápida", words: ["filtracion", "filtro", "tasa de filtracion", "expansion", "arena", "canaletas", "lavado", "bomba de lavado"] },
        { id: "cloracion", title: "Cloración y reservorio", words: ["cloracion", "cloro", "dosis", "tiempo de contacto", "hipoclorito", "reservorio", "reserva"] },
    ];

    root.IEMap = {
        norm, ROLES, RIO_INPUTS, RIO_RESULTS, RIO_ALTS, TANQUE_INPUTS, TANQUE_ALTS,
        GUIDE_DEFAULTS, POTAB_SP, POTAB_GROUPS,
    };
    if (typeof module !== "undefined" && module.exports) module.exports = root.IEMap;
})(typeof window !== "undefined" ? window : globalThis);
