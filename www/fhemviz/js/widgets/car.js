/*
 * FHEMVIZ - Fahrzeug-Widget (vizWidget car, v0.34.26).
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
 *   Automatik   virtual_charge_limit - Arbeitswert einer Lade-Automatik IN
 *               FHEM (nicht das Limit im Fahrzeug), nur wenn abweichend
 *   Fahrzeug    charge_limit_soc, set_charge_limit - bis dahin laedt das
 *               Auto selbst, nur wenn abweichend
 *   Ladeleistung      charge_power, charger_power, charging_power
 * Spanne des Reglers aus dem setList-Widget (z. B.
 * "wish_charge_limit:slider,50,5,100"), sonst 10..100 in 5er-Schritten.
 *
 * attr vizCar: Feinzuordnung als "rolle=wert"-Liste (kommasepariert), Rollen
 * soc/range/limit/auto/carlimit/power (Reading-Namen) und wallbox (GERAET).
 * Mit einer Wallbox zeigt die Kachel deren Zustand und Leistung und bedient
 * sie mit: Freigabe-Schalter (Activation/on|off) und Strom-Regler (Ampere/
 * current), beides aus den PossibleSets der Wallbox. Das Wunschlimit selbst
 * laedt nicht - es ist die Schwelle, unter der geladen werden soll; die
 * Wallbox ist der Aktor. Die Wallbox muss im devspec liegen (z. B. Raum
 * FHEMVIZ->Stuff), sonst steht ein Hinweis in der Kachel.
 * Empfehlung: vizSize 1x1 oder 2x1.
 */

