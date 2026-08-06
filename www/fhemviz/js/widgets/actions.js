/*
 * FHEMVIZ - Aktions-Widget (webCmd), v0.34.12.
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

  /** webCmdLabel (FHEM-Standard): Beschriftungen je webCmd-Eintrag (":"-getrennt). */
  _labels() {
    const wl = (this.device.attr && this.device.attr.webCmdLabel) || "";
    return String(wl).replace(/\\n/g, ":").split(":").map((s) => s.trim());
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

  /**
   * Welche Option ist gerade aktiv? Rueckgabe { value, extra }.
   *
   * 1. Exakter Treffer gewinnt (Normalfall). Der Wert kommt schon durch die
   *    eventMap (mapEvent), damit z. B. die Kanalnummer 27 als "WDR4" ankommt.
   * 2. Passt gar nichts, wird der Rohwert als zusaetzliche Option gezeigt.
   *    FHEMWEB laesst in diesem Fall die ERSTE Option stehen (fhemweb.js,
   *    FW_createSelect setzt den Wert nur bei Treffer) - die Kachel behauptete
   *    damit einen falschen Sender, obwohl ein anderer lief.
   */
  _selInfo(options, cur) {
    if (options.includes(cur)) return { value: cur };
    return { value: cur, extra: cur === "" ? "–" : cur };
  }

  /**
   * "set <dev> <cmd> <wert>" - AUSSER der webCmd-Eintrag heisst "state":
   * dann wird der Eintrag WEGGELASSEN. Dummies und readingsProxys mit
   * "setList state:Aus,Kiepenkerl,…" bzw. "setList state:slider,0,2,100"
   * erwarten den Wert direkt ("set radiosender Kiepenkerl"). FHEMWEB macht es
   * genauso - fhemweb.js, FW_replaceWidgets:
   *   params[0]=="state" ? "" : " "+params[0]
   * Mit vorangestelltem "state" schrieb 98_dummy.pm den Text
   * "state Kiepenkerl" ins state-Reading (dummy_Set: state = join(" ", @a)),
   * ein darauf horchendes notify sah den Sendernamen nie - die Auswahl blieb
   * wirkungslos.
   */
  _cmdFor(entry, value) {
    return entry === "state" ? String(value) : `${entry} ${value}`;
  }

  _controls() {
    const specs = this._setSpecs();
    const readings = this.device.readings || {};
    // Aktueller Wert wie in FHEMWEB durch die eventMap (FW_widgetFallbackFn:
    // $current = ReplaceEventMap($d, $current, 1)) - sonst sucht das
    // Auswahlfeld die Kanalnummer 27 in einer Liste aus Sendernamen.
    const wert = (n) => this.mapEvent(this.plain(readings[n]));
    return this._cmds().map((entry, idx) => {
      if (/\s/.test(entry)) return { kind: "button", entry, idx };
      const spec = specs.get(entry) || "";
      const slider = spec.match(/^slider,(-?[\d.]+),([\d.]+),(-?[\d.]+)/);
      if (slider) {
        const cur = parseFloat(wert(entry));
        return {
          kind: "slider", entry, idx,
          min: +slider[1], step: +slider[2], max: +slider[3],
          value: isNaN(cur) ? +slider[1] : cur,
        };
      }
      if (spec && !NON_SELECT.test(spec) && spec.includes(",")) {
        const options = spec.split(",");
        return {
          kind: "select", entry, idx, options,
          ...this._selInfo(options, wert(entry)),
        };
      }
      return { kind: "button", entry, idx };
    });
  }

  render() {
    const mapped = this.vizStateInfo();
    const state = this.escape(mapped ? mapped.text : this.plain(this.stateRaw()));
    const stColor = mapped && mapped.color ? `color:${mapped.color};` : "";
    // Statusleiste der Kachel folgt der vizStates-Farbe (gruen = ok-Leiste,
    // rot = Alarm, accent/orange = aktiv) - Zustand hat eine Form.
    let cardCls = "";
    if (mapped && mapped.color) {
      if (mapped.color.includes("--viz-ok")) cardCls = " ok";
      else if (mapped.color.includes("--viz-error")) cardCls = " bad";
      else cardCls = " on";
    }
    const controls = this.readonly ? [] : this._controls();
    // Steuert ein Regler/Dropdown direkt "state", zeigt es den Zustand schon
    // an - eine zusaetzliche Zeile darueber waere doppelt (und bei einem
    // Kanal-Proxy sogar nur die nackte Nummer ueber dem Sendernamen). Eine
    // vizStates-Uebersetzung bleibt stehen, die sagt mehr als der Rohwert.
    const stateImControl =
      !mapped &&
      controls.some((c) => c.entry === "state" && c.kind !== "button");
    let body = "";
    if (!this.readonly) {
      const labels = this._labels();
      // Ohne webCmdLabel dient der Befehlsname als Beschriftung - ausser bei
      // "state": "state" als Zeilentitel ist im Dashboard nur Rauschen, den
      // Gerätenamen tragt die Kachel schon oben.
      const lbl = (c) => labels[c.idx] || (c.entry === "state" ? "" : c.entry);
      const lblHtml = (c) => {
        const t = lbl(c);
        return t ? `<span class="sub">${this.escape(t)}</span>` : "";
      };
      const parts = [];
      const buttons = [];
      for (const c of controls) {
        if (c.kind === "slider") {
          parts.push(`
            <div class="ctlrow">
              ${lblHtml(c)}
              <input type="range" data-idx="${c.idx}" data-cmd="${this.escape(c.entry)}"
                min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}"
                aria-label="${this.escape(c.entry)}">
              <span class="sub" data-val="${c.idx}">${c.value}</span>
            </div>`);
        } else if (c.kind === "select") {
          // c.extra: Wert passt zu keiner Option - als eigener Eintrag zeigen,
          // damit die Kachel nicht die erste Option behauptet (siehe _selInfo).
          const opts = (c.extra ? [c.extra, ...c.options] : c.options)
            .map(
              (o) =>
                `<option value="${this.escape(o)}"${o === c.value ? " selected" : ""}>${this.escape(o)}</option>`
            )
            .join("");
          // selrow: eigene Klasse statt :has(select) - das Wandtablet laeuft
          // auf einem aelteren WebView. Damit bekommt die Auswahlzeile ein
          // anderes Spaltenmass als eine Reglerzeile (siehe base-widget).
          parts.push(`
            <div class="ctlrow selrow">
              ${lblHtml(c)}
              <select class="pill" data-cmd="${this.escape(c.entry)}">${opts}</select>
            </div>`);
        } else {
          // Transport-Befehle (play/pause/stop/prev/next) als einfarbiges
          // Inline-SVG statt Unicode-Symbol: fuer ⏸/⏹ fehlt den meisten
          // System-Schriften die einfarbige Glyphe, der Browser nimmt dann die
          // Farb-Emoji-Schrift - auf Android werden genau die beiden orange.
          // Ein Wort-Label aus webCmdLabel ("Stumm") bleibt Text, das ist
          // gewollt; ein Symbol-Label wird durch das SVG ersetzt.
          const raw = lbl(c);
          const eigenes = String(labels[c.idx] || "").trim() !== "";
          const nurSymbol = !/[\p{L}\p{N}]/u.test(raw);
          const icon = this.mediaIconHtml(c.entry);
          const inhalt = icon && (!eigenes || nurSymbol) ? icon : this.escape(raw);
          buttons.push(
            `<button class="pill" data-idx="${c.idx}" title="set ${this.escape(
              this.device.name
            )} ${this.escape(c.entry)}" aria-label="${this.escape(
              nurSymbol || !eigenes ? c.entry : raw
            )}">${inhalt}</button>`
          );
        }
      }
      if (buttons.length) parts.push(`<div class="btnrow">${buttons.join("")}</div>`);
      body = parts.join("");
    }
    return `
      <div class="card${cardCls}">
        <span class="label">${this.escape(this.displayName())}</span>
        ${
          stateImControl
            ? ""
            : `<div class="value" style="font-size:1.15rem;font-weight:450;${stColor}">${state}</div>`
        }
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
      // Nur ziehen zaehlt - ein Antippen der Schiene wuerde sonst direkt auf
      // den getippten Wert springen (siehe bindSlider). Hier sitzen auch
      // Lautstaerke-Regler (readingsProxy mit "setList state:slider,0,2,100").
      this.bindSlider(sl, (wert) =>
        this.sendCommand(this._cmdFor(sl.dataset.cmd, wert))
      );
    });
    this.shadowRoot.querySelectorAll("select[data-cmd]").forEach((se) => {
      se.addEventListener("change", () =>
        this.sendCommand(this._cmdFor(se.dataset.cmd, se.value))
      );
    });
  }
}
