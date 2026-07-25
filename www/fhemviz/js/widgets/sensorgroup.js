/*
 * FHEMVIZ - Sensor-/Thermometer-Gruppe (v0.29.0).
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
 * state. Feuchte: Reading humidity|hum. Einheiten °C / %.
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

  _fmt(n, digits = 1) {
    return n === null
      ? "–"
      : n.toLocaleString("de-DE", { maximumFractionDigits: digits });
  }

  _rowHtml(dev) {
    const label = (dev.attr && dev.attr.alias) || dev.name;
    const t = this._temp(dev);
    const h = this._hum(dev);
    return `
      <div class="sgr">
        <span class="sgn">${this.escape(label)}</span>
        <span class="sgv">
          <span class="sgt">${this._fmt(t)}<span class="u">°C</span></span>
          ${h !== null ? `<span class="sgh">${this._fmt(h, 0)} %</span>` : ""}
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
