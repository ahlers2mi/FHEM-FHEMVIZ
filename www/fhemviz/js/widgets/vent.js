/*
 * FHEMVIZ - Lueftungs-Widget (v0.34.31).
 * Fuer Lueftungs-Empfehlungs-Dummies (state 0..9 = wie sinnvoll ist
 * Lueften; Reading cooling on = Lueften kuehlt zusaetzlich):
 * Wind-Wellen-Symbol mit 1-3 aktiven Wellen, gruen = lueften sinnvoll,
 * blau = kuehlt dabei, rot = kontraproduktiv, grau = neutral (Stufe 0).
 * Die Staerke folgt my_lueften(): Stufe 1 blass, 2 mittel, ab 3 voll - dort
 * wird das Symbol mit 40/70/100 % Saettigung eingefaerbt.
 * Aktivierung: attr <geraet> vizWidget vent
 */

import { FhemvizWidget } from "./base-widget.js";

const VENT_CSS = `
  .vwrap { display: flex; align-items: center; gap: 14px; flex: 1; }
  .vicon { flex-shrink: 0; width: 44px; height: 44px; }
  .vicon path { stroke: var(--viz-border, #262c35); }
  .vicon path.a { stroke: var(--vg, var(--viz-muted, #77808c)); }
  .card.cool::before { background: var(--viz-action, #4c8dff); }
  /* Stufenfarben nach dem devStateIcon der Lueften-Dummys (my_lueften:
   * Saettigung 40/70/100 %). Blau liegt bewusst auf einem HELLEREN Grundton
   * (Farbton 215 statt 240): das reine #0000ff kommt auf dunklem Grund nur auf
   * Kontrast 2,3 - der dringendste Zustand (Stufe 3 + kuehlt) waere damit der
   * unsichtbarste. So sind es 4,2 bis 10,9. Ueber die Variablen kann ein Skin
   * die Palette austauschen. */
  :host {
    --vg-go-1: #99ff99;   --vg-go-2: #4dff4d;   --vg-go-3: #00ff00;
    --vg-cool-1: #99c4ff; --vg-cool-2: #4d97ff; --vg-cool-3: #006aff;
    --vg-neg-1: #ff9999;  --vg-neg-2: #ff4c4c;  --vg-neg-3: #ff0000;
  }
  .card.go.s1   { --vg: var(--vg-go-1); }
  .card.go.s2   { --vg: var(--vg-go-2); }
  .card.go.s3   { --vg: var(--vg-go-3); }
  .card.cool.s1 { --vg: var(--vg-cool-1); }
  .card.cool.s2 { --vg: var(--vg-cool-2); }
  .card.cool.s3 { --vg: var(--vg-cool-3); }
  .card.neg.s1  { --vg: var(--vg-neg-1); }
  .card.neg.s2  { --vg: var(--vg-neg-2); }
  .card.neg.s3  { --vg: var(--vg-neg-3); }
  .card.s1 .vstate { font-weight: 500; }
  .card.s3 .vstate { font-weight: 700; }
  .vstate { font-size: 1.15rem; font-weight: 450; }
  .card.go .vstate, .card.cool .vstate, .card.neg .vstate {
    color: var(--vg, var(--viz-muted, #77808c));
    font-weight: 600;
  }
  :host([data-tv]) .vicon { width: 56px; height: 56px; }
  :host([data-tv]) .vstate { font-size: 1.5rem; }
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
    // Stufe = Betrag (max. 3) -> blass/mittel/voll, wie die Saettigung in
    // my_lueften. Positiv gruen bzw. blau (kuehlt), negativ rot, 0 neutral.
    const stufe = Math.min(3, Math.abs(level));
    let cls = "";
    if (level > 0) cls = (cool ? " cool go" : " ok go") + ` s${stufe}`;
    else if (level < 0) cls = " neg" + (level <= -2 ? " bad" : "") + ` s${stufe}`;
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
