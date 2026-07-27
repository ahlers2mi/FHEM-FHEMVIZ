/*
 * FHEMVIZ - Energiefluss-Widget (v0.33.0). Die Koenigsdisziplin.
 * Haus im Zentrum, PV links, Netz rechts - verbunden durch Laufpunkt-Ketten.
 * Richtung folgt dem Vorzeichen, bei ~0 stehen die Punkte grau still.
 * Darunter die BATTERIE als grosses Symbol mit Fuellstand, Leistung und
 * Warnzeichen - der Ladestand ist die Zahl, auf die es im Inselbetrieb
 * ankommt, also ist er auch das groesste Element.
 *
 * Aktivierung: attr <geraet> vizWidget flow  (+ vizSize 2x2 empfohlen)
 *
 * Readings-Zuordnung (attr vizFlow). Jeder Eintrag ist entweder ein Reading
 * DIESES Geraets oder - mit Doppelpunkt - eines fremden Geraets:
 *   pv, haus, netz, batterie  Leistungen in W
 *   soc                       Ladestand in %
 *   volt                      Batteriespannung (optional)
 *   reserve                   Geraet/Reading, dessen "on" den Sicherheits-
 *                             bestand meldet (Batterie wird nicht leer
 *                             gefahren - Autarkie-Reserve)
 *   reserveSoc                Grenze der Reserve in % (Zahl ODER Reading).
 *                             Gilt NUR bei eingeschaltetem "reserve" - ist
 *                             der Sicherheitsbestand aus, wird bis 0 %
 *                             gefahren und es erscheint keine Marke.
 *   full                      Geraet/Reading, dessen "on" meldet: Anlage am
 *                             Anschlag, Strom kann nicht eingespeist werden
 *                             -> Verbrauchen! (Schildkroete)
 *   status                    Reading einer Datenquelle; "offline" o. ae.
 *                             wird als Warnung gezeigt, damit ein
 *                             eingefrorener Ladestand nicht still falsch ist
 * Vorzeichen: netz > 0 = Bezug (orange), < 0 = Einspeisung (gruen);
 *   batterie > 0 = laden, < 0 = entladen.
 *
 * Beispiel (Victron SmartShunt als Ladestand-Quelle):
 *   attr d_Wechselrichter_all vizFlow pv=pv_leistung,haus=out_leistung,
 *     netz=netzleistung_all,
 *     batterie=rem_MQTT2_SMART_SHUNT1:data_battery_power_shunt_state,
 *     soc=rem_MQTT2_SMART_SHUNT1:data_state_of_charge_shunt_state,
 *     volt=rem_MQTT2_SMART_SHUNT1:data_battery_voltage_shunt_state,
 *     status=rem_MQTT2_SMART_SHUNT1:status,
 *     reserve=d_batterie_save,reserveSoc=25,full=d_www_wechselrichter_100
 */

import { FhemvizWidget } from "./base-widget.js";

