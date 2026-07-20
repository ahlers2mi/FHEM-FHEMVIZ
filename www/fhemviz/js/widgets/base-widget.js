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
  .btnrow { display: flex; gap: 6px; flex-wrap: wrap; }

  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .dot.ok  { background: var(--viz-ok, #34c77b); }
  .dot.bad { background: var(--viz-error, #ff5d5d); }

  /* Groessere Kacheln (vizSize) und TV-Modus skalieren die Typo ------------- */
  :host([data-size="2x1"]) .value { font-size: 2.3rem; }
  :host([data-size="1x2"]) .value { font-size: 2.3rem; }
  :host([data-size="2x2"]) .value { font-size: 3rem; }
  :host([data-size="2x2"]) .card { padding: 18px 20px 18px 24px; gap: 10px; }
  :host([data-tv]) .value { font-size: 2.7rem; }
  :host([data-tv][data-size="2x2"]) .value { font-size: 3.8rem; }
  :host([data-tv]) .label { font-size: 0.74rem; }
  :host([data-tv]) .sub { font-size: 0.95rem; }

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
