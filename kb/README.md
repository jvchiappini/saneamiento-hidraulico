# Base de conocimiento — Saneamiento y Medio Ambiente

Esta carpeta es una base de conocimiento compacta y trazable del Trabajo Practico 2026. La consume un agente LLM mediante busqueda y lectura de archivos. **No reemplaza a las fuentes originales**: cada chunk cita archivo y pagina.

## Organizacion

```
kb/
  catalog.md        Lista de fuentes, prefijos y temas (se lee en cada turno).
  index.json        Un objeto por chunk: id, file, source, pages, title, section,
                    kind, module, tags, keywords, summary, chars.
  chunks/<id>.md    Un archivo por chunk, con encabezado YAML y contenido autocontenido.
  tables/<id>.json  Una tabla normativa o de diseno por archivo.
  formulas.json     Formulas con variables, resultado, modulo, archivo y pagina.
  criteria.json     Criterios numericos (min, max, unidad, regla, fuente).
  checklist.json    Items de la ponderacion 2026 (area, grupo, item, tipo, page_hint).
  glossary.json     Terminos y definiciones.
  errata.md         Discrepancias, valores anomalos e ilegibles.
  README.md         Este archivo.
```

### Convenciones

- **ids**: minusculas ASCII con guiones. Prefijos: `c1`…`c7` (clases), `np68`, `np44`, `pluv`, `acal`, `trat`, `ord38`, `ma2-mez`, `ma2-floc`, `ma2-dec`, `ma2-fil`, `ma2-clo`, `ma2-om`, `parshall`, `une`, `guia-predial`, `excel-<hoja>`, `pond`.
- **kind**: `criterio`, `procedimiento`, `formula`, `tabla`, `texto`, `ejemplo`, `norma`.
- **module**: `impulsion`, `potabilizadora`, `red`, `tanque`, `cloacal`, `predial`, `general`.
- **pages**: pagina(s) del PDF (1-indexadas) o nombre de hoja del Excel.
- **formulas**: LaTeX entre `$...$` o `$$...$$`.
- **chunks**: maximo 3000 caracteres; **catalog.md**: maximo 6000; **summary**: maximo 220.

### Fuentes y prioridad

1. Clases 1 a 7 (diapositivas; las paginas con tablas, formulas y ejemplos se renderizaron y leyeron visualmente).
2. `GUIA_MEMORIA_DE_CALCULO_PREDIAL.docx` (texto y tablas; formulas OMML transcriptas).
3. `2026_Sistema_de_ponderacion_del_trabajo_practico...pdf` (checklist).
4. `GUIA_TRABAJO_PRACTICO_PUBLICO.xlsx` (por hoja; formulas de Excel traducidas).
5. Normas NP 68, NP 44, Desagues Pluviales 2012, Agua Caliente 2016, Tratamiento de Aguas Residuales 2016 y Ordenanza 038.
6. Manuales ma2_* y `ma2_AFORADOR_PARSHALL.doc`.
7. `UNE 23-500-90.pdf` (resumen y tabla bomba principal -> jockey).

## Como regenerar

La kb se genero con un script de extraccion temporal (fuera del repositorio) que usa:

- **PyMuPDF** (`fitz`) para contar paginas, extraer texto y renderizar paginas a PNG (>=110 dpi) cuando la pagina es una imagen.
- **openpyxl** para leer formulas (`data_only=False`) y valores (`data_only=True`) de cada hoja del `.xlsx`.
- **python-docx / XML de Word** para el texto y las tablas del `.docx` (las formulas OMML se transcribieron a LaTeX).
- **Word COM** solo para el texto plano de `ma2_AFORADOR_PARSHALL.doc`.

Para regenerar:

1. Volver a extraer el texto de los PDFs y los volcados de Excel/Word con los scripts de extraccion.
2. Revisar visualmente las paginas de tablas (NP 68 paginas 11-34; NP 44 paginas 8-18; Pluvial paginas 4-6; Ordenanza paginas 10-13; UNE pagina 20; Clase 7 paginas 14-29).
3. Reconstruir `chunks/`, `tables/`, `formulas.json`, `criteria.json`, `checklist.json` y `glossary.json` con el generador.
4. Ejecutar el validador: JSON validos, ids unicos, correspondencia `index.json` <-> `chunks/`, tamanos maximos y campos obligatorios.

## Control de calidad

- Todos los JSON son validos y los ids son unicos entre chunks, tablas, formulas, criterios y checklist.
- Cada entrada de `index.json` tiene su `chunks/<id>.md`.
- Ningun chunk supera 3000 caracteres; `catalog.md` no supera 6000; ningun summary supera 220.
- Se verificaron visualmente los datos criticos de la NP 68: Tabla VII (1/4:61, 1/3:63, 1/2:64, 3/4:67, 1:72, 1 1/2:73, 2:75, 3:77, 4:79, 5:81, 6:82, 7 1/2:82,4, 10:83, 12:84, 15:85, 20:86, 30:87, 50:88, 100:90) y Figura I (0,44 -> 1/2"; 3,4 -> 3/4"; 15 -> 1"; 44 -> 1 1/4"; 107 -> 1 1/2"; 460 -> 2"; 1.400 -> 2 1/2"; 3.900 -> 3"; 12.000 -> 4"; 29.500 -> 5"; 60.000 -> 6").
- Las discrepancias conocidas estan en `errata.md`; las mas importantes: correccion comun de Hardy Cross aplicada a GQ en vez de RQ, infiltracion de T4-3 que suma F25 en vez de F26, Bazin declarado 0,22 vs usado 0,14, Tabla 3 con DN 400-550 fuera de la NP 68 y bomba de incendio con Ha=15 mca (Clase II) en un ejemplo de Clase I.

## Uso recomendado por el agente

1. Leer `catalog.md` para ubicar la fuente.
2. Buscar en `index.json` por `tags`, `keywords`, `module` o `title`.
3. Leer el `chunks/<id>.md` elegido; si el dato es normativo, abrir `tables/<id>.json`.
4. Para valores numericos de diseno, contrastar con `criteria.json` y `formulas.json`.
5. Ante cualquier valor dudoso o discrepante, consultar `errata.md` antes de responder.
