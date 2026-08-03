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

  /**
   * Reading-Werte UND Zeitstempel aus einem jsonlist2-Eintrag ziehen.
   * Die Zeit steht in jsonlist2 je Reading dabei ("Time"); Widgets brauchen
   * sie z. B. fuer "letzte Bewegung 16:47". Die Werte bleiben flach in
   * .readings - dort greifen alle Widgets direkt zu.
   */
  static _split(r) {
    const readings = {};
    const times = {};
    for (const [k, v] of Object.entries((r && r.Readings) || {})) {
      if (v && typeof v === "object") {
        readings[k] = v.Value;
        if (v.Time) times[k] = v.Time;
      } else {
        readings[k] = v;
      }
    }
    return { readings, times };
  }

  /** Store aus jsonlist2-Snapshot aufbauen. */
  loadSnapshot(jsonlist2) {
    const results = (jsonlist2 && jsonlist2.Results) || [];
    for (const r of results) {
      const { readings, times } = Store._split(r);
      const state =
        readings.state ??
        (r.Internals && r.Internals.STATE) ??
        "";
      this.devices.set(r.Name, {
        name: r.Name,
        attr: r.Attributes || {},
        internals: r.Internals || {},
        readings,
        times,
        state,
        possibleSets: r.PossibleSets || "",
      });
    }
  }

  /**
   * Frischen jsonlist2-Snapshot ueber die vorhandenen Geraete legen und nur
   * die tatsaechlich geaenderten neu rendern. Fuer den Resync nach einem
   * inform-Aussetzer (verpasste Events) und als periodisches Sicherheitsnetz
   * gegen stundenalte Werte. Neue/entfernte Geraete werden hier ignoriert.
   */
  resync(jsonlist2) {
    const results = (jsonlist2 && jsonlist2.Results) || [];
    for (const r of results) {
      const dev = this.devices.get(r.Name);
      if (!dev) continue;
      const { readings, times } = Store._split(r);
      const state =
        readings.state ?? (r.Internals && r.Internals.STATE) ?? dev.state;
      const changed =
        state !== dev.state ||
        JSON.stringify(readings) !== JSON.stringify(dev.readings);
      dev.readings = readings;
      dev.times = times;
      dev.state = state;
      if (r.PossibleSets) dev.possibleSets = r.PossibleSets;
      if (r.Attributes) dev.attr = r.Attributes;
      if (r.Internals) dev.internals = r.Internals;
      if (changed) this._notify(r.Name);
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
    let deviceLevel = false;
    for (const name of this.devices.keys()) {
      if (id === name || id.startsWith(name + "-")) {
        dev = this.devices.get(name);
        deviceLevel = id === name;
        reading = deviceLevel ? "state" : id.slice(name.length + 1);
        break;
      }
    }
    if (!dev) return;
    if (reading.endsWith("-ts")) return; // Zeitstempel-Zeilen ignorieren

    if (deviceLevel) {
      // Geraeteweites STATE-Event = ANZEIGE-STATE, haeufig stateFormat-Text
      // (z. B. "Aktuell 0 W, gesamt 2.8 kWh, Status ON"). Nur die Anzeige
      // setzen, NICHT das rohe state-Reading ueberschreiben - sonst geht das
      // eigentliche on/off im state-Reading verloren (Schalter kippt auf
      // "unbekannt" und zeigt den Textblock). Das rohe state-Reading kommt
      // per eigenem "<dev>-state"-Event bzw. aus dem Snapshot.
      dev.state = value;
    } else if (reading === "state" || reading === "STATE") {
      dev.state = value;
      dev.readings.state = value;
    } else {
      dev.readings[reading] = value;
    }
    // Zeitstempel mitfuehren: die inform-Zeile bringt keine Zeit mit, das
    // Ereignis ist aber genau JETZT eingetroffen (fuer "letzte Bewegung ...").
    if (reading) {
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, "0");
      dev.times = dev.times || {};
      dev.times[reading] =
        `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ` +
        `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
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
