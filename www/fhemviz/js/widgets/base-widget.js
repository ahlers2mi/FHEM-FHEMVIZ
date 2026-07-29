/*
 * FHEMVIZ - Basis-Klasse aller Widgets (v0.7.0).
 * Custom Element + Shadow DOM. Designsprache: Statusleiste am linken
 * Kachelrand (Bernstein = an, Gruen = ok, Rot = Alarm), grosse duenne
 * Ziffern, versale Labels. Theming ueber vererbte CSS Custom Properties.
 *
 * Host-Attribute (von layout.js gesetzt):
 *   data-size  - vizSize (1x1, 2x1, 1x2, 2x2) -> groessere Typo bei Spans
 *   data-tv    - TV-Modus -> nochmals groessere Typo
 * Host-Properties: device, store, client, readonly.
 */

const CARD_CSS = `
  :host { display: block; min-width: 0; height: 100%; }
  .card {
    position: relative;
    background: var(--viz-surface, #151920);
    border: 1px solid var(--viz-border, #262c35);
    border-radius: var(--viz-radius, 14px);
    padding: 13px 15px 13px 19px;
    color: var(--viz-text, #e8eaed);
    display: flex; flex-direction: column; gap: 7px;
    height: 100%; box-sizing: border-box;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
  }
  /* Statusleiste: Zustand hat eine Form, nicht nur eine Zahl. */
  .card::before {
    content: ""; position: absolute; left: 0; top: 12px; bottom: 12px;
    width: 3px; border-radius: 0 3px 3px 0;
    background: var(--viz-border, #262c35);
  }
  .card.on::before  { background: var(--viz-accent, #ffb020); }
  .card.ok::before  { background: var(--viz-ok, #34c77b); }
  .card.bad::before { background: var(--viz-error, #ff5d5d); }

  .label {
    font-size: 0.64rem; font-weight: 700; letter-spacing: 0.13em;
    text-transform: uppercase; color: var(--viz-muted, #77808c);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .value {
    font-size: 1.9rem; font-weight: 200; letter-spacing: -0.02em;
    line-height: 1.05; overflow: hidden; text-overflow: ellipsis;
  }
  /* Lange Werte: kleiner und kraeftiger statt riesig umgebrochen. */
  .value.md { font-size: 1.35rem; font-weight: 300; }
  .value.sm { font-size: 1rem; font-weight: 450; line-height: 1.3; white-space: normal; }
  .unit { font-size: 0.55em; font-weight: 400; color: var(--viz-muted, #77808c); margin-left: 0.12em; }
  .sub { color: var(--viz-muted, #77808c); font-size: 0.8rem; min-width: 0;
         overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-width: 0; }
  /* In einer schmalen Kachel darf der WERT kuerzen, nicht das Label - aus
   * "Titel" wurde sonst "T…", waehrend daneben der lange Songtitel stand. */
  .row > .sub:first-child { flex: 0 0 auto; }
  .row > .sub:last-child {
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .grow { margin-top: auto; }

  /* Bedienelemente ---------------------------------------------------------- */
  button.pill {
    font: inherit; font-size: 0.8rem; font-weight: 600;
    min-height: 38px; padding: 8px 14px;
    border-radius: 999px; border: 1px solid var(--viz-border, #262c35);
    background: var(--viz-raised, #1c212a); color: var(--viz-text, #e8eaed);
    cursor: pointer;
  }
  button.pill:focus-visible { outline: 2px solid var(--viz-action, #4c8dff); outline-offset: 1px; }
  /* Transport-Symbole: Inline-SVG in Textfarbe (siehe mediaIconHtml). */
  button.pill:has(> svg.vicon) { padding: 8px 12px; }
  svg.vicon { width: 1.15em; height: 1.15em; display: block; margin: 0 auto; }

  button.toggle {
    width: 52px; height: 30px; flex-shrink: 0;
    border-radius: 999px; border: 0; cursor: pointer;
    background: var(--viz-raised, #1c212a);
    position: relative; transition: background 0.15s ease;
  }
  button.toggle::after {
    content: ""; position: absolute; top: 3px; left: 3px;
    width: 24px; height: 24px; border-radius: 50%;
    background: var(--viz-muted, #77808c);
    transition: transform 0.15s ease, background 0.15s ease;
  }
  button.toggle.on { background: var(--viz-accent, #ffb020); }
  button.toggle.on::after { transform: translateX(22px); background: var(--viz-bg, #0a0c0f); }
  button.toggle:focus-visible { outline: 2px solid var(--viz-action, #4c8dff); outline-offset: 2px; }

  input[type=range] {
    width: 100%; margin: 4px 0 0;
    accent-color: var(--viz-accent, #ffb020);
  }
  .btnrow { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  select.pill {
    font: inherit; font-size: 0.8rem; font-weight: 600;
    min-height: 38px; padding: 6px 10px; border-radius: 10px;
    border: 1px solid var(--viz-border, #262c35);
    background: var(--viz-raised, #1c212a); color: var(--viz-text, #e8eaed);
  }
  .ctlrow { display: flex; align-items: center; gap: 10px; }
  /* Feste Label-/Wert-Spalten: alle Slider einer Kachel laufen buendig,
   * gleicher Wert = gleiche Knopfposition. */
  .ctlrow > .sub:first-child { flex: 0 0 5.5em; }
  .ctlrow > .sub:last-child { flex: 0 0 2.8em; text-align: right; }
  .ctlrow input[type=range] { flex: 1; margin: 0; min-width: 0; }

  /* Fortschrittsbalken (vizReadings-Flag "bar", Skala 0-100). */
  .vbar {
    height: 6px; border-radius: 3px; overflow: hidden;
    background: var(--viz-raised, #1c212a); margin: 4px 0 2px;
  }
  .vbar > div { height: 100%; border-radius: 3px; background: var(--viz-accent, #ffb020); }

  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .dot.ok  { background: var(--viz-ok, #34c77b); }
  .dot.bad { background: var(--viz-error, #ff5d5d); }

  /* Mehrzeiliger Klartext (vizWidget text, z. B. Terminlisten). Skaliert
   * wie die uebrigen Werte mit Kachelgroesse und TV-Modus mit. */
  .text {
    white-space: pre-line; font-size: 0.95rem; line-height: 1.5;
    color: var(--viz-text, #e8eaed); overflow: hidden;
  }
  :host([data-size="2x1"]) .text, :host([data-size="1x2"]) .text { font-size: 1.2rem; }
  :host([data-size="2x2"]) .text { font-size: 1.4rem; }
  :host([data-tv]) .text { font-size: 1.4rem; }
  :host([data-tv][data-size="2x1"]) .text, :host([data-tv][data-size="1x2"]) .text { font-size: 1.8rem; }
  :host([data-tv][data-size="2x2"]) .text { font-size: 2.1rem; }

  /* Groessere Kacheln (vizSize) und TV-Modus skalieren die Typo ------------- */
  :host([data-size="2x1"]) .value { font-size: 2.3rem; }
  :host([data-size="1x2"]) .value { font-size: 2.3rem; }
  :host([data-size="2x2"]) .value { font-size: 3rem; }
  :host([data-size="2x2"]) .card { padding: 18px 20px 18px 24px; gap: 10px; }
  /* Info-Zeilen wachsen mit der Kachel mit - kein Kleingedrucktes in
   * grossen Flaechen (Lesbarkeit aus der Ferne). */
  :host([data-size="2x1"]) .sub, :host([data-size="1x2"]) .sub { font-size: 0.95rem; }
  :host([data-size="2x2"]) .sub { font-size: 1.1rem; }
  :host([data-tv]) .value { font-size: 2.7rem; }
  :host([data-tv][data-size="2x2"]) .value { font-size: 3.8rem; }
  :host([data-tv]) .label { font-size: 0.74rem; }
  :host([data-tv]) .sub { font-size: 1.05rem; }
  :host([data-tv][data-size="2x1"]) .sub, :host([data-tv][data-size="1x2"]) .sub { font-size: 1.2rem; }
  :host([data-tv][data-size="2x2"]) .sub { font-size: 1.35rem; }

  /* Lange Werte (.md/.sm, z. B. Wetter-Text) muessen EXPLIZIT mitskaliert
   * werden: die :host()-Regeln fuer .value setzen sich in manchen WebViews
   * nicht gegen die 2-Klassen-Regel .value.sm durch. Diese Selektoren sind
   * spezifischer und greifen daher zuverlaessig. */
  :host([data-size="2x1"]) .value.md, :host([data-size="1x2"]) .value.md { font-size: 1.7rem; }
  :host([data-size="2x2"]) .value.md { font-size: 2.2rem; }
  :host([data-size="2x1"]) .value.sm, :host([data-size="1x2"]) .value.sm { font-size: 1.3rem; }
  :host([data-size="2x2"]) .value.sm { font-size: 1.6rem; }
  :host([data-tv]) .value.md { font-size: 2.2rem; }
  :host([data-tv]) .value.sm { font-size: 1.7rem; }
  :host([data-tv][data-size="2x1"]) .value.md, :host([data-tv][data-size="1x2"]) .value.md { font-size: 2.6rem; }
  :host([data-tv][data-size="2x1"]) .value.sm, :host([data-tv][data-size="1x2"]) .value.sm { font-size: 2rem; }
  :host([data-tv][data-size="2x2"]) .value.md { font-size: 3rem; }
  :host([data-tv][data-size="2x2"]) .value.sm { font-size: 2.3rem; }

  /* Kurzes Aufleuchten bei Wertaenderung (base _paint setzt .viz-flash).
   * Auf dem WERT ein kurzer Farbanflug hinter der Zahl. */
  @keyframes viz-flash {
    0%   { background-color: color-mix(in srgb, var(--viz-accent) 30%, transparent); }
    100% { background-color: transparent; }
  }
  .viz-flash {
    animation: viz-flash 0.7s ease-out;
    border-radius: 8px;
  }
  /* Auf der GANZEN Kachel (Gruppen-/Grafik-Kacheln ohne .value-Element)
   * darf der Hintergrund NICHT animiert werden: die Animation wuerde die
   * Kachelfuellung 0,7 s lang durch "transparent" ersetzen. Bei deckenden
   * Kacheln faellt das kaum auf, bei halbtransparenten (Glas-Skin ueber
   * einem Hintergrundbild) reisst es ein Loch - und backdrop-filter muesste
   * je Frame neu rastern, was sichtbar flackert. Darum nur der Rahmen. */
  @keyframes viz-flash-card {
    0%   { border-color: var(--viz-accent, #ffb020); }
    100% { border-color: var(--viz-border, #262c35); }
  }
  .card.viz-flash {
    animation: viz-flash-card 0.7s ease-out;
    border-radius: var(--viz-radius, 14px);
  }

  /* vizAlert: pulsierender roter Rahmen um die Kachel, solange aktiv. */
  @keyframes viz-tile-alert {
    0%, 100% { box-shadow: 0 0 0 2px var(--viz-error, #ff5d5d); }
    50% {
      box-shadow: 0 0 0 2px var(--viz-error, #ff5d5d),
                  0 0 16px 2px color-mix(in srgb, var(--viz-error, #ff5d5d) 65%, transparent);
    }
  }
  .card.viz-tile-alert {
    animation: viz-tile-alert 1.6s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    button.toggle, button.toggle::after { transition: none; }
    .viz-flash, .card.viz-flash { animation: none; }
    .card.viz-tile-alert {
      animation: none; box-shadow: 0 0 0 2px var(--viz-error, #ff5d5d);
    }
  }
`;

