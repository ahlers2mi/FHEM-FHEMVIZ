/*
 * FHEMVIZ - App-Einstiegspunkt (Bootstrap).
 *
 * GRUNDGERUEST / SCAFFOLD (v0.1.0) - noch KEINE Logik.
 * Verdrahtet spaeter: fhem-client (Snapshot + inform-Live + CSRF-Set) ->
 * store (reaktives Geraetemodell) -> layout (Auto-Layout) -> widgets.
 * Siehe CONCEPT.md, §7.
 */

import { FhemClient } from "./fhem-client.js";
import { Store } from "./store.js";
import { renderLayout } from "./layout.js";
import { registerCoreWidgets } from "./widgets/registry.js";

/**
 * Startet die Anwendung.
 * TODO (Bau-Session):
 *   1. get manifest/config vom 98_FHEMVIZ.pm laden (aktive Sicht/Theme).
 *   2. FhemClient verbinden: Snapshot (jsonlist2) + inform-Stream + CSRF.
 *   3. Store aus Snapshot aufbauen, inform-Zeilen gezielt einpatchen.
 *   4. Kern-Widgets registrieren und Auto-Layout rendern.
 */
async function main() {
  const root = document.getElementById("fhemviz-app");
  if (!root) return;

  // Platzhalter - noch keine echte Initialisierung.
  void FhemClient;
  void Store;
  void renderLayout;
  void registerCoreWidgets;

  root.dataset.state = "scaffold-loaded";
}

main();
