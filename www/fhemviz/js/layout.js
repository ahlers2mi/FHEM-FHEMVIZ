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

// Anzeige der FHEM-Raumhierarchie "System->MQTT" als "System › MQTT".
function prettyRoom(room) {
  return room.replace(/->/g, " › ");
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

    // Rausch-Filter - ausser der Nutzer erzwingt die Kachel via vizWidget.
    if (!attr.vizWidget) {
      const type = (dev.internals && dev.internals.TYPE) || "";
      if (hideTypes.has(type)) continue;
      const st = plainState(dev.state);
      if (st === "" || hideStates.some((re) => re.test(st))) continue;
    }

    // Ein Geraet kann in mehreren Raeumen UND Gruppen liegen -> es erscheint
    // in jeder Raum/Gruppe-Kombination (wie in FHEMWEB).
    let devRooms = splitAttr(attr.room);
    if (devRooms.length === 0) devRooms = ["Unsortiert"];
    devRooms = devRooms.filter((r) => !hideRooms.some((re) => re.test(r)));
    // Liegt das Geraet NUR in ausgeblendeten Raeumen, trotzdem zeigen:
    // das devspec hat es explizit ausgewaehlt.
    if (devRooms.length === 0) devRooms = ["Weitere"];
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
  return [...buildRooms(store, opts).keys()].sort((a, b) => a.localeCompare(b));
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

  const roomNames = [...rooms.keys()].sort((a, b) => a.localeCompare(b));
  if (roomNames.length === 0) {
    const empty = document.createElement("p");
    empty.className = "viz-status";
    empty.textContent = "Keine Geraete in der Sicht (devspec/Filter pruefen).";
    root.appendChild(empty);
    return;
  }

  // Aktiver Raum: explizit uebergeben > gemerkt > "Alle".
  let active = opts.activeRoom ?? loadActiveRoom();
  if (active !== ALL_ROOMS && !rooms.has(active)) active = ALL_ROOMS;

  if (showTabs) {
    const nav = document.createElement("nav");
    nav.className = "viz-tabs";
    for (const name of [ALL_ROOMS, ...roomNames]) {
      const tab = document.createElement("button");
      tab.className = "viz-tab" + (name === active ? " active" : "");
      tab.textContent = name === ALL_ROOMS ? "Alle" : prettyRoom(name);
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

  for (const room of shownRooms) {
    const groups = rooms.get(room);
    const roomEl = document.createElement("section");
    roomEl.className = "viz-room";

    // Raum-Ueberschrift nur, wenn mehrere Raeume zu sehen sind (im
    // Einzel-Tab/in der TV-Szene ist der Raumname bereits im Tab/Header).
    if (active === ALL_ROOMS) {
      const h2 = document.createElement("h2");
      h2.textContent = prettyRoom(room);
      roomEl.appendChild(h2);
    }

    for (const [group, devices] of [...groups.entries()].sort()) {
      const groupEl = document.createElement("div");
      groupEl.className = "viz-group";
      const h3 = document.createElement("h3");
      h3.textContent = group;
      groupEl.appendChild(h3);

      const grid = document.createElement("div");
      grid.className = "viz-grid";
      devices
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
        .forEach((dev) =>
          grid.appendChild(createWidget(dev, store, client, widgetOpts))
        );

      groupEl.appendChild(grid);
      roomEl.appendChild(groupEl);
    }
    root.appendChild(roomEl);
  }
}
