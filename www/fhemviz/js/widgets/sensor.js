/*
 * FHEMVIZ - Sensor-Widget (v0.4.0).
 * Strukturiert zusammengesetzte stateFormat-Strings:
 *   "Temperatur 23.4 C , Feuchtigkeit 53.0 % , Wasser 10.98 g/m3"
 * -> Hauptwert gross (erste Komponente), weitere Messwerte als kleine
 * Zeilen darunter statt einer langen Textwurst. Ein *_OK-Reading (wie beim
 * Pool-Sensor BLEYC01) speist die Ampelfarbe.
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

  /**
   * Zerlegt den state in Komponenten (Trenner: Komma). Aus jeder
   * Komponente wird, wenn moeglich, ein "Label: Wert Einheit"-Paar
   * extrahiert (z. B. "Feuchtigkeit 53.0 %" -> Label "Feuchtigkeit",
   * Wert "53.0 %").
   */
  _parts() {
    return this.plain(this.device.state)
      .split(/\s*,\s*/)
      .filter(Boolean)
      .map((part) => {
        // "Label 12.3 Einheit" bzw. "Label: 12.3 / 45.6 Einheit":
        // Label = fuehrender Text ohne Ziffern, Wert = Rest ab erster Zahl.
        const m = part.match(/^([^\d]+?)[:\s]\s*(-?\d.*)$/);
        if (m && /[a-zA-ZäöüÄÖÜß]/.test(m[1])) {
          return { label: m[1].replace(/[:\s]+$/, ""), value: m[2].trim() };
        }
        return { label: "", value: part };
      });
  }

  render() {
    const parts = this._parts();
    const main = parts.shift() ?? { label: "", value: "" };
    const mainHtml = main.label
      ? `<div class="value">${this.escape(main.value)}</div>
         <div class="sub">${this.escape(main.label)}</div>`
      : `<div class="value">${this.escape(main.value)}</div>`;
    const rest = parts
      .map(
        (p) =>
          `<div class="row"><span class="sub">${this.escape(
            p.label || " "
          )}</span><span class="sub">${this.escape(p.value)}</span></div>`
      )
      .join("");

    return `
      <div class="card">
        <div class="row">
          <span class="title">${this.escape(this.displayName())}</span>
          ${this._okDot()}
        </div>
        ${mainHtml}
        ${rest}
      </div>`;
  }
}
