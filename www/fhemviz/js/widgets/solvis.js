/*
 * FHEMVIZ - Solvis-Heizung/Solarthermie (v0.25.0).
 * Anlagenschema-Kachel fuer ein SolvisClient-Geraet: Solar (Kollektor/
 * Leistung/Ertrag/Durchfluss) links, Schichtspeicher (oben/mitte/unten) als
 * Zylinder in der Mitte, Verbraucher (Warmwasser/Heizkreise) rechts,
 * Aussentemperatur + Brenner in der Fusszeile.
 *
 * Readings werden ueber die modul-festen Praefixe gefunden (S01..S18, SL,
 * SE, A01, A12 - unabhaengig vom deutschen Suffix). Aktivierung:
 * attr <geraet> vizWidget solvis. Empfehlung: vizSize 2x2.
 * Sensorwert 250 = "nicht verbunden" -> wird als "–" gezeigt.
 */

import { FhemvizWidget } from "./base-widget.js";

const SOLVIS_CSS = `
  .sv { }
  .sv-grid {
    display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px;
    align-items: stretch; margin-top: 6px;
  }
  .sv-col { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
  .sv-h {
    font-size: 0.62rem; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--viz-muted, #77808c);
  }
  .sv-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0; }
  .sv-k { font-size: 0.8rem; color: var(--viz-muted, #77808c);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sv-v { font-size: 1.05rem; font-weight: 600; flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .sv-v .u { font-size: 0.7em; font-weight: 400; color: var(--viz-muted, #77808c); margin-left: 1px; }
  .sv-v.cold { color: var(--viz-action, #4c8dff); }
  .sv-v.warm { color: var(--viz-warn, #ffab40); }
  .sv-v.hot  { color: var(--viz-error, #ff5d5d); }
  .sv-v.off  { color: var(--viz-muted, #77808c); font-weight: 400; }

  /* Solarblock: Panel-Symbol, gruen wenn Solarpumpe laeuft */
  .sv-solar .sv-panel { width: 100%; height: 34px; color: var(--viz-muted, #77808c); }
  .sv.solar-on .sv-solar .sv-panel { color: var(--viz-ok, #34c77b); }
  .sv.solar-on .sv-solar .sv-h { color: var(--viz-ok, #34c77b); }

  /* Schichtspeicher als Zylinder mit Stratifikations-Verlauf */
  .sv-tank { display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .sv-cyl {
    position: relative; width: 66px; height: 100%; min-height: 150px;
    border: 2px solid var(--viz-border, #262c35); border-radius: 16px;
    background: linear-gradient(180deg,
      color-mix(in srgb, var(--viz-error, #ff5d5d) 55%, transparent) 0%,
      color-mix(in srgb, var(--viz-warn, #ffab40) 45%, transparent) 42%,
      color-mix(in srgb, var(--viz-action, #4c8dff) 40%, transparent) 100%);
    overflow: hidden;
  }
  .sv-cyl .seg { position: absolute; left: 0; right: 0; text-align: center;
    font-size: 0.9rem; font-weight: 700; font-variant-numeric: tabular-nums;
    color: var(--viz-text, #e8eaed); text-shadow: 0 1px 3px rgba(0,0,0,0.6); }
  .sv-cyl .seg.top { top: 8px; } .sv-cyl .seg.mid { top: 50%; transform: translateY(-50%); }
  .sv-cyl .seg.bot { bottom: 8px; }
  .sv-tank .sv-cap { margin-top: 5px; font-size: 0.62rem; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--viz-muted, #77808c); }

  .sv-foot {
    display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap;
    margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--viz-border, #262c35);
    font-size: 0.8rem; color: var(--viz-muted, #77808c);
  }
  .sv-foot b { color: var(--viz-text, #e8eaed); font-weight: 600; }
  .sv-foot .on { color: var(--viz-ok, #34c77b); font-weight: 700; }

  :host([data-tv]) .sv-v { font-size: 1.3rem; }
  :host([data-tv]) .sv-cyl .seg { font-size: 1.15rem; }
  :host([data-tv]) .sv-foot { font-size: 1rem; }

  @media (max-width: 520px) {
    .sv-grid { grid-template-columns: 1fr; }
    .sv-tank { order: -1; }
    .sv-cyl { width: 100%; min-height: 90px; height: 90px; }
    .sv-cyl .seg.top { top: 6px; } .sv-cyl .seg.bot { bottom: 6px; }
  }
`;

