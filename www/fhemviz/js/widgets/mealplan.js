/*
 * FHEMVIZ - Wochenplan-Kachel (v0.34.48).
 * Zeigt den Essensplan eines HTTPMOD-Geraets, das am BRING-Interface haengt:
 * heute gross mit Foto, darunter die restlichen Tage als Streifen mit
 * Vorschaubild, Sternen und Status. Bedient wird direkt aus der Kachel
 * (wuerfeln, bewerten, Wocheneinkauf) - das ist der Unterschied zur
 * Bild-Kachel mit /plan.svg, die nur anzeigt.
 *
 * Erwartete Readings (so legt sie fhem/wochenplan.commands.txt an):
 *   mo..so              Gericht des Tages
 *   mo_sterne..so_sterne Bewertung 0..5
 *   mo_bild..so_bild    Bild-Adresse (absolut, mit Token)
 *   morgen_vorbereitung Vorlauf fuer morgen ("auftauen") - optional
 * Fehlt ein Reading, faellt genau dieser Teil weg; die Kachel bleibt heil.
 *
 * Die Knoepfe erscheinen nur, wenn das Geraet den passenden set-Befehl
 * anbietet (PossibleSets) - ein Geraet ohne "bewerten" bekommt keine
 * Bewertungsleiste.
 *
 * Aktivierung: attr <geraet> vizWidget mealplan
 * Empfehlung:  attr <geraet> vizSize 2x2
 */

import { FhemvizWidget } from "./base-widget.js";

// Reihenfolge wie im Plan: Montag zuerst. `js` ist der Wochentag von
// Date#getDay (0 = Sonntag), damit "heute" ohne Datumsrechnerei gefunden wird.
const DAYS = [
  { key: "mo", label: "Montag", short: "Mo", js: 1 },
  { key: "di", label: "Dienstag", short: "Di", js: 2 },
  { key: "mi", label: "Mittwoch", short: "Mi", js: 3 },
  { key: "do", label: "Donnerstag", short: "Do", js: 4 },
  { key: "fr", label: "Freitag", short: "Fr", js: 5 },
  { key: "sa", label: "Samstag", short: "Sa", js: 6 },
  { key: "so", label: "Sonntag", short: "So", js: 0 },
];

// Bewertungen wie in der App - Text fuer FHEM, Zeichen fuer die Kachel.
const RATINGS = [
  { cmd: "lecker", icon: "😋", title: "lecker" },
  { cmd: "gut", icon: "🙂", title: "gut" },
  { cmd: "ok", icon: "😐", title: "geht so" },
  { cmd: "maessig", icon: "👎", title: "mäßig" },
  { cmd: "rausgeflogen", icon: "🗑", title: "gar nicht gekocht" },
];

// Ein Tageswechsel ohne Ereignis wuerde die Hervorhebung stehen lassen -
// deshalb ein eigener Takt. Zehn Minuten reichen fuer eine Tagesgrenze.
const TICK_MS = 600000;

const MEALPLAN_CSS = `
  .mp { display: flex; flex-direction: column; gap: 10px; min-width: 0; }

  /* Heute: Bild links, Text rechts. Bei schmaler Kachel untereinander. */
  .mp-hero {
    display: grid; grid-template-columns: minmax(84px, 34%) 1fr; gap: 12px;
    align-items: stretch; min-width: 0;
  }
  .mp-hero .mp-img { min-height: 92px; }
  .mp-hero .mp-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .mp-kicker {
    font-size: 0.62rem; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--viz-accent, #ffb020);
  }
  .mp-dish {
    font-size: 1.15rem; font-weight: 650; line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .mp-dish.empty { color: var(--viz-muted, #77808c); font-weight: 400; font-style: italic; }
  .mp-sub { font-size: 0.8rem; color: var(--viz-muted, #77808c); }

  /* Vorlauf gehoert an den Vorabend gedacht - deshalb auffaellig. */
  .mp-prep {
    font-size: 0.82rem; font-weight: 600; color: var(--viz-warn, #ffab40);
    overflow-wrap: anywhere;
  }

  .mp-img {
    border-radius: 10px; background: var(--viz-raised, #1c212a) center/cover no-repeat;
    position: relative; flex-shrink: 0;
  }
  .mp-img.empty::after {
    content: "🍽"; position: absolute; inset: 0; display: grid; place-items: center;
    font-size: 1.6rem; opacity: 0.35;
  }

  /* Die anderen Tage: kompakte Streifen, damit auch sieben Zeilen passen. */
  .mp-days { display: flex; flex-direction: column; gap: 6px; }
  .mp-row {
    display: grid; grid-template-columns: auto 40px 1fr auto; gap: 10px;
    align-items: center; padding: 6px 8px; min-width: 0;
    background: var(--viz-raised, #1c212a);
    border: 1px solid var(--viz-border, #262c35); border-radius: 10px;
  }
  .mp-row .mp-day {
    font-size: 0.78rem; font-weight: 600; color: var(--viz-muted, #77808c);
    width: 1.6rem; flex-shrink: 0;
  }
  .mp-row .mp-img { width: 40px; height: 34px; }
  .mp-row .mp-name {
    font-size: 0.9rem; min-width: 0; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .mp-row .mp-name.empty { color: var(--viz-muted, #77808c); font-style: italic; }
  .mp-row .mp-stars { font-size: 0.78rem; color: var(--viz-accent, #ffb020); flex-shrink: 0; }
  .mp-row.today { border-color: var(--viz-accent, #ffb020); }
  .mp-row.cooked { opacity: 0.55; }

  .mp-btns { display: flex; flex-wrap: wrap; gap: 6px; }
  .mp-btn {
    appearance: none; cursor: pointer; font: inherit; font-size: 0.82rem;
    padding: 6px 10px; border-radius: 999px;
    background: var(--viz-raised, #1c212a); color: var(--viz-fg, #e8eaef);
    border: 1px solid var(--viz-border, #262c35);
  }
  .mp-btn:active { transform: scale(0.97); }
  .mp-rate .mp-btn { font-size: 1rem; padding: 4px 9px; }

  :host([data-tv]) .mp-dish { font-size: 1.5rem; }
  :host([data-tv]) .mp-row .mp-name { font-size: 1.05rem; }
  :host([data-tv]) .mp-row .mp-img { width: 54px; height: 44px; }
  :host([data-tv]) .mp-btn { font-size: 1rem; padding: 9px 14px; }

  @media (max-width: 420px) {
    .mp-hero { grid-template-columns: 1fr; }
    .mp-hero .mp-img { min-height: 120px; }
  }
`;