import { FhemvizWidget, vizStatesInfo } from "./base-widget.js";

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

  /* Wallbox-Abschnitt: eigene Zeile mit Trennlinie darueber. */
  .wb {
    margin-top: 5px; padding-top: 6px;
    border-top: 1px solid var(--viz-border, #262c35);
  }
  .wbrow { display: flex; align-items: center; gap: 10px; }
  .wbrow .sub { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wbrow .sub.grow2 { flex: 1 1 auto; }
  .amp { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
  .amp input[type=range] { margin: 0; }
  .amp .sub { flex: 0 0 auto; }
`;

export class FhemvizCar extends FhemvizWidget {
  connectedCallback() {
    super.connectedCallback();
    // Die Wallbox ist ein ANDERES Geraet - ihre Aenderungen muessen die
    // Kachel ebenfalls neu zeichnen (wie die Mitglieder einer Gruppe).
    const wb = this._wb();
    if (wb && this.store) {
      this._wbUnsub = this.store.subscribe(wb.name, () => this._paint());
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._wbUnsub) this._wbUnsub();
  }

  /** attr vizCar als {rolle: wert}. */
  _cfg() {
    const spec = (this.device.attr || {}).vizCar;
    const out = {};
    String(spec || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach((t) => {
        const m = t.match(/^([a-z]+)\s*=\s*(.+)$/i);
        if (m) out[m[1].toLowerCase()] = m[2].trim();
      });
    return out;
  }

  /** Wallbox-Geraet aus dem Store (null, wenn nicht konfiguriert). */
  _wb() {
    const name = this._cfg().wallbox;
    if (!name || !this.store) return null;
    return this.store.get(name) || null;
  }

  /** Erstes vorhandenes Reading aus der Liste (Gross-/Kleinschreibung egal). */
  _read(names, dev = this.device) {
    const rd = (dev && dev.readings) || {};
    const keys = Object.keys(rd);
    for (const n of names) {
      const k = keys.find((x) => x.toLowerCase() === n.toLowerCase());
      if (k !== undefined) return { name: k, value: rd[k] };
    }
    return null;
  }

  /** Zahl eines Readings ("177.64" / "3.7 kW") oder null. */
  _num(names, dev = this.device) {
    const hit = this._read(names, dev);
    if (!hit) return null;
    const m = this.plain(hit.value).match(/-?[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  }

  /** Rolle aus attr vizCar bevorzugen, sonst die Namensliste. */
  _role(role, names) {
    const own = this._cfg()[role];
    return this._num(own ? [own, ...names] : names);
  }

  _soc() {
    return this._role("soc", [
      "battery_level",
      "soc",
      "stateOfCharge",
      "chargeLevel",
    ]);
  }

  _range() {
    return this._role("range", [
      "battery_range_km",
      "range_km",
      "est_battery_range_km",
      "range",
    ]);
  }

  /**
   * Wunschlimit: Befehl + Spanne aus PossibleSets. Der Befehl muss dort
   * stehen - sonst gibt es keinen Regler (nur die Anzeige des Readings).
   */
  _limitSpec() {
    return this._cmdRange(
      this.device,
      ["wish_charge_limit", "chargeLimit", "charge_limit_soc", "set_charge_limit"],
      { min: 10, step: 5, max: 100 }
    );
  }

  /** Aktuelles Wunschlimit (Reading), unabhaengig davon ob setzbar. */
  _limit() {
    return this._role("limit", [
      "wish_charge_limit",
      "chargeLimit",
      "charge_limit_soc",
      "set_charge_limit",
    ]);
  }

  /**
   * Bedienspanne eines Befehls aus PossibleSets. Erst das GANZE Token holen,
   * dann die Zahlen lesen - "Ampere:selectnumbers,1,1,22,1,lin" (go-eCharger)
   * hat hinter max noch weitere Felder, an denen ein Regex mit festem Ende
   * scheitert und still auf die Defaults zurueckfaellt.
   */
  _cmdRange(dev, names, def = { min: 6, step: 1, max: 16 }) {
    const sets = String((dev && dev.possibleSets) || "");
    for (const n of names) {
      const m = sets.match(new RegExp(`(?:^|\\s)${n}(?::(\\S*))?(?=\\s|$)`, "i"));
      if (!m) continue;
      const num = String(m[1] || "").match(
        /^(?:slider|selectnumbers),(-?[\d.]+),([\d.]+),(-?[\d.]+)/i
      );
      return num
        ? { cmd: n, min: +num[1], step: +num[2], max: +num[3] }
        : { cmd: n, ...def };
    }
    return null;
  }

  /** Befehl fuer die Ladefreigabe: "Activation 0|1" oder "on|off". */
  _wbPower(wb, on) {
    const sets = String((wb && wb.possibleSets) || "");
    if (/(?:^|\s)Activation(?::|\s|$)/i.test(sets)) return `Activation ${on ? 1 : 0}`;
    if (/(?:^|\s)on(?::|\s|$)/i.test(sets)) return on ? "on" : "off";
    return null;
  }

  /** Ist die Wallbox freigegeben? (Activation 1 / state on) */
  _wbOn(wb) {
    const a = this._read(["Activation", "alw"], wb);
    if (a) return /^(1|on|true)\b/i.test(this.plain(a.value));
    return /^on\b/i.test(this.plain(wb.state));
  }

  /** Zustandstext + Leistung der Wallbox. */
  _wbInfo(wb) {
    const st = this._read(["charger_state", "chargerState", "status"], wb);
    const text = st ? this.plain(st.value) : this.plain(wb.state);
    // Leistung: fertige W-Readings bevorzugt, sonst go-e-Rohwert nrg_12 (x10).
    let w = this._num(["charge_power", "energy_all_w", "power", "nrg_12"], wb);
    const hit = this._read(["charge_power", "energy_all_w", "power", "nrg_12"], wb);
    if (w !== null && hit && /^nrg_12$/i.test(hit.name)) w *= 10;
    return { text: this.vizStatesText(text), watt: w };
  }

  /** vizStates der WALLBOX auf einen Text anwenden (Klartext/Farbe). */
  vizStatesText(text) {
    const wb = this._wb();
    const spec = wb && wb.attr && wb.attr.vizStates;
    if (!spec) return text;
    const hit = vizStatesInfo(spec, text);
    return hit ? hit.text : text;
  }

  _send(name, cmd) {
    if (!this.client || this.readonly || !cmd) return;
    this.client.command(`set ${name} ${cmd}`).catch(() => {});
  }

  /** Wallbox-Abschnitt: Zustand, Leistung, Freigabe-Schalter, Strom-Regler. */
  _wbHtml() {
    const name = this._cfg().wallbox;
    if (!name) return "";
    const wb = this._wb();
    if (!wb) {
      return `<div class="wb"><div class="wbrow"><span class="sub">Wallbox
        ${this.escape(name)} nicht in der Sicht (FHEMVIZ-Raum am Gerät prüfen)</span></div></div>`;
    }
    const info = this._wbInfo(wb);
    const on = this._wbOn(wb);
    const amp = this._cmdRange(wb, ["Ampere", "amp", "current", "maxCurrent"]);
    const ampVal = amp ? this._num([amp.cmd, "amp"], wb) : null;

    const power = this._wbPower(wb, !on);
    const toggle =
      this.readonly || !power
        ? ""
        : `<button class="toggle${on ? " on" : ""}" id="wbpower" role="switch"
             aria-checked="${on}" aria-label="Ladefreigabe Wallbox"></button>`;
    const slider =
      this.readonly || !amp || ampVal === null
        ? ""
        : `<div class="amp">
             <input id="wbamp" type="range" min="${amp.min}" max="${amp.max}"
               step="${amp.step}" value="${ampVal}" aria-label="Ladestrom Wallbox">
             <span class="sub" id="wbav">${this.fmtNum(ampVal, 0)} A</span>
           </div>`;
    return `<div class="wb">
        <div class="wbrow">
          <span class="sub grow2">${this.escape(
            this.displayNameOf(wb)
          )}: ${this.escape(info.text)}</span>
          <span class="sub">${
            info.watt === null ? "" : `${this.fmtNum(info.watt, 0)} W`
          }</span>
          ${toggle}
        </div>
        ${slider}
      </div>`;
  }

  /** Alias/Name eines fremden Geraets. */
  displayNameOf(dev) {
    return (dev.attr && dev.attr.alias) || dev.name;
  }

  render() {
    const soc = this._soc();
    const range = this._range();
    const limit = this._limit();
    const spec = this._limitSpec();
    // Arbeitswert einer Lade-Automatik in FHEM (virtual_charge_limit) - NICHT
    // das Limit im Fahrzeug: dort landet er nicht, er steuert nur die Regelung
    // (z. B. die Wallbox) und kommt vom Wunschlimit abweichend zurueck.
    const auto = this._num(["virtual_charge_limit"]);
    // Das Limit, bis zu dem das FAHRZEUG selbst laedt.
    const carLimit = this._num(["charge_limit_soc", "set_charge_limit"]);
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
    // Zusatzzeilen nur, wenn sie etwas ANDERES sagen als das Wunschlimit -
    // sonst steht dieselbe Zahl mehrfach da.
    const same = (v) =>
      v === null || limit === null || Math.round(v) === Math.round(limit);
    const extra = [
      same(auto) ? "" : ["Automatik", auto],
      same(carLimit) ? "" : ["Limit im Fahrzeug", carLimit],
    ]
      .filter(Boolean)
      .map(
        ([lbl, v]) =>
          `<div class="row"><span class="sub">${lbl}</span>
             <span class="sub">${this.fmtNum(v, 0)} %</span></div>`
      )
      .join("");

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
        ${extra}
        ${this._extraRows()}
        ${this._wbHtml()}
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
    this._bindWallbox();
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

  _bindWallbox() {
    const wb = this._wb();
    if (!wb) return;
    const btn = this.shadowRoot.getElementById("wbpower");
    if (btn) {
      btn.addEventListener("click", () =>
        this._send(wb.name, this._wbPower(wb, !this._wbOn(wb)))
      );
    }
    const amp = this.shadowRoot.getElementById("wbamp");
    if (amp) {
      const out = this.shadowRoot.getElementById("wbav");
      amp.addEventListener("input", () => {
        if (out) out.textContent = `${amp.value} A`;
      });
      const spec = this._cmdRange(wb, ["Ampere", "amp", "current", "maxCurrent"]);
      // Auch hier nur Ziehen: ein Antippen der Schiene koennte sonst den
      // Ladestrom auf den Anschlag stellen.
      this.bindSlider(amp, (v) => this._send(wb.name, `${spec.cmd} ${v}`));
    }
  }
}
