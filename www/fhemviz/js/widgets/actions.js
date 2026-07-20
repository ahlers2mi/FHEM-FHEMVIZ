/*
 * FHEMVIZ - Aktions-Widget (webCmd), PoC v0.3.0.
 * Rendert die webCmd-Befehle eines Geraets (z. B. "Auf:Zu:Lueften:Stop")
 * als Buttons und sendet bei Klick "set <dev> <cmd>". Deckt damit generisch
 * alle Geraete ab, deren Bedienung nicht on/off/pct ist (Tore, Rollladen
 * mit Szenen, Player-Steuerung, ...).
 */

import { FhemvizWidget } from "./base-widget.js";

export class FhemvizActions extends FhemvizWidget {
  /** webCmd -> Befehlsliste ("Auf:Zu:Stop" -> ["Auf","Zu","Stop"]). */
  _cmds() {
    const wc = (this.device.attr && this.device.attr.webCmd) || "";
    return wc
      .split(":")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  render() {
    const state = this.escape(this.plain(this.device.state));
    const buttons = this._cmds()
      .map(
        (c, i) =>
          `<button data-idx="${i}" title="set ${this.escape(
            this.device.name
          )} ${this.escape(c)}">${this.escape(c)}</button>`
      )
      .join("");
    return `
      <div class="card">
        <div class="row">
          <span class="title">${this.escape(this.displayName())}</span>
          <span class="sub">${state}</span>
        </div>
        <div class="row" style="flex-wrap:wrap;justify-content:flex-start;">
          ${buttons}
        </div>
      </div>`;
  }

  afterRender() {
    const cmds = this._cmds();
    this.shadowRoot.querySelectorAll("button[data-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cmd = cmds[Number(btn.dataset.idx)];
        if (cmd) this.sendCommand(cmd);
      });
    });
  }
}
