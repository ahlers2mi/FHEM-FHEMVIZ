/*
 * FHEMVIZ - Switch-Widget (on/off).
 *
 * GRUNDGERUEST / SCAFFOLD (v0.1.0) - Stub, kein Rendering.
 * Kern-Widget Nr. 1 (§9). Stellt einen Ein/Aus-Zustand dar und sendet bei
 * Interaktion "set <dev> on|off".
 */

import { FhemvizWidget } from "./base-widget.js";

export class FhemvizSwitch extends FhemvizWidget {
  update(/* device */) {
    // TODO (Bau-Session): Zustand darstellen (devStateIcon/state).
  }
}
