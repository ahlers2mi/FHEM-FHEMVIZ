# Changelog

Alle nennenswerten Änderungen. Neueste oben.

Die Versionsnummer steht im Modul (`get <viz> config` bzw. der Kopf von
`98_FHEMVIZ.pm`) und wird von der Oberfläche gegengeprüft — weichen beide ab,
meldet die Statuszeile einen Versionskonflikt (siehe README).

Zeitraum vor dem 1. August 2026: Aufbau der SPA (Web Components ohne Build),
Grundwidgets, Skins, TV-Modus. Ab hier ist es einzeln festgehalten.

---

## v0.37.8 — 24.08.2026

**Neu**

- **Mehrere Kalender in einer `agenda`-Kachel**: `attr <dev> vizAgenda
  src=<gerät>[:<farbe>],…` legt die Termine der genannten Geräte zusammen und
  sortiert sie **nach Datum**. Beschriftung je Zeile ist der `alias` des
  Quellgeräts, die Herkunft steht als farbige Kante links und als Kürzel
  rechts. Farbnamen wie bei `vizReadings` (`ok|warn|bad|accent|blau`) oder eine
  CSS-Farbe — fünf Namen reichen für beliebig viele Kalender nicht, und drei
  davon sind belegt (rot = Alarm, bernstein = heute).
  Die Herkunft färbt bewusst **nur die Kante**: die Fläche gehört weiter
  „heute/morgen". Ein erster Versuch mit `accent` für einen Kalender war genau
  daran unbrauchbar — die bernsteinfarbene Kante saß unsichtbar in einem
  bernsteinfarbenen „Heute"-Rahmen.
  Auf einer schmalen Kachel entfällt das Kürzel (Container-Query auf die
  **Kachel**breite, nicht die des Fensters) — sonst blieb vom Termin nur
  „6h Clau…" übrig. Zeilen ohne lesbares Datum stehen hinten statt zu
  verschwinden; das ist meist eine Meldung des Kalenders.

## v0.37.7 — 23.08.2026

**Neu**

- **`attr <viz> snap kachel|gruppe|off`** — rastendes Scrollen auf
  Tablet/Handy. Ohne das endete ein Wisch irgendwo, und oben steckte eine
  halbe Kachel unter der klebenden Kopfzeile. Gemessen in einem langen Raum,
  vier Wische, angeschnittene Kacheln an der **Oberkante**:

  | Fenster | `off` | `kachel` |
  |---|---|---|
  | 1280×800 | 6 (96 px) | **0** |
  | 800×1280 | 16 (1264 px) | **4** (236 px) |
  | 420×900 mit `zoom 0.9` | 6 (488 px) | 8, aber nur **160 px** (Schlieren) |

  `kachel` ist Default und rastet auf Kachelzeilen, `gruppe` auf
  Gruppenüberschriften (ruhiger, wirkt aber nur an Gruppenanfängen — in einer
  Gruppe, die höher als der Schirm ist, gibt es keinen Rastpunkt), `off` ist
  das alte Verhalten. Per URL übersteuerbar: `?snap=gruppe`.
  Gerastet wird weich (`proximity`): ein langer Wisch bleibt lang, es rastet
  nur beim Ausrollen ein. Im **TV-Modus wirkungslos** — der scrollt nicht, er
  blättert.
  Zwei Fallen: ohne `scroll-padding-top` in Kopfzeilenhöhe rastet es sauber,
  die Kachel steht aber *unter* der Kopfzeile; und unter `?zoom=` ist nicht
  `html` der Scroller, sondern `body` — ohne die zweite Regel rastete genau
  das Handy nie.
  Die **Unterkante** wird davon nicht besser: sitzt oben eine Kante, guckt
  unten der Rest einer Reihe herein. Dafür müsste die Kachelzeilenhöhe je
  Schirm nachgerechnet werden.

## v0.37.6 — 22.08.2026

**Behoben**

- **`watertank`: die Füllstände standen still, obwohl das Rohr leuchtete.**
  Nicht das Widget, sondern eine fehlende Zahl — `ibcToBarrelFlow_lpm` gab es
  als Reading nicht mehr (das Modul lernt die Rate nur aus vollständigen
  Läufen, ein Statefile-Rückfall hatte sie gekostet). Die Kachel nimmt jetzt
  Reading zuerst, dann das gleichnamige **Attribut** — dieselbe Reihenfolge
  wie das Modul. Dabei aufgefallen: die Kopfzeile zeigte die Rate nur für
  Fass → IBC, jetzt für beide Richtungen.

