/*
 * FHEMVIZ - Rollladen-Gruppe (v0.23.0).
 * Fuer ein FHEM-structure-Geraet aus Rollladen (DEF "blind HM_x HM_y ..."):
 * EINE Kachel mit einer Master-Zeile (steuert ALLE gemeinsam) und darunter
 * je Rollade eine eigene Zeile mit Position + Auf/Stop/Zu. Master-Befehle
 * gehen an das structure-Geraet (leitet an alle Mitglieder weiter), die
 * Einzelzeilen an das jeweilige Mitglied.
 *
 * Auswahl: automatisch fuer structure-Geraete mit Rollladen-Mitgliedern
 * (DEF beginnt mit "blind" bzw. genericDeviceType blind) oder erzwungen per
 * attr <structure> vizWidget shuttergroup. Empfehlung: vizSize 2x1/2x2.
 * Hinweis: die Mitglieder-Geraete muessen im devspec der Sicht liegen
 * (duerfen per vizHide aus dem Raster ausgeblendet sein).
 */

import { FhemvizWidget } from "./base-widget.js";

const GROUP_CSS = `
  .sgrows { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
  .sgrow { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .sgrow.master {
    border-bottom: 1px solid var(--viz-border, #262c35);
    padding-bottom: 8px; margin-bottom: 2px;
  }
  .sgname {
    flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; font-size: 0.95rem; color: var(--viz-text, #e8eaed);
  }
  .sgrow.master .sgname { font-weight: 700; }
  .sgpct {
    flex: 0 0 3em; text-align: right; font-variant-numeric: tabular-nums;
    color: var(--viz-muted, #77808c); font-size: 0.85rem;
  }
  .sgbtns { display: flex; gap: 4px; flex-shrink: 0; }
  button.sgb {
    font: inherit; font-size: 0.85rem; min-width: 40px; min-height: 40px;
    border-radius: 9px; border: 1px solid var(--viz-border, #262c35);
    background: var(--viz-raised, #1c212a); color: var(--viz-text, #e8eaed);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    line-height: 1;
  }
  button.sgb:focus-visible { outline: 2px solid var(--viz-action, #4c8dff); outline-offset: 1px; }
  button.sgb:active { background: var(--viz-accent, #ffb020); color: var(--viz-bg, #0a0c0f); }
  :host([data-size="2x2"]) .sgname, :host([data-tv]) .sgname { font-size: 1.2rem; }
  :host([data-tv]) button.sgb { min-width: 52px; min-height: 52px; font-size: 1rem; }
`;

export class FhemvizShutterGroup extends FhemvizWidget {
  connectedCallback() {
    super.connectedCallback();
    // Mitglieder live abonnieren, damit die Positionen einzeln nachziehen.
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

  /** Mitglieder aus der structure-DEF ("blind HM_x HM_y ...") ueber den Store. */
  _members() {
    if (!this.store) return [];
    const internals = this.device.internals || {};
    if (internals.TYPE !== "structure") return [];
    return String(internals.DEF || "")
      .split(/\s+/)
      .slice(1) // erstes Token = struct_type (z. B. "blind")
      .map((n) => n.replace(/,$/, ""))
      .map((n) => this.store.get(n))
      .filter(Boolean);
  }

  /** Aktuelle Position 0..100 (100 = offen) oder null, wenn unbekannt. */
  _pctOf(dev) {
    const r = dev.readings || {};
    for (const k of ["pct", "level", "dim", "position"]) {
      if (r[k] !== undefined && /\d/.test(String(r[k]))) {
        const n = parseInt(String(r[k]).replace(/[^\d-]/g, ""), 10);
        if (!isNaN(n)) return Math.max(0, Math.min(100, n));
      }
    }
    const st = this.plain(dev.state).toLowerCase();
    if (/^(on|auf|open|ge(ö|oe)ffnet)\b/.test(st)) return 100;
    const n = parseInt(st.replace(/[^\d-]/g, ""), 10);
    return isNaN(n) ? null : Math.max(0, Math.min(100, n));
  }

  /** Auf-/Zu-/Stop-Befehle aus PossibleSets: up/down/stop bevorzugt, sonst pct. */
  _cmds(dev) {
    const sets = String(dev.possibleSets || "");
    const has = (w) => new RegExp("(?:^|\\s)" + w + "(?:\\b|:)").test(sets);
    return {
      up: has("up") ? "up" : "pct 100",
      down: has("down") ? "down" : "pct 0",
      stop: has("stop") ? "stop" : null,
    };
  }

  _send(name, cmd) {
    if (!this.client || this.readonly || !cmd) return;
    this.client.command(`set ${name} ${cmd}`).catch(() => {});
  }

  _rowHtml(name, label, pct, cmds, master) {
    const btn = (sym, aria, cmd) =>
      cmd
        ? `<button class="sgb" data-dev="${this.escape(name)}" data-cmd="${this.escape(cmd)}"
             aria-label="${this.escape(label + " " + aria)}">${sym}</button>`
        : "";
    const pctTxt = pct == null ? "" : `${pct}%`;
    const btns = this.readonly
      ? ""
      : `<span class="sgbtns">${btn("▲", "öffnen", cmds.up)}${btn("■", "stop", cmds.stop)}${btn("▼", "schließen", cmds.down)}</span>`;
    return `
      <div class="sgrow${master ? " master" : ""}">
        <span class="sgname">${this.escape(label)}</span>
        <span class="sgpct">${pctTxt}</span>
        ${btns}
      </div>`;
  }

  render() {
    const members = this._members();
    if (!members.length) {
      return `
        <style>${GROUP_CSS}</style>
        <div class="card">
          <span class="label">${this.escape(this.displayName())}</span>
          <span class="sub">Mitglieder nicht in der Sicht (devspec prüfen)</span>
        </div>`;
    }
    const master = this.readonly
      ? ""
      : this._rowHtml(this.device.name, "Alle", null, this._cmds(this.device), true);
    const rows = members
      .map((m) =>
        this._rowHtml(
          m.name,
          (m.attr && m.attr.alias) || m.name,
          this._pctOf(m),
          this._cmds(m),
          false
        )
      )
      .join("");
    return `
      <style>${GROUP_CSS}</style>
      <div class="card">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="sgrows">${master}${rows}</div>
      </div>`;
  }

  afterRender() {
    this.shadowRoot.querySelectorAll("button.sgb").forEach((b) => {
      b.addEventListener("click", () => this._send(b.dataset.dev, b.dataset.cmd));
    });
  }
}
