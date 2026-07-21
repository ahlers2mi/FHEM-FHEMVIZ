/*
 * FHEMVIZ - Switch-Widget (v0.7.0).
 * Echter Kipp-Toggle statt Zustands-Button: der Regler zeigt die Lage,
 * die Bernstein-Farbe den Zustand. Statusleiste der Kachel = an/aus.
 * readonly (TV-Modus): nur Zustandstext, kein Bedienelement.
 *
 * Symbol-Modus (attr vizIcon lampe|steckdose|lautsprecher|luefter|pumpe|
 * tv|heizung|power): grosses Stroke-Icon mittig, Name darunter,
 * bernstein = an - aus der Ferne lesbar wie das klassische SchalterDash.
 * Tippen auf die Kachel schaltet.
 */

import { FhemvizWidget } from "./base-widget.js";

// Stroke-Icons (24x24) fuer den Symbol-Modus.
const ICONS = {
  lampe: `<path d="M9 18 h6"/><path d="M10 21 h4"/><path d="M8.5 14.5 C6.5 13 5.5 11 5.5 9 A6.5 6.5 0 0 1 18.5 9 C18.5 11 17.5 13 15.5 14.5 L15 18 H9 L8.5 14.5 Z" fill="none"/>`,
  steckdose: `<circle cx="12" cy="12" r="8"/><circle cx="9.2" cy="12" r="1"/><circle cx="14.8" cy="12" r="1"/>`,
  lautsprecher: `<rect x="7" y="4" width="10" height="16" rx="2"/><circle cx="12" cy="9" r="1.4"/><circle cx="12" cy="15" r="2.6"/>`,
  luefter: `<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2 C12 6 15 5 16.5 6.5 C18 8 16 10.5 12 10.2 Z"/><path d="M13.6 13 C17.2 15 16.8 18.2 14.8 18.8 C12.8 19.4 11.6 16.4 13.6 13 Z"/><path d="M10.4 13 C6.8 15 7.2 18.2 9.2 18.8 C11.2 19.4 12.4 16.4 10.4 13 Z" transform="rotate(120 12 12)"/>`,
  pumpe: `<circle cx="12" cy="13" r="6"/><path d="M12 13 L15.5 9.5"/><path d="M9 4 h6 M12 4 v3"/>`,
  tv: `<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M9 20 h6"/>`,
  heizung: `<line x1="6" y1="6" x2="6" y2="19"/><line x1="10" y1="6" x2="10" y2="19"/><line x1="14" y1="6" x2="14" y2="19"/><line x1="18" y1="6" x2="18" y2="19"/><path d="M4 10 h16"/>`,
  power: `<circle cx="12" cy="13" r="8"/><line x1="12" y1="3" x2="12" y2="11"/>`,
};

const ICON_CSS = `
  .icard {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 7px;
    min-height: 0; cursor: pointer; border: 0; background: none;
    color: inherit; font: inherit; padding: 0;
  }
  .icard[disabled] { cursor: default; }
  .icard svg {
    width: 44px; height: 44px; color: var(--viz-muted, #77808c);
    transition: color 0.15s ease;
  }
  .card.on .icard svg { color: var(--viz-accent, #ffb020); }
  .iname {
    max-width: 100%; font-size: 0.72rem; text-align: center;
    color: var(--viz-muted, #77808c);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .card.on .iname { color: var(--viz-text, #e8eaed); }
  .icard:focus-visible { outline: 2px solid var(--viz-action, #4c8dff); outline-offset: 2px; border-radius: 8px; }
  :host([data-tv]) .icard svg { width: 60px; height: 60px; }
  :host([data-tv]) .iname { font-size: 0.9rem; }
`;

export class FhemvizSwitch extends FhemvizWidget {
  /**
   * Schaltzustand "on" | "off" | null. Reihenfolge:
   * 1. state selbst (praefix-tolerant, "on 23 W" zaehlt als an),
   * 2. Readings POWER / POWER1 / state - ein stateFormat macht aus state
   *    oft reinen Anzeigetext ohne on/off (Tasmota & Co. fuehren das
   *    echte Ein/Aus im Reading POWER).
   */
  _switchState() {
    const check = (v) => {
      const s = this.plain(v).toLowerCase();
      if (/^(on|true|an|open(ed)?|ge(ö|oe)ffnet)\b/.test(s) || s === "1") return "on";
      if (/^(off|false|aus|closed|geschlossen|zu)\b/.test(s) || s === "0") return "off";
      return null;
    };
    const own = check(this.device.state);
    if (own) return own;
    const rd = this.device.readings || {};
    for (const r of ["POWER", "POWER1", "state"]) {
      if (rd[r] !== undefined) {
        const m = check(rd[r]);
        if (m) return m;
      }
    }
    return null;
  }

  _isOn() {
    return this._switchState() === "on";
  }

  _stateText() {
    const mapped = this.vizStateInfo();
    if (mapped) return mapped.text;
    const st = this.plain(this.device.state);
    if (/^on$/i.test(st)) return "An";
    if (/^off$/i.test(st)) return "Aus";
    // state ist Anzeigetext (stateFormat): auf den ermittelten
    // Schaltzustand zurueckfallen statt den Textblock zu zeigen.
    const sw = this._switchState();
    if (sw) return sw === "on" ? "An" : "Aus";
    return st;
  }

  /** vizIcon-Attribut -> Icon-Schluessel (mit power als Rueckfall). */
  _iconKey() {
    const v = String((this.device.attr || {}).vizIcon || "")
      .trim()
      .toLowerCase();
    if (!v) return null;
    return ICONS[v] ? v : "power";
  }

  render() {
    const on = this._isOn();
    const iconKey = this._iconKey();

    // Symbol-Modus: grosses Icon + Name, die ganze Kachel schaltet.
    if (iconKey) {
      return `<style>${ICON_CSS}</style>
        <div class="card${on ? " on" : ""}">
          <button class="icard" id="toggle" role="switch" aria-checked="${on}"
            ${this.readonly ? "disabled" : ""}
            aria-label="${this.escape(this.displayName())} schalten">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true">${ICONS[iconKey]}</svg>
            <span class="iname">${this.escape(this.displayName())}</span>
          </button>
        </div>`;
    }

    const control = this.readonly
      ? ""
      : `<button class="toggle${on ? " on" : ""}" id="toggle"
           role="switch" aria-checked="${on}"
           aria-label="${this.escape(this.displayName())} schalten"></button>`;
    return `
      <div class="card${on ? " on" : ""}">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="row grow">
          <span class="value" style="font-size:1.15rem;font-weight:450;">${this.escape(
            this._stateText()
          )}</span>
          ${control}
        </div>
        ${this.readingRowsHtml()}
      </div>`;
  }

  afterRender() {
    const btn = this.shadowRoot.getElementById("toggle");
    if (btn && !btn.disabled) {
      btn.addEventListener("click", () =>
        this.sendCommand(this._isOn() ? "off" : "on")
      );
    }
  }
}
