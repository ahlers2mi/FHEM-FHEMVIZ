# FHEM-FHEMVIZ

Moderne, responsive **FHEM-Visualisierung** – Konfiguration vollständig im
FHEM-Standard („FHEM-Standard-first").

> **Status: Grundgerüst (v0.1.0).** Dieses Repo enthält aktuell nur die
> Struktur und Platzhalter – **noch keine Render-/Client-Logik**. Das
> ausgearbeitete Konzept und die Architektur stehen in
> [`CONCEPT.md`](./CONCEPT.md).

## Idee

Eine moderne, responsive Oberfläche, deren Konfiguration **an den FHEM-Geräten
selbst** liegt (Attribute = Single Source of Truth), die sich **ohne Polling
live** aktualisiert, sobald ein Gerät seinen Zustand ändert, und die **keinen
zusätzlichen Server** neben FHEM benötigt.

Zwei Bausteine, beide über den vorhandenen FHEMWEB-Port erreichbar:

- **Statische SPA** unter `www/fhemviz/`, ausgeliefert von FHEMWEB
  (`http://<fhem>:<port>/fhem/fhemviz/index.html`) – buildfrei (native Web
  Components + CSS Custom Properties, kein Node/npm).
- **Schlankes Helfer-Modul** `FHEM/98_FHEMVIZ.pm` – rendert nichts, deklariert
  die Zusatz-Attribute (`viz*`) und liefert später die aktive Sicht als JSON
  (`get manifest`/`get config`).

Datenfluss über die vorhandene FHEMWEB-API: `jsonlist2` (Snapshot) +
`inform` (Live-Push, WebSocket/Longpoll) + CSRF-gesicherte `set`/`attr`
(Aktionen). Details in [`CONCEPT.md`](./CONCEPT.md).

## Struktur

```
.github/workflows/update-controls.yml   FHEM-update: controls-Datei pflegen
FHEM/98_FHEMVIZ.pm                       Helfer-Modul (Attribute, get config)
controls_FHEMVIZ.txt                     FHEM-update-Manifest
CONCEPT.md                               Konzept & Architektur (Referenz)
www/fhemviz/
  index.html                            SPA-Einstieg
  css/fhemviz.css                       Theming (Tokens, Dark-Mode) + Grid
  js/
    app.js                              Bootstrap
    fhem-client.js                      Snapshot + inform-Live + CSRF-Set
    store.js                            reaktives Gerätemodell
    layout.js                           responsives Auto-Layout
    widgets/
      registry.js                       semantischer Typ -> Web-Component
      base-widget.js                    Basis-Custom-Element
      switch.js / sensor.js / dimmer.js  Kern-Widgets (§9)
```

## Roadmap

Siehe [`CONCEPT.md`](./CONCEPT.md), Abschnitt 9. Der aktuelle Stand ist das
Grundgerüst; die Bau-Session ergänzt PoC-Client, Store, Auto-Layout und die
Kern-Widgets.

## Lizenz

GPL v2 oder höher (wie FHEM).
