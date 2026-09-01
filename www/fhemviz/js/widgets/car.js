/*
 * FHEMVIZ - Fahrzeug-Widget (vizWidget car, v0.34.27).
 * Ladestand gross, darunter EIN Balken (Vorbild: die Tesla-App): gefuellt =
 * aktueller Stand, blass daneben die Strecke bis zum WUNSCHLIMIT, und der
 * Griff auf dem Balken IST das Wunschlimit - er wird direkt gezogen. Damit
 * sitzt die Bedienung dort, wo der Wert steht, statt in einer eigenen Zeile.
 * Dazu die Zeile "Wunschlimit: X % - laedt Y kW" und - wenn das Fahrzeug ein
 * Fahrtziel liefert - Ziel mit Ankunftszeit.
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
 *               FHEM (nicht das Limit im Fahrzeug)
 *   Fahrzeug    charge_limit_soc, set_charge_limit - bis dahin laedt das
 *               Auto selbst
 * Die beiden letzten Zeilen entfallen nur, wenn sie aus DEMSELBEN Reading
 * kommen wie das Wunschlimit - dann waeren sie dieselbe Angabe zweimal.
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
  /* Fahrzeugbild (attr vizCar image=<url>): oben, mittig, hoehenbegrenzt -
   * ein zu grosses Bild darf die Kachel nicht aufziehen. */
  .cimg {
    width: 100%; max-height: 164px; object-fit: contain;
    margin: 2px 0 4px; border-radius: 8px;
  }
  /* Auf dem Fernseher ist das Bild das NACHGIEBIGE Stueck der Kachel: die
   * Zahlenzeilen darunter sind der Inhalt, das Bild ist Schmuck. Deckelt die
   * Seitenhoehe die Kachel (Regel in fhemviz.css), schrumpft also das Bild,
   * statt dass die Wallbox-Zeile unter der Seitenkante verschwindet.
   * min-height: 0 ist Pflicht - ohne das verweigert Flexbox einem Bild das
   * Schrumpfen unter seine Inhaltshoehe, und die 200 px wuerden bleiben. */
  :host([data-tv]) .cimg {
    max-height: 200px;
    flex: 0 1 auto; min-height: 0;
  }

  /* Ladestand wie in der Tesla-App: EIN Balken. Die Fuellung ist der
   * Ladestand, der Griff darauf ist das Wunschlimit und wird direkt gezogen -
   * damit sitzt die Bedienung dort, wo der Wert steht, und die eigene
   * Reglerzeile darunter entfaellt.
   *
   * Aufbau: Bahn und Fuellung sind Divs, darueber liegt ein durchsichtiger
   * range-Regler, von dem nur der Griff sichtbar ist. Ein einzelnes
   * input-Element kann keine zwei Werte zeigen (Stand UND Limit), deshalb
   * diese Schichtung.
   */
  .clim { position: relative; height: 26px; margin: 4px 0 2px; }
  .clim .bahn, .clim .fill, .clim .rest {
    position: absolute; top: 8px; height: 10px; border-radius: 999px;
  }
  .clim .bahn { left: 0; right: 0; background: var(--viz-raised, #1c212a); }
  .clim .fill { left: 0; background: var(--viz-accent, #ffb020); }
  .card.ok  .clim .fill { background: var(--viz-ok, #34c77b); }
  .card.bad .clim .fill { background: var(--viz-error, #ff5d5d); }
  /* Blasse Strecke zwischen Stand und Limit: was noch geladen werden soll. */
  .clim .rest { background: rgba(255, 176, 32, 0.22);
                background: color-mix(in srgb, var(--viz-accent, #ffb020) 22%, transparent); }
  .clim input[type=range] {
    position: absolute; inset: 0; width: 100%; height: 100%; margin: 0;
    -webkit-appearance: none; appearance: none;
    background: transparent; accent-color: auto;
  }
  .clim input[type=range]::-webkit-slider-runnable-track { background: transparent; height: 26px; }
  .clim input[type=range]::-moz-range-track { background: transparent; height: 26px; }
  .clim input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 20px; height: 20px; margin-top: 3px;
    border-radius: 50%; background: var(--viz-text, #e8eaed);
    border: 2px solid var(--viz-surface, #151920); cursor: pointer;
  }
  .clim input[type=range]::-moz-range-thumb {
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--viz-text, #e8eaed);
    border: 2px solid var(--viz-surface, #151920); cursor: pointer;
  }
  .clim input[type=range]:focus-visible { outline: 2px solid var(--viz-action); outline-offset: 2px; }
  /* Ohne Bedienung (TV/readonly) bleibt eine Marke statt des Griffs. */
  .clim .marke { position: absolute; top: 5px; width: 2px; height: 16px;
                 background: var(--viz-text, #e8eaed); }

  /* Navigationszeile: etwas Luft nach oben, Fahrt nach Hause in Akzentfarbe.
   * Ein langer Zielname darf die Zeile nicht sprengen. */
  .crow { margin-top: 4px; gap: 10px; }
  .crow .sub { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Die Ankunftszeit darf NICHT gekuerzt werden - sie ist die Aussage der
   * Zeile. Gekuerzt wird der Zielname, der kann lang sein. */
  .crow .sub + .sub { flex: 0 0 auto; }
  .crow .sub.heim { color: var(--viz-accent, #ffb020); font-weight: 600; }

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

  /**
   * Wert MIT dem Reading-Namen, aus dem er kommt. Der Name entscheidet, ob
   * eine Zusatzzeile ueberhaupt etwas Neues sagt (siehe render): Vergleichen
   * ueber die ZAHL war falsch - stehen Wunschlimit und Automatikwert gerade
   * auf demselben Prozentwert, verschwand die Zeile "Automatik" komplett.
   */
  _hit(names, dev = this.device) {
    const hit = this._read(names, dev);
    if (!hit) return null;
    const m = this.plain(hit.value).match(/-?[\d.]+/);
    return { name: hit.name, num: m ? parseFloat(m[0]) : null };
  }

  /** Rolle aus attr vizCar bevorzugen, sonst die Namensliste. */
  _roleHit(role, names) {
    const own = this._cfg()[role];
    return this._hit(own ? [own, ...names] : names);
  }

  /** Rolle als Zahl. */
  _role(role, names) {
    const h = this._roleHit(role, names);
    return h ? h.num : null;
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

  /**
   * Ladezustand fuer das gezeichnete Fahrzeug: "laedt", "steckt" oder "frei".
   *
   * Es gibt kein einzelnes Reading dafuer, also aus mehreren zusammengesetzt -
   * und in dieser Reihenfolge, weil Leistung die einzige Angabe ist, die
   * beweist, dass wirklich geladen wird:
   *   1. Leistung am Fahrzeug oder an der Wallbox  -> laedt
   *   2. Zustandstext der Wallbox                  -> laedt/steckt/frei
   *      (go-e: "waiting for car" = nichts dran, "Ready"/"Charging finished"
   *      = Auto haengt dran, laedt aber nicht)
   *   3. offene Ladeklappe am Fahrzeug             -> steckt
   * Wer ein besseres Reading hat, setzt es per "plug=<reading>" in vizCar:
   * ein wahrer Wert dort bedeutet "angesteckt".
   */
  _ladeZustand() {
    const kw = this._role("power", ["charge_power", "charger_power", "charging_power"]);
    if (kw !== null && kw > 0.05) return "laedt";

    const wb = this._wb();
    if (wb) {
      const w = this._wbInfo(wb).watt;
      if (w !== null && w > 50) return "laedt";
      const st = this.plain(this._wbInfo(wb).text || "");
      if (/charg(ing|e)\b(?!.*finish)/i.test(st) || /l[äa]dt/i.test(st)) return "laedt";
      if (/(wait|kein auto|no car)/i.test(st)) return "frei";
      if (/(ready|finish|fertig|bereit|connect|verbunden)/i.test(st)) return "steckt";
    }

    const eigen = this._cfg().plug ? this._read([this._cfg().plug]) : null;
    const klappe = eigen || this._read(["charge_port_door_open"]);
    if (klappe && /^(true|1|open|yes|on|offen)$/i.test(this.plain(klappe.value))) return "steckt";
    return "frei";
  }

  /**
   * Bildadresse aus attr vizCar. Zwei Schreibweisen:
   *   image=<url>
   *       ein Bild, immer dasselbe.
   *   image=laedt:<url>|steckt:<url>|frei:<url>
   *       je Ladezustand ein eigenes Bild. Fehlt einer der drei, wird der
   *       erste angegebene genommen - so reicht auch ein Paar aus zwei.
   * Zustaende: laedt = es laeuft Leistung, steckt = Kabel dran ohne Leistung,
   * frei = nichts angesteckt (siehe _ladeZustand).
   */
  _bildUrl() {
    const spec = String(this._cfg().image || "").trim();
    if (!spec) return "";
    if (!spec.includes("|") && !/^(laedt|steckt|frei)\s*:/i.test(spec)) return spec;
    const map = {};
    const reihe = [];
    for (const teil of spec.split("|")) {
      const m = teil.trim().match(/^(laedt|steckt|frei)\s*:\s*(.+)$/i);
      if (!m) continue;
      map[m[1].toLowerCase()] = m[2].trim();
      reihe.push(m[2].trim());
    }
    return map[this._ladeZustand()] || reihe[0] || "";
  }

  /** Alias/Name eines fremden Geraets. */
  displayNameOf(dev) {
    return (dev.attr && dev.attr.alias) || dev.name;
  }

  /**
   * Laufende Navigation: Ziel und Restzeit (Tesla/ioBroker liefert
   * active_route_destination + active_route_minutes_to_arrival).
   *
   * ENTSCHEIDEND ist die FRISCHE. Die Route-Readings bleiben nach der Fahrt
   * stehen - im Bestand lag "7 Minuten bis Moubis Dülmen" zwei Tage lang im
   * Gerät. Eine Ankunftszeit daraus zu rechnen waere frei erfunden. Darum:
   * nur zeigen, wenn der Zeitstempel der Restzeit jung ist (Default 15 min,
   * per "routeAge=<minuten>" in vizCar aenderbar, 0 = Pruefung aus).
   *
   * Ist ein Zuhause-Name gesetzt ("home=<text>" in vizCar) und das Ziel
   * enthaelt ihn, heisst die Zeile "Zuhause" statt des Ortsnamens. Mehrere
   * Schreibweisen mit "|" trennen: "home=Im Nott|Zuhause|Home".
   */
  _route() {
    const zielHit = this._read(
      [this._cfg().dest, "active_route_destination", "destination_name"].filter(Boolean)
    );
    const minHit = this._read(
      [this._cfg().eta, "active_route_minutes_to_arrival", "minutes_to_arrival"].filter(Boolean)
    );
    if (!minHit) return null;
    const min = parseFloat(this.plain(minHit.value).replace(",", "."));
    if (isNaN(min) || min < 0) return null;

    const maxAlter = this._cfg().routeage === undefined ? 15 : parseInt(this._cfg().routeage, 10);
    if (maxAlter > 0) {
      const t = ((this.device || {}).times || {})[minHit.name];
      if (!t) return null; // ohne Zeitstempel lieber nichts behaupten
      // FHEM-Format "2026-08-19 15:16:40" - fuer Date() mit T verbinden,
      // sonst legen manche Engines es als UTC aus.
      const alterMin = (Date.now() - new Date(String(t).replace(" ", "T")).getTime()) / 60000;
      if (!(alterMin >= 0) || alterMin > maxAlter) return null;
    }

    // Ohne Ziel keine Zeile. Beim Fahrtende raeumt der Adapter das Ziel weg -
    // dann ist die Fahrt vorbei, und "unterwegs" zu raten waere geraten.
    const ziel = zielHit ? this.plain(zielHit.value).trim() : "";
    if (!ziel) return null;
    // "home=" darf MEHRERE Schreibweisen mit "|" trennen. Das Auto meldet je
    // nach Eingabe die Adresse ("Im Nott 35, 48301 Nottuln"), einen
    // POI-Namen ("Moubis Duelmen") oder den Namen eines gespeicherten Ortes
    // ("Zuhause") - eine einzelne Zeichenkette trifft nicht alle Faelle.
    const heim = String(this._cfg().home || "")
      .split("|")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const zl = ziel.toLowerCase();
    const nachHause = heim.some((h) => zl.includes(h));

    const an = new Date(Date.now() + min * 60000);
    const p = (n) => String(n).padStart(2, "0");
    return {
      label: nachHause ? "🏠 Zuhause" : `→ ${ziel}`,
      wert: `${p(an.getHours())}:${p(an.getMinutes())} · ${Math.round(min)} Min`,
      nachHause,
    };
  }

  render() {
    const soc = this._soc();
    const range = this._range();
    const limitHit = this._roleHit("limit", [
      "wish_charge_limit",
      "chargeLimit",
      "charge_limit_soc",
      "set_charge_limit",
    ]);
    const limit = limitHit ? limitHit.num : null;
    const spec = this._limitSpec();
    // Arbeitswert einer Lade-Automatik in FHEM (virtual_charge_limit) - NICHT
    // das Limit im Fahrzeug: dort landet er nicht, er steuert nur die Regelung
    // (z. B. die Wallbox).
    const autoHit = this._roleHit("auto", ["virtual_charge_limit"]);
    // Das Limit, bis zu dem das FAHRZEUG selbst laedt.
    const carHit = this._roleHit("carlimit", [
      "charge_limit_soc",
      "set_charge_limit",
    ]);
    const power = this._role("power", [
      "charge_power",
      "charger_power",
      "charging_power",
    ]);

    // Statusleiste: rot wenn fast leer, gruen wenn das Wunschlimit erreicht
    // ist, sonst bernstein (es fehlt noch etwas).
    let cls = "";
    if (soc !== null && soc <= 10) cls = " bad";
    else if (soc !== null && limit !== null) cls = soc >= limit ? " ok" : " on";
    else if (soc !== null) cls = " on";

    const pct = (v) => Math.max(0, Math.min(100, v));
    const laedt = !!power && power > 0.05;

    // Rechts neben dem Ladestand: Reichweite (die Ladeleistung steht in der
    // Zeile darunter, sonst stuende sie zweimal im Bild).
    const info = range !== null ? `${this.fmtNum(range, 0)} km` : "";

    // Kopfzeile wie in der Tesla-App: Limit vorn, dahinter der Zustand.
    // ABER als "Wunschlimit" benannt: Tesla meint mit "Ladelimit" das Limit
    // IM FAHRZEUG, und das steht hier als eigene Zeile mit einem anderen Wert
    // darunter. "Ladelimit: 25 %" ueber "Limit im Fahrzeug: 60 %" waere ein
    // Widerspruch im Bild.
    // "Laden gestoppt" wird nicht erfunden - steht kein Zustand im Gerät und
    // laeuft nichts, bleibt der Platz leer.
    const zustandTxt = laedt
      ? `lädt ${this.fmtNum(power, 1)} kW`
      : this.plain(this._read(["charging_state", "charge_state", "charger_state"])?.value || "");
    const kopf = [
      limit !== null ? `Wunschlimit: ${this.fmtNum(limit, 0)} %` : "",
      zustandTxt,
    ]
      .filter(Boolean)
      .join(" · ");

    // Der Balken: Fuellung = Ladestand, Griff = Wunschlimit (ziehbar).
    // Ohne Bedienung bleibt eine Marke an der Limit-Position.
    const climb =
      soc === null && limit === null
        ? ""
        : `<div class="clim">
             <div class="bahn"></div>
             ${
               limit !== null && soc !== null && limit > soc
                 ? `<div class="rest" style="left:${pct(soc)}%;right:${100 - pct(limit)}%"></div>`
                 : ""
             }
             ${soc !== null ? `<div class="fill" style="width:${pct(soc)}%"></div>` : ""}
             ${
               spec && !this.readonly && limit !== null
                 ? `<input id="wish" type="range" step="1"
                      min="0" max="100" value="${limit}"
                      aria-label="Wunschlimit ${this.escape(this.displayName())}">`
                 : limit !== null
                   ? `<div class="marke" style="left:calc(${pct(limit)}% - 1px)"></div>`
                   : ""
             }
           </div>`;

    // Fahrzeugbild aus attr vizCar image=... - eine Adresse fuer immer, oder
    // je Ladezustand eine eigene (siehe _bildUrl).
    const bildUrl = this._bildUrl();
    const bild = bildUrl
      ? `<img class="cimg" src="${this.escape(bildUrl)}" alt="">`
      : "";

    // Fahrt nach Hause faellt ins Auge (Akzentfarbe), ein fremdes Ziel nicht.
    const route = this._route();
    const routeRow = !route
      ? ""
      : `<div class="row crow">
           <span class="sub${route.nachHause ? " heim" : ""}">${this.escape(route.label)}</span>
           <span class="sub${route.nachHause ? " heim" : ""}">${this.escape(route.wert)}</span>
         </div>`;

    // Zusatzzeilen zeigen, solange sie aus einem ANDEREN Reading kommen als
    // das Wunschlimit. Nur wenn es dasselbe Reading ist (etwa weil ohne
    // wish_charge_limit auf charge_limit_soc zurueckgefallen wurde), waere es
    // dieselbe Angabe zweimal.
    const eigen = (h) =>
      h &&
      h.num !== null &&
      (!limitHit || h.name.toLowerCase() !== limitHit.name.toLowerCase());
    const extra = [
      eigen(autoHit) ? ["Automatik", autoHit.num] : "",
      eigen(carHit) ? ["Limit im Fahrzeug", carHit.num] : "",
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
        ${bild}
        <div class="row">
          <span class="value">${soc === null ? "–" : this.fmtNum(soc, 0)}${
            soc === null ? "" : `<span class="unit">%</span>`
          }</span>
          <span class="sub">${this.escape(info)}</span>
        </div>
        ${kopf ? `<div class="row"><span class="sub">${this.escape(kopf)}</span></div>` : ""}
        ${climb}
        ${routeRow}
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
    const spec = this._limitSpec();
    /* Der Balken zeichnet Ladestand UND Limit auf 0..100 - der Griff MUSS auf
     * derselben Skala sitzen. Vorher uebernahm der Regler die Spanne aus dem
     * setList, und bei "wish_charge_limit:slider,20,5,100" sass der Griff um
     * die Anfangsgrenze nach links versetzt: 25 % landete bei
     * (25-20)/(100-20) = 6 % der Schiene, waehrend die Farbflaeche daneben
     * bei 25 % endete. Zwei Skalen in einem Balken - genau der Fehler, den
     * der Balken sichtbar machen sollte.
     * Der Regler laeuft deshalb ueber 0..100, und was das GERAET annimmt
     * (Anfang und Schrittweite aus dem setList) begrenzt diese Funktion. */
    const klemmen = (v) => {
      const stufe = Math.max(1, Number(spec.step) || 1);
      const min = Number(spec.min);
      const max = Number(spec.max);
      const g = Math.min(max, Math.max(min, Number(v)));
      return Math.min(max, min + Math.round((g - min) / stufe) * stufe);
    };
    // Mitlaufende Anzeige - auch beim Zurueckspringen nach einem Antippen
    // (bindSlider schickt dafuer ein input-Event). Der Griff wird dabei in den
    // erlaubten Bereich gezogen, laesst sich also gar nicht darunter schieben.
    s.addEventListener("input", () => {
      const v = klemmen(s.value);
      if (String(v) !== s.value) s.value = String(v);
      if (out) out.textContent = `${v} %`;
    });
    // Ziehen/Tastatur zaehlt, ein Antippen der Schiene nicht: ein Fehlgriff
    // wuerde sonst das Ladeziel verstellen.
    this.bindSlider(s, (v) => this.sendCommand(`${spec.cmd} ${klemmen(v)}`));
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