/**
 * Semantischer Farbname -> CSS-Custom-Property (ok/gruen, warn/orange,
 * bad/rot/red, accent/amber, blau/blue). Unbekannt -> "" (Standardfarbe).
 * Als Modulfunktion exportiert, damit auch app.js (statusBar) sie nutzt.
 */
export function vizColorVar(name) {
  const map = {
    ok: "--viz-ok", gruen: "--viz-ok", green: "--viz-ok",
    warn: "--viz-warn", orange: "--viz-warn",
    bad: "--viz-error", rot: "--viz-error", red: "--viz-error",
    accent: "--viz-accent", amber: "--viz-accent",
    blau: "--viz-action", blue: "--viz-action",
  };
  const v = map[String(name || "").toLowerCase()];
  return v ? `var(${v})` : "";
}

/**
 * Farbe aufloesen: fester Name ODER Schwellwerte "farbe@[op]zahl" mit |
 * getrennt (op-Default >=, erlaubt >= > <= < ==). Erster Treffer gewinnt;
 * kein Treffer / nicht-numerisch -> "".
 */
export function vizColorFor(spec, num) {
  const s = String(spec || "").trim();
  if (!s) return "";
  if (s.indexOf("@") < 0) return vizColorVar(s); // fester Name
  if (isNaN(num)) return "";
  for (const rule of s.split("|").map((r) => r.trim()).filter(Boolean)) {
    const m = rule.match(/^([a-zäöü]+)@(<=|>=|<|>|==)?\s*(-?\d+(?:[.,]\d+)?)$/i);
    if (!m) continue;
    const name = m[1];
    const op = m[2] || ">=";
    const t = parseFloat(m[3].replace(",", "."));
    const hit =
      op === ">=" ? num >= t :
      op === ">"  ? num >  t :
      op === "<=" ? num <= t :
      op === "<"  ? num <  t :
                    num === t;
    if (hit) return vizColorVar(name);
  }
  return "";
}

