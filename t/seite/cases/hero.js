// Eine ausreißende Kachel zieht die Nachbarin mit (v0.37.16/17).
//
// Jedes Widget bringt :host { height: 100% } mit, und eine Prozenthöhe an
// einem Grid-Element rechnet gegen die ZEILE - die ist so hoch wie die höchste
// Kachel darin. Im Raum Solar war die Auto-Kachel 534 px hoch, mySolvis
// brauchte 300 und bekam trotzdem 534: 234 px Loch unter dem letzten Wert
// („wenn eine Kachel ausreißt, passt das ganze Bild nicht mehr").
//
// Und im TV darf keine Hero-Kachel höher werden als die Seite hergibt:
// --viz-vh − --viz-header-h − --viz-tv-pad-y, gegen die GEMESSENE Kopfhöhe
// (138 px mit headerInfo und statusBar, nicht 40). Die Auto-Kachel schrumpft
// dafür ihr Bild; ohne Deckel verschwand die Wallbox-Zeile unter der
// Seitenkante.
//
// Messrezept: je Kachel die natürliche Höhe (align-items start, height auto)
// gegen die Endhöhe stellen - die Differenz ist das Loch.

async function band(page) {
  return page.evaluate(() => {
    const b = document.querySelector(".viz-hero:not(.full)");
    if (!b) return null;
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => parseFloat(cs.getPropertyValue(n)) || 0;
    const deckel = v("--viz-vh") - v("--viz-header-h") - v("--viz-tv-pad-y");
    const kacheln = [...b.children].map((t) => {
      const ist = t.offsetHeight;                       // CSS-Pixel, nicht skaliert
      const alt = t.style.height, altAlign = b.style.alignItems;
      b.style.alignItems = "start"; t.style.height = "auto"; t.style.maxHeight = "none";
      const natur = t.offsetHeight;
      t.style.height = alt; t.style.maxHeight = ""; b.style.alignItems = altAlign;
      const name = (t.shadowRoot && (t.shadowRoot.querySelector(".name,.title,h3") || {}).textContent || t.tagName).trim().slice(0, 20);
      return { name, ist, natur };
    });
    return { deckel: Math.round(deckel), kacheln, tv: document.documentElement.dataset.vizmode === "tv" };
  });
}

function fall(geraet) {
  return {
    name: `Hero-Band Solar [${geraet}]: keine Kachel höher als ihr Inhalt${geraet === "tv" ? ", keine höher als die Seite" : ""}`,
    geraet,
    async pruefe({ page, ok, h }) {
      if (geraet === "tv") await h.timerStoppen();
      // Raum Solar zeigen (Tablet: Tab wählen)
      if (geraet !== "tv") {
        const tab = page.locator(".viz-tab", { hasText: "Solar" });
        if (await tab.count()) { await tab.first().click(); await page.waitForTimeout(800); }
      }
      const b = await band(page);
      ok(b && b.kacheln.length >= 2, `das Band hat mehrere Kacheln (${b ? b.kacheln.length : 0})`);
      if (!b) return;
      for (const k of b.kacheln) {
        const loch = k.ist - k.natur;
        if (geraet === "tv" && k.natur > b.deckel) {
          ok(k.ist <= b.deckel + 1, `${k.name}: braucht ${k.natur}, gedeckelt auf ${k.ist} ≤ Seite ${b.deckel} px`);
        } else {
          ok(loch <= 2, `${k.name}: ${k.ist} px bei ${k.natur} px Inhalt (Loch ${loch} px)`);
        }
      }
    },
  };
}

module.exports = [fall("tv"), fall("tablet")];
