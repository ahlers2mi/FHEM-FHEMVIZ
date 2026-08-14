/*
 * FHEMVIZ - Rollladen-Widget (v0.7.12).
 * Behang-Grafik (Fuellstand von oben = geschlossener Anteil; Annahme
 * FHEM-Standard: pct 100 = offen, 0 = zu) + Prozentwert + Slider + die
 * Knopfreihe Auf/Stop/Zu (Stop nur, wenn das Geraet ihn kennt).
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
  button.blindbtn { background: none; border: 0; padding: 0; cursor: pointer; }
  button.blindbtn:focus-visible { outline: 2px solid var(--viz-action, #4c8dff); outline-offset: 2px; border-radius: 6px; }
  :host([data-tv]) .blindbox { width: 44px; height: 60px; }
  .shbtns { display: flex; gap: 6px; margin-top: 8px; }
  button.shb {
    font: inherit; font-size: 0.85rem; flex: 1; min-height: 40px;
    border-radius: 9px; border: 1px solid var(--viz-border, #262c35);
    background: var(--viz-raised, #1c212a); color: var(--viz-text, #e8eaed);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    line-height: 1;
  }
  button.shb:focus-visible { outline: 2px solid var(--viz-action, #4c8dff); outline-offset: 1px; }
  button.shb:active { background: var(--viz-accent, #ffb020); color: var(--viz-bg, #0a0c0f); }
  :host([data-tv]) button.shb { min-height: 52px; font-size: 1rem; }
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

  /**
   * Befehle fuer die Knopfreihe - dieselbe Rangfolge wie in der
   * shuttergroup: pct mit den Endlagen aus dem Slider, dann open/close
   * (ROLLO: "closed"), und up/down nur als Rueckfall. Grund: bei CUL_HM
   * sind up/down RELATIV (ein Schritt, Standard 10 %), ein Klick auf "Zu"
   * wuerde die Rollade damit nur 10 % weiterfahren statt ganz zu.
   */
  _cmds() {
    const sets = String(this.device.possibleSets || "");
    const has = (w) => new RegExp("(?:^|\\s)" + w + "(?:\\b|:)").test(sets);
    const ersterTreffer = (...w) => w.find((x) => has(x));
    const m = sets.match(/(?:^|\s)pct(?::slider,(-?[\d.]+),([\d.]+),(-?[\d.]+))?/);
    const auf = m
      ? `pct ${m[3] ?? 100}`
      : ersterTreffer("open", "opened", "up") || "pct 100";
    const zu = m
      ? `pct ${m[1] ?? 0}`
      : ersterTreffer("close", "closed", "down") || "pct 0";
    return { up: auf, down: zu, stop: has("stop") ? "stop" : null };
  }

  _pct() {
    const r = this.device.readings || {};
    // Zuerst ein numerisches Positions-Reading (HomeMatic: pct ODER level).
    for (const k of ["pct", "level", "dim", "position"]) {
      if (r[k] !== undefined && /\d/.test(String(r[k]))) {
        const n = parseInt(String(r[k]).replace(/[^\d-]/g, ""), 10);
        if (!isNaN(n)) return Math.max(0, Math.min(100, n));
      }
    }
    // Kein Zahlenwert: state auswerten. "on/auf/open" = offen (100),
    // sonst die Zahl aus dem state (z. B. "80 %"), Rest zu (0).
    const st = this.plain(this.device.state).toLowerCase();
    if (/^(on|auf|open|ge(ö|oe)ffnet)\b/.test(st)) return 100;
    const n = parseInt(st.replace(/[^\d-]/g, ""), 10);
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
    const cmds = this._cmds();
    const knopf = (sym, aria, cmd) =>
      cmd
        ? `<button class="shb" data-cmd="${this.escape(cmd)}"
             aria-label="${this.escape(this.displayName() + " " + aria)}">${sym}</button>`
        : "";
    const knoepfe = this.readonly
      ? ""
      : `<div class="shbtns">${knopf("▲", "öffnen", cmds.up)}${knopf(
          "■",
          "stop",
          cmds.stop
        )}${knopf("▼", "schließen", cmds.down)}</div>`;
    return `
      <style>${SHUTTER_CSS}</style>
      <div class="card${closed > 0 ? " on" : ""}">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="swrap">
          ${this.readonly
            ? `<div class="blindbox"><div class="slats" style="height:${closed}%"></div></div>`
            : `<button id="blindbtn" class="blindbtn"
                 title="Tippen: ganz ${pct < 50 ? "auf" : "zu"}"
                 aria-label="${this.escape(this.displayName())} ganz ${pct < 50 ? "öffnen" : "schließen"}">
                 <div class="blindbox"><div class="slats" style="height:${closed}%"></div></div>
               </button>`}
          <div>
            <div class="value" style="font-size:1.5rem;">${pct}<span class="unit">%</span></div>
            <span class="sub">${closed === 0 ? "Offen" : closed === 100 ? "Zu" : "Teils"}</span>
          </div>
        </div>
        ${slider}
        ${knoepfe}
        ${this.readingRowsHtml()}
      </div>`;
  }

  afterRender() {
    // Tipp auf den Behang: unter 50 % -> ganz auf, sonst ganz zu.
    const btn = this.shadowRoot.getElementById("blindbtn");
    if (btn) {
      btn.addEventListener("click", () => {
        const spec = this._spec();
        const target = this._pct() < 50 ? spec.max : spec.min;
        this.sendCommand(spec.cmd === "state" ? String(target) : `${spec.cmd} ${target}`);
      });
    }
    this.shadowRoot.querySelectorAll("button.shb").forEach((b) => {
      b.addEventListener("click", () => this.sendCommand(b.dataset.cmd));
    });
    const s = this.shadowRoot.getElementById("slider");
    if (s) {
      const cmd = this._spec().cmd;
      // Nur ZIEHEN zaehlt: ein Antippen der Schiene wuerde sonst sofort auf den
      // getippten Wert springen - am rechten Ende also auf 100 % bzw. volle
      // Lautstaerke, obwohl man die Kachel nur beruehrt hat (siehe bindSlider).
      this.bindSlider(s, (wert) =>
        this.sendCommand(cmd === "state" ? String(wert) : `${cmd} ${wert}`)
      );
    }
  }
}
