/*
 * FHEMVIZ - Widget-Registry (semantischer Typ -> Web-Component).
 *
 * GRUNDGERUEST / SCAFFOLD (v0.1.0) - Stubs ohne Logik.
 * Auswahl-Reihenfolge pro Geraet (§5):
 *   vizWidget (explizit) -> genericDeviceType -> Heuristik aus
 *   PossibleSets/webCmd -> Fallback: generische Sensor-/Status-Kachel.
 */

import { FhemvizSwitch } from "./switch.js";
import { FhemvizSensor } from "./sensor.js";
import { FhemvizDimmer } from "./dimmer.js";

/** semantischer Typ -> Custom-Element-Tag */
export const WIDGET_REGISTRY = {
  switch: "fhemviz-switch",
  sensor: "fhemviz-sensor",
  dimmer: "fhemviz-dimmer",
  // TODO (Bau-Session): thermostat, blind/shutter, chart, media,
  // text/status, button/action - siehe CONCEPT.md, §5.
};

/** Registriert die Kern-Widgets als Custom Elements. TODO: vollstaendiges Set. */
export function registerCoreWidgets() {
  if (!customElements.get("fhemviz-switch")) {
    customElements.define("fhemviz-switch", FhemvizSwitch);
  }
  if (!customElements.get("fhemviz-sensor")) {
    customElements.define("fhemviz-sensor", FhemvizSensor);
  }
  if (!customElements.get("fhemviz-dimmer")) {
    customElements.define("fhemviz-dimmer", FhemvizDimmer);
  }
}

/**
 * Waehlt anhand der Geraetedaten den passenden Widget-Tag.
 * TODO (Bau-Session): Auswahl-Reihenfolge aus §5 implementieren.
 */
export function selectWidget(/* device */) {
  throw new Error("FHEMVIZ scaffold: selectWidget() noch nicht implementiert");
}
