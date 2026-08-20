/*
 * FHEMVIZ - responsives Auto-Layout mit Raum-Tabs (v0.7.0).
 * Aufbau rein aus Attributen: room -> Tab/Szene, group -> Karte, sortby ->
 * Reihenfolge, vizSize -> Kachel-Spannweite. Tablet: Tabs unten, ein Raum
 * sichtbar (oder "Alle"), Auswahl in localStorage. TV: keine Tabs, der
 * aktive Raum kommt von der Szenen-Rotation in app.js.
 *
 * Rausch-Filter (Konfiguration via 98_FHEMVIZ.pm, get config):
 *   hideRooms  - Raeume, die nicht als Tabs/Abschnitte erscheinen
 *   hideTypes  - FHEM-TYPEs ohne Kachel (SVG, FileLog, notify, at, ...)
 *   hideStates - Geraete mit bedeutungslosem state (???, initialized, ...)
 * Ein Geraet mit gesetztem vizWidget-Attribut wird IMMER gezeigt.
 */

import { createWidget } from "./widgets/registry.js";

// Sentinel fuer den "Alle Raeume"-Tab (kollidiert nicht mit Raumnamen).
export const ALL_ROOMS = "*";
const LS_ACTIVE_ROOM = "fhemviz.activeRoom";

