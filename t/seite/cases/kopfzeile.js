// Kopfhöhe ist Zustand, kein Startwert (v0.37.20/21) - und Snap im Hero-Band
// (v0.37.26).
//
// scroll-padding-top für das Einrasten hängt an --viz-header-h. Die Kopfzeile
// wächst aber NACH dem Start: headerInfo- und statusBar-Chips kommen erst mit
// den Gerätedaten, auf dem Handy rutscht die Uhr in eine eigene Zeile. Stand
// die Variable auf dem Startwert (115), während der Kopf echt 142 px hoch
// war, rasteten die Kacheln 19 px unter der Kopfkante ein. Beim zweiten
// Anlauf stand die Kachel richtig, aber die Gruppenüberschrift darüber lag
// unter der Kopfzeile („ALLGEMEIN" halb verdeckt). Und beim ersten Lauf
// dieses Falls rastete über dem Hero-Band gar nichts - die Regel kannte nur
// .viz-grid > *.
//
// Messrezept: Variable gegen offsetHeight, dann mouse.wheel, 900 ms ausrollen
// lassen, erste Kachel unter der Kopfkante gegen header.bottom messen - und
// die Überschrift darüber (h3 der Gruppe, h2 des Raums beim Band) gleich mit.

async function snap(page, dy) {
  await page.mouse.move(200, 600);
  await page.mouse.wheel(0, dy);
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const hb = document.getElementById("viz-header").getBoundingClientRect().bottom;
    const kacheln = [...document.querySelectorAll(".viz-grid > *, .viz-hero > *")]
      .map((t) => ({ t, r: t.getBoundingClientRect() })).filter((x) => x.r.height > 0);
    const erste = kacheln.filter((x) => x.r.bottom > hb + 4).sort((a, b) => a.r.top - b.r.top)[0];
    const angeschnitten = kacheln.filter((x) => x.r.top < hb - 2 && x.r.bottom > hb + 2).length;
    // Überschrift, die zu dieser Kachel gehört: Gruppen-h3 vor dem Raster,
    // Raum-h2 vor dem Hero-Band - nur wenn die Kachel die erste darin ist.
    let kopf = null;
    if (erste && erste.t === erste.t.parentElement.firstElementChild) {
      const h = erste.t.parentElement.previousElementSibling;
      if (h && /^H[23]$/.test(h.tagName)) {
        const r = h.getBoundingClientRect();
        kopf = { tag: h.tagName, text: h.textContent.trim().slice(0, 14), oben: Math.round(r.top), verdeckt: Math.max(0, Math.round(hb - r.top)) };
      }
    }
    return {
      kopfUnten: Math.round(hb),
      luecke: erste ? Math.round(erste.r.top - hb) : null,
      angeschnitten, kopf,
      snapAlign: erste ? getComputedStyle(erste.t).scrollSnapAlign : null,
    };
  });
}

module.exports = [
  {
    name: "Handy: --viz-header-h folgt der echten Kopfhöhe, jeder Wisch rastet unter der Kopfkante ein",
    geraet: "handy",
    async pruefe({ page, ok, h }) {
      const k = await h.kopf();
      ok(Math.abs(k.variable - k.echt) <= 1, `--viz-header-h ${k.variable} = Kopfzeile ${k.echt} px`);
      ok(k.echt > 100, `die Kopfzeile hat headerInfo und statusBar (${k.echt} px, nackt wären ~60)`);
      // Drei Wische à 300 px wie im Messrezept. "proximity" rastet nur beim
      // Ausrollen in der Nähe eines Rastpunkts - ein 600-px-Wisch, der 200 px
      // neben der nächsten Kachelkante endet, bleibt absichtlich liegen.
      for (const dy of [300, 300, 300]) {
        const s = await snap(page, dy);
        ok(s.snapAlign === "start", `wheel ${dy}: die oberste Kachel ist Rastpunkt (scroll-snap-align: ${s.snapAlign})`);
        ok(s.angeschnitten === 0, `wheel ${dy}: keine Kachel unter der Kopfkante angeschnitten (${s.angeschnitten})`);
        if (s.kopf) {
          ok(s.kopf.verdeckt === 0, `wheel ${dy}: Überschrift „${s.kopf.text}" (${s.kopf.tag}) nicht verdeckt (${s.kopf.verdeckt} px)`);
          ok(s.kopf.oben - s.kopfUnten >= 0 && s.kopf.oben - s.kopfUnten <= 24,
             `wheel ${dy}: Überschrift sitzt knapp unter dem Kopf (${s.kopf.oben - s.kopfUnten} px)`);
        } else if (s.luecke !== null) {
          ok(s.luecke >= 0 && s.luecke <= 24, `wheel ${dy}: erste Kachel ${s.luecke} px unter dem Kopf (0–24 erwartet)`);
        }
      }
    },
  },
  {
    name: "Tablet: Variable und Kopfhöhe stimmen überein",
    geraet: "tablet",
    async pruefe({ ok, h }) {
      const k = await h.kopf();
      ok(Math.abs(k.variable - k.echt) <= 1, `--viz-header-h ${k.variable} = Kopfzeile ${k.echt} px`);
    },
  },
  {
    name: "TV: Kopfzeile mit echten Sicht-Attributen ist ~138 px, nicht 40",
    geraet: "tv",
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      const k = await h.kopf();
      ok(k.echt >= 120 && k.echt <= 160, `Kopfzeile ${k.echt} px (headerInfo + statusBar, gemessen 138)`);
      const app = await page.evaluate(() => {
        const a = document.getElementById("fhemviz-app");
        return { vh: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--viz-vh")), h: a.clientHeight };
      });
      ok(Math.abs(app.vh - k.echt - app.h) <= 2, `TV-Fläche = --viz-vh ${app.vh} − Kopf ${k.echt} = ${app.h} px`);
    },
  },
];
