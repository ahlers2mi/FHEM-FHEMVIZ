/*
 * FHEMVIZ - Media-Gruppe (v0.34.7).
 * Fuer ein FHEM-structure-Geraet aus AV-Receivern/Zonen (z. B. DENON_AVR /
 * DENON_AVR_ZONE): EINE Kachel, je Geraet eine Zeile mit Power-Toggle,
 * Lautstaerke-Regler und Mute. Befehle gehen an das jeweilige Mitglied.
 *
 * Auswahl: structure mit clientstate "media"/"audio"/"multimedia" ->
 * automatisch; sonst per attr <structure> vizWidget mediagroup. Mitglieder
 * muessen im devspec liegen (duerfen per vizHide aus dem Raster raus).
 * Empfehlung: vizSize 2x1/2x2.
 *
 * Readings/Sets (DENON_AVR & _ZONE): power (on/off), volume (0..98) +
 * "volume <n>", mute (on/off) + "mute toggle". Slider-Bereich wird aus
 * PossibleSets gelesen (volume:slider,min,step,max).
 *
 * Hauptzone eines DENON_AVR: Zustand steht in zoneMain (power ist an, sobald
 * IRGENDEINE Zone laeuft), und geschaltet wird mit "zoneMain on|off" - ein
 * blankes "off" wuerde den ganzen Receiver samt Zone 2/3 abschalten.
 *
 * HEOS-Player (z. B. DoRemoteDevice-Proxy eines HEOSPlayer): kein on/off ->
 * Power-Toggle entfaellt, dafuer Transport (play/pause/stop/prev/next) und
 * Mute per mute on/off (kein toggle). Beides wird aus PossibleSets erkannt.
 *
 * HEOS-Speaker ohne on/off, aber mit mute (laesst sich nicht ausschalten):
 * der obere Toggle steuert dann Mute (on = hoerbar, off = stumm), der
 * separate Mute-Button in der Lautstaerke-Zeile entfaellt.
 */

import { FhemvizWidget } from "./base-widget.js";

const MEDIA_CSS = `
  .mgdev { padding: 8px 0; border-bottom: 1px solid var(--viz-border, #262c35); }
  .mgdev:last-child { border-bottom: 0; padding-bottom: 0; }
  .mgtop { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .mgname {
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 0.95rem; color: var(--viz-text, #e8eaed);
  }
  .mgctl { display: flex; align-items: center; gap: 10px; margin-top: 7px; }
  .mgctl input[type=range] { flex: 1; min-width: 0; }
  .mgvol { flex: 0 0 2.2em; text-align: right; font-variant-numeric: tabular-nums;
    color: var(--viz-muted, #77808c); font-size: 0.85rem; }
  .mgdev.off .mgctl { opacity: 0.4; }
  button.mgmute {
    min-width: 44px; min-height: 38px; font-size: 1rem; padding: 0 10px;
    border-radius: 10px; border: 1px solid var(--viz-border, #262c35);
    background: var(--viz-raised, #1c212a); color: var(--viz-text, #e8eaed); cursor: pointer;
  }
  button.mgmute.on { background: var(--viz-accent, #ffb020); color: var(--viz-bg, #0a0c0f); border-color: transparent; }
  button.mgmute:focus-visible { outline: 2px solid var(--viz-action, #4c8dff); outline-offset: 1px; }
  :host([data-tv]) .mgname { font-size: 1.2rem; }
  :host([data-tv]) button.mgmute { min-height: 46px; }
`;

