/*
 * FHEMVIZ - Aktions-Widget (webCmd), v0.7.11.
 * Rendert webCmd-Eintraege passend zur PossibleSets-Beschreibung:
 *   cmd:slider,min,step,max  -> Schieberegler (z. B. desiredTemperature)
 *   cmd:wert1,wert2,...      -> Dropdown (z. B. Mode:manuel,auto,winter)
 *   sonst / "cmd arg"        -> Button ("set <dev> <eintrag>")
 * readonly (TV): nur Zustand, keine Bedienelemente.
 */

import { FhemvizWidget } from "./base-widget.js";

// Widget-Spezifikationen, die wir NICHT als Dropdown interpretieren.
const NON_SELECT = /^(noArg|textField|textField-long|colorpicker|time|slider|uzsu)/;

export class FhemvizActions extends FhemvizWidget {
  _cmds() {
    const wc = (this.device.attr && this.device.attr.webCmd) || "";
    return wc.split(":").map((s) => s.trim()).filter(Boolean);
  }

  /** PossibleSets -> Map(cmd -> spec-String hinter dem Doppelpunkt). */
  _setSpecs() {
    const map = new Map();
    for (const tok of String(this.device.possibleSets || "").split(/\s+/)) {
      if (!tok) continue;
      const i = tok.indexOf(":");
      if (i < 0) map.set(tok, "");
      else map.set(tok.slice(0, i), tok.slice(i + 1));
    }
    return map;
  }

  _controls() {
    const specs = this._setSpecs();
    const readings = this.device.readings || {};
    return this._cmds().map((entry, idx) => {
      if (/\s/.test(entry)) return { kind: "button", entry, idx };
      const spec = specs.get(entry) || "";
      const slider = spec.match(/^slider,(-?[\d.]+),([\d.]+),(-?[\d.]+)/);
      if (slider) {
        const cur = parseFloat(this.plain(readings[entry]));
        return {
          kind: "slider", entry, idx,
          min: +slider[1], step: +slider[2], max: +slider[3],
          value: isNaN(cur) ? +slider[1] : cur,
        };
      }
      if (spec && !NON_SELECT.test(spec) && spec.includes(",")) {
        return {
          kind: "select", entry, idx,
          options: spec.split(","),
          value: this.plain(readings[entry]),
        };
      }
      return { kind: "button", entry, idx };
    });
  }

  render() {
    const mapped = this.vizStateInfo();
    const state = this.escape(mapped ? mapped.text : this.plain(this.device.state));
    const stColor = mapped && mapped.color ? `color:${mapped.color};` : "";
    let body = "";
    if (!this.readonly) {
      const parts = [];
      const buttons = [];
      for (const c of this._controls()) {
        if (c.kind === "slider") {
          parts.push(`
            <div class="ctlrow">
              <span class="sub">${this.escape(c.entry)}</span>
              <input type="range" data-idx="${c.idx}" data-cmd="${this.escape(c.entry)}"
                min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}"
                aria-label="${this.escape(c.entry)}">
              <span class="sub" data-val="${c.idx}">${c.value}</span>
            </div>`);
        } else if (c.kind === "select") {
          const opts = c.options
            .map(
              (o) =>
                `<option value="${this.escape(o)}"${o === c.value ? " selected" : ""}>${this.escape(o)}</option>`
            )
            .join("");
          parts.push(`
            <div class="ctlrow">
              <span class="sub">${this.escape(c.entry)}</span>
              <select class="pill" data-cmd="${this.escape(c.entry)}">${opts}</select>
            </div>`);
        } else {
          buttons.push(
            `<button class="pill" data-idx="${c.idx}" title="set ${this.escape(
              this.device.name
            )} ${this.escape(c.entry)}">${this.escape(c.entry)}</button>`
          );
        }
      }
      if (buttons.length) parts.push(`<div class="btnrow">${buttons.join("")}</div>`);
      body = parts.join("");
    }
    return `
      <div class="card">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="value" style="font-size:1.15rem;font-weight:450;${stColor}">${state}</div>
        ${body}
        ${this.readingRowsHtml()}
      </div>`;
  }

  afterRender() {
    const cmds = this._cmds();
    this.shadowRoot.querySelectorAll("button[data-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cmd = cmds[Number(btn.dataset.idx)];
        if (cmd) this.sendCommand(cmd);
      });
    });
    this.shadowRoot.querySelectorAll("input[type=range][data-cmd]").forEach((sl) => {
      sl.addEventListener("input", () => {
        const v = this.shadowRoot.querySelector(`[data-val="${sl.dataset.idx}"]`);
        if (v) v.textContent = sl.value;
      });
      sl.addEventListener("change", () =>
        this.sendCommand(`${sl.dataset.cmd} ${sl.value}`)
      );
    });
    this.shadowRoot.querySelectorAll("select[data-cmd]").forEach((se) => {
      se.addEventListener("change", () =>
        this.sendCommand(`${se.dataset.cmd} ${se.value}`)
      );
    });
  }
}
