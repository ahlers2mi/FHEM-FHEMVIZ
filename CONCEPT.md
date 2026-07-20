# Konzept + Grundgerüst: Moderne FHEM-Visualisierung („FHEM-Standard-first")

> **Aktueller Stand:** Das Konzept ist erarbeitet; umgesetzt ist bisher das
> **Grundgerüst** (Struktur + Platzhalter, keine Funktionslogik). Dieses
> Dokument bleibt als **Architekturreferenz** erhalten.

## Kontext

FHEM bringt mit `floorplan` und dem Dashboard-Modul zwar eigene Oberflächen
mit, die aber statisch sind: feste Pixel-Positionen, kaum responsiv, veraltete
Optik. Populäre Alternativen wie FTUI sind modern und live, verlagern die
Konfiguration aber in HTML-Templates bzw. `data-*`-Attribute außerhalb von
FHEM — die Gerätedefinition und ihre Attribute sind dann nicht mehr die
„Single Source of Truth".

**Ziel:** eine moderne, responsive Visualisierung, deren Konfiguration
vollständig im FHEM-Standard liegt (Attribute am Gerät), die sich ohne Polling
live aktualisiert, sobald ein Gerät einen Zustand ändert, und die keinen
zusätzlichen Server neben FHEM benötigt.

**Getroffene Entscheidungen:** Hybrid (schlankes Helfer-Modul + statische SPA
über FHEMWEB), responsives Auto-Layout als primäres Paradigma, Stack-Empfehlung
s. u.

## 1. Architektur-Überblick (Hybrid)

Zwei Bausteine, beide über den bestehenden FHEMWEB-Port erreichbar — kein
eigener Webserver, kein externer Prozess:

```
Browser (SPA)
   |  (same-origin, FHEMWEB-Port)
   v
FHEMWEB ──> statische Dateien aus www/fhemviz/  (index.html, js, css)
   |
   ├─ jsonlist2 <devspec>        -> Snapshot (Datenmodell-Aufbau)
   ├─ inform (Longpoll/WebSocket)-> Live-Push bei jeder Reading-Änderung
   └─ cmd=set/attr (+fwcsrf)     -> Aktionen (schalten/dimmen/setzen)
        |
        v
   98_FHEMVIZ.pm  (Helfer-Modul: Attribute deklarieren, get manifest/config)
```

- **FHEMWEB liefert statische Dateien** aus seinem `www/`-Verzeichnis aus
  (`http://fhem:8083/fhem/fhemviz/index.html`) — genau der Mechanismus, den
  auch FTUI nutzt. Kein Build-/Node-Server auf der FHEM-Box nötig.
- **Helfer-Modul `98_FHEMVIZ.pm` ist bewusst schlank.** Es rendert nichts.
  Aufgabe: (a) die Zusatz-Attribute deklarieren, damit sie im
  FHEMWEB-Attribut-Dropdown auftauchen und validiert werden; (b) einen
  `get manifest`/`get config`-Endpunkt liefern, der die aktive Sicht (welche
  Räume, welche Reihenfolge, Theme) als JSON zurückgibt. So bleibt die gesamte
  Konfiguration in FHEM und ist per `attr`/Config-Datei sicher-/versionierbar.

**Warum Hybrid statt reiner SPA:** Ohne Modul müsste der Nutzer
Zusatz-Attribute „blind" per `attr wasauchimmer` setzen (kein Dropdown, keine
Validierung, Gefahr von Tippfehlern). Das Mini-Modul macht die neuen Attribute
zu erstklassigen FHEM-Bürgern, ohne die Render-Logik nach Perl zu ziehen (dort
wäre sie schwer wartbar und nicht live).

## 2. Datenfluss & Live-Aktualisierung (der Kern)

Alles nutzt die vorhandene FHEMWEB-API — nichts Eigenes erfunden:

1. **Initialer Snapshot — `jsonlist2 <devspec> [<reading-regex>]`**
   Liefert pro Gerät Internals, Readings (Wert + Zeitstempel), Attributes,
   PossibleSets, PossibleAttrs als JSON. Damit baut die SPA ihr komplettes
   Datenmodell auf. `<devspec>` kann gezielt filtern (z. B. `room=Dashboard.*`
   oder alle Geräte mit einem bestimmten Attribut).

