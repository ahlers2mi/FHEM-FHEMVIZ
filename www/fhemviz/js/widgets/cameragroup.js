/*
 * FHEMVIZ - Kamera-Gruppe (vizWidget cameragroup, v0.34.35).
 * EINE Kachel fuer ein structure-Geraet aus Kameras: je Kamera eine Zeile mit
 * Name, letztem Ereignis (Person/Bewegung samt Uhrzeit), Akkustand und einem
 * Schalter fuer die Bewegungserkennung. Der Kopf fasst zusammen, was gerade
 * los ist - und WARNT, wenn bei einer Kamera die Erkennung aus ist.
 *
 * Auswahl: automatisch fuer ein structure mit clientstate "camera"/"kamera"
 *   define st_kamera structure camera MQTT2_CAM1 MQTT2_CAM2 …
 * oder erzwungen mit: attr <structure> vizWidget cameragroup
 * Die Mitglieder muessen im devspec liegen (z. B. Raum FHEMVIZ->Stuff).
 *
 * Readings werden nach Namen gesucht, das Widget haengt also nicht an einem
 * Modul (getestet mit eufy ueber ioBroker/MQTT):
 *   Name       name, sonst Alias ohne "Kamera "
 *   Bewegung   motion_detected, motion
 *   Person     person_detected, identity_person_detected,
 *              stranger_person_detected; Name aus person_name, last_person
 *   Erkennung  motion_detection (an/aus, Schalter aus PossibleSets)
 *   Akku       battery, batteryLevel
 *   Bild       picture_url, snapshot_url, last_event_url
 *
 * Vorschaubilder sind AUS, solange kein Praefix konfiguriert ist: die Readings
 * enthalten nur einen Pfad (/files/eusec.0/…), der Browser braucht den Host
 * davor. Mit  attr <structure> vizCameras base=http://iobroker:8082  wird
 * daraus ein Bild; die Reading-Zeit haengt als Cache-Buster hinten dran.
 * Empfehlung: vizSize 2x1 oder 2x2.
 */

import { FhemvizWidget } from "./base-widget.js";

const CAMG_CSS = `
  .cgrows { display: flex; flex-direction: column; margin-top: 4px; }
  .cgrow {
    display: flex; align-items: center; gap: 10px; min-width: 0;
    padding: 6px 0; border-bottom: 1px solid var(--viz-border, #262c35);
  }
  .cgrow:last-child { border-bottom: 0; }
  .cgicon { flex-shrink: 0; width: 24px; height: 24px; color: var(--viz-muted, #77808c); }
  .cgrow.alarm .cgicon { color: var(--viz-accent, #ffb020); }
  .cgrow.blind .cgicon { color: var(--viz-error, #ff5d5d); }
  .cgthumb {
    flex-shrink: 0; width: 64px; height: 36px; object-fit: cover;
    border-radius: 6px; background: var(--viz-raised, #1c212a);
  }
  :host([data-size="2x2"]) .cgthumb, :host([data-tv]) .cgthumb { width: 96px; height: 54px; }
  /* Name und Zustand UNTEREINANDER in einer flexiblen Spalte: nebeneinander
   * zerdrueckte der lange Zustandstext ("Person: Maike · 02.08. 09:52") auf
   * dem Handy den Namen auf "E…" und schob den Schalter aus der Zeile. */
  .cgtxt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
  .cgname {
    min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; font-size: 0.95rem; color: var(--viz-text, #e8eaed);
  }
  .cgstate {
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 0.8rem; color: var(--viz-muted, #77808c);
  }
  .cgrow.alarm .cgstate { color: var(--viz-accent, #ffb020); font-weight: 600; }
  .cgrow.blind .cgstate { color: var(--viz-error, #ff5d5d); font-weight: 600; }
  .cgbat { flex-shrink: 0; font-size: 0.78rem; color: var(--viz-muted, #77808c); }
  .cgbat.low { color: var(--viz-error, #ff5d5d); font-weight: 600; }
  /* Schalter kleiner als der Standard-Toggle: hier stehen sechs davon
   * untereinander, die 52px-Variante sprengt die Zeile. */
  button.cgsw {
    flex-shrink: 0; width: 38px; height: 22px; padding: 0;
    border: 0; border-radius: 999px; cursor: pointer;
    background: var(--viz-raised, #1c212a); position: relative;
  }
  button.cgsw::after {
    content: ""; position: absolute; top: 3px; left: 3px;
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--viz-muted, #77808c);
    transition: transform 0.15s ease, background 0.15s ease;
  }
  button.cgsw.on { background: var(--viz-ok, #34c77b); }
  button.cgsw.on::after { transform: translateX(16px); background: var(--viz-bg, #0a0c0f); }
  button.cgsw:focus-visible { outline: 2px solid var(--viz-action, #4c8dff); outline-offset: 2px; }
  :host([data-size="2x2"]) .cgname, :host([data-tv]) .cgname { font-size: 1.15rem; }
  :host([data-size="2x2"]) .cgstate, :host([data-tv]) .cgstate { font-size: 0.95rem; }
`;

