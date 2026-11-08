# Errata y discrepancias

Registro de datos ilegibles, contradicciones entre fuentes y particularidades detectadas durante la extraccion. Cuando un valor se transcribio, se indica la fuente que manda.

## Planillas Excel

1. **Excel "Caudales" (Hardy Cross) — correccion comun aplicada al tramo equivocado.** En la 1ra iteracion del circuito I, el tramo compartido es **RQ**. La correccion comun que se le aplica es `L11 = -K20`, es decir, la correccion del tramo **GQ** del circuito II, en lugar de `-K19`, que es la correccion del tramo RQ. El resultado es que RQ recibe -0,044018 en vez de la correccion que le corresponde. Se transcribio el procedimiento general, no el valor erroneo como si fuera correcto.

2. **Excel "RED CLOACAL" — infiltracion acumulada de T4-3.** En la fila T4-3 (fila 27), la infiltracion acumulada se calcula como `F27 = B11*C27/1000 + F25`, sumando la infiltracion de T6-5 (F25) en vez de la de T5-4 (F26). Deberia ser `+F26`. Afecta el caudal de calculo de T4-3 y aguas abajo.

3. **Excel "RED CLOACAL" — coeficiente de Bazin.** La planilla declara `gamma = 0,22` (celda B16 y texto de la Clase 6), pero la formula implementada en las celdas T24:T29 usa `0,14`: `v=(87/(1+(0,14/S^0,5)))*(S*I)^0,5`. Para reproducir la planilla manda 0,14; el valor declarado es 0,22. Ver `c6-bazin`.

4. **Excel "impulsion" — conversion CV a HP.** La planilla usa `HP = 1,014 * CV`. **No es una contradiccion**: la NP 68 tambien indica `HP = 1,014 . cv` (nota al pie de la Tabla VII). Se deja constancia porque algunas planillas o textos redondean 1 CV = 1 HP y eso cambia el ultimo decimal.

5. **Excel "Tabla 3" para DN 400-550.** La tabla de longitudes equivalentes cargada en las hojas de impulsion incluye DN 400, 450, 500 y 550 mm. La Tabla III del Anexo C de la NP 68 solo llega hasta DN 350 mm. Los valores para 400-550 no tienen respaldo en la NP 68 y no se transcribieron como tabla normativa; se usan solo como dato de la planilla. Ver `np68-anexo-c-tabla-iii`.

## Guia predial y ejemplos de clase

6. **Bomba de incendio con Ha = 15 m.c.a.** La guia predial (y el ejemplo de la Clase 7) adopta `Ha = 15 mca` para la bomba principal, argumentando 2 BIE de 500 L/min. Ese valor corresponde a **Clase II** en la Ordenanza 038. Para **Clase I**, la Ordenanza fija **6 mca** (0,6 kg/cm2) y 250 L/min. Se transcribio el ejemplo con 15 mca y se advierte la diferencia en `c7-incendio-bies` y `guia-predial-incendio`.

7. **Clase 7 — criterio de Ha.** El mismo ejemplo de la Clase 7 usa `Ha = 15 mca` al calcular la bomba principal, aunque la tabla de la Ordenanza que cita da 6 mca para Clase I. Vale la advertencia anterior.

## Normas

8. **NP 68, Tabla II de acometida — valores anomalos.** En la pagina 12, `Pd=160 kPa` tiene 0,56 L/s para 1/2", mayor que 0,54 L/s de `Pd=170 kPa`; y `Pd=270 kPa` tiene 2,61 L/s para 1", mayor que 2,47 L/s de `Pd=260 kPa`. Se transcribieron tal cual. Verificar contra el original impreso antes de usar esos dos puntos.

9. **NP 68, Tabla VII — "3" en lugar de 1/3.** El original imprime `3` en la segunda columna de HP, pero la secuencia (1/4, 3, 1/2, 3/4, 1...) y el valor 63 corresponden a **1/3 HP**. En `tables/np68-tabla-vii-motores.json` se corrigio la etiqueta a "1/3" y se dejo la nota.

10. **NP 68, Anexo C Tablas II y III — encabezados por iconos.** Las tablas de hierro galvanizado y generica no tienen rotulo textual en las columnas: solo iconos. En la Tabla I (PVC) los 16 accesorios si estan rotulados y se usaron esos nombres. En las Tablas II y III las columnas se numeraron posicionalmente (`acc_01`...); en la Tabla III las 10 primeras coinciden con la Tabla I y las 3 siguientes son valvulas, pero las ultimas no pudieron rotularse con certeza. Los **valores numericos** se transcribieron; el rotulo de esas columnas es [ILEGIBLE] como texto.

11. **NP 68, Tabla III del Anexo C — cantidad de columnas.** Tiene 19 columnas de accesorios, mientras que la Tabla I tiene 16. No se pudo determinar con certeza el nombre de los 3 accesorios adicionales (los iconos no tienen texto). Se numeraron posicionalmente.

