/*
 * FHEMVIZ - Agenda-Widget (v0.34.40).
 * Terminliste im Mockup-Stil: Zeilen der Form "DD.MM.YYYY HH:MM Text"
 * (z. B. Muellkalender rem_d_cal_muell) werden zu Zeilen-Karten mit
 * Wochentag ("Mo 21.07 · 06:00") und fettem Termin.
 *
 * Hervorgehoben wird nach ECHTER Datumsnaehe, nicht nach Position in der
 * Liste: heute kraeftig, morgen etwas leiser - beide bernsteinfarben mit
 * getoenter Flaeche, alles danach neutral, Vergangenes zurueckgenommen.
 * Sonst leuchtet auch ein Termin in fuenf Tagen, nur weil er der erste
 * Eintrag ist. Heute/Morgen werden ausserdem so benannt, statt das Datum zu
 * zeigen. Nicht parsebare Zeilen erscheinen als einfacher Text.
 *
 * Abgelaufene Termine verschwinden nach HIDE_H Stunden (Default 8): der
 * Muell wird morgens um 06:00 geholt, mittags hilft die Zeile keinem mehr.
 * Je Geraet einstellbar mit attr <geraet> vizAgenda hide=<Stunden> (0 = nie
 * ausblenden). Ganztagstermine (00:00) zaehlen ab Tagesende, damit ein
 * Geburtstag nicht schon um 08:00 verschwindet.
 *
 * Aktivierung: attr <geraet> vizWidget agenda
 */

import { FhemvizWidget } from "./base-widget.js";

const AGENDA_CSS = `
  .agrows { display: flex; flex-direction: column; gap: 8px; }
  .agrow {
    display: flex; align-items: baseline; gap: 12px;
    background: var(--viz-raised, #1c212a);
    border: 1px solid var(--viz-border, #262c35);
    border-radius: 10px; padding: 10px 14px; min-width: 0;
  }
  .agrow .when {
    font-weight: 200; white-space: nowrap; font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }
  .agrow .what {
    font-weight: 600; font-size: 0.95rem; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* Morgen ist genauso eingefaerbt wie heute, nur eine Stufe leiser: gleicher
   * Rahmen, halb so kraeftige Flaeche, Termintext nicht extra fett. Vorher
   * hatte "morgen" nur den Rahmen und sah neben "heute" ungefaerbt aus. */
  .agrow.tomorrow {
    border-color: var(--viz-accent, #ffb020);
    background: color-mix(in srgb, var(--viz-accent, #ffb020) 8%, var(--viz-raised, #1c212a));
  }
  .agrow.tomorrow .when { color: var(--viz-accent, #ffb020); font-weight: 600; }
  .agrow.today {
    border-color: var(--viz-accent, #ffb020);
    background: color-mix(in srgb, var(--viz-accent, #ffb020) 16%, var(--viz-raised, #1c212a));
  }
  .agrow.today .when { color: var(--viz-accent, #ffb020); font-weight: 600; }
  .agrow.today .what { font-weight: 700; }
  /* Vorbei: nicht hervorheben, sondern zuruecknehmen - erledigt ist erledigt. */
  .agrow.past { opacity: 0.5; }
  /* Mehrere Kalender in einer Kachel (vizAgenda src=): die Herkunft steckt in
   * einer farbigen Kante LINKS und im Kuerzel rechts. Bewusst nicht in der
   * Flaeche - die gehoert weiter "heute/morgen", sonst konkurrieren zwei
   * Bedeutungen um dieselbe Farbe. */
  .agrow.quelle { border-left: 4px solid var(--qcol, var(--viz-border, #262c35)); }
  .agrow .qtag {
    margin-left: auto; padding-left: 10px; white-space: nowrap;
    font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--qcol, var(--viz-muted, #77808c));
  }
  :host([data-tv]) .agrow .qtag { font-size: 0.8rem; }
  /* Auf einer schmalen Kachel frisst das Kuerzel den Termin ("6h Clau…").
   * Dort traegt die farbige Kante die Herkunft allein. Groessen-Container ist
   * die Karte, es zaehlt also die KACHELBREITE, nicht die des Fensters. */
  .card { container-type: inline-size; }
  @container (max-width: 360px) { .agrow .qtag { display: none; } }
  :host([data-tv]) .agrow { padding: 13px 18px; }
  :host([data-tv]) .agrow .when { font-size: 1.2rem; }
  :host([data-tv]) .agrow .what { font-size: 1.1rem; }
`;

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const HIDE_H = 8; // Stunden, die ein abgelaufener Termin noch stehen bleibt
// Die Grenze laeuft mit der Uhr, nicht mit den Events: der Kalender meldet
// sich einmal am Tag, ohne eigenen Takt bliebe die Zeile bis zum naechsten
// Update stehen. Fuenf Minuten sind genau genug fuer eine Stundengrenze.
const TICK_MS = 300000;

