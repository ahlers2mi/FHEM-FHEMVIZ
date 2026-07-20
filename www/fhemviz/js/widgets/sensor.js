/*
 * FHEMVIZ - Sensor-Widget (Wert + Einheit + Trend).
 *
 * GRUNDGERUEST / SCAFFOLD (v0.1.0) - Stub, kein Rendering.
 * Kern-Widget Nr. 2 (§9). Zeigt einen Messwert an; *_OK-Readings (wie beim
 * Pool-Sensor BLEYC01) speisen spaeter eine Ampel-/Statusfarbe (§3b).
 */

import { FhemvizWidget } from "./base-widget.js";

export class FhemvizSensor extends FhemvizWidget {
  update(/* device */) {
    // TODO (Bau-Session): Wert + Einheit (stateFormat) + Ampel aus *_OK.
  }
}
