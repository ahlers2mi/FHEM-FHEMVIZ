/*
 * FHEMVIZ - Rollladen-Widget (v0.7.11).
 * Behang-Grafik (Fuellstand von oben = geschlossener Anteil; Annahme
 * FHEM-Standard: pct 100 = offen, 0 = zu) + Prozentwert + Slider.
 * Befehl/Spanne aus PossibleSets (pct bevorzugt, sonst state:slider,...).
 */

import { FhemvizWidget } from "./base-widget.js";

const SHUTTER_CSS = `
  .swrap { display: flex; align-items: center; gap: 14px; }
  .blindbox {
    width: 34px; height: 46px; flex-shrink: 0;
    border: 1.5px solid var(--viz-muted, #77808c); border-radius: 5px;
    overflow: hidden; background: transparent;
  }
  .slats {
    background: repeating-linear-gradient(180deg,
      var(--viz-muted, #77808c) 0 3px, transparent 3px 7px);
    transition: height 0.3s ease;
  }
  .card.on .blindbox { border-color: var(--viz-accent, #ffb020); }
  .card.on .slats {
    background: repeating-linear-gradient(180deg,
      var(--viz-accent, #ffb020) 0 3px, transparent 3px 7px);
  }
  :host([data-tv]) .blindbox { width: 44px; height: 60px; }
`;

export class FhemvizShutter extends FhemvizWidget {
  /** Befehl + Spanne aus PossibleSets: pct bevorzugt, sonst state-Slider. */
  _spec() {
    const sets = String(this.device.possibleSets || "");
    let m = sets.match(/(?:^|\s)pct(?::slider,(-?[\d.]+),([\d.]+),(-?[\d.]+))?/);
    if (m) return { cmd: "pct", min: +(m[1] ?? 0), step: +(m[2] ?? 1), max: +(m[3] ?? 100) };
    m = sets.match(/(?:^|\s)state:slider,(-?[\d.]+),([\d.]+),(-?[\d.]+)/);
    if (m) return { cmd: "state", min: +m[1], step: +m[2], max: +m[3] };
    return { cmd: "pct", min: 0, step: 1, max: 100 };
  }

  _pct() {
    const r = this.device.readings || {};
    const raw = r.pct ?? r.dim ?? this.plain(this.device.state);
    const n = parseInt(String(raw).replace(/[^\d-]/g, ""), 10);
    return isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
  }

  render() {
    const spec = this._spec();
    const pct = this._pct();
    const closed = 100 - pct; // pct 100 = offen
    const slider = this.readonly
      ? ""
      : `<input id="slider" type="range" min="${spec.min}" max="${spec.max}"
           step="${spec.step}" value="${pct}"
           aria-label="${this.escape(this.displayName())} Position">`;
    return `
      <style>${SHUTTER_CSS}</style>
      <div class="card${closed > 0 ? " on" : ""}">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="swrap">
          <div class="blindbox"><div class="slats" style="height:${closed}%"></div></div>
          <div>
            <div class="value" style="font-size:1.5rem;">${pct}<span class="unit">%</span></div>
            <span class="sub">${closed === 0 ? "Offen" : closed === 100 ? "Zu" : "Teils"}</span>
          </div>
        </div>
        ${slider}
        ${this.readingRowsHtml()}
      </div>`;
  }

  afterRender() {
    const s = this.shadowRoot.getElementById("slider");
    if (s) {
      const cmd = this._spec().cmd;
      s.addEventListener("change", () =>
        this.sendCommand(cmd === "state" ? String(s.value) : `${cmd} ${s.value}`)
      );
    }
  }
}