/*
 * Skin-CSS fuer das Kachel-Innenleben. Externe Stylesheets erreichen den
 * Shadow DOM nicht - app.js laedt css/skin-<name>.widget.css als Text und
 * setzt sie hier; _paint haengt sie hinter CARD_CSS in JEDE Kachel.
 * Leer = Skin "classic" (unveraendertes Aussehen).
 */
let SKIN_CSS = "";

/** Setzt das Kachel-Skin-CSS und rendert bereits sichtbare Kacheln neu. */
export function setWidgetSkinCss(css) {
  SKIN_CSS = String(css || "");
  document.querySelectorAll("*").forEach((el) => {
    if (el instanceof FhemvizWidget) el._paint();
  });
}

/*
 * Aufleuchten bei Wertaenderung, global abschaltbar (attr flash am
 * FHEMVIZ-Geraet, URL ?flash= geht vor):
 *   "all"    - Wertfeld blinkt, Kacheln ohne Wertfeld pulsen im Rahmen (Default)
 *   "values" - nur Wertfelder; Gruppen-/Grafik-Kacheln bleiben ruhig
 *   "off"    - nichts blinkt
 * app.js normalisiert die Attributwerte auf diese drei Namen.
 */
let FLASH_MODE = "all";

/** Setzt den Blink-Modus. Unbekannte Werte -> "all". */
export function setFlashMode(mode) {
  const m = String(mode || "").trim().toLowerCase();
  FLASH_MODE = m === "off" || m === "values" ? m : "all";
}

