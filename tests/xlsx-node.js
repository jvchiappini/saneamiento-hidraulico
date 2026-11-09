"use strict";
/* Lector mínimo de .xlsx para los tests (ZIP + XML), sin dependencias.
   Devuelve la misma forma que usa SheetJS: {SheetNames, Sheets:{...}}. */
const fs = require("fs");
const zlib = require("zlib");

function unzip(buf) {
    const eocd = (() => {
        for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
            if (buf.readUInt32LE(i) === 0x06054b50) return i;
        }
        throw new Error("No es un ZIP válido (falta EOCD).");
    })();
    const count = buf.readUInt16LE(eocd + 10);
    const cdOff = buf.readUInt32LE(eocd + 16);
    const out = {};
    let p = cdOff;
    for (let k = 0; k < count; k++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Entrada ZIP inválida.");
        const method = buf.readUInt16LE(p + 10);
        const compSize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const localOff = buf.readUInt32LE(p + 42);
        const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
        const lName = buf.readUInt16LE(localOff + 26);
        const lExtra = buf.readUInt16LE(localOff + 28);
        const dataOff = localOff + 30 + lName + lExtra;
        const raw = buf.slice(dataOff, dataOff + compSize);
        out[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
        p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}
function dec(s) {
    return String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
function texts(xml) {
    const out = [];
    const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let m;
    while ((m = re.exec(xml))) out.push(dec(m[1]));
    return out.join("");
}
function attrs(tag) {
    const o = {};
    const re = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(tag))) o[m[1]] = dec(m[2]);
    return o;
}
function parseShared(xml) {
    if (!xml) return [];
    const out = [];
    const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(xml))) out.push(texts(m[1]));
    return out;
}
function parseStyles(xml) {
    const res = { fills: [], fonts: [], xfFill: [], xfFont: [] };
    if (!xml) return res;
    const fills = /<fills\b[^>]*>([\s\S]*?)<\/fills>/.exec(xml);
    if (fills) {
        const re = /<fill\b[^>]*>([\s\S]*?)<\/fill>/g;
        let m;
        while ((m = re.exec(fills[1]))) {
            const c = /<fgColor\b[^>]*>/.exec(m[1]) || /<bgColor\b[^>]*>/.exec(m[1]);
            const a = c ? attrs(c[0]) : {};
            res.fills.push(a.rgb || (a.theme != null ? "theme:" + a.theme : null));
        }
    }
    const fonts = /<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(xml);
    if (fonts) {
        const re = /<font\b[^>]*>([\s\S]*?)<\/font>/g;
        let m;
        while ((m = re.exec(fonts[1]))) {
            const c = /<color\b[^>]*>/.exec(m[1]);
            const a = c ? attrs(c[0]) : {};
            res.fonts.push(a.rgb || (a.theme != null ? "theme:" + a.theme : null));
        }
    }
    const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
    if (xfs) {
        const re = /<xf\b[^>]*>/g;
        let m;
        while ((m = re.exec(xfs[1]))) {
            const a = attrs(m[0]);
            res.xfFill.push(+a.fillId || 0);
            res.xfFont.push(+a.fontId || 0);
        }
    }
    return res;
}
function parseSheet(xml, shared, styles) {
    const sheet = {};
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m;
    while ((m = cellRe.exec(xml))) {
        const a = attrs(m[1]);
        if (!a.r) continue;
        const body = m[2] || "";
        const fm = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body);
        const vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
        const im = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body);
        let v = null;
        if (a.t === "s") { v = vm ? (shared[+vm[1]] || "") : ""; }
        else if (a.t === "inlineStr") { v = im ? texts(im[1]) : ""; }
        else if (a.t === "str") { v = vm ? dec(vm[1]) : ""; }
        else if (a.t === "b") { v = vm ? vm[1] === "1" : null; }
        else if (a.t === "e") { v = vm ? dec(vm[1]) : null; }
        else if (vm) { v = Number(vm[1]); if (!isFinite(v)) v = dec(vm[1]); }
        const cell = { v, w: v == null ? null : String(v) };
        if (fm) cell.f = "=" + dec(fm[1]);
        const si = +a.s || 0;
        if (styles && styles.xfFill.length) {
            const fi = styles.xfFill[si] != null ? styles.xfFill[si] : 0;
            const fo = styles.xfFont[si] != null ? styles.xfFont[si] : 0;
            cell.s = { fill: { fgColor: { rgb: styles.fills[fi] || null } }, font: { color: { rgb: styles.fonts[fo] || null } } };
        }
        sheet[a.r] = cell;
    }
    // "!ref" aproximado
    let mr = 1, mc = 1;
    for (const k of Object.keys(sheet)) {
        const x = /^([A-Z]+)(\d+)$/.exec(k);
        if (!x) continue;
        const r = +x[2]; let cn = 0; for (const ch of x[1]) cn = cn * 26 + (ch.charCodeAt(0) - 64);
        if (r > mr) mr = r; if (cn > mc) mc = cn;
    }
    function cn2(n) { let s = ""; while (n > 0) { const x = (n - 1) % 26; s = String.fromCharCode(65 + x) + s; n = Math.floor((n - 1) / 26); } return s; }
    sheet["!ref"] = "A1:" + cn2(mc) + mr;
    return sheet;
}
function readXlsx(file) {
    const zip = unzip(fs.readFileSync(file));
    const wbXml = zip["xl/workbook.xml"] ? zip["xl/workbook.xml"].toString("utf8") : "";
    const relXml = zip["xl/_rels/workbook.xml.rels"] ? zip["xl/_rels/workbook.xml.rels"].toString("utf8") : "";
    const shared = parseShared(zip["xl/sharedStrings.xml"] ? zip["xl/sharedStrings.xml"].toString("utf8") : "");
    const styles = parseStyles(zip["xl/styles.xml"] ? zip["xl/styles.xml"].toString("utf8") : "");
    const rels = {};
    const relRe = /<Relationship\b[^>]*>/g;
    let rm;
    while ((rm = relRe.exec(relXml))) { const a = attrs(rm[0]); if (a.Id) rels[a.Id] = a.Target; }
    const names = [], sheets = {}, wbSheets = [];
    const shRe = /<sheet\b[^>]*>/g;
    let sm;
    while ((sm = shRe.exec(wbXml))) {
        const a = attrs(sm[0]);
        const name = a.name;
        const rid = a["r:id"] || a.id;
        let target = rels[rid] || "";
        target = target.replace(/^\/?xl\//, "").replace(/^\.\.\//, "");
        const path = "xl/" + target.replace(/^xl\//, "");
        names.push(name);
        sheets[name] = zip[path] ? parseSheet(zip[path].toString("utf8"), shared, styles) : {};
        wbSheets.push({ name, Hidden: a.state === "hidden" ? 1 : 0, tabSelected: a.state === "selected" });
    }
    return { SheetNames: names, Sheets: sheets, Workbook: { Sheets: wbSheets } };
}

function shiftCols(wb, sheetName, offset) {
    const sh = wb.Sheets[sheetName];
    const out = {};
    for (const k of Object.keys(sh)) {
        if (!/^[A-Z]+\d+$/.test(k)) { out[k] = sh[k]; continue; }
        const m = /^([A-Z]+)(\d+)$/.exec(k);
        let cn = 0; for (const ch of m[1]) cn = cn * 26 + (ch.charCodeAt(0) - 64);
        cn += offset; let s = ""; while (cn > 0) { const x = (cn - 1) % 26; s = String.fromCharCode(65 + x) + s; cn = Math.floor((cn - 1) / 26); }
        out[s + m[2]] = sh[k];
    }
    wb.Sheets[sheetName] = out;
    return wb;
}
function shiftRows(wb, sheetName, offset) {
    const sh = wb.Sheets[sheetName];
    const out = {};
    for (const k of Object.keys(sh)) {
        if (!/^[A-Z]+\d+$/.test(k)) { out[k] = sh[k]; continue; }
        const m = /^([A-Z]+)(\d+)$/.exec(k);
        out[m[1] + (+m[2] + offset)] = sh[k];
    }
    wb.Sheets[sheetName] = out;
    return wb;
}

module.exports = { readXlsx, unzip, shiftRows, shiftCols };
