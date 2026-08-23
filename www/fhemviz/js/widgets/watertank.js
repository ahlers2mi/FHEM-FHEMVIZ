/*
 * FHEMVIZ - Wasservorrat-Widget (v0.37.6).
 *
 * Zeichnet die Regenwasseranlage als lebendiges Schema: Dach und Fallrohr,
 * Regenfass mit Schwimmerhoehe, gestapelte IBC, dazwischen Pumpen- und
 * Schwerkraftweg. Fuellstaende kommen in Litern aus dem Modul
 * Gartenbewaesserung (barrelLevel_l / ibcLevel_l), nicht als Prozentbalken.
 *
 * Zwei Wasserfarben tragen Information: Regenwasser cyan, Leitungswasser
 * stumpfes Graublau. Wie viel vom Vorrat gekauft ist, sieht man damit auf
 * einen Blick - moeglich, seit das Modul mains_total_l und pumpedRain_total_l
 * getrennt zaehlt.
 *
 * Bewegung gibt es nur, wo wirklich Wasser fliesst; ohne aktiven Transport
 * sind die Rohre still. prefers-reduced-motion schaltet alles ab.
 *
 * Aktivierung:  attr <geraet> vizWidget watertank
 *               attr <geraet> vizSize 2x2
 *
 * Readings sind ueber attr vizTank (rolle=reading, kommasepariert) frei
 * zuordenbar; ohne Angabe gelten die Defaults unten. Fehlende Readings
 * werden weggelassen, nicht geraten.
 */

import { FhemvizWidget } from "./base-widget.js";

const DEFAULT_MAP = {
  state: "state",
  barrel: "barrelLevel_l",
  ibc: "ibcLevel_l",
  rainTotal: "pumpedRain_total_l",
  mainsTotal: "mains_total_l",
  harvestToday: "harvest_today_l",
  harvestYear: "harvest_year_l",
  rainAmount: "rainAmount_mm",
  raining: "raining",
  alert: "rainCollectionAlert",
  sinceFill: "rainSinceFill_mm",
  filling: "ibcFilling",
  returning: "ibcToBarrelActive",
  mains: "mainsSupply",
  fillRate: "ibcFillFlow_lpm",
  fillStarted: "ibcFillStarted",
  returnRate: "ibcToBarrelFlow_lpm",
  valve: "currentValveName",
};

export class FhemvizWatertank extends FhemvizWidget {
  _map() {
    const map = { ...DEFAULT_MAP };
    const spec = String((this.device.attr || {}).vizTank || "").trim();
    for (const tok of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
      const i = tok.indexOf("=");
      if (i <= 0) continue;
      const role = tok.slice(0, i).trim();
      const reading = tok.slice(i + 1).trim();
      if (role && reading) map[role] = reading;
    }
    return map;
  }

  _r(map, role) {
    const rd = map[role];
    if (!rd) return "";
    return this.plain((this.device.readings || {})[rd] ?? "");
  }

  _n(map, role) {
    const v = parseFloat(String(this._r(map, role)).replace(",", "."));
    return isNaN(v) ? null : v;
  }

  /**
   * Foerderrate: gelerntes Reading zuerst, dann das gleichnamige Attribut.
   * Das Modul haelt es seit v1.0.69 genauso. Ohne den Rueckfall steht die Kachel
   * still, sobald das Reading fehlt - gelernt wird nur aus vollstaendigen
   * Laeufen, und ein harter Abschuss kann es wieder kosten. Genau so war
   * ibcToBarrelFlow_lpm am 23.08.2026 verschwunden: das Rohr leuchtete, die
   * Fuellstaende bewegten sich nicht.
   */
  _rate(map, role) {
    const r = this._n(map, role);
    if (r !== null && r > 0) return r;
    const a = this._attrNum(map[role]);
    return a !== null && a > 0 ? a : null;
  }
  _attrNum(name) {
    const v = parseFloat(String((this.device.attr || {})[name] ?? "").replace(",", "."));
    return isNaN(v) ? null : v;
  }

  _isYes(v) {
    return /^(yes|ja|on|true|1)$/i.test(String(v).trim());
  }

