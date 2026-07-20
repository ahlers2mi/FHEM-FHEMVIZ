/*
 * FHEMVIZ - Switch-Widget (v0.7.0).
 * Echter Kipp-Toggle statt Zustands-Button: der Regler zeigt die Lage,
 * die Bernstein-Farbe den Zustand. Statusleiste der Kachel = an/aus.
 * readonly (TV-Modus): nur Zustandstext, kein Bedienelement.
 */

import { FhemvizWidget } from "./base-widget.js";

export class FhemvizSwitch extends FhemvizWidget {
  _isOn() {
    return /^(on|1|true|open|ge?offnet|an)$/i.test(this.plain(this.device.state));
  }

  _stateText() {
    const mapped = this.vizStateInfo();
    if (mapped) return mapped.text;
    const st = this.plain(this.device.state);
    if (/^on$/i.test(st)) return "An";
    if (/^off$/i.test(st)) return "Aus";
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
