# Tests

Zwei Dinge lassen sich hier ohne laufendes FHEM prüfen: die Attributliste, die
das Modul in FHEMWEB hinterlässt, und wie eine Kachel im echten Browser aussieht.

## `userattr.pl` — die viz-Attribute stehen genau einmal in der userattr

```
perl t/userattr.pl
```

`addToDevAttrList` vergleicht ganze Zeichenketten. Ändert sich die Werteliste
eines Attributs, bleibt die alte Fassung daneben stehen, und FHEMWEB zeigt im
Dropdown den **ersten** Treffer. In einer gewachsenen Installation hatten sich
so 21 Fassungen von `vizWidget` angesammelt.

## `widget/run.js` — Kacheln im echten Browser messen

```
node t/widget/run.js                  alle Fälle
node t/widget/run.js watertank        nur ein Widget
node t/widget/run.js watertank 0      nur der erste Fall, plus Screenshot
```

**Warum überhaupt:** Layout lässt sich am Code nicht beurteilen. Zweimal ist
genau das schiefgegangen (`vizHero full` ragte über den Schirm, obwohl die
CSS-Regel richtig aussah; `auto-fill` legte auf der Vollbild-Kachel 25 Spuren
an). Und beim ersten Lauf dieses Rahmens fiel ein Fehler auf, den das Lesen
nicht gefunden hätte: bei einem Zeitstempel in der Zukunft stand die Warnzahl
der `watertank`-Kachel ohne ihren Bezug da.

**Was er prüft — und was nicht.** Der Rahmen lädt **ein einzelnes Widget** und
setzt ihm `device` von Hand. Er baut *nicht* die SPA nach: kein Raster, kein
Auto-Paging, keine Kopfzeile, kein Longpoll. Für alles, was aus dem
Zusammenspiel entsteht — Seitenumbrüche, Snap, Kopfhöhe —, braucht es weiterhin
eine vollständige FHEMWEB-Attrappe; wie die aussieht, steht in `CLAUDE.md`
unter „Änderungen wirklich prüfen".

**Gemessen wird, nicht geschaut.** Jeder Fall liefert:

| | |
|---|---|
| `figs` | die Kennzahlen der Zeile: Wert, Einheit, Beschriftung, Warn-/Regenfarbe, Oberkante |
| `zeilen` | wie viele Zeilen die Kennzahlen brauchen |
| `ueberlauf` | `scrollWidth − clientWidth` der Karte |
| `hoehe` | Höhe der Kachel in px |

Zwei Zusicherungen laufen bei **jedem** Fall automatisch mit und müssen in den
Falldateien nicht wiederholt werden: die Konsole bleibt leer, und nichts ragt
quer hinaus.

### Einen Fall dazuschreiben

Die Fälle stehen je Widget in `widget/cases/<widget>.js`:

```js
{
  name: "Störfall: gegossen, aber kein Lauf fertig",
  breite: 420,                       // Standard 420; 320 und 400 sind die engen Fälle
  size: "2x2",                       // data-size; hero: "full" für die Vollbild-Kachel
  readings: { watered_today_l: 397, lastWaterFlow: "@-20", lastWatering: null },
  pruefe(r, ok) {
    ok(r.figs.length === 7, `sieben Zahlen (sind: ${r.figs.length})`);
  },
}
```

`readings` überschreibt die Gerätedaten: `null` löscht einen Schlüssel, und ein
Wert mit `@` davor ist eine **relative Minutenangabe** (`"@-20"` = vor zwanzig
Minuten). Absolute Zeitstempel taugen in einem Test nicht — ein Zeitpunkt von
heute liegt morgen einen Tag zurück, und einer, der vor der Rechneruhr liegt,
kippt jede Altersrechnung.

**Ein neuer Fall muss gegen die kaputte Fassung rot werden.** Gegenprobe:

```
git stash && node t/widget/run.js ; git stash pop
```

Bei v0.37.25 waren das 6 von 27 Zusicherungen; die übrigen 21 sichern
erhaltenes Verhalten ab und sind auf beiden Fassungen grün.

### Gerätedaten

`widget/fixtures/bewaesserung.json` ist ein Auszug aus dem echten `bewaesserung`
in `FHEM-Instanz` — nur die Schlüssel, die die Kachel liest, keine Zugangsdaten.
Bewusst eine Kopie im Repo und kein Zugriff auf das andere Repo: sonst hinge der
Test daran, dass beides nebeneinander ausgecheckt ist.

Für ein anderes Widget eine zweite Datei danebenlegen und im Fall
`fixture: "<name>"` setzen.

### Voraussetzungen

Playwright und ein Chromium:

```
npm install playwright
npx playwright install chromium
```

Liegt der Browser woanders (in der Entwicklungsumgebung unter
`/opt/pw-browsers`), findet `run.js` ihn selbst; sonst `PW_CHROMIUM=<pfad>`
setzen. Fehlt eines von beidem, endet der Lauf mit Exitcode 2 und sagt, was
fehlt — er meldet nicht fälschlich „grün".

`WIDGET_TEST_VERBOSE=1` protokolliert Dateien, die der Server nicht findet.
