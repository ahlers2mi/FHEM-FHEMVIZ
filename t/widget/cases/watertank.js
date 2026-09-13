// Fälle für die Wasservorrat-Kachel.
//
// `readings` überschreibt die Fixture; null löscht einen Schlüssel, ein Wert
// mit "@" davor ist eine relative Minutenangabe ("@-20" = vor 20 Minuten).
//
// `pruefe(r, ok)` bekommt das Ergebnis eines Laufs:
//   r.figs      [{ wert, einheit, label, warn, regen, top }]
//   r.zeilen    Anzahl verschiedener Oberkanten in der Zahlenzeile
//   r.ueberlauf scrollWidth - clientWidth der Karte (muss 0 sein, prüft der Runner)
//   r.hoehe     Höhe der Kachel in px
//
// Der Runner prüft bei JEDEM Fall zusätzlich: keine JS-Fehler, kein Überlauf
// quer. Die beiden müssen hier nicht wiederholt werden.

const label = (r, text) => r.figs.find((f) => f.label === text);

module.exports = [
  {
    name: "Störfall 13.09.: gegossen, aber seit 40 h kein Lauf zu Ende",
    breite: 420,
    readings: {
      barrelLevel_l: 12, ibcLevel_l: 0, harvest_today_l: "278.9",
      watered_today_l: 397, rainAmount_mm: "7.1", soilMoisture: 20,
      lastWaterFlow: "@-20", lastWatering: "@-2460", lastCircuitWatering: "@-2460",
    },
    pruefe(r, ok) {
      ok(label(r, "zuletzt gegossen"), "die Zeit seit dem letzten Fluss steht da");
      const fertig = label(r, "zuletzt fertig");
      ok(fertig, "der letzte Abschluss bekommt eine eigene Zahl");
      ok(fertig && fertig.warn, "und zwar in Warnfarbe");
      ok(r.figs.length === 7, `sieben Zahlen (sind: ${r.figs.length})`);
    },
  },
  {
    name: "Normalbetrieb: Lauf lief durch, keine zweite Zahl",
    breite: 420,
    readings: {
      barrelLevel_l: 120, watered_today_l: 397,
      lastWaterFlow: "@-20", lastWatering: "@-30", lastCircuitWatering: "@-30",
    },
    pruefe(r, ok) {
      ok(label(r, "zuletzt gegossen"), "zuletzt gegossen steht da");
      ok(!label(r, "zuletzt fertig"), "kein Hinweis, wenn nichts hängt");
    },
  },
  {
    name: "Altes Modul ohne lastWaterFlow: Verhalten wie bisher",
    breite: 420,
    readings: {
      lastWaterFlow: null, lastWatering: "@-2460", lastCircuitWatering: "@-2460",
    },
    pruefe(r, ok) {
      const l = label(r, "zuletzt gegossen");
      ok(l, "die alten beiden Zeitpunkte tragen die Zahl weiter");
      ok(l && l.einheit === "Std.", `als Stundenangabe (ist: ${l && l.einheit})`);
      ok(!label(r, "zuletzt fertig"), "ohne das neue Reading kein Vergleich");
    },
  },
  {
    name: "Zeitstempel in der Zukunft: keine Zahl steht allein",
    breite: 420,
    readings: {
      // Uhr des Tablets gegen die des Servers. Die Altersrechnung liefert dann
      // nichts - und ohne ihren Bezug wäre "zuletzt fertig" eine Antwort auf
      // die Frage, die gerade nicht beantwortet wird.
      lastWaterFlow: "@5", lastWatering: "@-2460", lastCircuitWatering: "@-2460",
    },
    pruefe(r, ok) {
      ok(!label(r, "zuletzt gegossen"), "die Altersrechnung liefert nichts");
      ok(!label(r, "zuletzt fertig"), "dann bleibt auch die zweite Zahl weg");
    },
  },
  {
    name: "Handybreite 400 px",
    breite: 400,
    readings: {
      barrelLevel_l: 12, harvest_today_l: "278.9", watered_today_l: 397,
      lastWaterFlow: "@-20", lastWatering: "@-2460", lastCircuitWatering: "@-2460",
    },
    pruefe(r, ok) {
      ok(r.figs.length === 7, `sieben Zahlen passen (sind: ${r.figs.length})`);
      ok(r.zeilen <= 2, `höchstens zwei Zeilen (sind: ${r.zeilen})`);
    },
  },
  {
    name: "Schmal 320 px",
    breite: 320,
    readings: {
      barrelLevel_l: 12, harvest_today_l: "278.9", watered_today_l: 397,
      lastWaterFlow: "@-20", lastWatering: "@-2460", lastCircuitWatering: "@-2460",
    },
    pruefe(r, ok) {
      ok(r.figs.length === 7, `sieben Zahlen auch hier (sind: ${r.figs.length})`);
      ok(r.hoehe > 200, `die Kachel bleibt lesbar hoch (ist: ${r.hoehe} px)`);
    },
  },
];