2. **Live-Push (kein Polling!) — der `inform`-Mechanismus von FHEMWEB.**
   Die SPA öffnet eine langlebige Verbindung:
   `GET /fhem?XHR=1&inform=type=status;filter=<regex>;since=<ts>;fmt=JSON`
   FHEMWEB hält die Verbindung offen und streamt bei jeder Reading-Änderung
   eine Zeile, typischerweise `["<dev>-<reading>", "<rawWert>", "<formatiert>"]`.
   Die SPA patcht damit gezielt das Gerät im Datenmodell → nur das betroffene
   Widget rendert neu.
   - **Transport:** FHEMWEB kann diesen Kanal als Longpoll oder WebSocket
     fahren (FHEMWEB-Attribut `longpoll = 1` bzw. `websocket`). Die SPA
     bevorzugt WebSocket, fällt automatisch auf Longpoll zurück.
   - **Reconnect/Resync:** bei Verbindungsabbruch neu verbinden und per `since`
     nur die verpassten Änderungen nachziehen (bzw. Snapshot neu laden).

3. **Aktionen (schalten/dimmen/setzen) — `set`/`attr` über die Command-URL:**
   `GET /fhem?cmd=set <dev> <cmd>&fwcsrf=<token>&XHR=1`
   Der CSRF-Token (`fwcsrf`) wird beim App-Start aus dem Response-Header
   `X-FHEM-csrfToken` (Antwort auf einen `?XHR=1`-Request) gelesen und bei
   allen schreibenden Befehlen mitgegeben. Die Bestätigung kommt ohnehin über
   den `inform`-Kanal zurück → optimistisches UI-Update + Korrektur bei
   Abweichung.

**Ergebnis:** Snapshot + Event-Stream + CSRF-Set. Genau das Trio, mit dem auch
FHEMWEBs eigenes Frontend und FTUI arbeiten — voll FHEM-Standard,
zukunftssicher.

## 3. Konfigurations-Schema (Attribute am Gerät = Single Source of Truth)

**Grundsatz:** erst FHEM-Standardattribute wiederverwenden, nur wo nötig eigene
ergänzen. So versteht die SPA auch Geräte, die nie für sie konfiguriert wurden.

### 3a. Wiederverwendete Standard-Attribute

| Attribut | Rolle in der Visualisierung |
|---|---|
| `room` | Seite / Tab / oberste Gruppierungsebene |
| `group` | Karten-Gruppierung innerhalb eines Raums |
| `alias` | Anzeigename (statt technischem Gerätenamen) |
| `icon` | Icon des Geräts/Widgets |
| `sortby` | Reihenfolge innerhalb der Gruppe |
| `genericDeviceType` | Semantischer Typ (light, thermostat, blind, switch, sensor, media, …) → wählt das Widget |
| `webCmd` | welche Aktionen als Bedienelement erscheinen |
| `devStateIcon` | Zustands-abhängiges Icon/Ampel |
| `stateFormat` | Formatierung des Status-Texts |
| `cmdIcon` / `widgetOverride` | Feinsteuerung einzelner Bedienelemente |

`genericDeviceType` (GDT) ist der Schlüssel: dieselbe Semantik, die schon
Alexa-/HomeBridge-/Homekit-Anbindungen nutzen. Wer das setzt, bekommt sofort
das richtige moderne Widget — ohne visualisierungsspezifische Konfiguration.

### 3b. Minimaler Satz eigener Attribute (deklariert von `98_FHEMVIZ.pm`)

Nur dort, wo Standard nichts hergibt — bewusst wenige, mit Namespace-Präfix
`viz`:

| Attribut | Zweck |
|---|---|
| `vizWidget` | Widget-Typ explizit erzwingen/überschreiben (falls GDT nicht passt) |
| `vizSize` | Kachelgröße im responsiven Raster (z. B. 1x1, 2x1, 2x2) |
| `vizChart` | Readings, die als Graph/Sparkline angezeigt werden (Bezug auf FileLog/DbLog) |
| `vizHide` | Gerät/Reading aus der Sicht ausblenden |
| `vizPage` | optionale Zuordnung zu einer Sicht abweichend von `room` |

