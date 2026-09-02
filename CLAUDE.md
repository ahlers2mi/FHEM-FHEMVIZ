# FHEMVIZ – Arbeitsweise und Projektwissen

## Ablauf bei Änderungen (wichtig)

Der Nutzer arbeitet in dieser Reihenfolge:

```
ich: denken, ändern, testen  →  PR
Nutzer: mergen  →  Branch löschen  →  in FHEM: update  →  reload 98_FHEMVIZ  →  modify
```

Daraus folgt für **jede** Änderungsrunde:

1. **Vor dem Anfangen** `git fetch origin main` und den Arbeitsbranch auf
   `origin/main` setzen bzw. darauf rebasen. Der Branch wird nach jedem Merge
   gelöscht; ein lokal noch vorhandener Branch enthält damit gemergte
   Geschichte, die nicht erneut in einen PR gehört.
2. **Nach dem Push immer prüfen, ob ein OFFENER PR existiert** – und wenn
   nicht, einen neuen anlegen. Ein gemergter PR nimmt keine weiteren Commits
   auf: sie liegen dann unsichtbar auf dem Branch, während der Nutzer glaubt,
   alles sei drin.
   > **Das Warnsignal steht in der Push-Ausgabe:** schreibt der Server
   > `remote: Create a pull request for '<branch>' … by visiting`, dann gibt es
   > für diesen Branch **keinen** offenen PR. Diese Zeile ist zweimal
   > übersehen worden, und beide Male fehlten dem Nutzer die Fixes.
3. Ein PR pro Runde. Merkt der Nutzer währenddessen etwas an, kommt es in
   denselben PR – solange er noch offen ist.

## Versionsnummer: vier Stellen

Die Zahl steht an **vier** Stellen und muss überall gleich sein, sonst meldet
die Oberfläche bei jedem Laden einen Versionskonflikt:

1. Kopfkommentar `# Version:` in `FHEM/98_FHEMVIZ.pm`
2. `my $FHEMVIZ_VERSION = "98_FHEMVIZ.pm:v…"`
3. die Ausgabe von `get config` (`FHEMVIZ_jsonStr("v…")`)
4. `SPA_VERSION` in `www/fhemviz/js/app.js`

**Nicht pauschal per `sed` ersetzen.** Im POD stehen „ab v0.x.y"-Angaben, die
die *Einführungsversion* eines Attributs nennen – ein `sed 's/v0.35.3/v0.35.4/g'`
zieht die mit hoch und behauptet dann etwas Falsches. Gezielt die vier Zeilen
ändern und danach `grep` gegenprüfen.

`controls_FHEMVIZ.txt` **nie** von Hand anfassen – das pflegt ein Workflow auf
`main`.

## Aussehen erst zeigen, dann einbauen

Bei allem, was **gestaltet** ist – gezeichnete Grafik, Symbole, ein neues
Bedienelement, eine andere Anordnung – gilt: **erst ein Bild schicken, Freigabe
abwarten, dann in die Kachel einbauen.** Nicht umgekehrt.

Wie es schiefging: ein selbst gezeichnetes Auto (drei Ladezustände als SVG)
wurde gebaut, dokumentiert, das README-Bild neu aufgenommen und gepusht – und
war dann schlicht hässlich. Der Nutzer hatte ausdrücklich um Bilder gebeten,
nicht um eine Umsetzung. Alles wieder auszubauen kostete mehr als das
Vorzeigen gekostet hätte, und die Commit-Geschichte trägt den Umweg dauerhaft.

Daraus abgeleitet:

- **Gezeichnetes von Hand ist der Verdachtsfall.** Ein Auto, ein Tier, ein
  Gerät: eine ansprechende Illustration lässt sich nicht in SVG-Koordinaten
  hinschreiben. Für so etwas Bilder von außen nehmen (`image=<url>`) und die
  Beschaffung dem Nutzer lassen.
- **Schemazeichnungen sind etwas anderes.** `watertank` und `flow` zeigen eine
  *Anlage* – Behälter, Rohre, Flussrichtung. Das ist Technik, keine Illustration,
  und funktioniert gut.
- Der Unterschied liegt in der Frage: zeichnet es einen **Zusammenhang** oder
  soll es **schön aussehen**? Das Erste ja, das Zweite nicht ohne Vorlage.

## Wer scrollt hier eigentlich?

Für alles, was am Scroll-Container hängt (`scroll-snap-type`,
`scroll-padding-top`, `overscroll-behavior`), muss man wissen, **welches
Element** der Scroller ist – und das wechselt:

