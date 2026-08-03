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
export const VIZ_ROOM_PREFIX = "FHEMVIZ->";

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
  return /^(1|true|yes|on)$/i.test(String((dev.attr || {}).vizHero || ""));
}

function loadActiveRoom() {
  try {
    return localStorage.getItem(LS_ACTIVE_ROOM) || ALL_ROOMS;
  } catch {
    return ALL_ROOMS;
  }
}

function saveActiveRoom(room) {
  try {
    localStorage.setItem(LS_ACTIVE_ROOM, room);
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
 * FHEM haelt Attribute nur im Speicher - darum der Speichern-Knopf (save).
 */
const SIZES = ["", "2x1", "1x2", "2x2"]; // "" = 1x1 (Attribut geloescht)
let editDirty = false; // ungespeicherte Attributaenderungen

/** attr/deleteattr schicken und die Sicht sofort nachziehen. */
async function editSet(ctx, devName, attr, value) {
  const { client, store } = ctx;
  if (!client) return;
  const cmd =
    value === null ? `deleteattr ${devName} ${attr}` : `attr ${devName} ${attr} ${value}`;
  try {
    await client.command(cmd);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("FHEMVIZ Editiermodus:", cmd, e && e.message);
    return;
  }
  store.patchAttr(devName, attr, value);
  editDirty = true;
  ctx.rerender();
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
    const move = (ev) => {
      const unter = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest(".viz-edit-item");
      if (!unter || unter === item || unter.parentElement !== grid) return;
      const r = unter.getBoundingClientRect();
      // Mitte des Ziels entscheidet, ob davor oder dahinter eingefuegt wird.
      const davor = ev.clientY < r.top + r.height / 2;
      grid.insertBefore(item, davor ? unter : unter.nextSibling);
    };
    const up = () => {
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

/** Kachel in einen Rahmen mit Werkzeugleiste packen. */
function editWrap(widget, dev, grid, ctx) {
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
  const bReset = knopf("ve-reset", "↺", "Zurücksetzen: vizSize, vizHero, vizHide, sortby");

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
  info.textContent = editDirty
    ? "geändert – noch nicht gespeichert"
    : "Änderungen wirken sofort";
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
  bar.append(
    Object.assign(document.createElement("strong"), { textContent: "Bearbeiten" }),
    info,
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
  const editCtx = edit
    ? {
        client,
        store,
        skin: opts.skin || "",
        rerender: () => renderLayout(root, store, client, opts),
        exit: () => (opts.onExitEdit ? opts.onExitEdit() : null),
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
  let active = opts.activeRoom ?? loadActiveRoom();
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
        saveActiveRoom(name);
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
    for (const devs of groups.values()) {
      for (const d of devs) {
        if (isHero(d) && !heroSeen.has(d.name)) {
          heroSeen.add(d.name);
          heroDevs.push(d);
        }
      }
    }
    if (heroDevs.length) {
      const band = document.createElement("div");
      band.className = "viz-hero";
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
          if (!w.getAttribute("data-size")) w.setAttribute("data-size", "2x1");
          // Auch im Hero-Band die Werkzeuge anbieten: sonst waere "Hero" eine
          // Einbahnstrasse - die Kachel verlaesst das Raster und man kaeme
          // nicht mehr an den Schalter, um sie zurueckzuholen.
          band.appendChild(edit ? editWrap(w, dev, band, editCtx) : w);
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
          grid.appendChild(edit ? editWrap(w, dev, grid, editCtx) : w);
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
