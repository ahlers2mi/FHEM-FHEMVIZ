# FHEM-FHEMVIZ

Moderne, responsive **FHEM-Visualisierung** – Konfiguration vollständig im
FHEM-Standard („FHEM-Standard-first"). Ein System, zwei Betriebsarten:
**Tablet** (Touch, Raum-Tabs unten) und **TV/Kiosk** (bedienlos,
Szenen-Rotation, steuerbar per FHEM-Event).

Architektur & Konzept: [`CONCEPT.md`](./CONCEPT.md) · Stand: **v0.7.0**

---

## Installation

```
update add https://raw.githubusercontent.com/ahlers2mi/FHEM-FHEMVIZ/main/controls_FHEMVIZ.txt
update all
reload 98_FHEMVIZ
```

Danach im Browser: `http://<fhem>:<port>/fhem/fhemviz/index.html`

## Schnellstart

```
define myViz FHEMVIZ
attr myViz devspec room=Wohnzimmer|Garage|Solar
```

Mehr ist nicht nötig – die SPA findet das Gerät automatisch, lädt alle
Geräte des `devspec`, gruppiert nach `room`/`group` und aktualisiert live
(kein Polling). Alles Weitere ist optional.

Sobald ein FHEMVIZ-Gerät definiert ist, erscheint im linken FHEMWEB-Menü
ein Eintrag **FHEMVIZ** (wie „Floorplans"), der direkt die Oberfläche öffnet.

## Konfiguration: das FHEMVIZ-Gerät

| Attribut | Werte | Wirkung |
|---|---|---|
| `devspec` | FHEM-devspec | **Pflicht.** Welche Geräte in der Sicht sind, z. B. `room=Dashboard.*` oder `d_garage_neu,mySolar.*` |
| `mode` | `tablet` (Default) / `tv` | Betriebsart; per URL übersteuerbar (`?mode=tv`) |
| `tvScenes` | `Raum:Sek,Raum:Sek` | Szenen-Rotation im TV-Modus, z. B. `Solar:30,Wohnzimmer:20,Garage:15`. Ohne Angabe: alle sichtbaren Räume à 20 s |
| `tvTouch` | Sekunden (Default 30, `0` = aus) | Touch-Übernahme im TV-Modus: Tipp auf den Schirm → bedienbare Tablet-Ansicht; nach `tvTouch` s ohne Aktion läuft die Rotation weiter (TV-Modus als Tablet-Bildschirmschoner) |
| `theme` | `auto` (Default) / `light` / `dark` | Farbschema; `auto` folgt dem System |
| `zoom` | `0.5`–`3` oder Prozent (`130`) | Standard-Skalierung für alle Browser dieses Geräts; `?zoom=` in der URL geht vor. Praktisch für Kiosk-Browser (Fully), die URL-Parameter verschlucken. Aktiver Zoom steht in der Statuszeile |
| `readonly` | `0` / `1` | Keine Bedienelemente (Gäste-/Wandmodus); im TV-Modus immer aktiv |
| `showRooms` | Regex-Liste | **Whitelist**: nur passende Räume erscheinen, Geräte ohne passenden Raum entfallen ganz. Für ein rein kuratiertes Dashboard: `FHEMVIZ->.*` |
| `hideRooms` | Regex-Liste | Räume ohne eigenen Tab/Abschnitt. Default: `System->.*,Homebridge,Alexa,FileLog,hidden` |
| `hideTypes` | TYPE-Liste | Geräte-TYPEs ohne Kachel. Default: `SVG,FileLog,notify,at,DOIF,watchdog,weblink,readingsGroup` |
| `hideStates` | Regex-Liste | Geräte, deren state komplett matcht, werden ausgeblendet. Default: `\?\?\?,unknown,initialized,defined,disabled,inactive` |

**Set-Befehl** (TV-Steuerung aus FHEM heraus):

```
set myViz scene <Raum> [Sekunden]     # Szene übernehmen, danach Rotation
```

## Konfiguration: die visualisierten Geräte

FHEMVIZ liest zuerst die **Standard-Attribute** – wer seine Geräte sauber
pflegt, braucht nichts Neues:

| Standard-Attribut | Wirkung in FHEMVIZ |
|---|---|
| `room` | Tab/Szene (kommasepariert = Gerät erscheint in jedem Raum) |
| `group` | Karten-Gruppierung im Raum |
| `alias` | Anzeigename der Kachel |
| `sortby` | Reihenfolge in der Gruppe |
| `genericDeviceType` | Widget-Wahl (light/switch → Schalter, blind → Dimmer, …) |
| `webCmd` | Bedien-Buttons (z. B. `Auf:Zu:Lüften:Stop` → Aktions-Widget) |

Dazu drei **viz-Attribute** (global registriert, mit Dropdown an jedem Gerät):

| Attribut | Werte | Wirkung |
|---|---|---|
| `vizWidget` | `switch` / `sensor` / `dimmer` / `shutter` / `actions` / `text` / `agenda` / `contact` / `vent` / `flow` / `forecast` / `weather` | Widget-Typ erzwingen; übersteuert auch die Rausch-Filter (Gerät wird immer gezeigt). `text` = mehrzeiliger Klartext, `contact` = Fenster/Tür-Kontakt (Symbol + Offen/Gekippt/Zu, offen = Bernstein; wird bei state open/closed/tilted automatisch gewählt; `structure`-Geräte wie `st_fenster` werden zur Gruppen-Kachel: „2 offen · 1 gekippt" + ein Mini-Symbol je Mitglied, live), `agenda` = Terminliste (`DD.MM.YYYY HH:MM Text`-Zeilen) mit Wochentag und hervorgehobenem nächstem Termin |
| `vizSize` | `1x1` / `2x1` / `1x2` / `2x2` | Kachelgröße im Raster; `2x2` = Hero-Kachel mit großer Schrift |
| `vizHide` | `1` / `0` | Gerät aus der Sicht ausblenden |
| `vizIcon` | `lampe` / `steckdose` / `lautsprecher` / `luefter` / `pumpe` / `tv` / `heizung` / `power` | **Symbol-Modus** für Schalter: großes Icon mittig, Name darunter, bernstein = an — aus der Ferne lesbar; Tippen auf die Kachel schaltet |
| `vizGroup` | Gruppenname(n), `-` = keine | Übersteuert `group` **nur im Dashboard** (FHEMWEB unberührt) — steuert, welche Kacheln zusammenstehen; `-` löst die Gruppe auf („Allgemein") |
| `vizReadings` | `reading[:Label[:Einheit[:Farbe[:bar]]]]`, kommasepariert | Kachelinhalt **direkt aus Readings** statt state-Parsing; erster Eintrag = Hauptwert (groß). Farben semantisch: `ok`/`grün`, `warn`/`orange`, `bad`/`rot`, `accent`, `blau`. Flag `bar` = zusätzlicher Fortschrittsbalken (Skala 0–100, z. B. Autarkie-/Akku-Prozent). Gesetzt = state wird ignoriert, Gerät immer angezeigt |

**Beispiel Wechselrichter** (Readings statt stateFormat-Raten, mit Farben
wie im alten Solardashboard):

```
attr d_Wechselrichter_all vizReadings soc:Ladung:%:accent,pv_leistung:PV:W:ok,out_leistung:Haus:W:bad,netzleistung_all:Netz:W:ok,batterie_leistung:Batterie:W:warn
attr d_Wechselrichter_all vizSize 2x2
```

**Beispiel Müllkalender** (Terminliste im Agenda-Stil, nächster Termin
hervorgehoben):

```
attr rem_d_cal_muell vizWidget agenda
attr rem_d_cal_muell alias Termine
attr rem_d_cal_muell vizSize 2x2
```

**Beispiel PV-Prognose** (`TYPE=SolarForecast` wird automatisch erkannt,
`vizWidget forecast` ist nur für andere Gerätetypen nötig): Stunden-Balkenchart
des Tages — IST-Ertrag kräftig vor der blassen Prognose, Marker unter der
laufenden Stunde — plus Sonnenzeiten, Peak-Stunde, aktuelle Leistung und
Morgen-Prognose:

```
attr Forecast vizSize 2x1
```

## Raum-Konvention `FHEMVIZ-><Name>`

Reine Dashboard-Räume (z. B. für TV-Szenen) legst du als Unterräume von
`FHEMVIZ` an — in FHEMWEB bleiben sie als eine zusammengeklappte Hierarchie
sichtbar, im Dashboard erscheint nur der Kurzname:

```
attr rem_d_cal_muell room Remote->Calendar,System->mcp_rw,FHEMVIZ->Termine
attr myViz tvScenes Solar:30,Wohnzimmer:20,Termine:15
```

- Tab/Szene heißt schlicht **„Termine"** (der Präfix wird ausgeblendet)
- In `tvScenes` und `set myViz scene …` genügt der **Kurzname** —
  `Termine` findet automatisch `FHEMVIZ->Termine` (exakter Name gewinnt,
  falls beides existiert)

**Widget-Auswahl** (Reihenfolge): `vizWidget` → `vizReadings` (→ Readings-
Kachel) → `genericDeviceType` → `webCmd` (reine on/off → Schalter,
`pct`/`dim` → Dimmer, sonst Aktions-Buttons) → PossibleSets-Heuristik →
Sensor-Kachel.

## TV-/Kiosk-Modus einrichten

Fernseher/Kiosk-Browser (Fully Kiosk, Chromium-Kiosk) bekommt als Start-URL:

```
http://<fhem>:<port>/fhem/fhemviz/index.html?mode=tv&device=myViz
```

Optional mit Startraum und Skalierung (siehe URL-Parameter):

```
http://<fhem>:<port>/fhem/fhemviz/index.html?mode=tv&device=myViz&room=Solar&zoom=1.3
```

Szenen-Rotation konfigurieren und per Event übernehmen lassen:

```
attr myViz tvScenes Solar:30,Wohnzimmer:20,Draußen:15

# Geräte-Event kapert den Schirm - ein ganz normales notify:
define n_tor_tv notify d_garage_neu:onoff:.* set myViz scene Garage 60
```

Der rote Rahmen signalisiert die Event-Übernahme; nach Ablauf kehrt die
Rotation automatisch zurück.

### Webseite/Kamerabild einblenden: `set myViz show`

Blendet eine URL als **Vollbild-Overlay über dem Dashboard** ein — ohne die
SPA zu verlassen (kein Reload, Live-Verbindung läuft weiter). Nach Ablauf
oder per Tipp verschwindet das Overlay:

```
set myViz show http://kamera/snapshot.jpg 20    # Kamerabild für 20 s
set myViz show http://<fhem>:8086/fhem/floorplan/WetterDash 60
set myViz show off                              # sofort schließen

# Türklingel blendet das Kamerabild auf allen Displays ein:
define n_klingel_tv notify MQTT2_DOORBELL:motion:.* set myViz show http://kamera/snapshot.jpg 20
```

Bild-URLs (`.jpg`/`.png`/…) werden als Bild gerendert, alles andere als
iframe. Hinweis: Fremdseiten können das Einbetten per `X-Frame-Options`
verbieten — Bilder und FHEM-eigene Seiten funktionieren immer.

### Seite dauerhaft umschalten: `set myViz page`

Während `set myViz scene <Raum> [Sek]` den Schirm nur **vorübergehend** kapert,
schaltet `set myViz page <Raum>` die Anzeige **dauerhaft** um — ideal aus
notify/DOIF oder von Hand:

```
set myViz page Solar     # TV pinnt die Seite (📌 im Header), Tablet wechselt den Tab
set myViz page auto      # Pin aufheben, TV kehrt zur Szenen-Rotation zurück
```

- Die Rotation pausiert; läuft die Seite über, blättert das Auto-Paging
  zyklisch weiter (auf dem TV wird nie gescrollt)
- Ein `scene`-Event unterbricht auch eine gepinnte Seite und kehrt danach
  zu ihr zurück
- Das Reading `page` bleibt erhalten: neu verbundene Browser starten direkt
  auf dieser Seite (die URL-Parameter `?room=` gehen vor)
- Kurzname genügt, `FHEMVIZ->` wird automatisch probiert

## URL-Parameter

| Parameter | Wirkung |
|---|---|
| `?device=<name>` | Bestimmtes FHEMVIZ-Gerät (sonst: erstes `TYPE=FHEMVIZ`) |
| `?mode=tv` / `?mode=tablet` | Betriebsart übersteuern (für Kiosk-Start-URLs) |
| `?zoom=1.3` | Oberfläche skalieren (0.5–3, auch `130` als Prozent) — pro Gerät in der Start-URL, z. B. größer für den TV, kleiner fürs kleine Tablet. Auf Android/Fully Kiosk wird automatisch die native Viewport-Skalierung genutzt (CSS-zoom wird dort teils ignoriert) |
| `?room=Solar` | Startseite: TV beginnt die Szenen-Rotation mit diesem Raum (steht er nicht in `tvScenes`, läuft er einmalig zuerst), Tablet öffnet den Tab. Kurzname genügt, `FHEMVIZ->` wird automatisch probiert |

## Eigene Widgets (Plugin-API)

Eigene Widgets leben in `www/fhemviz/js/widgets/custom/index.js` — die Datei
gehört dir und wird von FHEM `update` **nie überschrieben** (sie steht nicht
in der controls-Datei). Buildfrei, keine Toolchain:

```js
import { registerWidget, FhemvizWidget } from "../registry.js";

class PoolWidget extends FhemvizWidget {
  render() {
    const t = this.plain((this.device.readings || {}).poolTemp ?? "–");
    return `<div class="card"><span class="label">${this.escape(this.displayName())}</span>
      <div class="value">${this.escape(t)}<span class="unit">°C</span></div>
      ${this.readingRowsHtml()}</div>`;
  }
}
registerWidget("pool", PoolWidget);
```

Aktivierung: `attr <gerät> vizWidget pool`. Die Basisklasse liefert
`plain()`, `escape()`, `readingRowsHtml()` (vizReadings), `sendCommand()`
und das Karten-CSS mit allen Design-Tokens.

## Struktur

```
FHEM/98_FHEMVIZ.pm     Helfer-Modul (Attribute, get config, set scene)
www/fhemviz/           buildfreie SPA (Web Components, kein Node/npm)
controls_FHEMVIZ.txt   FHEM-update-Manifest (wird per Workflow gepflegt)
CONCEPT.md             Konzept & Architektur
```

## Roadmap

Nächster Meilenstein: **v0.8 Energiefluss-Widget** (ersetzt Floorplan-
Solardashboards mit ihren Pfeil-Hilfsgeräten durch ein konfigurierbares
Fluss-Diagramm). Danach: Chart-Widget (FileLog/DbLog), webCmd-Slider.

## Lizenz

GPL v2 oder höher (wie FHEM).
