/*
 * FHEMVIZ - Bewaesserungs-Widget (v0.17.0).
 * Zeigt eine Gartenbewaesserung kompakt: Status (laeuft/bereit) + aktives
 * Ventil gross, Regenfass-Fuellstand als Balken, Bodenfeuchte (schwellwert-
 * gefaerbt), Restzeit, Zyklus und ein Regen-Hinweis.
 *
 * Readings sind ueber das Attribut vizWatering (rolle=reading, komma-
 * separiert) zuordenbar; ohne Angabe gelten die Defaults unten (passend
 * zum Modul Gartenbewaesserung). Nicht vorhandene Readings werden einfach
 * weggelassen. Aktivierung:  attr <geraet> vizWidget watering
 */

import { FhemvizWidget } from "./base-widget.js";

const DEFAULT_MAP = {
  status: "state",
  valve: "currentValveName",
  barrel: "barrelLevel",
  soil: "soilMoisture",
  remaining: "remainingTime",
  rain: "raining",
  progress: "cycleProgress",
};

export class FhemvizWatering extends FhemvizWidget {
  _map() {
    const map = { ...DEFAULT_MAP };
    const spec = String((this.device.attr || {}).vizWatering || "").trim();
    for (const tok of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
      const i = tok.indexOf("=");
      if (i <= 0) continue;
      const role = tok.slice(0, i).trim();
      const reading = tok.slice(i + 1).trim();
      if (role && reading) map[role] = reading;
    }
    return map;
  }

  /** Rohwert einer Rolle (leer, wenn Reading fehlt). */
  _r(map, role) {
    const rd = map[role];
    if (!rd) return "";
    return this.plain((this.device.readings || {})[rd] ?? "");
  }

  _isYes(v) {
    return /^(yes|ja|on|true|1|regen)/i.test(String(v).trim());
  }
  _isNone(v) {
    return !v || /^(none|off|-|0|idle|kein|keine)$/i.test(String(v).trim());
  }

  /** Kachel-Balken (Skala 0-100) in gegebener Farbe. */
  _bar(pct, color) {
    const w = Math.max(0, Math.min(100, pct));
    const bg = color ? `background:${color};` : "";
    return `<div class="vbar"><div style="width:${w}%;${bg}"></div></div>`;
  }

  /**
   * Bedien-Buttons aus vizWateringButtons: "Label=befehl|Label=befehl|..."
   * (| trennt Buttons, erstes = trennt Label vom set-Befehl; der Befehl darf
   * Leerzeichen enthalten, z. B. "startCircuit 8"). Default Start/Stop.
   */
  _buttons() {
    const spec = String((this.device.attr || {}).vizWateringButtons || "").trim();
    const src = spec || "Start=start|Stop=stop";
    return src
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((tok) => {
        const i = tok.indexOf("=");
        if (i <= 0) return null;
        return { label: tok.slice(0, i).trim(), cmd: tok.slice(i + 1).trim() };
      })
      .filter((b) => b && b.cmd);
  }

  _row(label, value, color) {
    return (
      `<div class="row"><span class="sub">${this.escape(label)}</span>` +
      `<span class="sub" style="color:${color || "var(--viz-text)"};">` +
      `${this.escape(value)}</span></div>`
    );
  }

