# Fahrzeugbilder der `car`-Kachel

Die drei Bilder in `www/fhemviz/img/car/` gehören zu den drei Ladezuständen
(`attr <fahrzeug> vizCar image=laedt:…|steckt:…|frei:…`, siehe README):

| Datei | Zustand | Bild | Auto | Autohöhe / Bildhöhe |
|---|---|---|---|---|
| `tesla-frei.png` | nichts angesteckt | 900 × 511 | 847 × 498 | 0,97 |
| `tesla-steckt.png` | Kabel dran, keine Leistung | 900 × 540 | 847 × 513 | 0,95 |
| `tesla-laedt.png` | es läuft Leistung | 831 × 586 | 806 × 388 | 0,66 (seit 20.09.2026, ganzes Kabel) |

Das letzte Verhältnis bestimmt, wie groß der Wagen in der Kachel erscheint:
sie passt das Bild per `object-fit: contain` auf 164 px Höhe ein (TV 200).

`image-*.png` sind die Vorlagen der ersten drei Bilder (Grünscreen, 29.08.2026).

## Freistellen: `freistellen-gruen.py`

```
python3 docs/img/car/freistellen-gruen.py <vorlage.jpg|png> <ausgabe.png>
```

Braucht `pillow`, `numpy`, `scipy`. Gedacht für Renderings vor **grünem**
Grund; für Bilder ohne Grünscreen siehe `CLAUDE.md` („Bilder freistellen").
Drei Dinge, die das Skript anders macht als ein einfacher Farbschlüssel, und
warum:

- **Grünstichigkeit relativ zur Helligkeit** (`(g − max(r,b)) / g`). Der
  Bodenschatten hat die Farbe des Hintergrunds, nur dunkler — absolut gemessen
  blieb er als grüner Fleck unter dem Wagen stehen, relativ sind beide 0,90.
  Zweite Bedingung ein absoluter Mindestabstand (12), sonst gilt ein schwarzer
  Reifen (r = b = 0, g = 3) als grün.
- **Hintergrund ist nur, was mit dem Bildrand zusammenhängt.** Der grüne Ring
  am Ladeport und eine grüne Ladegrafik liegen im Wagen und bleiben so stehen,
  obwohl sie farblich Hintergrund wären.
- **Entmischen statt Maskieren** in der weichen Zone: `fg = (px − (1−a)·bg) / a`.
  Der Leuchthof des Kabels bekommt seine eigene Farbe zurück statt eines Saums
  in Hintergrundgrün.

Danach **immer auf hellem und dunklem Grund ansehen** — ein weggefressener
Reifen sieht auf der dunklen Kachel aus wie ein Reifen.
