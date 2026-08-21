/*
 * FHEMVIZ - Ringanzeige als GEMEINSAMES Bauteil.
 *
 * Bewusst kein Widget, sondern ein Baustein: ein 270-Grad-Bogen mit
 * Fuellstand, optionaler Zielmarke und beliebigem Inhalt in der Mitte.
 * Damit ist derselbe Blickfang fuer alles zu haben, was einen Anteil und ein
 * Ziel hat - Ladestand mit Wunschlimit, Speicher mit Reserve, Feuchte mit
 * Schwelle. Wer ein eigenes Widget schreibt (Plugin-API), kann ihn genauso
 * benutzen:
 *
 *   import { ringGauge, GAUGE_CSS } from "./gauge.js";
 *   `<style>${GAUGE_CSS}</style>` + ringGauge({ pct: 62, mark: 80, ... })
 *
 * Warum 270 Grad und nicht der ganze Kreis: die Luecke unten gibt der Zahl in
 * der Mitte Platz und macht Anfang und Ende der Skala sichtbar - beim
 * Vollkreis ist nicht zu erkennen, wo 0 % liegt.
 *
 * Warum SVG mit viewBox und nicht Pixel: die Kachel skaliert (TV-Modus,
 * ?zoom=, ?width=), ein Bogen in festen Pixeln wuerde dabei ausfransen.
 */

/**
 * Punkt auf dem Bogen. 0 % liegt unten links (135 Grad), 100 % unten rechts.
 * Der Prozentwert wird durch 100 geteilt - ohne das wird aus 100 % ein Winkel
 * von 27135 Grad, was nach 75 Umlaeufen wieder genau auf dem Anfang landet:
 * Anfang und Ende des Bogens sind derselbe Punkt und der Pfad hat die Laenge
 * null. Sichtbar war davon nur die runde Strichkappe als kleiner Punkt.
 */
function punkt(cx, cy, r, pct) {
  const anteil = Math.max(0, Math.min(100, pct)) / 100;
  const a = ((135 + 270 * anteil) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

const R = 42; // Radius im 100x100-Koordinatensystem
const LEN = 2 * Math.PI * R * 0.75; // Bogenlaenge bei 270 Grad

export const GAUGE_CSS = `
  .gg { position: relative; flex: 0 0 auto; line-height: 0; }
  .gg svg { width: 100%; height: 100%; display: block; overflow: visible; }
  .gg .track {
    fill: none; stroke: var(--viz-border, #262c35); stroke-width: 9;
    stroke-linecap: round;
  }
  .gg .val {
    fill: none; stroke: var(--viz-accent, #ffb020); stroke-width: 9;
    stroke-linecap: round;
    stroke-dasharray: ${LEN.toFixed(2)};
    /* Wechselt der Wert, wandert der Bogen hin statt zu springen. */
    transition: stroke-dashoffset .6s ease, stroke .3s linear;
  }
  .gg.ok   .val { stroke: var(--viz-ok, #34c77b); }
  .gg.bad  .val { stroke: var(--viz-error, #ff5d5d); }
  /* Laeuft gerade etwas hinein (laden, fuellen), atmet der Bogen. */
  .gg.aktiv .val { animation: gg-puls 2.4s ease-in-out infinite; }
  @keyframes gg-puls { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
  @media (prefers-reduced-motion: reduce) {
    .gg .val { transition: none; }
    .gg.aktiv .val { animation: none; }
  }
  .gg .mark { stroke: var(--viz-text, #e8eaed); stroke-width: 2.4; opacity: .85; }
  /* Mitte: absolut ueber dem Bogen, damit der Text den Kreis nicht aufzieht. */
  .gg .mitte {
    position: absolute; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 1px; line-height: 1.05;
    text-align: center; padding: 0 14%;
  }
  .gg .gv { font-size: 1.9rem; font-weight: 600; letter-spacing: -0.02em; }
  .gg .gv .unit { font-size: .95rem; font-weight: 500; color: var(--viz-muted, #77808c); }
  .gg .gs {
    font-size: .68rem; color: var(--viz-muted, #77808c);
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
`;

/**
 * @param {object} o
 * @param {number|null} o.pct    Fuellstand 0..100 (null = nur die Bahn)
 * @param {number|null} [o.mark] Zielmarke in Prozent (Wunschlimit, Reserve)
 * @param {string} [o.wert]      Grosse Zahl in der Mitte (schon fertig gesetzt)
 * @param {string} [o.sub]       Kleine Zeile darunter
 * @param {string} [o.klasse]    "" | "ok" | "bad" - Farbe des Bogens
 * @param {boolean} [o.aktiv]    true = Bogen atmet (es laeuft etwas)
 * @param {number} [o.px]        Kantenlaenge in Pixeln (Default 132)
 */
export function ringGauge(o = {}) {
  const { pct = null, mark = null, wert = "", sub = "", klasse = "", aktiv = false, px = 132 } = o;
  const [ax, ay] = punkt(50, 50, R, 0);
  const [bx, by] = punkt(50, 50, R, 100);
  const bahn = `M${ax.toFixed(2)} ${ay.toFixed(2)} A${R} ${R} 0 1 1 ${bx.toFixed(2)} ${by.toFixed(2)}`;
  const off = pct === null ? LEN : LEN * (1 - Math.max(0, Math.min(100, pct)) / 100);

  let marke = "";
  if (mark !== null && mark >= 0 && mark <= 100) {
    const [ix, iy] = punkt(50, 50, R - 7, mark);
    const [ox, oy] = punkt(50, 50, R + 7, mark);
    marke = `<line class="mark" x1="${ix.toFixed(2)}" y1="${iy.toFixed(2)}"
                    x2="${ox.toFixed(2)}" y2="${oy.toFixed(2)}"/>`;
  }

  return `<div class="gg ${klasse}${aktiv ? " aktiv" : ""}"
               style="width:${px}px;height:${px}px">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path class="track" d="${bahn}"/>
        <path class="val" d="${bahn}" style="stroke-dashoffset:${off.toFixed(2)}"/>
        ${marke}
      </svg>
      <div class="mitte">
        ${wert ? `<span class="gv">${wert}</span>` : ""}
        ${sub ? `<span class="gs">${sub}</span>` : ""}
      </div>
    </div>`;
}