export class FhemvizMediaGroup extends FhemvizWidget {
  connectedCallback() {
    super.connectedCallback();
    if (this.store) {
      this._memberUnsubs = this._members().map((m) =>
        this.store.subscribe(m.name, () => this._paint())
      );
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    (this._memberUnsubs || []).forEach((u) => u());
  }

  _members() {
    if (!this.store) return [];
    const internals = this.device.internals || {};
    if (internals.TYPE !== "structure") return [];
    return String(internals.DEF || "")
      .split(/\s+/)
      .slice(1)
      .map((n) => n.replace(/,$/, ""))
      .map((n) => this.store.get(n))
      .filter(Boolean);
  }

  _on(dev) {
    const r = dev.readings || {};
    // DENON_AVR-Main: "power" ist die GERAETE-Power (an, sobald irgendeine
    // Zone laeuft) - die eigentliche Hauptzone steckt in "zoneMain". Darum
    // zoneMain bevorzugen; Zonen (DENON_AVR_ZONE) haben kein zoneMain und
    // fallen korrekt auf power zurueck.
    const raw =
      r.zoneMain !== undefined
        ? r.zoneMain
        : r.power !== undefined
          ? r.power
          : dev.state;
    return /^(on|an|1|true)\b/.test(this.plain(raw).toLowerCase());
  }

  _muted(dev) {
    return /^(on|1|true)\b/i.test(this.plain((dev.readings || {}).mute));
  }

  /** Hat das Geraet echte Ein/Aus-Steuerung (Denon-Zonen)? HEOS-Player nicht. */
  _hasPower(dev) {
    return this._has(dev, "on") && this._has(dev, "off");
  }

  /** Passender Mute-Befehl: "mute toggle" wenn unterstuetzt (Denon), sonst
   *  explizit mute on/off je nach aktuellem Zustand (HEOS: mute:on,off). */
  _muteCmd(name) {
    const d = this.store && this.store.get(name);
    const sets = d ? String(d.possibleSets || "") : "";
    if (/(?:^|\s)mute:[^\s]*\btoggle\b/.test(sets)) return "mute toggle";
    if (/(?:^|\s)mute(?=\s|$)/.test(sets)) return "mute toggle";
    return d && this._muted(d) ? "mute off" : "mute on";
  }

  /**
   * Power-Befehl fuer eine Zeile. Bei einem DENON_AVR-Hauptgeraet schaltet
   * "off" das GANZE Geraet ab (alle Zonen mit) - die Hauptzone hat ihren
   * eigenen Befehl "zoneMain on|off". Wir zeigen den Zustand ohnehin aus dem
   * Reading zoneMain an (siehe _on), also muss auch dorthin geschrieben
   * werden, sonst reisst ein Klick auf die Hauptzone Zone 2/3 mit runter.
   * Kennt das Geraet den Befehl nicht (Zonen, andere Typen), bleibt on/off.
   */
  _powerCmd(name, on) {
    const d = this.store && this.store.get(name);
    const target = on ? "on" : "off";
    if (!d) return target;
    const hasZoneMain =
      (d.readings || {}).zoneMain !== undefined && this._has(d, "zoneMain");
    return hasZoneMain ? `zoneMain ${target}` : target;
  }

  _vol(dev) {
    const n = parseFloat(String((dev.readings || {}).volume).replace(",", "."));
    return isNaN(n) ? null : n;
  }

  _volSpec(dev) {
    const m = String(dev.possibleSets || "").match(
      /(?:^|\s)volume:slider,(-?[\d.]+),([\d.]+),(-?[\d.]+)/
    );
    return m
      ? { min: +m[1], step: +m[2], max: +m[3] }
      : { min: 0, step: 1, max: 98 };
  }

  _has(dev, cmd) {
    return new RegExp("(?:^|\\s)" + cmd + "(?:\\b|:)").test(String(dev.possibleSets || ""));
  }

  /** Eingangs-/Quellenliste aus "input:a,b,c" bzw. "source:a,b,c". */
  _inputs(dev) {
    const m = String(dev.possibleSets || "").match(/(?:^|\s)(?:input|source):([^\s]+)/);
    if (!m) return null;
    return { cmd: /source:/.test(m[0]) ? "source" : "input", opts: m[1].split(",").filter(Boolean) };
  }

  _send(name, cmd) {
    if (!this.client || this.readonly || !cmd) return;
    this.client.command(`set ${name} ${cmd}`).catch(() => {});
  }

  _devHtml(dev) {
    const hasPower = this._hasPower(dev);
    const hasMute = this._has(dev, "mute");
    // Box ohne on/off, aber mit mute (z. B. HEOS-Speaker, laesst sich nicht
    // ausschalten): der obere Toggle steuert dann Mute statt Power.
    const muteAsToggle = !hasPower && hasMute;
    const muted = this._muted(dev);
    // "aktiv" = eingeschaltet (Power-Geraet) bzw. NICHT stumm (Mute-Toggle-Box);
    // reine Transport-Geraete gelten immer als aktiv.
    const on = hasPower ? this._on(dev) : muteAsToggle ? !muted : true;
    const vol = this._vol(dev);
    const sp = this._volSpec(dev);
    const label = (dev.attr && dev.attr.alias) || dev.name;
    const power = hasPower
      ? this.readonly
        ? `<span class="sub">${on ? "An" : "Aus"}</span>`
        : `<button class="toggle${on ? " on" : ""}" data-dev="${this.escape(dev.name)}"
           data-act="power" role="switch" aria-checked="${on}"
           aria-label="${this.escape(label)} ein/aus"></button>`
      : muteAsToggle
        ? this.readonly
          ? `<span class="sub">${muted ? "Stumm" : "An"}</span>`
          : `<button class="toggle${on ? " on" : ""}" data-dev="${this.escape(dev.name)}"
             data-act="mute" role="switch" aria-checked="${on}"
             aria-label="${this.escape(label)} stumm ein/aus"></button>`
        : "";
    const hasVol = this._vol(dev) !== null || /(?:^|\s)volume\b/.test(String(dev.possibleSets || ""));
    // Inline-Mute-Button nur bei Power-Geraeten, die zusaetzlich mute koennen -
    // bei Mute-Toggle-Boxen sitzt Mute schon oben.
    const showInlineMute = hasMute && !muteAsToggle;
    const ctl = this.readonly
      ? `<span class="mgvol">${vol == null ? "" : vol}</span>`
      : `${showInlineMute ? `<button class="mgmute${muted ? " on" : ""}" data-dev="${this.escape(dev.name)}"
           data-act="mute" aria-label="${this.escape(label)} stumm">${muted ? "🔇" : "🔊"}</button>` : ""}
         <input type="range" min="${sp.min}" max="${sp.max}" step="${sp.step}"
           value="${vol == null ? sp.min : vol}" data-dev="${this.escape(dev.name)}"
           data-act="vol" aria-label="${this.escape(label)} Lautstärke">
         <span class="mgvol">${vol == null ? "–" : vol}</span>`;

    // Zusatzzeile: Eingang (Denon) und/oder Transport (HEOS).
    const inp = this._inputs(dev);
    const cur = this.plain((dev.readings || {})[inp ? inp.cmd : "input"]);
    const trans = [];
    if (this._has(dev, "previous")) trans.push(["previous", "⏮"]);
    else if (this._has(dev, "prev")) trans.push(["prev", "⏮"]);
    if (this._has(dev, "play")) trans.push(["play", "▶"]);
    if (this._has(dev, "pause")) trans.push(["pause", "⏸"]);
    if (this._has(dev, "stop")) trans.push(["stop", "⏹"]);
    if (this._has(dev, "next")) trans.push(["next", "⏭"]);

    let extra = "";
    if (inp || trans.length) {
      const sel =
        inp && !this.readonly
          ? `<select class="pill mgsel" data-dev="${this.escape(dev.name)}" data-act="input"
               data-cmd="${inp.cmd}" aria-label="${this.escape(label)} Eingang">${inp.opts
              .map((o) => `<option${o === cur ? " selected" : ""}>${this.escape(o)}</option>`)
              .join("")}</select>`
          : inp
            ? `<span class="sub">${this.escape(cur || "–")}</span>`
            : "";
      const tb = this.readonly
        ? ""
        : trans
            .map(
              ([c, sym]) =>
                `<button class="mgmute" data-dev="${this.escape(dev.name)}" data-act="cmd"
                   data-cmd="${c}" aria-label="${this.escape(label + " " + c)}">${sym}</button>`
            )
            .join("");
      extra = `<div class="mgctl mgextra">${sel}${tb}</div>`;
    }

    return `
      <div class="mgdev${on ? " on" : " off"}">
        <div class="mgtop"><span class="mgname">${this.escape(label)}</span>${power}</div>
        ${hasVol ? `<div class="mgctl">${ctl}</div>` : ""}
        ${extra}
      </div>`;
  }

  render() {
    const members = this._members();
    if (!members.length) {
      return `
        <style>${MEDIA_CSS}</style>
        <div class="card">
          <span class="label">${this.escape(this.displayName())}</span>
          <span class="sub">Mitglieder nicht in der Sicht (devspec prüfen)</span>
        </div>`;
    }
    return `
      <style>${MEDIA_CSS}</style>
      <div class="card">
        <span class="label">${this.escape(this.displayName())}</span>
        <div>${members.map((m) => this._devHtml(m)).join("")}</div>
      </div>`;
  }

  afterRender() {
    this.shadowRoot.querySelectorAll("[data-act]").forEach((elm) => {
      const dev = elm.dataset.dev;
      const act = elm.dataset.act;
      if (act === "power") {
        elm.addEventListener("click", () =>
          this._send(dev, this._powerCmd(dev, !this._devOn(dev)))
        );
      } else if (act === "mute") {
        elm.addEventListener("click", () => this._send(dev, this._muteCmd(dev)));
      } else if (act === "vol") {
        elm.addEventListener("change", () => this._send(dev, `volume ${elm.value}`));
      } else if (act === "input") {
        elm.addEventListener("change", () => this._send(dev, `${elm.dataset.cmd} ${elm.value}`));
      } else if (act === "cmd") {
        elm.addEventListener("click", () => this._send(dev, elm.dataset.cmd));
      }
    });
  }

  _devOn(name) {
    const d = this.store && this.store.get(name);
    return d ? this._on(d) : false;
  }
}
