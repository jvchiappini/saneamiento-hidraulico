# Catalogo de la base de conocimiento

Base del TP "Saneamiento y Medio Ambiente" (2026). Cada chunk es autocontenido y cita archivo y pagina. Prefijos de id y contenido:

## Clases (diapositivas)
- `c1-*` — CLASE 1 (4).pdf. Salud publica y abastecimiento: agua potable e impurezas, enfermedades hidricas, contaminantes, constitucion del agua, fuentes, normativa NP 24 001 80, situacion en Paraguay y gobernabilidad/Acufiero Guarani.
- `c2-*` — CLASE 2 (4).pdf. Consumo per capita, proyeccion poblacional, aguas superficiales/subterraneas, criterios de ubicacion del TP, K1/K2/K3, diametros de Bresse, perdidas localizadas y potencia de bomba.
- `c3-*` — CLASE 3 (4).pdf. Planta potabilizadora: procesos, aquietador, Parshall vs vertedero en V, mezclador rapido, floculador (G 30-60), sedimentador, filtracion, cloracion y reservorio.
- `c4-*` — CLASE 4 (2).pdf. Estaciones de bombeo (clasificacion de bombas) y acueductos: presion interna, esfuerzos, golpe de ariete y materiales.
- `c5-*` — CLASE 5 (3).pdf. Reservorio (regulacion/incendio/emergencia) y red de distribucion: impulsion al tanque, mallas, Hardy Cross y presiones.
- `c6-*` — CLASE 6 (2).pdf. Alcantarillado: sistemas, colectores, tratamiento, drenaje urbano, caudales cloacales, infiltracion, Bazin y diametros.
- `c7-*` — CLASE 7.pdf. Ejemplos resueltos del predial: tanques inferior/superior/incendio, ventilacion, puente, perdidas, potencia, agua caliente y BIE/BIS.

## Normas
- `np68-*` — NP 68 (agua potable). Tablas I-IX, Tabla II de acometida, Anexo C Tablas I-III y Figura I. Consumo, pesos, caudales, presiones, velocidades, Flamant, Fair-Whipple-Hsiao, potencia, rendimientos y holgura.
- `np44-*` — NP 44 (desague sanitario). Tablas I-V: unidades de descarga Hunter, ramales, columnas, ventilacion; camaras de inspeccion, interceptores de grasa y velocidades.
- `pluv-*` — Norma Desagues Pluviales 2012. Tablas I-IV: canaletas, columnas de bajada, runoff y ramales; camaras y desarenadores.
- `acal-*` — Norma Agua Caliente 2016. Tablas I-V: consumo, pesos, consumo por punto, velocidades y diametros; termotanques.
- `trat-*` — Norma Tratamiento y Disposicion Final 2016. Camaras septicas: Tablas I-II, volumen util, lechos y filtros anaerobicos.
- `ord38-*` — Ordenanza 038 (incendio). Hidrantes por clase (caudal/presion), reserva tecnica, extintores (cobertura y capacidad) y requisitos de red.

## Manuales y catalogos
- `ma2-mez-*` — Azevedo & Acosta, Mezcladores. G 700-1300 s^-1, resalto, Froude, Parshall y rampa.
- `ma2-floc-*` — Floculador. G 70-20 s^-1, retencion 10-30 min, pantallas.
- `ma2-dec-*` — Decantadores laminares. Carga 120-185 m3/m2/d, Nr<500, placas.
- `ma2-fil-*` — Filtracion rapida. Tasa 120-150/240-360 m3/m2/d, 4 filtros, lavado.
- `ma2-clo-*` — Cloracion. Dosis 5 mg/L (min 1,0), almacenamiento 10/30 dias.
- `ma2-om-*` — Operacion y mantenimiento. Dosis optima, tasa declinante, cloro 1,0-1,5 mg/L.
- `parshall-*` — Aforador Parshall. Q=K H^n y tabla de dimensiones.
- `une-*` — UNE 23-500-90. Grupos contra incendios y tabla bomba principal -> jockey.

## Trabajo practico y planillas
- `guia-predial-*` — GUÍA_MEMORIA_DE_CALCULO_PREDIAL.docx. Datos, pesos, columnas, acometida, impulsion, tanques, electrobombas, incendio, pluvial, residuos y cloacal.
- `excel-*` — GUÍA_TRABAJO_PRACTICO_PÚBLICO.xlsx por hoja: datos iniciales, Hardy Cross, impulsion rio/tanque, potabilizadora, red cloacal, laguna, tratamiento preliminar y presiones.
- `pond-*` — Sistema de ponderacion 2026. Alcance de memoria y disenos; alimenta `checklist.json`.

## Estructura
`index.json` (chunks), `chunks/<id>.md`, `tables/<id>.json` (tablas normativas), `formulas.json`, `criteria.json`, `checklist.json`, `glossary.json`, `errata.md`, `README.md`.
