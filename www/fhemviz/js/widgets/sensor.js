/*
 * FHEMVIZ - Sensor-Widget (v0.7.0).
 * Strukturiert zusammengesetzte stateFormat-Strings: erste Komponente
 * gross als Hauptwert (Label klein darunter), weitere als Label/Wert-
 * Zeilen. Ein *_OK-Reading (Pool-Sensor BLEYC01) faerbt die Statusleiste
 * der Kachel gruen/rot.
 */

import { FhemvizWidget } from "./base-widget.js";

export class FhemvizSensor extends FhemvizWidget {
  /** *_OK-Reading -> "ok" | "bad" | "" (faerbt die Statusleiste). */
  _okState() {
    const r = this.device.readings || {};
    const okKey = Object.keys(r).find((k) => /_OK$/.test(k));
    if (!okKey) return "";
    return /^(true|1|ok|yes)$/i.test(String(r[okKey])) ? "ok" : "bad";
  }

  /**
   * Zerlegt den state in Komponenten (Trenner: Komma). Label/Wert-
   * Erkennung: fuehrender Text ohne Ziffern = Label, Rest ab erster
   * Zahl = Wert ("Feuchtigkeit 53.0 %" -> "Feuchtigkeit" | "53.0 %").
   */
  _parts() {
    return this.plain(this.device.state)
      .split(/\s*,\s*/)
      .filter(Boolean)
      .map((part) => {
        const m = part.match(/^([^\d]+?)[:\s]\s*(-?\d.*)$/);
        if (m && /[a-zA-ZäöüÄÖÜß]/.test(m[1])) {
          return { label: m[1].replace(/[:\s]+$/, ""), value: m[2].trim() };
        }
        return { label: "", value: part };
      });
  }

  render() {
    const ok = this._okState();
    const parts = this._parts();
    const main = parts.shift() ?? { label: "", value: "" };
    const mainHtml = `
      <div class="value">${this.escape(main.value)}</div>
      ${main.label ? `<span class="sub">${this.escape(main.label)}</span>` : ""}`;
    const rest = parts
      .map(
        (p) =>
          `<div class="row"><span class="sub">${this.escape(
            p.label || " "
          )}</span><span class="sub" style="color:var(--viz-text);">${this.escape(
            p.value
          )}</span></div>`
      )
      .join("");

    return `
      <div class="card ${ok}">
        <span class="label">${this.escape(this.displayName())}</span>
        ${mainHtml}
        ${rest ? `<div class="grow"></div>${rest}` : ""}
      </div>`;
  }
}
