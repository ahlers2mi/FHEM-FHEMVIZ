/*
 * FHEMVIZ - Aktions-Widget (webCmd), v0.7.0.
 * Rendert die webCmd-Befehle eines Geraets (z. B. "Auf:Zu:Lueften:Stop")
 * als Touch-Buttons (min. 38 px) und sendet "set <dev> <cmd>".
 * readonly (TV-Modus): nur der Zustand, keine Buttons.
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
    const buttons = this.readonly
      ? ""
      : `<div class="btnrow grow">${this._cmds()
          .map(
            (c, i) =>
              `<button class="pill" data-idx="${i}" title="set ${this.escape(
                this.device.name
              )} ${this.escape(c)}">${this.escape(c)}</button>`
          )
          .join("")}</div>`;
    return `
      <div class="card">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="value" style="font-size:1.15rem;font-weight:450;">${state}</div>
        ${buttons}
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