  render() {
    const map = this._map();
    const num = (v) => {
      const n = parseFloat(String(v).replace(",", "."));
      return isNaN(n) ? null : n;
    };

    const status = this._r(map, "status");
    const valve = this._r(map, "valve");

    // Status-Werte des Moduls (state) uebersetzen: Text, Farbe, ob Ventil-
    // name angehaengt wird und ob die Kachel als "aktiv" gilt (gruener Rand).
    const CV = {
      ok: "var(--viz-ok)", warn: "var(--viz-warn)", accent: "var(--viz-accent)",
      muted: "var(--viz-muted)", error: "var(--viz-error)",
    };
    const STATES = {
      idle: { t: "Bereit", c: "muted" },
      watering: { t: "Läuft", c: "ok", valve: true, active: true },
      "circuit mode": { t: "Läuft", c: "ok", valve: true, active: true },
      paused: { t: "Pause", c: "warn", active: true },
      "ibc to barrel": { t: "Fass füllen", c: "accent", active: true },
      stopped: { t: "Gestoppt", c: "error" },
    };
    const key = String(status).trim().toLowerCase();
    const info = STATES[key] || { t: status || "–", c: "muted" };
    const active = !!info.active;
    let mainText = info.t;
    if (info.valve && valve && !this._isNone(valve)) mainText += ` · ${valve}`;
    const mainColor = CV[info.c] || "var(--viz-muted)";

    // Regenfass-Fuellstand als Balken (Farbe nach Fuellstand).
    const barrel = num(this._r(map, "barrel"));
    let barrelHtml = "";
    if (barrel !== null) {
      const col =
        barrel <= 20 ? "var(--viz-error)" : barrel <= 40 ? "var(--viz-warn)" : "var(--viz-ok)";
      barrelHtml =
        `<div class="row"><span class="sub">Regenfass</span>` +
        `<span class="sub" style="color:${col};">${this._fmt(barrel)} %</span></div>` +
        this._bar(barrel, col);
    }

    // weitere Zeilen
    const rows = [];
    const soil = num(this._r(map, "soil"));
    if (soil !== null) {
      const col =
        soil <= 20 ? "var(--viz-error)" : soil <= 45 ? "var(--viz-warn)" : "var(--viz-ok)";
      rows.push(this._row("Bodenfeuchte", this._fmt(soil) + " %", col));
    }
    const remaining = this._r(map, "remaining");
    if (remaining && !this._isNone(remaining)) {
      rows.push(this._row("Restzeit", remaining, active ? "var(--viz-ok)" : ""));
    }
    const progress = this._r(map, "progress");
    if (progress && !this._isNone(progress)) {
      rows.push(this._row("Zyklus", progress));
    }
    const rain = this._r(map, "rain");
    if (this._isYes(rain)) {
      rows.push(this._row("Regen", "erkannt", "var(--viz-action)"));
    }

    // Bedien-Buttons (nur im bedienbaren Modus, nicht TV/readonly).
    const buttons = this.readonly ? [] : this._buttons();
    const btnHtml = buttons.length
      ? `<div class="wbtns">` +
        buttons
          .map((b, i) => {
            const cls =
              /^stop/i.test(b.cmd) ? " stop" : /^start\b/i.test(b.cmd) ? " start" : "";
            return `<button class="wbtn${cls}" data-i="${i}">${this.escape(b.label)}</button>`;
          })
          .join("") +
        `</div>`
      : "";
    this._btnDefs = buttons;

    const btnCss = `
      <style>
        .wbtns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .wbtn {
          font: inherit; font-size: 0.85rem; font-weight: 600;
          min-height: 42px; padding: 8px 14px; flex: 1 1 auto;
          border-radius: 999px; border: 1px solid var(--viz-border);
          background: transparent; color: var(--viz-text); cursor: pointer;
          white-space: nowrap;
        }
        .wbtn.start { color: var(--viz-ok); border-color: color-mix(in srgb, var(--viz-ok) 55%, var(--viz-border)); }
        .wbtn.stop { color: var(--viz-error); border-color: color-mix(in srgb, var(--viz-error) 55%, var(--viz-border)); }
        .wbtn:focus-visible { outline: 2px solid var(--viz-action); outline-offset: 2px; }
        :host([data-size="2x2"]) .wbtn { font-size: 1rem; min-height: 48px; }
      </style>`;

    const sizeCls = mainText.length > 18 ? " sm" : mainText.length > 9 ? " md" : "";
    return btnCss + `
      <div class="card ${active ? "on" : ""}">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="value${sizeCls}" style="color:${mainColor};">${this.escape(mainText)}</div>
        ${barrelHtml}
        ${rows.length ? `<div class="grow"></div>${rows.join("")}` : ""}
        ${btnHtml}
      </div>`;
  }

  afterRender() {
    const defs = this._btnDefs || [];
    this.shadowRoot.querySelectorAll(".wbtn").forEach((btn) => {
      const def = defs[parseInt(btn.dataset.i, 10)];
      if (def) btn.addEventListener("click", () => this.sendCommand(def.cmd));
    });
  }

  _fmt(n) {
    let out = n.toFixed(1);
    if (out.indexOf(".") >= 0) out = out.replace(/0+$/, "").replace(/\.$/, "");
    return out;
  }
}
