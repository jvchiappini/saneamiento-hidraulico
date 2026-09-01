"use strict";

// Tabla 1 de la Norma 68: caudales unitarios
// tipo: tipo de inmueble · consumo: valor · unidad: unidad del consumo
const TABLE1 = [
    { tipo: "Alojamiento provisorio", consumo: 80, unidad: "por persona" },
    { tipo: "Casas populares o rurales", consumo: 120, unidad: "por persona" },
    { tipo: "Residencias", consumo: 250, unidad: "por persona" },
    { tipo: "Departamentos", consumo: 200, unidad: "por persona" },
    { tipo: "Hoteles (sin cocina y sin lavandería)", consumo: 150, unidad: "por huésped" },
    { tipo: "Hospitales", consumo: 350, unidad: "por cama" },
    { tipo: "Escuelas internados", consumo: 150, unidad: "por persona" },
    { tipo: "Escuelas externas", consumo: 50, unidad: "por persona" },
    { tipo: "Cuarteles", consumo: 150, unidad: "por persona" },
    { tipo: "Edificios públicos o comerciales", consumo: 50, unidad: "por persona" },
    { tipo: "Escritorios", consumo: 50, unidad: "por persona" },
    { tipo: "Cines y teatros", consumo: 2, unidad: "por butaca" },
    { tipo: "Restaurantes y similares", consumo: 25, unidad: "por comida servida" },
    { tipo: "Garages", consumo: 50, unidad: "por automóvil" },
    { tipo: "Lavandería", consumo: 30, unidad: "por kg de ropa seca" },
    { tipo: "Mercados", consumo: 5, unidad: "por metro cuadrado" },
    { tipo: "Mataderos (animales de gran porte)", consumo: 300, unidad: "por cabeza abatida" },
    { tipo: "Mataderos (animales de pequeño porte)", consumo: 150, unidad: "por cabeza abatida" },
    { tipo: "Fábricas en general (uso personal)", consumo: 70, unidad: "por operario" },
    { tipo: "Estaciones de servicio para automóviles", consumo: 150, unidad: "por vehículo servido" },
    { tipo: "Caballerizas", consumo: 100, unidad: "por caballo" },
    { tipo: "Jardines", consumo: 1.5, unidad: "por metro cuadrado" },
];

