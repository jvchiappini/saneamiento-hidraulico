---
id: "excel-potabilizadora"
file: "GUÍA_TRABAJO_PRACTICO_PÚBLICO.xlsx"
pages: "hoja POTABILIZADORA"
title: "Planta potabilizadora en el Excel: aquietador, Parshall y floculador"
kind: "procedimiento"
---
Hoja 'POTABILIZADORA':
- Caudal diario: 13.353,12 m3/d; K1=1,2, K2=1,5, K3=1,05.
- Caudal de captacion: Qcap=13.353,12*1,2*1,05*1000/86.400 = 194,733 L/s.

Camara de aquietamiento:
- Velocidad ascensional adoptada: 8,6 cm/s (rango 4-10).
- Area de seccion: A=Q/v=0,194733/0,086=2,264 m2.
- Lado: sqrt(A)=1,505 m.
- Tiempo de aquietamiento: 31,6 s (rango 30-60).
- Profundidad: h=Q*t/A=2,718 m.

Canal Parshall:
- W=0,305 m (12"); H=((Q/1000)/(2,2W))^(2/3)=0,438 m; N=0,229 m; K=0,076 m; h2=0,263 m; H3=0,307 m; h1=0,0555 m.
- Velocidad de verificacion: V=Q/(W*h2)=2,43 m/s > 2 m/s, por lo que sirve como mezclador rapido.
- A=1,372 m; 2/3 A=0,915 m.

Vertedero en V (alternativa):
- Hmax=0,3728 m; 2Hmax=0,7456 m; H adoptado=0,30 m; B adoptado=0,60 m.
- Altura critica hc=0,1909 m; h1=0,0925 m; V1=2,824 m/s; F=2,96; h2=0,390 m; V2=0,6698 m/s; hp=0,1824 m; L=1,785 m; T=1,022 s.
- Gradiente del vertedero G=435,3 s-1; gradiente minimo de mezcla Gr=46,6 s-1. Verifica.

Floculador:
- Temperatura 23 C; viscosidad cinematica 9,42e-7 m2/s.
- t=30 min=1800 s; h=1,7 m (tanteo).
- v1=0,175 m/s (0,15-0,20); v2=0,425 m/s (0,40-0,45).
- Separacion de canales b=Q/(v1*h)=0,6546 m -> se adopta 0,70 m.
- v1 recalculada=0,1636 m/s; ancho del paso b'=1,5*b=1,05 m.
- Volumen de retencion V=350,52 m3; area superficial A=206,19 m2.
- Lados: X=22 m; numero de canales N=14; numero de bafles N1=13; Y=9,826 m.
- Perdidas: canales 0,0191 m; vueltas 0,2394 m; friccion 0,00388 m; total 0,2624 m.
- Manning n=0,01; RH=0,2902 m; gradiente de floculacion se calcula con la potencia disipada.

Fuente: GUÍA_TRABAJO_PRACTICO_PÚBLICO.xlsx, p. hoja POTABILIZADORA.
