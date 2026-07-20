/*
 * FHEMVIZ - Basis-Klasse aller Widgets (Custom Element + Shadow DOM).
 *
 * GRUNDGERUEST / SCAFFOLD (v0.1.0) - nur Geruest, kein Rendering.
 * Jedes Widget kennt zwei Dinge (§5):
 *   - wie es einen Reading-Wert darstellt,
 *   - welchen set-Befehl es bei Interaktion absetzt.
 * Kapselung ueber Shadow DOM; Theming ueber vererbte CSS Custom Properties.
 */

export class FhemvizWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.device = null; // wird spaeter vom Layout gesetzt
  }

  /** Vom Store bei jeder relevanten Reading-Aenderung aufgerufen. TODO. */
  update(/* device */) {
    throw new Error("FHEMVIZ scaffold: update() im abgeleiteten Widget implementieren");
  }

  /** Setzt einen FHEM-Befehl ueber den FhemClient ab. TODO. */
  sendCommand(/* cmd */) {
    throw new Error("FHEMVIZ scaffold: sendCommand() noch nicht implementiert");
  }
}
