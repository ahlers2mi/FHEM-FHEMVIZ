#!/usr/bin/env node
//
// Widget-Test im echten Browser:
//
//     node t/widget/run.js                 alle Fälle
//     node t/widget/run.js watertank       nur ein Widget
//     node t/widget/run.js watertank 0     nur der erste Fall, plus Screenshot
//
// Entstanden am 13.09.2026 beim Umbau der Zahlenzeile von watertank. Layout
// lässt sich am Code nicht beurteilen - zweimal ist genau das schiefgegangen -,
// und beim ersten Lauf fiel ein Fehler auf, den das Lesen nicht gefunden hätte:
// bei einem Zeitstempel in der Zukunft stand die Warnzahl ohne ihren Bezug da.
//
// Gemessen wird, nicht geschaut: Zahl der Kennzahlen, Zeilen, Überlauf quer,
// Kachelhöhe. Jeder Fall prüft zusätzlich automatisch, dass die Konsole leer
// bleibt und nichts quer hinausragt.
//
// Braucht Playwright und einen Chromium. In der Entwicklungsumgebung liegt der
// unter /opt/pw-browsers; sonst PW_CHROMIUM setzen oder "npx playwright install
// chromium" laufen lassen.

const fs = require("fs");
const path = require("path");
const { start } = require("./server");

const CASES = path.join(__dirname, "cases");
const FIXTURES = path.join(__dirname, "fixtures");

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
  }
  return kandidaten.find((p) => fs.existsSync(p));
}

async function main() {
  const nurWidget = process.argv[2];
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
    .filter((f) => !nurWidget || f === `${nurWidget}.js`);
  if (!dateien.length) {
    console.error(`Keine Fälle gefunden${nurWidget ? ` für "${nurWidget}"` : ""} in ${CASES}`);
    process.exit(2);
  }

  let ok = 0, fehler = 0;
  const browser = await chromium.launch({ executablePath: exe });

  for (const datei of dateien) {
    const widget = path.basename(datei, ".js");
    let faelle = require(path.join(CASES, datei));
    if (nurFall !== null) faelle = faelle.slice(nurFall, nurFall + 1);

    for (const fall of faelle) {
      const fixture = path.join(FIXTURES, `${fall.fixture || "bewaesserung"}.json`);
      const { server, port } = await start(fixture);
      const breite = fall.breite || 420;

      const seite = await browser.newPage({
        viewport: { width: breite + 40, height: 1000 },
        isMobile: true,              // ohne das ignoriert Desktop-Chromium den Meta-Viewport
        deviceScaleFactor: 2,
        hasTouch: true,
      });
      const konsole = [];
      seite.on("pageerror", (e) => konsole.push(String(e)));
      seite.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
      seite.on("requestfailed", (q) => konsole.push("Request: " + q.url()));
      seite.on("response", (q) => { if (q.status() >= 400) konsole.push(`HTTP ${q.status()} ${q.url()}`); });

      const q = new URLSearchParams({
        widget,
        breite: String(breite),
        size: fall.size || "2x2",
        readings: Buffer.from(JSON.stringify(fall.readings || {})).toString("base64"),
      });
      if (fall.hero) q.set("hero", fall.hero);

      let r = null, absturz = null;
      try {
        await seite.goto(`http://127.0.0.1:${port}/probe.html?${q}`);
        await seite.waitForFunction(() => window.__fertig === true, null, { timeout: 10000 });
        await seite.waitForTimeout(200);
        r = await seite.evaluate(() => {
          const sr = document.getElementById("w").shadowRoot;
          const figs = [...sr.querySelectorAll(".wt-fig")].map((f) => ({
            wert: (f.querySelector("b") || {}).firstChild?.textContent?.trim() || "",
            einheit: (f.querySelector("b .u") || {}).textContent || "",
            label: (f.querySelector(":scope > span") || {}).textContent || "",
            warn: f.classList.contains("warn"),
            regen: f.classList.contains("rain"),
            top: Math.round(f.getBoundingClientRect().top),
          }));
          // Zeilen "Beschriftung … Wert" der Anlagen-Kacheln (solvis)
          const reihen = [...sr.querySelectorAll(".sv-row")].map((z) => ({
            k: (z.querySelector(".sv-k") || {}).textContent?.trim() || "",
            v: (z.querySelector(".sv-v") || {}).textContent?.trim() || "",
          }));
          const karte = sr.querySelector(".card") || sr.firstElementChild;
          return {
            figs,
            reihen,
            zeilen: new Set(figs.map((f) => f.top)).size,
            ueberlauf: karte ? karte.scrollWidth - karte.clientWidth : 0,
            hoehe: Math.round(document.getElementById("w").getBoundingClientRect().height),
          };
        });
      } catch (e) {
        absturz = String(e);
      }

      console.log(`\n${widget} · ${fall.name} (${breite} px)`);
      const pruefe = (bedingung, text) => {
        if (bedingung) { ok++; console.log(`   ok    ${text}`); }
        else { fehler++; console.log(`   FEHL  ${text}`); }
      };

      if (absturz) {
        pruefe(false, `Fall lief nicht: ${absturz.split("\n")[0]}`);
      } else {
        // Gilt für jeden Fall, ohne dass die Falldatei es wiederholen muss.
        pruefe(konsole.length === 0, `keine Fehler auf der Konsole${konsole.length ? ": " + konsole.join(" | ") : ""}`);
        pruefe(r.ueberlauf === 0, `kein Ueberlauf quer (ist: ${r.ueberlauf})`);
        if (typeof fall.pruefe === "function") fall.pruefe(r, pruefe);

        if (nurFall !== null) {
          const ziel = path.join(__dirname, `shot-${widget}-${nurFall}.png`);
          await seite.screenshot({ path: ziel });
          console.log(`   -> ${ziel}`);
        }
      }

      await seite.close();
      server.close();
    }
  }

  await browser.close();
  console.log(`\n${ok} ok, ${fehler} fehlgeschlagen`);
  process.exit(fehler ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
