/*
 * FHEMVIZ - responsives Auto-Layout.
 *
 * GRUNDGERUEST / SCAFFOLD (v0.1.0) - Stub ohne Logik.
 * Aufbau rein aus Attributen (§4): room -> Sicht/Tab, group -> Karte,
 * sortby -> Reihenfolge, vizSize -> Kachel-Spannweite. Kein festes
 * Positionieren; CSS-Grid auto-fill/minmax bricht die Kacheln automatisch um.
 * Geraete ohne group -> Default-Gruppe; ohne room -> "Unsortiert".
 */

/**
 * Rendert die aktuelle Sicht in den Container.
 * TODO (Bau-Session): Gruppierung nach room/group/sortby, Kacheln je vizSize,
 * Widget-Auswahl ueber die Registry.
 * @param {HTMLElement} root
 * @param {import("./store.js").Store} store
 */
export function renderLayout(root, store) {
  void root;
  void store;
  throw new Error("FHEMVIZ scaffold: renderLayout() noch nicht implementiert");
}
