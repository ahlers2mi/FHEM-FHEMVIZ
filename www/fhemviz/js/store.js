/*
 * FHEMVIZ - reaktiver Store (PoC v0.2.0).
 * Haelt Geraete als Objekte; eine inform-Zeile patcht gezielt ein Reading
 * und benachrichtigt nur die abonnierten Widgets -> minimaler Re-Render.
 */

export class Store {
  constructor() {
    this.devices = new Map(); // name -> {name, attr, readings, state, possibleSets}
    this._subscribers = new Map(); // name -> Set<callback>
  }

  /** Store aus jsonlist2-Snapshot aufbauen. */
  loadSnapshot(jsonlist2) {
    const results = (jsonlist2 && jsonlist2.Results) || [];
    for (const r of results) {
      const readings = {};
      for (const [k, v] of Object.entries(r.Readings || {})) {
        readings[k] = v && typeof v === "object" ? v.Value : v;
      }
      const state =
        readings.state ??
        (r.Internals && r.Internals.STATE) ??
        "";
      this.devices.set(r.Name, {
        name: r.Name,
        attr: r.Attributes || {},
        internals: r.Internals || {},
        readings,
        state,
        possibleSets: r.PossibleSets || "",
      });
    }
  }

  all() {
    return [...this.devices.values()];
  }

  get(name) {
    return this.devices.get(name);
  }

  /** Eine inform-Zeile ("<dev>-<reading>", value) gezielt einpatchen. */
  applyEvent(id, value) {
    // Passendes Geraet finden (Name ist Praefix vor dem ersten "-").
    let dev = null;
    let reading = null;
    for (const name of this.devices.keys()) {
      if (id === name || id.startsWith(name + "-")) {
        dev = this.devices.get(name);
        reading = id === name ? "state" : id.slice(name.length + 1);
        break;
      }
    }
    if (!dev) return;
    if (reading.endsWith("-ts")) return; // Zeitstempel-Zeilen ignorieren

    if (reading === "state" || reading === "STATE") {
      dev.state = value;
      dev.readings.state = value;
    } else {
      dev.readings[reading] = value;
    }
    this._notify(dev.name);
  }

  /** Widget fuer Aenderungen eines Geraets abonnieren. Gibt Unsubscribe zurueck. */
  subscribe(name, callback) {
    if (!this._subscribers.has(name)) this._subscribers.set(name, new Set());
    this._subscribers.get(name).add(callback);
    return () => {
      const set = this._subscribers.get(name);
      if (set) set.delete(callback);
    };
  }

  _notify(name) {
    const set = this._subscribers.get(name);
    if (!set) return;
    const dev = this.devices.get(name);
    for (const cb of set) {
      try {
        cb(dev);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("FHEMVIZ subscriber error:", e);
      }
    }
  }
}
