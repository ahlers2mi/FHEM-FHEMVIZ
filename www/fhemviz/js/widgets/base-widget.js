/*
 * FHEMVIZ - Basis-Klasse aller Widgets (PoC v0.2.0).
 * Custom Element + Shadow DOM (Kapselung). Jedes Widget:
 *   - stellt einen Reading-Wert dar (render()),
 *   - setzt bei Interaktion einen set-Befehl ab (sendCommand()).
 * Theming ueber vererbte CSS Custom Properties (kein Framework).
 */

const CARD_CSS = `
  :host { display: block; }
  .card {
    background: var(--viz-surface, #fff);
    border: 1px solid var(--viz-border, #e2e4e8);
    border-radius: var(--viz-radius, 12px);
    padding: 12px 14px;
    color: var(--viz-text, #1a1c1e);
    display: flex; flex-direction: column; gap: 8px;
    min-height: 84px;
  }
  .title { font-weight: 600; font-size: 0.95rem; }
  .sub   { color: var(--viz-muted, #5f6368); font-size: 0.8rem; }
  .value { font-size: 1.4rem; font-weight: 600; }
  .row   { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  button {
    font: inherit; cursor: pointer; border-radius: 8px;
    border: 1px solid var(--viz-border, #e2e4e8);
    background: var(--viz-bg, #f5f6f8); color: inherit;
    padding: 6px 12px;
  }
  button.on  { background: var(--viz-accent, #2f6feb); color: #fff; border-color: transparent; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .dot.ok  { background: var(--viz-ok, #2e7d32); }
  .dot.bad { background: var(--viz-error, #c62828); }
  input[type=range] { width: 100%; }
`;

export class FhemvizWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.device = null;
    this.store = null;
    this.client = null;
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

  /** Muss von abgeleiteten Widgets ueberschrieben werden. */
  render() {
    return `<div class="card"><div class="title">${this.escape(
      this.displayName()
    )}</div></div>`;
  }

  /** Setzt einen FHEM-Befehl fuer dieses Geraet ab (CSRF via Client). */
  sendCommand(cmd) {
    if (!this.client) return;
    this.client.command(`${this.device.name} ${cmd}`).catch((e) => {
      // eslint-disable-next-line no-console
      console.error("FHEMVIZ set fehlgeschlagen:", e);
    });
  }
}
