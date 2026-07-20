/*
 * FHEMVIZ - App-Einstiegspunkt (v0.7.0).
 * Tablet-Modus: bedienbar, Raum-Tabs unten.
 * TV-/Kiosk-Modus (?mode=tv oder attr mode tv): keine Bedienelemente,
 * grosse Ziffern, Szenen-Rotation (attr tvScenes "Raum:Sek,Raum:Sek"),
 * Event-Uebernahme via "set <viz> scene <raum> [sek]" - die Readings
 * kommen live ueber den bestehenden inform-Kanal.
 */

import { FhemClient } from "./fhem-client.js";
import { Store } from "./store.js";
import { renderLayout, collectRooms, resolveRoom, ALL_ROOMS, VIZ_ROOM_PREFIX } from "./layout.js";
import { registerCoreWidgets } from "./widgets/registry.js";

// Muss zur Modul-Version aus "get config" passen. Weicht sie ab, haengt
// entweder der Browser-Cache (Strg+F5) oder das Modul wurde nach dem
// update nicht neu geladen (reload 98_FHEMVIZ).
const SPA_VERSION = "v0.7.20";

const el = (id) => document.getElementById(id);

let versionWarn = "";
let configWarn = "";

function setStatus(text, kind = "") {
  const s = el("viz-status");
  if (!s) return;
  const warn = [versionWarn, configWarn].filter(Boolean).join(" · ");
  s.textContent = warn ? `${text} · ${warn}` : text;
  s.className = "viz-status" + (warn ? " viz-error" : kind ? " viz-" + kind : "");
}

function applyTheme(theme) {
  const rootAttr = document.documentElement;
  if (theme === "light" || theme === "dark") rootAttr.dataset.theme = theme;
  else delete rootAttr.dataset.theme; // auto -> Systemvorgabe
}

/* ------------------------------ TV-Controller ------------------------------ */

/**
 * tvScenes-Attribut parsen: "Solar:30,Wohnzimmer:20" -> [{room, sec}].
 * Ohne (gueltige) Angabe: alle sichtbaren Raeume mit je 20 s.
 */
function parseScenes(spec, fallbackRooms) {
  const list = String(spec || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const i = t.lastIndexOf(":");
      const room = i > 0 ? t.slice(0, i).trim() : t;
      const sec = i > 0 ? parseInt(t.slice(i + 1), 10) : NaN;
      return { room, sec: isNaN(sec) ? 20 : Math.max(5, sec) };
    })
    .filter((s) => s.room);
  if (list.length) return list;
  return fallbackRooms.map((r) => ({ room: r, sec: 20 }));
}

/** Szenen-Anzeigename: FHEMVIZ->-Praefix ausblenden, -> als Trenner. */
function sceneLabel(room) {
  const r = room.startsWith(VIZ_ROOM_PREFIX)
    ? room.slice(VIZ_ROOM_PREFIX.length)
    : room;
  return r.replace(/->/g, " \u203a ");
}

/**
 * Auto-Paging: Seiten-Offsets einer ueberlaufenden Szene, an KACHELZEILEN
 * ausgerichtet (keine halbierten Kacheln). [0] = passt auf eine Seite.
 */
function computePageOffsets(container) {
  const cRect = container.getBoundingClientRect();
  const base = container.scrollTop;
  const H = container.clientHeight;
  if (container.scrollHeight <= H + 4) return [0];

  // Zeilen ermitteln: Elemente mit gleicher Oberkante = eine Zeile;
  // Zeilen-Unterkante = groesste Unterkante (deckt vizSize-Spans ab).
  const rows = new Map();
  const items = container.querySelectorAll(
    ".viz-grid > *, .viz-group > h3, .viz-room > h2"
  );
  for (const item of items) {
    const r = item.getBoundingClientRect();
    if (!r.height) continue;
    const top = Math.round(r.top - cRect.top + base);
    const bottom = Math.ceil(r.bottom - cRect.top + base);
    rows.set(top, Math.max(rows.get(top) || 0, bottom));
  }

  const pages = [0];
  for (const [top, bottom] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const cur = pages[pages.length - 1];
    // Zeile passt nicht mehr auf die aktuelle Seite -> neue Seite ab hier.
    if (bottom - cur > H && top > cur) pages.push(top);
  }
  return pages;
}

