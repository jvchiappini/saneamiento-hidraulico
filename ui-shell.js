"use strict";
/* =====================================================================
   ui-shell.js — Capa de interfaz común para todas las páginas de cálculo.
   No toca los cálculos: reorganiza la página y agrega navegación.
   - Índice lateral fijo con el estado de cada sección (✓ / ✕ / ⚠).
   - Contador global de verificaciones con salto a la primera que falla.
   - Secciones plegables, "expandir / contraer todo".
   - Resumen de resultados clave (copia viva de los KPIs del encabezado).
   - Botón "volver arriba" y protección de la rueda del mouse en inputs numéricos.
   ===================================================================== */
(function () {
    const EXCLUDE = "#informe, .no-count, .auto-log, .informe, .mod-informe, .toc";

    function sections() {
        return Array.from(document.querySelectorAll("main section.card.step[id]")).filter((s) => s.id !== "navegacion" && s.querySelector("h2"));
    }

    function status(sec) {
        let ok = 0, fail = 0, warn = 0;
        sec.querySelectorAll(".badge-state").forEach((b) => {
            if (b.closest(EXCLUDE) || b.offsetParent === null) return;
            if (b.classList.contains("fail")) fail++;
            else if (b.classList.contains("warn")) warn++;
            else if (b.classList.contains("ok")) ok++;
        });
        return { ok, fail, warn };
    }

    function build() {
        const main = document.querySelector("main");
        if (!main || main.dataset.shell) return;
        const secs = sections();
        if (secs.length < 2) return;
        main.dataset.shell = "1";
        document.body.classList.add("has-shell");

        const shell = document.createElement("div");
        shell.className = "shell";
        const aside = document.createElement("aside");
        aside.className = "toc";
        aside.setAttribute("aria-label", "Índice de la página");
        const content = document.createElement("div");
        content.className = "shell-main";
        while (main.firstChild) content.appendChild(main.firstChild);
        shell.appendChild(aside);
        shell.appendChild(content);
        main.appendChild(shell);

        aside.innerHTML = `
            <div class="toc-card">
                <button type="button" class="toc-status" id="toc-status" title="Ir a la primera verificación que no cumple">
                    <span class="ts-ok">✓ <b id="ts-ok">0</b></span><span class="ts-fail">✕ <b id="ts-fail">0</b></span><span class="ts-warn">⚠ <b id="ts-warn">0</b></span>
                </button>
                <div class="toc-bar"><div class="toc-bar-fill" id="toc-bar"></div></div>
                <p class="toc-hint" id="toc-hint">Verificaciones en pantalla</p>
            </div>
            <div class="toc-card toc-kpis" id="toc-kpis"></div>
            <nav class="toc-card toc-nav">
                <div class="toc-head"><span>Secciones</span>
                    <span class="toc-actions"><button type="button" id="toc-expand" title="Expandir todo">⊞</button><button type="button" id="toc-collapse" title="Contraer todo">⊟</button></span></div>
                <ol id="toc-list">${secs.map((s) => {
            const num = (s.querySelector(".step-num") || {}).textContent || "•";
            const t = s.querySelector("h2").textContent.trim();
            // Secciones largas: sub-entradas con los títulos de sus paneles
            const subs = Array.from(s.querySelectorAll(".panel > h3, .potab-auto-block > h3, h3.sub-title")).filter((h) => h.textContent.trim().length > 2);
            let subHTML = "";
            if (subs.length >= 4) {
                subHTML = `<ol class="toc-sub">${subs.map((h, k) => {
                    if (!h.id) h.id = `${s.id}-sub-${k}`;
                    return `<li><a href="#${h.id}" data-subof="${s.id}">${h.textContent.trim().replace(/\s+/g, " ").slice(0, 60)}</a></li>`;
                }).join("")}</ol>`;
            }
            return `<li><a href="#${s.id}" data-sec="${s.id}"><span class="toc-num">${num.trim()}</span><span class="toc-t">${t}</span><span class="toc-dot" data-dot="${s.id}"></span></a>${subHTML}</li>`;
        }).join("")}</ol>
            </nav>`;

        // Mobile: botón flotante para abrir el índice
        const fab = document.createElement("button");
        fab.type = "button"; fab.className = "toc-fab"; fab.setAttribute("aria-label", "Abrir índice");
        fab.innerHTML = "☰ <span>Índice</span>";
        fab.addEventListener("click", () => document.body.classList.toggle("toc-open"));
        document.body.appendChild(fab);
        aside.addEventListener("click", (e) => { if (e.target.closest("a")) document.body.classList.remove("toc-open"); });

        const top = document.createElement("button");
        top.type = "button"; top.className = "to-top"; top.setAttribute("aria-label", "Volver arriba"); top.textContent = "↑";
        top.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
        document.body.appendChild(top);

        // Secciones plegables (clic en el encabezado)
        secs.forEach((s) => {
            const head = s.querySelector(".step-head");
            if (!head) return;
            const btn = document.createElement("button");
            btn.type = "button"; btn.className = "sec-toggle"; btn.setAttribute("aria-label", "Plegar o desplegar sección"); btn.textContent = "▾";
            head.appendChild(btn);
            btn.addEventListener("click", () => toggle(s));
        });
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem("sh-collapsed-" + location.pathname) || "{}"); } catch (e) { /* noop */ }
        secs.forEach((s) => { if (saved[s.id]) s.classList.add("collapsed"); });
        function persist() {
            const o = {}; secs.forEach((s) => { if (s.classList.contains("collapsed")) o[s.id] = 1; });
            try { localStorage.setItem("sh-collapsed-" + location.pathname, JSON.stringify(o)); } catch (e) { /* noop */ }
        }
        function toggle(s, force) { s.classList.toggle("collapsed", force); persist(); }
        aside.querySelector("#toc-expand").addEventListener("click", () => secs.forEach((s) => toggle(s, false)));
        aside.querySelector("#toc-collapse").addEventListener("click", () => secs.forEach((s) => toggle(s, true)));
        aside.querySelectorAll("a[data-sec]").forEach((a) => a.addEventListener("click", () => {
            const s = document.getElementById(a.dataset.sec); if (s) s.classList.remove("collapsed");
        }));

        // Ir a la primera verificación que falla
        aside.querySelector("#toc-status").addEventListener("click", () => {
            const all = Array.from(document.querySelectorAll("main .badge-state.fail, main .badge-state.warn")).filter((b) => !b.closest(EXCLUDE));
            const b = all.find((x) => x.classList.contains("fail")) || all[0];
            if (!b) return;
            const s = b.closest("section"); if (s) s.classList.remove("collapsed");
            b.scrollIntoView({ behavior: "smooth", block: "center" });
            b.classList.add("flash"); setTimeout(() => b.classList.remove("flash"), 1600);
        });

        // Scroll-spy
        const links = {}; aside.querySelectorAll("a[data-sec]").forEach((a) => { links[a.dataset.sec] = a; });
        const io = new IntersectionObserver((ents) => {
            ents.forEach((e) => { if (e.isIntersecting) { Object.values(links).forEach((l) => l.classList.remove("on")); const l = links[e.target.id]; if (l) l.classList.add("on"); } });
        }, { rootMargin: "-30% 0px -60% 0px" });
        secs.forEach((s) => io.observe(s));
        window.addEventListener("scroll", () => { top.classList.toggle("show", window.scrollY > 600); }, { passive: true });

        // Estado vivo
        let t = null;
        const refresh = () => {
            let T = { ok: 0, fail: 0, warn: 0 };
            secs.forEach((s) => {
                // los paneles se regeneran al recalcular: reponer los anclajes de las sub-entradas
                if (aside.querySelector(`[data-subof="${s.id}"]`)) {
                    Array.from(s.querySelectorAll(".panel > h3, .potab-auto-block > h3, h3.sub-title")).filter((h) => h.textContent.trim().length > 2)
                        .forEach((h, k) => { if (!h.id) h.id = `${s.id}-sub-${k}`; });
                }
                const st = status(s);
                T.ok += st.ok; T.fail += st.fail; T.warn += st.warn;
                const dot = aside.querySelector(`[data-dot="${s.id}"]`);
                if (dot) {
                    dot.className = "toc-dot " + (st.fail ? "fail" : st.warn ? "warn" : st.ok ? "ok" : "");
                    dot.title = st.fail ? `${st.fail} no verifica` : st.warn ? `${st.warn} a revisar` : st.ok ? "todo verifica" : "";
                }
            });
            aside.querySelector("#ts-ok").textContent = T.ok;
            aside.querySelector("#ts-fail").textContent = T.fail;
            aside.querySelector("#ts-warn").textContent = T.warn;
            const tot = T.ok + T.fail + T.warn;
            aside.querySelector("#toc-bar").style.width = (tot ? (100 * T.ok / tot) : 0) + "%";
            aside.querySelector("#toc-status").classList.toggle("all-ok", T.fail === 0 && tot > 0);
            aside.querySelector("#toc-hint").textContent = tot ? (T.fail ? "Tocá para ir a la primera que falla" : "Todas las verificaciones cumplen") : "Sin verificaciones todavía";
            const kp = document.getElementById("hero-kpis");
            aside.querySelector("#toc-kpis").innerHTML = kp && kp.children.length ? `<div class="toc-head"><span>Resultados clave</span></div>` + Array.from(kp.querySelectorAll(".kpi")).map((k) => {
                const l = k.querySelector(".kpi-label"), v = k.querySelector(".kpi-value");
                return `<div class="tk"><span>${l ? l.textContent : ""}</span><b>${v ? v.innerHTML : ""}</b></div>`;
            }).join("") : "";
            aside.querySelector("#toc-kpis").style.display = kp && kp.children.length ? "" : "none";
        };
        const mo = new MutationObserver((muts) => {
            if (muts.every((m) => aside.contains(m.target))) return;
            clearTimeout(t); t = setTimeout(refresh, 200);
        });
        mo.observe(content, { childList: true, subtree: true, characterData: true });
        const kp = document.getElementById("hero-kpis");
        if (kp) mo.observe(kp, { childList: true, subtree: true, characterData: true });
        setTimeout(refresh, 300);
    }

    // La rueda del mouse no debe cambiar valores numéricos por accidente
    document.addEventListener("wheel", (e) => {
        const el = document.activeElement;
        if (el && el.type === "number" && e.target === el) el.blur();
    }, { passive: true });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(build, 50));
    else setTimeout(build, 50);
})();