export class FhemvizAgenda extends FhemvizWidget {
  connectedCallback() {
    super.connectedCallback();
    this._tick = setInterval(() => this._paint(), TICK_MS);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._tick);
  }

  _plainMultiline(s) {
    return String(s ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .trim();
  }

  /** Mitternacht von heute - Basis fuer den Tagesabstand. */
  _today() {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }

  /** Vorhaltezeit abgelaufener Termine in Stunden (attr vizAgenda hide=…). */
  _hideHours() {
    const m = String((this.device.attr || {}).vizAgenda || "").match(
      /hide\s*=\s*(\d+(?:\.\d+)?)/i
    );
    return m ? Number(m[1]) : HIDE_H;
  }

  /**
   * Mehrere Kalender in EINER Kachel (attr vizAgenda src=…), z. B.
   *   src=rem_d_cal_muell:ok,rem_d_cal_google:accent,rem_d_cal_familie:blau
   * Je Eintrag <geraet>[:<farbe>]; die Beschriftung ist der Alias des Geraets.
   * Farbe wie bei vizReadings (ok|warn|bad|accent|blau) oder eine CSS-Farbe.
   * Ohne src bleibt es bei der eigenen Terminliste.
   * KEINE Leerzeichen im Wert - der Rest der attr-Zeile gehoert anderen
   * Schluesseln (hide=…).
   */
  /**
   * Farbe einer Quelle: erst die semantischen Namen (ok|warn|bad|accent|blau
   * wie bei vizReadings), sonst eine CSS-Farbe. Fuenf Namen reichen nicht fuer
   * beliebig viele Kalender, und drei davon sind anderweitig belegt (rot =
   * Alarm, bernstein = heute). Bewusst eng gefasst - der Wert landet in einem
   * style-Attribut, also nur #hex oder ein Farbwort.
   */
  _farbe(txt) {
    const t = String(txt || "").trim();
    if (!t) return "";
    const sem = this.colorVar(t);
    if (sem) return sem;
    return /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(t) ? t : "";
  }

  _quellen() {
    const m = String((this.device.attr || {}).vizAgenda || "").match(/src\s*=\s*(\S+)/i);
    if (!m || !this.store) return null;
    const list = m[1]
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => {
        const i = t.indexOf(":");
        const name = (i < 0 ? t : t.slice(0, i)).trim();
        const farbe = i < 0 ? "" : t.slice(i + 1).trim();
        const dev = this.store.get(name);
        return dev ? { dev, farbe: this._farbe(farbe), name } : null;
      })
      .filter(Boolean);
    return list.length ? list : null;
  }

  /**
   * "21.07.2026 06:00 Bioabfall" -> {when, what, days, ab}.
   * days = Tage bis zum Termin (0 = heute, 1 = morgen, null = kein Datum).
   * ab   = Zeitpunkt, ab dem die Zeile als abgelaufen gilt (null = nie).
   */
  _rows(quelle) {
    const dev = quelle || this.device;
    const r = dev.readings || {};
    const raw = r.STATE ?? dev.state;
    return this._plainMultiline(raw)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}:\d{2})\s+(.+)$/);
        if (!m) return { when: "", what: line, days: null, ab: null };
        const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        const valid = !isNaN(d.getTime());
        const days = valid
          ? Math.round((d - this._today()) / 86400000)
          : null;
        const dd = String(m[1]).padStart(2, "0");
        const mm = String(m[2]).padStart(2, "0");
        // Heute/Morgen ausschreiben - das liest sich schneller als ein Datum.
        const day =
          days === 0 ? "Heute" : days === 1 ? "Morgen"
            : `${valid ? WEEKDAYS[d.getDay()] + " " : ""}${dd}.${mm}`;
        // Ablauf ab der Terminzeit; bei 00:00 (Ganztagstermin) erst ab
        // Tagesende, sonst waere ein Geburtstag um 08:00 schon weg.
        let ab = null;
        if (valid) {
          const [hh, mi] = m[4].split(":").map(Number);
          ab = new Date(d);
          if (hh === 0 && mi === 0) ab.setHours(24, 0, 0, 0);
          else ab.setHours(hh, mi, 0, 0);
        }
        return { when: `${day} · ${m[4]}`, what: m[5], days, ab, sort: ab };
      });
  }

  /**
   * Alle Quellen zusammen, nach Zeitpunkt sortiert. Zeilen ohne lesbares
   * Datum haben keine Sortierung und stehen hinten - sie wegzulassen waere
   * schlimmer, das ist meist eine Meldung des Kalenders.
   */
  _alleRows() {
    const q = this._quellen();
    if (!q) return this._rows();
    const raus = [];
    for (const { dev, farbe } of q) {
      const label = this.plain((dev.attr || {}).alias || dev.name);
      for (const r of this._rows(dev)) raus.push({ ...r, farbe, quelle: label });
    }
    raus.sort((a, b) => {
      if (!a.sort && !b.sort) return 0;
      if (!a.sort) return 1;
      if (!b.sort) return -1;
      return a.sort - b.sort;
    });
    return raus;
  }

  render() {
    // Abgelaufene Termine nach der Vorhaltezeit aus der Liste nehmen.
    const stunden = this._hideHours();
    const jetzt = Date.now();
    const rows = this._alleRows().filter(
      (r) => !(stunden > 0 && r.ab && jetzt - r.ab.getTime() > stunden * 3600000)
    );
    const naehe = (r) =>
      r.days === null ? "" : r.days < 0 ? " past"
        : r.days === 0 ? " today" : r.days === 1 ? " tomorrow" : "";
    const rowsHtml = rows
      .map(
        (r) => `
        <div class="agrow${naehe(r)}${r.farbe ? " quelle" : ""}"${
          r.farbe ? ` style="--qcol:${r.farbe}"` : ""
        }>
          ${r.when ? `<span class="when">${this.escape(r.when)}</span>` : ""}
          <span class="what">${this.escape(r.what)}</span>
          ${r.quelle ? `<span class="qtag">${this.escape(r.quelle)}</span>` : ""}
        </div>`
      )
      .join("");
    return `
      <style>${AGENDA_CSS}</style>
      <div class="card">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="agrows">${rowsHtml || `<span class="sub">–</span>`}</div>
      </div>`;
  }
}