export class FhemvizMealplan extends FhemvizWidget {
  connectedCallback() {
    super.connectedCallback();
    this._tick = setInterval(() => this._paint(), TICK_MS);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._tick);
  }

  _reading(name) {
    const value = (this.device.readings || {})[name];
    return value === undefined || value === null ? "" : this.plain(value);
  }

  /** Bietet das Geraet diesen set-Befehl an? Sonst kein Knopf dafuer. */
  _canSet(cmd) {
    const sets = this.device.possibleSets || this.device.PossibleSets || "";
    const list = Array.isArray(sets) ? sets : String(sets).split(/\s+/);
    return list.some((entry) => String(entry).split(":")[0] === cmd);
  }

  _todayKey() {
    const js = new Date().getDay();
    return (DAYS.find((d) => d.js === js) || DAYS[0]).key;
  }

  _days() {
    const heute = this._todayKey();
    return DAYS.map((d) => ({
      ...d,
      name: this._reading(d.key),
      stars: Number(this._reading(`${d.key}_sterne`)) || 0,
      img: this._reading(`${d.key}_bild`),
      status: this._reading(`${d.key}_status`),
      isToday: d.key === heute,
    }));
  }

  _imgHtml(src, extraClass = "") {
    const cls = `mp-img${src ? "" : " empty"}${extraClass ? ` ${extraClass}` : ""}`;
    const style = src ? ` style="background-image:url('${this.escape(src)}')"` : "";
    return `<div class="${cls}"${style}></div>`;
  }

  _starsHtml(n) {
    const count = Math.max(0, Math.min(5, Math.round(n)));
    return count ? "★".repeat(count) : "";
  }

  render() {
    const days = this._days();
    const hero = days.find((d) => d.isToday) || days[0];
    const rest = days.filter((d) => d !== hero);

    // Vorlauf: heute abend zaehlt, was morgen ansteht.
    const prep = this._reading("morgen_vorbereitung");
    const heuteZeit = this._reading("heute_zeit");

    const rows = rest
      .map(
        (d) => `
        <div class="mp-row${d.status === "cooked" ? " cooked" : ""}">
          <span class="mp-day">${d.short}</span>
          ${this._imgHtml(d.img)}
          <span class="mp-name${d.name ? "" : " empty"}">${this.escape(
            d.name || "– offen –"
          )}</span>
          <span class="mp-stars">${this._starsHtml(d.stars)}</span>
        </div>`
      )
      .join("");

    const btn = (cmd, text) =>
      this._canSet(cmd)
        ? `<button class="mp-btn" data-cmd="${this.escape(cmd)}">${text}</button>`
        : "";

    const rateHtml = this._canSet("bewerten")
      ? `<div class="mp-btns mp-rate">${RATINGS.map(
          (r) =>
            `<button class="mp-btn" data-cmd="bewerten ${r.cmd}" title="${r.title}">${r.icon}</button>`
        ).join("")}</div>`
      : "";

    return `
      <style>${MEALPLAN_CSS}</style>
      <div class="card">
        <span class="label">${this.escape(this.displayName())}</span>
        <div class="mp">
          <div class="mp-hero">
            ${this._imgHtml(hero.img)}
            <div class="mp-text">
              <span class="mp-kicker">Heute · ${hero.label}</span>
              <span class="mp-dish${hero.name ? "" : " empty"}">${this.escape(
                hero.name || "nichts geplant"
              )}</span>
              ${
                heuteZeit || hero.stars
                  ? `<span class="mp-sub">${[
                      this.escape(heuteZeit),
                      this._starsHtml(hero.stars),
                    ]
                      .filter(Boolean)
                      .join(" · ")}</span>`
                  : ""
              }
              ${prep ? `<span class="mp-prep">⏰ Morgen vorher: ${this.escape(prep)}</span>` : ""}
            </div>
          </div>

          <div class="mp-days">${rows}</div>

          ${rateHtml}
          <div class="mp-btns">
            ${btn("wuerfeln_heute", "🎲 heute")}
            ${btn("wuerfeln_leere_tage", "🎲 freie Tage")}
            ${btn("einkaufsliste", "🛒 Einkauf")}
            ${btn("abgleichen", "↻ abgleichen")}
          </div>
        </div>
      </div>`;
  }

  afterRender() {
    this.shadowRoot.querySelectorAll("[data-cmd]").forEach((elm) => {
      elm.addEventListener("click", () => this.sendCommand(elm.dataset.cmd));
    });
  }
}