## v0.37.5 — 22.08.2026

**Behoben**

- **Der Wunschlimit-Balken der `car`-Kachel rechnete mit zwei Skalen.** Die
  Farbflächen (Ladestand, blasse Strecke bis zum Limit) lagen auf 0–100, der
  **Griff** dagegen auf der Spanne aus dem `setList`. Bei
  `wish_charge_limit:slider,20,5,100` saß ein Limit von 25 % deshalb bei
  (25−20)/(100−20) = **6 %** der Schiene, während die Farbfläche daneben bei
  25 % endete — der Griff stand mitten in der Ladestands-Füllung.
  Gemessen: Griff 6,3 % gegen Farbfläche 25,1 %, danach 25,0 gegen 25,1 %.
  Der Regler läuft jetzt über 0–100; Anfang und Schrittweite aus dem `setList`
  begrenzen weiterhin, wie weit sich der Griff ziehen lässt und welcher Wert
  gesendet wird — der Griff rastet auf erlaubte Werte und bleibt oberhalb des
  Anfangs stehen.

## v0.37.4 — 22.08.2026

**Behoben**

- **`watertank`: das Leitungsrohr floss weiter, obwohl der Schwimmer zu war.**
  Animiert wurde, solange `mainsSupply` auf `on` stand — der Hahn ist dann
  offen, aber ab `barrelFloatLevel` macht das Schwimmerventil dicht. Jetzt
  fließt das Rohr nur unterhalb der Schwimmerhöhe und ist sonst abgeblendet
  sichtbar (die Zufuhr *ist* offen, sie fördert nur nicht). Dazu rechnet der
  Leitungswasser-Anteil im Fass gegen den gezeichneten Stand statt gegen den
  gebuchten.

## v0.37.3 — 21.08.2026

**Geändert**

- **Die Batterie der `flow`-Kachel setzt sich vom Hintergrund ab.** Rahmen und
  Pol-Kappe hatten `--viz-border` — im dunklen Theme `#262c35` auf der Karte
  `#151920`, also kaum sichtbar. Die Form entstand praktisch nur durch die
  Füllung; bei niedrigem Ladestand war fast nichts zu sehen, und auf dem
  Wandtablet aus einigen Metern verschwand das Symbol.
  Jetzt tragen Rahmen und Kappe die **Ladefarbe** (wie Füllung und Zahl),
  gemischt mit der Rahmenfarbe, der Körper ist auf `--viz-raised` aufgehellt
  und ein dunkler Innenschatten trennt beides. Füllung von 26 auf 34 %.
  Ein neutraler grauer Rahmen war ebenfalls gebaut und verworfen: auf dem
  Wandtablet immer noch zu leise.

## v0.37.2 — 21.08.2026

**Behoben**

- **`vizHero full` wurde im Browser zu groß.** Bisher bestimmte allein die
  **Breite**, wie hoch die Vollbild-Kachel wird. Widgets mit festem
  Seitenverhältnis — `watertank` leitet die Höhe seiner Zeichnung aus der
  Breite ab (viewBox 220:108) — wuchsen in einem breiten Browserfenster über
  den Schirm hinaus: gemessen bei 1850×820 eine Kachel von **926 px in 780 px**
  sichtbarer Fläche, die Seite scrollte 424 px. Jetzt zählt das Kleinere von
  Breite und Höhe, die Zeichnung wird verkleinert und mittig gestellt
  (Kachel 690, Zeichnung 577).
  Eine Obergrenze allein genügte nicht: die Grid-Zeile richtet sich nach dem
  Inhalt, die Grenze schnitt die Zeichnung nur ab (Kachel 690, Zeichnung
  weiter 813). Erst `grid-template-rows: minmax(0, 1fr)` erlaubt der Zeile,
  unter die Inhaltshöhe zu gehen.
  Der **TV-Modus bleibt unberührt** — dort ist die Höhe bewusst genau ein
  Schirm minus Rahmenabstand, damit das Auto-Paging sauber blättert; die
  Browser-Grenze hätte die Kachel dort um 43 px gekürzt (im Test 660 → 617).

## v0.37.1 — 21.08.2026

**Neu**

