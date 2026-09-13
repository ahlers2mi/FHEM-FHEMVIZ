// Gerätedaten und Sicht-Konfiguration für den Seitentest laden.
//
// Die Fixtures sind Auszüge aus der echten Installation (siehe extrakt.py),
// bereinigt um alles, was nicht ins Repo gehört. Zwei Dinge passieren beim
// Laden, damit ein Fall heute wie in einem Jahr dasselbe misst:
//
// - Reading-Zeitstempel werden VERSCHOBEN: der jüngste liegt auf "jetzt", alle
//   anderen behalten ihren Abstand dazu. Absolute Zeiten in einer Fixture
//   veralten - "zuletzt gegossen vor 40 Std." wäre nächste Woche "vor 8 Tagen"
//   und würde die Zahlenzeile umbauen.
// - Alles, was nicht im Raum FHEMVIZ->Solar liegt, bekommt FHEMVIZ->Stuff: es
//   bleibt für Kopfzeile und Statusleiste auflösbar, bekommt aber keine Kachel.
//   So misst man den EINEN Raum, um den es geht.
const fs = require("fs");
const path = require("path");

const FIXTURES = path.join(__dirname, "fixtures");
const APP = path.join(__dirname, "..", "..", "www", "fhemviz", "js", "app.js");

function stempel(ms) {
  const d = new Date(ms);
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ` +
         `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}
function alsMs(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(s || "");
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : NaN;
}

/** Geräteliste laden; `raum` ist der Raum, der eine Kachel bekommt. */
function geraete(name = "solar", { raum = "FHEMVIZ->Solar" } = {}) {
  const liste = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));

  let juengst = -Infinity;
  for (const g of liste)
    for (const r of Object.values(g.Readings || {})) {
      const t = alsMs(r.Time);
      if (t > juengst) juengst = t;
    }
  const versatz = isFinite(juengst) ? Date.now() - juengst : 0;

  for (const g of liste) {
    for (const r of Object.values(g.Readings || {})) {
      const t = alsMs(r.Time);
      if (!isNaN(t)) r.Time = stempel(t + versatz);
    }
    const room = g.Attributes.room || "";
    g.Attributes.room = room.split(",").includes(raum) ? room : "FHEMVIZ->Stuff";
  }
  return liste;
}

/** Sicht-Konfiguration (Antwort auf `get <viz> config`), Version aus app.js. */
function config(name = "myViz", ueberschreiben = {}) {
  const cfg = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));
  if (!cfg.version) {
    const m = /SPA_VERSION = "([^"]+)"/.exec(fs.readFileSync(APP, "utf8"));
    cfg.version = m ? m[1] : "";
  }
  return { ...cfg, ...ueberschreiben };
}

module.exports = { geraete, config, FIXTURES };
