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

export const WIDGET_REGISTRY = {
  switch: "fhemviz-switch",
  sensor: "fhemviz-sensor",
  dimmer: "fhemviz-dimmer",
  actions: "fhemviz-actions",
  // TODO: thermostat, blind/shutter, chart, media, text/status.
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
};

export function registerCoreWidgets() {
  const defs = [
    ["fhemviz-switch", FhemvizSwitch],
    ["fhemviz-sensor", FhemvizSensor],
    ["fhemviz-dimmer", FhemvizDimmer],
    ["fhemviz-actions", FhemvizActions],
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

  // 5. Fallback
  return WIDGET_REGISTRY.sensor;
}

/** Erzeugt ein konfiguriertes Widget-Element fuer ein Geraet. */
export function createWidget(device, store, client) {
  const tag = selectWidget(device);
  const el = document.createElement(tag);
  el.device = device;
  el.store = store;
  el.client = client;
  return el;
}

export { FhemvizWidget };
