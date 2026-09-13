// Der Pager maß, bevor das Bild da war (v0.37.19).
//
// _page() rechnete die Seiten-Offsets EINMAL, direkt nach dem Zeichnen - da
// ist ein <img> ohne feste Höhe noch 0 px hoch. Kommt das Fahrzeugbild
// (auch aus dem Cache, das ist trotzdem asynchron), rückt alles darunter um
// die Bildhöhe nach unten, und jede Seite begann um dieselben ~127 px zu hoch
// („scrollen tust du nicht genug"). Gemessen: ohne Bild [0, 346, 796, …], mit
// Bild [0, 473, 923, …]. Der alte Code lag AUCH bei 0 ms Verzögerung daneben.
//
// Hier: Szene Solar mit 12 s -> 6 Seiten à 2 s. Das Bild kommt 1,5 s zu spät.
// Das Blättern selbst dauert 1,6 s (_smoothScroll) - gemessen wird deshalb
// erst 1,75 s nach dem Seitenwechsel, kurz vor dem nächsten. Dann muss
// scrollTop auf dem Offset stehen, den die Zeilen JETZT (mit Bild) ergeben.

function fall(verzoegerung) {
  return {
    name: `Fahrzeugbild ${verzoegerung} ms verzögert: Seite 2 und 3 beginnen an einer Kachelzeile`,
    geraet: "tv",
    config: { tvScenes: "Solar:12" },
    verzoegerung: verzoegerung ? { "img/car/": verzoegerung } : {},
    warten: 0,
    async pruefe({ page, ok, h }) {
      const seite = async (n) => {
        // auf den Seitenwechsel in der Kopfzeile warten („Solar · 2/6")
        await page.waitForFunction(
          (n) => new RegExp(`·\\s*${n}/\\d`).test(document.getElementById("viz-scene").textContent),
          n, { timeout: 15000 });
        await page.waitForTimeout(1750);
        const top = await page.evaluate(() => Math.round(document.getElementById("fhemviz-app").scrollTop));
        const label = (await page.evaluate(() => document.getElementById("viz-scene").textContent)).trim();
        const soll = await h.seitenOffsets();
        return { top, label, soll };
      };
      const p2 = await seite(2);
      ok(p2.soll.length >= 3, `die Szene hat mehrere Seiten (${p2.soll.length}: ${p2.soll.join(", ")})`);
      ok(p2.top === p2.soll[1], `„${p2.label}": scrollTop ${p2.top} = Offset der zweiten Zeile ${p2.soll[1]}`);
      const p3 = await seite(3);
      ok(p3.top === p3.soll[2], `„${p3.label}": scrollTop ${p3.top} = Offset der dritten Zeile ${p3.soll[2]}`);
    },
  };
}

module.exports = [fall(0), fall(1500)];