/*
 * Transport-Symbole als Inline-SVG, einfarbig in der Textfarbe.
 *
 * Warum nicht die Unicode-Zeichen (⏮ ▶ ⏸ ⏹ ⏭): fuer U+23F8 (Pause) und
 * U+23F9 (Stop) hat kaum eine System-Schrift eine einfarbige Glyphe. Der
 * Browser faellt dann auf die FARB-Emoji-Schrift zurueck - auf Android/Samsung
 * werden genau diese zwei orange, waehrend ⏮ ▶ ⏭ weiss bleiben. Als SVG sehen
 * alle Symbole gleich aus und folgen der Textfarbe (auch im Alarm-/Aktiv-Rot).
 */
const MEDIA_ICONS = {
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
  stop: '<path d="M6 6h12v12H6z"/>',
  prev: '<path d="M6 6h2.5v12H6zM18 6v12l-9-6z"/>',
  next: '<path d="M15.5 6H18v12h-2.5zM6 6l9 6-9 6z"/>',
  volume:
    '<path d="M4 9h3l4-4v14l-4-4H4z"/>' +
    '<path d="M14.5 8.6a5 5 0 010 6.8" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  mute:
    '<path d="M4 9h3l4-4v14l-4-4H4z"/>' +
    '<path d="M14.8 9.6l4.8 4.8m0-4.8l-4.8 4.8" fill="none" stroke="currentColor" stroke-width="1.8"/>',
};