// Tabla 3 de la Norma 68: longitudes equivalentes (m) para pérdidas singulares
// Extraída de la planilla original (columnas X..AR de la hoja "Datos y Sistema de Impulsión").
// dn: diámetro nominal (mm) · ref: referencia en pulgadas
const TABLE3 = [
    { dn: 13, ref: "1/2\"", curva90: null, img2: null, img3: null, img4: null, img5: null, img6: null, img7: null, img8: null, img9: null, valvCierre: null, valvCierre_11: null, img12: null, img13: null, teeLateral: null, tee2: null, valvPie: null, img17: null, valvRet: null, valvRet_19: null },
    { dn: 19, ref: "3/4\"", curva90: 0.4, img2: 0.6, img3: 0.7, img4: 0.3, img5: 0.3, img6: 0.4, img7: 0.2, img8: 0.2, img9: 0.5, valvCierre: 0.1, valvCierre_11: 6.7, img12: 3.6, img13: 0.4, teeLateral: 1.4, tee2: 1.4, valvPie: 5.6, img17: 0.5, valvRet: 1.6, valvRet_19: 2.4 },
    { dn: 25, ref: "1\"", curva90: 0.5, img2: 0.7, img3: 0.8, img4: 0.4, img5: 0.3, img6: 0.5, img7: 0.2, img8: 0.3, img9: 0.7, valvCierre: 0.2, valvCierre_11: 8.2, img12: 4.6, img13: 0.5, teeLateral: 1.7, tee2: 1.7, valvPie: 7.3, img17: 0.7, valvRet: 2.1, valvRet_19: 3.2 },
    { dn: 32, ref: "1 1/4\"", curva90: 0.7, img2: 0.9, img3: 1.1, img4: 0.5, img5: 0.4, img6: 0.6, img7: 0.3, img8: 0.4, img9: 0.9, valvCierre: 0.2, valvCierre_11: 11.3, img12: 5.6, img13: 0.7, teeLateral: 2.3, tee2: 2.3, valvPie: 10.0, img17: 0.9, valvRet: 2.7, valvRet_19: 4.0 },
    { dn: 38, ref: "1 1/2\"", curva90: 0.9, img2: 1.1, img3: 1.3, img4: 0.6, img5: 0.5, img6: 0.7, img7: 0.3, img8: 0.5, img9: 1.0, valvCierre: 0.3, valvCierre_11: 13.4, img12: 6.7, img13: 0.9, teeLateral: 2.8, tee2: 2.8, valvPie: 11.6, img17: 1.0, valvRet: 3.2, valvRet_19: 4.8 },
    { dn: 50, ref: "2\"", curva90: 1.1, img2: 1.4, img3: 1.7, img4: 0.8, img5: 0.6, img6: 0.9, img7: 0.4, img8: 0.7, img9: 1.5, valvCierre: 0.4, valvCierre_11: 17.4, img12: 8.5, img13: 1.1, teeLateral: 3.5, tee2: 3.5, valvPie: 14.0, img17: 1.5, valvRet: 4.2, valvRet_19: 6.4 },
    { dn: 63, ref: "2 1/2\"", curva90: 1.3, img2: 1.7, img3: 2.0, img4: 0.9, img5: 0.8, img6: 1.0, img7: 0.5, img8: 0.9, img9: 1.9, valvCierre: 0.4, valvCierre_11: 21.0, img12: 10.0, img13: 1.3, teeLateral: 4.3, tee2: 4.3, valvPie: 17.0, img17: 1.9, valvRet: 5.2, valvRet_19: 8.1 },
    { dn: 75, ref: "3\"", curva90: 1.6, img2: 2.1, img3: 2.5, img4: 1.2, img5: 1.0, img6: 1.3, img7: 0.6, img8: 1.1, img9: 2.2, valvCierre: 0.5, valvCierre_11: 26.0, img12: 13.0, img13: 1.6, teeLateral: 5.2, tee2: 5.2, valvPie: 20.0, img17: 2.2, valvRet: 6.3, valvRet_19: 9.7 },
    { dn: 100, ref: "4\"", curva90: 2.1, img2: 2.8, img3: 3.4, img4: 1.5, img5: 1.3, img6: 1.6, img7: 0.7, img8: 1.6, img9: 3.2, valvCierre: 0.7, valvCierre_11: 34.0, img12: 17.0, img13: 2.1, teeLateral: 6.7, tee2: 6.7, valvPie: 23.0, img17: 3.2, valvRet: 6.4, valvRet_19: 12.9 },
    { dn: 125, ref: "5\"", curva90: 2.7, img2: 3.7, img3: 4.2, img4: 1.9, img5: 1.6, img6: 2.1, img7: 0.9, img8: 2.0, img9: 4.0, valvCierre: 0.9, valvCierre_11: 43.0, img12: 21.0, img13: 2.7, teeLateral: 8.4, tee2: 8.4, valvPie: 30.0, img17: 4.0, valvRet: 10.4, valvRet_19: 16.1 },
    { dn: 150, ref: "6\"", curva90: 3.4, img2: 4.3, img3: 4.9, img4: 2.3, img5: 1.9, img6: 2.5, img7: 1.1, img8: 2.5, img9: 5.0, valvCierre: 1.1, valvCierre_11: 51.0, img12: 26.0, img13: 3.4, teeLateral: 10.0, tee2: 10.0, valvPie: 39.0, img17: 5.0, valvRet: 12.5, valvRet_19: 19.3 },
    { dn: 200, ref: "8\"", curva90: 4.3, img2: 5.5, img3: 6.4, img4: 3.0, img5: 2.4, img6: 3.3, img7: 1.5, img8: 3.5, img9: 6.0, valvCierre: 1.4, valvCierre_11: 67.0, img12: 34.0, img13: 4.3, teeLateral: 13.0, tee2: 13.0, valvPie: 52.0, img17: 6.0, valvRet: 16.0, valvRet_19: 25.0 },
    { dn: 250, ref: "10\"", curva90: 5.5, img2: 6.7, img3: 7.9, img4: 3.8, img5: 3.0, img6: 4.1, img7: 1.8, img8: 4.5, img9: 7.5, valvCierre: 1.7, valvCierre_11: 85.0, img12: 43.0, img13: 5.5, teeLateral: 16.0, tee2: 16.0, valvPie: 65.0, img17: 7.5, valvRet: 20.0, valvRet_19: 32.0 },
    { dn: 300, ref: "11\"", curva90: 6.1, img2: 7.9, img3: 9.5, img4: 4.6, img5: 3.6, img6: 4.8, img7: 2.2, img8: 5.5, img9: 9.0, valvCierre: 2.2, valvCierre_11: 102.0, img12: 51.0, img13: 6.1, teeLateral: 19.0, tee2: 19.0, valvPie: 78.0, img17: 9.0, valvRet: 24.0, valvRet_19: 38.0 },
    { dn: 350, ref: "12\"", curva90: 7.3, img2: 9.5, img3: 10.5, img4: 5.3, img5: 4.4, img6: 5.4, img7: 2.5, img8: 6.2, img9: 11.0, valvCierre: 2.4, valvCierre_11: 120.0, img12: 60.0, img13: 7.3, teeLateral: 22.0, tee2: 22.0, valvPie: 90.0, img17: 11.0, valvRet: 28.0, valvRet_19: 45.0 },
    { dn: 400, ref: "13.5\"", curva90: 4.4, img2: 5.6, img3: 6.5, img4: 3.16, img5: 2.5, img6: 3.4, img7: 1.11, img8: 3.6, img9: 6.1, valvCierre: 1.1, valvCierre_11: 67.1, img12: 34.1, img13: 4.4, teeLateral: 13.0, tee2: 13.0, valvPie: 52.1, img17: 6.1, valvRet: 16.1, valvRet_19: 25.1 },
    { dn: 450, ref: "14.8\"", curva90: 5.6, img2: 6.8, img3: 7.1, img4: 3.24, img5: 3.12, img6: 4.15, img7: 1.14, img8: 4.6, img9: 7.6, valvCierre: 1.13, valvCierre_11: 85.1, img12: 43.1, img13: 5.6, teeLateral: 16.0, tee2: 16.0, valvPie: 65.1, img17: 7.6, valvRet: 20.1, valvRet_19: 32.1 },
    { dn: 500, ref: "16.1\"", curva90: 6.2, img2: 7.1, img3: 9.6, img4: 4.7, img5: 3.18, img6: 4.22, img7: 2.8, img8: 5.6, img9: 9.1, valvCierre: 2.6, valvCierre_11: 102.1, img12: 51.1, img13: 6.2, teeLateral: 19.0, tee2: 19.0, valvPie: 78.1, img17: 9.1, valvRet: 24.1, valvRet_19: 38.1 },
    { dn: 550, ref: "17.4\"", curva90: 7.4, img2: 9.6, img3: 10.6, img4: 5.4, img5: 4.5, img6: 5.5, img7: 2.11, img8: 6.3, img9: 11.1, valvCierre: 2.8, valvCierre_11: 120.1, img12: 60.1, img13: 7.4, teeLateral: 22.0, tee2: 22.0, valvPie: 90.1, img17: 11.1, valvRet: 28.1, valvRet_19: 45.1 },
];

