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

## Konfiguration: das FHEMVIZ-Gerät

| Attribut | Werte | Wirkung |
|---|---|---|
| `devspec` | FHEM-devspec | **Pflicht.** Welche Geräte in der Sicht sind, z. B. `room=Dashboard.*` oder `d_garage_neu,mySolar.*` |
| `mode` | `tablet` (Default) / `tv` | Betriebsart; per URL übersteuerbar (`?mode=tv`) |
| `tvScenes` | `Raum:Sek,Raum:Sek` | Szenen-Rotation im TV-Modus, z. B. `Solar:30,Wohnzimmer:20,Garage:15`. Ohne Angabe: alle sichtbaren Räume à 20 s |
| `theme` | `auto` (Default) / `light` / `dark` | Farbschema; `auto` folgt dem System |
| `readonly` | `0` / `1` | Keine Bedienelemente (Gäste-/Wandmodus); im TV-Modus immer aktiv |
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
| `vizWidget` | `switch` / `sensor` / `dimmer` / `actions` / `text` | Widget-Typ erzwingen; übersteuert auch die Rausch-Filter (Gerät wird immer gezeigt). `text` = mehrzeiliger Klartext (Kalender-/Terminlisten) |
| `vizSize` | `1x1` / `2x1` / `1x2` / `2x2` | Kachelgröße im Raster; `2x2` = Hero-Kachel mit großer Schrift |
| `vizHide` | `1` / `0` | Gerät aus der Sicht ausblenden |
| `vizReadings` | `reading[:Label[:Einheit[:Farbe]]]`, kommasepariert | Kachelinhalt **direkt aus Readings** statt state-Parsing; erster Eintrag = Hauptwert (groß). Farben semantisch: `ok`/`grün`, `warn`/`orange`, `bad`/`rot`, `accent`, `blau`. Gesetzt = state wird ignoriert, Gerät immer angezeigt |

**Beispiel Wechselrichter** (Readings statt stateFormat-Raten, mit Farben
wie im alten Solardashboard):

```
attr d_Wechselrichter_all vizReadings soc:Ladung:%:accent,pv_leistung:PV:W:ok,out_leistung:Haus:W:bad,netzleistung_all:Netz:W:ok,batterie_leistung:Batterie:W:warn
attr d_Wechselrichter_all vizSize 2x2
```

**Beispiel Müllkalender** (mehrzeiliger Text):

```
attr rem_d_cal_muell vizWidget text
attr rem_d_cal_muell vizSize 2x1
```

**Widget-Auswahl** (Reihenfolge): `vizWidget` → `vizReadings` (→ Readings-
Kachel) → `genericDeviceType` → `webCmd` (reine on/off → Schalter,
`pct`/`dim` → Dimmer, sonst Aktions-Buttons) → PossibleSets-Heuristik →
Sensor-Kachel.

## TV-/Kiosk-Modus einrichten

Fernseher/Kiosk-Browser (Fully Kiosk, Chromium-Kiosk) bekommt als Start-URL:

```
http://<fhem>:<port>/fhem/fhemviz/index.html?mode=tv&device=myViz
```

Szenen-Rotation konfigurieren und per Event übernehmen lassen:

```
attr myViz tvScenes Solar:30,Wohnzimmer:20,Draußen:15

# Geräte-Event kapert den Schirm - ein ganz normales notify:
define n_tor_tv notify d_garage_neu:onoff:.* set myViz scene Garage 60
```

Der rote Rahmen signalisiert die Event-Übernahme; nach Ablauf kehrt die
Rotation automatisch zurück.

## URL-Parameter

| Parameter | Wirkung |
|---|---|
| `?device=<name>` | Bestimmtes FHEMVIZ-Gerät (sonst: erstes `TYPE=FHEMVIZ`) |
| `?mode=tv` / `?mode=tablet` | Betriebsart übersteuern (für Kiosk-Start-URLs) |

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
