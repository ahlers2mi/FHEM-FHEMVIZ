/*
 * FHEMVIZ - FHEMWEB-Client (Snapshot + Live-Push + CSRF-Set).
 *
 * GRUNDGERUEST / SCAFFOLD (v0.1.0) - Methoden sind Stubs ohne Logik.
 * Nutzt ausschliesslich die vorhandene FHEMWEB-API (nichts Eigenes), §2:
 *   - Snapshot:  jsonlist2 <devspec> [<reading-regex>]
 *   - Live-Push: GET /fhem?XHR=1&inform=type=status;filter=<regex>;fmt=JSON
 *                (WebSocket bevorzugt, Longpoll-Fallback)
 *   - Set:       GET /fhem?cmd=set <dev> <cmd>&fwcsrf=<token>&XHR=1
 */

export class FhemClient {
  /**
   * @param {object} opts
   * @param {string} [opts.base] - Basis-URL zu FHEMWEB (Default: same-origin).
   */
  constructor(opts = {}) {
    this.base = opts.base || "";
    this.csrfToken = null; // aus Header X-FHEM-csrfToken, §2.3
  }

  /** Initialen CSRF-Token holen (Header X-FHEM-csrfToken). TODO. */
  async fetchCsrfToken() {
    throw new Error("FHEMVIZ scaffold: fetchCsrfToken() noch nicht implementiert");
  }

  /** Snapshot via jsonlist2 laden. TODO. */
  async snapshot(/* devspec, readingRegex */) {
    throw new Error("FHEMVIZ scaffold: snapshot() noch nicht implementiert");
  }

  /** Live-Kanal (inform) oeffnen; onEvent pro Reading-Aenderung. TODO. */
  connectInform(/* { filter, since, onEvent, onError } */) {
    throw new Error("FHEMVIZ scaffold: connectInform() noch nicht implementiert");
  }

  /** Schreibenden Befehl (set/attr) mit CSRF absetzen. TODO. */
  async command(/* cmd */) {
    throw new Error("FHEMVIZ scaffold: command() noch nicht implementiert");
  }
}