// Tabla 6 de la Norma 68: rendimiento de bombas centrífugas
const TABLE6 = [
    { q: 2.5, hb: 45 },
    { q: 5, hb: 52 },
    { q: 7.5, hb: 61 },
    { q: 10, hb: 66 },
    { q: 15, hb: 68 },
    { q: 20, hb: 71 },
    { q: 25, hb: 75 },
    { q: 30, hb: 80 },
    { q: 40, hb: 84 },
    { q: 50, hb: 85 },
    { q: 100, hb: 87 },
    { q: 200, hb: 88 },
];

// Tabla 7 de la Norma 68: rendimiento de motores eléctricos
// hp: potencia (HP) · hm: rendimiento (%)
const TABLE7 = [
    { hp: "1/4", hm: 61 },
    { hp: "1/2", hm: 63 },
    { hp: "3/4", hm: 64 },
    { hp: "1", hm: 67 },
    { hp: "1 1/2", hm: 72 },
    { hp: "2", hm: 73 },
    { hp: "3", hm: 75 },
    { hp: "4", hm: 77 },
    { hp: "5", hm: 79 },
    { hp: "6", hm: 81 },
    { hp: "7 1/2", hm: 82 },
    { hp: "10", hm: 82.4 },
    { hp: "12", hm: 83 },
    { hp: "15", hm: 84 },
    { hp: "20", hm: 85 },
    { hp: "30", hm: 86 },
    { hp: "50", hm: 87 },
    { hp: "100", hm: 88 },
];

