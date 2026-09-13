// Der Titel „FHEMVIZ ↗" ist der Absprung nach FHEMWEB (v0.37.24).
//
// Drei Dinge, die schiefgehen könnten: das Ziel stimmt nicht (der Link zeigt
// auf ../ statt auf die erkannte Basis), der Link kostet Kopfhöhe (eine
// eigene Pille hätte auf Tablet und Handy eine Zeile gekostet), und im
// TV-Modus wirft ein Tipp auf die Kopfzeile den Wandschirm nach FHEMWEB,
// statt über tvTouch in die Tablet-Ansicht zu wechseln.

// Kopfhöhen ohne den Link, gemessen mit git stash (A/B) - der Link darf
// daran nichts ändern.
const KOPF = { tablet: 90, handy: 142 };

async function link(page) {
  return page.evaluate(() => {
    const a = document.getElementById("viz-home");
    if (!a) return null;
    const cs = getComputedStyle(a), af = getComputedStyle(a, "::after");
    return {
      href: a.getAttribute("href"), text: a.textContent,
      pointer: cs.pointerEvents, pfeil: af.content,
      farbeGleich: cs.color === getComputedStyle(document.getElementById("viz-title")).color,
    };
  });
}

function bedienbar(geraet) {
  return {
    name: "Titel zeigt auf die FHEMWEB-Basis, kostet keine Kopfhöhe, Tipp navigiert",
    geraet,
    async pruefe({ page, ok, h }) {
      const l = await link(page);
      ok(l, "der Link #viz-home ist da");
      if (!l) return;
      ok(l.href === "/fhem", `Ziel ist die erkannte Basis (ist: ${l.href})`);
      ok(l.text === "FHEMVIZ", `Titeltext unverändert (ist: ${l.text})`);
      ok(l.farbeGleich, "Link erbt die Titelfarbe");
      ok(l.pfeil.includes("↗"), `Pfeil in Akzentfarbe angehängt (ist: ${l.pfeil})`);
      const k = await h.kopf();
      ok(k.echt === KOPF[geraet], `Kopfhöhe ${k.echt} px = ohne Link ${KOPF[geraet]} px`);
      await page.click("#viz-home");
      await page.waitForLoadState("load");
      ok(new URL(page.url()).pathname === "/fhem", `Tipp auf den Titel landet auf /fhem (ist: ${page.url()})`);
    },
  };
}

module.exports = [
  bedienbar("tablet"),
  bedienbar("handy"),
  {
    name: "TV: Link aus, kein Pfeil - nach dem tvTouch-Wechsel lebt er",
    geraet: "tv",
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      const l = await link(page);
      ok(l && l.href === "/fhem", "Ziel auch im TV gesetzt");
      ok(l && l.pointer === "none", `nicht tippbar (pointer-events: ${l && l.pointer})`);
      ok(l && l.pfeil === "none", `kein Pfeil (::after: ${l && l.pfeil})`);
      // tvTouch schaltet data-vizmode auf "tablet" - der Link muss dann da sein.
      await page.evaluate(() => { document.documentElement.dataset.vizmode = "tablet"; });
      const n = await link(page);
      ok(n.pointer !== "none" && n.pfeil !== "none", `nach dem Wechsel tippbar, Pfeil da (${n.pfeil})`);
    },
  },
];
