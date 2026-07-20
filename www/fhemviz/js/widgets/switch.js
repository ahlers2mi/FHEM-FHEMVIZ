/*
 * FHEMVIZ - Switch-Widget (on/off), PoC v0.2.0.
 * Stellt den Ein/Aus-Zustand dar und sendet "set <dev> on|off".
 */

import { FhemvizWidget } from "./base-widget.js";

export class FhemvizSwitch extends FhemvizWidget {
  _isOn() {
    return /^(on|1|true|open|ge?offnet)$/i.test(String(this.device.state));
  }

  render() {
    const on = this._isOn();
    return `
      <div class="card">
        <div class="title">${this.escape(this.displayName())}</div>
        <div class="row">
          <span class="sub">${this.escape(this.device.state)}</span>
          <button id="toggle" class="${on ? "on" : ""}">${on ? "AN" : "AUS"}</button>
        </div>
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
