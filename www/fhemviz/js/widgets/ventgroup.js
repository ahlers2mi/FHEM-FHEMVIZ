/*
 * FHEMVIZ - Lueften-Gruppe (v0.24.0).
 * Fuer ein FHEM-structure-Geraet aus Lueftungs-Empfehlungs-Dummies: EINE
 * Kachel, in der jeder Raum eine Zeile bekommt (Name + Wellen-Symbol +
 * Empfehlungstext, gruen = lueften sinnvoll, blau = kuehlt, rot = besser
 * nicht). Rein anzeigend (die vent-Empfehlung ist nicht schaltbar).
 *
 * Auswahl: erzwungen per attr <structure> vizWidget ventgroup. Die
 * Mitglieder muessen im devspec liegen (duerfen per vizHide aus dem Raster
 * raus). Empfehlung: vizSize 2x1/2x2.
 */

import { FhemvizWidget } from "./base-widget.js";

const VENTG_CSS = `
  .vgrows { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .vgrow { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .vgicon { flex-shrink: 0; width: 26px; height: 26px; }
  .vgicon path { stroke: var(--viz-border, #262c35); }
  .vgrow.go .vgicon path.a { stroke: var(--viz-ok, #34c77b); }
  .vgrow.cool .vgicon path.a { stroke: var(--viz-action, #4c8dff); }
  .vgrow.lo .vgicon path.a { stroke: var(--viz-muted, #77808c); }
  .vgrow.neg .vgicon path.a { stroke: var(--viz-error, #ff5d5d); }
  .vgname {
    flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; font-size: 0.95rem; color: var(--viz-text, #e8eaed);
  }
  .vgstate {
    flex-shrink: 0; text-align: right; font-size: 0.9rem;
    color: var(--viz-muted, #77808c);
  }
  .vgrow.go .vgstate { color: var(--viz-ok, #34c77b); font-weight: 600; }
  .vgrow.cool .vgstate { color: var(--viz-action, #4c8dff); font-weight: 600; }
  .vgrow.neg .vgstate { color: var(--viz-error, #ff5d5d); font-weight: 600; }
  .vgrow.hi .vgstate { font-weight: 700; }
  :host([data-size="2x2"]) .vgname, :host([data-tv]) .vgname { font-size: 1.2rem; }
  :host([data-size="2x2"]) .vgstate, :host([data-tv]) .vgstate { font-size: 1.1rem; }
  :host([data-tv]) .vgicon { width: 34px; height: 34px; }
`;

// Wortlaut wie im vent-Widget / my_lueften().
const LABELS = {
  "4": "Bitte unbedingt lüften", "3": "Bitte lüften",
  "2": "Kann gelüftet werden", "1": "Bei Bedarf lüften",
  "0": "Eher nicht lüften", "-1": "Besser nicht lüften",
  "-2": "Auf keinen Fall lüften", "-3": "Auf keinen Fall lüften",
};

const WAVES = [
  "M3 8 h9 a2.5 2.5 0 1 0 -2.5 -2.5",
  "M3 13 h13 a2.5 2.5 0 1 1 -2.5 2.5",
  "M3 18 h7 a2.5 2.5 0 1 1 -2.5 2.5",
];

export class FhemvizVentGroup extends FhemvizWidget {
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

  /** Mitglieder aus der structure-DEF ("<typ> dev1 dev2 ...") ueber den Store. */
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

  /** Empfehlung eines Mitglieds: {level,-3..4; cool; label; cls}. */
  _info(dev) {
    const n = parseInt(this.plain(dev.state), 10);
    const level = isNaN(n) ? 0 : Math.max(-3, Math.min(4, n));
    const cool = /^on$/i.test(String((dev.readings || {}).cooling || ""));
    let cls = "";
    if (level === 1) cls = "lo";
    else if (level >= 2) cls = (cool ? "cool go" : "go") + (level >= 3 ? " hi" : "");
    else if (level < 0) cls = "neg" + (level <= -3 ? " hi" : "");
    const label = LABELS[String(level)] + (cool && level > 0 ? " · kühlt" : "");
    return { level, cls, label };
  }

  _label(dev) {
    const raw = (dev.attr && dev.attr.alias) || dev.name;
    // "Lüften Wohnzimmer" -> "Wohnzimmer"; "wohnzimmer" -> "Wohnzimmer".
    const short = raw.replace(/^l(ü|ue)ften\s+/i, "");
    return short.charAt(0).toUpperCase() + short.slice(1);
  }

  render() {
    const members = this._members();
    if (!members.length) {
      return `
        <style>${VENTG_CSS}</style>
        <div class="card">
          <span class="label">${this.escape(this.displayName())}</span>
          <span class="sub">Mitglieder nicht in der Sicht (devspec prüfen)</span>
        </div>`;
    }
    const rows = members
      .map((m) => {
        const info = this._info(m);
        const waves = WAVES.map(
          (d, i) =>
            `<path d="${d}" class="${i < Math.min(3, Math.abs(info.level)) ? "a" : ""}"
               fill="none" stroke-width="1.8" stroke-linecap="round"/>`
        ).join("");
        return `
          <div class="vgrow ${info.cls}">
            <svg class="vgicon" viewBox="0 0 24 24" aria-hidden="true">${waves}</svg>
            <span class="vgname">${this.escape(this._label(m))}</span>
            <span class="vgstate">${this.escape(info.label)}</span>
          </div>`;
      })
      .join("");
    return `
      <style>${VENTG_CSS}</style>
      <div class="card">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="vgrows">${rows}</div>
      </div>`;
  }
}
