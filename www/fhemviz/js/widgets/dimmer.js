/*
 * FHEMVIZ - Dimmer-Widget (v0.7.0).
 * Prozentwert gross, Slider darunter (Bernstein). Statusleiste = aktiv,
 * sobald pct > 0. readonly (TV-Modus): nur der Wert, kein Slider.
 */

import { FhemvizWidget } from "./base-widget.js";

export class FhemvizDimmer extends FhemvizWidget {
  _pct() {
    const r = this.device.readings || {};
    const raw = r.pct ?? r.dim ?? this.plain(this.device.state);
    const n = parseInt(String(raw).replace(/[^\d-]/g, ""), 10);
    return isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
  }

  render() {
    const pct = this._pct();
    const slider = this.readonly
      ? ""
      : `<input id="slider" type="range" min="0" max="100" value="${pct}"
           aria-label="${this.escape(this.displayName())} Position">`;
    return `
      <div class="card${pct > 0 ? " on" : ""}">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="value">${pct}<span class="unit">%</span></div>
        <div class="grow"></div>
        ${slider}
      </div>`;
  }

  afterRender() {
    const s = this.shadowRoot.getElementById("slider");
    if (s) {
      s.addEventListener("change", () => this.sendCommand(`pct ${s.value}`));
    }
  }
}
