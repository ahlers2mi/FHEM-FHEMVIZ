// FHEMWEB-Attrappe für den Seitentest: genug FHEMWEB, damit die GANZE SPA
// läuft - Kopfzeile, Raster, Auto-Paging, Snap, Longpoll.
//
// Bedient genau die drei Endpunkte, die die SPA braucht:
//   /fhem?cmd=get <viz> config     Konfigurations-JSON (attr des FHEMVIZ-Geräts)
//   /fhem?cmd=jsonlist2 <devspec>  {Results:[{Name,Internals,Attributes,PossibleSets,Readings}]}
//   /fhem?XHR=1&inform=...         Longpoll - Antwort bleibt offen, wird nie beendet
// dazu www/fhemviz/ unter /fhem/fhemviz/, einen Platzhalter für FHEM-Icons
// und /fhem selbst als kleine Seite (Ziel des Titel-Links).
//
// Alle anderen ?cmd= (set ...) landen in `befehle`, damit ein Fall prüfen kann,
// was die Oberfläche abgeschickt hätte.
//
// `verzoegerung` verzögert Dateien, deren Pfad auf ein Muster passt, um ms:
//   { "img/car/": 1500 }  - das Fahrzeugbild kommt 1,5 s später (Pager-Fall).
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "www", "fhemviz");
const TYP = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

// Platzhalter für /fhem/icons/*: Sonne und Wolke, in der Größe egal. Die
// echten FHEM-Icons liegen nicht im Repo, und die Kopfhöhe hängt am Bild
// (attr headerInfo icon=...:10rem) - ein 404 wäre 0 px hoch.
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<circle cx="40" cy="26" r="14" fill="#f5b400"/>' +
  '<ellipse cx="26" cy="42" rx="20" ry="11" fill="#d8dde5"/></svg>';

function start({ config, geraete, verzoegerung = {}, port = 0 }) {
  const befehle = [];
  const offen = new Set();

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const p = u.pathname;

    if (p === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }
    if (p.startsWith("/fhem/icons/")) {
      res.writeHead(200, { "content-type": "image/svg+xml" });
      return res.end(ICON);
    }
    if (p.startsWith("/fhem/fhemviz/")) {
      const rel = p.slice("/fhem/fhemviz/".length) || "index.html";
      const datei = path.resolve(ROOT, rel);
      if (!datei.startsWith(path.resolve(ROOT))) {
        res.writeHead(403);
        return res.end("nope");
      }
      fs.readFile(datei, (err, buf) => {
        if (err) {
          if (process.env.SEITE_TEST_VERBOSE) console.log("   [404] " + p);
          res.writeHead(404);
          return res.end("nicht da: " + p);
        }
        const send = () => {
          res.writeHead(200, { "content-type": TYP[path.extname(datei)] || "text/plain" });
          res.end(buf);
        };
        const treffer = Object.entries(verzoegerung).find(([muster]) => new RegExp(muster).test(rel));
        if (treffer) setTimeout(send, treffer[1]);
        else send();
      });
      return;
    }
    if (p === "/fhem" || p === "/fhem/") {
      const cmd = u.searchParams.get("cmd") || "";
      if (u.searchParams.has("inform")) {
        // Longpoll: Kopf schicken, Antwort offen lassen. Beendet man sie,
        // verbindet der Client sofort neu und die Kopfzeile flackert.
        res.writeHead(200, { "content-type": "text/plain" });
        offen.add(res);
        res.on("close", () => offen.delete(res));
        return;
      }
      if (!cmd) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end("<title>FHEMWEB</title><p>FHEMWEB-Startseite (Attrappe)</p>");
      }
      const H = { "content-type": "application/json; charset=utf-8" };
      if (/^get \S+ config$/.test(cmd)) {
        res.writeHead(200, H);
        return res.end(JSON.stringify(config));
      }
      if (/^jsonlist2/.test(cmd)) {
        res.writeHead(200, H);
        return res.end(JSON.stringify({ Results: geraete }));
      }
      befehle.push(cmd);
      res.writeHead(200, H);
      return res.end("{}");
    }
    res.writeHead(404);
    res.end("nicht da: " + p);
  });

  return new Promise((ok) => {
    server.listen(port, "127.0.0.1", () =>
      ok({
        server,
        port: server.address().port,
        befehle,
        close() {
          for (const r of offen) r.destroy();
          server.close();
        },
      })
    );
  });
}

module.exports = { start, ROOT };