// Kamera-Symbol (24x24) und ein durchgestrichenes fuer "Erkennung aus".
const CAM_ICON = `<path d="M3 7 h11 v10 H3 Z"/><path d="M14 11 L21 7.5 v9 L14 13 Z"/>`;
const CAM_OFF = CAM_ICON + `<line x1="3" y1="20" x2="21" y2="4"/>`;

export class FhemvizCameraGroup extends FhemvizWidget {
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

  /** Mitglieder aus der structure-DEF ("<typ> dev1 dev2 …") ueber den Store. */
  _members() {
    if (!this.store) return [];
    const internals = this.device.internals || {};
    if (internals.TYPE !== "structure") return [];
    return this.sortMembers(
      String(internals.DEF || "")
        .split(/\s+/)
        .slice(1)
        .map((n) => n.replace(/,$/, ""))
        .map((n) => this.store.get(n))
        .filter(Boolean)
    );
  }

  /** attr vizCameras als {rolle: wert} (base=…, reading=…). */
  _cfg() {
    const out = {};
    String((this.device.attr || {}).vizCameras || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach((t) => {
        const m = t.match(/^([a-z]+)\s*=\s*(.+)$/i);
        if (m) out[m[1].toLowerCase()] = m[2].trim();
      });
    return out;
  }

  /** Erstes vorhandenes Reading (Gross-/Kleinschreibung egal) als {name,value}. */
  _read(dev, names) {
    const rd = (dev && dev.readings) || {};
    const keys = Object.keys(rd);
    for (const n of names) {
      const k = keys.find((x) => x.toLowerCase() === n.toLowerCase());
      if (k !== undefined) return { name: k, value: rd[k] };
    }
    return null;
  }

  _wahr(dev, names) {
    const hit = this._read(dev, names);
    return hit ? /^(1|true|on|yes|ja)$/i.test(this.plain(hit.value).trim()) : false;
  }

  /** "2026-08-01 16:47:43" -> "16:47" (heute) bzw. "01.08. 16:47". */
  _uhrzeit(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    if (!m) return "";
    const heute = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const istHeute =
      +m[1] === heute.getFullYear() &&
      +m[2] === heute.getMonth() + 1 &&
      +m[3] === heute.getDate();
    return istHeute ? `${m[4]}:${m[5]}` : `${m[3]}.${m[2]}. ${m[4]}:${m[5]}`;
  }

  /** Jüngster Zeitstempel der genannten Readings. */
  _zeit(dev, names) {
    const t = (dev && dev.times) || {};
    const keys = Object.keys(t);
    let best = "";
    for (const n of names) {
      const k = keys.find((x) => x.toLowerCase() === n.toLowerCase());
      if (k !== undefined && t[k] > best) best = t[k];
    }
    return this._uhrzeit(best);
  }

  /** Zustand einer Kamera. */
  _info(dev) {
    const person =
      this._wahr(dev, ["person_detected", "identity_person_detected", "stranger_person_detected"]);
    const motion = this._wahr(dev, ["motion_detected", "motion"]);
    const erkennung = this._read(dev, ["motion_detection", "detection"]);
    const aus = erkennung
      ? /^(0|false|off|no|nein)$/i.test(this.plain(erkennung.value).trim())
      : false;
    const wer =
      this.plain((this._read(dev, ["person_name"]) || {}).value || "").trim() ||
      this.plain((this._read(dev, ["last_person"]) || {}).value || "").trim();
    const zeit = this._zeit(dev, [
      "person_detected",
      "motion_detected",
      "picture_url",
      "text",
    ]);

    let text;
    let cls = "";
    if (person) {
      text = wer ? `Person: ${wer}` : "Person";
      cls = "alarm";
    } else if (motion) {
      text = "Bewegung";
      cls = "alarm";
    } else if (aus) {
      // Wichtiger als "ruhig": eine Kamera, die nicht mehr hinsieht.
      text = "Erkennung aus";
      cls = "blind";
    } else {
      text = "ruhig";
    }
    if (zeit && !aus) text += ` · ${zeit}`;

    const bat = this._read(dev, ["battery", "batteryLevel"]);
    const batNum = bat ? parseFloat(String(bat.value).replace(/[^\d.-]/g, "")) : null;
    return { text, cls, aus, person, motion, batNum, erkennung };
  }

  /** Kurzer Name: Reading "name", sonst Alias ohne "Kamera "-Vorsatz. */
  _label(dev) {
    const rn = this.plain((this._read(dev, ["name"]) || {}).value || "").trim();
    if (rn) return rn;
    const raw = (dev.attr && dev.attr.alias) || dev.name;
    return raw.replace(/^kamera\s+/i, "");
  }

  /** Vorschaubild-URL oder "" (ohne base= gibt es keine). */
  _bild(dev) {
    const cfg = this._cfg();
    if (!cfg.base) return "";
    const namen = cfg.reading
      ? [cfg.reading]
      : ["picture_url", "snapshot_url", "last_event_url"];
    const hit = this._read(dev, namen);
    if (!hit || !String(hit.value).trim()) return "";
    const pfad = this.plain(hit.value).trim();
    const url = /^https?:\/\//i.test(pfad)
      ? pfad
      : cfg.base.replace(/\/+$/, "") + (pfad.startsWith("/") ? "" : "/") + pfad;
    // Cache-Buster: das Bild liegt bei jedem Ereignis unter DEMSELBEN Pfad.
    const t = ((dev.times || {})[hit.name] || "").replace(/\D/g, "");
    return t ? `${url}${url.includes("?") ? "&" : "?"}t=${t}` : url;
  }

  _send(name, cmd) {
    if (!this.client || this.readonly || !cmd) return;
    this.client.command(`set ${name} ${cmd}`).catch(() => {});
  }

  render() {
    const members = this._members();
    if (!members.length) {
      return `<style>${CAMG_CSS}</style>
        <div class="card">
          <span class="label">${this.escape(this.displayName())}</span>
          <span class="sub">Mitglieder nicht in der Sicht (devspec prüfen)</span>
        </div>`;
    }
    const infos = members.map((m) => ({ dev: m, info: this._info(m), name: this._label(m) }));
    const alarm = infos.filter((x) => x.info.person || x.info.motion);
    const blind = infos.filter((x) => x.info.aus);

    // Kopf: was gerade los ist. Bewegung schlaegt "Erkennung aus" - beides
    // gleichzeitig ist der seltene Fall, dann zaehlt der Alarm.
    let kopf = `${infos.length} Kameras`;
    let kopfCls = "";
    if (alarm.length) {
      // Klartext statt nur der Kameraname - "Einfahrt" allein sagt nicht, was
      // dort los ist.
      const wasIst = alarm.some((x) => x.info.person) ? "Person" : "Bewegung";
      kopf = `${wasIst}: ${alarm.map((x) => x.name).join(", ")}`;
      kopfCls = " on";
    } else if (blind.length) {
      kopf = `${blind.length} ohne Erkennung`;
      kopfCls = " bad";
    } else {
      kopf = `${infos.length} Kameras · ruhig`;
    }

    const rows = infos
      .map(({ dev, info, name }) => {
        const bild = this._bild(dev);
        const sym = bild
          ? `<img class="cgthumb" src="${this.escape(bild)}" alt="" loading="lazy">`
          : `<svg class="cgicon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">${
                 info.aus ? CAM_OFF : CAM_ICON
               }</svg>`;
        const bat =
          info.batNum === null || isNaN(info.batNum)
            ? ""
            : `<span class="cgbat${info.batNum <= 20 ? " low" : ""}">${Math.round(
                info.batNum
              )} %</span>`;
        // Schalter nur, wenn das Geraet motion_detection auch setzen kann.
        const setzbar =
          info.erkennung &&
          new RegExp(`(?:^|\\s)${info.erkennung.name}(?::|\\s|$)`).test(
            String(dev.possibleSets || "")
          );
        const sw =
          this.readonly || !setzbar
            ? ""
            : `<button class="cgsw${info.aus ? "" : " on"}" role="switch"
                 aria-checked="${!info.aus}" data-dev="${this.escape(dev.name)}"
                 data-cmd="${this.escape(info.erkennung.name)}"
                 data-an="${info.aus ? "1" : "0"}"
                 aria-label="Bewegungserkennung ${this.escape(name)}"></button>`;
        return `<div class="cgrow ${info.cls}">
            ${sym}
            <span class="cgtxt">
              <span class="cgname">${this.escape(name)}</span>
              <span class="cgstate">${this.escape(info.text)}</span>
            </span>
            ${bat}
            ${sw}
          </div>`;
      })
      .join("");

    return `<style>${CAMG_CSS}</style>
      <div class="card${kopfCls}">
        <span class="label">${this.escape(this.displayName())}</span>
        <span class="value" style="font-size:1.15rem;font-weight:450;">${this.escape(kopf)}</span>
        <div class="cgrows">${rows}</div>
      </div>`;
  }

  afterRender() {
    this.shadowRoot.querySelectorAll("button.cgsw").forEach((b) => {
      b.addEventListener("click", () => {
        // true/false wie in der setList der eufy-Geraete.
        const an = b.dataset.an === "1";
        this._send(b.dataset.dev, `${b.dataset.cmd} ${an ? "true" : "false"}`);
      });
    });
  }
}
