#!/usr/bin/env node
//
// Seitentest: die GANZE SPA im echten Browser, gegen eine FHEMWEB-Attrappe.
//
//     node t/seite/run.js                 alle Fälle
//     node t/seite/run.js pager           nur eine Falldatei (cases/pager.js)
//     node t/seite/run.js pager 0         nur der erste Fall, plus Screenshot
//
// Der Widget-Test (t/widget) lädt eine Kachel allein. Alles, was aus dem
// Zusammenspiel entsteht - Kopfhöhe, Snap, Auto-Paging, Hero-Deckel, der
// Titel-Link -, braucht die Seite als Ganzes: Kopfzeile mit headerInfo und
// statusBar, Raster, Longpoll. Genau das steht hier.
//
// Die Fälle sind aus Fehlern entstanden, die der Nutzer auf dem Wandtablet
// oder dem Handy gesehen hat und die in der Attrappe erst sichtbar wurden,
// als sie SEINE Sicht-Attribute hatte (Kopfzeile 138 statt 40 px). Deshalb
// kommen Konfiguration und Geräte aus fixtures/ und nicht aus dem Kopf.
//
// Drei Geräte-Profile:
//   tablet  1000×640, Skin bento, Tablet-Modus (bedienbar)
//   handy    412×915, isMobile + Android-UA, Skin zeilen, zoom 0.9
//   tv      1280×800, ?mode=tv&width=1000 (Wandtablet: skaliert, blättert)
// Ohne isMobile ignoriert Desktop-Chromium den Meta-Viewport - ein Fehler,
// der an innerWidth hängt, wäre dann unsichtbar (siehe CLAUDE.md).
//
// Jeder Fall bekommt automatisch zwei Zusicherungen dazu: keine Fehler auf der
// Konsole, und die Statuszeile meldet keinen Versionskonflikt.

const fs = require("fs");
const path = require("path");
const { start } = require("./server");
const { geraete, config } = require("./geraete");

const CASES = path.join(__dirname, "cases");

const PROFIL = {
  tablet: {
    ctx: { viewport: { width: 1000, height: 640 } },
    url: "?device=myViz&skin=bento",
    config: { mode: "tablet" },
  },
  handy: {
    ctx: {
      viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36",
    },
    url: "?device=myViz&skin=zeilen&zoom=0.9",
    config: { mode: "tablet" },
  },
  tv: {
    ctx: { viewport: { width: 1280, height: 800 } },
    url: "?device=myViz&mode=tv&width=1000",
    // Nur der Raum Solar ist in der Fixture; die echte Szenenliste beginnt
    // mit der Uhr-Seite (#uhr), die Kopfzeile waere dann ausgeblendet und
    // jede Hoehenmessung falsch. Lange Szene, damit nichts mitten in der
    // Messung rotiert; ein Fall kann es ueberschreiben (pager).
    config: { mode: "tv", tvScenes: "Solar:600" },
  },
};

// Meldungen, die kein Fehler sind: die SPA probiert optionale Custom-Widgets
// (js/widgets/custom/index.js) und faengt den 404 selbst ab.
const HARMLOS = /widgets\/custom\/index\.js/;

function chromiumPfad() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const kandidaten = [];
  for (const wurzel of ["/opt/pw-browsers", path.join(process.env.HOME || "", ".cache/ms-playwright")]) {
    let eintraege = [];
    try { eintraege = fs.readdirSync(wurzel); } catch { continue; }
    for (const e of eintraege) {
      if (!e.startsWith("chromium")) continue;
      kandidaten.push(path.join(wurzel, e, "chrome-linux", "chrome"));
      kandidaten.push(path.join(wurzel, e, "chrome-linux", "headless_shell"));
    }
    kandidaten.push(path.join(wurzel, "chromium"));
  }
  return kandidaten.find((p) => fs.existsSync(p));
}

/** Helfer, die ein Fall über `h` bekommt. */
const helfer = (page) => ({
  /** Karussell/Auto-Paging anhalten - sonst scrollt der Timer gegen die Messung. */
  timerStoppen: () =>
    page.evaluate(() => {
      const m = setTimeout(() => {}, 0);
      for (let i = 1; i <= m; i++) { clearTimeout(i); clearInterval(i); }
    }),
  /** Kopfzeile: CSS-Variable gegen gemessene Höhe, Scroller, scroll-padding. */
  kopf: () =>
    page.evaluate(() => ({
      variable: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--viz-header-h")) || 0,
      echt: document.getElementById("viz-header").offsetHeight,
      unten: document.getElementById("viz-header").getBoundingClientRect().bottom,
      status: document.getElementById("viz-status").textContent,
      scroller: getComputedStyle(document.body).overflowY === "auto" ? "body" : "html",
    })),
  /**
   * Seiten-Offsets wie computePageOffsets in app.js: Zeilen aus gleichen
   * Oberkanten, Seitenumbruch an der ersten Zeile, die nicht mehr passt.
   */
  seitenOffsets: () =>
    page.evaluate(() => {
      const app = document.getElementById("fhemviz-app");
      const cRect = app.getBoundingClientRect();
      const base = app.scrollTop, H = app.clientHeight;
      if (app.scrollHeight <= H + 4) return [0];
      const scale = app.offsetWidth ? cRect.width / app.offsetWidth : 1;
      const rows = new Map();
      for (const it of app.querySelectorAll(".viz-grid > *, .viz-hero > *, .viz-group > h3, .viz-room > h2")) {
        const r = it.getBoundingClientRect();
        if (!r.height) continue;
        const top = Math.round((r.top - cRect.top) / scale + base);
        const bottom = Math.ceil((r.bottom - cRect.top) / scale + base);
        rows.set(top, Math.max(rows.get(top) || 0, bottom));
      }
      const pages = [0];
      for (const [top, bottom] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
        const cur = pages[pages.length - 1];
        if (bottom - cur > H && top > cur) pages.push(top);
      }
      return pages;
    }),
});

