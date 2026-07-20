/*
 * FHEMVIZ - Kontakt-Widget fuer Fenster/Tueren (v0.7.8).
 * Zustand auf einen Blick: OFFEN = Bernstein (faellt sofort auf),
 * GEKIPPT = eigener Zustand, ZU = ruhig/neutral. Symbol je nach Geraet
 * (Tuer, wenn Alias/Name "Tuer"/"door" enthaelt, sonst Fenster).
 *
 * Auswahl: automatisch fuer genericDeviceType window/door/contact ODER
 * wenn der state ein typischer Kontaktzustand ist (open/closed/tilted/
 * auf/zu/gekippt). Erzwingen: attr <geraet> vizWidget contact
 */

import { FhemvizWidget } from "./base-widget.js";

const CONTACT_CSS = `
  .cwrap { display: flex; align-items: center; gap: 14px; flex: 1; }
  .cicon { flex-shrink: 0; width: 42px; height: 42px; color: var(--viz-muted, #77808c); }
  .card.open .cicon, .card.tilted .cicon { color: var(--viz-accent, #ffb020); }
  .cstate { font-size: 1.25rem; font-weight: 450; }
  .card.open .cstate, .card.tilted .cstate { color: var(--viz-accent, #ffb020); font-weight: 600; }
  :host([data-tv]) .cicon { width: 56px; height: 56px; }
  :host([data-tv]) .cstate { font-size: 1.6rem; }
`;

// Einfache Stroke-Symbole (24x24): Fenster/Tuer, je zu/gekippt/offen.
const ICONS = {
  window_closed: `<rect x="4" y="3" width="16" height="18" rx="1"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="4" y1="12" x2="20" y2="12"/>`,
  window_tilted: `<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M6 19 L12 6 L18 19"/>`,
  window_open:   `<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3 L20 7 L20 17 L12 21"/>`,
  door_closed:   `<rect x="6" y="3" width="12" height="18" rx="1"/><circle cx="15" cy="12" r="1"/>`,
  door_open:     `<path d="M6 3 L18 3 L18 21 L6 21"/><path d="M6 3 L13 6 L13 23 L6 21 Z"/><circle cx="11" cy="13" r="1"/>`,
};

export class FhemvizContact extends FhemvizWidget {
  /** open | tilted | closed | unknown */
  _state() {
    const st = this.plain(this.device.state).toLowerCase();
    if (/^(open|opened|auf|offen|ge(ö|oe)ffnet)$/.test(st)) return "open";
    if (/^(tilted|gekippt|kipp(en|stellung)?)$/.test(st)) return "tilted";
    if (/^(closed|zu|geschlossen)$/.test(st)) return "closed";
    return "unknown";
  }

  _isDoor() {
    const hay = `${this.displayName()} ${this.device.name}`;
    return /t(ü|ue|u)r|door|tor\b/i.test(hay);
  }

  _icon(state) {
    const door = this._isDoor();
    let key;
    if (door) key = state === "closed" ? "door_closed" : "door_open";
    else if (state === "tilted") key = "window_tilted";
    else if (state === "open") key = "window_open";
    else key = "window_closed";
    return `<svg class="cicon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">${ICONS[key]}</svg>`;
  }

  _label(state) {
    if (state === "open") return "Offen";
    if (state === "tilted") return "Gekippt";
    if (state === "closed") return "Zu";
    return this.plain(this.device.state); // unbekannter Zustand: roh anzeigen
  }

  render() {
    const state = this._state();
    // Statusleiste: offen/gekippt = Bernstein ("on"), zu = neutral.
    const cardCls = state === "open" || state === "tilted" ? ` on ${state}` : ` ${state}`;
    return `
      <style>${CONTACT_CSS}</style>
      <div class="card${cardCls}">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="cwrap">
          ${this._icon(state)}
          <span class="cstate">${this.escape(this._label(state))}</span>
        </div>
      </div>`;
  }
}
