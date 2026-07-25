/*
 * FHEMVIZ - Sensor-/Thermometer-Gruppe (v0.29.3).
 * Fuer ein FHEM-structure-Geraet aus Temperatur-/Klima-Sensoren: EINE
 * kompakte Kachel, je Mitglied eine Zeile mit Temperatur (gross) und - falls
 * vorhanden - Feuchte klein daneben. Read-only (keine Bedienelemente) -
 * ideal als platzsparende Uebersicht auf dem Handy.
 *
 * Auswahl: structure mit clientstate "sensor"/"temp"/"thermo"/"klima" ->
 * automatisch; sonst per attr <structure> vizWidget sensorgroup. Mitglieder
 * muessen im devspec liegen (duerfen per vizHide aus dem Raster raus).
 *
 * Wert je Mitglied: Reading temperature|temp|temp_C, sonst die erste Zahl im
 * state. Feuchte: Reading humidity|hum (rel. %). Zusaetzlich wird - wenn Temp
 * und rel. Feuchte vorliegen - die absolute Feuchte (g/m³) berechnet und
 * daneben angezeigt. Einheiten °C / % / g/m³.
 */

import { FhemvizWidget } from "./base-widget.js";

const SENS_CSS = `
  .sgr { display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
    padding: 7px 0; border-bottom: 1px solid var(--viz-border, #262c35); }
  .sgr:last-child { border-bottom: 0; padding-bottom: 0; }
  .sgn { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 0.95rem; color: var(--viz-text, #e8eaed); }
  .sgv { flex-shrink: 0; display: flex; align-items: baseline; gap: 8px; }
  .sgt { font-size: 1.25rem; font-weight: 600; font-variant-numeric: tabular-nums;
    color: var(--viz-text, #e8eaed); white-space: nowrap; }
  .sgt .u { font-size: 0.7em; color: var(--viz-muted, #77808c); margin-left: 1px; }
  .sgh { font-size: 0.85rem; color: var(--viz-muted, #77808c); white-space: nowrap;
    font-variant-numeric: tabular-nums; }
  :host([data-tv]) .sgn { font-size: 1.2rem; }
  :host([data-tv]) .sgt { font-size: 1.6rem; }
  :host([data-tv]) .sgh { font-size: 1.05rem; }
`;

export class FhemvizSensorGroup extends FhemvizWidget {
  connectedCallback() {
    super.connectedCallback();
    if (this.store) {
      this._memberUnsubs = this._members().map((m) =>
        this.store.subscribe(m.name, () => this._paint())
      );
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    (this._memberUnsubs || []).forEach((u) => u());
  }

  _members() {
    if (!this.store) return [];
    const internals = this.device.internals || {};
    if (internals.TYPE !== "structure") return [];
    return String(internals.DEF || "")
      .split(/\s+/)
      .slice(1)
      .map((n) => n.replace(/,$/, ""))
      .map((n) => this.store.get(n))
      .filter(Boolean);
  }

  _num(v) {
    const m = String(v ?? "").match(/-?\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace(",", ".")) : null;
  }

  _temp(dev) {
    const r = dev.readings || {};
    for (const k of ["temperature", "temp", "temp_C"]) {
      if (r[k] !== undefined) return this._num(r[k].Value ?? r[k]);
    }
    // Fallback: erste Zahl im (Klartext-)state.
    return this._num(this.plain(dev.state));
  }

  _hum(dev) {
    const r = dev.readings || {};
    for (const k of ["humidity", "hum"]) {
      if (r[k] !== undefined) return this._num(r[k].Value ?? r[k]);
    }
    return null;
  }

  /** Absolute Feuchte (g/m³) aus Temperatur (°C) + rel. Feuchte (%),
   *  Magnus-Formel. Null, wenn eine Groesse fehlt. */
  _absHum(t, rh) {
    if (t === null || rh === null) return null;
    const es = 6.112 * Math.exp((17.62 * t) / (243.12 + t)); // Saettigungsdruck hPa
    return (216.7 * ((rh / 100) * es)) / (273.15 + t);
  }

  _fmt(n, digits = 1) {
    return n === null
      ? "–"
      : n.toLocaleString("de-DE", { maximumFractionDigits: digits });
  }

  // Farbskala wie im FHEM-notify n_Mobildata:
  //   rel. Feuchte %:  >=75 rot, >=65 orange, sonst neutral.
  //   abs. Feuchte g/m³: >=14 rot, >=13 orange, sonst neutral.
  _humColor(rh) {
    if (rh === null) return "";
    if (rh >= 75) return "var(--viz-error, #ff5d5d)";
    if (rh >= 65) return "var(--viz-warn, #ffab40)";
    return "";
  }

  _ahColor(ah) {
    if (ah === null) return "";
    if (ah >= 14) return "var(--viz-error, #ff5d5d)";
    if (ah >= 13) return "var(--viz-warn, #ffab40)";
    return "";
  }

  _rowHtml(dev) {
    const label = (dev.attr && dev.attr.alias) || dev.name;
    const t = this._temp(dev);
    const h = this._hum(dev);
    const ah = this._absHum(t, h);
    const chip = (txt, color) =>
      `<span${color ? ` style="color:${color}"` : ""}>${txt}</span>`;
    const humParts = [];
    if (h !== null) humParts.push(chip(`${this._fmt(h, 0)} %`, this._humColor(h)));
    if (ah !== null) humParts.push(chip(`${this._fmt(ah, 1)} g/m³`, this._ahColor(ah)));
    return `
      <div class="sgr">
        <span class="sgn">${this.escape(label)}</span>
        <span class="sgv">
          <span class="sgt">${this._fmt(t)}<span class="u">°C</span></span>
          ${humParts.length ? `<span class="sgh">${humParts.join(" · ")}</span>` : ""}
        </span>
      </div>`;
  }

  render() {
    const members = this._members();
    if (!members.length) {
      return `
        <style>${SENS_CSS}</style>
        <div class="card">
          <span class="label">${this.escape(this.displayName())}</span>
          <span class="sub">Mitglieder nicht in der Sicht (devspec prüfen)</span>
        </div>`;
    }
    return `
      <style>${SENS_CSS}</style>
      <div class="card">
        <span class="label">${this.escape(this.displayName())}</span>
        <div>${members.map((m) => this._rowHtml(m)).join("")}</div>
      </div>`;
  }
}
