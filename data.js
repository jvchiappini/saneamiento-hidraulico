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