/** Befehlsname -> Symbolschluessel (Modul-Schreibweisen zusammengefasst). */
const MEDIA_ALIAS = {
  play: "play",
  resume: "play",
  pause: "pause",
  stop: "stop",
  prev: "prev",
  previous: "prev",
  skiptoprevious: "prev",
  next: "next",
  skiptonext: "next",
  mute: "mute",
  unmute: "volume",
  volume: "volume",
};

/** Inline-SVG fuer einen Transport-Befehl, "" wenn keins passt. */
export function mediaIconHtml(cmd) {
  const key = MEDIA_ALIAS[String(cmd || "").trim().toLowerCase()];
  const body = key && MEDIA_ICONS[key];
  return body
    ? `<svg class="vicon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`
    : "";
}

export class FhemvizWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.device = null;
    this.store = null;
    this.client = null;
    this.readonly = false;
    this._unsub = null;
  }

  connectedCallback() {
    if (this.store && this.device) {
      this._unsub = this.store.subscribe(this.device.name, (dev) => {
        this.device = dev;
        this._paint();
      });
    }
    this._paint();
  }

  disconnectedCallback() {
    if (this._unsub) this._unsub();
  }

  _paint() {
    const html = this.render();
    // Aufleuchten nur bei tatsaechlicher Aenderung des Kachelinhalts (nicht
    // beim ersten Rendern) - so pulsiert eine Kachel bei jedem neuen Wert
    // kurz auf, ohne dass sich unveraenderte Kacheln bewegen.
    const changed = this._rendered && html !== this._prevHtml;
    this._prevHtml = html;
    this._rendered = true;
    this.shadowRoot.innerHTML =
      `<style>${CARD_CSS}${SKIN_CSS}</style>` + html;
    this.afterRender && this.afterRender();
    // vizAlert: pulsierender roter Rahmen, solange die Bedingung wahr ist.
    if (this.alertActive()) {
      const card = this.shadowRoot.querySelector(".card");
      if (card) card.classList.add("viz-tile-alert");
    }
    if (changed) this._flash();
  }

  /**
   * Kurzes Aufleuchten nach einer Wertaenderung.
   * Global: FLASH_MODE (attr flash / ?flash=). Je Geraet uebersteuerbar mit
   * attr vizFlash 0|1 - so laesst sich eine einzelne zappelige Kachel
   * (Leistung im Sekundentakt) beruhigen, ohne alle anderen abzuschalten,
   * bzw. eine wichtige trotz globalem "off" blinken lassen.
   */
  _flash() {
    const per = String(((this.device || {}).attr || {}).vizFlash || "").trim();
    const mode = /^(0|off|no|false)$/i.test(per)
      ? "off"
      : /^(1|on|yes|true)$/i.test(per)
        ? "all"
        : FLASH_MODE;
    if (mode === "off") return;
    const val = this.shadowRoot.querySelector(".value,.tval,.vstate,.cval");
    // Kacheln ohne Wertfeld (Gruppen-/Grafik-Kacheln) pulsen im Rahmen -
    // bei "values" bleiben sie ganz ruhig.
    const t =
      val || (mode === "values" ? null : this.shadowRoot.querySelector(".card"));
    if (!t) return;
    t.classList.remove("viz-flash");
    void t.offsetWidth; // Reflow -> Animation neu starten
    t.classList.add("viz-flash");
  }

  /**
   * vizAlert-Bedingung auswerten -> true = Kachel-Alarm (roter Rahmen).
   * Formen: "reading OP wert" (OP: > < >= <= = == !=) oder nur "reading"
   * (wahr bei on/an/1/true/open/alarm/error ...). state ist erlaubt.
   */
  alertActive() {
    const spec = String((this.device.attr || {}).vizAlert || "").trim();
    if (!spec) return false;
    const rd = (n) =>
      n === "state" ? this.device.state : (this.device.readings || {})[n];
    const m = spec.match(/^(.+?)\s*(>=|<=|!=|==|=|>|<)\s*(.+)$/);
    if (!m) {
      const v = this.plain(rd(spec)).toLowerCase();
      return /^(on|an|1|true|yes|ja|open|offen|alarm|alert|error|fault|fehler)$/.test(v);
    }
    const cur = this.plain(rd(m[1].trim()));
    const target = m[3].trim();
    const a = parseFloat(String(cur).replace(",", "."));
    const b = parseFloat(String(target).replace(",", "."));
    const num = !isNaN(a) && !isNaN(b);
    switch (m[2]) {
      case ">":  return num && a > b;
      case "<":  return num && a < b;
      case ">=": return num && a >= b;
      case "<=": return num && a <= b;
      case "!=": return num ? a !== b : cur.toLowerCase() !== target.toLowerCase();
      default:   return num ? a === b : cur.toLowerCase() === target.toLowerCase();
    }
  }

  /** Anzeigename: alias, sonst technischer Name. */
  displayName() {
    return (this.device.attr && this.device.attr.alias) || this.device.name;
  }

  /**
   * Schiebe-Regler sicher anbinden: cb(wert) laeuft nur, wenn der Regler
   * wirklich GEZOGEN (oder per Tastatur bewegt) wurde.
   *
   * Ein <input type=range> springt beim ANTIPPEN der Schiene sofort auf die
   * getippte Stelle und meldet den Wert - auf einem Wandtablet ist eine
   * Handkante am rechten Rand damit "volle Lautstaerke" bzw. "Rollade ganz
   * auf". Gemessen: ein Tipp bei 95 % einer 390 px breiten Schiene schickte
   * "volume 95", ausgehend von 35. Ein reines Antippen stellt jetzt den alten
   * Wert wieder her und schickt nichts; Pfeiltasten gelten als Absicht, weil
   * sie in step-Schritten laufen und nicht springen koennen.
   */
  bindSlider(elm, cb) {
    let start = elm.value;
    let gezogen = false;
    let x0 = null;
    elm.addEventListener("pointerdown", (e) => {
      start = elm.value;
      gezogen = false;
      x0 = e.clientX;
    });
    elm.addEventListener("pointermove", (e) => {
      if (x0 !== null && Math.abs(e.clientX - x0) > 6) gezogen = true;
    });
    elm.addEventListener("keydown", () => {
      gezogen = true;
    });
    elm.addEventListener("change", () => {
      if (!gezogen) {
        // Antippen: Regler zurueck, kein Befehl. Das input-Event laesst eine
        // mitlaufende Wertanzeige den alten Wert wieder uebernehmen.
        elm.value = start;
        elm.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      x0 = null;
      cb(elm.value);
    });
  }

  escape(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }

  /**
   * Klartext eines State/Werts: entfernt HTML-Tags (devStateIcon-SVG,
   * stateFormat mit <b>…</b>) und kollabiert Whitespace.
   */
  plain(s) {
    return String(s ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Semantischer Farbname (aus vizReadings) -> CSS-Custom-Property.
   * Erlaubt: ok/gruen/green, warn/orange, bad/rot/red, accent/amber,
   * blau/blue. Unbekannte Namen -> "" (Standardfarbe).
   */
  colorVar(name) {
    return vizColorVar(name);
  }

  /**
   * Farbfeld eines vizReadings-Eintrags aufloesen. Zwei Formen:
   *   - fester Name wie bisher:            "bad", "warn", "accent" ...
   *   - Schwellwerte (wertabhaengig):      "farbe@[op]zahl" mit | getrennt,
   *     z. B. "bad@75|warn@65" oder mit Vergleich "blau@<=5|bad@>=30".
   * op ist optional (Default >=), erlaubt: >= > <= < ==. Der ERSTE Treffer
   * gewinnt -> hoechste Schwelle zuerst notieren (wie if/elsif). Kein
   * Treffer bzw. nicht-numerischer Wert -> Standardfarbe. Ersetzt die
   * frueher per Notify gesetzten _colour-Readings (HTML-style), die FHEMVIZ
   * bewusst nicht auswertet.
   */
  colorFor(spec, num) {
    return vizColorFor(spec, num);
  }

  /**
   * Reine Zahl auf sinnvolle Nachkommastellen kuerzen (Default max. 2),
   * Nachkommanullen entfernen. Nicht-numerische Werte (z. B. "17821 Wh",
   * "on") bleiben unveraendert. Behebt Roh-Floats wie
   * "10.4575382701608 g/m3" -> "10.46".
   */
  fmtNum(s, decimals = 2) {
    const str = String(s).trim();
    if (!/^-?\d+(\.\d+)?$/.test(str)) return str; // keine reine Zahl
    const n = parseFloat(str);
    if (!isFinite(n)) return str;
    let out = n.toFixed(Math.max(0, Math.min(6, decimals)));
    if (out.indexOf(".") >= 0) out = out.replace(/0+$/, "").replace(/\.$/, "");
    return out;
  }

  /**
   * vizReadings-Attribut parsen: "reading[:Label[:Einheit[:Farbe[:flags]]]]".
   * Liefert [{label,value,color,bar,num}] direkt aus den Readings, null
   * wenn nicht gesetzt. Von ALLEN Widgets nutzbar (Info-Zeilen).
   * flags (durch Leerzeichen getrennt): "bar" = Fortschrittsbalken
   * (Skala 0-100); eine Zahl = feste Nachkommastellen (z. B. "0" ganzzahlig,
   * "1" eine Stelle). Ohne Angabe werden reine Zahlen auf max. 2 Stellen
   * gerundet.
   */
  vizReadingParts() {
    const spec = this.device.attr && this.device.attr.vizReadings;
    if (!spec) return null;
    const readings = this.device.readings || {};
    const items = String(spec)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => {
        const [reading, label, unit, color, flag] = t
          .split(":")
          .map((x) => (x || "").trim());
        if (!reading) return null;
        // flags: "bar" und/oder eine Nachkommastellen-Zahl.
        const flags = String(flag || "").trim().split(/\s+/).filter(Boolean);
        const bar = flags.some((f) => /^bar$/i.test(f));
        const decTok = flags.find((f) => /^\d+$/.test(f));
        const decimals = decTok !== undefined ? parseInt(decTok, 10) : 2;
        const raw = readings[reading];
        const v =
          raw === undefined || raw === null || raw === ""
            ? "–"
            : this.fmtNum(this.plain(raw), decimals);
        // Einheit nur anhaengen, wenn der Wert sie nicht schon traegt
        // (Readings wie "17821 Wh" bringen ihre Einheit selbst mit).
        const value =
          unit && !v.toLowerCase().endsWith(unit.toLowerCase())
            ? v + " " + unit
            : v;
        const num = parseFloat(String(v).replace(",", "."));
        return {
          reading,
          label: label || reading,
          value,
          color: this.colorFor(color, num),
          bar,
          num,
        };
      })
      .filter(Boolean);
    return items.length ? items : null;
  }

  /** Fortschrittsbalken-HTML fuer einen vizReadings-Eintrag (Flag "bar"). */
  barHtml(p) {
    if (!p || !p.bar || isNaN(p.num)) return "";
    const w = Math.max(0, Math.min(100, p.num));
    const bg = p.color ? `background:${p.color};` : "";
    return `<div class="vbar"><div style="width:${w}%;${bg}"></div></div>`;
  }

  /** vizReadings als kompakte Label/Wert-Zeilen (fuer Nicht-Sensor-Widgets). */
  readingRowsHtml(parts = this.vizReadingParts()) {
    if (!parts || !parts.length) return "";
    return parts
      .map(
        (p) =>
          `<div class="row"><span class="sub">${this.escape(
            p.label || " "
          )}</span><span class="sub" style="color:${
            p.color || "var(--viz-text)"
          };">${this.escape(p.value)}</span></div>` + this.barHtml(p)
      )
      .join("");
  }

  /**
   * vizStates-Attribut: "pattern:Label[:Farbe]" kommasepariert - uebersetzt
   * technische Status-Codes (ok_cutting, In Betrieb) in Klartext + Farbe.
   * Pattern = Regex (Volltreffer, case-insensitiv). null wenn kein Treffer.
   */
  /** Inline-SVG fuer einen Transport-Befehl (Instanz-Zugriff). */
  mediaIconHtml(cmd) {
    return mediaIconHtml(cmd);
  }

  /**
   * Rohwert fuer die angezeigte Zustandszeile. Normalerweise "state" - manche
   * Module und Proxys (DoRemoteDevice) schreiben dort aber den letzten
   * SET-Befehl oder den Namen des letzten Readings ("resume",
   * "currentImageUrl", "groupWithMember HEOSPlayer…"), was als Kachel-
   * Ueberschrift nichts taugt. attr <dev> vizState <reading> bestimmt dann,
   * woraus die Ueberschrift kommt (z. B. playStatus). Ist das Reading leer
   * oder fehlt es, bleibt es bei state.
   */
  stateRaw() {
    const n = String((this.device.attr || {}).vizState || "").trim();
    const v = n ? (this.device.readings || {})[n] : undefined;
    const raw = v === undefined || v === "" ? this.device.state : v;
    return this.mapEvent(raw);
  }

  /**
   * eventMap (FHEM-Attribut) in Anzeigerichtung anwenden: Gerätewert ->
   * Klartext. Portierung von ReplaceEventMap($dev, $str, 1) aus fhem.pl:
   *   - Trennzeichen ist das ERSTE Zeichen, wenn es "," oder "/" ist,
   *     sonst Leerzeichen (attrSplit).
   *   - Je Eintrag "re:wert[:modifier]"; ist "re" ein Wort (^\w*$), wird mit
   *     \b…\b ersetzt, sonst als Regex. Der ERSTE Treffer gewinnt.
   * Warum ueberhaupt: jsonlist2 liefert das state-READING roh (z. B. die
   * Kanalnummer 27), waehrend FHEM das Internal STATE bereits gemappt hat
   * ("WDR4"). Das Internal traegt aber ggf. einen stateFormat-Text, den wir
   * bewusst nicht als Zustand nehmen - also mappen wir selbst.
   * Beim SENDEN ist nichts zu tun: fhem.pl macht in DoSet die Rueckrichtung
   * (ReplaceEventMap(..., 0)), der angezeigte Wert ist also auch der, den man
   * schickt.
   * Perl-Notation (eventMap {...}) laesst sich im Browser nicht auswerten und
   * bleibt unveraendert.
   */
  mapEvent(raw) {
    const em = String((this.device.attr || {}).eventMap || "").trim();
    let s = String(raw ?? "");
    if (!em || em.startsWith("{")) return s;
    const sep = em[0] === "," || em[0] === "/" ? em[0] : " ";
    const list = (sep === " " ? em : em.slice(1)).split(sep).filter(Boolean);
    for (const rv of list) {
      const p1 = rv.indexOf(":");
      if (p1 < 0) continue;
      const re = rv.slice(0, p1);
      const rest = rv.slice(p1 + 1);
      const p2 = rest.indexOf(":"); // dritter Teil = modifier, ignorieren
      const val = p2 < 0 ? rest : rest.slice(0, p2);
      if (!re) continue;
      try {
        const rx = /^\w*$/.test(re)
          ? new RegExp("\\b" + re + "\\b")
          : new RegExp(re);
        if (rx.test(s)) return s.replace(rx, val);
      } catch {
        /* ungueltige Regex im eventMap ignorieren */
      }
    }
    return s;
  }

  vizStateInfo(raw = this.stateRaw()) {
    const spec = this.device.attr && this.device.attr.vizStates;
    if (!spec) return null;
    const st = this.plain(raw);
    for (const t of String(spec).split(",")) {
      const [pat, label, color] = t.split(":").map((x) => (x || "").trim());
      if (!pat) continue;
      try {
        if (new RegExp("^(?:" + pat + ")$", "i").test(st)) {
          return { text: label || st, color: this.colorVar(color) };
        }
      } catch {
        /* ungueltige Regex ignorieren */
      }
    }
    return null;
  }

  /** Muss von abgeleiteten Widgets ueberschrieben werden. */
  render() {
    return `<div class="card"><span class="label">${this.escape(
      this.displayName()
    )}</span></div>`;
  }

  /** Setzt "set <dev> <cmd>" fuer dieses Geraet ab (CSRF via Client). */
  sendCommand(cmd) {
    if (!this.client || this.readonly) return;
    this.client.command(`set ${this.device.name} ${cmd}`).catch((e) => {
      // eslint-disable-next-line no-console
      console.error("FHEMVIZ set fehlgeschlagen:", e);
    });
  }
}