  /** Sekunden seit einem FHEM-Zeitstempel; null, wenn unbrauchbar. */
  _since(stamp) {
    const m = String(stamp).match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)/);
    if (!m) return null;
    const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    const secs = (Date.now() - t) / 1000;
    // Ein alter Zeitstempel waere ein stehengebliebenes Reading - dann lieber
    // nicht mitrechnen, sonst wandert die Anzeige ins Nirgendwo.
    return secs >= 0 && secs < 6 * 3600 ? secs : null;
  }

  /** Zahl mit deutschem Komma, ohne ueberfluessige Nullen. */
  _fmt(n, dec = 0) {
    if (n === null || isNaN(n)) return "–";
    let out = Number(n).toFixed(dec);
    if (out.indexOf(".") >= 0) out = out.replace(/0+$/, "").replace(/\.$/, "");
    return out.replace(".", ",");
  }

  /**
   * Bedien-Buttons. Nutzt dieselbe Schreibweise wie das watering-Widget und
   * greift auf dessen Attribut zurueck, damit eine bestehende Konfiguration
   * ohne Zutun weiterlaeuft. vizTankButtons hat Vorrang; ein einzelner
   * Bindestrich schaltet die Knoepfe in DIESER Kachel ab.
   */
  _buttons() {
    const attr = this.device.attr || {};
    let spec = String(attr.vizTankButtons ?? "").trim();
    if (spec === "-" || /^(none|off|aus)$/i.test(spec)) return [];
    if (!spec) spec = String(attr.vizWateringButtons ?? "").trim();
    if (!spec) return [];
    return spec
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

  /**
   * Wasserflaeche in einem Behaelter, aufgeteilt nach Herkunft.
   * y/h beschreiben den Innenraum, frac den Fuellgrad 0..1, mainsFrac den
   * Anteil daran, der aus der Leitung stammt (wird von unten gezeichnet).
   */
  _water(id, x, y, w, h, frac, mainsFrac, rx) {
    const f = Math.max(0, Math.min(1, frac));
    if (f <= 0) return "";
    const hh = h * f;
    const top = y + h - hh;
    const mh = hh * Math.max(0, Math.min(1, mainsFrac || 0));
    const parts = [`<rect class="wt-rain" x="${x}" y="${top}" width="${w}" height="${hh - mh}"/>`];
    if (mh > 0.4) {
      parts.push(`<rect class="wt-mains" x="${x}" y="${y + h - mh}" width="${w}" height="${mh}"/>`);
    }
    return (
      `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath>` +
      `<g clip-path="url(#${id})">${parts.join("")}</g>`
    );
  }

  render() {
    const map = this._map();
    const uid = (this._uid = this._uid || "wt" + Math.random().toString(36).slice(2, 8));

    const barrelCap = this._attrNum("barrelUsableVolume");
    const barrelL = this._n(map, "barrel");
    const floatL = this._attrNum("barrelFloatLevel");
    const ibcCap = this._attrNum("ibcUsableVolume");
    const ibcL = this._n(map, "ibc");

    const filling = this._isYes(this._r(map, "filling"));
    const returning = this._isYes(this._r(map, "returning"));
    const raining = this._isYes(this._r(map, "raining"));
    const mainsOn = this._isYes(this._r(map, "mains"));
    const alert = this._isYes(this._r(map, "alert"));

    // Herkunftsanteil im IBC aus den kumulierten Summen. Ohne Zahlen bleibt
    // alles cyan - lieber keine Aussage als eine erfundene.
    const rainTot = this._n(map, "rainTotal");
    const mainsTot = this._n(map, "mainsTotal");
    let ibcMainsFrac = 0;
    if (rainTot !== null && mainsTot !== null && rainTot + mainsTot > 0) {
      ibcMainsFrac = mainsTot / (rainTot + mainsTot);
    }

    let barrelMainsFrac = 0;


    // Das Modul bucht das bewegte Volumen erst am ENDE eines Laufs. Ohne
    // Zutun stuenden beide Behaelter waehrend der Foerderung still, obwohl das
    // Rohr leuchtet - vier Minuten lang fliesst sichtbar Wasser, das nirgends
    // ankommt. Hier wird deshalb mitgerechnet, bis die echte Buchung kommt.
    // Positiv = vom Fass in den IBC.
    let moved = 0;
    if (filling) {
      const rate = this._rate(map, "fillRate");
      const secs = this._since(this._r(map, "fillStarted"));
      if (rate > 0 && secs !== null) moved = Math.min((rate * secs) / 60, barrelL ?? 0);
    } else if (returning) {
      const rate = this._rate(map, "returnRate");
      const secs = this._since((this.device.times || {})[map.returning] || "");
      if (rate > 0 && secs !== null) moved = -Math.min((rate * secs) / 60, ibcL ?? 0);
    }
    this._live = filling || returning;

    const clamp = (v, cap) =>
      v === null ? null : Math.max(0, cap ? Math.min(cap, v) : v);
    const barrelShown = clamp(barrelL === null ? null : barrelL - moved, barrelCap);
    const ibcShown = clamp(ibcL === null ? null : ibcL + moved, ibcCap);

    // Im Fass steht unterhalb der Schwimmerhoehe Leitungswasser - aber nur,
    // solange die Zufuhr offen ist. Bei zugedrehtem Hahn ist alles Regen.
    // Gerechnet wird mit barrelShown statt mit dem gebuchten Stand: waehrend
    // einer Foerderung sinkt der Pegel, das Leitungswasser unten bleibt liegen -
    // sein Anteil steigt also.
    if (mainsOn && floatL !== null && barrelShown !== null && barrelShown > 0) {
      barrelMainsFrac = Math.min(1, floatL / barrelShown);
    }

    // Der Hahn ist offen - aber sobald das Fass die Schwimmerhoehe erreicht hat,
    // macht das Schwimmerventil dicht und es fliesst nichts mehr. Das Rohr bleibt
    // sichtbar, die Zufuhr IST ja offen; es hoert nur auf zu laufen. Ohne
    // barrelFloatLevel laesst sich das nicht sagen - dann bleibt es beim Fliessen.
    const mainsFlowing =
      mainsOn &&
      !(floatL !== null && barrelShown !== null && barrelShown >= floatL - 0.5);

    const barrelFrac = barrelCap ? (barrelShown ?? 0) / barrelCap : 0;
    const ibcFrac = ibcCap ? (ibcShown ?? 0) / ibcCap : 0;

    // Ein IBC je angefangene 1000 l - bei 2000 l stehen zwei uebereinander,
    // so wie in der Anlage. vizTankBoxes ueberschreibt das.
    let boxes = this._attrNum("vizTankBoxes");
    if (!boxes) boxes = ibcCap ? Math.max(1, Math.min(3, Math.round(ibcCap / 1000))) : 1;
    boxes = Math.max(1, Math.min(3, Math.round(boxes)));

    // --- Kopfzeile -------------------------------------------------------
    let head = { t: "Bereit", c: "muted" };
    if (alert) head = { t: "Prüfen", c: "err" };
    else if (filling) {
      const rate = this._rate(map, "fillRate");
      let txt = "Fass → IBC";
      if (rate) txt += ` · ${this._fmt(rate, 1)} l/min`;
      head = { t: txt, c: "run" };
    } else if (returning) {
      const rate = this._rate(map, "returnRate");
      let txt = "IBC → Fass";
      if (rate) txt += ` · ${this._fmt(rate, 1)} l/min`;
      head = { t: txt, c: "run" };
    }
    else {
      const valve = this._r(map, "valve");
      if (valve && !/^(none|-|)$/i.test(valve.trim())) head = { t: "Gießt · " + valve, c: "run" };
      else if (raining) head = { t: "Sammelt", c: "ok" };
    }

    // --- Schema ----------------------------------------------------------
    const IBC_X = 146, IBC_W = 60, IBC_TOP = 14, IBC_BOT = 98;
    const gap = 4;
    const boxH = (IBC_BOT - IBC_TOP - gap * (boxes - 1)) / boxes;

    // Behaelter von unten nach oben fuellen: der untere laeuft zuerst voll.
    let restL = ibcCap ? ibcFrac * ibcCap : 0;
    const perBox = ibcCap ? ibcCap / boxes : 0;
    let ibcSvg = "";
    for (let i = boxes - 1; i >= 0; i--) {
      const y = IBC_TOP + i * (boxH + gap);
      const take = perBox ? Math.max(0, Math.min(perBox, restL)) : 0;
      restL -= take;
      ibcSvg +=
        `<rect class="wt-vessel" x="${IBC_X}" y="${y}" width="${IBC_W}" height="${boxH}" rx="3"/>` +
        this._water(`${uid}i${i}`, IBC_X, y, IBC_W, boxH, perBox ? take / perBox : 0, ibcMainsFrac, 3) +
        `<g class="wt-cage">` +
        `<line x1="${IBC_X}" y1="${y + boxH / 3}" x2="${IBC_X + IBC_W}" y2="${y + boxH / 3}"/>` +
        `<line x1="${IBC_X}" y1="${y + (boxH * 2) / 3}" x2="${IBC_X + IBC_W}" y2="${y + (boxH * 2) / 3}"/>` +
        `<line x1="${IBC_X + 20}" y1="${y}" x2="${IBC_X + 20}" y2="${y + boxH}"/>` +
        `<line x1="${IBC_X + 40}" y1="${y}" x2="${IBC_X + 40}" y2="${y + boxH}"/>` +
        `</g>`;
    }

    const drops = raining
      ? `<rect class="wt-drop" x="22" y="6" width="1.6" height="5" rx="0.8"/>
         <rect class="wt-drop" x="35" y="3" width="1.6" height="5" rx="0.8"/>
         <rect class="wt-drop" x="48" y="8" width="1.6" height="5" rx="0.8"/>`
      : "";

    const downpipe = alert
      ? `<path class="wt-pipe" stroke-dasharray="2 3" d="M62 30 L62 44 L74 44 L74 52"/>`
      : `<path class="wt-pipe${raining ? " live flow" : ""}" d="M62 30 L62 44 L74 44 L74 52"/>`;

    const floatLine =
      floatL !== null && barrelCap
        ? `<line class="wt-float" x1="48" y1="${98 - 46 * (floatL / barrelCap)}" x2="100" y2="${
            98 - 46 * (floatL / barrelCap)
          }"/>`
        : "";

    const mainsPipe = mainsOn
      ? `<path class="wt-pipe mains${mainsFlowing ? " flow" : " shut"}" d="M22 84 L48 84"/>` +
        `<text class="wt-t" x="22" y="79">Leitung</text>`
      : "";

    const barrelTxt =
      barrelShown === null
        ? `<text class="wt-empty" x="74" y="78" text-anchor="middle">kein Wert</text>`
        : `<text class="wt-num" x="74" y="${
            barrelFrac > 0.62 ? 49 : 98 - 46 * barrelFrac - 3
          }" text-anchor="middle">${this._fmt(barrelShown)} l</text>`;

    const ibcTxt =
      ibcShown === null
        ? `<text class="wt-empty" x="176" y="60" text-anchor="middle">kein Wert</text>`
        : `<text class="wt-num" x="176" y="${
            ibcFrac > 0.82 ? 10 : IBC_BOT - (IBC_BOT - IBC_TOP) * ibcFrac - 3
          }" text-anchor="middle">${this._fmt(ibcShown)} l</text>`;

    // Restzeit bis voll - nur waehrend einer Befuellung und nur mit gelernter Rate.
    let hint = "";
    if (filling && ibcCap && ibcShown !== null) {
      const rate = this._rate(map, "fillRate");
      if (rate && rate > 0 && ibcCap > ibcShown) {
        hint = `<text class="wt-t" x="176" y="${IBC_TOP - 5}" text-anchor="middle">voll in ${this._fmt(
          (ibcCap - ibcShown) / rate
        )} min</text>`;
      }
    }

    const schema = `
      <svg class="wt-schema" viewBox="0 0 220 108" preserveAspectRatio="xMidYMid meet"
           role="img" aria-label="${this.escape(
             `Wasservorrat: Fass ${this._fmt(barrelShown)} Liter, IBC ${this._fmt(ibcShown)} Liter`
           )}">
        <path class="wt-roof" d="M8 30 L60 12"/><path class="wt-roof" d="M8 30 L64 30"/>
        ${drops}${downpipe}
        <rect class="wt-vessel" x="48" y="52" width="52" height="46" rx="4"/>
        ${this._water(`${uid}b`, 48, 52, 52, 46, barrelFrac, barrelMainsFrac, 4)}
        ${floatLine}${mainsPipe}${barrelTxt}
        <text class="wt-t" x="74" y="107" text-anchor="middle">Fass</text>
        <path class="wt-pipe${filling ? " live flow" : ""}" d="M100 88 L124 88 L124 96 L146 96"/>
        <circle class="wt-pump${filling ? " on" : ""}" cx="112" cy="88" r="4.5"/>
        <path class="wt-pipe${returning ? " live flow" : ""}" d="M146 62 L124 62 L124 70 L100 70"/>
        ${ibcSvg}${ibcTxt}${hint}
        <text class="wt-t" x="176" y="107" text-anchor="middle">IBC</text>
      </svg>`;

    // --- Zahlenzeile -----------------------------------------------------
    const figs = [];
    const today = this._n(map, "harvestToday");
    if (today !== null) figs.push({ v: this._fmt(today, 1), u: "l", k: "heute geerntet", rain: 1 });
    const rainMm = this._n(map, "rainAmount");
    if (rainMm !== null) figs.push({ v: this._fmt(rainMm, 1), u: "mm", k: "Regen im Fenster" });
    if (ibcCap && ibcShown !== null) {
      figs.push({ v: this._fmt((ibcShown / ibcCap) * 100), u: "%", k: "IBC" });
    }
    const figHtml = figs.length
      ? `<div class="wt-figs">` +
        figs
          .map(
            (f) =>
              `<div class="wt-fig${f.rain ? " rain" : ""}"><b>${this.escape(f.v)}<span class="u">${
                f.u
              }</span></b><span>${this.escape(f.k)}</span></div>`
          )
          .join("") +
        `</div>`
      : "";

    const alertHtml = alert
      ? `<div class="wt-alarm">
           <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                stroke-width="1.6" aria-hidden="true">
             <path d="M8 2.5 L15 14 H1 Z" stroke-linejoin="round"/><path d="M8 6.5v3.2"/>
             <circle cx="8" cy="11.8" r="0.5" fill="currentColor" stroke="none"/>
           </svg>
           <span>${this.escape(this._fmt(this._n(map, "sinceFill"), 1))} mm Regen, kein Zulauf am Fass –
           Dachrinne, Fallrohr und Filter prüfen.</span>
         </div>`
      : "";

    const buttons = this.readonly ? [] : this._buttons();
    this._btnDefs = buttons;
    const btnHtml = buttons.length
      ? `<div class="wt-btns">` +
        buttons
          .map((b, i) => {
            const cls = /^stop/i.test(b.cmd) ? " stop" : /^start\b/i.test(b.cmd) ? " start" : "";
            return `<button class="wt-btn${cls}" data-i="${i}">${this.escape(b.label)}</button>`;
          })
          .join("") +
        `</div>`
      : "";

    return this._css() + `
      <div class="card ${filling || returning ? "on" : ""}">
        <div class="wt-head">
          <span class="label">${this.escape(this.displayName())}</span>
          <span class="wt-state ${head.c}">${this.escape(head.t)}</span>
        </div>
        ${schema}
        ${alertHtml}
        ${figHtml}
        ${btnHtml}
      </div>`;
  }

  _css() {
    return `
      <style>
        .card { display: flex; flex-direction: column; gap: 8px; }
        .wt-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .wt-state { font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
        .wt-state.ok { color: var(--viz-ok); }
        .wt-state.run { color: var(--viz-accent); }
        .wt-state.err { color: var(--viz-error); }
        .wt-state.muted { color: var(--viz-muted); }

        .wt-schema { width: 100%; flex: 1 1 auto; min-height: 0; display: block; }
        .wt-schema text { font-family: inherit; }
        .wt-t { font-size: 7.5px; fill: var(--viz-muted); }
        .wt-num { font-size: 8.5px; font-weight: 600; fill: var(--viz-text); }
        .wt-vessel {
          fill: color-mix(in srgb, var(--viz-muted) 16%, transparent);
          stroke: color-mix(in srgb, var(--viz-muted) 70%, transparent);
          stroke-width: 1.2;
        }
        .wt-cage { stroke: color-mix(in srgb, var(--viz-muted) 42%, transparent); stroke-width: 0.7; fill: none; }
        .wt-roof { stroke: var(--viz-muted); stroke-width: 1.6; fill: none; stroke-linecap: round; }
        .wt-pipe {
          stroke: color-mix(in srgb, var(--viz-muted) 75%, transparent);
          stroke-width: 1.9; fill: none; stroke-linecap: round;
        }
        .wt-pipe.live { stroke: var(--viz-water-rain); stroke-width: 2.2; }
        .wt-pipe.mains { stroke: var(--viz-water-mains); stroke-width: 2.2; }
        /* Zufuhr offen, Schwimmer zu: sichtbar, aber sichtbar untaetig. */
        .wt-pipe.mains.shut { opacity: 0.4; }
        .wt-pump {
          fill: color-mix(in srgb, var(--viz-muted) 28%, transparent);
          stroke: color-mix(in srgb, var(--viz-muted) 75%, transparent); stroke-width: 1.2;
        }
        .wt-pump.on { fill: var(--viz-water-rain); stroke: var(--viz-water-rain); }
        .wt-rain { fill: var(--viz-water-rain); opacity: 0.85; }
        .wt-mains { fill: var(--viz-water-mains); opacity: 0.7; }
        .wt-float { stroke: var(--viz-water-mains); stroke-width: 1.1; stroke-dasharray: 2.5 2; fill: none; }
        .wt-empty { font-size: 8px; fill: var(--viz-muted); opacity: 0.8; }
        .wt-drop { fill: var(--viz-water-rain); opacity: 0.85; animation: wtfall 1.4s linear infinite; }
        .wt-drop:nth-of-type(2) { animation-delay: 0.45s; }
        .wt-drop:nth-of-type(3) { animation-delay: 0.9s; }

        .flow { stroke-dasharray: 4 3.5; animation: wtflow 1.1s linear infinite; }
        @keyframes wtflow { to { stroke-dashoffset: -15; } }
        @keyframes wtfall {
          0% { transform: translateY(0); opacity: 0; }
          25% { opacity: 0.9; }
          100% { transform: translateY(13px); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .flow, .wt-drop { animation: none; }
          .wt-drop { opacity: 0.85; }
        }

        .wt-figs {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;
          border-top: 1px solid var(--viz-border); padding-top: 8px; margin-top: auto;
        }
        .wt-fig { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .wt-fig b {
          font-size: 0.95rem; font-weight: 600; font-variant-numeric: tabular-nums;
          letter-spacing: -0.01em; white-space: nowrap;
        }
        .wt-fig b .u { font-size: 0.62rem; font-weight: 500; color: var(--viz-muted); margin-left: 2px; }
        .wt-fig span { font-size: 0.63rem; color: var(--viz-muted); }
        .wt-fig.rain b { color: var(--viz-water-rain); }
        :host([data-size="2x2"]) .wt-fig b { font-size: 1.05rem; }

        .wt-alarm {
          display: flex; align-items: center; gap: 7px;
          font-size: 0.72rem; line-height: 1.35; color: var(--viz-error);
          background: color-mix(in srgb, var(--viz-error) 12%, transparent);
          border-radius: 8px; padding: 6px 9px;
        }
        .wt-alarm svg { flex: none; }

        .wt-btns { display: flex; flex-wrap: wrap; gap: 8px; }
        .wt-btn {
          font: inherit; font-size: 0.85rem; font-weight: 600;
          min-height: 42px; padding: 8px 14px; flex: 1 1 auto;
          border-radius: 999px; border: 1px solid var(--viz-border);
          background: transparent; color: var(--viz-text); cursor: pointer; white-space: nowrap;
        }
        .wt-btn.start { color: var(--viz-ok); border-color: color-mix(in srgb, var(--viz-ok) 55%, var(--viz-border)); }
        .wt-btn.stop { color: var(--viz-error); border-color: color-mix(in srgb, var(--viz-error) 55%, var(--viz-border)); }
        .wt-btn:focus-visible { outline: 2px solid var(--viz-action); outline-offset: 2px; }
      </style>`;
  }

  afterRender() {
    const defs = this._btnDefs || [];
    this.shadowRoot.querySelectorAll(".wt-btn").forEach((btn) => {
      const def = defs[parseInt(btn.dataset.i, 10)];
      if (def) btn.addEventListener("click", () => this.sendCommand(def.cmd));
    });

    // Waehrend eines Laufs alle 5 s neu zeichnen. Die Readings aendern sich in
    // der Zeit nicht, es gaebe also sonst keinen Anlass zum Neuzeichnen - und
    // die mitgerechneten Fuellstaende stuenden trotzdem still.
    clearInterval(this._tick);
    this._tick = this._live ? setInterval(() => this._paint(), 5000) : null;
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    this._tick = null;
    super.disconnectedCallback();
  }
}
