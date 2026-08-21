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

Kacheln, die ihre Höhe selbst ausrechnen, überlaufen sonst:
`watertank` leitet die SVG-Höhe aus der Breite ab (viewBox 220:108),
`mealplan` hat sieben feste Zeilen. Widgets erkennen den Vollbild-Fall am
Attribut `data-hero="full"` und dürfen darauf reagieren.
