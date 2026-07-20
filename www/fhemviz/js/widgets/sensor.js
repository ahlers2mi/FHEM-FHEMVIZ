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
   * Zerlegt den state in Komponenten (Trenner: Komma ODER Pipe - beide
   * sind in stateFormat ueblich, z. B. "452 W / 289 V | Haus 202 W").
   * Label/Wert-Erkennung: fuehrender Text ohne Ziffern = Label, Rest ab
   * erster Zahl = Wert ("Feuchtigkeit 53.0 %" -> "Feuchtigkeit" | "53.0 %").
   */
  /** Split an | und , - aber nicht innerhalb von Klammern. */
  _split(s) {
    const parts = [];
    let cur = "";
    let depth = 0;
    for (const ch of s) {
      if (ch === "(") depth++;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      if ((ch === "|" || ch === ",") && depth === 0) {
        parts.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    parts.push(cur);
    return parts.map((p) => p.trim()).filter(Boolean);
  }

  _parts() {
    return this._split(this.plain(this.device.state))
      .map((part) => {
        const m = part.match(/^([^\d]+?)[:\s]\s*(-?\d.*)$/);
        if (m && /[a-zA-ZäöüÄÖÜß]/.test(m[1])) {
          return { label: m[1].replace(/[:\s]+$/, ""), value: m[2].trim() };
        }
        return { label: "", value: part };
      });
  }

  /** vizReadings (Basis-Parser); hat Vorrang vor dem state-Parsing. */
  _configuredParts() {
    return this.vizReadingParts();
  }

  /** Schriftgroessen-Klasse: lange Hauptwerte werden kleiner statt zu wrappen. */
  _sizeClass(v) {
    if (v.length > 18) return " sm";
    if (v.length > 9) return " md";
    return "";
  }

  render() {
    const ok = this._okState();
    // vizReadings hat Vorrang vor dem state-Parsing.
    const configured = this._configuredParts();
    const parts = configured ?? this._parts();
    // vizStates: technischen state in Klartext + Farbe uebersetzen.
    const mapped = configured ? null : this.vizStateInfo();
    if (mapped) {
      parts.length = 0;
      parts.push({ label: "", value: mapped.text, color: mapped.color });
    }
    const main = parts.shift() ?? { label: "", value: "" };
    const mainColor = main.color ? ` style="color:${main.color};"` : "";
    const mainHtml = `
      <div class="value${this._sizeClass(main.value)}"${mainColor}>${this.escape(main.value)}</div>
      ${main.label ? `<span class="sub">${this.escape(main.label)}</span>` : ""}`;

    // Zeilen-Deckel gegen Monster-Kacheln (z. B. BMS mit 9 Komponenten) -
    // bei vizReadings zeigt die Kachel exakt, was konfiguriert wurde.
    const MAX_ROWS = configured ? parts.length : 5;
    const shown = parts.slice(0, MAX_ROWS);
    const more = parts.length - shown.length;
    const rest =
      shown
        .map(
          (p) =>
            `<div class="row"><span class="sub">${this.escape(
              p.label || " "
            )}</span><span class="sub" style="color:${
              p.color || "var(--viz-text)"
            };">${this.escape(p.value)}</span></div>`
        )
        .join("") +
      (more > 0 ? `<div class="sub">+${more} weitere</div>` : "");

    return `
      <div class="card ${ok}">
        <span class="label">${this.escape(this.displayName())}</span>
        ${mainHtml}
        ${shown.length ? `<div class="grow"></div>${rest}` : ""}
      </div>`;
  }
}
