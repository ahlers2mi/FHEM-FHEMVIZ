/*
 * FHEMVIZ - FHEMWEB-Client (PoC v0.2.0).
 *
 * Nutzt ausschliesslich die vorhandene FHEMWEB-API:
 *   - Snapshot:  jsonlist2 <devspec> [<reading-regex>]
 *   - Live-Push: GET /fhem?XHR=1&inform=type=status;filter=<regex>;fmt=JSON
 *                (Longpoll-Stream, newline-getrennte JSON-Zeilen)
 *   - Set:       GET /fhem?cmd=set <dev> <cmd>&fwcsrf=<token>&XHR=1
 */

export class FhemClient {
  /**
   * @param {object} opts
   * @param {string} [opts.base] - FHEMWEB-Command-Basis (z. B. "/fhem").
   */
  constructor(opts = {}) {
    this.base = opts.base ?? FhemClient.detectBase();
    this.csrfToken = "";
    this._informAbort = null;
  }

  /** Ermittelt die FHEMWEB-Basis aus dem Pfad der ausgelieferten SPA. */
  static detectBase() {
    // .../fhem/fhemviz/index.html  ->  .../fhem
    const p = window.location.pathname;
    const i = p.indexOf("/fhemviz/");
    return i >= 0 ? p.slice(0, i) : "/fhem";
  }

  _url(cmd) {
    // FHEMWEB mit aktivem csrfToken verlangt fwcsrf bei ALLEN ?cmd=-Aufrufen
    // (auch lesenden wie jsonlist2/get), nicht nur bei set/attr.
    const csrf = this.csrfToken
      ? `&fwcsrf=${encodeURIComponent(this.csrfToken)}`
      : "";
    return `${this.base}?cmd=${encodeURIComponent(cmd)}&XHR=1${csrf}`;
  }

  /** CSRF-Token aus dem Header X-FHEM-csrfToken holen. */
  async fetchCsrfToken() {
    const r = await fetch(`${this.base}?XHR=1`, { credentials: "same-origin" });
    this.csrfToken = r.headers.get("X-FHEM-csrfToken") || "";
    return this.csrfToken;
  }

  /** get <device> config -> Sicht-Konfiguration (devspec/theme/readonly). */
  async getConfig(device) {
    const r = await fetch(this._url(`get ${device} config`), {
      credentials: "same-origin",
    });
    if (!r.ok) throw new Error(`get ${device} config: HTTP ${r.status}`);
    const text = (await r.text()).trim();
    if (!text) throw new Error(`get ${device} config: leere Antwort`);
    return JSON.parse(text);
  }

  /** Ersten TYPE=FHEMVIZ-Gerätenamen ermitteln (falls kein ?device= gesetzt). */
  async findVizDevice() {
    const snap = await this.snapshot("TYPE=FHEMVIZ");
    return snap.Results && snap.Results[0] ? snap.Results[0].Name : null;
  }

  /** Snapshot via jsonlist2. */
  async snapshot(devspec, readingRegex) {
    const cmd = "jsonlist2 " + devspec + (readingRegex ? " " + readingRegex : "");
    const r = await fetch(this._url(cmd), { credentials: "same-origin" });
    if (!r.ok) throw new Error(`jsonlist2 ${devspec}: HTTP ${r.status}`);
    const text = (await r.text()).trim();
    if (!text) throw new Error(`jsonlist2 ${devspec}: leere Antwort`);
    return JSON.parse(text);
  }

  /**
   * Live-Kanal (inform, Longpoll) oeffnen. Ruft onEvent(id, value) je
   * Reading-Aenderung; onStatus(state) fuer Verbindungszustand. Reconnect
   * automatisch. filter = Regex auf Geraetenamen.
   */
  connectInform({ filter = ".*", onEvent, onStatus }) {
    let stopped = false;
    const self = this;

    const run = async () => {
      while (!stopped) {
        const ctrl = new AbortController();
        self._informAbort = ctrl;
        try {
          const inform = `type=status;filter=${filter};fmt=JSON`;
          const url = `${self.base}?XHR=1&inform=${encodeURIComponent(inform)}`;
          const resp = await fetch(url, {
            credentials: "same-origin",
            signal: ctrl.signal,
          });
          if (!resp.ok || !resp.body) throw new Error("inform HTTP " + resp.status);
          onStatus && onStatus("live");

          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          // Watchdog: bleibt der Longpoll stumm (FHEM-Neustart, tote WLAN-
          // Verbindung, die kein Fehler-Event ausloest), wird nach IDLE_MS
          // abgebrochen -> reconnect. FHEMWEB sendet regelmaessig Keepalive-
          // Zeilen, echte Stille ueber 2,5 min gibt es im Betrieb nicht.
          const IDLE_MS = 150000;
          let idle = setTimeout(() => ctrl.abort(), IDLE_MS);
          try {
            while (!stopped) {
              const { value, done } = await reader.read();
              if (done) break;
              clearTimeout(idle);
              idle = setTimeout(() => ctrl.abort(), IDLE_MS);
              buf += decoder.decode(value, { stream: true });
              let nl;
              while ((nl = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (line) self._handleInformLine(line, onEvent);
              }
            }
          } finally {
            clearTimeout(idle);
          }
        } catch (e) {
          if (stopped) break;
          onStatus && onStatus("reconnect");
          // eslint-disable-next-line no-console
          console.warn("FHEMVIZ inform getrennt, reconnect in 3s:", e.message);
          await new Promise((res) => setTimeout(res, 3000));
        }
      }
    };
    run();

    return () => {
      stopped = true;
      if (self._informAbort) self._informAbort.abort();
    };
  }

  /** Eine inform-Zeile parsen: ["<dev>-<reading>","<raw>","<formatiert>"]. */
  _handleInformLine(line, onEvent) {
    let arr;
    try {
      arr = JSON.parse(line);
    } catch {
      return; // Nicht-JSON (Kommentar/Steuerzeile) ignorieren
    }
    if (!Array.isArray(arr) || typeof arr[0] !== "string") return;
    const id = arr[0];
    if (id.startsWith("#")) return; // FHEMWEB-Steuerzeile
    // Feld 2 = Rohwert (z. B. "off"). Feld 3 waere die FHEMWEB-HTML-
    // Darstellung (devStateIcon-SVG) - die wollen wir NICHT ins Datenmodell.
    const value = arr[1];
    onEvent && onEvent(id, value);
  }

  /** Schreibenden Befehl (set/attr) absetzen (CSRF via _url). */
  async command(cmd) {
    const r = await fetch(this._url(cmd), { credentials: "same-origin" });
    return r.text();
  }
}
