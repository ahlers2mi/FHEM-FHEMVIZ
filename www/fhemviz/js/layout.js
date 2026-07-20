/*
 * FHEMVIZ - responsives Auto-Layout (PoC v0.2.0).
 * Aufbau rein aus Attributen: room -> Sicht, group -> Karte, sortby ->
 * Reihenfolge. Geraete ohne group -> "Allgemein", ohne room -> "Unsortiert".
 * Das CSS-Grid (auto-fill/minmax) bricht die Kacheln automatisch um.
 */

import { createWidget } from "./widgets/registry.js";

// FHEM erlaubt mehrere Raeume/Gruppen kommasepariert an EINEM Geraet.
function splitAttr(v) {
  return String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// FHEM-Standard: Raum "hidden" blendet aus der Ansicht aus.
const HIDDEN_ROOMS = new Set(["hidden"]);

// Anzeige der FHEM-Raumhierarchie "System->MQTT" als "System › MQTT".
function prettyRoom(room) {
  return room.replace(/->/g, " › ");
}

function sortKey(dev) {
  const a = dev.attr || {};
  return (a.sortby || a.alias || dev.name).toLowerCase();
}

/**
 * Rendert alle Geraete des Stores gruppiert nach room/group in den Container.
 * @param {HTMLElement} root
 * @param {import("./store.js").Store} store
 * @param {object} client - FhemClient (fuer set-Befehle)
 */
export function renderLayout(root, store, client) {
  const rooms = new Map(); // room -> Map(group -> devices[])

  for (const dev of store.all()) {
    const attr = dev.attr || {};
    if (attr.vizHide) continue;

    // Ein Geraet kann in mehreren Raeumen UND Gruppen liegen -> es erscheint
    // in jeder Raum/Gruppe-Kombination (wie in FHEMWEB).
    let devRooms = splitAttr(attr.room);
    if (devRooms.length === 0) devRooms = ["Unsortiert"];
    let devGroups = splitAttr(attr.group);
    if (devGroups.length === 0) devGroups = ["Allgemein"];

    for (const room of devRooms) {
      if (HIDDEN_ROOMS.has(room)) continue;
      if (!rooms.has(room)) rooms.set(room, new Map());
      const groups = rooms.get(room);
      for (const group of devGroups) {
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(dev);
      }
    }
  }

  root.textContent = "";

  if (rooms.size === 0) {
    const empty = document.createElement("p");
    empty.className = "viz-status";
    empty.textContent = "Keine Geraete in der Sicht (devspec pruefen).";
    root.appendChild(empty);
    return;
  }

  for (const [room, groups] of [...rooms.entries()].sort()) {
    const roomEl = document.createElement("section");
    roomEl.className = "viz-room";
    const h2 = document.createElement("h2");
    h2.textContent = prettyRoom(room);
    roomEl.appendChild(h2);

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
        .forEach((dev) => grid.appendChild(createWidget(dev, store, client)));

      groupEl.appendChild(grid);
      roomEl.appendChild(groupEl);
    }
    root.appendChild(roomEl);
  }
}
