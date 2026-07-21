/*
 * FHEMVIZ - Switch-Widget (v0.7.0).
 * Echter Kipp-Toggle statt Zustands-Button: der Regler zeigt die Lage,
 * die Bernstein-Farbe den Zustand. Statusleiste der Kachel = an/aus.
 * readonly (TV-Modus): nur Zustandstext, kein Bedienelement.
 */

import { FhemvizWidget } from "./base-widget.js";

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

  render() {
    const on = this._isOn();
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
    if (btn) {
      btn.addEventListener("click", () =>
        this.sendCommand(this._isOn() ? "off" : "on")
      );
    }
  }
}
