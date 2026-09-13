// Miniserver für den Widget-Test. Liefert www/fhemviz/ aus, dazu die Ladeseite
// probe.html und die Gerätedaten unter /fixture.json.
//
// Bewusst KEIN Nachbau von FHEMWEB: die Ladeseite instanziiert ein einzelnes
// Widget und setzt ihm device/store/client selbst. Die drei FHEMWEB-Endpunkte
// (config, jsonlist2, Longpoll) bräuchte nur die ganze SPA, und die ist hier
// nicht der Prüfgegenstand.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "www", "fhemviz");
const TYP = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function start(fixtureDatei, port = 0) {
  const server = http.createServer((req, res) => {
    const pfad = req.url.split("?")[0];

    // Das Favicon holt der Browser von sich aus. Ein 404 darauf landet als
    // Konsolenfehler im Ergebnis und sieht aus wie ein Fehler des Widgets.
    if (pfad === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }

    let datei;
    if (pfad === "/probe.html") datei = path.join(__dirname, "probe.html");
    else if (pfad === "/fixture.json") datei = fixtureDatei;
    else datei = path.join(ROOT, pfad);

    // Kein Ausbrechen aus den beiden erlaubten Wurzeln.
    const echt = path.resolve(datei);
    if (!echt.startsWith(path.resolve(ROOT)) && !echt.startsWith(path.resolve(__dirname))) {
      res.writeHead(403);
      return res.end("nope");
    }

    fs.readFile(echt, (err, buf) => {
      if (err) {
        if (process.env.WIDGET_TEST_VERBOSE) console.log("   [404] " + pfad);
        res.writeHead(404);
        return res.end("nicht da: " + pfad);
      }
      res.writeHead(200, { "content-type": TYP[path.extname(echt)] || "text/plain" });
      res.end(buf);
    });
  });

  return new Promise((ok) => {
    server.listen(port, "127.0.0.1", () => ok({ server, port: server.address().port }));
  });
}

module.exports = { start };
