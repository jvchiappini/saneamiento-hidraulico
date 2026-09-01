"use strict";

// Tabla 3 de la Norma 68: longitudes equivalentes (m) para pérdidas singulares
// Extraída de la planilla original (columnas X..AR de la hoja "Datos y Sistema de Impulsión").
// dn: diámetro nominal (mm) · ref: referencia en pulgadas
const TABLE3 = [
    { dn: 13,   ref: "1/2\"",  curva90: 0.3, valvCierre: 0.1, teeLateral: 1.0, tee2: 1.0, valvPie: 3.6, valvRet: 1.1 },
    { dn: 19,   ref: "3/4\"",  curva90: 0.4, valvCierre: 0.1, teeLateral: 1.4, tee2: 1.4, valvPie: 5.6, valvRet: 1.6 },
    { dn: 25,   ref: "1\"",    curva90: 0.5, valvCierre: 0.2, teeLateral: 1.7, tee2: 1.7, valvPie: 7.3, valvRet: 2.1 },
    { dn: 32,   ref: "1 1/4\"",curva90: 0.7, valvCierre: 0.2, teeLateral: 2.3, tee2: 2.3, valvPie: 10.0, valvRet: 2.7 },
    { dn: 38,   ref: "1 1/2\"",curva90: 0.9, valvCierre: 0.3, teeLateral: 2.8, tee2: 2.8, valvPie: 11.6, valvRet: 3.2 },
    { dn: 50,   ref: "2\"",    curva90: 1.1, valvCierre: 0.4, teeLateral: 3.5, tee2: 3.5, valvPie: 14.0, valvRet: 4.2 },
    { dn: 63,   ref: "2 1/2\"",curva90: 1.3, valvCierre: 0.4, teeLateral: 4.3, tee2: 4.3, valvPie: 17.0, valvRet: 5.2 },
    { dn: 75,   ref: "3\"",    curva90: 1.6, valvCierre: 0.5, teeLateral: 5.2, tee2: 5.2, valvPie: 20.0, valvRet: 6.3 },
    { dn: 100,  ref: "4\"",    curva90: 2.1, valvCierre: 0.7, teeLateral: 6.7, tee2: 6.7, valvPie: 23.0, valvRet: 6.4 },
    { dn: 125,  ref: "5\"",    curva90: 2.7, valvCierre: 0.9, teeLateral: 8.4, tee2: 8.4, valvPie: 30.0, valvRet: 10.4 },
    { dn: 150,  ref: "6\"",    curva90: 3.4, valvCierre: 1.1, teeLateral: 10.0, tee2: 10.0, valvPie: 39.0, valvRet: 12.5 },
    { dn: 200,  ref: "8\"",    curva90: 4.3, valvCierre: 1.4, teeLateral: 13.0, tee2: 13.0, valvPie: 52.0, valvRet: 16.0 },
    { dn: 250,  ref: "10\"",   curva90: 5.5, valvCierre: 1.7, teeLateral: 16.0, tee2: 16.0, valvPie: 65.0, valvRet: 20.0 },
    { dn: 300,  ref: "12\"",   curva90: 6.1, valvCierre: 2.2, teeLateral: 19.0, tee2: 19.0, valvPie: 78.0, valvRet: 24.0 },
    { dn: 350,  ref: "14\"",   curva90: 7.3, valvCierre: 2.4, teeLateral: 22.0, tee2: 22.0, valvPie: 90.0, valvRet: 28.0 },
    { dn: 400,  ref: "16\"",   curva90: 4.4, valvCierre: 1.1, teeLateral: 13.0, tee2: 13.0, valvPie: 52.1, valvRet: 16.1 },
    { dn: 450,  ref: "18\"",   curva90: 5.6, valvCierre: 1.3, teeLateral: 16.0, tee2: 16.0, valvPie: 65.1, valvRet: 20.1 },
    { dn: 500,  ref: "20\"",   curva90: 6.2, valvCierre: 2.6, teeLateral: 19.0, tee2: 19.0, valvPie: 78.1, valvRet: 24.1 },
    { dn: 550,  ref: "22\"",   curva90: 7.4, valvCierre: 2.8, teeLateral: 22.0, tee2: 22.0, valvPie: 90.1, valvRet: 28.1 },
];

