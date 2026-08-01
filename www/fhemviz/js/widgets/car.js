/*
 * FHEMVIZ - Fahrzeug-Widget (vizWidget car, v0.34.24).
 * Ladestand gross, darunter ein Akkubalken: gefuellt = aktueller Stand,
 * blass daneben = die Strecke bis zum WUNSCHLIMIT, der weisse Strich ist
 * das Limit selbst. Der Regler darunter setzt das Wunschlimit, damit der
 * Akku mindestens auf dieses Niveau geladen wird.
 *
 * Auswahl: automatisch, wenn es Readings fuer Ladestand UND Reichweite
 * gibt (z. B. MQTT2_DEVICE mit battery_level + battery_range_km),
 * erzwingen mit: attr <geraet> vizWidget car
 *
 * Readings/Befehle werden nach Namen gesucht, das Widget ist also nicht auf
 * ein Modul festgelegt:
 *   Ladestand   battery_level, soc, stateOfCharge, chargeLevel
 *   Reichweite  battery_range_km, range_km, est_battery_range_km, range
 *   Wunschlimit wish_charge_limit, chargeLimit, charge_limit_soc,
 *               set_charge_limit  (Befehl aus PossibleSets, gleiche Namen)
 *   gesendetes Limit  virtual_charge_limit  (nur Anzeige, wenn abweichend)
 *   Ladeleistung      charge_power, charger_power, charging_power
 * Spanne des Reglers aus dem setList-Widget (z. B.
 * "wish_charge_limit:slider,50,5,100"), sonst 10..100 in 5er-Schritten.
 * Empfehlung: vizSize 1x1 oder 2x1.
 */

import { FhemvizWidget } from "./base-widget.js";

const CAR_CSS = `
  .cbar {
    position: relative; height: 10px; margin: 3px 0 1px;
    border-radius: 999px; background: var(--viz-raised, #1c212a);
    overflow: hidden;
  }
  .cbar > div { position: absolute; top: 0; bottom: 0; left: 0; }
  /* Blasse Strecke bis zum Wunschlimit = was noch geladen werden soll.
   * rgba-Zeile = Rueckfall fuer WebViews ohne color-mix. */
  .cbar .gap { background: rgba(255, 176, 32, 0.25);
               background: color-mix(in srgb, var(--viz-accent, #ffb020) 25%, transparent); }
  .cbar .fill { background: var(--viz-accent, #ffb020); border-radius: 999px; }
  .card.ok .cbar .fill  { background: var(--viz-ok, #34c77b); }
  .card.bad .cbar .fill { background: var(--viz-error, #ff5d5d); }
  .cbar .mark { width: 2px; background: var(--viz-text, #e8eaed); }
  :host([data-tv]) .cbar { height: 14px; }
`;

export class FhemvizCar extends FhemvizWidget {
  /** Erstes vorhandenes Reading aus der Liste (Gross-/Kleinschreibung egal). */
  _read(names) {
    const rd = this.device.readings || {};
    const keys = Object.keys(rd);
    for (const n of names) {
      const k = keys.find((x) => x.toLowerCase() === n.toLowerCase());
      if (k !== undefined) return { name: k, value: rd[k] };
    }
    return null;
  }

