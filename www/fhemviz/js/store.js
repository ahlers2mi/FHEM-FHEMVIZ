/*
 * FHEMVIZ - reaktiver Store (Geraetemodell).
 *
 * GRUNDGERUEST / SCAFFOLD (v0.1.0) - Methoden sind Stubs ohne Logik.
 * Haelt Geraete als Objekte; eine inform-Zeile patcht gezielt ein Reading
 * und benachrichtigt nur die abonnierten Widgets -> minimaler Re-Render (§7).
 */

export class Store {
  constructor() {
    this.devices = new Map(); // name -> Geraeteobjekt (Internals/Readings/Attr)
    this._subscribers = new Map(); // "dev:reading" -> Set<callback>
  }

  /** Store aus jsonlist2-Snapshot aufbauen. TODO. */
  loadSnapshot(/* jsonlist2Result */) {
    throw new Error("FHEMVIZ scaffold: loadSnapshot() noch nicht implementiert");
  }

  /** Eine inform-Zeile gezielt einpatchen und Abonnenten benachrichtigen. TODO. */
  applyEvent(/* [ "<dev>-<reading>", raw, formatted ] */) {
    throw new Error("FHEMVIZ scaffold: applyEvent() noch nicht implementiert");
  }

  /** Widget fuer Aenderungen eines Readings abonnieren. TODO. */
  subscribe(/* device, reading, callback */) {
    throw new Error("FHEMVIZ scaffold: subscribe() noch nicht implementiert");
  }
}
