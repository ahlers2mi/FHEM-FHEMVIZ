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
    if (/^(1|true|yes)$/i.test(String(attr.vizHide || ""))) continue;

    // Rausch-Filter - ausser der Nutzer erzwingt die Kachel via
    // vizWidget oder hat den Inhalt via vizReadings konfiguriert.
    if (!attr.vizWidget && !attr.vizReadings) {
      const type = (dev.internals && dev.internals.TYPE) || "";
      if (hideTypes.has(type)) continue;
      const st = plainState(dev.state);
      if (st === "" || hideStates.some((re) => re.test(st))) continue;
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
    let devGroups = splitAttr(attr.group);
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

  if (showTabs) {
    const nav = document.createElement("nav");
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
    root.appendChild(nav);
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

    // Gruppen fliessen nebeneinander: jede Gruppe ist nur so breit wie
    // ihre Kacheln (Spaltenzahl = Summe der Spannweiten, gedeckelt) -
    // kleine Gruppen teilen sich eine Zeile statt sie zu verschwenden.
    const groupsWrap = document.createElement("div");
    groupsWrap.className = "viz-groups";
    roomEl.appendChild(groupsWrap);

    for (const [group, devices] of [...groups.entries()].sort()) {
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
        .forEach((dev) =>
          grid.appendChild(createWidget(dev, store, client, widgetOpts))
        );

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
  for (const grid of root.querySelectorAll(".viz-grid")) {
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
    grid.style.alignItems = "start";
    for (const t of tiles) t.style.height = "auto";
    const spans = tiles.map((t, i) =>
      Math.max(
        minSpan[i],
        Math.min(6, Math.ceil((t.offsetHeight + gap) / (rowH + gap)))
      )
    );
    grid.style.alignItems = "";
    tiles.forEach((t, i) => {
      t.style.height = "";
      if (spans[i] > 1) t.style.gridRow = `span ${spans[i]}`;
    });
  }
}
