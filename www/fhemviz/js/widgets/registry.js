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
import { FhemvizShutter } from "./shutter.js";
import { FhemvizVent } from "./vent.js";

export const WIDGET_REGISTRY = {
  switch: "fhemviz-switch",
  sensor: "fhemviz-sensor",
  dimmer: "fhemviz-dimmer",
  actions: "fhemviz-actions",
  text: "fhemviz-text",
  agenda: "fhemviz-agenda",
  contact: "fhemviz-contact",
  shutter: "fhemviz-shutter",
  vent: "fhemviz-vent",
  // TODO: thermostat, blind/shutter, chart, media.
};

// genericDeviceType -> Widget-Schluessel (PoC-Teilmenge).
const GDT_MAP = {
  switch: "switch",
  light: "switch",
  socket: "switch",
  blind: "shutter",
  shutter: "shutter",
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
    ["fhemviz-shutter", FhemvizShutter],
    ["fhemviz-vent", FhemvizVent],
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
  // 2. genericDeviceType. Rollladen brauchen pct - Pegel-Proxies
  //    (gdt blind, aber nur state-Slider) bekommen den Dimmer.
  const gdt = attr.genericDeviceType || attr.gdt;
  if (gdt && GDT_MAP[gdt]) {
    let key = GDT_MAP[gdt];
    if (key === "shutter" && !/\bpct\b/.test(String(device.possibleSets || ""))) {
      key = "dimmer";
    }
    return WIDGET_REGISTRY[key];
  }

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

  // 3b. vizReadings konfiguriert (und kein passenderes Widget gefunden)
  //     -> Readings-Kachel; bei GDT/webCmd-Widgets erscheinen die
  //     vizReadings stattdessen als Info-Zeilen in der Kachel.
  if (attr.vizReadings) return WIDGET_REGISTRY.sensor;

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

/**
 * Plugin-API fuer eigene Widgets (update-sicher, buildfrei):
 * www/fhemviz/js/widgets/custom/index.js anlegen - sie wird beim Start
 * automatisch geladen (fehlt sie, passiert nichts) und ruft:
 *
 *   import { registerWidget, FhemvizWidget } from "../registry.js";
 *   class MeinWidget extends FhemvizWidget { render() { ... } }
 *   registerWidget("meinwidget", MeinWidget);
 *
 * Aktivierung am Geraet: attr <geraet> vizWidget meinwidget
 * (FHEM akzeptiert auch Werte ausserhalb des Dropdowns.)
 */
export function registerWidget(key, cls) {
  const tag = "fhemviz-" + String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  WIDGET_REGISTRY[key] = tag;
  if (!customElements.get(tag)) customElements.define(tag, cls);
  return tag;
}

export { FhemvizWidget };