async function main() {
  const nurDatei = process.argv[2];
  const nurFall = process.argv[3] !== undefined ? parseInt(process.argv[3], 10) : null;

  let chromium;
  try { ({ chromium } = require("playwright")); }
  catch {
    console.error("Playwright fehlt. Einmalig: npm install playwright");
    process.exit(2);
  }
  const exe = chromiumPfad();
  if (!exe) {
    console.error("Kein Chromium gefunden. PW_CHROMIUM=<pfad zum chrome> setzen\n" +
                  "oder: npx playwright install chromium");
    process.exit(2);
  }

  const dateien = fs.readdirSync(CASES).filter((f) => f.endsWith(".js"))
    .filter((f) => !nurDatei || f === `${nurDatei}.js`);
  if (!dateien.length) {
    console.error(`Keine Fälle gefunden${nurDatei ? ` für "${nurDatei}"` : ""} in ${CASES}`);
    process.exit(2);
  }

  let ok = 0, fehler = 0;
  const browser = await chromium.launch({ executablePath: exe });

  for (const datei of dateien) {
    const gruppe = path.basename(datei, ".js");
    let faelle = require(path.join(CASES, datei));
    if (nurFall !== null) faelle = faelle.slice(nurFall, nurFall + 1);

    for (const fall of faelle) {
      const profil = PROFIL[fall.geraet || "tablet"];
      const liste = geraete(fall.fixture || "solar");
      if (typeof fall.geraete === "function") fall.geraete(liste);
      const cfg = config("myViz", { ...profil.config, ...(fall.config || {}) });
      const server = await start({ config: cfg, geraete: liste, verzoegerung: fall.verzoegerung || {} });

      const ctx = await browser.newContext(profil.ctx);
      const page = await ctx.newPage();
      const konsole = [];
      const merken = (t) => { if (!HARMLOS.test(t)) konsole.push(t); };
      page.on("pageerror", (e) => merken(String(e)));
      page.on("console", (m) => {
        // "Failed to load resource" nennt die URL nicht im Text, nur im Ort.
        if (m.type() === "error") merken(`${m.text()} (${(m.location() || {}).url || ""})`);
      });
      page.on("response", (q) => { if (q.status() >= 400) merken(`HTTP ${q.status()} ${q.url()}`); });

      console.log(`\n${gruppe} · ${fall.name} [${fall.geraet || "tablet"}]`);
      const pruefe = (bedingung, text) => {
        if (bedingung) { ok++; console.log(`   ok    ${text}`); }
        else { fehler++; console.log(`   FEHL  ${text}`); }
      };

      let absturz = null;
      try {
        await page.goto(`http://127.0.0.1:${server.port}/fhem/fhemviz/index.html${profil.url}${fall.url || ""}`,
                        { waitUntil: "load" });
        if (fall.warten !== 0) await page.waitForTimeout(fall.warten || 2500);
        await fall.pruefe({ page, ok: pruefe, server, h: helfer(page), profil });
      } catch (e) {
        absturz = String(e);
      }

      if (absturz) {
        pruefe(false, `Fall lief nicht: ${absturz.split("\n")[0]}`);
      } else {
        pruefe(konsole.length === 0, `keine Fehler auf der Konsole${konsole.length ? ": " + konsole.slice(0, 3).join(" | ") : ""}`);
        const status = await page.evaluate(() => (document.getElementById("viz-status") || {}).textContent || "").catch(() => "");
        pruefe(!/Version/i.test(status), `kein Versionskonflikt in der Statuszeile ("${status}")`);
      }
      if (nurFall !== null && !absturz) {
        const ziel = path.join(__dirname, `shot-${gruppe}-${nurFall}.png`);
        await page.screenshot({ path: ziel }).catch(() => {});
        console.log(`   -> ${ziel}`);
      }

      await ctx.close();
      server.close();
    }
  }

  await browser.close();
  console.log(`\n${ok} ok, ${fehler} fehlgeschlagen`);
  process.exit(fehler ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