- **`home=` in `vizCar` nimmt mehrere Schreibweisen**, mit `|` getrennt:
  `home=Im Nott|Zuhause|Home`. Nötig, weil das Auto je nach Eingabe etwas
  anderes meldet — die **Adresse** („Im Nott 35, 48301 Nottuln"), einen
  **POI-Namen** („Moubis Dülmen") oder den **Namen eines gespeicherten Ortes**
  („Zuhause"). Mit einer einzigen Zeichenkette trifft man nicht alle drei.

**Geändert**

- **Die drei Beispiel-Fahrzeugbilder sind freigestellt** (PNG mit Alpha statt
  JPG). Vorher war der dunkle Studio-Hintergrund des Renderings als Rechteck
  auf der Kachel zu sehen; mit Hintergrundbild oder hellem Skin wäre er
  unbrauchbar gewesen.

## v0.37.0 — 21.08.2026

**Behoben**

- **`set <viz> show` zeigte beim zweiten Alarm das erste Bild.** Ein
  Kamerabild liegt unter einer festen Adresse (`.../pic.jpg`) — der Inhalt
  wechselt, die Adresse nicht. Der Browser lieferte deshalb sein
  zwischengespeichertes Bild: gemessen führten drei Ereignisse zu **einem**
  einzigen Abruf am Server. Bildadressen bekommen jetzt einen wechselnden
  Parameter, damit jeder Alarm den aktuellen Schnappschuss holt (drei
  Ereignisse → drei Abrufe). Webseiten im iframe bleiben unangetastet, dort
  könnte ein zusätzlicher Parameter einen Token stören.
- Steht schon ein Bild-Overlay, wird nur die Quelle getauscht statt alles neu
  aufzubauen — beim mehrfachen Klingeln blitzte es sonst kurz leer auf.

**Neu**

- **Die `car`-Kachel zeigt die laufende Fahrt.** Liefert das Fahrzeug Ziel und
  Restzeit (`active_route_destination`, `active_route_minutes_to_arrival`),
  steht in der Kachel Ziel, **Ankunftszeit** und Restminuten. Mit
  `home=<text>` in `vizCar` heißt die Zeile „🏠 Zuhause" und wird farbig
  hervorgehoben, sobald das Ziel diesen Text enthält.
- Die Zeile erscheint **nur bei frischen Werten** (Default 15 Minuten,
  `routeAge=` ändert das) und nur, solange ein Ziel gesetzt ist. Beim
  Fahrtende räumt der Adapter das Ziel weg, und die Restzeit bleibt sonst
  stehen — im Bestand lagen „7 Minuten" zwei Tage lang im Gerät. Eine
  Ankunftszeit daraus wäre frei erfunden gewesen.
- **Ladestand wie in der Tesla-App:** ein Balken, die Füllung ist der
  Ladestand, der **Griff darauf ist das Wunschlimit** und wird direkt gezogen.
  Damit sitzt die Bedienung dort, wo der Wert steht, und die eigene
  Reglerzeile darunter entfällt — eine Zeile weniger auf einer engen Kachel.
  Darüber die Zeile „Ladelimit: X % · lädt 7,6 kW".
- **Fahrzeugbild** über `attr <dev> vizCar image=<url>`, auf Wunsch **je
  Ladezustand ein eigenes**: `image=laedt:<url>|steckt:<url>|frei:<url>`. Den
  Zustand ermittelt die Kachel aus der Leistung (Fahrzeug oder Wallbox), dem
  Zustandstext der Wallbox und `charge_port_door_open`; ein eigenes Reading
  geht per `plug=`. Drei zugeschnittene und **freigestellte** Beispielbilder
  liegen unter `www/fhemviz/img/car/` und kommen mit dem `update` mit — ohne
  Hintergrund steht das Fahrzeug direkt auf der Kachel, unabhängig von Skin
  und Hintergrundbild.

## v0.36.0 — 21.08.2026

**Geändert**

- **`vizHero full` lässt die anderen Kacheln stehen.** Bisher blendete der
  TV-Modus die übrigen Kacheln des Raums aus — die Vollbild-Kachel war die
  ganze Seite. Jetzt belegt sie die **erste Seite** der Szene, und das
  vorhandene Auto-Paging blättert danach zu den übrigen weiter; die Kopfzeile
  zählt mit (`Draußen · 1/2`). Möglich, weil die Kachel eine feste Höhe von
  genau einem Schirm hat statt sich den Platz per Flexbox zu nehmen.

**Neu**

- **`attr <viz> tvHeroSec <Sekunden>`** — eigene Standzeit für die
  Vollbild-Kachel. Was von der Szenenzeit übrig bleibt, teilen sich die
  Kachelseiten danach. Ohne das Attribut bleibt es bei der Gleichverteilung.

## v0.35.6 — 20.08.2026

**Behoben**

- `mealplan` zeigte im TV-Modus Bedien-Knöpfe. Im TV-Modus ist die ganze Sicht
  readonly; alle anderen Widgets prüfen das, dieses eine nicht. Die Knöpfe
  standen also auf dem Wandtablet und taten nichts — `sendCommand()` prallt an
  derselben Prüfung ohnehin ab. Nebeneffekt: sie nahmen der Vollbild-Kachel die
  Höhe weg, die den Wochentagen fehlte.

## v0.35.5 — 20.08.2026

**Behoben**

- `vizHero full` ragte über den Schirm: die Höhenkette war bei `.viz-room`
  unterbrochen, ein `height: 100%` am Hero-Band griff damit ins Leere. Gemessen
  waren es 692 px Kachel in 494 px Fläche — das Auto-Paging blätterte
  mitten durch die Zeichnung („1/2" bei einer einzigen Kachel).
- `mealplan` lief in der Vollbild-Kachel unten aus der Karte. Widgets erkennen
  den Fall jetzt am Attribut `data-hero="full"` und dürfen darauf reagieren:
  Kopf gedeckelt, Tagesliste teilt sich die Resthöhe.

## v0.35.4 — 20.08.2026

**Behoben**

- `mealplan`: das Vorschaubild verdeckte den Anfang des Gerichts. Die
  Bildspalte stand fest auf 40 px, im TV-Modus ist das Bild 54 px breit.
- `vizHero full` überschrieb ein am Gerät gesetztes `vizSize` mit `2x2`.

## v0.35.3 — 20.08.2026

**Neu**

- **`vizHero full`** — der Blickfang nimmt die ganze sichtbare Fläche ein statt
  nur eine Zeile. Auf dem Fernseher ist die Kachel damit die Seite, auf
  Tablet/Handy füllt sie den ersten Schirm. Gedacht für einen eigenen Raum mit
  genau einem Gerät, der als TV-Szene rotiert.

## v0.35.2 — 19.08.2026

**Behoben**

- TV-Modus: der Sekundentakt der Uhr-Seite (`#uhr`) lief beim Wechsel auf eine
  Szene weiter und übermalte sie nach einer Sekunde wieder. Der rote
  Ereignisrahmen blieb dabei stehen — sichtbar als „Szene erscheint kurz, dann
  ist die Uhr wieder da". Dieselbe Ursache traf `set <viz> page` und die
  Touch-Übernahme (dort blieb die Kopfleiste ausgeblendet).

## 18./19.08.2026

**Neu**

- **Widget `watertank`** — Regenwasseranlage als lebendiges Anlagenschema:
  Füllhöhen in Litern, gestrichelte Linie für die Schwimmerhöhe, Rohre leuchten
  nur bei echtem Transport. Behälterzahl aus `ibcUsableVolume`.
- `watertank` rechnet die Füllstände während eines Laufs mit und zeichnet alle
  5 s neu — das Modul bucht erst am Ende. Nebeneffekt als Selbstkontrolle:
  läuft der Behälter auf 0 und die Pumpe weiter, ist die gelernte Rate zu hoch.

**Behoben**

- `watertank`: Kontrast im Dark-Theme.

## v0.34.52 — 16.08.2026

**Behoben**

- **csrfToken nach einem FHEM-Neustart.** FHEMWEB würfelt bei jedem Start einen
  neuen Token; ein offener Tab kannte nur den alten. Der Longpoll braucht keinen
  Token und lief weiter, die Kopfzeile meldete also „live" — jeder `?cmd=`-Aufruf
  wurde dagegen mit `400` abgewiesen. Resync, Diagramme und **alle
  Schaltbefehle** liefen stumm ins Leere. Der Client holt den Token jetzt aus dem
  Header `X-FHEM-csrfToken` jeder Antwort nach, auch aus der Fehlerantwort.
- `command()` gab eine Fehlerantwort als normalen Text zurück — ein abgewiesener
  Schaltbefehl sah damit aus wie Erfolg.
- Schlägt der Resync zweimal hintereinander fehl, steht in der Kopfzeile
  „Daten veraltet" statt „live".
- Aufwachen des Tablets (`visibilitychange`/`online`) erneuert Longpoll und
  Daten sofort, statt bis zu 2,5 Minuten auf den Watchdog zu warten.
- `mealplan`: die Kachel beginnt bei heute (rollendes Fenster), nicht starr bei
  Montag.

## 14./15.08.2026

**Neu**

- **Auf/Stop/Zu** für die einzelne Rollladen-Kachel. Endlagen über `pct 0/100`,
  weil `up`/`down` bei CUL_HM **relativ** sind (ein Schritt, Standard 10 %).
  Der Stop-Knopf erscheint nur, wenn das Gerät `stop` kennt.

**Behoben**

- Installierte Verknüpfung behält die URL-Parameter (iOS): ein relatives
  `start_url` im Manifest lässt sich von einer `data:`-URI aus nicht auflösen —
  ohne Angabe gilt die Dokument-Adresse, und die trägt die Parameter.
- `SPA_VERSION` wird mit der Modul-Version nachgezogen. Eine vergessene der
  vier Stellen meldet sonst bei *jedem* Laden einen Versionskonflikt.

## 11.08.2026

**Neu**

- **Manifest zur Laufzeit**, Symbole als `data:`-URI eingebettet
  (`attr <viz> pwa 0` schaltet ab). Damit erscheint das App-Symbol auf Android
  auch, wenn FHEM hinter `basicAuth` steht: Android lädt das Symbol über einen
  Google-Dienst nach, also ohne Sitzung — vorher blieb es leer.
- App-Symbol ist das Kachel-Raster statt der Sonne.
- Die Farbschwelle in `vizReadings` darf ein **anderes** Reading auswerten.

## 08.08.2026

**Neu**

- **Widget `mealplan`** — Wochenplan aus dem BRING-Interface: heute groß mit
  Foto, die übrigen Tage als Streifen, würfeln/bewerten/Einkauf direkt aus der
  Kachel. Knöpfe erscheinen nur für set-Befehle, die in `PossibleSets` stehen.

## 06.08.2026

**Neu**

- **Hinweis-Leiste für Störungen** — sammelt alle `vizAlert`-Attribute der
  geladenen Geräte unter der Kopfzeile; ohne Störung ist sie unsichtbar.
- `attr <viz> sound` — Ton beim Einblenden von Bild oder Nachricht.

**Behoben**

- Auswahlzeile mit Label: Dropdown klappt nach rechts statt in die Mitte.

## 04./05.08.2026

**Neu**

- `attr <viz> roomPrefix` — eigene Raumnamen für eine zweite Sicht; das Präfix
  wird in Tabs und Überschriften abgeschnitten.
- Agenda färbt „Morgen" ein und blendet abgelaufene Termine aus.
- Schiebeschalter auch in den `vizIcon`-Zeilen.

**Behoben**

- Ein Antippen der Reglerschiene schaltet nicht mehr (nur Ziehen zählt) —
  vorher war ein Griff ans rechte Ende volle Lautstärke.
- Der gemerkte Tab liegt je Sicht in `localStorage`; vorher haben sich zwei
  Sichten die Raumwahl gegenseitig überschrieben.

## 03.08.2026

**Neu**

- **Editiermodus `?edit=1`** — Reihenfolge, Größe, Hero und Ausblenden direkt
  in der Oberfläche; später auch das Verschieben in andere Räume und
  Abschnitte. Absichtlich kein Attribut am Gerät: so ist er nur für den einen
  Browser an, der ihn aufruft, und das Wandtablet bleibt unberührt.
- **Widget `cameragroup`** — Kameras als `structure`-Kachel.

## 01./02.08.2026

**Neu**

- **Widget `car`** mit Wunschlimit und Wallbox (`attr <dev> vizCar`). Die
  Regler-Spannen kommen aus den `PossibleSets` der Geräte.
- Lüften-Palette nach dem `devStateIcon`, alle sieben Stufen unterscheidbar.

**Behoben**

- Uhr-Seite zeigte alles doppelt; jetzt ohne Kopfleiste statt ohne Inhalt.
- Mehrere Skin-`zeilen`-Fehler: Prognose-Balken fehlten, Kacheln fluchteten
  nicht, die Fenster-/Tür-Gruppe war viel zu hoch.
- Langes Dropdown klappte beim Scrollen zu.
