/*
 * FHEMVIZ - Text-Widget (v0.18.0).
 * Zwei Betriebsarten:
 *  1) attr <geraet> vizText "<Template>": freier Text mit Platzhaltern
 *     {reading[:stellen][|farbe]} - der eingesetzte Wert wird gross +
 *     farbig hervorgehoben, der Rest bleibt normaler Flie&text.
 *     Beispiel: "Es wird heute {tttt|ok} bis {cccc|bad} Grad"
 *     stellen = Nachkommastellen (Default: max. 2, Nullen weg),
 *     farbe   = ok|warn|bad|accent|blau (Default accent).
 *  2) ohne vizText: mehrzeiliger Klartext aus STATE/state (Terminlisten,
 *     Muellkalender u. ae.). Aktivierung: attr <geraet> vizWidget text
 */

import { FhemvizWidget } from "./base-widget.js";

const TEXT_CSS = `
  <style>
    .text.fmt { line-height: 1.45; }
    /* Werte relativ zur (mit Kachelgroesse/TV skalierenden) Textgroesse -
     * so wachsen sie automatisch mit. */
    .tval {
      font-size: 1.7em; font-weight: 700; letter-spacing: -0.01em;
      color: var(--viz-accent); font-variant-numeric: tabular-nums;
    }
  </style>`;

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

  /** Zahl formatieren: reine Zahl auf <stellen> (Default max. 2) runden. */
  _fmt(v, dec) {
    const s = String(v).trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) return s; // keine reine Zahl -> unveraendert
    const d = dec == null ? 2 : Math.max(0, Math.min(6, dec));
    let out = parseFloat(s).toFixed(d);
    if (out.indexOf(".") >= 0) out = out.replace(/0+$/, "").replace(/\.$/, "");
    return out;
  }

  /** Literaler Text: escapen, **fett** -> <b>, Zeilenumbrueche -> <br>. */
  _markup(s) {
    return this.escape(s)
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/\n/g, "<br>");
  }

  /**
   * Template in HTML aufloesen. Platzhalter:
   *   {reading[:stellen][|farbe]}  - Reading-Wert, gross + farbig
   *   {=Text[|farbe]}              - literaler Text, gross + farbig
   * Literaler Text ausserhalb: **fett** moeglich.
   */
  _renderTemplate(tpl) {
    const readings = this.device.readings || {};
    let out = "";
    let last = 0;
    const re = /\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(tpl)) !== null) {
      out += this._markup(tpl.slice(last, m.index));
      last = m.index + m[0].length;
      let spec = m[1].trim();
      let color = "";
      const pipe = spec.indexOf("|");
      if (pipe >= 0) {
        color = spec.slice(pipe + 1).trim();
        spec = spec.slice(0, pipe).trim();
      }
      const cv = this.colorVar(color) || "var(--viz-accent)";
      let val;
      if (spec.startsWith("=")) {
        // literaler, hervorgehobener Text (keine Reading-Aufloesung)
        val = spec.slice(1).trim();
      } else {
        let dec = null;
        const colon = spec.indexOf(":");
        if (colon >= 0) {
          const d = parseInt(spec.slice(colon + 1), 10);
          if (!isNaN(d)) dec = d;
          spec = spec.slice(0, colon).trim();
        }
        const raw = spec === "state" ? this.device.state : readings[spec];
        val =
          raw === undefined || raw === null || raw === ""
            ? "–"
            : this._fmt(this.plain(raw), dec);
      }
      out += `<span class="tval" style="color:${cv}">${this.escape(val)}</span>`;
    }
    out += this._markup(tpl.slice(last));
    return out;
  }

  render() {
    const tpl = (this.device.attr || {}).vizText;
    if (tpl) {
      return TEXT_CSS + `
        <div class="card">
          <span class="label">${this.escape(this.displayName())}</span>
          <div class="text fmt">${this._renderTemplate(tpl)}</div>
        </div>`;
    }
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
