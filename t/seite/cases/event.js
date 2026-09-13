// Zwei Regeln, ein Pseudo-Element: die Seite wurde bei jedem Event dunkler
// (v0.37.19).
//
// Der rote Rahmen einer Event-Übernahme (set <viz> scene <Raum> <sek>) stand
// an body.viz-alert::after, die Abdunklung des Hintergrundbilds an
// body.viz-has-bg::after - DASSELBE Pseudo-Element. Die Ebene behielt
// Hintergrund und opacity 0.45 der Abdunklung, bekam aber den z-index 99 des
// Rahmens und lag damit VOR dem Inhalt. Ohne Hintergrundbild fiel es nie auf,
// darum hat die Fixture eines (attr background).
//
// Seit v0.37.19 hängt der Rahmen an html.viz-alert::after. Geprüft wird
// deshalb: die Abdunklung bleibt hinter dem Inhalt (z-index -1), der Rahmen
// liegt am html-Element davor, und das Bild einer Kachel bleibt gleich hell.

module.exports = [
  {
    name: "Event-Übernahme: Rahmen am html, Abdunklung bleibt hinten, Kachel bleibt gleich hell",
    geraet: "tv",
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      const ebenen = () =>
        page.evaluate(() => {
          const b = getComputedStyle(document.body, "::after");
          const r = getComputedStyle(document.documentElement, "::after");
          return {
            body: { z: b.zIndex, opacity: b.opacity, position: b.position },
            html: { z: r.zIndex, rahmen: r.borderTopWidth, farbe: r.borderTopColor, position: r.position, content: r.content },
          };
        });
      // Helligkeit eines Kachelausschnitts: Mittelwert der Bildpunkte eines
      // 200×150-Screenshots. Playwright liefert PNG; die Rohbytes decodiert
      // der Browser selbst über ein <canvas> - ohne zusätzliche Abhängigkeit.
      const helligkeit = async () => {
        const png = await page.screenshot({ clip: { x: 700, y: 300, width: 200, height: 150 } });
        return page.evaluate(async (b64) => {
          const img = new Image();
          img.src = "data:image/png;base64," + b64;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width; c.height = img.height;
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          let s = 0;
          for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
          return s / (d.length / 4);
        }, png.toString("base64"));
      };

      const vorher = await ebenen();
      ok(vorher.body.z === "-1", `ohne Event: Abdunklung des Hintergrunds liegt hinten (z-index ${vorher.body.z})`);
      const hellVorher = await helligkeit();

      // So setzt forceScene die Übernahme (app.js): Klasse am documentElement.
      await page.evaluate(() => document.documentElement.classList.add("viz-alert"));
      await page.waitForTimeout(300);
      const nachher = await ebenen();
      ok(nachher.html.position === "fixed" && parseFloat(nachher.html.rahmen) >= 2,
         `Rahmen am html::after (${nachher.html.rahmen} ${nachher.html.farbe}, ${nachher.html.position})`);
      ok(nachher.body.z === "-1" && nachher.body.opacity === vorher.body.opacity,
         `Abdunklung unverändert hinten (z-index ${nachher.body.z}, opacity ${nachher.body.opacity})`);
      const hellNachher = await helligkeit();
      ok(Math.abs(hellVorher - hellNachher) < 3,
         `Kachel gleich hell: ${hellVorher.toFixed(1)} → ${hellNachher.toFixed(1)} (v0.37.14: 42,6 → 28,8)`);
    },
  },
];