// FHEM erlaubt mehrere Raeume/Gruppen kommasepariert an EINEM Geraet.
function splitAttr(v) {
  return String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Kommaseparierte Regex-Liste -> Array kompilierter RegExp (Volltreffer,
// case-insensitive). Ungueltige Eintraege werden still ignoriert.
function compileRegexList(spec, fallback) {
  return String(spec ?? fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => {
      try {
        return new RegExp("^(?:" + p + ")$", "i");
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Konvention: Raeume unter "FHEMVIZ->" sind reine Dashboard-Raeume
// (z. B. FHEMVIZ->Termine). In FHEMWEB bleiben sie als Hierarchie
// zusammengeklappt; hier wird der Praefix in der Anzeige entfernt und
// Kurznamen (z. B. in tvScenes) werden automatisch aufgeloest.
export let VIZ_ROOM_PREFIX = "FHEMVIZ->";

/**
 * Praefix dieser Sicht setzen (attr <viz> roomPrefix). Eine zweite Sicht - z. B.
 * eine Gaeste-Seite - arbeitet mit eigenen Raeumen ("Opa->Wohnzimmer") und soll
 * sie trotzdem als "Wohnzimmer" anzeigen. Modulweite Variable, weil pro
 * Seitenaufruf genau EIN FHEMVIZ-Geraet dargestellt wird; ES-Module-Importe
 * sind lebende Bindungen, die Leser sehen den neuen Wert also sofort.
 */
export function setRoomPrefix(p) {
  VIZ_ROOM_PREFIX = String(p ?? "FHEMVIZ->");
}

// Anzeige der FHEM-Raumhierarchie "System->MQTT" als "System › MQTT";
// der FHEMVIZ->-Praefix wird ganz ausgeblendet.
function displayRoom(room) {
  const r = room.startsWith(VIZ_ROOM_PREFIX)
    ? room.slice(VIZ_ROOM_PREFIX.length)
    : room;
  return r.replace(/->/g, " › ");
}

/** Loest einen (Kurz-)Namen auf einen vorhandenen Raum auf, sonst null. */
export function resolveRoom(roomNames, name) {
  if (!name) return null;
  if (roomNames.includes(name)) return name;
  const prefixed = VIZ_ROOM_PREFIX + name;
  if (roomNames.includes(prefixed)) return prefixed;
  return null;
}

// Klartext eines states (HTML-Markup entfernen) fuer den hideStates-Filter.
function plainState(s) {
  return String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sortKey(dev) {
  const a = dev.attr || {};
  return (a.sortby || a.alias || dev.name).toLowerCase();
}

// vizHero: Geraet als breiter Blickfang oben im Raum (aus dem Raster geloest).
function isHero(dev) {
  return /^(1|true|yes|on|2|full|voll)$/i.test(String((dev.attr || {}).vizHero || ""));
}

/**
 * vizHero full: der Blickfang nimmt die SICHTBARE FLAECHE ein statt nur eine
 * Bandzeile. Auf dem Fernseher ist die Kachel damit die Seite - die Gruppen
 * darunter werden ausgeblendet, weil sie ohnehin nur angeschnitten wuerden
 * (dort wird nie gescrollt). Auf Tablet/Handy fuellt sie den ersten Schirm,
 * der Rest des Raums steht darunter und bleibt erreichbar.
 *
 * "full" ist der EINE dokumentierte Name - genau so steht er auch in der
 * Werteliste des Attributs. "2" und "voll" werden still mitgenommen, damit
 * ein frueher von Hand gesetzter Wert nicht ploetzlich als "kein Hero"
 * gelesen wird; angeboten werden sie nicht.
 */
function isHeroFull(dev) {
  return /^(2|full|voll)$/i.test(String((dev.attr || {}).vizHero || ""));
}

/*
 * Schluessel JE SICHT: zwei FHEMVIZ-Geraete (Haupt-Dashboard und z. B. eine
 * Gaeste-Seite) liefen im selben Browser sonst auf denselben Eintrag. Wer in
 * der Gaeste-Seite "Wohnzimmer" antippte, fand im Haupt-Dashboard danach den
 * Raum "Opa->Wohnzimmer" gespeichert - der dort nicht existiert, also fiel es
 * auf "Alle" zurueck. Die Raumwahl der beiden Seiten hat sich damit
 * gegenseitig ueberschrieben.
 */
function roomKey(opts) {
  return opts && opts.viz ? `${LS_ACTIVE_ROOM}:${opts.viz}` : LS_ACTIVE_ROOM;
}

function loadActiveRoom(opts) {
  try {
    const k = roomKey(opts);
    // Rueckfall auf den alten, gemeinsamen Schluessel (Bestandsinstallationen).
    return localStorage.getItem(k) || localStorage.getItem(LS_ACTIVE_ROOM) || ALL_ROOMS;
  } catch {
    return ALL_ROOMS;
  }
}

function saveActiveRoom(room, opts) {
  try {
    localStorage.setItem(roomKey(opts), room);
  } catch {
    /* localStorage nicht verfuegbar - Auswahl gilt nur fuer die Sitzung */
  }
}

/**
 * Baut die gefilterte Raum-Struktur: Map(room -> Map(group -> devices[])).
 */
function buildRooms(store, opts) {
  // Whitelist: ist showRooms gesetzt, erscheinen NUR passende Raeume und
  // Geraete ohne passenden Raum entfallen ganz (kein "Weitere"-Fallback).
  const showRooms = compileRegexList(opts.showRooms, "");
  const hideRooms = compileRegexList(opts.hideRooms, "hidden");
  const hideStates = compileRegexList(opts.hideStates, "");
  const hideTypes = new Set(
    String(opts.hideTypes || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const rooms = new Map();

  for (const dev of store.all()) {
    const attr = dev.attr || {};
    // Im Editiermodus bleiben ausgeblendete Kacheln sichtbar (gedimmt) - sonst
    // koennte man sie nicht wieder einblenden.
    if (!opts.edit && /^(1|true|yes)$/i.test(String(attr.vizHide || ""))) continue;

    // Rausch-Filter - ausser der Nutzer erzwingt die Kachel via
    // vizWidget oder hat den Inhalt via vizReadings konfiguriert.
    if (!attr.vizWidget && !attr.vizReadings) {
      const type = (dev.internals && dev.internals.TYPE) || "";
      if (hideTypes.has(type)) continue;
      // Ein structure ist NIE Rauschen: es existiert nur, weil jemand es
      // angelegt hat, und die Gruppen-Kachel holt ihren Inhalt aus den
      // Mitgliedern. Frisch angelegt (oder bei gemischten Zustaenden) ist der
      // eigene state aber leer - damit fiel die Kachel still unter den Tisch
      // und man suchte den Fehler bei Raum und devspec. hideTypes/hideStates
      // gelten weiter, wenn sie ausdruecklich gesetzt sind.
      if (type !== "structure") {
        const st = plainState(dev.state);
        if (st === "" || hideStates.some((re) => re.test(st))) continue;
      } else if (hideStates.length) {
        const st = plainState(dev.state);
        if (st !== "" && hideStates.some((re) => re.test(st))) continue;
      }
    }

    // Ein Geraet kann in mehreren Raeumen UND Gruppen liegen -> es erscheint
    // in jeder Raum/Gruppe-Kombination (wie in FHEMWEB).
    let devRooms = splitAttr(attr.room);
    if (devRooms.length === 0) devRooms = ["Unsortiert"];
    if (showRooms.length) {
      // Whitelist aktiv: nur passende Raeume, sonst Geraet komplett weg.
      devRooms = devRooms.filter((r) => showRooms.some((re) => re.test(r)));
      if (devRooms.length === 0) continue;
    }
    devRooms = devRooms.filter((r) => !hideRooms.some((re) => re.test(r)));
    // Liegt das Geraet NUR in ausgeblendeten Raeumen, trotzdem zeigen:
    // das devspec hat es explizit ausgewaehlt (nur ohne Whitelist).
    if (devRooms.length === 0) {
      if (showRooms.length) continue;
      devRooms = ["Weitere"];
    }
    // vizGroup uebersteuert group NUR im Dashboard (FHEMWEB bleibt wie es
    // ist). "-" oder "keine" loest die Gruppierung auf -> "Allgemein".
    const vizGroup = String(attr.vizGroup || "").trim();
    let devGroups;
    if (/^(-|keine|none)$/i.test(vizGroup)) {
      devGroups = [];
    } else {
      const vg = splitAttr(vizGroup);
      devGroups = vg.length ? vg : splitAttr(attr.group);
    }
    if (devGroups.length === 0) devGroups = ["Allgemein"];

    for (const room of devRooms) {
      if (!rooms.has(room)) rooms.set(room, new Map());
      const groups = rooms.get(room);
      for (const group of devGroups) {
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(dev);
      }
    }
  }
  return rooms;
}

/** Sortierte Liste der sichtbaren Raumnamen (fuer die TV-Szenen-Rotation). */
export function collectRooms(store, opts = {}) {
  return [...buildRooms(store, opts).keys()].sort((a, b) =>
    displayRoom(a).localeCompare(displayRoom(b))
  );
}


/* ------------------------------ Editiermodus ------------------------------ */
/*
 * Der Editiermodus (?edit=1) schreibt genau die Attribute, aus denen das
 * Layout ohnehin gebaut wird - es gibt keinen zweiten Speicher:
 *   Reihenfolge  sortby (10, 20, 30 … mit Luecken fuer spaetere Einschuebe)
 *   Groesse      vizSize
 *   Blickfang    vizHero
 *   Ausblenden   vizHide
 *   Tab          room  (NUR der FHEMVIZ->-Eintrag, siehe editRoomList)
 *   Abschnitt    vizGroup
 * FHEM haelt Attribute nur im Speicher - darum der Speichern-Knopf (save).
 */
const SIZES = ["", "2x1", "1x2", "2x2"]; // "" = 1x1 (Attribut geloescht)
// Raumnamen, die buildRooms selbst erfindet - keine echten Attributwerte und
// darum auch keine Umzugsziele.
const SYNTH_ROOMS = new Set(["Weitere", "Unsortiert"]);
const DEFAULT_GROUP = "Allgemein";
let editDirty = false; // ungespeicherte Attributaenderungen
let editNote = null; // { text, undo } - Hinweis in der Leiste, z. B. nach Umzug

/**
 * attr/deleteattr schicken und die Sicht sofort nachziehen.
 * @param {object} [note] - Hinweis fuer die Leiste ({text, undo}); jeder
 *        Aufruf ohne Hinweis loescht einen alten (er waere sonst veraltet).
 */
async function editSet(ctx, devName, attr, value, note) {
  const { client, store } = ctx;
  if (!client) return false;
  const cmd =
    value === null ? `deleteattr ${devName} ${attr}` : `attr ${devName} ${attr} ${value}`;
  try {
    await client.command(cmd);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("FHEMVIZ Editiermodus:", cmd, e && e.message);
    return false;
  }
  store.patchAttr(devName, attr, value);
  editDirty = true;
  editNote = note || null;
  ctx.rerender();
  return true;
}

/**
 * Einen Eintrag in einer FHEM-Kommaliste ersetzen (Rest bleibt unangetastet).
 * Genau darum geht es beim Raumwechsel: an den Geraeten haengen neben dem
 * FHEMVIZ->-Raum meist noch Homebridge, System->… und die FHEMWEB-Raeume -
 * ein blankes Ueberschreiben von "room" wuerde die alle wegwerfen.
 * Steht der alte Wert nicht in der Liste (synthetischer Raum wie "Weitere"),
 * wird der neue angehaengt.
 */
function editReplaceInList(value, alt, neu) {
  const liste = splitAttr(value);
  const i = alt ? liste.indexOf(alt) : -1;
  if (i >= 0) liste[i] = neu;
  else liste.push(neu);
  return [...new Set(liste.filter(Boolean))].join(",");
}

/** Alle vorhandenen FHEMVIZ->-Raeume als Umzugsziele (inkl. ausgeblendeter). */
function editRoomList(store) {
  const s = new Set();
  for (const dev of store.all()) {
    for (const r of splitAttr((dev.attr || {}).room)) {
      if (r.startsWith(VIZ_ROOM_PREFIX)) s.add(r);
    }
  }
  return [...s].sort((a, b) => displayRoom(a).localeCompare(displayRoom(b)));
}

/**
 * Kleines Auswahlmenue an der Kachel (Raum/Gruppe). Bewusst kein <select>:
 * das laesst sich weder mit einem eigenen Eingabefeld fuer neue Namen
 * kombinieren noch am Tablet zuverlaessig scrollen (siehe v0.34.30).
 */
function editMenu(item, knopf, eintraege, neu) {
  const alt = item.querySelector(".ve-menu");
  if (alt) {
    alt.remove();
    item.classList.remove("ve-open");
    if (alt.dataset.fuer === knopf.className) return; // gleicher Knopf: zu
  }
  const menu = document.createElement("div");
  menu.className = "ve-menu";
  menu.dataset.fuer = knopf.className;
  // Das offene Menue ueberlappt die Nachbarkacheln - die Klasse hebt NUR diesen
  // Rahmen im Stapel an (kein :has(), das muss auch im Tablet-Browser laufen).
  const zu = () => {
    menu.remove();
    item.classList.remove("ve-open");
  };
  for (const e of eintraege) {
    const b = document.createElement("button");
    b.className = "ve-mi" + (e.aktiv ? " on" : "");
    b.textContent = e.label;
    if (e.hinweis) b.title = e.hinweis;
    b.addEventListener("click", () => {
      zu();
      e.run();
    });
    menu.appendChild(b);
  }
  if (neu) {
    const zeile = document.createElement("div");
    zeile.className = "ve-mnew";
    const feld = document.createElement("input");
    feld.type = "text";
    feld.placeholder = neu.placeholder || "Neuer Name";
    const ok = document.createElement("button");
    ok.className = "ve-btn";
    ok.textContent = "OK";
    const los = () => {
      const v = feld.value.trim();
      if (!v) return;
      zu();
      neu.run(v);
    };
    ok.addEventListener("click", los);
    feld.addEventListener("keydown", (e) => {
      if (e.key === "Enter") los();
    });
    zeile.append(feld, ok);
    menu.appendChild(zeile);
  }
  // Klick daneben schliesst - erst im naechsten Tick anmelden, sonst faengt
  // der Listener noch den Klick ab, der das Menue gerade geoeffnet hat.
  setTimeout(() => {
    const daneben = (ev) => {
      // Schon weg (anderer Knopf, Neuaufbau)? Dann nur abmelden.
      if (!menu.isConnected) {
        document.removeEventListener("pointerdown", daneben, true);
        return;
      }
      if (menu.contains(ev.target) || knopf.contains(ev.target)) return;
      zu();
      document.removeEventListener("pointerdown", daneben, true);
    };
    document.addEventListener("pointerdown", daneben, true);
  }, 0);
  item.appendChild(menu);
  item.classList.add("ve-open");
}

/** Reihenfolge der Kacheln eines Rasters als sortby festschreiben. */
function editWriteOrder(ctx, grid) {
  const items = [...grid.querySelectorAll(":scope > .viz-edit-item")];
  items.forEach((it, i) => {
    const soll = String((i + 1) * 10);
    if (String(it.dataset.sortby || "") !== soll) {
      editSet(ctx, it.dataset.dev, "sortby", soll);
    }
  });
}

/**
 * Ziehen mit Pointer-Events (kein HTML5-Drag&Drop): das laeuft auf dem
 * Wandtablet genauso wie mit der Maus. Umsortiert wird live per insertBefore,
 * geschrieben erst beim Loslassen.
 */
function editBindDrag(ctx, griff, item, grid) {
  griff.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    griff.setPointerCapture(e.pointerId);
    item.classList.add("ve-dragging");

    // Einsortieren an der aktuellen Zeigerposition.
    const sortiere = (x, y) => {
      let unter = document.elementFromPoint(x, y)?.closest(".viz-edit-item");
      if (!unter || unter.parentElement !== grid) {
        // Zeiger liegt in einer Luecke oder ueber einer Leiste (am Handy sind
        // die unteren ~70px die Raum-Leiste, genau die Zone zum Mitscrollen).
        // Dann die naechstgelegene Kachel des Rasters nehmen, sonst waere ein
        // Ablegen am Bildrand unmoeglich.
        let dist = Infinity;
        unter = null;
        for (const f of grid.querySelectorAll(":scope > .viz-edit-item")) {
          if (f === item) continue;
          const r = f.getBoundingClientRect();
          const d =
            (r.left + r.width / 2 - x) ** 2 + (r.top + r.height / 2 - y) ** 2;
          if (d < dist) {
            dist = d;
            unter = f;
          }
        }
      }
      if (!unter || unter === item) return;
      const r = unter.getBoundingClientRect();
      // Mitte des Ziels entscheidet, ob davor oder dahinter eingefuegt wird.
      const davor = y < r.top + r.height / 2;
      grid.insertBefore(item, davor ? unter : unter.nextSibling);
    };

    // Am Rand mitscrollen: der Zeiger ist gefangen und touch-action steht auf
    // none, die Seite scrollt also waehrend des Ziehens nicht von selbst. Ohne
    // das liesse sich eine Kachel nur innerhalb des sichtbaren Ausschnitts
    // umsortieren - am Handy sind das drei Kacheln.
    const RAND = 90;
    let richtung = 0;
    let ticker = null;
    let zeiger = { x: 0, y: 0 };
    const rollen = () => {
      if (!richtung) {
        ticker = null;
        return;
      }
      window.scrollBy(0, richtung * 16);
      sortiere(zeiger.x, zeiger.y); // beim Rollen kommen keine Zeigerereignisse
      ticker = requestAnimationFrame(rollen);
    };

    const move = (ev) => {
      zeiger = { x: ev.clientX, y: ev.clientY };
      sortiere(ev.clientX, ev.clientY);
      const hoehe = window.innerHeight;
      richtung = ev.clientY < RAND ? -1 : ev.clientY > hoehe - RAND ? 1 : 0;
      if (richtung && !ticker) ticker = requestAnimationFrame(rollen);
    };
    const up = () => {
      richtung = 0;
      if (ticker) cancelAnimationFrame(ticker);
      griff.removeEventListener("pointermove", move);
      griff.removeEventListener("pointerup", up);
      griff.removeEventListener("pointercancel", up);
      item.classList.remove("ve-dragging");
      editWriteOrder(ctx, grid);
    };
    griff.addEventListener("pointermove", move);
    griff.addEventListener("pointerup", up);
    griff.addEventListener("pointercancel", up);
  });
}

/**
 * Kachel in einen Rahmen mit Werkzeugleiste packen.
 * @param {object} platz - {room, group}: WO diese Kachel gerade steht. Ein
 *        Geraet kann in mehreren Raeumen/Gruppen liegen - umgezogen wird
 *        gezielt dieses Vorkommen, die anderen bleiben stehen.
 */
function editWrap(widget, dev, grid, ctx, platz = {}) {
  const attr = dev.attr || {};
  const item = document.createElement("div");
  item.className = "viz-edit-item";
  item.dataset.dev = dev.name;
  item.dataset.sortby = attr.sortby || "";
  // vizSize-Spannweite gilt fuer den RAHMEN - er ist jetzt das Rasterelement.
  const size = String(attr.vizSize || "");
  if (/^2/.test(size)) item.style.gridColumn = "span 2";
  if (/2$/.test(size)) item.style.gridRow = "span 2";
  widget.style.gridColumn = "";
  widget.style.gridRow = "";

  const versteckt = /^(1|true|yes)$/i.test(String(attr.vizHide || ""));
  if (versteckt) item.classList.add("ve-hidden");

  const tools = document.createElement("div");
  tools.className = "viz-edit-tools";
  const knopf = (cls, text, titel) => {
    const b = document.createElement("button");
    b.className = "ve-btn " + cls;
    b.textContent = text;
    b.title = titel;
    tools.appendChild(b);
    return b;
  };

  const griff = knopf("ve-drag", "⠿", "Ziehen: Reihenfolge (schreibt sortby)");
  const bSize = knopf("ve-size", size || "1x1", "Größe (vizSize)");
  // Im Zeilen-Layout gibt es nur eine Spalte - vizSize bleibt dort wirkungslos.
  if (ctx.skin === "zeilen") {
    bSize.disabled = true;
    bSize.title = "Größe wirkt im Streifen-Layout nicht (eine Spalte)";
  }
  const bHero = knopf(
    "ve-hero" + (/^(1|true|yes|on)$/i.test(String(attr.vizHero || "")) ? " on" : ""),
    "Hero",
    "Blickfang oben im Raum (vizHero)"
  );
  const bHide = knopf(
    "ve-hide",
    versteckt ? "Einblenden" : "Ausblenden",
    "Kachel ausblenden (vizHide)"
  );
  const bRoom = knopf("ve-room", "Raum", "In einen anderen Tab verschieben (room)");
  const bGroup = knopf("ve-group", "Gruppe", "In einen anderen Abschnitt verschieben (vizGroup)");
  const bReset = knopf("ve-reset", "↺", "Zurücksetzen: vizSize, vizHero, vizHide, sortby");

  // --- Raum: nur den FHEMVIZ->-Eintrag dieses Vorkommens austauschen.
  // Bei einem erfundenen Raum ("Weitere": das Geraet liegt nur in einem per
  // hideRooms versteckten Raum) gibt es keinen Eintrag zum Ersetzen - dann
  // wird der neue Raum ANGEHAENGT. Das ist hier auch das Richtige: die
  // Mitgliedschaft in FHEMVIZ->Stuff ist Absicht (Gruppen-Kacheln loesen ihre
  // Mitglieder ueber das devspec auf) und darf nicht verschwinden.
  const raumAlt = SYNTH_ROOMS.has(platz.room) ? null : platz.room || null;
  bRoom.addEventListener("click", () => {
    const ziele = ctx.raeume();
    const umzug = (ziel) => {
      if (ziel === platz.room) return; // schon da - kein sinnloses attr
      const neu = editReplaceInList(attr.room, raumAlt, ziel);
      const vorher = attr.room;
      editSet(ctx, dev.name, "room", neu, {
        text: `${attr.alias || dev.name} → ${displayRoom(ziel)}${
          ctx.istVersteckt(ziel) ? " (ausgeblendeter Raum)" : ""
        }`,
        undo: () =>
          editSet(ctx, dev.name, "room", vorher === undefined ? null : vorher),
      });
    };
    editMenu(
      item,
      bRoom,
      ziele.map((r) => ({
        label: displayRoom(r) + (ctx.istVersteckt(r) ? " ·" : ""),
        aktiv: r === platz.room,
        hinweis: ctx.istVersteckt(r)
          ? `${r} - per hideRooms ausgeblendet: die Kachel verschwindet aus dem Raster`
          : r,
        run: () => umzug(r),
      })),
      { placeholder: "Neuer Raum", run: (v) => umzug(VIZ_ROOM_PREFIX + v) }
    );
  });

  // --- Gruppe: geschrieben wird vizGroup, nicht group. group nutzen bei FHEM
  // auch andere (Homebridge, eigene Listen) - das Dashboard soll das nicht
  // umstellen. Basisliste ist vizGroup, sonst group (damit ein zweiter
  // Gruppeneintrag beim Umzug nicht verloren geht).
  bGroup.addEventListener("click", () => {
    const basis = String(attr.vizGroup || "").trim() ? attr.vizGroup : attr.group;
    const vorher = attr.vizGroup;
    const grpAlt = platz.group === DEFAULT_GROUP ? null : platz.group || null;
    const setzen = (wert, text) =>
      editSet(ctx, dev.name, "vizGroup", wert, {
        text,
        undo: () =>
          editSet(ctx, dev.name, "vizGroup", vorher === undefined ? null : vorher),
      });
    const umzug = (ziel) => {
      if (ziel === platz.group) return; // schon da - kein sinnloses attr
      setzen(
        editReplaceInList(basis, grpAlt, ziel),
        `${attr.alias || dev.name} → Abschnitt „${ziel}“`
      );
    };
    const eintraege = ctx.gruppen(platz.room).map((g) => ({
      label: g,
      aktiv: g === platz.group,
      run: () => umzug(g),
    }));
    // "-" loest die Gruppierung auf (siehe buildRooms) -> Abschnitt Allgemein.
    eintraege.push({
      label: "ohne Abschnitt",
      aktiv: /^(-|keine|none)$/i.test(String(attr.vizGroup || "")),
      hinweis: 'vizGroup "-" - die Kachel landet unter Allgemein',
      run: () => setzen("-", `${attr.alias || dev.name} → ohne Abschnitt`),
    });
    if (attr.vizGroup !== undefined) {
      eintraege.push({
        label: "Standard (group)",
        hinweis: "vizGroup löschen - es gilt wieder das FHEM-Attribut group",
        run: () =>
          setzen(null, `${attr.alias || dev.name} → wieder nach group sortiert`),
      });
    }
    editMenu(item, bGroup, eintraege, {
      placeholder: "Neuer Abschnitt",
      run: (v) => umzug(v),
    });
  });

  editBindDrag(ctx, griff, item, grid);
  bSize.addEventListener("click", () => {
    const i = SIZES.indexOf(size);
    const next = SIZES[(i < 0 ? 0 : i + 1) % SIZES.length];
    editSet(ctx, dev.name, "vizSize", next || null);
  });
  bHero.addEventListener("click", () =>
    editSet(
      ctx,
      dev.name,
      "vizHero",
      /^(1|true|yes|on)$/i.test(String(attr.vizHero || "")) ? null : "1"
    )
  );
  bHide.addEventListener("click", () =>
    editSet(ctx, dev.name, "vizHide", versteckt ? null : "1")
  );
  bReset.addEventListener("click", async () => {
    for (const a of ["vizSize", "vizHero", "vizHide", "sortby"]) {
      if (attr[a] !== undefined) await editSet(ctx, dev.name, a, null);
    }
  });

  item.appendChild(tools);
  item.appendChild(widget);
  return item;
}

/** Leiste oben: Hinweis, Speichern, Fertig. */
function editBar(ctx) {
  const bar = document.createElement("div");
  bar.className = "viz-editbar";
  const info = document.createElement("span");
  info.className = "ve-info";
  // Nach einem Umzug ist die Kachel nicht mehr im Bild (sie steht jetzt in
  // einem anderen Tab/Abschnitt) - ohne diesen Hinweis wirkt das wie ein
  // Fehler. Darum: was ist wohin gewandert, und ein Weg zurueck.
  info.textContent = editNote
    ? editNote.text
    : editDirty
      ? "geändert – noch nicht gespeichert"
      : "Änderungen wirken sofort";
  if (editNote) info.classList.add("ve-moved");
  const save = document.createElement("button");
  save.className = "ve-btn ve-save";
  save.textContent = "Speichern";
  save.title = "save: Attribute dauerhaft in die FHEM-Konfiguration schreiben";
  save.addEventListener("click", async () => {
    try {
      await ctx.client.command("save");
      editDirty = false;
      info.textContent = "gespeichert";
    } catch (e) {
      info.textContent = "Speichern fehlgeschlagen";
    }
  });
  const exit = document.createElement("button");
  exit.className = "ve-btn ve-exit";
  exit.textContent = "Fertig";
  exit.addEventListener("click", () => ctx.exit());
  let zurueck = null;
  if (editNote && editNote.undo) {
    zurueck = document.createElement("button");
    zurueck.className = "ve-btn ve-undo";
    zurueck.textContent = "Rückgängig";
    zurueck.title = "Den Umzug zurücknehmen (schreibt den alten Attributwert)";
    zurueck.addEventListener("click", () => editNote.undo());
  }
  bar.append(
    Object.assign(document.createElement("strong"), { textContent: "Bearbeiten" }),
    info,
    ...(zurueck ? [zurueck] : []),
    save,
    exit
  );
  return bar;
}

/**
 * Rendert (optional Tab-Leiste +) Geraete des aktiven Raums in den Container.
 * @param {HTMLElement} root
 * @param {import("./store.js").Store} store
 * @param {object} client - FhemClient (fuer set-Befehle)
 * @param {object} [opts] - { hideRooms, hideTypes, hideStates, activeRoom,
 *                            showTabs=true, readonly=false, tv=false }
 */
export function renderLayout(root, store, client, opts = {}) {
  const showTabs = opts.showTabs !== false;
  const rooms = buildRooms(store, opts);
  // Editiermodus: im TV-/readonly-Betrieb gesperrt - ein Wischen am
  // Wandtablet soll nicht das Layout verschieben.
  const edit = !!opts.edit && !opts.readonly && !opts.tv;
  const editHidden = edit ? compileRegexList(opts.hideRooms, "hidden") : [];
  const editCtx = edit
    ? {
        client,
        store,
        skin: opts.skin || "",
        rerender: () => renderLayout(root, store, client, opts),
        exit: () => (opts.onExitEdit ? opts.onExitEdit() : null),
        // Umzugsziele: alle vorhandenen FHEMVIZ->-Raeume, auch die per
        // hideRooms ausgeblendeten (FHEMVIZ->Stuff ist ein uebliches Ziel).
        raeume: () => editRoomList(store),
        istVersteckt: (r) => editHidden.some((re) => re.test(r)),
        gruppen: (room) => [...(rooms.get(room) || new Map()).keys()].sort(),
      }
    : null;

  // Scrollposition der Tab-Leiste ueber den Neuaufbau retten: die Leiste wird
  // bei jedem renderLayout komplett neu erzeugt und startet sonst wieder bei 0.
  // Ein Klick auf einen weit rechts liegenden Raum sprang damit zurueck an den
  // linken Anfang (im bento-Querformat, wo die Leiste eine Schiene ist: nach
  // oben) - der gerade gewaehlte Tab war anschliessend nicht mehr zu sehen.
  const altNav = root.querySelector(".viz-tabs");
  const navScroll = altNav
    ? { x: altNav.scrollLeft, y: altNav.scrollTop }
    : null;

  root.textContent = "";

  const roomNames = [...rooms.keys()].sort((a, b) =>
    displayRoom(a).localeCompare(displayRoom(b))
  );
  if (roomNames.length === 0) {
    const empty = document.createElement("p");
    empty.className = "viz-status";
    empty.textContent = "Keine Geraete in der Sicht (devspec/Filter pruefen).";
    root.appendChild(empty);
    return;
  }

  // Aktiver Raum: explizit uebergeben > gemerkt > "Alle".
  let active = opts.activeRoom ?? loadActiveRoom(opts);
  if (active !== ALL_ROOMS) active = resolveRoom(roomNames, active) ?? ALL_ROOMS;

  // Tab-Leiste bauen, aber ERST NACH dem Rauminhalt einhaengen: unter
  // ?zoom sind die Tabs sticky (transform bricht position:fixed), und
  // sticky wirkt nur, wenn das Element am ENDE des Flusses steht - sonst
  // klebt die Raumwahl oben statt unten.
  let nav = null;
  if (showTabs) {
    nav = document.createElement("nav");
    nav.className = "viz-tabs";
    for (const name of [ALL_ROOMS, ...roomNames]) {
      const tab = document.createElement("button");
      tab.className = "viz-tab" + (name === active ? " active" : "");
      tab.textContent = name === ALL_ROOMS ? "Alle" : displayRoom(name);
      tab.addEventListener("click", () => {
        saveActiveRoom(name, opts);
        renderLayout(root, store, client, { ...opts, activeRoom: name });
      });
      nav.appendChild(tab);
    }
  }

  const widgetOpts = { readonly: !!opts.readonly, tv: !!opts.tv };
  const shownRooms = active === ALL_ROOMS ? roomNames : [active];

  // Wie viele Spalten passen tatsaechlich in die Containerbreite?
  // (Mindest-Kachelbreite + Luecke aus den CSS-Variablen). Unter ?zoom=
  // ist die Layout-Breite Bildschirm/Zoom - ohne diesen Deckel wuerde ein
  // breites Raster rechts ueberstehen.
  const cs = getComputedStyle(root);
  const tileMin = parseFloat(cs.getPropertyValue("--viz-tile-min")) || 220;
  const gap = parseFloat(cs.getPropertyValue("--viz-gap")) || 14;
  const avail =
    root.clientWidth -
    (parseFloat(cs.paddingLeft) || 0) -
    (parseFloat(cs.paddingRight) || 0);
  const fitCols = Math.max(1, Math.floor((avail + gap) / (tileMin + gap)));

  for (const room of shownRooms) {
    const groups = rooms.get(room);
    const roomEl = document.createElement("section");
    roomEl.className = "viz-room";

    // Raum-Ueberschrift nur, wenn mehrere Raeume zu sehen sind (im
    // Einzel-Tab/in der TV-Szene ist der Raumname bereits im Tab/Header).
    if (active === ALL_ROOMS) {
      const h2 = document.createElement("h2");
      h2.textContent = displayRoom(room);
      roomEl.appendChild(h2);
    }

    // Hero-Band: als vizHero markierte Geraete laufen breit und gross ganz
    // oben (aus dem Raster herausgeloest, kein Doppel-Rendern). Ueber alle
    // Gruppen des Raums eingesammelt und nach Name dedupliziert.
    const heroSeen = new Set();
    const heroDevs = [];
    // Aus welcher Gruppe kam die Hero-Kachel? Nur fuer den Editiermodus, damit
    // der Gruppen-Umzug auch dort das richtige Vorkommen erwischt.
    const heroGroup = new Map();
    for (const [group, devs] of groups) {
      for (const d of devs) {
        if (isHero(d) && !heroSeen.has(d.name)) {
          heroSeen.add(d.name);
          heroDevs.push(d);
          heroGroup.set(d.name, group);
        }
      }
    }
    // Mindestens ein "full"-Blickfang: das Band fuellt die Flaeche (eine
    // Spalte, Kachel auf volle Hoehe gestreckt) und der Raum wird markiert,
    // damit die Gruppen im TV-Modus wegfallen.
    const heroFull = heroDevs.some(isHeroFull);
    if (heroFull) roomEl.classList.add("hero-full");
    if (heroDevs.length) {
      const band = document.createElement("div");
      band.className = "viz-hero" + (heroFull ? " full" : "");
      heroDevs
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
        .forEach((dev) => {
          const w = createWidget(dev, store, client, widgetOpts);
          // Raster-Spans (aus vizSize) im Band nicht anwenden - das Band hat
          // ein eigenes Layout; Typo aber gross (mind. 2x2), fuer die Ferne.
          w.style.gridColumn = "";
          w.style.gridRow = "";
          w.setAttribute("data-hero", "");
          // 2x1 (breit, aber nicht die riesige 2x2-Typo) - sonst wird der
          // Inhalt bei schmaleren Layouts (z. B. width 1000) abgeschnitten.
          // Bei "full" ist der Platz da: groesste Typo (2x2), fuer die Ferne.
          if (heroFull) w.setAttribute("data-size", "2x2");
          else if (!w.getAttribute("data-size")) w.setAttribute("data-size", "2x1");
          // Auch im Hero-Band die Werkzeuge anbieten: sonst waere "Hero" eine
          // Einbahnstrasse - die Kachel verlaesst das Raster und man kaeme
          // nicht mehr an den Schalter, um sie zurueckzuholen.
          band.appendChild(
            edit
              ? editWrap(w, dev, band, editCtx, {
                  room,
                  group: heroGroup.get(dev.name),
                })
              : w
          );
        });
      roomEl.appendChild(band);
    }

    // Gruppen fliessen nebeneinander: jede Gruppe ist nur so breit wie
    // ihre Kacheln (Spaltenzahl = Summe der Spannweiten, gedeckelt) -
    // kleine Gruppen teilen sich eine Zeile statt sie zu verschwenden.
    const groupsWrap = document.createElement("div");
    groupsWrap.className = "viz-groups";
    roomEl.appendChild(groupsWrap);

    for (const [group, allDevices] of [...groups.entries()].sort()) {
      // Hero-Geraete sind bereits im Band oben - hier auslassen.
      const devices = allDevices.filter((d) => !isHero(d));
      if (!devices.length) continue;
      const groupEl = document.createElement("div");
      groupEl.className = "viz-group";
      const hasWide = devices.some((d) =>
        /^2/.test(String((d.attr || {}).vizSize || ""))
      );
      const cols = Math.max(
        // Doppelt breite Kacheln brauchen mindestens 2 Spalten.
        hasWide ? 2 : 1,
        Math.min(
          devices.reduce(
            (a, d) =>
              a + (/^2/.test(String((d.attr || {}).vizSize || "")) ? 2 : 1),
            0
          ),
          opts.tv ? 4 : 6,
          fitCols // nie mehr Spalten, als in die Breite passen
        )
      );
      groupEl.style.setProperty("--viz-group-cols", cols);
      // Die Default-Gruppe "Allgemein" braucht keine Ueberschrift, wenn sie
      // die einzige Gruppe des Raums ist.
      if (!(groups.size === 1 && group === "Allgemein")) {
        const h3 = document.createElement("h3");
        h3.textContent = group;
        groupEl.appendChild(h3);
      }

      const grid = document.createElement("div");
      grid.className = "viz-grid";
      devices
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
        .forEach((dev) => {
          const w = createWidget(dev, store, client, widgetOpts);
          grid.appendChild(
            edit ? editWrap(w, dev, grid, editCtx, { room, group }) : w
          );
        });

      groupEl.appendChild(grid);
      groupsWrap.appendChild(groupEl);
    }
    root.appendChild(roomEl);
  }

  // Zeilen-Spannweite an den INHALT anpassen: bisher wuchs die ganze
  // Rasterzeile auf die hoechste Kachel und streckte alle Nachbarn mit
  // (leere Riesen-Kacheln neben einem Regler). Jetzt wird die natuerliche
  // Hoehe jeder Kachel gemessen (align-items:start hebt das Stretching
  // kurz auf) und inhaltsreiche Kacheln spannen mehrere Rasterzeilen -
  // kompakte bleiben klein, grid-auto-flow:dense packt sie in die Luecken.
  const rowH = parseFloat(cs.getPropertyValue("--viz-tile-row")) || 104;

  // Editiermodus: die Werkzeugleiste sitzt IM Rasterelement und nimmt der
  // Kachel Hoehe weg. Wie viel, haengt von der Kachelbreite ab - bei einer
  // schmalen 1x1 bricht die Leiste auf zwei Zeilen um, bei der breiten
  // Nachbarin nicht. In derselben Rasterzeile war die 1x1-Karte damit 30 px
  // kleiner als die 2x1 daneben ("zeitweise als 1x2 kleiner"). Darum je
  // Raster: hoechste Leiste ermitteln, alle Leisten darauf setzen (damit alle
  // Karten an derselben Kante beginnen) und die Basiszeile um diese Hoehe
  // anheben - so ist jede Karte so hoch wie ohne Editiermodus.
  if (edit) {
    for (const grid of root.querySelectorAll(".viz-grid, .viz-hero")) {
      const tools = [
        ...grid.querySelectorAll(":scope > .viz-edit-item > .viz-edit-tools"),
      ];
      if (!tools.length) continue;
      for (const t of tools) t.style.minHeight = "";
      const h = Math.max(...tools.map((t) => t.offsetHeight));
      for (const t of tools) t.style.minHeight = h + "px";
      // Das Hero-Band hat kein Rasterzeilen-Raster, nur die Leisten angleichen.
      if (grid.classList.contains("viz-grid")) {
        // Rahmen (Rand + Innenabstand) kommt oben drauf, sonst bliebe die
        // Karte um diese paar Pixel unter ihrer normalen Hoehe.
        const rahmen = tools[0].parentElement;
        const chrom = rahmen.offsetHeight - rahmen.clientHeight + 4; // Rand + padding
        grid.style.setProperty("--viz-tile-row", rowH + h + chrom + "px");
      }
    }
  }

  // Im Editiermodus NICHT automatisch nachspannen: dort sitzt der Rahmen
  // (.viz-edit-item) im Raster, und man soll sehen, was vizSize tatsaechlich
  // bewirkt - nicht die automatische Korrektur.
  for (const grid of edit ? [] : root.querySelectorAll(".viz-grid")) {
    const tiles = [...grid.children];
    // vizSize-Spans (1x2/2x2) gelten als MINIMUM - waechst der Inhalt
    // darueber hinaus, wird der Span erhoeht, statt dass die Rasterzeile
    // aufblaeht und alle Nachbarn mitstreckt.
    const minSpan = tiles.map((t) => {
      const m = String(t.style.gridRow || "").match(/span\s+(\d+)/);
      return m ? parseInt(m[1], 10) : 1;
    });
    // Messmodus: Stretching aufheben UND die 100%-Hoehe der Hosts
    // aussetzen, sonst liefert die Messung wieder die Zeilenhoehe.
    const measure = () => {
      grid.style.alignItems = "start";
      for (const t of tiles) t.style.height = "auto";
      const spans = tiles.map((t, i) =>
        Math.max(
          minSpan[i],
          Math.min(6, Math.ceil((t.offsetHeight + gap) / (rowH + gap)))
        )
      );
      grid.style.alignItems = "";
      for (const t of tiles) t.style.height = "";
      return spans;
    };

    // Durchgang 1: Span + Groessenstufe (Typografie) setzen.
    let spans = measure();
    tiles.forEach((t, i) => {
      if (spans[i] > 1) t.style.gridRow = `span ${spans[i]}`;
      // Typografie an die tatsaechliche Kachelgroesse koppeln: auto
      // vergroesserte Kacheln skalieren wie manuell gesetzte vizSize
      // (grosse Ziffern/Zeilen statt kleiner Text in grosser Flaeche).
      if (!t.getAttribute("data-size")) {
        const c = /span\s*2/.test(t.style.gridColumn || "") ? 2 : 1;
        const r = spans[i] >= 2 ? 2 : 1;
        if (c === 2 || r === 2) t.setAttribute("data-size", `${c}x${r}`);
      }
    });
    // Durchgang 2: die groessere Typografie braucht ggf. mehr Hoehe -
    // Spans nur noch nach OBEN korrigieren (stabil, kein Flackern).
    spans = measure().map((s, i) => Math.max(s, spans[i]));
    tiles.forEach((t, i) => {
      if (spans[i] > 1) t.style.gridRow = `span ${spans[i]}`;
    });
  }

  // Tab-Leiste ganz am Ende einhaengen (siehe oben): fixed (ohne Zoom)
  // ignoriert die Position ohnehin, sticky (mit Zoom) klebt so korrekt
  // unten statt oben.
  // Editier-Leiste vor der Tab-Leiste einhaengen (beide sitzen am Ende des
  // Flusses, damit sticky im Zoom-Modus greift - siehe Kommentar oben).
  if (edit) root.appendChild(editBar(editCtx));
  if (nav) {
    root.appendChild(nav);
    restoreNavScroll(nav, navScroll);
  }
}

/**
 * Scrollposition der Tab-Leiste wiederherstellen und danach sicherstellen,
 * dass der AKTIVE Tab sichtbar ist. scrollIntoView() waere naheliegend, wuerde
 * aber die ganze Seite mitscrollen (die Leiste ist fixed bzw. sticky) - darum
 * die minimale Verschiebung selbst rechnen. Deckt beide Richtungen ab: Leiste
 * unten (waagerecht) und bento-Schiene im Querformat (senkrecht).
 */
function restoreNavScroll(nav, prev) {
  if (prev) {
    nav.scrollLeft = prev.x;
    nav.scrollTop = prev.y;
  }
  const tab = nav.querySelector(".viz-tab.active");
  if (!tab) return;
  const luft = 8;
  const nb = nav.getBoundingClientRect();
  const tb = tab.getBoundingClientRect();
  if (tb.left < nb.left) nav.scrollLeft -= nb.left - tb.left + luft;
  else if (tb.right > nb.right) nav.scrollLeft += tb.right - nb.right + luft;
  if (tb.top < nb.top) nav.scrollTop -= nb.top - tb.top + luft;
  else if (tb.bottom > nb.bottom) nav.scrollTop += tb.bottom - nb.bottom + luft;
}