const FLOW_CSS = `
  /* Die Kachel ist Groessen-Container: die Ziffern richten sich nach der
   * TATSAECHLICHEN Kachelbreite, nicht nur nach vizSize. */
  .card { container-type: inline-size; }
  .fgrid { display: flex; flex-direction: column; align-items: stretch;
           gap: 8px; flex: 1; justify-content: center; }
  .frow { display: flex; align-items: center; gap: 6px; width: 100%;
          justify-content: center; min-width: 0; }
  .fnode { text-align: center; min-width: 0; }
  .fnode .fv { font-size: 1.7rem; font-weight: 250; font-variant-numeric: tabular-nums;
               line-height: 1.05; white-space: nowrap; }
  .fnode .fl { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.12em;
               text-transform: uppercase; color: var(--viz-muted, #77808c); }
  .fcenter {
    border: 1px solid var(--viz-border, #262c35); border-radius: 12px;
    background: var(--viz-raised, #1c212a); padding: 8px 16px;
  }
  .fcenter .fv { font-size: 2.1rem; }
  :host([data-size="2x1"]) .fnode .fv, :host([data-size="1x2"]) .fnode .fv { font-size: 2rem; }
  :host([data-size="2x1"]) .fcenter .fv, :host([data-size="1x2"]) .fcenter .fv { font-size: 2.6rem; }
  :host([data-size="2x2"]) .fnode .fv { font-size: 2.3rem; }
  :host([data-size="2x2"]) .fcenter .fv { font-size: 3rem; }
  :host([data-size="2x2"]) .fnode .fl { font-size: 0.7rem; }

  /* Laufpunkt-Kette */
  .chain { display: flex; gap: 7px; align-items: center; flex-shrink: 1; min-width: 0; }
  .chain.v { flex-direction: column; }
  .dot {
    width: 8px; height: 8px; border-radius: 35%;
    background: var(--colour, var(--viz-ok, #34c77b));
    box-shadow: 0 0 6px var(--colour, var(--viz-ok, #34c77b)),
                0 0 12px var(--colour, var(--viz-ok, #34c77b));
    transform: scale(0.15);
    animation: animateDot 2s linear infinite;
    animation-delay: calc(0.14s * var(--i));
  }
  .chain.idle .dot {
    --colour: var(--viz-border, #262c35);
    animation: none; transform: scale(0.35); box-shadow: none;
  }
  @keyframes animateDot {
    0% { transform: scale(0.15); }
    10% { transform: scale(1); }
    50%, 100% { transform: scale(0.15); }
  }

  /* ---------------------------- Batterie-Block ----------------------------
   * Die Batterie ist im Inselbetrieb die wichtigste Zahl - also ist sie das
   * groesste Element: breites Symbol, Fuellstand als getoente Flaeche mit
   * heller Vorderkante (Pegel bleibt erkennbar), Werte LIEGEN DARIN und
   * stehen dadurch immer auf dunklem Grund - also immer lesbar. */
  .fbat { min-width: 0; }
  /* Verbindung Haus -> Batterie: senkrecht, damit die Richtung "hinein/heraus"
   * ablesbar bleibt. Kompakt, damit sie den Ladestand nicht verdraengt. */
  .fchainrow { display: flex; justify-content: center; }
  .fchainrow .chain.v { gap: 5px; }
  .bwrap {
    position: relative;
    height: 78px;
    margin: 2px 13px 0 0;
    border: 3px solid var(--viz-border, #262c35);
    border-radius: 13px;
    min-width: 0;
  }
  /* Pol-Kappe rechts - macht die Form auf den ersten Blick zur Batterie. */
  .bwrap::after {
    content: "";
    position: absolute; top: 50%;
    /* left:100% ist die rechte Kante der Padding-Box; + Rahmenbreite, damit
     * die Kappe direkt an der sichtbaren Kante ansetzt statt zu schweben. */
    left: 100%; margin-left: 3px;
    width: 9px; height: 30px;
    transform: translateY(-50%);
    background: var(--viz-border, #262c35);
    border-radius: 0 4px 4px 0;
  }
  .bclip { position: absolute; inset: 0; border-radius: 10px; overflow: hidden; }
  .bfill { height: 100%; border-right: 3px solid var(--bcol, var(--viz-accent)); }
  /* Grenze des Sicherheitsbestands: was links davon liegt, wird nicht
   * angetastet - so ist sichtbar, wieviel ueberhaupt nutzbar ist. */
  .bmark {
    position: absolute; top: 0; bottom: 0; width: 0;
    border-left: 3px dashed var(--viz-action, #4c8dff);
  }
  .binner {
    position: absolute; inset: 0;
    display: flex; align-items: center; gap: 12px;
    padding: 0 14px; min-width: 0;
  }
  .bsoc {
    font-size: 3rem; font-weight: 250; line-height: 1;
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .bsoc .u { font-size: 0.38em; color: var(--viz-muted, #77808c); margin-left: 2px; }
  .bmeta {
    margin-left: auto; min-width: 0;
    display: flex; flex-direction: column; align-items: flex-end;
  }
  .bpow {
    font-size: 1.15rem; font-weight: 500; line-height: 1.15;
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .bsub {
    font-size: 0.66rem; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--viz-muted, #77808c); white-space: nowrap;
  }
  :host([data-size="2x2"]) .bwrap { height: 92px; }
  :host([data-size="2x2"]) .bsoc { font-size: 3.6rem; }

  /* Hinweis-Plaketten: Reserve, Anlage am Anschlag, Datenquelle offline */
  .fbadges { display: flex; flex-wrap: wrap; gap: 6px; }
  .fbadge {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 0.72rem; font-weight: 700; letter-spacing: 0.02em;
    padding: 4px 9px; border-radius: 999px;
    border: 1px solid var(--viz-border, #262c35);
    color: var(--viz-muted, #77808c);
  }
  .fbadge .ic { font-size: 1.05em; line-height: 1; }
  .fbadge.res { border-color: var(--viz-action, #4c8dff); color: var(--viz-action, #4c8dff); }
  .fbadge.stale { border-color: var(--viz-warn, #ffab40); color: var(--viz-warn, #ffab40); }
  /* Verbrauchen! - das ist eine Aufforderung, keine Nebeninfo. */
  .fbadge.full {
    background: var(--viz-error, #ff5d5d); border-color: transparent;
    color: #12161c; font-size: 0.8rem; padding: 5px 11px;
    animation: fullPulse 1.6s ease-in-out infinite;
  }
  .fbadge.full .ic { font-size: 1.3em; }
  @keyframes fullPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.62; }
  }
  :host([data-size="2x2"]) .fbadge { font-size: 0.8rem; }
  :host([data-size="2x2"]) .fbadge.full { font-size: 0.92rem; }
  :host([data-tv]) .fbadge { font-size: 0.9rem; }
  :host([data-tv]) .fbadge.full { font-size: 1.05rem; }

  /* TV-Modus: nochmals groesser */
  :host([data-tv]) .fnode .fv { font-size: 2.2rem; }
  :host([data-tv]) .fcenter .fv { font-size: 2.8rem; }
  :host([data-tv]) .fnode .fl { font-size: 0.74rem; }
  :host([data-tv][data-size="2x1"]) .fnode .fv, :host([data-tv][data-size="1x2"]) .fnode .fv { font-size: 2.7rem; }
  :host([data-tv][data-size="2x1"]) .fcenter .fv, :host([data-tv][data-size="1x2"]) .fcenter .fv { font-size: 3.4rem; }
  :host([data-tv][data-size="2x2"]) .fnode .fv { font-size: 3.2rem; }
  :host([data-tv][data-size="2x2"]) .fcenter .fv { font-size: 4.2rem; }
  :host([data-tv][data-size="2x2"]) .fnode .fl { font-size: 0.9rem; }
  :host([data-tv]) .bwrap { height: 96px; }
  :host([data-tv]) .bsoc { font-size: 3.8rem; }
  :host([data-tv][data-size="2x2"]) .bwrap { height: 124px; }
  :host([data-tv][data-size="2x2"]) .bsoc { font-size: 5rem; }
  :host([data-tv][data-size="2x2"]) .bpow { font-size: 1.7rem; }
  :host([data-tv][data-size="2x2"]) .bsub { font-size: 0.9rem; }
  :host([data-tv]) .dot { width: 11px; height: 11px; }
  :host([data-tv][data-size="2x2"]) .dot { width: 13px; height: 13px; }

  @media (prefers-reduced-motion: reduce) {
    .dot { animation: none; transform: scale(0.6); }
    .fbadge.full { animation: none; }
  }

  /* Schmale Kachel (Handy): kompakt halten, damit PV/Haus/Netz + Ketten
   * NICHT ueber den Rand laufen - der Ladestand bleibt trotzdem gross. */
  @container (max-width: 460px) {
    .fnode .fv { font-size: 1.3rem !important; }
    .fcenter .fv { font-size: 1.6rem !important; }
    .fnode .fl { font-size: 0.55rem !important; }
    .frow { gap: 3px; }
    .chain { gap: 4px; }
    .dot { width: 6px !important; height: 6px !important; }
    .fcenter { padding: 6px 10px; }
    .bsoc { font-size: 2.3rem !important; }
    .bwrap { height: 62px !important; }
    .bpow { font-size: 0.95rem; }
    .binner { padding: 0 10px; gap: 8px; }
    .fbadge { font-size: 0.66rem !important; padding: 3px 7px; }
  }
`;

