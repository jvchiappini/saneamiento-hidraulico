---
id: "excel-datos-inic"
file: "GUÍA_TRABAJO_PRACTICO_PÚBLICO.xlsx"
pages: "hoja Datos Inic"
title: "Datos iniciales y caudales de la red (Excel)"
kind: "procedimiento"
---
Hoja 'Datos Inic' del Excel (red de abastecimiento):
- Cantidad de edificios: 72 (12 manzanas x 6 lotes).
- Caudal por edificio: 2,146528 L/s/lote.
- Caudal medio diario: 154,55 L/s.
- Caudal maximo diario: 185,46 L/s (K1=1,2).
- Caudal maximo horario: 278,19 L/s (K2=1,5).
- Caudal de bombeo del sistema de impulsion: K1*K3*Qmedio/86400; con K3=1,05 y Qmedio=13.353,12 m3/d resulta 0,19473 m3/s = 194,73 L/s.

La hoja define los tramos de las mallas I y II (AB, RB, RQ, QA, HR, GH, GQ), sus longitudes (224, 336, 224, 336, 336, 224, 336 m), numero de lotes por tramo y caudales Qa, Qc, Qt y Qcorr.

Qa = caudal por formula; Qc = caudal segun interpretacion; Qcorr = caudal corregido. La hoja calcula el diametro recomendado con:
$$D=\sqrt{\frac{4Q}{\pi V}}$$
con V=1,2 m/s, y luego adopta el diametro comercial (200, 250, 300, 350 mm).

Fuente: GUÍA_TRABAJO_PRACTICO_PÚBLICO.xlsx, p. hoja Datos Inic.
