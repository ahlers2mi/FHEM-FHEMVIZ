/*
 * FHEMVIZ - Lueftungs-Widget (v0.7.14).
 * Fuer Lueftungs-Empfehlungs-Dummies (state 0..9 = wie sinnvoll ist
 * Lueften; Reading cooling on = Lueften kuehlt zusaetzlich):
 * Wind-Wellen-Symbol mit 1-3 aktiven Wellen, gruen = lueften sinnvoll,
 * blau = kuehlt dabei, grau = nicht lueften.
 * Aktivierung: attr <geraet> vizWidget vent
 */

import { FhemvizWidget } from "./base-widget.js";

const VENT_CSS = `
  .vwrap { display: flex; align-items: center; gap: 14px; flex: 1; }
  .vicon { flex-shrink: 0; width: 44px; height: 44px; }
  .vicon path { stroke: var(--viz-border, #262c35); }
  .vicon path.a { stroke: var(--viz-ok, #34c77b); }
  .card.cool .vicon path.a { stroke: var(--viz-action, #4c8dff); }
  /* Stufe 1 (wenig sinnvoll): gedaempft statt gruen - klar unterscheidbar */
  .card.lo .vicon path.a { stroke: var(--viz-muted, #77808c); }
  .card.lo .vstate { color: var(--viz-muted, #77808c); font-weight: 450; }
  .card.hi .vstate { font-weight: 700; }
  /* Negative Stufen: Lueften waere kontraproduktiv -> rot */
  .card.neg .vicon path.a { stroke: var(--viz-error, #ff5d5d); }
  .card.neg .vstate { color: var(--viz-error, #ff5d5d); }
  .vstate { font-size: 1.35rem; font-weight: 450; line-height: 1.15; }
  .card.go .vstate { color: var(--viz-ok, #34c77b); font-weight: 600; }
  .card.cool .vstate { color: var(--viz-action, #4c8dff); }
  /* Groessere Kacheln: Symbol + Empfehlung wachsen mit. */
  :host([data-size="2x1"]) .vstate, :host([data-size="1x2"]) .vstate,
  :host([data-size="2x2"]) .vstate { font-size: 1.7rem; }
  :host([data-size="2x1"]) .vicon, :host([data-size="1x2"]) .vicon,
  :host([data-size="2x2"]) .vicon { width: 60px; height: 60px; }
  /* TV-Modus: aus der Ferne lesbar (zusaetzlich mal ?zoom). */
  :host([data-tv]) .vicon { width: 72px; height: 72px; }
  :host([data-tv]) .vstate { font-size: 2rem; }
  :host([data-tv][data-size="2x1"]) .vstate, :host([data-tv][data-size="1x2"]) .vstate,
  :host([data-tv][data-size="2x2"]) .vstate { font-size: 2.5rem; }
  :host([data-tv][data-size="2x2"]) .vicon { width: 92px; height: 92px; }
`;

// Wortlaut aus my_lueften() (lueftentext-Readings) uebernommen.
const LABELS = {
  "4": "Bitte unbedingt lüften", "3": "Bitte lüften",
  "2": "Kann gelüftet werden", "1": "Bei Bedarf lüften",
  "0": "Eher nicht lüften", "-1": "Besser nicht lüften",
  "-2": "Auf keinen Fall lüften", "-3": "Auf keinen Fall lüften",
};

export class FhemvizVent extends FhemvizWidget {
  _level() {
    const n = parseInt(this.plain(this.device.state), 10);
    return isNaN(n) ? 0 : Math.max(-3, Math.min(4, n));
  }

  _cooling() {
    return /^on$/i.test(String((this.device.readings || {}).cooling || ""));
  }

  render() {
    const level = this._level();
    const cool = this._cooling();
    // Drei Wind-Wellen; "level" davon aktiv (gruen bzw. blau bei cooling).
    const waves = [
      `M3 8 h9 a2.5 2.5 0 1 0 -2.5 -2.5`,
      `M3 13 h13 a2.5 2.5 0 1 1 -2.5 2.5`,
      `M3 18 h7 a2.5 2.5 0 1 1 -2.5 2.5`,
    ]
      .map(
        (d, i) =>
          `<path d="${d}" class="${i < Math.min(3, Math.abs(level)) ? "a" : ""}" fill="none"
             stroke-width="1.8" stroke-linecap="round"/>`
      )
      .join("");
    const label =
      LABELS[String(level)] + (cool && level > 0 ? " · kühlt" : "");
    let cls = "";
    if (level === 1) cls = " lo";
    else if (level >= 2) cls = (cool ? " on cool go" : " ok go") + (level >= 3 ? " hi" : "");
    else if (level < 0) cls = " neg" + (level <= -2 ? " bad" : "") + (level <= -3 ? " hi" : "");
    return `
      <style>${VENT_CSS}</style>
      <div class="card${cls}">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="vwrap">
          <svg class="vicon" viewBox="0 0 24 24" aria-hidden="true">${waves}</svg>
          <span class="vstate">${this.escape(label)}</span>
        </div>
        ${this.readingRowsHtml()}
      </div>`;
  }
}
