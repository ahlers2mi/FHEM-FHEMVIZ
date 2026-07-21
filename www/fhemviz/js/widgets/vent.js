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
  .vstate { font-size: 1.15rem; font-weight: 450; min-width: 0;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card.go .vstate { color: var(--viz-ok, #34c77b); font-weight: 600; }
  .card.cool .vstate { color: var(--viz-action, #4c8dff); }
  :host([data-tv]) .vicon { width: 56px; height: 56px; }
  :host([data-tv]) .vstate { font-size: 1.5rem; }
`;

// Kurze, einzeilige Empfehlungen - damit alle Lueften-Kacheln gleich hoch
// bleiben (lange Saetze brachen um und rissen eine Kachel aus der Reihe).
// Bedeutung/Ampel wie in my_lueften().
const LABELS = {
  "4": "Unbedingt lüften!", "3": "Bitte lüften",
  "2": "Lüften möglich", "1": "Bei Bedarf lüften",
  "0": "Eher nicht lüften", "-1": "Besser nicht", "-2": "Nicht lüften!",
  "-3": "Nicht lüften!",
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
