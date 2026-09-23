// Fälle für die Solvis-Kachel. Anlass (23.09.2026): die Zeile "Ertrag" zeigte
// den Gesamtzähler der Anlage (48947 kWh seit Inbetriebnahme) statt des
// Tagesertrags. `r.reihen` sind die Zeilen [{ k, v }] der Kachel.

const zeile = (r, k) => r.reihen.find((z) => z.k === k);

module.exports = [
  {
    name: "userReading …Today vorhanden: Tagesertrag",
    fixture: "solvis",
    breite: 900,
    readings: {},
    pruefe(r, ok) {
      const z = zeile(r, "Ertrag heute");
      ok(z, "die Zeile heißt Ertrag heute");
      ok(z && z.v === "4kWh", `Wert 4 kWh (ist: ${z && z.v})`);
      ok(!r.reihen.some((x) => /48947/.test(x.v)), "der Gesamtzähler steht nirgends");
    },
  },
  {
    name: "nur statistics, kein userReading: Tageswert aus 'Day:'",
    fixture: "solvis",
    breite: 900,
    readings: { "statSE.Solarertrag_kWhToday": null, "statSE.Solarertrag_kWh": "Hour: 0 Day: 11 Month: 172 Year: 2235" },
    pruefe(r, ok) {
      const z = zeile(r, "Ertrag heute");
      ok(z && z.v === "11kWh", `Wert 11 kWh (ist: ${z && z.v})`);
    },
  },
  {
    name: "ohne Statistik: Gesamtzähler, ehrlich beschriftet",
    fixture: "solvis",
    breite: 900,
    readings: { "statSE.Solarertrag_kWhToday": null, "statSE.Solarertrag_kWh": null },
    pruefe(r, ok) {
      const z = zeile(r, "Ertrag gesamt");
      ok(z && /48947/.test(z.v), `Gesamtzähler als "Ertrag gesamt" (ist: ${z && z.v})`);
    },
  },
  {
    name: "Handy-Breite: nichts ragt quer hinaus",
    fixture: "solvis",
    breite: 400,
    readings: {},
    pruefe(r, ok) {
      ok(zeile(r, "Ertrag heute"), "Ertrag heute steht auch schmal da");
    },
  },
];
