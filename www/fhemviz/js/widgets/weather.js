/*
 * FHEMVIZ - Wetterstations-Widget (vizWidget weather, v0.13.0).
 * Zugeschnitten auf Ecowitt/GW3000-Readings (metrisch: temp_C,
 * windspeed_kmh, winddir, rainrate_mm, uv, solarradiation, ...) -
 * Geraete mit diesen Readings werden automatisch erkannt.
 *
 * Icon-first fuer den Blick aus der Ferne: grosse Temperatur, Windrose
 * mit gedrehtem Richtungspfeil, darunter Glance-Zeilen mit Symbol +
 * Wert (Regen, UV, Sonne, Luftdruck, innen). Empfehlung: vizSize 2x2.
 */

import { FhemvizWidget } from "./base-widget.js";

// Reading-Namen (Ecowitt-Standard, metrisch aufbereitet).
const R = {
  temp: "temp_C",
  hum: "humidity",
  tempin: "tempin_C",
  humin: "humidityin",
  wind: "windspeed_kmh",
  gust: "windgust_kmh",
  dir: "winddir",
  rainRate: "rainrate_mm",
  rainDay: "dailyrain_mm",
  press: "pressureRel_hPa",
  uv: "uv",
  solar: "solarradiation",
};

// Schlichte Stroke-Icons (24x24), Stil wie das Kontakt-Widget.
const ICONS = {
  rain: `<path d="M7 11 A5 5 0 1 1 17 11 H7 Z" fill="none"/><line x1="8" y1="15" x2="7" y2="19"/><line x1="12" y1="15" x2="11" y2="19"/><line x1="16" y1="15" x2="15" y2="19"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><line x1="12" y1="3" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="3" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21" y2="12"/><line x1="5.6" y1="5.6" x2="7.8" y2="7.8"/><line x1="16.2" y1="16.2" x2="18.4" y2="18.4"/><line x1="5.6" y1="18.4" x2="7.8" y2="16.2"/><line x1="16.2" y1="7.8" x2="18.4" y2="5.6"/>`,
  gauge: `<path d="M5 17 A8 8 0 1 1 19 17"/><line x1="12" y1="13" x2="16" y2="9"/><circle cx="12" cy="13" r="1.4"/>`,
  home: `<path d="M4 11 L12 4 L20 11"/><path d="M6 10 V20 H18 V10"/>`,
  drop: `<path d="M12 4 C12 4 6 11 6 15 A6 6 0 0 0 18 15 C18 11 12 4 12 4 Z" fill="none"/>`,
};

const WEATHER_CSS = `
  .wtop { display: flex; align-items: center; gap: 14px; }
  .wtemp { flex: 1; min-width: 0; }
  .wtemp .value { white-space: nowrap; }

  /* Windrose: Kreis, Pfeil in Windrichtung gedreht, km/h darunter. */
  .rose { flex-shrink: 0; text-align: center; }
  .rose svg { width: 58px; height: 58px; }
  .rose .sub { display: block; margin-top: 1px; }
  :host([data-size="2x2"]) .rose svg, :host([data-tv]) .rose svg { width: 72px; height: 72px; }

  .glance {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 4px 14px; margin-top: auto;
  }
  .gl { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .gl svg {
    width: 20px; height: 20px; flex-shrink: 0;
    color: var(--viz-muted, #77808c);
  }
  .gl .v {
    font-size: 0.95rem; font-weight: 500; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  :host([data-tv]) .gl svg { width: 26px; height: 26px; }
  :host([data-tv]) .gl .v { font-size: 1.15rem; }
`;

export class FhemvizWeather extends FhemvizWidget {
  _num(r) {
    const m = String(this.device.readings?.[r] ?? "").match(/-?[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  }

  /** Grad -> 8er-Windrose (N, NO, O, ...). */
  _rose8(deg) {
    if (deg === null) return "";
    const namen = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
    return namen[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  }

  /** UV-Index -> semantische Farbe. */
  _uvColor(uv) {
    if (uv === null) return "";
    if (uv >= 8) return "var(--viz-error)";
    if (uv >= 6) return "var(--viz-warn)";
    if (uv >= 3) return "var(--viz-accent)";
    return "var(--viz-ok)";
  }

  _icon(key, color = "") {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
      ${color ? `style="color:${color};"` : ""} aria-hidden="true">${ICONS[key]}</svg>`;
  }

  render() {
    const fmt = (v, digits = 1) =>
      v === null ? "–" : v.toLocaleString("de-DE", { maximumFractionDigits: digits });
    const temp = this._num(R.temp);
    const hum = this._num(R.hum);
    const wind = this._num(R.wind);
    const gust = this._num(R.gust);
    const dir = this._num(R.dir);
    const rate = this._num(R.rainRate);
    const rainDay = this._num(R.rainDay);
    const press = this._num(R.press);
    const uv = this._num(R.uv);
    const solar = this._num(R.solar);
    const tin = this._num(R.tempin);
    const hin = this._num(R.humin);

    const raining = (rate ?? 0) > 0;
    // Pfeil zeigt dahin, WOHIN der Wind weht (Meteorologie: winddir =
    // Herkunft, daher +180 Grad); bei Flaute neutral nach oben.
    const arrowDeg = dir === null ? 0 : (dir + 180) % 360;
    const calm = (wind ?? 0) < 1 && (gust ?? 0) < 1;
    const rose = `
      <div class="rose">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="24" cy="24" r="21" stroke="var(--viz-border, #262c35)"/>
          <text x="24" y="9.5" text-anchor="middle" font-size="7" fill="var(--viz-muted, #77808c)" stroke="none">N</text>
          <g transform="rotate(${arrowDeg} 24 24)" stroke="${calm ? "var(--viz-muted, #77808c)" : "var(--viz-accent, #ffb020)"}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <line x1="24" y1="33" x2="24" y2="15"/>
            <path d="M18.5 20.5 L24 13.5 L29.5 20.5" fill="none"/>
          </g>
        </svg>
        <span class="sub">${this.escape(fmt(wind))} km/h${dir !== null ? ` · ${this._rose8(dir)}` : ""}</span>
      </div>`;

    const gl = (icon, val, color = "", iconColor = "") => `
      <div class="gl">${this._icon(icon, iconColor)}
        <span class="v"${color ? ` style="color:${color};"` : ""}>${val}</span>
      </div>`;

    return `<style>${WEATHER_CSS}</style>
      <div class="card${raining ? " on" : ""}">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="wtop">
          <div class="wtemp">
            <div class="value">${this.escape(fmt(temp))}<span class="unit">°C</span></div>
            <span class="sub">${this.escape(fmt(hum, 0))} % Luftfeuchte</span>
          </div>
          ${rose}
        </div>
        <div class="glance">
          ${gl("rain", `${this.escape(fmt(rainDay, 1))} mm heute${raining ? ` · ${this.escape(fmt(rate, 1))} mm/h` : ""}`, raining ? "var(--viz-action)" : "", raining ? "var(--viz-action)" : "")}
          ${gl("sun", `UV ${this.escape(fmt(uv, 0))} · ${this.escape(fmt(solar, 0))} W/m²`, this._uvColor(uv), this._uvColor(uv))}
          ${gl("gauge", `${this.escape(fmt(press))} hPa`)}
          ${gl("home", `${this.escape(fmt(tin))} °C · ${this.escape(fmt(hin, 0))} %`)}
        </div>
        ${this.readingRowsHtml()}
      </div>`;
  }
}
