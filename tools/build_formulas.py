"""Genera todas las formulas del calculo en LaTeX y las convierte a SVG (dvisvgm).

Uso:  python tools/build_formulas.py
Requiere: MiKTeX/TeX Live con latex.exe y dvisvgm.exe en el PATH.
"""

import os
import pathlib
import subprocess
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = REPO / "formulas"
OUT.mkdir(exist_ok=True)

# (id, nombre corto, latex)
FORMULAS = [
    ("personas",
     "Total de personas de los departamentos",
     r"P_{total} = M \cdot L \cdot P_t \cdot D_p \cdot \left( D_o \cdot P_e + S \right)"),

    ("logistica",
     "Personal de logistica",
     r"P_{log} = D_p \cdot P_t \cdot \frac{\%_{log}}{100} \cdot L \cdot M"),

    ("qm_l",
     "Caudal medio de bombeo (l/d)",
     r"Q_m = P_{total} \cdot q_d + P_{log} \cdot q_o"),

    ("qm_m3",
     "Caudal medio de bombeo (m3/d)",
     r"Q_m\left[\tfrac{m^3}{d}\right] = \frac{Q_m\left[\tfrac{l}{d}\right]}{1000}"),

    ("qm_ls",
     "Caudal medio de bombeo (l/s)",
     r"Q_m\left[\tfrac{l}{s}\right] = \frac{Q_m\left[\tfrac{l}{d}\right]}{86400}"),

    ("qlote_l",
     "Caudal por lote (l/d)",
     r"Q_{lote} = \frac{Q_m}{M \cdot L}"),

    ("qlote_ls",
     "Caudal por lote (l/s)",
     r"Q_{lote}\left[\tfrac{l}{s}\right] = \frac{Q_{lote}\left[\tfrac{l}{d}\right]}{86400}"),

    ("qb_m3",
     "Caudal de bombeo (m3/s)",
     r"Q_b = \frac{K_1 \cdot K_3 \cdot Q_{md}}{86400}"),

    ("qb_ls",
     "Caudal de bombeo (l/s)",
     r"Q_b\left[\tfrac{l}{s}\right] = Q_b \cdot 1000"),

    ("horas",
     "Horas de operacion de la bomba",
     r"H_{op} = \frac{15 \cdot 2 \cdot 24}{60}"),

    ("bresse",
     "Diametro de impulsion (Bresse)",
     r"D = 1{,}3 \cdot \sqrt{Q_b} \cdot \left( \frac{H_{op}}{24} \right)^{1/4}"),

    ("vel",
     "Velocidad en la tuberia",
     r"v = \frac{Q_b}{\dfrac{\pi \cdot d^2}{4}} = \frac{4 \, Q_b}{\pi \, d^2}"),

    ("verif_vel",
     "Verificacion de velocidad",
     r"0{,}7 \le v \le 4{,}0 \; \left[\tfrac{m}{s}\right]"),

    ("j_pt",
     "Perdida por metro de tuberia (Fair Whipple - Hsiao, acero galvanizado)",
     r"J = \left( \frac{Q_b}{27{,}113 \cdot d^{\,2{,}596}} \right)^{1/0{,}532}"),

    ("leq_s",
     "Longitud equivalente de succion",
     r"L_{eq,s} = L_{vp} + 2 \cdot L_{c90} + L_{t2} + L_{vc}"),

    ("leq_i",
     "Longitud equivalente de impulsion",
     r"L_{eq,i} = L_{c90} + L_{vr} + L_{vc} + L_{tl}"),

    ("perd_s",
     "Perdida de carga en succion",
     r"h_{p,s} = \left( L_s + L_{eq,s} \right) \cdot J_s"),

    ("perd_i",
     "Perdida de carga en impulsion",
     r"h_{p,i} = \left( L_i + L_{eq,i} \right) \cdot J_i"),

    ("hm_s",
     "Altura manometrica de succion",
     r"H_s = h_{t,s} + \left( L_s + L_{eq,s} \right) \cdot J_s + \frac{v_s^2}{2\,g}"),

    ("hm_i",
     "Altura manometrica de impulsion",
     r"H_i = h_{t,i} + \left( L_i + L_{eq,i} \right) \cdot J_i + \frac{v_i^2}{2\,g}"),

    ("hm_total",
     "Altura manometrica total",
     r"H = H_s + H_i + P_{res}"),

    ("pb_cv",
     "Potencia de la bomba (cv)",
     r"P_b = \frac{1000 \cdot H \cdot Q_b}{75 \cdot \eta_{bomba}}"),

    ("p_hp",
     "Potencia al freno (HP)",
     r"P = 1{,}014 \cdot P_b"),

    ("pmb",
     "Potencia del motor (HP)",
     r"P_{mb} = \frac{P}{\eta_{motor}}"),

    ("holgura",
     "Holgura segun potencia",
     r"h = \begin{cases} 0{,}50 & P_{mb} \le 2 \\ 0{,}30 & 2 < P_{mb} \le 5 \\ 0{,}20 & 5 < P_{mb} \le 10 \\ 0{,}15 & 10 < P_{mb} \le 20 \\ 0{,}10 & P_{mb} > 20 \end{cases}"),

    ("phmb",
     "Potencia con holgura (HP)",
     r"P_{hmb} = \left( 1 + h \right) \cdot P_{mb}"),

    ("cavitacion",
     "Altura por cavitacion",
     r"h_{cav} = \frac{v_s^2}{2\,g} + 0{,}2"),

    ("pozo",
     "Altura minima del agua sobre la criba",
     r"h_{pozo} = \max \left( h_{cav} ;\; 0{,}5 \right)"),

    ("anualidad",
     "Factor de anualidad",
     r"a(n) = \frac{i \, (1+i)^n}{(1+i)^n - 1}"),

    ("costo_tubo",
     "Costo de la tuberia",
     r"I_t = \left( a + b \cdot DN \right) \cdot L"),

    ("energia",
     "Energia anual de bombeo",
     r"E = P_{mb} \cdot 0{,}7457 \cdot H_{op} \cdot 365"),

    ("costo_total",
     "Costo anual total",
     r"C_{anual} = I_t \cdot a(50) + I_b \cdot a(7) + E \cdot c_e + M_{ant}"),
]

