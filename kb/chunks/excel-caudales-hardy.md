---
id: "excel-caudales-hardy"
file: "GUÍA_TRABAJO_PRACTICO_PÚBLICO.xlsx"
pages: "hoja Caudales"
title: "Hardy Cross en la hoja Caudales (Excel)"
kind: "procedimiento"
---
Hoja 'Caudales' del Excel: metodo de Hardy Cross para las mallas I y II.
Perdida unitaria (Hazen-Williams):
$$J=10{,}643\,C^{-1{,}85}\,D^{-4{,}87}\,|Q|^{1{,}85}\operatorname{sign}(Q)$$
con C=140 (PVC), D en m, Q en m3/s y J en m/m.
- Perdida por tramo: Hi=J*L.
- Correccion de caudal:
$$\Delta Q=-\frac{\sum H_i}{1{,}851\sum (H_i/Q_i)}$$
- Se itera hasta que la suma de perdidas de cada circuito sea cero. En el ejemplo la 1ra iteracion da ΣHi=1,530 y -4,743; en la 6ta iteracion ΣHi=0,000.
- Los caudales Qcorregido de la iteracion seleccionada se copian manualmente a la hoja de presiones.

Discrepancia detectada: en la 1ra iteracion, para el tramo compartido RQ del circuito I se aplica como correccion comun el valor -K20 (correccion del tramo GQ del circuito II) en lugar de -K19 (correccion del tramo RQ). Ver errata.

Fuente: GUÍA_TRABAJO_PRACTICO_PÚBLICO.xlsx, p. hoja Caudales.
