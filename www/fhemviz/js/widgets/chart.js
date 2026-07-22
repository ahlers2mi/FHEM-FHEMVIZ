/*
 * FHEMVIZ - Chart-Widget (v0.16.0).
 * Zeichnet den Verlauf eines oder mehrerer Log-Readings als schlankes,
 * dark-themiges SVG-Flaechendiagramm - statt das hell gestylte FHEM-SVG
 * einzubetten. Datenquelle ist die vorhandene FHEMWEB-API (Log-Typ wird
 * automatisch erkannt):
 *   FileLog:  get <log> - - <von> <bis> 4:<reading>\x3a:0:
 *   DbLog:    get <log> - - <von> <bis> <quellgeraet>:<reading>::
 * (genau wie die gplot-Zeilen der FHEM-SVGs die Daten holen).
 *
 * Aktivierung:  attr <geraet> vizWidget chart
 *               attr <geraet> vizChart <logdev>:<reading>[:Label[:Farbe]][,...] [hours=24]
 * Beispiele:    FileLog_Sonoff_POW_01:ENERGY_Power:Leistung:accent hours=24
 *               LogDB:MQTT2_Sonoff_POW_01#ENERGY_Power:Leistung:accent  (DbLog: quellgeraet#reading)
 */

import { FhemvizWidget } from "./base-widget.js";

const REFRESH_MS = 300000; // Verlauf alle 5 min frisch ziehen

export class FhemvizChart extends FhemvizWidget {
  /** vizChart parsen: {hours, unit, series:[{logdev,reading,label,color}]}. */
  _spec() {
    const raw = String((this.device.attr || {}).vizChart || "").trim();
    if (!raw) return null;
    let hours = 24;
    let unit = "";
    const series = [];
    for (const tok of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      let m = tok.match(/^hours?\s*=\s*(\d+)$/i);
      if (m) { hours = Math.max(1, Math.min(2160, parseInt(m[1], 10))); continue; }
      m = tok.match(/^unit\s*=\s*(.+)$/i);
      if (m) { unit = m[1].trim(); continue; }
      const [logdev, reading, label, color] = tok.split(":").map((x) => (x || "").trim());
      if (logdev && reading) series.push({ logdev, reading, label: label || reading, color });
    }
    return series.length ? { hours, unit, series } : null;
  }