// Potencias comerciales de motores (Tabla 8) usadas para la potencia adoptada
const MOTOR_STD = [1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 300];

// Costo de tubería por diámetro nominal ($/m) — editable en la web
// Valores de referencia por DN, modificables en la sección de alternativas.
const PIPE_COST_DEFAULT = {
    100: 35, 125: 45, 150: 55, 200: 75, 250: 95, 300: 115,
    350: 140, 400: 165, 450: 190, 500: 220, 550: 250,
};

// Costo de motores por potencia ($) — editable en la web
// Valores de referencia por HP, modificables en la sección de alternativas.
const MOTOR_COST_DEFAULT = {
    1: 500, 1.5: 600, 2: 700, 3: 850, 5: 1200, 7.5: 1600, 10: 2000,
    15: 2800, 20: 3500, 25: 4200, 30: 4900, 40: 6200, 50: 7500,
    60: 8700, 75: 10500, 100: 13500, 125: 16500, 150: 19500,
    200: 25000, 300: 36000,
};

// Metadatos de las formulas (SVG en /formulas/<id>.svg) con explicacion de variables
const FORMULAS = [
    {
        id: "personas", name: "Total de personas de los departamentos", vars: [
            ["P_total", "Total de personas"],
            ["M", "Manzanas del barrio"],
            ["L", "Lotes / edificios por manzana"],
            ["P_t", "Pisos tipo por edificio"],
            ["D_p", "Departamentos por piso"],
            ["D_o", "Dormitorios por departamento"],
            ["P_e", "Personas por dormitorio"],
            ["S", "Personal de servicio por depto."],
        ]
    },
    {
        id: "logistica", name: "Personal de logística", vars: [
            ["P_log", "Personal de logística"],
            ["D_p", "Departamentos por piso"],
            ["P_t", "Pisos tipo por edificio"],
            ["%_log", "Porcentaje de logística por lote"],
            ["L", "Lotes / edificios por manzana"],
            ["M", "Manzanas del barrio"],
        ]
    },
    {
        id: "qm_l", name: "Caudal medio de bombeo (l/d)", vars: [
            ["Q_m", "Caudal medio de bombeo (l/d)"],
            ["P_total", "Total de personas"],
            ["q_d", "Caudal unitario departamentos (l/pers/d)"],
            ["P_log", "Personal de logística"],
            ["q_o", "Caudal unitario logística (l/pers/d)"],
        ]
    },
    {
        id: "qm_m3", name: "Caudal medio de bombeo (m³/d)", vars: [
            ["Q_m", "Caudal medio de bombeo"],
            ["1000", "Conversión litros → m³"],
        ]
    },
    {
        id: "qm_ls", name: "Caudal medio de bombeo (l/s)", vars: [
            ["Q_m", "Caudal medio de bombeo"],
            ["86400", "Segundos en un día"],
        ]
    },
    {
        id: "qlote_l", name: "Caudal por lote (l/d)", vars: [
            ["Q_lote", "Caudal por lote (l/d)"],
            ["Q_m", "Caudal medio de bombeo"],
            ["M", "Manzanas del barrio"],
            ["L", "Lotes / edificios por manzana"],
        ]
    },
    {
        id: "qlote_ls", name: "Caudal por lote (l/s)", vars: [
            ["Q_lote", "Caudal por lote"],
            ["86400", "Segundos en un día"],
        ]
    },
    {
        id: "qb_m3", name: "Caudal de bombeo (m³/s)", vars: [
            ["Q_b", "Caudal de bombeo (m³/s)"],
            ["K_1", "Coef. consumo máximo diario"],
            ["K_3", "Coef. línea de impulsión"],
            ["Q_md", "Caudal medio diario (m³/d)"],
            ["86400", "Segundos en un día"],
        ]
    },
    {
        id: "qb_ls", name: "Caudal de bombeo (l/s)", vars: [
            ["Q_b", "Caudal de bombeo (l/s)"],
            ["1000", "Conversión m³ → litros"],
        ]
    },
    {
        id: "horas", name: "Horas de operación de la bomba", vars: [
            ["H_op", "Horas de operación por día (hs)"],
            ["15, 2, 24, 60", "Valores fijos de la guía"],
        ]
    },
    {
        id: "bresse", name: "Diámetro de impulsión (Bresse)", vars: [
            ["D", "Diámetro de impulsión (m)"],
            ["Q_b", "Caudal de bombeo (m³/s)"],
            ["H_op", "Horas de operación por día"],
        ]
    },
    {
        id: "vel", name: "Velocidad en la tubería", vars: [
            ["v", "Velocidad (m/s)"],
            ["Q_b", "Caudal de bombeo (m³/s)"],
            ["d", "Diámetro interior de la tubería (m)"],
        ]
    },
    {
        id: "verif_vel", name: "Verificación de velocidad", vars: [
            ["v", "Velocidad en la tubería (m/s)"],
            ["0,7 – 4,0", "Rango admisible de diseño"],
        ]
    },
    {
        id: "j_pt", name: "Pérdida por metro (Fair Whipple–Hsiao)", vars: [
            ["J", "Pérdida de carga por metro (m/m)"],
            ["Q_b", "Caudal de bombeo (m³/s)"],
            ["d", "Diámetro interior (m)"],
            ["27,113 · 2,596 · 0,532", "Coeficientes FWH (acero galvanizado)"],
        ]
    },
    {
        id: "leq_s", name: "Longitud equivalente de succión", vars: [
            ["L_eq,s", "Longitud equivalente de succión (m)"],
            ["L_vp", "Long. equiv. válvula de pie"],
            ["L_c90", "Long. equiv. curva 90° (×2)"],
            ["L_t2", "Long. equiv. tee 2 salidas"],
            ["L_vc", "Long. equiv. válvula de cierre"],
        ]
    },
    {
        id: "leq_i", name: "Longitud equivalente de impulsión", vars: [
            ["L_eq,i", "Longitud equivalente de impulsión (m)"],
            ["L_c90", "Long. equiv. curva 90°"],
            ["L_vr", "Long. equiv. válvula de retención"],
            ["L_vc", "Long. equiv. válvula de cierre"],
            ["L_tl", "Long. equiv. tee lateral"],
        ]
    },
    {
        id: "perd_s", name: "Pérdida de carga en succión", vars: [
            ["h_p,s", "Pérdida de carga en succión (m.c.a.)"],
            ["L_s", "Longitud real de succión (m)"],
            ["L_eq,s", "Longitud equivalente de succión"],
            ["J_s", "Pérdida por metro en succión"],
        ]
    },
    {
        id: "perd_i", name: "Pérdida de carga en impulsión", vars: [
            ["h_p,i", "Pérdida de carga en impulsión (m.c.a.)"],
            ["L_i", "Longitud real de impulsión (m)"],
            ["L_eq,i", "Longitud equivalente de impulsión"],
            ["J_i", "Pérdida por metro en impulsión"],
        ]
    },
    {
        id: "hm_s", name: "Altura manométrica de succión", vars: [
            ["H_s", "Altura manométrica de succión (m.c.a.)"],
            ["h_t,s", "Altura topográfica de succión"],
            ["L_s", "Longitud real de succión"],
            ["L_eq,s", "Longitud equivalente de succión"],
            ["J_s", "Pérdida por metro en succión"],
            ["v_s", "Velocidad en succión"],
            ["g", "Gravedad (9,8 m/s²)"],
        ]
    },
    {
        id: "hm_i", name: "Altura manométrica de impulsión", vars: [
            ["H_i", "Altura manométrica de impulsión (m.c.a.)"],
            ["h_t,i", "Altura topográfica de impulsión"],
            ["L_i", "Longitud real de impulsión"],
            ["L_eq,i", "Longitud equivalente de impulsión"],
            ["J_i", "Pérdida por metro en impulsión"],
            ["v_i", "Velocidad en impulsión"],
            ["g", "Gravedad (9,8 m/s²)"],
        ]
    },
    {
        id: "hm_total", name: "Altura manométrica total", vars: [
            ["H", "Altura manométrica total (m.c.a.)"],
            ["H_s", "Altura manométrica de succión"],
            ["H_i", "Altura manométrica de impulsión"],
            ["P_res", "Presión de llegada al reservorio (0,5 m)"],
        ]
    },
    {
        id: "pb_cv", name: "Potencia de la bomba (cv)", vars: [
            ["P_b", "Potencia de la bomba (cv)"],
            ["H", "Altura manométrica total (m.c.a.)"],
            ["Q_b", "Caudal de bombeo (m³/s)"],
            ["η_bomba", "Rendimiento de la bomba (Tabla 6)"],
            ["1000", "Densidad del agua (kg/m³)"],
            ["75", "Constante de conversión a CV"],
        ]
    },
    {
        id: "p_hp", name: "Potencia al freno (HP)", vars: [
            ["P", "Potencia al freno (HP)"],
            ["P_b", "Potencia de la bomba (cv)"],
            ["1,014", "Conversión CV → HP"],
        ]
    },
    {
        id: "pmb", name: "Potencia del motor (HP)", vars: [
            ["P_mb", "Potencia del motor (HP)"],
            ["P", "Potencia al freno (HP)"],
            ["η_motor", "Rendimiento del motor (Tabla 7)"],
        ]
    },
    {
        id: "holgura", name: "Holgura según potencia", vars: [
            ["h", "Holgura por potencia"],
            ["P_mb", "Potencia del motor (HP)"],
        ]
    },
    {
        id: "phmb", name: "Potencia con holgura (HP)", vars: [
            ["P_hmb", "Potencia con holgura (HP)"],
            ["h", "Holgura"],
            ["P_mb", "Potencia del motor (HP)"],
        ]
    },
    {
        id: "cavitacion", name: "Altura por cavitación", vars: [
            ["h_cav", "Altura por cavitación (m)"],
            ["v_s", "Velocidad en succión (m/s)"],
            ["g", "Gravedad (9,8 m/s²)"],
            ["0,2", "Margen de seguridad (m)"],
        ]
    },
    {
        id: "pozo", name: "Altura mínima del agua sobre la criba", vars: [
            ["h_pozo", "Altura mínima sobre la criba (m)"],
            ["h_cav", "Altura por cavitación"],
            ["0,5", "Altura de seguridad (m)"],
        ]
    },
    {
        id: "anualidad", name: "Factor de anualidad", vars: [
            ["a(n)", "Factor de anualidad"],
            ["i", "Tasa de descuento anual"],
            ["n", "Años de vida útil"],
        ]
    },
    {
        id: "costo_tubo", name: "Costo de la tubería", vars: [
            ["I_t", "Costo de la tubería ($)"],
            ["a", "Costo base de tubería ($/m)"],
            ["b", "Costo por mm de DN ($/m·mm)"],
            ["DN", "Diámetro nominal (mm)"],
            ["L", "Longitud total de tubería (m)"],
        ]
    },
    {
        id: "energia", name: "Energía anual de bombeo", vars: [
            ["E", "Energía anual (kWh)"],
            ["P_mb", "Potencia del motor (HP)"],
            ["0,7457", "Conversión HP → kW"],
            ["H_op", "Horas de operación por día"],
            ["365", "Días por año"],
        ]
    },
    {
        id: "costo_total", name: "Costo anual total", vars: [
            ["C_anual", "Costo anual total ($/año)"],
            ["I_t", "Costo de la tubería"],
            ["a(50)", "Anualidad a 50 años (tubería)"],
            ["I_b", "Costo de la bomba"],
            ["a(7)", "Anualidad a 7 años (bomba)"],
            ["E", "Energía anual (kWh)"],
            ["c_e", "Costo de energía ($/kWh)"],
            ["M_ant", "Mantenimiento anual ($/año)"],
        ]
    },
];
const FORMULA_META = Object.fromEntries(FORMULAS.map((f) => [f.id, f.name]));