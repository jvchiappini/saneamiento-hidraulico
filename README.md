# Saneamiento Hidráulico — Trabajo Práctico

> Calculadora web interactiva para el **Trabajo Práctico de Saneamiento y Medio Ambiente**,
> con el **sistema de impulsión de agua** y la **planta potabilizadora** dimensionados conforme a la
> **Norma 68** (Obras sanitarias de la República Argentina).

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-deployado-brightgreen)](https://jvchiappini.github.io/saneamiento-hidraulico/)
[![HTML](https://img.shields.io/badge/HTML5-%23E34F26.svg?logo=html5&logoColor=white)]()
[![CSS](https://img.shields.io/badge/CSS3-%231572B6.svg?logo=css3&logoColor=white)]()
[![JS](https://img.shields.io/badge/JavaScript-ES6-%23F7DF1E.svg?logo=javascript&logoColor=black)]()
[![Dependencias](https://img.shields.io/badge/dependencias-2%20CDN-0b5d56)]()
[![Norma](https://img.shields.io/badge/norma-N°68-0b5d56)]()

---

## Tabla de contenidos

1. [Descripción](#-descripción)
2. [Demo](#-demo)
3. [Funcionalidades](#-funcionalidades)
4. [Stack tecnológico](#-stack-tecnológico)
5. [Estructura del proyecto](#-estructura-del-proyecto)
6. [Módulos de cálculo](#-módulos-de-cálculo)
   - [Sistema de impulsión](#sistema-de-impulsión)
   - [Planta potabilizadora](#planta-potabilizadora)
7. [Asistente](#-asistente-chathtml)
7. [Modo manual vs. automático](#-modo-manual-vs-automático)
8. [Mapa de dependencias de la potabilizadora](#-mapa-de-dependencias-de-la-potabilizadora)
9. [Informe técnico y PDF](#-informe-técnico-y-pdf)
10. [Cómo usar](#-cómo-usar)
11. [Ejecutar en local](#-ejecutar-en-local)
12. [Desplegar en GitHub Pages](#-desplegar-en-github-pages)
13. [Referencias](#-referencias)
14. [Desarrollo](#-desarrollo)
15. [Notas y limitaciones](#-notas-y-limitaciones)
16. [Licencia](#-licencia)

---

## 📖 Descripción

Este proyecto replica, en una aplicación web sin backend ni dependencias de build, las dos hojas de
cálculo principales del trabajo práctico de la cátedra **"Saneamiento y Medio Ambiente"**:

- **Sistema de impulsión** de agua potable desde el pozo de captación hasta el reservorio.
- **Planta potabilizadora** completa: desde la captación hasta el reservorio de agua tratada,
  pasando por mezcla rápida, floculación, sedimentación, filtración y cloración.

Todos los cálculos siguen las tablas y fórmulas de la **Norma 68** y se validaron contra la
[planilla oficial del trabajo práctico](#-referencias) (`GUIA_TRABAJO_PRACTICO_PUBLICO.xlsx`).

---

## 🌐 Demo

La aplicación está publicada con **GitHub Pages**:

**https://jvchiappini.github.io/saneamiento-hidraulico/**

Se actualiza automáticamente con cada `push` a la rama `main`.

---

## ✨ Funcionalidades

- **Dos motores de cálculo** en cada área:
  - **Manual**: el usuario decide los valores *adoptados* y de *tanteo* (celdas amarillas de la hoja);
    todo lo demás se recalcula en vivo.
  - **Automático**: se ingresan solo los parámetros de base y el sistema **adopta y redondea solo**
    todos los valores (dimensiones comerciales, números pares, potencias estandarizadas, etc.).
- **Recálculo instantáneo** con *debounce* mientras se escribe, manteniendo el foco del input.
- **Persistencia local** (`localStorage`): el estado de cada página se conserva entre sesiones.
- **Informe técnico** profesional generado automáticamente:
  - Vista HTML en pantalla.
  - **Exportación a PDF** (jsPDF + autotable) con encabezado, tablas, conclusión y figuras.
  - **Memoria de cálculo completa**: todas las fórmulas con su **reemplazo numérico parte por parte** y el
    resultado de cada operación (ver `steps.js`).
- **Esquema dinámico del aforador Parshall** (SVG generado en vivo con planta y perfil, cotas
  W, H, h2, H3, N, K, A, D, E) en la página, en el informe HTML y embebido en el PDF.
- **Mapa de dependencias** de la potabilizadora: explica qué variables alimentan a otras.
- **Verificaciones con insignias** de estado (✓ / ✕ / ⚠) en todos los rangos normativos
  (velocidades, gradientes, relaciones L/H, separaciones, potencias, etc.).
- **Fórmulas del cálculo** como imágenes SVG (generadas desde LaTeX) con el detalle de sus variables,
  y **toggle global** para mostrarlas u ocultarlas.
- **Memoria de cálculo con LaTeX**: las fórmulas del informe se tipografían con **MathJax** en pantalla
  y se embeben como imagen en el PDF; los **valores adoptados / de tanteo** de los modos automáticos
  también aparecen en el informe.
- **Modo automático que busca hasta verificar todo**: en impulsión recorre los diámetros comerciales y en
  la potabilizadora prueba combinaciones de tanteo hasta que **todas las verificaciones** pasan. Cada
  intento se muestra en pantalla y en el informe, y queda guardado en `localStorage`.
- **Tablas de referencia** de la Norma 68 (Tablas 1, 3, 6, 7 y 8) en la página de referencias.
- Diseño **responsive**, menú hamburguesa y dropdowns de navegación.

---

## 🛠️ Stack tecnológico

| Capa        | Tecnología                                              |
| ----------- | ------------------------------------------------------- |
| Front-end   | HTML5 semántico · CSS3 (variables, grid, flexbox)       |
| Lógica      | JavaScript puro (ES6+, `"use strict"`)                  |
| Build       | **Ninguno** — sitio estático sin bundlers ni transpilado |
| Persistencia| `localStorage`                                          |
| PDF         | `jsPDF` + `jsPDF-AutoTable` (CDN, en las páginas de informe) |
| Matemática  | `MathJax 3` (`tex-svg`) por CDN para las fórmulas del informe en LaTeX |
| Tipografía  | Google Fonts: *Inter* y *JetBrains Mono*                |
| Diagramas   | SVG inline generado dinámicamente (aforador Parshall)   |
| Fórmulas    | SVG generadas con LaTeX/MiKTeX (`tools/build_formulas.py`) |

Las dependencias externas en runtime son las dos librerías de PDF cargadas por CDN en
`potabilizadora.html` y `potabilizadora-auto.html`, más MathJax (CDN) en las cuatro páginas de
cálculo para tipografiar las fórmulas del informe.

---

## 🗂️ Estructura del proyecto

```
saneamiento-hidraulico/
│
├── index.html                # Sistema de impulsión · Manual
├── auto.html                 # Sistema de impulsión · Automático
├── potabilizadora.html       # Planta potabilizadora · Manual
├── potabilizadora-auto.html  # Planta potabilizadora · Automático
├── referencias.html          # Tablas de la Norma 68
├── formulas.html             # Todas las fórmulas del cálculo (SVG)
│
├── app.js                    # Lógica de cálculo, estado, formularios y renderizado
├── data.js                   # Tablas de la Norma 68 y metadatos de fórmulas
├── steps.js                  # Memoria de cálculo: fórmula + reemplazo numérico + resultado
├── styles.css                # Estilos globales
│
├── image.png                 # Esquema de accesorios (Tabla 3 · Norma 68)
├── fittings/                 # Imágenes de accesorios para pérdidas singulares
│   └── fitting_*.png / image_*.png
├── formulas/                 # Fórmulas del cálculo en SVG
│   └── *.svg
├── tools/
│   └── build_formulas.py     # Genera los SVG de fórmulas desde LaTeX (dvisvgm)
│
├── GUIA_TRABAJO_PRACTICO_PUBLICO.xlsx   # Planilla oficial (referencia de cálculo)
└── CLASE 3 (2).pdf           # Material de clase de la potabilizadora (referencia)
```

### Archivos clave

| Archivo              | Responsabilidad |
| -------------------- | --------------- |
| `app.js`             | Toda la lógica: estado (`S`, `SP`), cálculos (`calc()`, `potabCalc()`), adopción automática (`potabAutoAdopt()`), renderizado y PDF. |
| `data.js`            | Datos estáticos: Tablas 1, 3, 6, 7 y 8 de la Norma 68, costos de tubería/bomba, y metadatos de las fórmulas. |
| `potabilizadora.html`| Estructura de los 11 pasos de la potabilizadora en modo manual. |
| `potabilizadora-auto.html` | Parámetros de base + tanteos mínimos y resultados automáticos. |

---

## 🧮 Módulos de cálculo

### Sistema de impulsión

Etapas replicadas de la hoja *"Datos y Sistema de Impulsión"*:

| # | Módulo | Qué calcula |
| - | ------ | ----------- |
| 1 | **Caudal unitario** | Población total (departamentos + servicio + logística) con la Tabla 1. |
| 2 | **Caudales** | Caudal medio `Qm`, caudal por lote, caudal de bombeo `Qb = Qm·K1·K3`, horas de operación. |
| 3 | **Diámetros** | Diámetro de Bresse, diámetros comerciales, velocidad y verificación en el rango 0,7–4,0 m/s. |
| 4 | **Pérdidas de carga** | Pérdida unitaria por **Fair–Whipple–Hsiao**, longitudes equivalentes (Tabla 3), pérdidas en succión e impulsión. |
| 5 | **Alturas manométricas** | Altura en succión, en impulsión y total (incluye presión de llegada al reservorio). |
| 6 | **Potencia** | Potencia de la bomba (cv → HP), motor (Tabla 7), holgura, potencia adoptada (Tabla 8), cavitación y pozo. |
| 7 | **Alternativas** | Algoritmo de **mínimo costo anual** (tubería + bomba + energía + mantenimiento con factor de anualidad) entre diámetros comerciales. |
| 8 | **Pozo** | Altura mínima del agua sobre la criba para evitar cavitación. |

**Modo automático** (`auto.html`): propone hasta 3 alternativas ordenadas por costo anual, adopta
los diámetros comerciales y la potencia del motor iterando los rendimientos (Tablas 6 y 7).

### Planta potabilizadora

Los **11 pasos** de la hoja *"POTABILIZADORA"*:

| # | Paso | Parámetros / verificaciones principales |
| - | ---- | --------------------------------------- |
| 1 | **Captación** | `Qcap = Caudal diario · K1 · K3` (K2 afecta solo a la red de distribución). |
| 2 | **Cámara de aquietamiento** | Velocidad ascensional 4–10 cm/s, tiempo de aquietamiento 30–60 s, profundidad 1–3 m. |
| 3 | **Canal aforador Parshall** | Garganta `W` tabulada (1"–10'), altura `H`, `h2 = 0,6H`, `H3 = 0,7H`, pérdida `h1`. **Mezclador rápido si v ≥ 2 m/s.** Incluye esquema SVG dinámico. |
| 4 | **Vertedero en “V”** | `Hmax`, resalto hidráulico (Froude, h2, V1, V2, energía disipada, Lm, Lj, tiempo de mezcla), **gradiente G vs Gr** (G > Gr para mezcla). |
| 5 | **Canal de estabilización** | Longitud = tiempo × velocidad al final del resalto. |
| 6 | **Mezclador rápido para coagulantes** | Volumen del tanque, potencia del agitador, brazo = ⅔ altura, paleta = 70% del diámetro. *(Fallback si no verifica el vertedero.)* |
| 7 | **Floculador / mezclador lento** | Canales y bafles, velocidades v1 (0,15–0,20) y v2 (0,40–0,45), **gradiente 30 ≤ G ≤ 60 s⁻¹**. |
| 8 | **Sedimentador horizontal** | Nf (Morril y Wallace, **siempre par**), Ns = Nf/2, Csup 0,13–0,26 l/s·m², L/b 3–5, L/H 7–30, canaleta de agua floculada, dispositivos de entrada (tabique con orificios) y salida (vertedero), canaleta de agua sedimentada y **drenaje**. |
| 9 | **Filtración** | Filtro rápido de arena, tasa 120 m³/m²/d, tasa de lavado, canaletas colectoras (separación ≤ 1,8 m), **bomba y tanque de lavado**. |
| 10 | **Cloración** | Reservorio de contacto (t = 20–30 min), consumo de Cl₂, hipoclorito de sodio al 8%, relación de disolución ¼, tanque y **bomba dosadora**. |
| 11 | **Reservorio de agua tratada** | Volumen = Qd/24 · K1 · K2 · 2 · 1,5, profundidad 1–4 m y diámetro de construcción. |

---

### Red de distribución (`red.html`, Clase 5)

Datos iniciales, tanque elevado cilíndrico, red en malla **genérica** (nodos, tramos y anillos editables)
resuelta por **Hardy Cross** con Hazen-Williams, y verificación de presiones. El modo automático reparte
los caudales iniciales por continuidad (árbol desde el tanque), dimensiona con la velocidad económica,
itera hasta que los diámetros no cambian y calcula la altura mínima de la base del tanque para P ≥ 10 m.c.a.

### Impulsión al tanque (`tanque.html`, Clase 5)

Bresse, alternativas de diámetro, Fair-Whipple-Hsiao, longitudes equivalentes (Tabla 3 NP 68), potencia
con las Tablas VI–VIII y selección por **mínimo costo anual** entre todos los diámetros comerciales.

### Red cloacal (`cloacal.html`, Clase 6)

Caudales acumulados con infiltración, pendiente mínima NBR 9649, cotas de fondo con empalme por la clave,
profundidades, velocidad de Bazin y capacidad a sección llena. El algoritmo elige, tramo por tramo, el menor
diámetro que no profundiza más de lo deseado.

### Predial · agua potable del edificio (`predial.html`, Clase 7)

Pesos de artefactos (Tabla III y V, Figura I), departamentos, columnas de bajada, acometida (Tabla II),
impulsión y succión, tanques (incendio, inferior, superior), ventilaciones, rebosaderos, limpieza, puente de
empalme, ruptor de vacío, electrobombas (Flamant), agua caliente y sistema contra incendio (Ordenanza 038).

Todos los módulos nuevos usan `mod-core.js` (tablas normativas y fórmulas) y generan una **memoria de cálculo
en LaTeX** (fórmula → reemplazo numérico → resultado) imprimible como PDF. Las funciones de cálculo no usan
el DOM, así que se pueden verificar con Node (`require("./red.js").calc(...)`).

### Interfaz común (`ui-shell.js` / `ui-shell.css`)

Índice lateral con el estado de cada sección, contador global de verificaciones (clic → primera que falla),
resultados clave siempre visibles, secciones plegables y botón para volver arriba.

## 🤖 Asistente (`chat.html`)

Chat con un modelo (Gemini o Claude) que usa los cálculos de la web y la base de conocimiento (`kb/`) como
herramientas. Interfaz tipo chat: conversaciones guardadas en el navegador (IndexedDB), respuestas en
streaming con Markdown y LaTeX (MathJax), herramientas como chips plegables, panel **Proyecto** con el avance
y el estado de cada módulo, y botón **Preguntar al asistente** en cada página de cálculo
(abre `chat.html?from=<página>` con el resumen de esa página como contexto).

### Configuración

- **Gemini (recomendado, gratis con límites)**: cada estudiante saca su key en
  [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (cuenta de Google → «Create API key»).
  Se guarda solo en el `localStorage` de su navegador y se envía únicamente a
  `generativelanguage.googleapis.com` (en el encabezado `x-goog-api-key`, nunca en la URL). No hay inicio de
  sesión con Google ni proxy: el cupo es el del proyecto de cada estudiante. Los límites del plan gratuito son
  **por proyecto** (no por key), el cupo diario se reinicia a medianoche del Pacífico y los números vigentes
  están en [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit). **Uso de datos:** en el plan
  gratuito Google puede usar los prompts y las respuestas para mejorar sus productos y pueden leerlos revisores
  humanos (no enviar información sensible); en el EEE, Suiza y Reino Unido exige plan pago. Modelos:
  `gemini-3.6-flash` (por defecto), `gemini-3.5-flash-lite` y `gemini-3.8-flash`.
- **Claude (key de Anthropic, de pago)**: cada estudiante usa su propia key de [console.anthropic.com](https://console.anthropic.com/)
  (el uso se cobra en esa cuenta). Se guarda solo en el `localStorage` de su navegador, se envía únicamente a
  `api.anthropic.com` y se borra desde Configuración. Anthropic no ofrece inicio de sesión con Google para
  apps de terceros.
- **Modo demo**: sin key; las respuestas son simuladas pero las herramientas y los cálculos se ejecutan de verdad.
- Modelo (Claude Sonnet 5.5 por defecto, Opus 5.5 o Haiku 5.5), esfuerzo de razonamiento, máximo de tokens
  por respuesta y umbral para resumir el contexto. **Probar conexión** usa el conteo de tokens (no genera texto).

### Cómo funciona

| Archivo | Qué hace |
| ------- | -------- |
| `agent.js` | Bucle de la API de Mensajes con streaming: ejecuta las herramientas en el navegador y repite (máx. 10 pasos por turno). Prompt de sistema fijo por conversación con `kb/catalog.md` y la errata, con caché. Historial "solo agregar"; al pasar el umbral resume los turnos viejos y conserva los últimos 4. |
| `gemini.js` | Adaptador de Gemini (`generateContent` con streaming SSE por `fetch`, sin SDK). Mismo contrato de eventos y mismo bucle que `agent.js`; historial en formato nativo con `thoughtSignature` reenviado sin tocar. Cada conversación guarda su proveedor y se queda con él. |
| `agent-tools.js` | Herramientas con JSON Schema estricto: `kb_search`, `kb_read`, `kb_table`, `kb_formula`, `kb_criteria`, `calc` (evaluador propio, sin `eval`; varias cuentas por llamada con `also`), `run_module`, `module_memo`, `project_get`, `project_set` (pide confirmación con la diferencia), y las de «una sola vez» para gastar pocas llamadas: `module_full` (datos + resultados + verificaciones + memoria completa de un módulo), `project_overview` (todos los módulos y el avance), `kb_lookup` (busca y lee) y `report` (informe en Markdown por módulo o global, con botón de descarga y enlace al informe imprimible), `checklist_get`, `checklist_update`, `open_page`. Resultados de hasta 4000 caracteres; los errores vuelven al modelo como resultado de error. |
| `kb.js` | Carga de `kb/` y búsqueda BM25 sin tildes en el cliente. Si falta `kb/`, el chat funciona igual y avisa "base de conocimiento no disponible". |
| `demo.js` | Cliente simulado para el modo demo. |
| `chat.html` / `chat.css` / `chat.js` | Interfaz. |

- El SDK oficial (`@anthropic-ai/sdk@1.3.0`) se carga por CDN solo cuando hay key, con
  `dangerouslyAllowBrowser: true`.
- `red.js`, `tanque.js`, `cloacal.js` y `predial.js` arrancan su interfaz solo en su propia página
  (`data-page`), así el chat carga únicamente el cálculo.
- El asistente lee (no modifica) los datos de la impulsión del río y la potabilizadora (`app.js`).
- Para probar con otra base de conocimiento: `chat.html?kb=tests/fixtures/kb`.

### Tests

```bash
node --test tests/agent.test.js tests/gemini.test.js
```

Cubren BM25 y la kb de prueba, `calc`, `run_module` con los 4 módulos (contra `XCalc.calc`), `project_set`
con confirmación, truncado, el bucle del agente (herramientas en paralelo, errores, límite de pasos,
rechazos, detener), el resumen de contexto y el modo demo. `tests/gemini.test.js` cubre el adaptador de Gemini con `fetch` simulado (SSE, firmas, funciones en paralelo, límite de pasos, `MAX_TOKENS`, `SAFETY`, errores 400/403/429/503, abortar, resumen).

## ⚙️ Modo manual vs. automático

Tanto la impulsión como la potabilizadora tienen **dos páginas** con el mismo motor de cálculo pero
diferente filosofía de entrada:

| | **Manual** | **Automático** |
| - | ---------- | -------------- |
| Decisión | Vos editás los valores *adoptados* y de *tanteo* (celdas amarillas). | Solo ingresás parámetros de base y tanteos mínimos. |
| Redondeos | El usuario elige (ej. W del Parshall, b del floculador, potencias). | El sistema adopta siguiendo reglas de la planilla: garganta tabulada con v ≥ 2 m/s, **Nf par**, Csup y L/b para dimensiones cómodas, separación de canaletas ≤ 1,8 m, **tanques y potencias comerciales**. |
| Ejemplo | `potabilizadora.html` | `potabilizadora-auto.html` |

> Los valores *adoptados* que decide el modo automático quedan guardados en `localStorage`, así que si
> después abrís la página manual los vas a ver precargados y podés refinarlos a mano.

---

## 🔗 Mapa de dependencias de la potabilizadora

Incluido en la página manual como panel plegable. Resumen:

- **Qcap = Qd · K1 · K3** alimenta todos los módulos (aquietamiento, Parshall, vertedero, floculador, sedimentador, filtración, cloración y reservorio).
- La **v1 recalculada del floculador** (B111) es la **velocidad del agua floculada** del sedimentador (B162).
- La **profundidad del floculador** (B106) debe coincidir con la **altura máxima del canal de agua floculada** (B166/D166).
- El **ancho del sedimentador** (B154) alimenta los **lados aprox. del floculador** (B115 → X) y los **lados del filtro** (B215).
- El **Nº de filtros Nf** (par) define **Ns = Nf/2** y la filtración (B210).
- La **viscosidad cinemática** (B104, depende de la temperatura) alimenta los **gradientes** del vertedero y del floculador.
- El **caudal de lavado del filtro** (B222) alimenta las **canaletas** (B227) y el **tanque + bomba de lavado** (B237–B244).

---

## 📄 Informe técnico y PDF

Cada página de cálculo genera un **informe técnico** al pie:

- **Vista HTML**: tarjetas por módulo con parámetros → valor → unidad, y una conclusión redactada con los resultados.
- **PDF** (botón "Descargar PDF"): documento A4 con encabezado institucional, tablas, la **Figura 1 (aforador Parshall)**, numeración de páginas y espacio para grupo/integrantes.
- Fallback: si la librería de PDF no carga, el botón dispara `Ctrl + P → Guardar como PDF` del navegador.

---

## 🚀 Cómo usar

1. Abrí la página del sistema que quieras calcular (Impulsión o Potabilizadora).
2. Completá los **parámetros**:
   - *Manual*: todos los campos editables marcados con la etiqueta **editable** / **adoptado / tanteo**.
   - *Automático*: solo los datos de base (caudal, K1–K3, tanteos mínimos).
3. Los resultados se actualizan solos mientras escribís.
4. Verificá las insignias ✓ / ✕ (rangos normativos).
5. Usá el toggle **"Ver fórmulas"** en el menú para ver la ecuación de cada paso.
6. Descargá el **informe en PDF** al final de la página.

---

## 💻 Ejecutar en local

No hace falta instalar nada. Cualquiera de estas opciones funciona:

**Opción 1 — abrir directo**
```bash
start index.html
```

**Opción 2 — servidor local (recomendado para probar el PDF)**
```bash
python -m http.server 8080
# o con Node:
npx serve .
```
Luego abrí `http://localhost:8080`.

> Nota: `localStorage` y el PDF funcionan mejor servidos por HTTP. Si abrís el archivo directo
> (`file://`) también funciona, pero algunos navegadores restringen ciertas APIs.

---

## 🚢 Desplegar en GitHub Pages

El sitio está preparado para **GitHub Pages** desde la rama `main` (carpeta raíz):

1. En el repositorio: **Settings → Pages**.
2. **Source**: `Deploy from a branch`, branch `main`, carpeta `/ (root)`.
3. Guardar. El sitio queda en `https://<usuario>.github.io/<repo>/`.

En este repositorio el deploy ya está configurado, y cada `push` a `main` lo reconstruye solo.

---

## 📚 Referencias

| Referencia | Uso |
| ---------- | --- |
| **Norma 68** — Obras sanitarias (República Argentina) | Tablas 1, 3, 6, 7 y 8 usadas en todo el cálculo. |
| `GUIA_TRABAJO_PRACTICO_PUBLICO.xlsx` | Planilla oficial del trabajo práctico. Las hojas *"Datos y Sistema de Impulsión"* y *"POTABILIZADORA"* son la fuente de fórmulas y valores adoptados. |
| `CLASE 3 (2).pdf` | Material de clase (cátedra de Saneamiento y Medio Ambiente) con la teoría de la planta potabilizadora: criterios de diseño y rangos normativos. |

---

## 🔧 Desarrollo

### Regenerar las fórmulas (SVG)

Las imágenes de `formulas/` se generan desde LaTeX:

```bash
python tools/build_formulas.py
```

Requiere `latex` y `dvisvgm` (MiKTeX / TeX Live) en el `PATH`.

### Convenciones

- Números formateados en **es-AR** (coma decimal, punto de miles) mediante `toLocaleString("es-AR", …)`.
- Los campos editables usan `input[type=number]` con `step="any"`.
- Estado de potabilizadora bajo la clave `sh-potab-state-v1`; estado general bajo `sh-state-v1`.
- Las funciones de cálculo están separadas del renderizado: `calc()` / `potabCalc()` devuelven un objeto `r`, y las funciones `renderXxx(r)` pintan en el DOM.

---

## ⚠️ Notas y limitaciones

- Es una **herramienta académica**: los resultados orientan el dimensionamiento pero no reemplazan el
  criterio de un profesional ni la verificación final del docente.
- Las cotas del esquema del Parshall son **esquemáticas** (no a escala); los valores que se muestran sí
  corresponden al cálculo.
- La página automática elige valores *adoptados* válidos por heurísticas (rangos normativos + reglas de
  la planilla); siempre conviene revisar el resultado en la página manual.
- El PDF se genera en el navegador; con muchos datos puede tardar un segundo.

---

## 📄 Licencia

Proyecto de uso **académico** para el trabajo práctico de la cátedra *Saneamiento y Medio Ambiente*.
Sin licencia formal de distribución.