HEADER = r"""\documentclass[12pt]{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb}
\pagestyle{empty}
\begin{document}
"""


def build():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        tex = HEADER
        for _fid, _name, math in FORMULAS:
            tex += "\\[\n" + math + "\n\\]\n\\newpage\n"
        tex += "\\end{document}\n"
        (tmp / "formulas.tex").write_text(tex, encoding="utf-8")

        env = dict(os.environ)
        env["MIKTEX_AUTOINSTALL"] = "yes"

        r = subprocess.run(
            ["latex", "-interaction=nonstopmode", "-halt-on-error",
             "-output-directory", str(tmp), str(tmp / "formulas.tex")],
            capture_output=True, text=True, env=env,
        )
        if r.returncode != 0:
            sys.exit("latex fallo:\n" + r.stdout[-2000:] + r.stderr[-2000:])

        dvi = tmp / "formulas.dvi"
        for i, (fid, name, _math) in enumerate(FORMULAS, start=1):
            out = OUT / f"{fid}.svg"
            rr = subprocess.run(
                ["dvisvgm", "--bbox=min", f"--page={i}",
                 "-o", str(out), str(dvi)],
                capture_output=True, text=True, env=env,
            )
            if rr.returncode != 0:
                print(f"  dvisvgm fallo en {fid}: {rr.stderr[-500:]}")
            else:
                print(f"  ok  {fid}.svg  ({name})")

    print(f"\nListo: {len(FORMULAS)} formulas en {OUT}")


if __name__ == "__main__":
    build()