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

Kacheln, die ihre Höhe selbst ausrechnen, überlaufen sonst:
`watertank` leitet die SVG-Höhe aus der Breite ab (viewBox 220:108),
`mealplan` hat sieben feste Zeilen. Widgets erkennen den Vollbild-Fall am
Attribut `data-hero="full"` und dürfen darauf reagieren.

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