export class FhemvizSolvis extends FhemvizWidget {
  /** Reading ueber Praefix finden (S04 -> "S04.Heizungspuffertemperatur_oben"). */
  _raw(prefix) {
    const r = this.device.readings || {};
    const key = Object.keys(r).find((k) => k === prefix || k.startsWith(prefix + "."));
    return key === undefined ? undefined : r[key];
  }

  _num(prefix) {
    const v = this._raw(prefix);
    if (v === undefined) return null;
    const n = parseFloat(String(v).replace(",", "."));
    return isNaN(n) ? null : n;
  }

  /** Temperatur formatieren; 250 (bzw. >=250) = nicht verbunden -> "–". */
  _temp(prefix, dec = 1) {
    const n = this._num(prefix);
    if (n === null || n >= 250) return { txt: "–", cls: "off" };
    let cls = "";
    if (n < 30) cls = "cold";
    else if (n < 55) cls = "";
    else if (n < 70) cls = "warm";
    else cls = "hot";
    return { txt: this.fmtNum(String(n), dec), cls, unit: "°C" };
  }

  _row(k, prefix, dec = 1) {
    const t = this._temp(prefix, dec);
    return `<div class="sv-row"><span class="sv-k">${this.escape(k)}</span>
      <span class="sv-v ${t.cls}">${t.txt}${t.unit && t.txt !== "–" ? `<span class="u">${t.unit}</span>` : ""}</span></div>`;
  }

  _valRow(k, prefix, unit, dec) {
    const n = this._num(prefix);
    const txt = n === null ? "–" : this.fmtNum(String(n), dec);
    return `<div class="sv-row"><span class="sv-k">${this.escape(k)}</span>
      <span class="sv-v">${txt}${n === null ? "" : `<span class="u">${unit}</span>`}</span></div>`;
  }

  render() {
    const solarOn = (this._num("A01") || 0) > 0 || (this._num("SL") || 0) > 0.1;
    const brenner = /^(on|an|1)$/i.test(this.plain(this._raw("A12")));
    const oben = this._temp("S04");
    const mid = this._temp("S03");
    const unten = this._temp("S09");
    const aussen = this._temp("S10");

    const panel = `<svg class="sv-panel" viewBox="0 0 60 20" fill="none" stroke="currentColor"
      stroke-width="1.4" aria-hidden="true">
      <rect x="1" y="1" width="58" height="18" rx="1.5"/>
      <line x1="15" y1="1" x2="15" y2="19"/><line x1="30" y1="1" x2="30" y2="19"/>
      <line x1="45" y1="1" x2="45" y2="19"/><line x1="1" y1="10" x2="59" y2="10"/></svg>`;

    return `
      <style>${SOLVIS_CSS}</style>
      <div class="card sv${solarOn ? " solar-on" : ""}">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="sv-grid">
          <div class="sv-col sv-solar">
            <div class="sv-h">Solar</div>
            ${panel}
            ${this._row("Kollektor", "S08")}
            ${this._valRow("Leistung", "SL", "kW", 1)}
            ${this._valRow("Ertrag", "SE", "kWh", 0)}
            ${this._valRow("Durchfluss", "S17", "l/h", 0)}
          </div>
          <div class="sv-tank">
            <div class="sv-cyl">
              <span class="seg top">${oben.txt === "–" ? "–" : oben.txt + "°"}</span>
              <span class="seg mid">${mid.txt === "–" ? "–" : mid.txt + "°"}</span>
              <span class="seg bot">${unten.txt === "–" ? "–" : unten.txt + "°"}</span>
            </div>
            <span class="sv-cap">Speicher</span>
          </div>
          <div class="sv-col sv-load">
            <div class="sv-h">Wärme</div>
            ${this._row("Warmwasser", "S02")}
            ${this._row("Zirkulation", "S11")}
            ${this._row("Heizkreis 1", "S12")}
            ${this._row("Heizkreis 2", "S13")}
          </div>
        </div>
        <div class="sv-foot">
          <span>Außen <b>${aussen.txt}${aussen.txt !== "–" ? " °C" : ""}</b></span>
          <span>Brenner <b class="${brenner ? "on" : ""}">${brenner ? "an" : "aus"}</b></span>
        </div>
      </div>`;
  }
}