- normal (Tablet/Browser) scrollt das Dokument, die Regel gehört an `html`;
- mit `?zoom=`/`attr zoom` gilt `html { overflow: hidden }` und
  `body { overflow-y: auto }` – dann ist **`body`** der Scroller;
- im TV-Modus scrollt gar nichts, dort blättert das Auto-Paging.

Beim `snap`-Attribut war genau das der Fehler: die Regel stand nur an `html`,
also rastete das Handy (`zoom 0.9`) nie – das Gerät, auf dem am meisten
gewischt wird. Zweite Falle: ohne `scroll-padding-top` in Kopfhöhe rastet es
sauber und die Kachel steckt trotzdem unter der klebenden Kopfzeile.

Messrezept: nach `mouse.wheel` 900 ms warten (Snap ausrollen lassen), dann je
Kachel `getBoundingClientRect()` gegen die Unterkante der Kopfzeile und
`window.innerHeight` prüfen – Anzahl **und** fehlende Pixel zählen. Nur die
Anzahl täuscht: eine 20-px-Schliere zählt wie eine halbe Kachel.

## Ein Balken, EINE Skala

Liegt ein `input[type=range]` über gezeichneten Farbflächen, müssen beide
dieselbe Skala haben. In der `car`-Kachel taten sie es nicht: Füllung und
blasse Strecke rechneten auf 0–100, der Regler übernahm seine Spanne aus dem
`setList` (`wish_charge_limit:slider,20,5,100`). Ein Limit von 25 % saß damit
bei (25−20)/(100−20) = **6 %** der Schiene, während die Farbfläche daneben bei
25 % endete – der Griff stand mitten in der Ladestands-Füllung.

Peinlich daran: in `FHEM-Instanz/CLAUDE.md` stand dazu monatelang „sieht falsch
aus, ist es nicht". Für den *Regler allein* stimmte das; sobald daneben eine
Fläche auf 0–100 gezeichnet wird, ist es schlicht falsch. **Wer eine Erklärung
für „sieht falsch aus" gefunden hat, sollte prüfen, ob sie noch gilt** – hier
hatte sich der Balken danach geändert und der Nutzer musste es finden.

Richtig: der Regler läuft über 0–100 (Positionierung), und was das Gerät
annimmt – Anfang und Schrittweite aus dem `setList` – wird beim *Ziehen und
Senden* geklemmt. Messrezept: `getBoundingClientRect()` der Farbflächen gegen
`(value−min)/(max−min)` des Reglers, beides in Prozent der Bahn.

## Bilder freistellen (Fahrzeugbilder, KI-Renderings)

Vier Versuche, drei davon falsch – die Reihenfolge lohnt sich zu merken:

1. **Fluten vom Rand über die Farbähnlichkeit** frisst die Reifen. Sie sind
   genauso dunkel und farblos wie der Hintergrund; jede Maske, die den
   Hintergrund trifft, trifft sie mit.
2. **Hintergrund auf die Kachelfarbe ziehen** lässt einen Hof stehen: die
   Vignette dicht am Auto ist heller als die Kachel.
3. **Rand zusätzlich weich ausblenden** versteckt die Kante, aber der Hof
   bleibt, und die Kachelfarbe muss stimmen – gemessen war die Karte
   `rgb(17,21,27)`, nicht `--viz-surface: #151920`.
4. **Was funktioniert: über die Kante freistellen, nicht über die Helligkeit.**
   Der Hintergrund eines Renderings ist eine weiche Vignette (fast kein
   Gradient), die Karosserie hat eine harte Silhouette. Also vom Bildrand her
   fluten, aber **nur durch Pixel mit kleinem Gradienten** (`< 2,5` auf der
   um σ 1,4 geglätteten Helligkeit, dazu `Helligkeit < 110` und
   `Sättigung < 22`). Das läuft über den ganzen Hof und bleibt an der
   Silhouette stehen; die Reifen schützt ihre eigene Kante.
   Danach kriecht das Fluten noch durch die Reifen in flache dunkle
   Karosserieflächen – Gegenmittel: **je Zeile/Spalte kurze Lücken zwischen
   zwei Auto-Pixeln zuschütten** (Zeile 22 %, Spalte 10 % der Bildkante).
   „Kurz" ist wichtig, sonst wird auch der echte Freiraum unter dem Wagen und
   zwischen Auto und Ladekabel zugeschüttet.

Skript: `frei3.py` im Sitzungs-Scratchpad. Kein `scipy` installiert, Flutfüllung
und Zusammenhangskomponenten daher selbst als BFS.

