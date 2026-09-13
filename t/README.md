# Tests

Drei Dinge lassen sich hier ohne laufendes FHEM prüfen: die Attributliste, die
das Modul in FHEMWEB hinterlässt, wie eine Kachel im echten Browser aussieht,
und wie sich die **ganze Seite** verhält — Kopfzeile, Snap, Auto-Paging,
Hero-Band — gegen eine kleine FHEMWEB-Attrappe (`seite/`).

```
perl t/userattr.pl          Attributliste
node t/widget/run.js        eine Kachel allein
node t/seite/run.js         die ganze SPA
```

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

## `seite/run.js` — die ganze SPA gegen eine FHEMWEB-Attrappe

```
node t/seite/run.js                  alle Fälle
node t/seite/run.js pager            nur eine Falldatei (cases/pager.js)
node t/seite/run.js pager 0          nur der erste Fall, plus Screenshot
```

**Warum ein zweiter Rahmen:** der Widget-Test lädt eine Kachel allein. Alles,
was aus dem Zusammenspiel entsteht, sieht er nicht — und genau dort lagen die
Fehler der letzten Runden: die Kopfzeile war 138 px hoch statt 40 (headerInfo
und statusBar), der Pager maß die Seiten, bevor das Fahrzeugbild da war, die
Event-Übernahme verdunkelte die Seite über ein Pseudo-Element, das schon die
Hintergrund-Abdunklung trug, und beim ersten Lauf dieses Rahmens rastete auf
dem Handy über dem ganzen Hero-Band nichts ein (v0.37.26).

`seite/server.js` ist die Attrappe: die drei Endpunkte, die die SPA braucht
(`get <viz> config`, `jsonlist2`, Longpoll offen halten), `www/fhemviz/` unter
`/fhem/fhemviz/`, ein Platzhalter für FHEM-Icons, `/fhem` selbst als Seite
(Ziel des Titel-Links). `set`-Befehle landen in `server.befehle`. Mit
`verzoegerung: { "img/car/": 1500 }` kommt eine Datei später — so stellt der
Pager-Fall das nachgeladene Bild nach.

### Drei Geräte-Profile

| Profil | Fenster | URL | wofür |
|---|---|---|---|
| `tablet` | 1000×640 | `?skin=bento` | Wandtablet in der bedienbaren Ansicht |
| `handy` | 412×915, `isMobile`, Android-UA | `?skin=zeilen&zoom=0.9` | Snap, Kopfhöhe, Zeilenliste |
| `tv` | 1280×800 | `?mode=tv&width=1000` | Auto-Paging, Hero-Deckel, Event-Rahmen |

Ohne `isMobile: true` ignoriert Desktop-Chromium den Meta-Viewport — ein
Fehler, der an `innerWidth` hängt, wäre unsichtbar. Im TV-Profil steht die
Szenenliste auf `Solar:600`, damit nichts mitten in der Messung rotiert; die
echte Liste beginnt mit der Uhr-Seite, die die Kopfzeile ausblendet.

### Gerätedaten und Sicht

`seite/fixtures/solar.json` sind die Geräte des Raums Solar plus alles, was
die Kopfzeile braucht (Wetterstation, Shunt, Pool, Fenster/Türen,
Wetter-Dummy, Wettersymbol) — ein Auszug aus `FHEM-Instanz`, gebaut mit
`seite/extrakt.py`:

```
python3 t/seite/extrakt.py --cfg <fhem.cfg> --save <fhem.save> \
    --out t/seite/fixtures/solar.json  mySolvis MQTT2_Tesla_Model3 ...
```

Das Skript lässt weg, was nicht in ein öffentliches Repo gehört: Koordinaten,
Adressen im Netz, WLAN-Kennungen, Schlüssel, Rohtelegramme, Zugangsdaten in
der DEF (nur `structure` und `weblink` behalten ihre DEF). Wer die Fixture
erneuert, sollte trotzdem einmal hineinschauen.

`seite/fixtures/myViz.json` sind die Sicht-Attribute des echten `myViz`
(`headerInfo`, `statusBar`, `background`, `hideRooms` …). **Ohne die misst man
ein Dashboard, das es beim Nutzer nicht gibt** — die Kopfzeile wäre 40 px hoch
statt 138. Die Version füllt `geraete.js` aus `app.js`, sonst meldet die
Statuszeile einen Versionskonflikt.

Beim Laden werden alle Reading-Zeitstempel so verschoben, dass der jüngste
auf „jetzt" liegt; die Abstände bleiben. Absolute Zeiten in einer Fixture
veralten — „zuletzt gegossen vor 40 Std." wäre nächste Woche „vor 8 Tagen".
Und alles außerhalb von `FHEMVIZ->Solar` bekommt `FHEMVIZ->Stuff`: es bleibt
für Kopfzeile und Statusleiste auflösbar, bekommt aber keine Kachel.

### Einen Fall dazuschreiben

Die Fälle stehen in `seite/cases/<thema>.js`:

```js
{
  name: "Fahrzeugbild 1500 ms verzögert: Seite 2 beginnt an einer Kachelzeile",
  geraet: "tv",                          // tablet (Standard) | handy | tv
  config: { tvScenes: "Solar:12" },      // überschreibt fixtures/myViz.json
  verzoegerung: { "img/car/": 1500 },    // Dateien später ausliefern
  warten: 0,                             // ms nach load (Standard 2500)
  async pruefe({ page, ok, h, server }) {
    ok(bedingung, "was gemessen wurde");
  },
}
```

`h` bringt drei Helfer mit: `h.timerStoppen()` hält Karussell und Auto-Paging
an (sonst scrollt der Timer gegen die Messung), `h.kopf()` liefert
`--viz-header-h` gegen die gemessene Kopfhöhe, `h.seitenOffsets()` rechnet die
Seiten wie `computePageOffsets` in `app.js`. Zwei Zusicherungen laufen bei
jedem Fall automatisch mit: leere Konsole (der 404 auf die optionalen
Custom-Widgets zählt nicht) und kein Versionskonflikt in der Statuszeile.

**Ein neuer Fall muss gegen die kaputte Fassung rot werden.** Beim Snap-Fall
waren das ohne die Regel für das Hero-Band 10 von 21 Zusicherungen
(`git stash push www/fhemviz/css/fhemviz.css www/fhemviz/js/layout.js && node
t/seite/run.js kopfzeile; git stash pop`).

### Die Fälle

| Datei | prüft | Anlass |
|---|---|---|
| `titel-link` | Ziel `/fhem`, keine Kopfhöhe, Tipp navigiert; im TV aus, nach `tvTouch` an | v0.37.24 |
| `kopfzeile` | `--viz-header-h` = echte Höhe; drei Wische à 300 px rasten unter der Kopfkante, Überschrift nicht verdeckt; TV-Kopf ~138 px | v0.37.20/21/26 |
| `pager` | mit und ohne verzögertem Fahrzeugbild steht `scrollTop` auf dem Offset der Kachelzeile | v0.37.19 |
| `event` | `viz-alert`: Rahmen am `html::after`, Abdunklung bleibt hinten, Kachel gleich hell (Pixelmittel per Canvas) | v0.37.19 |
| `hero` | keine Band-Kachel höher als ihr Inhalt; im TV keine höher als `--viz-vh − Kopf − Rand` | v0.37.16/17 |

`SEITE_TEST_VERBOSE=1` protokolliert Dateien, die der Server nicht findet.
