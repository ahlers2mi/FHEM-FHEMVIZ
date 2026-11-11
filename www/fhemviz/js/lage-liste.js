/*
 * FHEMVIZ - Lage-Seite als Meldungsliste (ab v0.40.0, Skin "signal").
 *
 * Dieselbe Auswahl wie die Kachel-Fassung (attr showIf, Reihenfolge =
 * Prioritaet), aber anders gezeigt: die WICHTIGSTE Meldung steht als grosser
 * farbiger Block oben, alle weiteren als Zeilen darunter. Rechts Uhr, Datum
 * und der feste Teil aus showIf (z. B. der Kalender), unten leise die
 * Kennzahlen aus attr headerInfo.
 *
 * Aus der Ferne soll EIN Satz lesbar sein, nicht eine Kachel mit Name und
 * Zustand. Darum bekommt jeder showIf-Eintrag hinter "=>" wahlweise
 *
 *     geraet:bedingung => [stufe |] Satz [| Unterzeile]
 *
 *   stufe       rot | gelb | blau  (auch alarm/warn/info). Ohne Angabe folgt
 *               sie der vizStates-Farbe des Zustands, sonst blau.
 *               Mit ":symbol" dahinter (blau:alarm, oder nur :alarm) bekommt
 *               die Meldung ein Symbol aus icons.js, ohne dass am Geraet
 *               vizIcon gesetzt wird - bei Schaltern wuerde das deren Kachel
 *               auf allen anderen Seiten zur Symbol-Kachel machen.
 *   Satz        Platzhalter in eckigen Klammern:
 *                 [reading]            Reading des Geraets ("state" = Anzeige)
 *                 [reading:0]          als Zahl mit so vielen Nachkommastellen
 *                 [geraet/reading]     Reading eines ANDEREN Geraets
 *                 [alias]              Alias des Geraets
 *                 [heute] / [morgen]   Termintexte dieses Tages aus einer
 *                                      Terminliste ("DD.MM.YYYY HH:MM Text")
 *                 [seit]               "seit 18:12 Uhr" (siehe unten)
 *   Unterzeile  steht im Block klein unter dem Satz, in einer Zeile rechts.
 *               Ohne Angabe steht dort "seit …", mit "-" bleibt sie leer.
 *
 * Ohne Meldungsteil wird der Satz aus Alias und Zustand gebaut
 * ("Segmenttor: offen") - die Seite funktioniert also auch mit einem showIf
 * von vorher.
 *
 * "Seit wann" kann FHEM nicht liefern: der Zeitstempel eines Readings ist die
 * letzte MELDUNG, nicht der letzte WECHSEL (ein Fensterkontakt meldet "open"
 * alle paar Minuten erneut, eine Leistung im Sekundentakt). Die Seite merkt
 * sich darum selbst, wann eine Bedingung erstmals zutraf (localStorage, damit
 * es ein Neuladen uebersteht). Nur beim allerersten Blick auf eine schon
 * zutreffende Bedingung muss sie schaetzen: bei einem Textvergleich nimmt sie
 * den Zeitstempel des Readings, bei einem Zahlenvergleich (>, <) zeigt sie
 * lieber nichts als etwas Falsches.
 */

import { vizCondHit, vizPlain, vizStatesInfo } from "./widgets/base-widget.js";
import { ICONS, iconKey, iconSvg } from "./widgets/icons.js";

const STUFE = {
  rot: "rot", alarm: "rot", bad: "rot", red: "rot",
  gelb: "gelb", warn: "gelb", orange: "gelb",
  blau: "blau", info: "blau", blue: "blau",
};
const RANG = { rot: 0, gelb: 1, blau: 2 };

const WOCHENTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const WT_KURZ = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
const MONAT = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

// Ohne vizIcon am Geraet: neutrales Hinweis-Zeichen, damit die Zeile ihren
// farbigen Melder behaelt (die Farbe traegt die Stufe).
const SYM_HINWEIS = `<svg class="vicon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.4" r=".6"/></svg>`;
const SYM_OK = `<svg class="vicon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="8.5"/><path d="M8 12.4l2.8 2.8L16.2 9.6"/></svg>`;

const p2 = (n) => String(n).padStart(2, "0");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

/** Meldungsteil eines showIf-Eintrags (alles hinter "=>") zerlegen. */
export function parseMeldung(rechts) {
  const teile = String(rechts || "").split("|").map((t) => t.trim());
  let stufe = "";
  let icon = "";
  // Erstes Feld "stufe", "stufe:symbol" oder ":symbol" - nur wenn es GENAU
  // so aussieht; sonst ist es schon der Satz.
  const m = (teile[0] || "").toLowerCase().match(/^([a-z]*)(?::([a-z]+))?$/);
  if (m && (m[1] || m[2]) && (!m[1] || STUFE[m[1]]) && (!m[2] || ICONS[m[2]])) {
    stufe = STUFE[m[1]] || "";
    icon = m[2] || "";
    teile.shift();
  }
  return { stufe, icon, text: teile[0] || "", sub: teile.slice(1).join(" | ").trim() };
}