**Grünscreen ist der einfache Fall.** Liegt das Rendering vor grünem Grund,
geht es nicht über die Helligkeit, sondern über die **Grünstichigkeit**
`g − max(r,b)`: Hintergrund über ~110, Vordergrund unter ~25, dazwischen ein
weicher Übergang (harte Schwelle franst die Silhouette aus). Danach
**entfärben** – Grün auf `max(r,b)` klemmen, sonst leuchtet der Saum grün.
Beim Tesla vor Grün waren 77 % der Pixel eindeutig Hintergrund, 19 % eindeutig
Auto und nur 4 % dazwischen; Reifen und ein millimeterdünnes Ladekabel blieben
vollständig erhalten. Der ganze Aufwand oben gilt nur für Bilder **ohne**
Grünscreen.

**Immer auf hellem UND dunklem Grund gegenprüfen.** Auf der dunklen Kachel
sieht ein weggefressener Reifen aus wie ein Reifen – auf hellem Grund fällt es
sofort auf. Beide Proben in ein Bild, dann einmal hinsehen.

**Format bleibt PNG.** WebP wäre kleiner (36 statt 350 kB), aber FHEMWEB kennt
die Endung in seiner MIME-Tabelle nicht. Auf 256 Farben quantisieren spart
genauso viel, macht aber sichtbare Streifen im blauen Lack – nachgesehen.

## Änderungen wirklich prüfen: FHEMWEB-Attrappe + Playwright