12. **NP 68, Figura I — lectura de umbrales.** La figura es un grafico; los umbrales ΣP -> diametro se transcribieron de la tabla impresa al pie (0,44 -> 1/2"; 3,4 -> 3/4"; 15 -> 1"; 44 -> 1 1/4"; 107 -> 1 1/2"; 460 -> 2"; 1.400 -> 2 1/2"; 3.900 -> 3"; 12.000 -> 4"; 29.500 -> 5"; 60.000 -> 6"). Se usa el valor tabulado inmediato superior.

13. **Criterio de floculacion: catedra vs manual.** La catedra exige **G entre 30 y 60 s^-1** (Clase 3). El manual de Azevedo & Acosta indica **70 a 20 s^-1** decreciente. No es un error: son criterios de distinta fuente. Para el TP manda 30-60; el manual se cita como referencia. Ver `c3-floculador` y `ma2-floc-criterios`.

14. **Ordenanza 038 — area de cobertura de extintores.** La tabla del Art. 44.2 se transcribio como 400/250/150 m2 y 20/15/12 m lineales para Clases I/II/III. En el PDF la palabra "RIEZGO" esta mal escrita; se corrigio solo la etiqueta, no los valores.

## Documentos escaneados o con imagenes

15. **UNE 23-500-90 — PDF escaneado.** Solo se pudo leer texto por OCR visual de las paginas renderizadas. Se transcribio el resumen de la pagina 2 y la tabla de bomba principal -> jockey de la pagina 20 del PDF (pagina 27 del original). Las demas paginas no se transcribieron. La tabla tiene dos bloques (ENR y PQ/ENI); se volcaron ambos. Alguna fila del bloque derecho podria tener el modelo de jockey abreviado; verificar contra la pagina si se usa un modelo no listado.

16. **ma2_AFORADOR_PARSHALL.doc — mayormente imagenes.** Del .doc solo se pudo extraer texto: "Aforador Parshall. Medidor de caudales", la colocacion de la regla a 2/3 de la seccion convergente y la formula `Q = K H^n`. El resto son imagenes sin texto. Los criterios y la tabla de dimensiones se tomaron de la Clase 3 (pagina 24) y del Excel (hoja POTABILIZADORA), no del .doc.

17. **Planos de la Clase 7 (paginas 15, 17, 18, 21).** Son planos de AutoCAD con cotas; se usaron solo para confirmar dimensiones y diametros (tanque inferior 6,50 x 12,00; tanque superior 6,00 x 3,40; bombas 2 x 20 HP; jockey 0,9 kW = 1,1 HP). No se transcribieron como tablas.

18. **Paginas de clases sin texto util.** CLASE 7 paginas 14-29 son imagenes de calculos; se leyeron visualmente. CLASE 1 paginas 8-9, 13-14, 19-20, 24 y CLASE 2 paginas 13, 32 contienen imagenes sin texto; no aportan datos numericos nuevos y no generaron chunks.

## Notas de fidelidad

- Todos los valores de tablas normativas se transcribieron de la pagina renderizada o del texto embebido. Los que no se pudieron verificar visualmente se marcan en la tabla correspondiente.
- No se copiaron parrafos legales largos; se resumieron con cita de articulo/item.
- Las formulas se transcribieron a LaTeX. Cuando el PDF tenia la formula desarmada (por ejemplo Fair-Whipple-Hsiao), se reconstruyo la forma estandar y se contrasto con la version usada en el Excel.

## Correcciones de lectura detectadas en la verificacion visual

19. **Ordenanza 038, Art. 53 y 55 — diametros 2 1/2" y 1 1/2".** La extraccion de texto del PDF mostraba un caracter [ILEGIBLE] en lugar de la fraccion. La pagina renderizada (p. 13) confirma que el Art. 53 exige diametro interno **no inferior a 2 1/2"** y que las valvulas son de **2 1/2"** para uso industrial/almacenamiento y **1 1/2"** para las demas funciones. Se corrigieron `ord38-hidrantes` y `ord38-crit-diametro-min`.

20. **NP 68, Tabla II — valores anomalos confirmados.** La pagina renderizada (p. 12) confirma los valores 0,56 (Pd=160) y 2,61 (Pd=270, 1") tal como se transcribieron; no son errores de OCR, sino del original.

21. **NP 68, Tabla VII — 1/3 confirmado.** La pagina renderizada (p. 23) muestra la secuencia 1/4, 1/3, 1/2, 3/4, 1, ... con 63% para 1/3. El texto embebido decia "3"; la tabla usa "1/3".

22. **NP 44, Tablas I, II y III; Pluvial, Tablas II-IV; Ordenanza, tabla de hidrantes.** Verificadas visualmente contra las paginas 8-9 de la NP 44, 5-6 de Pluvial y 13 de la Ordenanza. Los valores transcriptos coinciden.