// Tabla 6 de la Norma 68: rendimiento de bombas centrífugas
const TABLE6 = [
    { q: 2.5,  hb: 45 },
    { q: 5,    hb: 52 },
    { q: 7.5,  hb: 61 },
    { q: 10,   hb: 66 },
    { q: 15,   hb: 68 },
    { q: 20,   hb: 71 },
    { q: 25,   hb: 75 },
    { q: 30,   hb: 80 },
    { q: 40,   hb: 84 },
    { q: 50,   hb: 85 },
    { q: 100,  hb: 87 },
    { q: 200,  hb: 88 },
];

// Tabla 7 de la Norma 68: rendimiento de motores eléctricos
// hp: potencia (HP) · hm: rendimiento (%)
const TABLE7 = [
    { hp: "1/4",  hm: 61 },
    { hp: "1/2",  hm: 63 },
    { hp: "3/4",  hm: 64 },
    { hp: "1",    hm: 67 },
    { hp: "1 1/2",hm: 72 },
    { hp: "2",    hm: 73 },
    { hp: "3",    hm: 75 },
    { hp: "4",    hm: 77 },
    { hp: "5",    hm: 79 },
    { hp: "6",    hm: 81 },
    { hp: "7 1/2",hm: 82 },
    { hp: "10",   hm: 82.4 },
    { hp: "12",   hm: 83 },
    { hp: "15",   hm: 84 },
    { hp: "20",   hm: 85 },
    { hp: "30",   hm: 86 },
    { hp: "50",   hm: 87 },
    { hp: "100",  hm: 88 },
];

// Potencias comerciales de motores (Tabla 8) usadas para la potencia adoptada
const MOTOR_STD = [1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 300];

