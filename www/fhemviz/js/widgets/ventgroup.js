/*
 * FHEMVIZ - Lueften-Gruppe (v0.34.31).
 * Fuer ein FHEM-structure-Geraet aus Lueftungs-Empfehlungs-Dummies: EINE
 * Kachel, in der jeder Raum eine Zeile bekommt (Name + Wellen-Symbol +
 * Empfehlungstext, gruen = lueften sinnvoll, blau = kuehlt, rot = besser
 * nicht, grau = neutral). Die Staerke folgt my_lueften(): Stufe 1 blass,
 * 2 mittel, ab 3 voll. Rein anzeigend (die Empfehlung ist nicht schaltbar).
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
  /* Aktive Wellen und Text tragen die Stufenfarbe (--vg, je Zeile gesetzt);
   * ohne Stufe (0) bleibt es beim neutralen Grau. */
  .vgicon path.a { stroke: var(--vg, var(--viz-muted, #77808c)); }
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
  .vgrow.go.s1   { --vg: var(--vg-go-1); }
  .vgrow.go.s2   { --vg: var(--vg-go-2); }
  .vgrow.go.s3   { --vg: var(--vg-go-3); }
  .vgrow.cool.s1 { --vg: var(--vg-cool-1); }
  .vgrow.cool.s2 { --vg: var(--vg-cool-2); }
  .vgrow.cool.s3 { --vg: var(--vg-cool-3); }
  .vgrow.neg.s1  { --vg: var(--vg-neg-1); }
  .vgrow.neg.s2  { --vg: var(--vg-neg-2); }
  .vgrow.neg.s3  { --vg: var(--vg-neg-3); }
  .vgname {
    flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; font-size: 0.95rem; color: var(--viz-text, #e8eaed);
  }
  .vgstate {
    flex-shrink: 0; text-align: right; font-size: 0.9rem;
    color: var(--viz-muted, #77808c);
  }
  .vgrow.go .vgstate, .vgrow.cool .vgstate, .vgrow.neg .vgstate {
    color: var(--vg, var(--viz-muted, #77808c));
    font-weight: 600;
  }
  /* Dringlichkeit zusaetzlich in der Schriftstaerke - die Farbe allein soll
   * die sieben Stufen nicht tragen muessen. */
  .vgrow.s1 .vgstate { font-weight: 500; }
  .vgrow.s3 .vgstate { font-weight: 700; }
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
    // Reihenfolge: wie in der DEF - oder nach sortby, sobald eines gesetzt
    // ist (siehe sortMembers in base-widget).
    return this.sortMembers(
      String(internals.DEF || "")
        .split(/\s+/)
        .slice(1)
        .map((n) => n.replace(/,$/, ""))
        .map((n) => this.store.get(n))
        .filter(Boolean)
    );
  }

  /** Empfehlung eines Mitglieds: {level,-3..4; cool; label; cls}. */
  _info(dev) {
    const n = parseInt(this.plain(dev.state), 10);
    const level = isNaN(n) ? 0 : Math.max(-3, Math.min(4, n));
    const cool = /^on$/i.test(String((dev.readings || {}).cooling || ""));
    // Stufe = Betrag (max. 3) -> blass/mittel/voll wie die Saettigung in
    // my_lueften. Positiv gruen bzw. blau (kuehlt), negativ rot, 0 neutral.
    const stufe = Math.min(3, Math.abs(level));
    let cls = "";
    if (level > 0) cls = `${cool ? "cool" : "go"} s${stufe}`;
    else if (level < 0) cls = `neg s${stufe}`;
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
