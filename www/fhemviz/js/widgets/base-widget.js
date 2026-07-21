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

  @media (prefers-reduced-motion: reduce) {
    button.toggle, button.toggle::after { transition: none; }
  }
`;

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
    this.shadowRoot.innerHTML = `<style>${CARD_CSS}</style>` + this.render();
    this.afterRender && this.afterRender();
  }

  /** Anzeigename: alias, sonst technischer Name. */
  displayName() {
    return (this.device.attr && this.device.attr.alias) || this.device.name;
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
   * vizReadings-Attribut parsen: "reading[:Label[:Einheit[:Farbe[:bar]]]]".
   * Liefert [{label,value,color,bar,num}] direkt aus den Readings, null
   * wenn nicht gesetzt. Von ALLEN Widgets nutzbar (Info-Zeilen).
   * Flag "bar": zusaetzlich ein Fortschrittsbalken (Skala 0-100).
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
        const raw = readings[reading];
        const v =
          raw === undefined || raw === null || raw === "" ? "–" : this.plain(raw);
        // Einheit nur anhaengen, wenn der Wert sie nicht schon traegt
        // (Readings wie "17821 Wh" bringen ihre Einheit selbst mit).
        const value =
          unit && !v.toLowerCase().endsWith(unit.toLowerCase())
            ? v + " " + unit
            : v;
        return {
          reading,
          label: label || reading,
          value,
          color: this.colorVar(color),
          bar: /^bar$/i.test(flag || ""),
          num: parseFloat(v),
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
  vizStateInfo(raw = this.device.state) {
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