Layout-Fehler lassen sich nicht am Code erraten – zweimal ist genau das
schiefgegangen (`vizHero full` ragte über den Schirm, obwohl die CSS-Regel
„richtig" aussah). Die Umgebung hier hat Chromium und Playwright, damit geht
ein echter Test:

- Ein kleiner Node-Server bedient die **drei** Endpunkte, die die SPA braucht:
  `?cmd=get <viz> config` (Konfigurations-JSON), `?cmd=jsonlist2 <devspec>`
  (`{Results:[{Name,Internals,Attributes,PossibleSets,Readings}]}`) und
  `?XHR=1&inform=…` (Longpoll – Antwort offen lassen, nie beenden).
  Statische Dateien unter `/fhem/fhemviz/` ausliefern.
- Gerätedaten aus dem Repo `FHEM-Instanz` nehmen (`fhem.cfg` für Attribute,
  `fhem.save` für Readings) – dann prüft man den echten Fall, nicht ein
  Fantasiegerät.
- Playwright mit `executablePath: "/opt/pw-browsers/chromium"`, Viewport
  1280×800, URL `…/index.html?mode=tv&device=myViz&width=1000`.
- **Nicht nur schauen, messen.** Der verlässliche Prüfwert für „ragt etwas
  hinaus" ist `app.scrollHeight - app.clientHeight` (muss 0 sein) am Element
  `#fhemviz-app`; dazu die Kopfzeile: steht dort „· 1/2", blättert das
  Auto-Paging, also passt es nicht.
- **Ohne `isMobile: true` ist der Meta-Viewport wirkungslos.** Desktop-Chromium
  ignoriert ihn schlicht – `window.innerWidth` bleibt die Fenstergröße, und ein
  Fehler, der am Viewport hängt, ist **nicht zu sehen**. Der TV-Zoom-Fehler
  (v0.37.10) sah in der ersten Messung deshalb heil aus. Wer etwas prüft, das
  mit `meta viewport`, `screen.width` oder `innerWidth` zu tun hat, braucht
  einen Kontext mit `isMobile: true, hasTouch: true` und einem Android-UA.
- Achtung: `getBoundingClientRect()` liefert im TV-Modus **skalierte** Werte
  (`?width=` setzt `transform: scale()`), `getComputedStyle` dagegen CSS-Pixel.
  Beim Vergleich der beiden Zahlen sonst falsche Schlüsse.

## Bedienbarkeit: im TV-Modus ist alles readonly

`app.js` setzt `readonly: tv || cfg.readonly === true`. Ein rotierender
Wandschirm schaltet also nichts; ein Tipp wechselt über `tvTouch` in die
bedienbare Tablet-Ansicht. **Jedes** Widget muss `this.readonly` prüfen, bevor
es Knöpfe, Regler oder Schalter zeichnet – `mealplan` tat es nicht und zeigte
auf dem Wandtablet Knöpfe, die nichts taten (`sendCommand()` prallt an
derselben Prüfung ab).

## Höhen im TV-Modus: die Kette muss durchgehen

`html[data-vizmode="tv"] #fhemviz-app` ist genau einen Schirm hoch
(`--viz-vh` minus Kopfhöhe) und ein Flex-Container. Dazwischen liegt aber
`.viz-room`, und das hat von sich aus **keine** Höhe – ein `height: 100%` an
einem Kind davon greift ins Leere (Prozent auf unbestimmte Höhe = `auto`).
Wer eine Kachel auf Schirmhöhe bringen will, muss die Kette schließen:
Raum zum Flex-Container machen, dann `flex` + `min-height: 0` nach unten
durchreichen. `min-height: 0` ist Pflicht, sonst verweigert Flexbox das
Schrumpfen unter die Inhaltshöhe.

**Im Browser gilt dasselbe, nur ohne TV-Regeln.** `vizHero full` hatte lange
nur eine `min-height` – damit bestimmte allein die **Breite** die Höhe, und in
einem breiten Fenster (1850×820) wurde die `watertank`-Kachel 926 px hoch bei
780 px sichtbarer Fläche. Zwei Lehren:

- **`max-height` allein schrumpft nichts.** Die Grid-Zeile ist implizit `auto`
  und richtet sich nach dem Inhalt; die Obergrenze schneidet dann nur ab
  (gemessen: Band 690, SVG weiter 813). Erst
  `grid-template-rows: minmax(0, 1fr)` erlaubt der Zeile, unter die
  Inhaltshöhe zu gehen – dann wird die Zeichnung kleiner (690/577).
- **Regeln für Tablet/Browser nach `html:not([data-vizmode="tv"])` sperren.**
  Die Obergrenze rechnet mit −90 px, der TV mit `--viz-tv-pad-y` (56 px). In
  der gemeinsamen Regel gewinnt die kleinere Zahl und kürzt das TV-Band von
  660 auf 617 – genau der Fehler, den die TV-Regel verhindern soll. Im Test
  aufgefallen, weil die A/B-Messung (Änderung stashen, erneut messen) beide
  Modi mitnimmt.

**Auf dem Handy gibt es kein Vollbild.** Im Skin `zeilen` ist die Seite eine
durchgehende Liste; eine Kachel über den ganzen Schirm kostet dort die halbe
Liste, und gescrollt wird ohnehin. Seit v0.37.18 zählt `full` unter diesem Skin
darum wie `1` (gemessen 420×900: `watertank` 770 → 284 px, `mealplan` 770 →
600 px). Die Entscheidung sitzt in `layout.js` an **einer** Stelle – der
Variablen `heroFull`, aus der Bandklasse, `data-hero` und `data-size` folgen –
und **nicht** in `isHeroFull()`: das liest weiter nur das Attribut, damit der
Dreifach-Schalter im Bearbeiten-Modus den echten Wert zeigt und dasselbe Gerät
auf dem Wandtablet Vollbild bleibt.

Kacheln, die ihre Höhe selbst ausrechnen, überlaufen sonst:
`watertank` leitet die SVG-Höhe aus der Breite ab (viewBox 220:108),
`mealplan` hat sieben feste Zeilen. Widgets erkennen den Vollbild-Fall am
Attribut `data-hero="full"` und dürfen darauf reagieren.

## Eine ausreißende Kachel zieht die Nachbarin mit

Im Hero-Band steht `align-items: start` mit dem Kommentar „die Kachel wächst mit
dem Inhalt". **Das stimmte nicht.** Jedes Widget bringt aus `base-widget.js` ein
`:host { height: 100% }` mit, und eine Prozenthöhe an einem Grid-Element rechnet
gegen die **Zeile** – und die ist so hoch wie die höchste Kachel darin. Die
Absicht der Regel war damit von einer Zeile im Widget-Grundgerüst ausgehebelt.

Gemessen im Raum Solar (TV, `width=1000`, Schirm 1280×800): die Auto-Kachel ist
534 px hoch (Bild 230 + acht Zeilen), mySolvis braucht 300 – und bekam trotzdem
534. 234 px Loch unter dem letzten Wert. Der Nutzer beschrieb es als „wenn eine
Kachel ausreißt, passt das ganze Bild nicht mehr".

Behoben mit `.viz-hero:not(.full) > * { height: auto; align-self: start; }`. Das
`:not(.full)` ist Pflicht: `vizHero full` streckt **absichtlich** auf die
Schirmhöhe.

**Vier Pixel kosten eine ganze Seite.** Das Auto-Paging bricht an Kachelzeilen
(`computePageOffsets`), eine Zeile bekommt also entweder ganz oder gar nicht
Platz. Zeile 1 des Bandes endete bei 576 px bei 572 px Schirm – die Auto-Karte
wurde unten angeschnitten *und* die zweite Bandzeile bekam eine eigene, halb
leere Seite.

## Die Kopfzeile ist nicht 40 px hoch

Genau hier ist die Messung oben danebengegangen, und der Nutzer musste es mit
Bildschirmfotos vom Wandtablet nachweisen: **eine feste Obergrenze am Autobild
war die falsche Antwort, weil die Seitenhöhe gar nicht feststeht.**

Die Attrappe lief mit einer nackten Kopfzeile (40 px) und ergab einen Schirm
von 572 px. Sein `myViz` hat aber `headerInfo` (drei Chips) **und** `statusBar`
(vier Chips) – zusammen drei Zeilen, **138 px**. Der Schirm ist damit **487 px**,
nicht 572. Die Auto-Kachel (504 px) überschoss also nicht um 4 px, sondern um
59 – Wallbox-Zeile weg, sieben Seiten statt sechs.

Zwei Lehren:

- **Die Sicht-Attribute gehören in die Attrappe, nicht nur die Geräte.**
  `headerInfo`, `statusBar`, `background`, `hideRooms` – ohne sie misst man ein
  Dashboard, das es beim Nutzer nicht gibt. Die Werte stehen in
  `FHEM-Instanz/Main/fhem.cfg` unter `attr myViz`.
- **Feste Pixelgrenzen sind hier immer verdächtig.** Was auf eine Seite passt,
  hängt an einer Kopfzeile, die mit jedem Chip und jeder Störungsmeldung wächst.
  Richtig ist der Deckel gegen `--viz-vh − --viz-header-h − --viz-tv-pad-y`,
  also gegen die *gemessene* Kopfhöhe.

Seit v0.37.17 gilt darum im TV `max-height` in genau dieser Rechnung für jede
Hero-Kachel. **Der Deckel allein reicht nicht** – derselbe Stolperstein wie bei
`hero full`: das Widget setzt seine `.card` auf `height: 100%`, und Prozent auf
eine Höhe `auto` ist wieder `auto`. Die Karte blieb 504 px hoch und ragte
einfach aus dem 431 px hohen Host heraus (nachgemessen: Host 431, Karte 504).
Erst `display: grid` + `grid-template-rows: minmax(0, 1fr)` gibt der Karte eine
**bestimmte** Höhe, die unter die Inhaltshöhe darf. Grid statt Flex, weil ein
Grid-Item auch in der Breite streckt; die Karte liegt im Shadow-DOM und ist von
außen nicht ansprechbar.

Damit dabei der Inhalt stehenbleibt und nicht abgeschnitten wird, braucht die
Kachel ein **nachgiebiges Stück**: `car` markiert sein Bild mit
`flex: 0 1 auto; min-height: 0` (ohne das `min-height` verweigert Flexbox einem
Bild das Schrumpfen). Das Bild ging von 200 auf 143 px, `scrollHeight` 429 bei
431 px Karte – nichts fällt weg. Eine Hero-Kachel **ohne** so ein Stück wird vom
Deckel beschnitten; das ist immer noch besser als heute, wo sie unter der
Seitenkante verschwindet, aber beim Bauen neuer Hero-Widgets daran denken.

Was **nicht** hilft (jeweils gemessen, Raum Solar, echte Kopfzeile 138 px):

| Versuch | Seiten |
|---|---|
| ein `vizHero` weniger – egal welches | 6 → 6, die Höhe wandert nur nach unten |
| Band im TV dreispaltig (min 280 px) | 6 → 5, aber mySolvis kürzt seine Beschriftungen ab |
| eigene Höhen allein | 6 → 6, nur das Loch verschwindet |
| kleineres Wettersymbol (`icon=…:10rem` → 4rem) | 7 → 7, Kopf bleibt 138 – die Höhe machen die **Chip-Zeilen**, das Symbol liegt daneben |

Bei `width=1000` passen wegen `minmax(min(100%, 320px), 1fr)` genau **zwei**
Hero-Kacheln nebeneinander. Drei `vizHero` in einem Raum ergeben damit zwangs-
läufig zwei Bandzeilen, also mindestens zwei Seiten allein für das Band.

## Der Pager maß, bevor das Bild da war

„Scrollen tust du nicht genug": Seite 2 begann mitten in der Auto-Kachel, und
zwar auf **jeder** Seite um dieselben 127 px zu hoch. `_page()` rechnete die
Offsets **einmal**, synchron direkt nach `_render()` – da ist ein `<img>` ohne
feste Höhe noch 0 px hoch. Kommt das Bild (auch aus dem Cache, das ist trotzdem
asynchron), rückt alles darunter um die Bildhöhe nach unten, die Offsets stimmen
nicht mehr. Gemessen: ohne Bild `[0, 346, 796, …]`, mit Bild `[0, 473, 923, …]`.

Seit v0.37.19 misst `_page()` **beim Blättern frisch** (`computePageOffsets`
im Timer statt vorab) und prüft eine Sekunde nach dem Zeichnen die Seitenzahl
noch einmal; hat sie sich geändert, wird mit der Restzeit neu geplant.
Messrezept dafür: `pager.js` im Scratchpad – Szene mit bekannter Dauer
(`tvScenes Solar:12`), Fahrzeugbild im Mock um 0/500/1500 ms verzögern und
`scrollTop` zu festen Zeitpunkten gegen die Soll-Offsets halten. Der alte Code
lag **auch bei 0 ms Verzögerung** daneben – das Bild ist beim Messen schlicht
nie da.

## Zwei Regeln, ein Pseudo-Element: die Seite wurde bei jedem Event dunkler

Der **rote Rahmen** um den ganzen Schirm ist die Markierung einer
Event-Übernahme (`set <viz> scene <Raum> <sek>`; in der Kopfzeile steht dann
„· Event"). Am 02.09. kam er von `set d_tablet_esszimmer web Weather` →
`set myViz scene Wetter 60`. Der Nutzer meldete „der rote Rahmen ist wieder da"
– gemeint war aber, wie sich beim Nachfragen zeigte, **dass die Seite dabei
dunkler wird**. Erst die zweite Frage hat das Symptom richtig benannt; ich
hatte den Rahmen erklärt und den Fehler übersehen.

Ursache: der Rahmen stand an `body.viz-alert::after`, die Abdunklung des
Hintergrundbilds (`attr background`) an `body.viz-has-bg::after` – **dasselbe**
Pseudo-Element. Zwei Regeln auf einem Pseudo-Element verschmelzen: die Ebene
behielt `background` und `opacity 0.45` der Abdunklung, bekam aber den
`z-index 99` des Rahmens und lag damit **vor** dem Inhalt. Gemessen an einer
Kachel: Helligkeit 42,6 → 28,8. Ohne Hintergrundbild fiel es nie auf, darum
war es in der Attrappe so lange unsichtbar (siehe „Sicht-Attribute gehören in
die Attrappe").

Seit v0.37.19 hängt der Rahmen an `html.viz-alert::after`, die Klasse steht
am `documentElement`. Nachgemessen: `body::after` bleibt bei `z-index -1`,
Helligkeit im Event unverändert 42,6. Merksatz: **`::before`/`::after` eines
Elements sind zwei Slots, keine Liste** – wer eine zweite Ebene braucht,
nimmt ein anderes Element.

Der Fehlerfall von v0.37.14 („Rahmen **und** dunkler Schirm **und** Rotation
steht") hatte also zwei Ursachen: die stehende Rotation (damals behoben) und
diese Abdunklung, die ich damals für die Folge der stehenden Rotation hielt.

Messrezept: das Auto-Paging **anhalten**, sonst scrollt der Karussell-Timer
gegen die Messung und jede Seite zeigt etwas anderes
(`page.evaluate(() => { const m = setTimeout(()=>{},0);
for (let i=1; i<=m; i++) { clearTimeout(i); clearInterval(i); } })`). Danach die
Seiten-Offsets wie `computePageOffsets` nachrechnen und je Offset ein
Bildschirmfoto – erst der Kontaktabzug aller Seiten zeigt, was der Nutzer
tatsächlich durchblättert.

## `auto-fill` ist nicht `auto-fit`

Die Zahlenzeile der `watertank`-Kachel bekam in v0.37.12 zwei Werte dazu und
dafür `repeat(auto-fill, minmax(62px, 1fr))`. Auf der 2x2-Kachel sah das
richtig aus – auf der **Vollbild-Kachel** (1696 px breit) legte `auto-fill`
**25 Spuren** an, die fünf Zahlen saßen in den ersten fünf zu je 62 px, die
Beschriftung brach um („heute / geerntet"), der Rest der Zeile blieb leer.
Der Nutzer: „zusammengerutscht und super klein, das war vor 5,6 Releases
noch nicht so."

`auto-fill` behält leere Spuren, `auto-fit` lässt sie zusammenfallen und die
vorhandenen Elemente strecken – mit `auto-fit` sind es 334 px je Zahl.
**Faustregel:** wer eine Zeile „nach Platz" packen will und dabei die Elemente
über die Breite verteilt haben möchte, braucht `auto-fit`; `auto-fill` ist nur
richtig, wenn die Elemente ihre Mindestbreite behalten sollen (Symbolraster).

Dazu seit v0.37.20 größere Zahlen auf der Vollbild-Kachel
(`:host([data-hero="full"])`, 1,6 rem statt 0,95): die Zeichnung darüber ist
650 px hoch, 17-px-Zahlen wirken daneben verloren. Gilt im Browser wie im TV.

Und einmal mehr: der Fehler war nur auf der Vollbild-Kachel sichtbar, die
Attrappe hatte ihn (`herofull.js`) – gemessen wurde dort aber nur die Höhe,
nicht der Inhalt der Zeilen. **Ein Bild anschauen kostet zehn Sekunden.**

## Die Kopfhöhe ist Zustand, kein Startwert (Handy-Snap)

`scroll-padding-top` für das Einrasten hängt an `--viz-header-h`. Die wurde
**einmal** beim Start gemessen und danach nur bei `resize` – aber die Kopfzeile
wächst ohne `resize`: headerInfo- und statusBar-Chips kommen erst mit den
Gerätedaten, die Statuszeile wird länger („17 Gerät(e) · Zoom 0.9 · v…") und
schiebt auf dem Handy die Uhr in eine eigene Zeile, `vizAlert` blendet eine
Zeile ein und aus. Gemessen (412 px, `zeilen`, `zoom 0.9`): Variable **115**,
Kopfzeile echt **142** – die Kacheln rasteten **19 px unter** der Kopfkante
ein. Der Nutzer: „der Umbruch kommt, weil die Kopfzeile zu lang ist, dann
rasten die Kacheln zu hoch ein – nur auf dem Handy."

Seit v0.37.20 beobachtet ein `ResizeObserver` die Kopfzeile selbst und ruft
`measureViewport()` – nicht das Fenster, die Kopfzeile. Nachgemessen: Variable
142 = echt 142, Kacheln rasten bei 150 (Kopf + 8 px) ein, keine angeschnitten.
Messrezept: `handy-snap.js` im Scratchpad – nach dem Laden Variable gegen
`offsetHeight` halten, dann `mouse.wheel`, 900 ms warten, erste Kachel unter
der Kopfkante gegen `header.bottom` messen. Der Vergleich Variable ↔ echt ist
die schnellste Prüfung: stimmen die zwei Zahlen nicht, ist alles darunter
falsch, was mit der Kopfhöhe rechnet (Snap, TV-Fläche, Hero-Deckel).

**Zweiter Schritt, gleicher Fehlerbericht („snappt etwas zu hoch"):** die
Kachel stand danach korrekt bei Kopf + 8 px – aber die **Gruppenüberschrift
darüber** lag unter der Kopfzeile (h3 137–148 bei Kopfkante 142, auf dem Handy
„ALLGEMEIN" halb verdeckt). Snap-Ziel ist `.viz-grid > *`, die Überschrift
gehört nicht dazu. Seit v0.37.21 setzt `layout.js` der **ersten Kachel jeder
Gruppe** ein `scroll-margin-top` in Höhe von h3 (+ Rand) und, beim ersten
Block eines Raums, zusätzlich des h2 – **gemessen**, nicht geschätzt, weil die
Höhen je Skin verschieden sind (zeilen 13 px, bento 23 px). Nachgemessen:
h3 bei 150 (= Kopf + 8), Kachel bei 163, verdeckt 0. Merksatz: **wer an eine
Kante rastet, muss wissen, was über der Kante noch dazugehört.**

## Der Viewport ist Zustand, kein Startwert

Der TV-Modus rechnet seinen Skalierungsfaktor aus `window.innerWidth`. Die hängt
am Meta-Viewport – und der überlebt: die Tablet-Ansicht von `tvTouch` setzt
`width=<Layoutbreite>`, und ein WebView (Fully) nimmt das über ein Neuladen mit.

Steht dort zufällig dieselbe Zahl wie in `?width=` – beim Wandtablet **1000** –
dann ist `innerWidth / width = 1`, die Bedingung `if (Math.abs(zoom - 1) >
0.001)` greift nicht, und es wird **gar nicht** skaliert. Das Symptom heißt
darum „Zoom ganz weg", nicht „Zoom falsch": ein Faktor von exakt 1 fällt
stillschweigend durch.

Daraus drei Regeln:

- **Vor dem Messen zurücksetzen.** `resetMetaViewport()` erst, `innerWidth`
  danach. Ein gemessener Wert taugt nur, wenn man weiß, wer ihn gesetzt hat.
- **Einmal messen reicht nicht.** Ein Meta-Wechsel wirkt erst mit dem nächsten
  Layout – also `requestAnimationFrame` hinterher und auf `resize` hören. Das
  nimmt Drehen und Fenstergrößen gleich mit.
- **Der Nachmesser braucht einen Moduswächter.** Sonst bekommt die
  Tablet-Ansicht nach einem `tvTouch`-Wechsel doch noch ein `transform` am
  `body`, und ihre `position:fixed`-Tab-Leiste verrutscht.

`set <viz> reload` navigiert deshalb auch (`location.replace`) statt neu zu
laden: ein Neuladen stellt den vorherigen Seitenzustand wieder her – Scrollstand
und auf Mobilgeräten die Skalierung. Nach einem Versionswechsel will man einen
sauberen Start.

## Das Kachelraster: eine Zahl, drei Mitläufer

Die Zeilenspannweite einer Kachel wird **aufgerundet** – je gröber der
Rasterschritt, desto mehr Leerraum bleibt *in* der Kachel stehen. Mit den
ursprünglichen 104 px waren das bis zu 101 px (Sileno: 231 px Inhalt in einer
332 px hohen Kachel).

Am Rasterschritt (`--viz-tile-row`) hängen **drei abgeleitete Zahlen**, die
beim Ändern mitmüssen – sonst bricht es lautlos:

| | wo | Rechnung |
|---|---|---|
| `vizSize`-Zeilenspannweite | `registry.js` | 2 Einheiten ≈ 220 px, also 4 Schritte à 52 |
| Schwelle für die große Typografie | `layout.js` | soll bei denselben ~250 px Inhalt greifen |
| Obergrenze der Spannweite | `layout.js` | gleiche Maximalhöhe wie vorher |

Getrennt davon steht **`--viz-tile-unit`** (104 px, TV 140): das ist, was
„eine Kachel" *bedeutet*. Daran hängen `vizSize` und der **Bearbeiten-Modus** –
dort ist eine Rasterzeile weiterhin eine ganze Kachel (keine Auto-Spannweiten,
der Rahmen sitzt im Raster) und die Zeilenhöhe wird um die Werkzeugleiste
angehoben. Hinge das am feinen Schritt, bekäme jede der sieben Zeilen einer
Kachel die Leistenhöhe dazu.

Messrezept: je Kachel die *natürliche* Höhe (`alignItems: start`, `height:
auto`) gegen die Endhöhe stellen – die Differenz ist der Verschnitt. Und immer
gegen `main` messen, nicht gegen Zahlen von vorgestern: zwischen zwei Messungen
kann eine andere Sitzung etwas geändert haben.

## Was an der Position hängt, bedeutet nichts

Im bento-Skin stand eine Regel, die die **erste** Kachel jeder Gruppe doppelt
breit machte – „damit bekommt jeder Abschnitt einen Anker". Welche Kachel das
ist, entscheidet aber die alphabetische Reihenfolge bzw. `sortby`. Beim Nutzer
traf es einen 3D-Drucker und „Heute heizen", zwei einfache Schalter, während
die inhaltsreiche Kachel daneben schmal blieb. Sein Urteil: „das macht keinen
Sinn, sieht auch nicht logisch aus."

Teurer als nur schief: in einer Gruppe mit zwei Kacheln schiebt die breite
erste die zweite in die nächste Zeile, daneben bleibt eine Spalte leer. Der
Raum war dadurch **1303 statt 943 px** hoch – der Anker fraß genau den Platz
wieder auf, den das feinere Raster gerade gewonnen hatte. Deshalb kam auf die
Rasteränderung zunächst „geändert hat sich aber irgendwie wenig": zwei
Änderungen hoben sich auf, und ich hatte nur die eine gemessen.

**Wer hervorheben will, sagt es ausdrücklich** – `vizSize 2x1` oder `vizHero`.
Eine Regel, die aus der Sortierreihenfolge Bedeutung ableitet, hat keine.

## Varianten zeigen, nicht beschreiben

Bei den Rastergrößen hat sich derselbe Ablauf zweimal bewährt: den Raum mit
*seinen* Geräten nachbauen, drei Varianten rendern, als **ein** Bild mit
Beschriftung und gemessenen Zahlen schicken – und ihn wählen lassen. Beide Male
hat er in einer Zeile geantwortet, und beide Male war es nicht die Variante,
die ich empfohlen hatte.

Zwei Fallen beim Aufnehmen der Bilder, beide selbst hineingelaufen:

- **Kacheln unterhalb der Fensterkante werden nicht gezeichnet.** Der
  Element-Screenshot liefert dann eine Fläche in voller Größe, deren unterer
  Teil leer ist – das sah aus wie eine abgeschnittene Zeile und ich hätte es
  fast als Fehler gemeldet. Fenster hoch genug wählen (1500 px), dann prüfen:
  eine Bildzeile ganz ohne Kartenhintergrund ist das Erkennungszeichen.
- **`getBoundingClientRect()` kennt kein `overflow: hidden`.** Für „wird etwas
  abgeschnitten" taugt es nicht; `elementFromPoint` an der fraglichen Stelle
  oder `scrollHeight` gegen `clientHeight` schon.