// Metadatos de las formulas (SVG en /formulas/<id>.svg) con explicacion de variables
const FORMULAS = [
    { id: "personas", name: "Total de personas de los departamentos", vars: [
        ["P_total", "Total de personas"],
        ["M", "Manzanas del barrio"],
        ["L", "Lotes / edificios por manzana"],
        ["P_t", "Pisos tipo por edificio"],
        ["D_p", "Departamentos por piso"],
        ["D_o", "Dormitorios por departamento"],
        ["P_e", "Personas por dormitorio"],
        ["S", "Personal de servicio por depto."],
    ]},
    { id: "logistica", name: "Personal de logística", vars: [
        ["P_log", "Personal de logística"],
        ["D_p", "Departamentos por piso"],
        ["P_t", "Pisos tipo por edificio"],
        ["%_log", "Porcentaje de logística por lote"],
        ["L", "Lotes / edificios por manzana"],
        ["M", "Manzanas del barrio"],
    ]},
    { id: "qm_l", name: "Caudal medio de bombeo (l/d)", vars: [
        ["Q_m", "Caudal medio de bombeo (l/d)"],
        ["P_total", "Total de personas"],
        ["q_d", "Caudal unitario departamentos (l/pers/d)"],
        ["P_log", "Personal de logística"],
        ["q_o", "Caudal unitario logística (l/pers/d)"],
    ]},
    { id: "qm_m3", name: "Caudal medio de bombeo (m³/d)", vars: [
        ["Q_m", "Caudal medio de bombeo"],
        ["1000", "Conversión litros → m³"],
    ]},
    { id: "qm_ls", name: "Caudal medio de bombeo (l/s)", vars: [
        ["Q_m", "Caudal medio de bombeo"],
        ["86400", "Segundos en un día"],
    ]},
    { id: "qlote_l", name: "Caudal por lote (l/d)", vars: [
        ["Q_lote", "Caudal por lote (l/d)"],
        ["Q_m", "Caudal medio de bombeo"],
        ["M", "Manzanas del barrio"],
        ["L", "Lotes / edificios por manzana"],
    ]},
    { id: "qlote_ls", name: "Caudal por lote (l/s)", vars: [
        ["Q_lote", "Caudal por lote"],
        ["86400", "Segundos en un día"],
    ]},
    { id: "qb_m3", name: "Caudal de bombeo (m³/s)", vars: [
        ["Q_b", "Caudal de bombeo (m³/s)"],
        ["K_1", "Coef. consumo máximo diario"],
        ["K_3", "Coef. línea de impulsión"],
        ["Q_md", "Caudal medio diario (m³/d)"],
        ["86400", "Segundos en un día"],
    ]},
    { id: "qb_ls", name: "Caudal de bombeo (l/s)", vars: [
        ["Q_b", "Caudal de bombeo (l/s)"],
        ["1000", "Conversión m³ → litros"],
    ]},
    { id: "horas", name: "Horas de operación de la bomba", vars: [
        ["H_op", "Horas de operación por día (hs)"],
        ["15, 2, 24, 60", "Valores fijos de la guía"],
    ]},
    { id: "bresse", name: "Diámetro de impulsión (Bresse)", vars: [
        ["D", "Diámetro de impulsión (m)"],
        ["Q_b", "Caudal de bombeo (m³/s)"],
        ["H_op", "Horas de operación por día"],
    ]},
    { id: "vel", name: "Velocidad en la tubería", vars: [
        ["v", "Velocidad (m/s)"],
        ["Q_b", "Caudal de bombeo (m³/s)"],
        ["d", "Diámetro interior de la tubería (m)"],
    ]},
    { id: "verif_vel", name: "Verificación de velocidad", vars: [
        ["v", "Velocidad en la tubería (m/s)"],
        ["0,7 – 4,0", "Rango admisible de diseño"],
    ]},
    { id: "j_pt", name: "Pérdida por metro (Fair Whipple–Hsiao)", vars: [
        ["J", "Pérdida de carga por metro (m/m)"],
        ["Q_b", "Caudal de bombeo (m³/s)"],
        ["d", "Diámetro interior (m)"],
        ["27,113 · 2,596 · 0,532", "Coeficientes FWH (acero galvanizado)"],
    ]},
    { id: "leq_s", name: "Longitud equivalente de succión", vars: [
        ["L_eq,s", "Longitud equivalente de succión (m)"],
        ["L_vp", "Long. equiv. válvula de pie"],
        ["L_c90", "Long. equiv. curva 90° (×2)"],
        ["L_t2", "Long. equiv. tee 2 salidas"],
        ["L_vc", "Long. equiv. válvula de cierre"],
    ]},
    { id: "leq_i", name: "Longitud equivalente de impulsión", vars: [
        ["L_eq,i", "Longitud equivalente de impulsión (m)"],
        ["L_c90", "Long. equiv. curva 90°"],
        ["L_vr", "Long. equiv. válvula de retención"],
        ["L_vc", "Long. equiv. válvula de cierre"],
        ["L_tl", "Long. equiv. tee lateral"],
    ]},
    { id: "perd_s", name: "Pérdida de carga en succión", vars: [
        ["h_p,s", "Pérdida de carga en succión (m.c.a.)"],
        ["L_s", "Longitud real de succión (m)"],
        ["L_eq,s", "Longitud equivalente de succión"],
        ["J_s", "Pérdida por metro en succión"],
    ]},
    { id: "perd_i", name: "Pérdida de carga en impulsión", vars: [
        ["h_p,i", "Pérdida de carga en impulsión (m.c.a.)"],
        ["L_i", "Longitud real de impulsión (m)"],
        ["L_eq,i", "Longitud equivalente de impulsión"],
        ["J_i", "Pérdida por metro en impulsión"],
    ]},
    { id: "hm_s", name: "Altura manométrica de succión", vars: [
        ["H_s", "Altura manométrica de succión (m.c.a.)"],
        ["h_t,s", "Altura topográfica de succión"],
        ["L_s", "Longitud real de succión"],
        ["L_eq,s", "Longitud equivalente de succión"],
        ["J_s", "Pérdida por metro en succión"],
        ["v_s", "Velocidad en succión"],
        ["g", "Gravedad (9,8 m/s²)"],
    ]},
    { id: "hm_i", name: "Altura manométrica de impulsión", vars: [
        ["H_i", "Altura manométrica de impulsión (m.c.a.)"],
        ["h_t,i", "Altura topográfica de impulsión"],
        ["L_i", "Longitud real de impulsión"],
        ["L_eq,i", "Longitud equivalente de impulsión"],
        ["J_i", "Pérdida por metro en impulsión"],
        ["v_i", "Velocidad en impulsión"],
        ["g", "Gravedad (9,8 m/s²)"],
    ]},
    { id: "hm_total", name: "Altura manométrica total", vars: [
        ["H", "Altura manométrica total (m.c.a.)"],
        ["H_s", "Altura manométrica de succión"],
        ["H_i", "Altura manométrica de impulsión"],
        ["P_res", "Presión de llegada al reservorio (0,5 m)"],
    ]},
    { id: "pb_cv", name: "Potencia de la bomba (cv)", vars: [
        ["P_b", "Potencia de la bomba (cv)"],
        ["H", "Altura manométrica total (m.c.a.)"],
        ["Q_b", "Caudal de bombeo (m³/s)"],
        ["η_bomba", "Rendimiento de la bomba (Tabla 6)"],
        ["1000", "Densidad del agua (kg/m³)"],
        ["75", "Constante de conversión a CV"],
    ]},
    { id: "p_hp", name: "Potencia al freno (HP)", vars: [
        ["P", "Potencia al freno (HP)"],
        ["P_b", "Potencia de la bomba (cv)"],
        ["1,014", "Conversión CV → HP"],
    ]},
    { id: "pmb", name: "Potencia del motor (HP)", vars: [
        ["P_mb", "Potencia del motor (HP)"],
        ["P", "Potencia al freno (HP)"],
        ["η_motor", "Rendimiento del motor (Tabla 7)"],
    ]},
    { id: "holgura", name: "Holgura según potencia", vars: [
        ["h", "Holgura por potencia"],
        ["P_mb", "Potencia del motor (HP)"],
    ]},
    { id: "phmb", name: "Potencia con holgura (HP)", vars: [
        ["P_hmb", "Potencia con holgura (HP)"],
        ["h", "Holgura"],
        ["P_mb", "Potencia del motor (HP)"],
    ]},
    { id: "cavitacion", name: "Altura por cavitación", vars: [
        ["h_cav", "Altura por cavitación (m)"],
        ["v_s", "Velocidad en succión (m/s)"],
        ["g", "Gravedad (9,8 m/s²)"],
        ["0,2", "Margen de seguridad (m)"],
    ]},
    { id: "pozo", name: "Altura mínima del agua sobre la criba", vars: [
        ["h_pozo", "Altura mínima sobre la criba (m)"],
        ["h_cav", "Altura por cavitación"],
        ["0,5", "Altura de seguridad (m)"],
    ]},
    { id: "anualidad", name: "Factor de anualidad", vars: [
        ["a(n)", "Factor de anualidad"],
        ["i", "Tasa de descuento anual"],
        ["n", "Años de vida útil"],
    ]},
    { id: "costo_tubo", name: "Costo de la tubería", vars: [
        ["I_t", "Costo de la tubería ($)"],
        ["a", "Costo base de tubería ($/m)"],
        ["b", "Costo por mm de DN ($/m·mm)"],
        ["DN", "Diámetro nominal (mm)"],
        ["L", "Longitud total de tubería (m)"],
    ]},
    { id: "energia", name: "Energía anual de bombeo", vars: [
        ["E", "Energía anual (kWh)"],
        ["P_mb", "Potencia del motor (HP)"],
        ["0,7457", "Conversión HP → kW"],
        ["H_op", "Horas de operación por día"],
        ["365", "Días por año"],
    ]},
    { id: "costo_total", name: "Costo anual total", vars: [
        ["C_anual", "Costo anual total ($/año)"],
        ["I_t", "Costo de la tubería"],
        ["a(50)", "Anualidad a 50 años (tubería)"],
        ["I_b", "Costo de la bomba"],
        ["a(7)", "Anualidad a 7 años (bomba)"],
        ["E", "Energía anual (kWh)"],
        ["c_e", "Costo de energía ($/kWh)"],
        ["M_ant", "Mantenimiento anual ($/año)"],
    ]},
];
const FORMULA_META = Object.fromEntries(FORMULAS.map((f) => [f.id, f.name]));