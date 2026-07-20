/*
 * FHEMVIZ - Text-Widget (v0.7.2).
 * Zeigt mehrzeiligen Klartext mit erhaltenen Zeilenumbruechen - fuer
 * Kalender-/Terminlisten wie den Muellkalender (DoRemoteDevice mit
 * mehrzeiligem STATE-Reading). Aktivierung: attr <geraet> vizWidget text
 * Tipp: attr <geraet> vizSize 2x1 fuer mehr Platz.
 */

import { FhemvizWidget } from "./base-widget.js";

export class FhemvizText extends FhemvizWidget {
  /**
   * Klartext MIT Zeilenumbruechen: <br> wird zu \n, uebrige Tags entfernt,
   * Leerzeichen (aber nicht Newlines) kollabiert.
   */
  _plainMultiline(s) {
    return String(s ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  render() {
    // Reading STATE (Grossbuchstaben, mit echten \n) bevorzugen - der
    // formatierte state enthaelt oft nur <br>-HTML (stateFormat).
    const r = this.device.readings || {};
    const raw = r.STATE ?? this.device.state;
    const text = this._plainMultiline(raw) || "–";
    return `
      <div class="card">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="text">${this.escape(text)}</div>
      </div>`;
  }
}
