/*
 * FHEMVIZ - Agenda-Widget (v0.7.3).
 * Terminliste im Mockup-Stil: Zeilen der Form "DD.MM.YYYY HH:MM Text"
 * (z. B. Muellkalender rem_d_cal_muell) werden zu Zeilen-Karten mit
 * Wochentag ("Mo 21.07 · 06:00") und fettem Termin.
 *
 * Hervorgehoben wird nach ECHTER Datumsnaehe, nicht nach Position in der
 * Liste: heute (kraeftig) und morgen (bernstein) - alles danach bleibt
 * neutral, Vergangenes wird zurueckgenommen. Sonst leuchtet auch ein Termin in fuenf Tagen, nur weil er der
 * erste Eintrag ist. Heute/Morgen werden ausserdem so benannt, statt das
 * Datum zu zeigen. Nicht parsebare Zeilen erscheinen als einfacher Text.
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
  /* Morgen: bernsteinfarbener Rahmen. Heute: zusaetzlich getoente Flaeche -
   * das ist der Termin, bei dem noch heute etwas zu tun ist. */
  .agrow.tomorrow { border-color: var(--viz-accent, #ffb020); }
  .agrow.tomorrow .when { color: var(--viz-accent, #ffb020); font-weight: 400; }
  .agrow.today {
    border-color: var(--viz-accent, #ffb020);
    background: color-mix(in srgb, var(--viz-accent, #ffb020) 16%, var(--viz-raised, #1c212a));
  }
  .agrow.today .when { color: var(--viz-accent, #ffb020); font-weight: 600; }
  .agrow.today .what { font-weight: 700; }
  /* Vorbei: nicht hervorheben, sondern zuruecknehmen - erledigt ist erledigt. */
  .agrow.past { opacity: 0.5; }
  :host([data-tv]) .agrow { padding: 13px 18px; }
  :host([data-tv]) .agrow .when { font-size: 1.2rem; }
  :host([data-tv]) .agrow .what { font-size: 1.1rem; }
`;

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export class FhemvizAgenda extends FhemvizWidget {
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

  /**
   * "21.07.2026 06:00 Bioabfall" -> {when, what, days}.
   * days = Tage bis zum Termin (0 = heute, 1 = morgen, null = kein Datum).
   */
  _rows() {
    const r = this.device.readings || {};
    const raw = r.STATE ?? this.device.state;
    return this._plainMultiline(raw)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}:\d{2})\s+(.+)$/);
        if (!m) return { when: "", what: line, days: null };
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
        return { when: `${day} · ${m[4]}`, what: m[5], days };
      });
  }

  render() {
    const rows = this._rows();
    const rowsHtml = rows
      .map(
        (r) => `
        <div class="agrow${
          r.days === null
            ? ""
            : r.days < 0
              ? " past"
              : r.days === 0
                ? " today"
                : r.days === 1
                  ? " tomorrow"
                  : ""
        }">
          ${r.when ? `<span class="when">${this.escape(r.when)}</span>` : ""}
          <span class="what">${this.escape(r.what)}</span>
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
