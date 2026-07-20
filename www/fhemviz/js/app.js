/*
 * FHEMVIZ - App-Einstiegspunkt (PoC v0.2.0).
 * Verdrahtet: fhem-client (CSRF + jsonlist2-Snapshot + inform-Live) ->
 * store -> layout (Auto-Layout) -> widgets. Setzt eine sichtbare
 * Statusanzeige, damit Fehler sofort erkennbar sind.
 */

import { FhemClient } from "./fhem-client.js";
import { Store } from "./store.js";
import { renderLayout } from "./layout.js";
import { registerCoreWidgets } from "./widgets/registry.js";

const statusEl = () => document.getElementById("viz-status");

function setStatus(text, kind = "") {
  const el = statusEl();
  if (!el) return;
  el.textContent = text;
  el.className = "viz-status" + (kind ? " viz-" + kind : "");
}

function applyTheme(theme) {
  const rootAttr = document.documentElement;
  if (theme === "light" || theme === "dark") rootAttr.dataset.theme = theme;
  else delete rootAttr.dataset.theme; // auto -> Systemvorgabe
}

async function main() {
  const root = document.getElementById("fhemviz-app");
  if (!root) return;

  try {
    setStatus("verbinde mit FHEMWEB…");
    const client = new FhemClient();
    await client.fetchCsrfToken();

    // FHEMVIZ-Gerät bestimmen (?device=… oder erstes TYPE=FHEMVIZ).
    const params = new URLSearchParams(window.location.search);
    let vizDevice = params.get("device") || (await client.findVizDevice());
    if (!vizDevice) {
      setStatus(
        "Kein FHEMVIZ-Gerät gefunden. Lege eines an: define myViz FHEMVIZ",
        "error"
      );
      return;
    }

    // Konfiguration (devspec/theme/readonly) vom Modul holen.
    const cfg = await client.getConfig(vizDevice);
    applyTheme(cfg.theme);

    if (!cfg.devspec) {
      setStatus(
        `Gerät ${vizDevice}: kein devspec gesetzt (attr ${vizDevice} devspec …)`,
        "error"
      );
      return;
    }

    // Snapshot laden.
    const store = new Store();
    const snap = await client.snapshot(cfg.devspec);
    store.loadSnapshot(snap);
    const count = store.all().length;

    // Rendern.
    registerCoreWidgets();
    renderLayout(root, store, client, {
      hideRooms: cfg.hideRooms,
      hideTypes: cfg.hideTypes,
      hideStates: cfg.hideStates,
    });
    setStatus(`${count} Gerät(e) geladen – warte auf Live-Events…`);

    // Live-Kanal öffnen (Filter auf die geladenen Geräte).
    const names = store.all().map((d) => d.name);
    const filter = names.length ? names.join("|") : ".*";
    client.connectInform({
      filter,
      onEvent: (id, value) => store.applyEvent(id, value),
      onStatus: (s) => {
        if (s === "live") setStatus(`${count} Gerät(e) · live`, "live");
        else if (s === "reconnect") setStatus("Verbindung verloren – reconnect…");
      },
    });
  } catch (e) {
    setStatus("Fehler: " + (e && e.message ? e.message : e), "error");
    // eslint-disable-next-line no-console
    console.error("FHEMVIZ Startfehler:", e);
  }
}

main();
