/*
 * FHEMVIZ - Sensor-Widget (Wert + Status), PoC v0.2.0.
 * Zeigt den State/Wert an; ein zugehoeriges *_OK-Reading (wie beim
 * Pool-Sensor BLEYC01) speist eine Ampelfarbe.
 */

import { FhemvizWidget } from "./base-widget.js";

export class FhemvizSensor extends FhemvizWidget {
  /** Sucht ein <reading>_OK, das den Status faerbt (true/false). */
  _okDot() {
    const r = this.device.readings || {};
    const okKey = Object.keys(r).find((k) => /_OK$/.test(k));
    if (!okKey) return "";
    const ok = /^(true|1|ok|yes)$/i.test(String(r[okKey]));
    return `<span class="dot ${ok ? "ok" : "bad"}" title="${this.escape(okKey)}"></span>`;
  }

  render() {
    return `
      <div class="card">
        <div class="row">
          <span class="title">${this.escape(this.displayName())}</span>
          ${this._okDot()}
        </div>
        <div class="value">${this.escape(this.device.state)}</div>
      </div>`;
  }
}
