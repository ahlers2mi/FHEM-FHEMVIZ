/*
 * FHEMVIZ - Widget-Registry (PoC v0.3.0).
 * Auswahl-Reihenfolge pro Geraet:
 *   vizWidget (explizit) -> genericDeviceType -> webCmd (vom Nutzer bewusst
 *   gesetzte Bedienbefehle) -> Heuristik aus PossibleSets -> Fallback:
 *   Sensor-/Status-Kachel.
 */

import { FhemvizWidget } from "./base-widget.js";
import { FhemvizSwitch } from "./switch.js";
import { FhemvizSensor } from "./sensor.js";
import { FhemvizDimmer } from "./dimmer.js";
import { FhemvizActions } from "./actions.js";
import { FhemvizText } from "./text.js";
import { FhemvizAgenda } from "./agenda.js";
import { FhemvizContact } from "./contact.js";

export const WIDGET_REGISTRY = {
  switch: "fhemviz-switch",
  sensor: "fhemviz-sensor",
  dimmer: "fhemviz-dimmer",
  actions: "fhemviz-actions",
  text: "fhemviz-text",
  agenda: "fhemviz-agenda",
  contact: "fhemviz-contact",
  // TODO: thermostat, blind/shutter, chart, media.
};

// genericDeviceType -> Widget-Schluessel (PoC-Teilmenge).
const GDT_MAP = {
  switch: "switch",
  light: "switch",
  socket: "switch",
  blind: "dimmer",
  shutter: "dimmer",
  thermostat: "sensor",
  sensor: "sensor",
  window: "contact",
  door: "contact",
  contact: "contact",
};

export function registerCoreWidgets() {
  const defs = [
    ["fhemviz-switch", FhemvizSwitch],
    ["fhemviz-sensor", FhemvizSensor],
    ["fhemviz-dimmer", FhemvizDimmer],
    ["fhemviz-actions", FhemvizActions],
    ["fhemviz-text", FhemvizText],
    ["fhemviz-agenda", FhemvizAgenda],
    ["fhemviz-contact", FhemvizContact],
  ];
  for (const [tag, cls] of defs) {
    if (!customElements.get(tag)) customElements.define(tag, cls);
  }
}

/** Waehlt anhand der Geraetedaten den passenden Widget-Tag. */
export function selectWidget(device) {
  const attr = device.attr || {};

  // 1. explizit
  if (attr.vizWidget && WIDGET_REGISTRY[attr.vizWidget]) {
    return WIDGET_REGISTRY[attr.vizWidget];
  }
  // 1b. vizReadings konfiguriert -> Readings-Kachel (Sensor), ausser
  //     vizWidget sagt explizit etwas anderes.
  if (attr.vizReadings) return WIDGET_REGISTRY.sensor;

  // 2. genericDeviceType
  const gdt = attr.genericDeviceType || attr.gdt;
  if (gdt && GDT_MAP[gdt]) return WIDGET_REGISTRY[GDT_MAP[gdt]];

  // 3. webCmd: bewusst konfigurierte Bedienung hat Vorrang vor der
  //    PossibleSets-Heuristik (z. B. "Auf:Zu:Lueften:Stop" am Garagentor,
  //    obwohl setList auch on/off enthaelt).
  const webCmds = String(attr.webCmd || "")
    .split(":")
    .map((s) => s.trim())
    .filter(Boolean);
  if (webCmds.length) {
    const lower = webCmds.map((c) => c.toLowerCase());
    if (lower.some((c) => c === "pct" || c === "dim")) {
      return WIDGET_REGISTRY.dimmer;
    }
    if (lower.every((c) => ["on", "off", "toggle"].includes(c))) {
      return WIDGET_REGISTRY.switch;
    }
    return WIDGET_REGISTRY.actions;
  }

  // 4. Heuristik aus PossibleSets
  const sets = String(device.possibleSets || "");
  if (/\bpct\b|\bdim\b/.test(sets)) return WIDGET_REGISTRY.dimmer;
  if (/\bon\b/.test(sets) && /\boff\b/.test(sets)) return WIDGET_REGISTRY.switch;

  // 5. Kontakt-Erkennung am Zustand (MAX-Fensterkontakte u. ae. haben
  //    weder GDT noch webCmd - der state verraet sie).
  const st = String(device.state ?? "")
    .replace(/<[^>]*>/g, " ")
    .trim()
    .toLowerCase();
  if (/^(open|opened|closed|tilted|auf|offen|zu|geschlossen|gekippt)$/.test(st)) {
    return WIDGET_REGISTRY.contact;
  }

  // 6. Fallback
  return WIDGET_REGISTRY.sensor;
}

/**
 * Erzeugt ein konfiguriertes Widget-Element fuer ein Geraet.
 * opts: { readonly, tv } - readonly unterdrueckt Bedienelemente (TV/Gaeste),
 * tv skaliert die Typografie (data-tv-Attribut, siehe base-widget CSS).
 */
export function createWidget(device, store, client, opts = {}) {
  const tag = selectWidget(device);
  const el = document.createElement(tag);
  el.device = device;
  el.store = store;
  el.client = client;
  el.readonly = !!opts.readonly;
  if (opts.tv) el.setAttribute("data-tv", "");

  // vizSize (1x1, 2x1, 1x2, 2x2) -> Raster-Spans + groessere Typo.
  const size = String((device.attr && device.attr.vizSize) || "");
  const m = size.match(/^([12])x([12])$/);
  if (m) {
    el.setAttribute("data-size", size);
    if (m[1] === "2") el.style.gridColumn = "span 2";
    if (m[2] === "2") el.style.gridRow = "span 2";
  }
  return el;
}

export { FhemvizWidget };