  connectedCallback() {
    super.connectedCallback();
    clearInterval(this._refresh);
    this._refresh = setInterval(() => this._load(), REFRESH_MS);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._refresh);
  }

  /** Nach dem Rendern: einmalig laden (Guard verhindert Nachlade-Schleife). */
  afterRender() {
    if (!this._data && !this._loading) this._load();
  }

  /** Log-Typ ermitteln (FileLog/DbLog) - fuer die richtige get-Syntax. Cache. */
  async _logType(logdev) {
    if (!this._types) this._types = {};
    if (this._types[logdev]) return this._types[logdev];
    let type = "FileLog";
    try {
      const snap = await this.client.snapshot(logdev);
      const r = snap && snap.Results && snap.Results[0];
      type = (r && r.Internals && r.Internals.TYPE) || "FileLog";
    } catch {
      /* Standard FileLog */
    }
    this._types[logdev] = type;
    return type;
  }

  _fmtTs(d) {
    const p = (n) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_` +
      `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    );
  }

  /** FileLog-get-Ausgabe -> [[ms, wert], ...] (Header-/Leerzeilen ignoriert). */
  _parse(text) {
    const pts = [];
    for (const line of String(text).split("\n")) {
      const m = line.match(
        /^(\d{4})-(\d\d)-(\d\d)[_ ](\d\d):(\d\d):(\d\d)\s+(-?\d[\d.eE+-]*)/
      );
      if (!m) continue;
      const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
      const v = parseFloat(m[7]);
      if (!isNaN(v)) pts.push([t, v]);
    }
    return pts;
  }

  async _load() {
    const spec = this._spec();
    if (!spec || !this.client) return;
    this._loading = true;
    const to = new Date();
    const from = new Date(to.getTime() - spec.hours * 3600 * 1000);
    try {
      const out = [];
      for (const s of spec.series) {
        const type = await this._logType(s.logdev);
        // reading kann "quellgeraet#reading" sein (fuer DbLog noetig, da ein
        // DbLog viele Geraete haelt); bei FileLog reicht der Reading-Name.
        const h = s.reading.indexOf("#");
        const src = h >= 0 ? s.reading.slice(0, h) : "";
        const rd = h >= 0 ? s.reading.slice(h + 1) : s.reading;
        const colspec = /DbLog/i.test(type)
          ? `${src || this.device.name}:${rd}::` // DbLog: <dev>:<reading>::
          : `4:${rd}\\x3a:0:`;                    // FileLog: Spalte 4 == Wert
        const cmd =
          `get ${s.logdev} - - ${this._fmtTs(from)} ${this._fmtTs(to)} ${colspec}`;
        const text = await this.client.command(cmd);
        out.push({ ...s, points: this._parse(text) });
      }
      this._data = { spec, series: out };
    } catch (e) {
      this._data = { spec, error: (e && e.message) || "Fehler beim Laden" };
    } finally {
      this._loading = false;
      this._paint();
    }
  }

  /** Bis zu ~300 Punkte behalten (gleichmaessig ausduennen). */
  _downsample(points, max = 300) {
    if (points.length <= max) return points;
    const step = points.length / max;
    const out = [];
    for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
    out.push(points[points.length - 1]);
    return out;
  }

  _colorOf(name, fallback) {
    return this.colorVar(name) || fallback;
  }

  /** SVG fuer eine Serie (Flaeche + Linie), skaliert in [0..W]x[0..H]. */
  _seriesSvg(pts, t0, t1, vMin, vMax, W, H, color, idx) {
    if (pts.length < 2) return "";
    const xf = (t) => ((t - t0) / (t1 - t0 || 1)) * W;
    const span = vMax - vMin || 1;
    const yf = (v) => H - ((v - vMin) / span) * H;
    let line = "";
    for (let i = 0; i < pts.length; i++) {
      line += (i ? "L" : "M") + xf(pts[i][0]).toFixed(1) + "," + yf(pts[i][1]).toFixed(1) + " ";
    }
    const area =
      `M${xf(pts[0][0]).toFixed(1)},${H} ` +
      line.replace(/^M/, "L") +
      `L${xf(pts[pts.length - 1][0]).toFixed(1)},${H} Z`;
    const gid = `g${idx}`;
    return `
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#${gid})" stroke="none"/>
      <path d="${line.trim()}" fill="none" stroke="${color}" stroke-width="2"
            stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  _num(v, dec = 1) {
    if (!isFinite(v)) return "–";
    let out = v.toFixed(dec);
    if (out.indexOf(".") >= 0) out = out.replace(/0+$/, "").replace(/\.$/, "");
    return out;
  }

  render() {
    const spec = this._spec();
    const chartCss = `
      <style>
        .chart { display: flex; flex-direction: column; height: 100%; gap: 6px; }
        .chead { display: flex; align-items: baseline; gap: 10px; }
        .cval { font-size: 1.9rem; font-weight: 650; letter-spacing: -0.02em;
                font-variant-numeric: tabular-nums; }
        :host([data-size="2x1"]) .cval, :host([data-size="1x2"]) .cval { font-size: 2.3rem; }
        :host([data-size="2x2"]) .cval { font-size: 3rem; }
        :host([data-tv]) .cval { font-size: 2.6rem; }
        .cunit { font-size: 0.9rem; color: var(--viz-muted); }
        .csvg { flex: 1 1 auto; min-height: 70px; width: 100%; display: block; }
        :host([data-size="1x2"]) .csvg, :host([data-size="2x2"]) .csvg { min-height: 150px; }
        .cfoot { display: flex; justify-content: space-between; gap: 8px;
                 font-size: 0.72rem; color: var(--viz-muted); }
        :host([data-tv]) .cfoot { font-size: 0.9rem; }
        .cmsg { color: var(--viz-muted); font-size: 0.85rem; padding: 8px 0; }
      </style>`;

    if (!spec) {
      return chartCss + `
        <div class="card"><span class="label">${this.escape(this.displayName())}</span>
          <div class="cmsg">Kein <b>vizChart</b> gesetzt.<br>
          z. B. <code>FileLog_x:ENERGY_Power:Leistung:accent hours=24</code></div>
        </div>`;
    }

    const head = `<span class="label">${this.escape(this.displayName())}</span>`;
    if (!this._data) {
      return chartCss + `<div class="card">${head}<div class="cmsg">lade Verlauf…</div></div>`;
    }
    if (this._data.error) {
      return chartCss + `<div class="card">${head}
        <div class="cmsg">Verlauf nicht ladbar: ${this.escape(this._data.error)}</div></div>`;
    }

    const series = this._data.series
      .map((s) => ({ ...s, points: this._downsample(s.points) }))
      .filter((s) => s.points.length);
    if (!series.length) {
      return chartCss + `<div class="card">${head}
        <div class="cmsg">Keine Daten im Zeitraum (${spec.hours} h).</div></div>`;
    }

    // Gemeinsame Achsen ueber alle Serien.
    let t0 = Infinity, t1 = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const s of series) {
      for (const [t, v] of s.points) {
        if (t < t0) t0 = t; if (t > t1) t1 = t;
        if (v < vMin) vMin = v; if (v > vMax) vMax = v;
      }
    }
    // Etwas Luft oben/unten.
    const pad = (vMax - vMin) * 0.08 || 1;
    vMin -= pad; vMax += pad;
    if (vMin > 0 && vMin < pad * 2) vMin = 0; // Nulllinie mitnehmen, wenn nah

    const W = 300, H = 100;
    const grid = [0.25, 0.5, 0.75]
      .map((f) => `<line x1="0" y1="${(H * f).toFixed(1)}" x2="${W}" y2="${(H * f).toFixed(1)}"
        stroke="var(--viz-border)" stroke-width="0.5" opacity="0.5"/>`)
      .join("");
    const paths = series
      .map((s, i) => this._seriesSvg(s.points, t0, t1, vMin, vMax, W, H,
        this._colorOf(s.color, "var(--viz-accent)"), i))
      .join("");

    // Kopfwert = letzter Wert der ersten Serie; Fusszeile Max/Min/Ø.
    const prim = series[0];
    const last = prim.points[prim.points.length - 1][1];
    const vals = prim.points.map((p) => p[1]);
    const max = Math.max(...vals), min = Math.min(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const u = spec.unit ? ` <span class="cunit">${this.escape(spec.unit)}</span>` : "";
    const legend = series.length > 1
      ? series.map((s) => `<span style="color:${this._colorOf(s.color, "var(--viz-accent)")}">●</span> ${this.escape(s.label)}`).join(" &nbsp; ")
      : `${prim.label !== this.device.name ? this.escape(prim.label) + " · " : ""}letzte ${spec.hours} h`;

    return chartCss + `
      <div class="card">
        <div class="chart">
          <div class="chead">${head}
            <span class="cval">${this._num(last)}${u}</span>
          </div>
          <svg class="csvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
            ${grid}${paths}
          </svg>
          <div class="cfoot">
            <span>${legend}</span>
            <span>Ø ${this._num(avg)} · ↑ ${this._num(max)} · ↓ ${this._num(min)}</span>
          </div>
        </div>
      </div>`;
  }
}
