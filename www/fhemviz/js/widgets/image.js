/*
 * FHEMVIZ - Bild-Widget (v0.19.0).
 * Zeigt ein FHEM-Icon/Bild als Kachel - z. B. ein Wettervorhersage-Icon
 * (weblink vom Typ "image /fhem/icons/weather/..."). Die Bildquelle kommt
 * aus:
 *   1. attr vizImage: literale URL (/... oder http...) ODER ein Reading-Name,
 *      dessen Wert die URL/den Icon-Pfad enthaelt.
 *   2. sonst automatisch aus dem DEF eines weblink-image-Geraets.
 * Darunter Name + optionale Bildunterschrift (htmlattr title, sonst state).
 * Aktivierung:  attr <geraet> vizWidget image
 */

import { FhemvizWidget } from "./base-widget.js";

export class FhemvizImage extends FhemvizWidget {
  _src() {
    const attr = this.device.attr || {};
    const readings = this.device.readings || {};
    const vi = String(attr.vizImage || "").trim();
    if (vi) {
      // literale URL?
      if (/^(https?:)?\/\//i.test(vi) || vi.startsWith("/")) return vi;
      // sonst Reading-Name -> dessen Wert ist die URL/der Pfad
      const rv = readings[vi];
      if (rv !== undefined && rv !== null && rv !== "") return this.plain(rv);
      return "";
    }
    // weblink: DEF = "image <url>" (auch "iframe"/"htmlCode" ignorieren)
    const def = (this.device.internals || {}).DEF || "";
    const m = def.match(/^\s*image\s+(\S+)/i);
    return m ? m[1] : "";
  }

  _caption() {
    const h = String((this.device.attr || {}).htmlattr || "");
    const m = h.match(/title\s*=\s*"([^"]*)"/i);
    if (m) return m[1];
    const st = this.plain(this.device.state);
    return /^(initialized|defined|\?+)?$/i.test(st) ? "" : st;
  }

  render() {
    const src = this._src();
    const label = `<span class="label">${this.escape(this.displayName())}</span>`;
    const css = `
      <style>
        .imgcard { display: flex; flex-direction: column; height: 100%; gap: 8px; }
        .imgwrap { flex: 1 1 auto; display: flex; align-items: center;
                   justify-content: center; min-height: 60px; }
        .imgwrap img { max-width: 100%; max-height: 100%; object-fit: contain;
                       display: block; }
        .imgcap { font-size: 0.9rem; color: var(--viz-muted); text-align: center; }
        :host([data-size="2x2"]) .imgcap, :host([data-tv]) .imgcap { font-size: 1.1rem; }
        .imgmsg { color: var(--viz-muted); font-size: 0.85rem; padding: 8px 0; }
      </style>`;

    if (!src) {
      return css + `<div class="card">${label}
        <div class="imgmsg">Kein Bild (weblink-image oder <b>vizImage</b> setzen).</div></div>`;
    }
    const cap = this._caption();
    return css + `
      <div class="card">
        <div class="imgcard">
          ${label}
          <div class="imgwrap"><img src="${this.escape(src)}" alt="${this.escape(cap || this.displayName())}"></div>
          ${cap ? `<div class="imgcap">${this.escape(cap)}</div>` : ""}
        </div>
      </div>`;
  }
}