**Konvention:** ein Attribut trägt ggf. mehrere Optionen als kompaktes
`key:value`-/JSON-Fragment, um die Attributliste klein zu halten (wie FHEM es
bei `webCmd`/`widgetOverride` vormacht). Keine Pixel-Koordinaten — das Layout
ergibt sich automatisch (siehe §4).

Für den Pool-Sensor des Schwester-Repos (BLEYC01) heißt das konkret: `room`,
`group`, `vizWidget sensor`, `vizChart Temperatur,PH,ORP` — und die vorhandenen
`*_OK`-Readings speisen direkt eine Ampel-/Statusfarbe im Widget.

## 4. Layout: responsives Auto-Layout

Kein festes Positionieren. Aufbau rein aus Attributen: `room` → Sicht/Tab,
`group` → Karte, `sortby` → Reihenfolge, `vizSize` → Kachel-Spannweite. Ein
CSS-Grid mit `auto-fill`/`minmax` bricht die Kacheln je nach Fensterbreite
automatisch um (Desktop mehrspaltig, Handy einspaltig).

- **Ableitung ohne Konfig:** Geräte ohne `group` landen in einer Default-Gruppe
  pro Raum; Geräte ganz ohne `room` in „Unsortiert". So ist die Sicht sofort
  brauchbar und wächst mit sauberer Attributpflege.
- **Optionale Anpassung später:** Drag&Drop zum Umsortieren schreibt lediglich
  `sortby`/`group` per `attr`-Befehl zurück in FHEM — die Konfiguration bleibt
  im Standard, nichts in einer separaten Layout-Datei. (Ein freier
  Floorplan-Modus mit Grundriss bleibt als spätere, additive Ansicht denkbar,
  ist aber bewusst nicht der Standardweg.)

## 5. Widget-/Rendering-Modell

Eine Registry bildet semantischen Typ → Web-Component ab. Auswahl-Reihenfolge
pro Gerät: `vizWidget` (explizit) → `genericDeviceType` → Heuristik aus
PossibleSets/`webCmd` (z. B. `on`/`off` ⇒ Switch, `pct`/`dim` ⇒ Dimmer) →
Fallback: generische Sensor-/Status-Kachel.

**Widget-Startset** (jeweils eine `<fhemviz-*>`-Component): `switch`, `dimmer`,
`thermostat`, `blind/shutter`, `sensor` (Wert + Einheit + Trend), `chart`
(Sparkline/Graph aus FileLog/DbLog), `media`, `text/status`, `button/action`.
Jedes Widget kennt zwei Dinge: wie es einen Reading-Wert darstellt und welchen
`set`-Befehl es bei Interaktion absetzt.

## 6. Tech-Stack-Empfehlung (Entscheidung)

**Empfehlung:** native Web Components (Vanilla JS, ES-Module) + CSS Custom
Properties, **ohne Build-Schritt**. Direkt nach `www/fhemviz/` kopierbar.

Begründung:

- FHEM-Boxen (oft Raspberry Pi) haben typischerweise kein Node/npm und Nutzer
  wollen keinen Build-Prozess pflegen. „Datei kopieren, fertig" passt zur
  FHEM-Kultur (vgl. FTUI).
- Web Components geben ein sauberes, framework-unabhängiges
  Widget-Plugin-Modell (Custom Elements + Shadow DOM für Kapselung) — ideal für
  die Registry aus §5 und für spätere Community-Widgets.
- CSS Custom Properties liefern Theming/Dark-Mode ohne Framework.
- Langlebig & wartungsarm: kein Toolchain-Bitrot, keine Abhängigkeits-Updates.

Als optionaler DX-Komfort ließe sich später ein reiner Dev-Build (Vite) für
lokale Entwicklung ergänzen, der aber statische, buildfreie Assets ausgibt —
die Auslieferung bleibt buildfrei. Ein schweres Framework (Svelte/Vue) würde
nur gewählt, wenn das UI stark über einfache Kacheln hinauswächst.

## 7. SPA-Struktur (Skizze)