  /** Zahl eines Readings ("177.64" / "3.7 kW") oder null. */
  _num(names) {
    const hit = this._read(names);
    if (!hit) return null;
    const m = this.plain(hit.value).match(/-?[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  }

  _soc() {
    return this._num(["battery_level", "soc", "stateOfCharge", "chargeLevel"]);
  }

  _range() {
    return this._num([
      "battery_range_km",
      "range_km",
      "est_battery_range_km",
      "range",
    ]);
  }

  /**
   * Wunschlimit: Befehl + Spanne. Der Befehl muss in PossibleSets stehen -
   * sonst gibt es keinen Regler (nur die Anzeige des Readings).
   */
  _limitSpec() {
    const sets = String(this.device.possibleSets || "");
    const names = [
      "wish_charge_limit",
      "chargeLimit",
      "charge_limit_soc",
      "set_charge_limit",
    ];
    for (const n of names) {
      // Wie in FHEMWEB: "<befehl>" oder "<befehl>:slider,min,step,max".
      const m = sets.match(
        new RegExp(`(?:^|\\s)${n}(?::slider,(-?[\\d.]+),([\\d.]+),(-?[\\d.]+))?(?::|\\s|$)`)
      );
      if (m) {
        return {
          cmd: n,
          min: m[1] !== undefined ? +m[1] : 10,
          step: m[2] !== undefined ? +m[2] : 5,
          max: m[3] !== undefined ? +m[3] : 100,
        };
      }
    }
    return null;
  }

  /** Aktuelles Wunschlimit (Reading), unabhaengig davon ob setzbar. */
  _limit() {
    return this._num([
      "wish_charge_limit",
      "chargeLimit",
      "charge_limit_soc",
      "set_charge_limit",
    ]);
  }

  render() {
    const soc = this._soc();
    const range = this._range();
    const limit = this._limit();
    const spec = this._limitSpec();
    // Tatsaechlich ans Fahrzeug gesendetes Limit - kann vom Wunsch abweichen,
    // wenn eine Automatik dazwischen sitzt (virtual_charge_limit).
    const sent = this._num(["virtual_charge_limit"]);
    const power = this._num(["charge_power", "charger_power", "charging_power"]);

    // Statusleiste: rot wenn fast leer, gruen wenn das Wunschlimit erreicht
    // ist, sonst bernstein (es fehlt noch etwas).
    let cls = "";
    if (soc !== null && soc <= 10) cls = " bad";
    else if (soc !== null && limit !== null) cls = soc >= limit ? " ok" : " on";
    else if (soc !== null) cls = " on";

    const pct = (v) => Math.max(0, Math.min(100, v));
    const bar =
      soc === null
        ? ""
        : `<div class="cbar">
             ${limit !== null && limit > soc ? `<div class="gap" style="width:${pct(limit)}%"></div>` : ""}
             <div class="fill" style="width:${pct(soc)}%"></div>
             ${limit !== null ? `<div class="mark" style="left:calc(${pct(limit)}% - 1px)"></div>` : ""}
           </div>`;

    // Kopfzeile rechts: Reichweite und - wenn geliefert - die Ladeleistung.
    const info = [
      range !== null ? `${this.fmtNum(range, 0)} km` : "",
      power ? `lädt ${this.fmtNum(power, 1)} kW` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    const wishRow =
      limit === null
        ? ""
        : `<div class="row">
             <span class="sub">Wunschlimit</span>
             <span class="sub" id="wv">${this.fmtNum(limit, 0)} %</span>
           </div>`;
    const slider =
      spec && !this.readonly && limit !== null
        ? `<input id="wish" type="range" step="${spec.step}"
             min="${Math.min(spec.min, limit)}" max="${spec.max}" value="${limit}"
             aria-label="Wunschlimit ${this.escape(this.displayName())}">`
        : "";
    // Nur anzeigen, wenn die Automatik gerade etwas ANDERES gesetzt hat.
    const sentRow =
      sent !== null && limit !== null && Math.round(sent) !== Math.round(limit)
        ? `<div class="row"><span class="sub">gesendet</span>
             <span class="sub">${this.fmtNum(sent, 0)} %</span></div>`
        : "";

    return `<style>${CAR_CSS}</style>
      <div class="card${cls}">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="row">
          <span class="value">${soc === null ? "–" : this.fmtNum(soc, 0)}${
            soc === null ? "" : `<span class="unit">%</span>`
          }</span>
          <span class="sub">${this.escape(info)}</span>
        </div>
        ${bar}
        ${wishRow}
        ${slider}
        ${sentRow}
        ${this._extraRows()}
      </div>`;
  }

  /**
   * vizReadings-Zeilen nur fuer Werte, die die Kachel nicht selbst zeigt -
   * sonst stehen Ladung und Reichweite doppelt da.
   */
  _extraRows() {
    const parts = this.vizReadingParts();
    if (!parts) return "";
    const builtin = new Set(
      [
        "battery_level",
        "soc",
        "stateOfCharge",
        "chargeLevel",
        "battery_range_km",
        "range_km",
        "est_battery_range_km",
        "range",
        "wish_charge_limit",
        "chargeLimit",
        "charge_limit_soc",
        "set_charge_limit",
        "virtual_charge_limit",
        "charge_power",
        "charger_power",
        "charging_power",
      ].map((n) => n.toLowerCase())
    );
    return this.readingRowsHtml(
      parts.filter((p) => !builtin.has(String(p.reading).toLowerCase()))
    );
  }

  afterRender() {
    const s = this.shadowRoot.getElementById("wish");
    if (!s) return;
    const out = this.shadowRoot.getElementById("wv");
    // Mitlaufende Anzeige - auch beim Zurueckspringen nach einem Antippen
    // (bindSlider schickt dafuer ein input-Event).
    s.addEventListener("input", () => {
      if (out) out.textContent = `${s.value} %`;
    });
    const spec = this._limitSpec();
    // Ziehen/Tastatur zaehlt, ein Antippen der Schiene nicht: ein Fehlgriff
    // wuerde sonst das Ladeziel verstellen.
    this.bindSlider(s, (v) => this.sendCommand(`${spec.cmd} ${v}`));
  }
}
