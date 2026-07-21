/*
 * FHEMVIZ - Energiefluss-Widget (v0.8.0). Die Koenigsdisziplin.
 * Ersetzt das Floorplan-SolarDash (Pfeil-Dummies) durch EIN Widget:
 * Haus im Zentrum, PV links, Netz rechts, Batterie unten - verbunden
 * durch Laufpunkt-Ketten (Animation nach myhome.css animateDot).
 * Richtung folgt dem Vorzeichen, bei ~0 stehen die Punkte grau still.
 *
 * Aktivierung: attr <geraet> vizWidget flow  (+ vizSize 2x2 empfohlen)
 * Readings-Zuordnung (Default passt zu d_Wechselrichter_all):
 *   attr <geraet> vizFlow pv=pv_leistung,haus=out_leistung,
 *     netz=netzleistung_all,batterie=batterie_leistung,soc=soc
 * Vorzeichen: netz > 0 = Bezug (orange), < 0 = Einspeisung (gruen);
 *   batterie > 0 = laden, < 0 = entladen.
 */

import { FhemvizWidget } from "./base-widget.js";

const FLOW_CSS = `
  .fgrid { display: flex; flex-direction: column; align-items: center;
           gap: 2px; flex: 1; justify-content: center; }
  .frow { display: flex; align-items: center; gap: 6px; width: 100%;
          justify-content: center; }
  .fnode { text-align: center; min-width: 0; }
  .fnode .fv { font-size: 1.25rem; font-weight: 250; font-variant-numeric: tabular-nums; }
  .fnode .fl { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.12em;
               text-transform: uppercase; color: var(--viz-muted, #77808c); }
  .fcenter {
    border: 1px solid var(--viz-border, #262c35); border-radius: 12px;
    background: var(--viz-raised, #1c212a); padding: 8px 16px;
  }
  .fcenter .fv { font-size: 1.6rem; }
  /* Laufpunkt-Kette (nach myhome.css animateDot) */
  .chain { display: flex; gap: 7px; align-items: center; }
  .chain.v { flex-direction: column; }
  .dot {
    width: 7px; height: 7px; border-radius: 35%;
    background: var(--colour, var(--viz-ok, #34c77b));
    box-shadow: 0 0 6px var(--colour, var(--viz-ok, #34c77b)),
                0 0 12px var(--colour, var(--viz-ok, #34c77b));
    transform: scale(0.15);
    animation: animateDot 2s linear infinite;
    animation-delay: calc(0.14s * var(--i));
  }
  .chain.idle .dot {
    --colour: var(--viz-border, #262c35);
    animation: none; transform: scale(0.35); box-shadow: none;
  }
  @keyframes animateDot {
    0% { transform: scale(0.15); }
    10% { transform: scale(1); }
    50%, 100% { transform: scale(0.15); }
  }
  :host([data-tv]) .fnode .fv { font-size: 1.7rem; }
  :host([data-tv]) .fcenter .fv { font-size: 2.2rem; }
  :host([data-tv]) .dot { width: 9px; height: 9px; }
  @media (prefers-reduced-motion: reduce) {
    .dot { animation: none; transform: scale(0.6); }
  }
`;

const DEFAULT_MAP =
  "pv=pv_leistung,haus=out_leistung,netz=netzleistung_all,batterie=batterie_leistung,soc=soc";

export class FhemvizFlow extends FhemvizWidget {
  _map() {
    const spec = (this.device.attr && this.device.attr.vizFlow) || DEFAULT_MAP;
    const map = {};
    for (const t of String(spec).split(",")) {
      const [k, v] = t.split("=").map((x) => (x || "").trim());
      if (k && v) map[k] = v;
    }
    return map;
  }

  /**
   * vizReadings-Zeilen NUR fuer Werte, die die Fluss-Grafik nicht selbst
   * zeigt - sonst stehen PV/Haus/Netz/Batterie/SOC doppelt auf der Kachel
   * und machen sie unnoetig hoch.
   */
  _extraRows() {
    const parts = this.vizReadingParts();
    if (!parts) return "";
    const shown = new Set(Object.values(this._map()));
    return this.readingRowsHtml(parts.filter((p) => !shown.has(p.reading)));
  }

  _num(reading) {
    const n = parseFloat(this.plain((this.device.readings || {})[reading]));
    return isNaN(n) ? 0 : n;
  }

  /** Laufpunkt-Kette: dir "fwd" = in Leserichtung, "rev" = rueckwaerts. */
  _chain(vertical, value, dir, color) {
    const active = Math.abs(value) > 5;
    const n = 6;
    const dots = Array.from({ length: n }, (_, i) => {
      const idx = dir === "rev" ? n - 1 - i : i;
      return `<span class="dot" style="--i:${idx};${color ? `--colour:${color};` : ""}"></span>`;
    }).join("");
    return `<div class="chain${vertical ? " v" : ""}${active ? "" : " idle"}">${dots}</div>`;
  }

  _node(label, value, unit, color) {
    return `<div class="fnode">
      <div class="fv"${color ? ` style="color:${color};"` : ""}>${this.escape(value)}<span class="unit">${unit}</span></div>
      <span class="fl">${this.escape(label)}</span>
    </div>`;
  }

  render() {
    const m = this._map();
    const pv = this._num(m.pv);
    const haus = this._num(m.haus);
    const netz = this._num(m.netz);
    const batt = this._num(m.batterie);
    const soc = m.soc ? this._num(m.soc) : null;

    const ok = "var(--viz-ok)";
    const warn = "var(--viz-warn)";
    const accent = "var(--viz-accent)";

    // Richtungen: PV -> Haus | Netz: >0 Bezug (rechts->Mitte, orange),
    // <0 Einspeisung (Mitte->rechts, gruen) | Batterie: >0 laden
    // (Mitte->unten), <0 entladen (unten->Mitte, bernstein).
    const netzColor = netz > 5 ? warn : ok;
    const battColor = batt < -5 ? accent : ok;

    return `
      <style>${FLOW_CSS}</style>
      <div class="card">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="fgrid">
          <div class="frow">
            ${this._node("Photovoltaik", pv, " W", accent)}
            ${this._chain(false, pv, "fwd", ok)}
            <div class="fcenter fnode">
              <div class="fv">${this.escape(haus)}<span class="unit">W</span></div>
              <span class="fl">Haus</span>
            </div>
            ${this._chain(false, netz, netz > 5 ? "rev" : "fwd", netzColor)}
            ${this._node("Netz", netz, " W", netz > 5 ? warn : ok)}
          </div>
          ${this._chain(true, batt, batt < 0 ? "rev" : "fwd", battColor)}
          ${this._node(
            soc !== null ? `Batterie · ${soc} %` : "Batterie",
            batt, " W", battColor
          )}
        </div>
        ${this._extraRows()}
      </div>`;
  }
}
