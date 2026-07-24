/*
 * FHEMVIZ - Schalter-Gruppe (v0.28.0).
 * Fuer ein FHEM-structure-Geraet aus on/off-Schaltern/Lichtern: EINE Kachel
 * mit Master-Toggle (alle an/aus) und je Mitglied eine Zeile mit eigenem
 * Toggle. Befehle: Master -> set <structure> on|off (structure verteilt an die
 * Mitglieder), Zeile -> set <member> on|off.
 *
 * Auswahl: structure mit clientstate "switch"/"light" -> automatisch; sonst
 * per attr <structure> vizWidget switchgroup. Mitglieder muessen im devspec
 * liegen (duerfen per vizHide aus dem Raster raus). Empfehlung: vizSize 2x1/2x2.
 */

import { FhemvizWidget } from "./base-widget.js";

const SW_CSS = `
  .sgrow { display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 9px 0; border-bottom: 1px solid var(--viz-border, #262c35); }
  .sgrow:last-child { border-bottom: 0; padding-bottom: 0; }
  .sgrow.master { border-bottom: 2px solid var(--viz-border, #262c35); margin-bottom: 2px;
    padding-top: 2px; }
  .sgname { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 0.95rem; color: var(--viz-text, #e8eaed); }
  .sgrow.master .sgname { font-weight: 600; }
  .sgrow.off .sgname { color: var(--viz-muted, #77808c); }
  :host([data-tv]) .sgname { font-size: 1.2rem; }
`;

export class FhemvizSwitchGroup extends FhemvizWidget {
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

  _on(dev) {
    const st = this.plain(dev.state).toLowerCase();
    return /^(on|an|1|true|ein)\b/.test(st);
  }

  _send(name, cmd) {
    if (!this.client || this.readonly || !cmd) return;
    this.client.command(`set ${name} ${cmd}`).catch(() => {});
  }

  _rowHtml(name, on, isMaster, label) {
    const toggle = this.readonly
      ? `<span class="sub">${on ? "An" : "Aus"}</span>`
      : `<button class="toggle${on ? " on" : ""}" data-dev="${this.escape(name)}"
           role="switch" aria-checked="${on}"
           aria-label="${this.escape(label)} ein/aus"></button>`;
    return `<div class="sgrow${isMaster ? " master" : ""}${on ? " on" : " off"}">
        <span class="sgname">${this.escape(label)}</span>${toggle}
      </div>`;
  }

  render() {
    const members = this._members();
    if (!members.length) {
      return `
        <style>${SW_CSS}</style>
        <div class="card">
          <span class="label">${this.escape(this.displayName())}</span>
          <span class="sub">Mitglieder nicht in der Sicht (devspec prüfen)</span>
        </div>`;
    }
    // Master: an, sobald mindestens ein Mitglied an ist -> Klick schaltet alle aus.
    const anyOn = members.some((m) => this._on(m));
    const master = this._rowHtml(this.device.name, anyOn, true, "Alle");
    const rows = members
      .map((m) => this._rowHtml(m.name, this._on(m), false, (m.attr && m.attr.alias) || m.name))
      .join("");
    return `
      <style>${SW_CSS}</style>
      <div class="card">
        <span class="label">${this.escape(this.displayName())}</span>
        <div>${master}${rows}</div>
      </div>`;
  }

  afterRender() {
    this.shadowRoot.querySelectorAll("button[data-dev]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const on = btn.classList.contains("on");
        this._send(btn.dataset.dev, on ? "off" : "on");
      });
    });
  }
}