/* ------------------------------ seit wann ---------------------------------- */

const SEIT_KEY = "fhemviz.lage.seit";
let seit = null; // Schluessel -> ms (0 = unbekannt)
let ersterLauf = true;

function seitLaden() {
  if (seit) return;
  seit = new Map();
  try {
    const roh = JSON.parse(localStorage.getItem(SEIT_KEY) || "{}");
    for (const [k, v] of Object.entries(roh)) if (typeof v === "number") seit.set(k, v);
  } catch {
    /* kein localStorage (privater Modus) - dann eben nur bis zum Neuladen */
  }
}
function seitSichern() {
  try {
    localStorage.setItem(SEIT_KEY, JSON.stringify(Object.fromEntries(seit)));
  } catch {
    /* siehe oben */
  }
}
const seitSchluessel = (e) => `${e.name}|${e.cond}`;

/** Erstes echtes Reading einer Bedingung (ohne @hour/@wday) + Zahlenvergleich? */
function condReading(cond) {
  for (const teil of String(cond || "").split(/[,&]/)) {
    const m = teil.trim().match(/^([\w.:\-]+)\s*(>=|<=|!=|!~|==|=|~|>|<)/);
    if (m) return { reading: m[1], zahl: /^[<>]/.test(m[2]) };
  }
  return null;
}

function zeitMs(txt) {
  const m = String(txt || "").match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?/);
  if (!m) return 0;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
}

/**
 * Buch fuehren, seit wann jede Bedingung zutrifft. `alle` sind saemtliche
 * bedingten showIf-Eintraege - auch die, die gerade wegen maxTiles nicht
 * gezeigt werden: ihr Beginn soll stimmen, wenn sie nachruecken.
 */
function seitPflegen(store, alle, now) {
  seitLaden();
  const aktiv = new Set();
  let geaendert = false;
  for (const e of alle) {
    const dev = store.get(e.name);
    if (!dev || !e.cond || !vizCondHit(e.cond, dev, now)) continue;
    const k = seitSchluessel(e);
    aktiv.add(k);
    if (seit.has(k)) continue;
    const c = condReading(e.cond);
    let ms = 0;
    if (c && !(ersterLauf && c.zahl)) {
      const t = dev.times || {};
      const z = zeitMs(t[c.reading] || (c.reading === "state" ? t.STATE : ""));
      ms = z && z <= now.getTime() ? z : ersterLauf ? 0 : now.getTime();
    } else if (!ersterLauf) {
      ms = now.getTime();
    }
    seit.set(k, ms);
    geaendert = true;
  }
  for (const k of [...seit.keys()]) {
    if (!aktiv.has(k)) {
      seit.delete(k);
      geaendert = true;
    }
  }
  if (geaendert) seitSichern();
  ersterLauf = false;
}

/** "seit 18:12 Uhr" / "seit gestern" / "seit So." / "seit 06.11." / "". */
export function seitText(ms, now = new Date()) {
  if (!ms) return "";
  const d = new Date(ms);
  const tag = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const tage = Math.round((tag(now) - tag(d)) / 86400000);
  if (tage <= 0) return `seit ${p2(d.getHours())}:${p2(d.getMinutes())} Uhr`;
  if (tage === 1) return "seit gestern";
  if (tage < 7) return `seit ${WT_KURZ[d.getDay()]}`;
  return `seit ${p2(d.getDate())}.${p2(d.getMonth() + 1)}.`;
}

/* ------------------------------ Texte -------------------------------------- */

const aliasVon = (dev) => vizPlain((dev.attr && dev.attr.alias) || dev.name);

function rohwert(dev, reading) {
  if (!dev) return "";
  const r = dev.readings || {};
  if (reading === "state") return dev.state;
  if (reading === "STATE") return r.STATE ?? dev.state;
  return r[reading];
}