const DEFAULT_MAP =
  "pv=pv_leistung,haus=out_leistung,netz=netzleistung_all,batterie=batterie_leistung,soc=soc";

export class FhemvizFlow extends FhemvizWidget {
  connectedCallback() {
    super.connectedCallback();
    // Fremde Geraete (vizFlow "key=geraet:reading") live mitverfolgen -
    // sonst haengt z. B. der Ladestand des Shunts auf dem Startwert.
    if (this.store) {
      const own = this.device.name;
      const foreign = [...new Set(
        Object.values(this._map())
          .map((spec) => {
            const i = String(spec).indexOf(":");
            return i > 0 ? String(spec).slice(0, i) : null;
          })
          .filter((n) => n && n !== own)
      )];
      this._flowUnsubs = foreign.map((n) => this.store.subscribe(n, () => this._paint()));
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    (this._flowUnsubs || []).forEach((u) => u());
  }

  _map() {
    const spec = (this.device.attr && this.device.attr.vizFlow) || DEFAULT_MAP;
    const map = {};
    for (const t of String(spec).split(",")) {
      const [k, v] = t.split("=").map((x) => (x || "").trim());
      if (k && v) map[k] = v;
    }
    return map;
  }

  /** "reading" (dieses Geraet) oder "geraet:reading" -> Rohwert. */
  _raw(key) {
    const spec = this._map()[key];
    if (!spec) return undefined;
    const i = String(spec).indexOf(":");
    if (i > 0) {
      const devName = spec.slice(0, i);
      const reading = spec.slice(i + 1);
      const dev = this.store && this.store.get(devName);
      if (!dev) return undefined;
      return reading === "state" ? dev.state : (dev.readings || {})[reading];
    }
    return (this.device.readings || {})[spec];
  }

  /**
   * Zahl aus einem vizFlow-Eintrag; fehlt er, kommt der Ersatzwert.
   * Ein reiner Zahlenwert im Attribut ist erlaubt (z. B. reserveSoc=30) -
   * dann ist er der Wert und wird nicht als Reading-Name gesucht.
   */
  _num(key, fallback = 0) {
    const spec = this._map()[key];
    if (spec !== undefined && /^-?\d+([.,]\d+)?$/.test(String(spec).trim())) {
      return parseFloat(String(spec).trim().replace(",", "."));
    }
    const v = this._raw(key);
    if (v === undefined) return fallback;
    const n = parseFloat(String(this.plain(v)).replace(",", "."));
    return isNaN(n) ? fallback : n;
  }

  /**
   * Merker-Geraet: "on" (bzw. 1/true/an) = aktiv. Ohne Reading wird der
   * state genommen - so genuegt "reserve=d_batterie_save".
   */
  _flag(key) {
    const spec = this._map()[key];
    if (!spec) return false;
    let v;
    if (String(spec).indexOf(":") > 0) {
      v = this._raw(key);
    } else {
      // Kein Doppelpunkt: erst als Geraetename versuchen (state), sonst als
      // Reading dieses Geraets.
      const dev = this.store && this.store.get(spec);
      v = dev ? dev.state : (this.device.readings || {})[spec];
    }
    return /^(on|an|1|true|ja|aktiv)\b/i.test(this.plain(v));
  }

  /** Datenquelle stumm gefallen? ("offline", "disconnected", "error", ...) */
  _stale() {
    if (!this._map().status) return false;
    const v = this.plain(this._raw("status"));
    if (!v) return false;
    return /^(offline|disconnected|error|unavailable|dead|absent)\b/i.test(v);
  }

  /** Ladestand -> Farbe. Im Inselbetrieb ist wenig Rest wirklich kritisch. */
  _socColor(soc) {
    if (soc <= 20) return "var(--viz-error)";
    if (soc <= 40) return "var(--viz-warn)";
    if (soc >= 80) return "var(--viz-ok)";
    return "var(--viz-accent)";
  }

  _fmt(n, digits = 0) {
    return n === null || n === undefined || isNaN(n)
      ? "–"
      : n.toLocaleString("de-DE", { maximumFractionDigits: digits });
  }

  /** Laufpunkt-Kette: dir "fwd" = in Leserichtung, "rev" = rueckwaerts. */
  _chain(vertical, value, dir, color) {
    const active = Math.abs(value) > 5;
    const n = 6;
    const dots = Array.from({ length: n }, (_, i) => {
      const idx = dir === "rev" ? n - 1 - i : i;
      return `<span class="dot" style="--i:${idx};${color ? `--colour:${color};` : ""}"></span>`;
    }).join("");
    return `<div class="chain${vertical ? " v" : ""}${active ? "" : " idle"}">${dots}</div>`;
  }

  _node(label, value, unit, color) {
    return `<div class="fnode">
      <div class="fv"${color ? ` style="color:${color};"` : ""}>${this.escape(
        this._fmt(value)
      )}<span class="unit">${unit}</span></div>
      <span class="fl">${this.escape(label)}</span>
    </div>`;
  }

  /**
   * Batterie: breites Symbol mit Pol-Kappe, Fuellstand als getoente Flaeche
   * mit heller Vorderkante. Die Werte liegen DARIN - sie stehen dadurch
   * immer auf dunklem Grund und bleiben lesbar, egal wie voll sie ist.
   */
  _batteryHtml(soc, color, reserveSoc, batt, battColor, battWord, volt) {
    const clamped = Math.max(0, Math.min(100, isNaN(soc) ? 0 : soc));
    const res =
      reserveSoc === null || isNaN(reserveSoc)
        ? null
        : Math.max(0, Math.min(100, reserveSoc));
    return `
      <div class="fbat">
        <div class="bwrap" style="--bcol:${color}" role="img"
          aria-label="Ladestand ${this.escape(this._fmt(soc))} Prozent">
          <div class="bclip">
            <div class="bfill" style="width:${clamped}%;
              background:color-mix(in srgb, ${color} 26%, transparent)"></div>
            ${res !== null ? `<div class="bmark" style="left:${res}%"></div>` : ""}
          </div>
          <div class="binner">
            <span class="bsoc" style="color:${color}">${this.escape(
              this._fmt(soc)
            )}<span class="u">%</span></span>
            <span class="bmeta">
              <span class="bpow" style="color:${battColor}">${this.escape(
                this._fmt(batt)
              )} W</span>
              <span class="bsub">${battWord}${
                isNaN(volt) ? "" : ` · ${this.escape(this._fmt(volt, 1))} V`
              }</span>
            </span>
          </div>
        </div>
      </div>`;
  }

  render() {
    const m = this._map();
    const pv = this._num("pv");
    const haus = this._num("haus");
    const netz = this._num("netz");
    const batt = this._num("batterie");
    const soc = m.soc ? this._num("soc", NaN) : NaN;
    const volt = m.volt ? this._num("volt", NaN) : NaN;
    const reserveOn = this._flag("reserve");
    const fullOn = this._flag("full");
    const stale = this._stale();
    const reserveSoc = m.reserveSoc ? this._num("reserveSoc", NaN) : NaN;
    // Die Reserve gilt nur, wenn der Sicherheitsbestand EINGESCHALTET ist -
    // sonst wird die Batterie bis 0 % gefahren und eine Marke waere gelogen.
    const effReserve = reserveOn && !isNaN(reserveSoc) ? reserveSoc : null;

    const ok = "var(--viz-ok)";
    const warn = "var(--viz-warn)";
    const accent = "var(--viz-accent)";

    const netzColor = netz > 5 ? warn : ok;
    const battColor = batt < -5 ? accent : ok;
    const socColor = isNaN(soc) ? "var(--viz-muted)" : this._socColor(soc);

    // Batterie-Zustand in Worten - eine Zahl allein sagt nicht, wohin es geht.
    const battWord =
      batt > 5 ? "lädt" : batt < -5 ? "entlädt" : "ruht";

    const badges = [];
    if (fullOn) {
      badges.push(
        `<span class="fbadge full"><span class="ic">🐢</span>Strom verbrauchen</span>`
      );
    }
    if (reserveOn) {
      badges.push(
        `<span class="fbadge res"><span class="ic">🛡</span>Reserve${
          isNaN(reserveSoc) ? "" : ` ab ${this._fmt(reserveSoc)} %`
        }</span>`
      );
    }
    if (stale) {
      badges.push(
        `<span class="fbadge stale"><span class="ic">⚠</span>Ladestand veraltet</span>`
      );
    }

    // Kette Haus <-> Batterie: die Richtung (laden/entladen) bleibt sichtbar.
    const battChain = `<div class="fchainrow">${this._chain(
      true, batt, batt < 0 ? "rev" : "fwd", battColor
    )}</div>`;
    const batteryBlock = m.soc
      ? battChain +
        this._batteryHtml(soc, socColor, effReserve, batt, battColor, battWord, volt)
      : `${this._chain(true, batt, batt < 0 ? "rev" : "fwd", battColor)}
         ${this._node("Batterie", batt, " W", battColor)}`;

    return `
      <style>${FLOW_CSS}</style>
      <div class="card">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="fgrid">
          <div class="frow">
            ${this._node("Photovoltaik", pv, " W", accent)}
            ${this._chain(false, pv, "fwd", ok)}
            <div class="fcenter fnode">
              <div class="fv">${this.escape(this._fmt(haus))}<span class="unit">W</span></div>
              <span class="fl">Haus</span>
            </div>
            ${this._chain(false, netz, netz > 5 ? "rev" : "fwd", netzColor)}
            ${this._node("Netz", netz, " W", netz > 5 ? warn : ok)}
          </div>
          ${batteryBlock}
          ${badges.length ? `<div class="fbadges">${badges.join("")}</div>` : ""}
        </div>
        ${this.readingRowsHtml()}
      </div>`;
  }
}
