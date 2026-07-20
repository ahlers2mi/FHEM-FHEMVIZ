/*
 * FHEMVIZ - Dimmer-Widget (pct), PoC v0.2.0.
 * Stellt einen Prozentwert dar und sendet "set <dev> pct <n>".
 */

import { FhemvizWidget } from "./base-widget.js";

export class FhemvizDimmer extends FhemvizWidget {
  _pct() {
    const r = this.device.readings || {};
    const raw = r.pct ?? r.dim ?? this.device.state;
    const n = parseInt(String(raw).replace(/[^\d-]/g, ""), 10);
    return isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
  }

  render() {
    const pct = this._pct();
    return `
      <div class="card">
        <div class="row">
          <span class="title">${this.escape(this.displayName())}</span>
          <span class="sub">${pct}%</span>
        </div>
        <input id="slider" type="range" min="0" max="100" value="${pct}" />
      </div>`;
  }

  afterRender() {
    const s = this.shadowRoot.getElementById("slider");
    if (s) {
      s.addEventListener("change", () => this.sendCommand(`pct ${s.value}`));
    }
  }
}