/**
 * Status-Chips (attr statusBar): "geraet[,geraet:reading[:einheit]],..."
 * Immer sichtbare Zusammenfassung im Header - structure-Geraete werden zu
 * "Alias: n offen", Readings zu Wert-Chips, sonst Zustands-Chip.
 * Live ueber Store-Abos (inkl. structure-Mitglieder); Tablet: Chip tippen
 * springt zum ersten FHEMVIZ->-Raum des Geraets.
 */
function setupStatusBar(store, spec, opts) {
  const bar = el("viz-statusbar");
  const plain = (x) => String(x ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const entries = String(spec || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const [dev, reading, unit] = t.split(":").map((x) => (x || "").trim());
      return { dev, reading, unit, device: store.get(dev) };
    })
    .filter((c) => c.device);
  if (!entries.length) return;
  bar.hidden = false;

  const contactState = (st) => {
    st = plain(st).toLowerCase();
    if (/^(open|opened|auf|offen|on)$/.test(st)) return "open";
    if (/^(tilted|gekippt)$/.test(st)) return "tilted";
    return "closed";
  };
  const members = (d) =>
    (d.internals && d.internals.TYPE) === "structure"
      ? String(d.internals.DEF || "")
          .split(/\s+/)
          .slice(1)
          .map((n) => n.replace(/,$/, ""))
          .map((n) => store.get(n))
          .filter(Boolean)
      : [];

  function chipData(c) {
    const alias = (c.device.attr && c.device.attr.alias) || c.device.name;
    if (c.reading) {
      const v = plain((c.device.readings || {})[c.reading] ?? "–");
      return { text: `${alias} ${v}${c.unit ? " " + c.unit : ""}`, warn: false };
    }
    const mem = members(c.device);
    if (mem.length) {
      const st = mem.map((m) => contactState(m.state));
      const open = st.filter((x) => x === "open").length;
      const tilted = st.filter((x) => x === "tilted").length;
      const parts = [];
      if (open) parts.push(`${open} offen`);
      if (tilted) parts.push(`${tilted} gekippt`);
      return parts.length
        ? { text: `${alias}: ${parts.join(" · ")}`, warn: true }
        : { text: `${alias} zu`, warn: false };
    }
    const st = plain(c.device.state);
    const warn = /^(on|an|open|offen|auf|true|running|l(ä|ae)uft|1)$/i.test(st);
    return { text: `${alias} ${st}`, warn };
  }

  function jumpRoom(c) {
    const rooms = String((c.device.attr || {}).room || "")
      .split(",")
      .map((r) => r.trim());
    return rooms.find((r) => r.startsWith(VIZ_ROOM_PREFIX)) || rooms[0] || null;
  }

  function render() {
    bar.textContent = "";
    for (const c of entries) {
      const d = chipData(c);
      const chip = document.createElement(opts.tv ? "span" : "button");
      chip.className = "viz-chip" + (d.warn ? " warn" : "");
      chip.textContent = d.text;
      if (!opts.tv) {
        const room = jumpRoom(c);
        if (room) chip.addEventListener("click", () => opts.jump(room));
      }
      bar.appendChild(chip);
    }
  }

  const watch = new Set();
  entries.forEach((c) => {
    watch.add(c.device.name);
    members(c.device).forEach((m) => watch.add(m.name));
  });
  watch.forEach((n) => store.subscribe(n, render));
  render();
}

class TvController {
  constructor(root, store, client, baseOpts, scenes) {
    this.root = root;
    this.store = store;
    this.client = client;
    this.baseOpts = baseOpts;
    this.scenes = scenes;
    this.idx = 0;
    this.timer = null;
    this.eventTimer = null;
    this.pageTimers = [];
  }

