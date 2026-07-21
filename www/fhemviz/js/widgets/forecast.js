/*
 * FHEMVIZ - PV-Prognose-Widget (vizWidget forecast, v0.9.0).
 * Zugeschnitten auf 76_SolarForecast (TYPE=SolarForecast wird automatisch
 * erkannt): Stunden-Balkenchart des Tages - vergangene Stunden zeigen den
 * IST-Ertrag (Today_HourXX_PVreal, kraeftig) VOR der Prognose
 * (Today_HourXX_PVforecast, blass dahinter), kuenftige Stunden nur die
 * Prognose. Darunter Sonnenzeiten, Peak-Stunde und die Morgen-Prognose.
 * Empfehlung: vizSize 2x1 oder 2x2.
 */

import { FhemvizWidget } from "./base-widget.js";

const FORECAST_CSS = `
  .chart {
    flex: 1 1 auto; min-height: 54px;
    display: flex; align-items: flex-end; gap: 2px;
    margin-top: 2px;
  }
  :host([data-size="2x2"]) .chart { min-height: 96px; }
  .bar { flex: 1; position: relative; height: 100%; min-width: 0; }
  .bar .fc, .bar .real {
    position: absolute; left: 0; right: 0; bottom: 0;
    border-radius: 2px 2px 0 0;
  }
  /* Prognose: blasse Saeule; IST: kraeftig davor - Abweichung ist sichtbar.
   * rgba-Zeile = Fallback fuer aeltere WebViews ohne color-mix. */
  .bar .fc   { background: rgba(255, 176, 32, 0.22);
               background: color-mix(in srgb, var(--viz-accent, #ffb020) 22%, transparent); }
  .bar .real { background: var(--viz-accent, #ffb020); }
  .bar.now .fc { background: rgba(255, 176, 32, 0.38);
                 background: color-mix(in srgb, var(--viz-accent, #ffb020) 38%, transparent); }
  .bar.now::after {
    content: ""; position: absolute; left: 20%; right: 20%; bottom: -4px;
    height: 2px; border-radius: 1px; background: var(--viz-text, #e8eaed);
  }
  .axis {
    display: flex; gap: 2px; margin-top: 5px;
    font-size: 0.62rem; color: var(--viz-muted, #77808c);
  }
  .axis span { flex: 1; text-align: center; min-width: 0; overflow: hidden; }
  :host([data-tv]) .axis { font-size: 0.78rem; }
`;

export class FhemvizForecast extends FhemvizWidget {
  /** Zahl aus einem Reading wie "3624 Wh" oder "113 W". */
  _num(r) {
    const m = String(this.device.readings?.[r] ?? "").match(/-?[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  }

  /** Wh -> "36,9 kWh" bzw. unter 1 kWh "641 Wh". */
  _kwh(wh) {
    if (wh === null) return "–";
    if (Math.abs(wh) < 1000) return `${Math.round(wh)} Wh`;
    const v = (wh / 1000).toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return `${v} kWh`;
  }

  /** Stundenreihe 1..24 aus Today_HourXX_* (real + forecast). */
  _hours() {
    const out = [];
    for (let h = 1; h <= 24; h++) {
      const xx = String(h).padStart(2, "0");
      out.push({
        h, // Reading-Stunde XX = Zeitraum (XX-1):00 bis XX:00
        fc: this._num(`Today_Hour${xx}_PVforecast`),
        real: this._num(`Today_Hour${xx}_PVreal`),
      });
    }
    return out;
  }

  render() {
    const r = this.device.readings || {};
    const plain = (x) => this.plain(x ?? "");

    const today = this._num("Today_PVforecast");
    const real = this._num("Today_PVreal");
    const tomorrow = this._num("Tomorrow_PVforecast");
    const curPV = this._num("Current_PV");
    const rise = plain(r.Today_SunRise);
    const set = plain(r.Today_SunSet);
    // "Today_MaxPVforecastTime 2026-07-21 11:00:00" -> "11:00"
    const peakM = plain(r.Today_MaxPVforecastTime).match(/(\d{2}:\d{2}):\d{2}$/);
    const peak = peakM ? peakM[1] : "";

    // Chart: Nachtstunden ohne Werte an den Raendern abschneiden.
    const hours = this._hours();
    const has = (x) => (x.fc ?? 0) > 0 || (x.real ?? 0) > 0;
    let a = hours.findIndex(has);
    let b = hours.length - 1 - [...hours].reverse().findIndex(has);
    if (a < 0) { a = 6; b = 21; } // keine Daten: Tagesfenster zeigen
    const view = hours.slice(Math.max(0, a - 1), Math.min(24, b + 1));
    const max = Math.max(1, ...view.map((x) => Math.max(x.fc ?? 0, x.real ?? 0)));
    const nowH = new Date().getHours() + 1; // laufende Stunde = Reading XX

    const bars = view
      .map((x) => {
        const fp = Math.round(((x.fc ?? 0) / max) * 100);
        const rp = Math.round(((x.real ?? 0) / max) * 100);
        return `<div class="bar${x.h === nowH ? " now" : ""}">
          <div class="fc" style="height:${fp}%"></div>
          ${x.real !== null ? `<div class="real" style="height:${rp}%"></div>` : ""}
        </div>`;
      })
      .join("");
    // Achse: volle Dreistundenschritte beschriften (Startstunde der Saeule).
    const axis = view
      .map((x) => `<span>${(x.h - 1) % 3 === 0 ? x.h - 1 : ""}</span>`)
      .join("");

    const on = (curPV ?? 0) > 5;
    const sun = rise && set ? `☀ ${rise} – ${set}` : "";
    const now = curPV !== null ? `${Math.round(curPV)} W jetzt` : "";

    return `<style>${FORECAST_CSS}</style>
      <div class="card${on ? " on" : ""}">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="row">
          <span class="value">${this.escape(this._kwh(today))}</span>
          <span class="sub">heute erwartet</span>
        </div>
        <div class="chart">${bars}</div>
        <div class="axis">${axis}</div>
        <div class="row">
          <span class="sub">${this.escape(sun)}${peak ? ` · Peak ${this.escape(peak)}` : ""}</span>
          <span class="sub">${this.escape(now)}</span>
        </div>
        <div class="row">
          <span class="sub">Ertrag bisher ${this.escape(this._kwh(real))}</span>
          <span class="sub">morgen ${this.escape(this._kwh(tomorrow))}</span>
        </div>
        ${this.readingRowsHtml()}
      </div>`;
  }
}