/** Termintexte eines Tages aus einer Terminliste ("DD.MM.YYYY HH:MM Text"). */
function termine(dev, tageVoraus, now) {
  const ziel = new Date(now.getFullYear(), now.getMonth(), now.getDate() + tageVoraus);
  const datum = `${p2(ziel.getDate())}.${p2(ziel.getMonth() + 1)}.${ziel.getFullYear()}`;
  return String(rohwert(dev, "STATE") ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .split("\n")
    .map((z) => z.trim().match(/^(\d{1,2}\.\d{1,2}\.\d{4})\s+\d{1,2}:\d{2}\s+(.+)$/))
    .filter((m) => m && m[1].replace(/\b(\d)\./g, "0$1.") === datum)
    .map((m) => m[2].replace(/\.$/, "").trim())
    .join(", ");
}

function platzhalter(vorlage, dev, store, ctx) {
  return String(vorlage || "").replace(/\[([^\[\]]+)\]/g, (ganz, innen) => {
    const m = innen.trim().match(/^(?:([\w.\-]+)\/)?([\w.\-]+)(?::(\d))?$/);
    if (!m) return ganz;
    const d = m[1] ? store.get(m[1]) : dev;
    if (!m[1]) {
      if (m[2] === "alias") return aliasVon(dev);
      if (m[2] === "seit") return ctx.seit;
      if (m[2] === "heute") return termine(dev, 0, ctx.now);
      if (m[2] === "morgen") return termine(dev, 1, ctx.now);
    }
    const v = vizPlain(rohwert(d, m[2]) ?? "");
    if (m[3] === undefined) return v;
    const zahl = parseFloat(v.replace(",", "."));
    return isNaN(zahl) ? v : zahl.toFixed(+m[3]).replace(".", ",");
  });
}

/** Bild fuer den Block: das Fahrzeugbild aus attr vizCar image=…, sonst "". */
function blockBild(dev) {
  const m = String((dev.attr || {}).vizCar || "").match(/(?:^|[\s,])image=([^\s,]+)/i);
  if (!m) return "";
  const map = {};
  let erstes = "";
  for (const teil of m[1].split("|")) {
    const z = teil.match(/^(laedt|steckt|frei)\s*:\s*(.+)$/i);
    const url = z ? z[2] : teil;
    if (z) map[z[1].toLowerCase()] = url;
    if (!erstes) erstes = url;
  }
  const url = map.frei || erstes;
  // Nur lokale bzw. http(s)-Adressen - der Wert landet in einem src-Attribut.
  return /^(\/|\.\/|https?:\/\/)[^\s"'<>]+$/i.test(url) ? url : "";
}

/** Einen Treffer in das aufloesen, was auf dem Schirm steht. */
function meldung(e, store, now) {
  const dev = store.get(e.name);
  const c = condReading(e.cond);
  const seitTxt = seitText(seit.get(seitSchluessel(e)) || 0, now);
  const ctx = { now, seit: seitTxt };

  // Zustand in Klartext (vizStates) - Grundlage fuer Rueckfall-Satz und Stufe.
  const rd = c ? c.reading : "state";
  const wert = vizPlain(rohwert(dev, rd) ?? "");
  const vs = /^state$/i.test(rd) ? vizStatesInfo((dev.attr || {}).vizStates, wert) : null;

  let stufe = e.stufe;
  if (!stufe) {
    const farbe = (vs && vs.color) || "";
    stufe = /error/.test(farbe) ? "rot" : /warn|accent/.test(farbe) ? "gelb" : "blau";
  }

  let text = platzhalter(e.text, dev, store, ctx).trim();
  if (!text) {
    const z = vs ? vs.text : wert;
    text = z && z.length <= 60 ? `${aliasVon(dev)}: ${z}` : aliasVon(dev);
  }
  const sub = e.sub === "-" ? "" : e.sub ? platzhalter(e.sub, dev, store, ctx).trim() : seitTxt;

  return { name: e.name, stufe, text, sub, icon: e.icon || iconKey(dev.attr) || "", bild: blockBild(dev) };
}

/* ------------------------------ Zeichnen ----------------------------------- */

function symbol(key) {
  return key ? iconSvg(key) : SYM_HINWEIS;
}

function blockHtml(m) {
  if (!m) {
    return `<div class="lg-erste ruhig">
      <div><p>Alles in Ordnung</p></div><span class="lg-sym">${SYM_OK}</span></div>`;
  }
  const rechts = m.bild
    ? `<img src="${esc(m.bild)}" alt="">`
    : `<span class="lg-sym">${symbol(m.icon)}</span>`;
  return `<div class="lg-erste ${m.stufe}${m.bild ? " bild" : ""}" data-geraet="${esc(m.name)}" data-symbol="${esc(m.icon)}">
    <div><p>${esc(m.text)}</p>${m.sub ? `<small>${esc(m.sub)}</small>` : ""}</div>${rechts}</div>`;
}

const zeileHtml = (m) =>
  `<li class="${m.stufe}" data-geraet="${esc(m.name)}" data-symbol="${esc(m.icon)}"><span class="lg-sym">${symbol(m.icon)}</span>` +
  `<p>${esc(m.text)}</p>${m.sub ? `<time>${esc(m.sub)}</time>` : ""}</li>`;

const mehrHtml = (n) =>
  `<li class="lg-mehr"><p>und ${n} weitere ${n === 1 ? "Meldung" : "Meldungen"}</p></li>`;

/**
 * Lage-Liste in `root` aufbauen. `h` kommt aus app.js:
 *   auswahl()      -> {fest, jetzt, mehr}   (lageAuswahl, inkl. maxTiles)
 *   kennzahlen()   -> [{label, wert, einheit, farbe}]  (attr headerInfo)
 *   fest(el, fest) -> zeichnet die festen Eintraege als Kacheln in el
 * Liefert {update} - der Aufrufer ruft es im Takt; neu gezeichnet wird nur,
 * was sich geaendert hat.
 */
export function renderLageListe(root, store, h) {
  root.innerHTML = `
    <div class="viz-lg">
      <section class="lg-haupt"><div class="lg-block"></div><ul class="lg-liste"></ul></section>
      <aside class="lg-seite">
        <div class="lg-uhr"></div><div class="lg-datum"></div><div class="lg-fest"></div>
      </aside>
      <footer class="lg-fuss"></footer>
    </div>`;
  const seite = root.querySelector(".viz-lg");
  const elBlock = seite.querySelector(".lg-block");
  const elListe = seite.querySelector(".lg-liste");
  const elUhr = seite.querySelector(".lg-uhr");
  const elDatum = seite.querySelector(".lg-datum");
  const elFest = seite.querySelector(".lg-fest");
  const elFuss = seite.querySelector(".lg-fuss");
  let sigLinks = null;
  let sigFuss = null;
  let sigFest = null;
  let masz = "";
  let rest = [];
  let mehr = 0;
  const zeichneListe = () => {
    elListe.innerHTML = rest.map(zeileHtml).join("") + (mehr ? mehrHtml(mehr) : "");
  };

  /** Alle Masse der Seite haengen an EINER Einheit: Entwurf 1280 x 800. */
  function einheit() {
    const u = Math.min(seite.clientWidth / 1280, seite.clientHeight / 800);
    const neu = `${seite.clientWidth}x${seite.clientHeight}`;
    if (!u || neu === masz) return false;
    masz = neu;
    seite.style.setProperty("--u", `${u.toFixed(4)}px`);
    return true;
  }

  function update() {
    if (!seite.isConnected) return;
    const now = new Date();
    const neuVermessen = einheit();

    elUhr.textContent = `${p2(now.getHours())}:${p2(now.getMinutes())}`;
    elDatum.textContent = `${WOCHENTAG[now.getDay()]}, ${now.getDate()}. ${MONAT[now.getMonth()]}`;

    const sel = h.auswahl();
    seitPflegen(store, sel.alle || sel.jetzt, now);

    // Stufe schlaegt Reihenfolge (rot vor gelb vor blau); innerhalb einer
    // Stufe gilt die Reihenfolge aus showIf. sort() ist stabil.
    const m = sel.jetzt
      .map((e) => meldung(e, store, now))
      .sort((a, b) => RANG[a.stufe] - RANG[b.stufe]);
    const sig = JSON.stringify([m, sel.mehr]);
    if (sig !== sigLinks || neuVermessen) {
      sigLinks = sig;
      elBlock.innerHTML = blockHtml(m[0]);
      rest = m.slice(1);
      mehr = sel.mehr || 0;
      zeichneListe();
    }
    // Passt die Liste nicht auf den Schirm, faellt von unten weg, was am
    // wenigsten wichtig ist - und die letzte Zeile sagt, wie viel fehlt.
    // Bei JEDEM Durchlauf geprueft, nicht nur nach dem Zeichnen: die Schrift
    // kommt nach dem ersten Bild und macht die Zeilen hoeher.
    while (rest.length && elListe.scrollHeight > elListe.clientHeight + 1) {
      rest.pop();
      mehr++;
      zeichneListe();
    }

    const festSig = sel.fest.map((e) => e.name).join(",");
    if (festSig !== sigFest) {
      sigFest = festSig;
      elFest.textContent = "";
      if (sel.fest.length) {
        h.fest(elFest, sel.fest);
        elFest.querySelectorAll(".viz-grid > *").forEach((w) => w.setAttribute("data-lage", "seite"));
      }
    }

    const k = h.kennzahlen().filter((x) => x.wert && x.wert !== "–");
    const fs = JSON.stringify(k);
    if (fs !== sigFuss) {
      sigFuss = fs;
      elFuss.innerHTML = k
        .map(
          (x) => `<span>${esc(x.label)}<b${x.farbe ? ` style="color:${esc(x.farbe)}"` : ""}>${esc(
            x.wert
          )}${x.einheit ? ` ${esc(x.einheit)}` : ""}</b></span>`
        )
        .join("");
    }
  }

  update();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
  return { update };
}
