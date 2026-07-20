/*
 * FHEMVIZ - Dimmer-/Pegel-Widget (v0.7.11).
 * Prozent-/Pegelwert gross, Slider darunter. Befehl + Spanne aus
 * PossibleSets: pct bevorzugt, sonst state:slider,min,step,max
 * (readingsProxy-Pegel wie Lautstaerken senden dann "set <dev> <wert>").
 */

import { FhemvizWidget } from "./base-widget.js";

export class FhemvizDimmer extends FhemvizWidget {
  _spec() {
    const sets = String(this.device.possibleSets || "");
    let m = sets.match(/(?:^|\s)pct(?::slider,(-?[\d.]+),([\d.]+),(-?[\d.]+))?/);
    if (m) return { cmd: "pct", min: +(m[1] ?? 0), step: +(m[2] ?? 1), max: +(m[3] ?? 100) };
    m = sets.match(/(?:^|\s)state:slider,(-?[\d.]+),([\d.]+),(-?[\d.]+)/);
    if (m) return { cmd: "state", min: +m[1], step: +m[2], max: +m[3] };
    return { cmd: "pct", min: 0, step: 1, max: 100 };
  }

  _val(spec) {
    const r = this.device.readings || {};
    const raw = r.pct ?? r.dim ?? this.plain(this.device.state);
    const n = parseFloat(String(raw).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? spec.min : Math.max(spec.min, Math.min(spec.max, n));
  }

  render() {
    const spec = this._spec();
    const val = this._val(spec);
    const unit = spec.cmd === "pct" ? "%" : "";
    const slider = this.readonly
      ? ""
      : `<input id="slider" type="range" min="${spec.min}" max="${spec.max}"
           step="${spec.step}" value="${val}"
           aria-label="${this.escape(this.displayName())}">`;
    return `
      <div class="card${val > spec.min ? " on" : ""}">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="value">${val}${unit ? `<span class="unit">${unit}</span>` : ""}</div>
        <div class="grow"></div>
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
