/*
 * FHEMVIZ - gezeichnetes Fahrzeug fuer die car-Kachel.
 *
 * Absichtlich SVG und kein Foto: es skaliert (TV-Modus, ?zoom=, ?width=),
 * braucht keine abgelegte Datei und keinen Abruf nach draussen, und es passt
 * sich dem Thema an. Ein Foto sieht neben den flachen Kacheln fremd aus.
 *
 * Bewusst STILISIERT, nicht abgezeichnet: eine Seitenansicht mit Fliessheck.
 * Der Versuch, ein bestimmtes Modell zu treffen, geht schief - und waere beim
 * naechsten Fahrzeug wieder falsch. Die Farbe kommt von aussen
 * (attr vizCar color=#1b4b9c), damit es dem eigenen Auto aehnelt.
 *
 * Drei Zustaende, weil genau die drei im Alltag zaehlen:
 *   "laedt"  - Kabel dran, Energie laeuft (Kabel wandert, Blitz leuchtet)
 *   "steckt" - Kabel dran, es laeuft nichts (gedaempft, kein Blitz)
 *   "frei"   - kein Kabel, Klappe zu
 */

export const CAR_ART_CSS = `
  .cart { width: 100%; display: block; }
  .cart .lack   { fill: var(--cart-lack, #1b4b9c); }
  .cart .dach   { fill: rgba(0, 0, 0, .45); }
  .cart .glas   { fill: rgba(140, 190, 255, .18); }
  .cart .reifen { fill: #14171c; }
  .cart .felge  { fill: none; stroke: var(--viz-muted, #77808c); stroke-width: 2.5; }
  .cart .kante  { fill: none; stroke: rgba(255, 255, 255, .18); stroke-width: 1.6; }
  .cart .boden  { fill: rgba(0, 0, 0, .35); }

  /* Kabel: im Ladebetrieb wandert das Strichmuster - dieselbe Sprache wie die
   * laufenden Punkte in der flow-Kachel. */
  .cart .kabel {
    fill: none; stroke: var(--viz-muted, #77808c); stroke-width: 3;
    stroke-linecap: round;
  }
  .cart.laedt .kabel {
    stroke: var(--viz-ok, #34c77b);
    stroke-dasharray: 7 6;
    animation: cart-fluss 1.1s linear infinite;
  }
  @keyframes cart-fluss { to { stroke-dashoffset: -13; } }
  @media (prefers-reduced-motion: reduce) {
    .cart.laedt .kabel { animation: none; stroke-dasharray: none; }
  }
  .cart .blitz { fill: var(--viz-ok, #34c77b); opacity: 0; }
  .cart.laedt .blitz { opacity: 1; }
  /* Angesteckt, aber es laeuft nichts: alles einen Ton zurueck. */
  .cart.steckt .kabel { stroke: var(--viz-border, #262c35); }
  .cart.steckt .klappe, .cart.laedt .klappe { opacity: 1; }
  .cart .klappe { fill: #0d1014; opacity: 0; }
`;

/**
 * @param {"laedt"|"steckt"|"frei"} zustand
 * @param {string} [farbe] Lackfarbe (CSS-Farbe); leer = Standardblau
 */
export function carArt(zustand = "frei", farbe = "") {
  const kabel =
    zustand === "frei"
      ? ""
      : // Von der Ladeklappe am Heck nach unten zum Boden, leichter Bogen.
        // Vom Anschluss nach HINTEN und dann zum Boden. Der erste Wurf lief
        // quer durchs Hinterrad - das Kabel muss rechts daran vorbei.
        `<path class="kabel" d="M180 55 C193 61 197 76 184 84 C176 89 172 90 172 95"/>`;

  return `<svg class="cart ${zustand}" viewBox="0 0 200 96" role="img"
       aria-label="Fahrzeug, ${zustand === "laedt" ? "lädt" : zustand === "steckt" ? "angesteckt" : "nicht angesteckt"}"
       ${farbe ? `style="--cart-lack:${farbe}"` : ""}>
    <ellipse class="boden" cx="100" cy="84" rx="78" ry="5"/>

    <!-- Karosserie: Fliessheck, Nase links -->
    <path class="lack" d="M14 62 C14 51 23 46 42 44 L58 42
      C72 25 132 25 150 43 L173 47 C186 49 190 54 190 62
      L190 67 C190 70 188 71 184 71 L20 71 C16 71 14 70 14 67 Z"/>
    <!-- Dachflaeche dunkel (Glasdach) -->
    <path class="dach" d="M60 42 C74 26 130 26 148 43 L128 39 L80 39 Z"/>
    <!-- Seitenscheiben -->
    <path class="glas" d="M66 41 C78 29 122 29 138 41 L124 38 L84 38 Z"/>
    <!-- Schulterlinie -->
    <path class="kante" d="M40 56 L168 56"/>

    <!-- Ladeklappe am Heck (nur sichtbar, wenn etwas steckt) -->
    <rect class="klappe" x="172" y="49" width="9" height="7" rx="1.5"/>

    ${kabel}

    <!-- Blitz ueber dem Heck, nur beim Laden -->
    <path class="blitz" d="M180 22 L188 22 L184 29 L191 29 L177 41 L181 32 L174 32 Z"/>

    <!-- Raeder -->
    <circle class="reifen" cx="52" cy="71" r="13"/>
    <circle class="reifen" cx="152" cy="71" r="13"/>
    <circle class="felge"  cx="52" cy="71" r="6.5"/>
    <circle class="felge"  cx="152" cy="71" r="6.5"/>
  </svg>`;
}
