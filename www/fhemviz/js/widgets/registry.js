/*
 * FHEMVIZ - Widget-Registry (PoC v0.2.0).
 * Auswahl-Reihenfolge pro Geraet:
 *   vizWidget (explizit) -> genericDeviceType -> Heuristik aus PossibleSets
 *   -> Fallback: Sensor-/Status-Kachel.
 */

import { FhemvizWidget } from "./base-widget.js";
import { FhemvizSwitch } from "./switch.js";
import { FhemvizSensor } from "./sensor.js";
import { FhemvizDimmer } from "./dimmer.js";

export const WIDGET_REGISTRY = {
  switch: "fhemviz-switch",
  sensor: "fhemviz-sensor",
  dimmer: "fhemviz-dimmer",
  // TODO: thermostat, blind/shutter, chart, media, text/status, button.
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

  // 3. Heuristik aus PossibleSets/webCmd
  const sets = `${device.possibleSets || ""} ${attr.webCmd || ""}`;
  if (/\bpct\b|\bdim\b/.test(sets)) return WIDGET_REGISTRY.dimmer;
  if (/\bon\b/.test(sets) && /\boff\b/.test(sets)) return WIDGET_REGISTRY.switch;

  // 4. Fallback
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