  start() {
    el("viz-clock").hidden = false;
    el("viz-progress").hidden = false;
    el("viz-scene").hidden = false;
    // Feste TV-Flaeche: Hoehe des Headers als CSS-Variable bereitstellen.
    document.documentElement.style.setProperty(
      "--viz-header-h",
      el("viz-header").offsetHeight + "px"
    );
    this._tickClock();
    this._clockTimer = setInterval(() => this._tickClock(), 1000);
    this._show(this.scenes[this.idx]);
  }

  _tickClock() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    el("viz-clock").textContent =
      p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    // Im TV-Header steht das Datum statt des FHEMVIZ-Schriftzugs.
    el("viz-title").textContent = d.toLocaleDateString("de-DE", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  _render(room) {
    renderLayout(this.root, this.store, this.client, {
      ...this.baseOpts,
      activeRoom: room,
      showTabs: false,
    });
  }

  _progress(sec) {
    const prog = el("viz-progress");
    prog.classList.remove("run");
    void prog.offsetWidth; // Animation neu starten
    prog.style.setProperty("--viz-scene-sec", sec + "s");
    prog.classList.add("run");
  }

  /**
   * Auto-Paging: laeuft eine Szene ueber, wird die Szenenzeit in Seiten
   * geteilt und an Kachelzeilen ausgerichtet weitergeblaettert -
   * auf dem Fernseher wird nie gescrollt, es geht automatisch.
   */
  _page(sec, labelBase) {
    this.pageTimers.forEach(clearTimeout);
    this.pageTimers = [];
    this.root.scrollTop = 0;

    const pages = computePageOffsets(this.root);
    if (pages.length <= 1) {
      el("viz-scene").textContent = labelBase;
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = (sec * 1000) / pages.length;
    el("viz-scene").textContent = `${labelBase} · 1/${pages.length}`;
    pages.slice(1).forEach((top, i) => {
      this.pageTimers.push(
        setTimeout(() => {
          this.root.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
          el("viz-scene").textContent = `${labelBase} · ${i + 2}/${pages.length}`;
        }, step * (i + 1))
      );
    });
  }

  _show(scene) {
    this._render(scene.room);
    const label = scene.room === ALL_ROOMS ? "Alle" : sceneLabel(scene.room);
    this._page(scene.sec, label);
    this._progress(scene.sec);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this._next(), scene.sec * 1000);
  }

  _next() {
    this.idx = (this.idx + 1) % this.scenes.length;
    this._show(this.scenes[this.idx]);
  }

  /** Geraete-Event: Szene uebernimmt fuer <sec> Sekunden den Schirm. */
  forceScene(room, sec) {
    // Unbekannte Szene: Event ignorieren statt "Alle" zu zeigen.
    const resolved = resolveRoom(collectRooms(this.store, this.baseOpts), room);
    if (!resolved) {
      // eslint-disable-next-line no-console
      console.warn(`FHEMVIZ: Szene "${room}" nicht in der Sicht - Event ignoriert`);
      return;
    }
    clearTimeout(this.timer);
    clearTimeout(this.eventTimer);
    document.body.classList.add("viz-alert");
    this._render(resolved);
    this._page(sec, sceneLabel(resolved) + " · Event");
    this._progress(sec);
    this.eventTimer = setTimeout(() => {
      document.body.classList.remove("viz-alert");
      this._show(this.scenes[this.idx]); // Rotation dort fortsetzen
    }, sec * 1000);
  }
}

/* --------------------------------- Start ----------------------------------- */

async function main() {
  const root = el("fhemviz-app");
  if (!root) return;

  try {
    setStatus("verbinde mit FHEMWEB…");
    const client = new FhemClient();
    await client.fetchCsrfToken();

    // FHEMVIZ-Gerät bestimmen (?device=… oder erstes TYPE=FHEMVIZ).
    const params = new URLSearchParams(window.location.search);
    const vizDevice = params.get("device") || (await client.findVizDevice());
    if (!vizDevice) {
      setStatus(
        "Kein FHEMVIZ-Gerät gefunden. Lege eines an: define myViz FHEMVIZ",
        "error"
      );
      return;
    }

    // Konfiguration vom Modul holen; URL uebersteuert den Modus.
    const cfg = await client.getConfig(vizDevice);
    applyTheme(cfg.theme);

    // Versions-Waechter: Modul- und SPA-Version muessen zusammenpassen.
    if (cfg.version && cfg.version !== SPA_VERSION) {
      versionWarn =
        `Versionskonflikt: Modul ${cfg.version} / Oberfläche ${SPA_VERSION}` +
        ` – Strg+F5 (Browser-Cache) bzw. reload 98_FHEMVIZ`;
    }
    const urlMode = (params.get("mode") || "").toLowerCase();
    const mode = urlMode === "tv" || urlMode === "tablet" ? urlMode : cfg.mode || "tablet";
    document.documentElement.dataset.vizmode = mode;
    const tv = mode === "tv";

    if (!cfg.devspec) {
      setStatus(
        `Gerät ${vizDevice}: kein devspec gesetzt (attr ${vizDevice} devspec …)`,
        "error"
      );
      return;
    }

    // Snapshot laden.
    const store = new Store();
    store.loadSnapshot(await client.snapshot(cfg.devspec));
    const count = store.all().length;

    registerCoreWidgets();
    // Eigene Widgets laden (optional; Datei gehoert dem Nutzer und wird
    // von FHEM update nie ueberschrieben - fehlt sie, still weiter).
    try {
      await import("./widgets/custom/index.js");
    } catch {
      /* keine Custom-Widgets vorhanden */
    }
    const baseOpts = {
      showRooms: cfg.showRooms,
      hideRooms: cfg.hideRooms,
      hideTypes: cfg.hideTypes,
      hideStates: cfg.hideStates,
      readonly: tv || cfg.readonly === true,
      tv,
    };

    // Status-Chips (VOR dem TV-Start, damit die Flaechenmessung stimmt).
    setupStatusBar(store, cfg.statusBar, {
      tv,
      jump: (room) =>
        renderLayout(root, store, client, { ...baseOpts, activeRoom: room }),
    });

    // Rendern: TV startet die Szenen-Rotation, Tablet die Tab-Ansicht.
    let tvc = null;
    if (tv) {
      const roomsAvail = collectRooms(store, baseOpts);
      const wanted = parseScenes(cfg.tvScenes, roomsAvail);
      // Szenen beim Start aufloesen: unbekannte Raeume werden uebersprungen
      // und gemeldet - NICHT stillschweigend "Alle" gezeigt.
      const scenes = [];
      const missing = [];
      for (const sc of wanted) {
        const r = sc.room === ALL_ROOMS ? sc.room : resolveRoom(roomsAvail, sc.room);
        if (r) scenes.push({ room: r, sec: sc.sec });
        else missing.push(sc.room);
      }
      if (missing.length) {
        configWarn = `Szene(n) nicht in der Sicht: ${missing.join(", ")} (devspec/room pruefen)`;
      }
      if (scenes.length === 0) {
        scenes.push(...roomsAvail.map((r) => ({ room: r, sec: 20 })));
      }
      tvc = new TvController(root, store, client, baseOpts, scenes);
      tvc.start();
    } else {
      renderLayout(root, store, client, baseOpts);
    }
    setStatus(`${count} Gerät(e)`);

    // Live-Kanal: Geraete der Sicht + das FHEMVIZ-Geraet selbst
    // (dessen scene-Readings steuern die TV-Szenen).
    let sceneDuration = 30;
    const names = store.all().map((d) => d.name);
    const filter = [...names, vizDevice].join("|") || ".*";
    client.connectInform({
      filter,
      onEvent: (id, value) => {
        if (id === vizDevice + "-sceneDuration") {
          const n = parseInt(value, 10);
          if (!isNaN(n) && n > 0) sceneDuration = n;
          return;
        }
        if (id === vizDevice + "-scene") {
          if (tvc) tvc.forceScene(value, sceneDuration);
          return;
        }
        if (id === vizDevice || id.startsWith(vizDevice + "-")) return;
        store.applyEvent(id, value);
      },
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
