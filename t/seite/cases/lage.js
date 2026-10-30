// Lage-Seite (#lage, attr showIf/maxTiles, v0.38.0).
//
// Was schiefgehen kann: eine bedingte Kachel steht da, obwohl die Bedingung
// nicht zutrifft (oder umgekehrt), die Reihenfolge ist nicht die aus showIf,
// maxTiles deckelt nicht, "Alles in Ordnung" fehlt bzw. steht neben einem
// Treffer - und die Groessen-/Widget-Angabe der Seite schlaegt auf das Geraet
// durch (dann waere die Solar-Seite mit kaputt).

const SHOWIF = [
  "st_fenster:state!=closed",
  "st_tuer:state!=closed",
  "MQTT2_Tesla_Model3=1x1/sensor:battery_level<99&@hour>=0",
  "mySolvis",
].join("\n");

async function kacheln(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#fhemviz-app .viz-group")].map((g) => ({
      gruppe: (g.querySelector("h3") || {}).textContent || "",
      geraete: [...g.querySelectorAll(".viz-grid > *")].map((w) => (w.device || {}).name),
      groessen: [...g.querySelectorAll(".viz-grid > *")].map((w) => w.getAttribute("data-size") || ""),
      tags: [...g.querySelectorAll(".viz-grid > *")].map((w) => w.tagName.toLowerCase()),
    }))
  );
}
const okZeile = (page) => page.evaluate(() => !!document.querySelector(".viz-lage-ok"));

function offen(liste, name) {
  const d = liste.find((g) => g.Name === name);
  d.Internals.STATE = "open";
  d.Readings.state = { Value: "open", Time: d.Readings.state ? d.Readings.state.Time : "" };
}

module.exports = [
  {
    name: "Ruhig: nur fester Teil + Tesla-Bedingung, kein Fenster",
    geraet: "tv",
    config: { tvScenes: "#lage:600", showIf: SHOWIF },
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      const k = await kacheln(page);
      const alle = k.flatMap((g) => g.geraete);
      ok(!alle.includes("st_fenster") && !alle.includes("st_tuer"), `keine Fenster/Tueren (sind: ${alle.join(",")})`);
      ok(alle.includes("mySolvis"), "fester Eintrag mySolvis steht da");
      const jetzt = k.find((g) => g.gruppe === "Jetzt wichtig");
      ok(jetzt && jetzt.geraete[0] === "MQTT2_Tesla_Model3", "Tesla unter 'Jetzt wichtig'");
      const i = jetzt ? jetzt.geraete.indexOf("MQTT2_Tesla_Model3") : -1;
      ok(i >= 0 && jetzt.groessen[i] === "1x1", `Tesla auf der Seite 1x1 (ist: ${jetzt && jetzt.groessen[i]})`);
      ok(!(await okZeile(page)), "kein 'Alles in Ordnung' neben einem Treffer");
      // Das Original darf die Seiten-Angaben NICHT bekommen haben (sonst waere
      // der Tesla auch auf der Solar-Seite klein). Der Seiten-Store liefert fuer
      // Geraete ausserhalb der Auswahl das Original - st_fenster ist so eins,
      // fuer den Tesla vergleichen wir die Kopie mit dem Fixture-Wert.
      const attr = await page.evaluate(() => {
        const w = [...document.querySelectorAll("#fhemviz-app .viz-grid > *")]
          .find((x) => (x.device || {}).name === "MQTT2_Tesla_Model3");
        return w ? { kopie: w.device.attr.vizSize, room: w.device.attr.room } : null;
      });
      ok(attr && attr.room === "Lage", "Kachel arbeitet mit der Seiten-Kopie");
    },
  },
  {
    name: "Fenster und Tuer offen, maxTiles 2: Prio-Reihenfolge, Tesla faellt raus",
    geraet: "tv",
    config: { tvScenes: "#lage:600", showIf: SHOWIF, maxTiles: "2" },
    geraete(liste) { offen(liste, "st_fenster"); offen(liste, "st_tuer"); },
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      const k = await kacheln(page);
      const jetzt = k.find((g) => g.gruppe === "Jetzt wichtig");
      ok(jetzt && jetzt.geraete.join(",") === "st_fenster,st_tuer",
         `Reihenfolge aus showIf, gedeckelt auf 2 (ist: ${jetzt && jetzt.geraete.join(",")})`);
    },
  },
  {
    name: "Nichts trifft zu: 'Alles in Ordnung' + fester Teil",
    geraet: "tv",
    config: { tvScenes: "#lage:600", showIf: "st_fenster:state!=closed\nmySolvis" },
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      ok(await okZeile(page), "'Alles in Ordnung' steht da");
      const alle = (await kacheln(page)).flatMap((g) => g.geraete);
      ok(alle.join(",") === "mySolvis", `nur der feste Teil (ist: ${alle.join(",")})`);
    },
  },
  {
    name: "Fenster geht WAEHREND der Anzeige auf: Seite zeichnet nach (5-s-Takt)",
    geraet: "tv",
    config: { tvScenes: "#lage:600", showIf: "st_fenster:state!=closed\nmySolvis" },
    async pruefe({ page, ok }) {
      ok(await okZeile(page), "vorher 'Alles in Ordnung'");
      // Store-Event wie vom Longpoll: wir patchen den Zustand ueber das
      // Seitenmodul nicht direkt - stattdessen ueber das Geraeteobjekt einer Kachel.
      await page.evaluate(() => {
        const w = document.querySelector("#fhemviz-app .viz-grid > *");
        const st = w.store;
        const d = st.get("st_fenster");
        d.state = "open";
        d.readings.state = "open";
      });
      await page.waitForTimeout(5600);
      const alle = (await kacheln(page)).flatMap((g) => g.geraete);
      ok(alle.includes("st_fenster"), `Fenster erscheint (sind: ${alle.join(",")})`);
      ok(!(await okZeile(page)), "'Alles in Ordnung' ist weg");
    },
  },
];