```
www/fhemviz/
  index.html            App-Einstieg (lädt js/app.js als ES-Modul)
  css/fhemviz.css        Design-Tokens, Dark-Mode, Grid-Gerüst
  js/
    app.js              Bootstrap: client -> store -> layout -> widgets
    fhem-client.js      Snapshot (jsonlist2) + inform-Live + CSRF-Set
    store.js            reaktives Gerätemodell (patch pro inform-Zeile)
    layout.js           Auto-Layout aus room/group/sortby/vizSize
    widgets/
      registry.js       semantischer Typ -> Custom-Element-Tag
      base-widget.js    Basis-Klasse (Custom Element + Shadow DOM)
      switch.js         Kern-Widget: on/off
      sensor.js         Kern-Widget: Wert + Einheit + Ampel (*_OK)
      dimmer.js         Kern-Widget: pct/dim
```

**Reaktivität:** der `store` hält Geräte als Objekte; eine `inform`-Zeile patcht
gezielt ein Reading und benachrichtigt nur die abonnierten Widgets → minimaler
Re-Render, spürbar „direkt".

## 8. Sicherheit / Betrieb

- **Auth:** erbt die FHEMWEB-Konfiguration (`basicAuth`/`allowed`-Device); die
  SPA läuft same-origin, es sind keine zusätzlichen Credentials nötig.
- **CSRF:** `fwcsrf` bei allen schreibenden Kommandos (§2.3) — Pflicht bei
  aktivem `csrfToken`.
- **Read-only-Modus** möglich (nur Snapshot + `inform`, keine Set-Buttons) für
  Wandtablets/Gäste.
- **Mehrere Sichten:** je FHEMWEB-Instanz eigene Config/Theme; oder mehrere
  FHEMVIZ-Definitionen für unterschiedliche `devspec`/Themes.

## 9. Umsetzungs-Roadmap

1. **PoC-Kern:** `fhem-client.js` (Snapshot + inform-Live + CSRF-Set) gegen
   eine echte FHEMWEB-Instanz; roher Beweis, dass Live-Updates ankommen.
2. **Store + Auto-Layout:** Gruppierung nach `room`/`group`/`sortby`, Grid.
3. **Widget-Registry + 3 Kern-Widgets** (switch, sensor, dimmer), GDT-Mapping.
4. **`98_FHEMVIZ.pm`** (Attribut-Deklaration/-Validierung, `get config`).
5. **Theming** (dark/light), Reconnect/Resync, Read-only.
6. **Chart-Widget** (FileLog/DbLog), Drag&Drop→`attr sortby`.
7. **Doku + `controls_*.txt`-Integration** wie beim bestehenden Modul.

## 10. Kritische Dateien

- **Neu:** `www/fhemviz/*` (SPA, s. §7) — Auslieferung über FHEMWEB.
- **Neu:** `FHEM/98_FHEMVIZ.pm` — Helfer-Modul, Struktur analog zum
  vorhandenen `FHEM/98_BLEYC01.pm` (gleiche `*_Initialize`/`Define`/`Attr`/
  `Get`-Konventionen, `$readingFnAttributes`, POD-Doku, Version im `FVERSION`).
- **Anpassen:** `controls_FHEMVIZ.txt` +
  `.github/workflows/update-controls.yml` für FHEM-`update`-Auslieferung.

## Verifikation (Konzept-Validierung, vor der Bau-Session)

Da die tragenden Annahmen an einer echten FHEM-Instanz bestätigt werden
sollten, bevor gebaut wird:

1. **Live-Kanal:** an laufender FHEMWEB testen
   `curl -N 'http://<fhem>:8083/fhem?XHR=1&inform=type=status;filter=.*;fmt=JSON'`
   und parallel ein Reading ändern → es muss sofort eine JSON-Zeile
   erscheinen. Zusätzlich prüfen, ob `attr WEB longpoll websocket` einen
   WS-Upgrade erlaubt.
2. **CSRF-Set:** Token via `curl -i '.../fhem?XHR=1'` (Header
   `X-FHEM-csrfToken`) holen, dann
   `curl '.../fhem?cmd=set <dev> on&fwcsrf=<token>&XHR=1'` → Schaltbefehl
   greift und die Änderung kommt über den `inform`-Kanal zurück.
3. **Snapshot-Schema:** `jsonlist2 <dev>` gegen ein reales Gerät prüfen, dass
   Attributes/Readings/PossibleSets wie erwartet strukturiert sind (Grundlage
   für Store & Widget-Registry).

Sind diese drei bestätigt, trägt die Architektur und die Bau-Roadmap (§9) kann
starten.
