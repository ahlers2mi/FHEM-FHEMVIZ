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
  /* Nur das grosse Einzel-Symbol (in .cwrap) faerben - im Gruppen-Raster
   * bekommt jedes Mitglied seine Farbe einzeln (.mg.open/.mg.tilted),
   * sonst wuerden in einer offenen Gruppe ALLE Symbole amber. */
  .card.open .cwrap .cicon, .card.tilted .cwrap .cicon { color: var(--viz-accent, #ffb020); }
  .cstate { font-size: 1.25rem; font-weight: 450; }
  .card.open .cstate, .card.tilted .cstate { color: var(--viz-accent, #ffb020); font-weight: 600; }
  :host([data-tv]) .cicon { width: 56px; height: 56px; }
  :host([data-tv]) .cstate { font-size: 1.6rem; }

  /* Gruppen-Modus (structure): Mini-Symbol je Mitglied */
  .members { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
  .members .cicon { width: 20px; height: 20px; }
  .members .cicon.open, .members .cicon.tilted { color: var(--viz-accent, #ffb020); }
  :host([data-tv]) .members .cicon { width: 26px; height: 26px; }

  /* Grosse Gruppenkachel (vizSize 2x…): Raster Symbol + Name darunter -
   * wie das klassische Fenster-Panel, aus der Ferne lesbar. */
  .mgrid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(62px, 1fr));
    gap: 10px 6px; margin-top: 6px; overflow: hidden;
  }
  .mg { text-align: center; min-width: 0; }
  .mg .cicon { width: 28px; height: 28px; }
  .mg.open .cicon, .mg.tilted .cicon { color: var(--viz-accent, #ffb020); }
  .mg .mname {
    display: block; margin-top: 2px; font-size: 0.62rem;
    color: var(--viz-muted, #77808c);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .mg.open .mname, .mg.tilted .mname {
    color: var(--viz-accent, #ffb020); font-weight: 600;
  }
  :host([data-tv]) .mgrid { grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); }
  :host([data-tv]) .mg .cicon { width: 36px; height: 36px; }
  :host([data-tv]) .mg .mname { font-size: 0.78rem; }
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
  connectedCallback() {
    super.connectedCallback();
    // Gruppen-Modus: Mitglieder live abonnieren, damit jedes Mini-Symbol
    // bei einer Zustandsaenderung einzeln nachzieht.
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

  /**
   * structure-Geraet? Dann Mitglieder aus der DEF lesen und ueber den
   * Store aufloesen (nur die, die in der Sicht sind).
   * DEF-Format: "structure <struct_type> <dev1> <dev2> ..."
   */
  _members() {
    if (!this.store) return [];
    const internals = this.device.internals || {};
    if (internals.TYPE !== "structure") return [];
    return String(internals.DEF || "")
      .split(/\s+/)
      .slice(1) // erstes Token ist der struct_type (z. B. "onoff")
      .map((n) => n.replace(/,$/, ""))
      .map((n) => this.store.get(n))
      .filter(Boolean);
  }

  /**
   * open | tilted | closed | unknown (fuer beliebige state-Strings).
   * Praefix-tolerant: "closed (battery low)" u. ae. zaehlen als closed.
   */
  _stateOf(raw) {
    const st = this.plain(raw).toLowerCase();
    if (/^(open|opened|auf|offen|ge(ö|oe)ffnet|on)\b/.test(st)) return "open";
    if (/^(tilted|gekippt|kipp(en|stellung)?)\b/.test(st)) return "tilted";
    if (/^(closed|zu|geschlossen|off)\b/.test(st)) return "closed";
    return "unknown";
  }

  /** open | tilted | closed | unknown (eigener state) */
  _state() {
    return this._stateOf(this.device.state);
  }

  _isDoor() {
    const hay = `${this.displayName()} ${this.device.name}`;
    return /t(ü|ue|u)r|door|tor\b/i.test(hay);
  }

  _icon(state, isDoor, extraCls = "") {
    let key;
    if (isDoor) key = state === "closed" ? "door_closed" : "door_open";
    else if (state === "tilted") key = "window_tilted";
    else if (state === "open") key = "window_open";
    else key = "window_closed";
    return `<svg class="cicon ${extraCls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">${ICONS[key]}</svg>`;
  }

  _label(state) {
    if (state === "open") return "Offen";
    if (state === "tilted") return "Gekippt";
    if (state === "closed") return "Zu";
    // Unbekannter Zustand: roh anzeigen, aber nie "undefined"/"???".
    const raw = this.plain(this.device.state);
    return /^(undefined|unknown|\?+)?$/i.test(raw) ? "–" : raw;
  }

  _looksLikeDoor(name) {
    return /t(ü|ue|u)r|door|tor\b/i.test(name);
  }

  /**
   * Gruppen-Kachel: "2 offen · 1 gekippt" bzw. "Alles zu". Kompakt nur
   * Mini-Symbole; auf grossen Kacheln (vizSize 2x…) ein Raster mit Namen
   * unter den Symbolen (wie das klassische Fenster-Panel).
   */
  _renderGroup(members) {
    const infos = members.map((m) => {
      const title = (m.attr && m.attr.alias) || m.name;
      return {
        state: this._stateOf(m.state),
        door: this._looksLikeDoor(`${(m.attr && m.attr.alias) || ""} ${m.name}`),
        title,
        // Kurzname fuers Raster: "Fenster Wohnzimmer" -> "Wohnzimmer".
        short: title.replace(/^(fenster|t(ü|ue)r(e|en)?|door|window|kontakt)\s+/i, ""),
      };
    });
    const open = infos.filter((i) => i.state === "open").length;
    const tilted = infos.filter((i) => i.state === "tilted").length;

    const headParts = [];
    if (open) headParts.push(`${open} offen`);
    if (tilted) headParts.push(`${tilted} gekippt`);
    const head = headParts.length ? headParts.join(" · ") : "Alles zu";
    const attention = open + tilted > 0;

    const big = /^2/.test(this.getAttribute("data-size") || "");
    const body = big
      ? `<div class="mgrid">${infos
          .map(
            (i) => `
          <div class="mg ${i.state}" title="${this.escape(i.title)}">
            ${this._icon(i.state, i.door)}
            <span class="mname">${this.escape(i.short)}</span>
          </div>`
          )
          .join("")}</div>`
      : `<div class="members">${infos
          .map((i) =>
            this._icon(i.state, i.door, i.state).replace(
              "<svg ",
              `<svg data-title="${this.escape(i.title)}" `
            )
          )
          .join("")}</div>`;

    return `
      <style>${CONTACT_CSS}</style>
      <div class="card${attention ? " on open" : " closed"}">
        <span class="label">${this.escape(this.displayName())}</span>
        <span class="cstate">${this.escape(head)}</span>
        ${body}
      </div>`;
  }

  render() {
    const members = this._members();
    if (members.length) return this._renderGroup(members);

    // structure ohne aufloesbare Mitglieder: erklaeren statt "undefined".
    if ((this.device.internals || {}).TYPE === "structure") {
      return `
        <style>${CONTACT_CSS}</style>
        <div class="card">
          <span class="label">${this.escape(this.displayName())}</span>
          <span class="cstate">–</span>
          <span class="sub">Mitglieder nicht in der Sicht (FHEMVIZ-Raum am Geraet pruefen)</span>
        </div>`;
    }

    const state = this._state();
    // Statusleiste: offen/gekippt = Bernstein ("on"), zu = neutral.
    const cardCls = state === "open" || state === "tilted" ? ` on ${state}` : ` ${state}`;
    return `
      <style>${CONTACT_CSS}</style>
      <div class="card${cardCls}">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="cwrap">
          ${this._icon(state, this._isDoor())}
          <span class="cstate">${this.escape(this._label(state))}</span>
        </div>
      </div>`;
  }
}
