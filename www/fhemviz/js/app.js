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
const SPA_VERSION = "v0.15.0";

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

  // ?zoom= skaliert die Seite: getBoundingClientRect liefert dann visuelle
  // (skalierte) Pixel, scrollTop/clientHeight aber lokale CSS-Pixel.
  // Der Faktor rechnet die Rects zurueck, damit beide Welten zusammenpassen.
  const scale = container.offsetWidth
    ? cRect.width / container.offsetWidth
    : 1;

  // Zeilen ermitteln: Elemente mit gleicher Oberkante = eine Zeile;
  // Zeilen-Unterkante = groesste Unterkante (deckt vizSize-Spans ab).
  const rows = new Map();
  const items = container.querySelectorAll(
    ".viz-grid > *, .viz-group > h3, .viz-room > h2"
  );
  for (const item of items) {
    const r = item.getBoundingClientRect();
    if (!r.height) continue;
    const top = Math.round((r.top - cRect.top) / scale + base);
    const bottom = Math.ceil((r.bottom - cRect.top) / scale + base);
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

  // Praefix-tolerant: "closed (battery low)" u. ae. zaehlen als closed.
  const contactState = (st) => {
    st = plain(st).toLowerCase();
    if (/^(open|opened|auf|offen|on)\b/.test(st)) return "open";
    if (/^(tilted|gekippt)\b/.test(st)) return "tilted";
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
    // Nichtssagende Zustaende (structure "undefined" u. ae.) nicht anzeigen.
    if (/^(undefined|unknown|\?+)?$/i.test(st)) return { text: `${alias} –`, warn: false };
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
    this.pinned = null; // set <viz> page <raum> - Rotation pausiert
    this.active = false; // false = Touch-Uebernahme (Tablet-Ansicht)
    this._resizeBound = false;
  }

  /** Startet (oder setzt fort, z. B. nach Touch-Uebernahme). */
  start() {
    this.active = true;
    el("viz-clock").hidden = false;
    el("viz-progress").hidden = false;
    el("viz-scene").hidden = false;
    this._fit();
    // Bei Groessenaenderung neu messen und die aktuelle Ansicht neu
    // blaettern (Seitenoffsets haengen an der Flaechenhoehe).
    if (!this._resizeBound) {
      this._resizeBound = true;
      window.addEventListener("resize", () => {
        if (!this.active) return;
        this._fit();
        if (this.pinned) this._showPinned();
        else this._show(this.scenes[this.idx]);
      });
    }
    this._tickClock();
    clearInterval(this._clockTimer);
    this._clockTimer = setInterval(() => this._tickClock(), 1000);
    if (this.pinned) this._showPinned();
    else this._show(this.scenes[this.idx]);
  }

  /** Haelt die Rotation an und raeumt die TV-Header-Elemente weg. */
  stop() {
    this.active = false;
    clearTimeout(this.timer);
    clearTimeout(this.eventTimer);
    this.pageTimers.forEach(clearTimeout);
    this.pageTimers = [];
    clearInterval(this._clockTimer);
    document.body.classList.remove("viz-alert");
    el("viz-clock").hidden = true;
    el("viz-progress").hidden = true;
    el("viz-scene").hidden = true;
    el("viz-title").textContent = "FHEMVIZ";
  }

  /**
   * Feste TV-Flaeche vermessen: Viewport-Hoehe in LOKALEN CSS-Pixeln
   * (innerHeight ist zoom-unabhaengig, der Inhalt skaliert aber mit
   * ?zoom= - deshalb teilen) plus Header-Hoehe als CSS-Variablen.
   * 100vh alleine skaliert unter zoom nicht mit -> Flaeche waere zu hoch.
   */
  _fit() {
    const zoom = parseFloat(document.documentElement.dataset.vizzoom) || 1;
    document.documentElement.style.setProperty(
      "--viz-vh",
      Math.floor(window.innerHeight / zoom) + "px"
    );
    document.documentElement.style.setProperty(
      "--viz-header-h",
      el("viz-header").offsetHeight + "px"
    );
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
    // Waehrend der Touch-Uebernahme bedient gerade jemand das Geraet -
    // Event nicht dazwischenrendern.
    if (!this.active) return;
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
      // Nach dem Event zurueck: zur gepinnten Seite oder in die Rotation.
      if (this.pinned) this._showPinned();
      else this._show(this.scenes[this.idx]);
    }, sec * 1000);
  }

  /**
   * set <viz> page <raum>: Seite DAUERHAFT anzeigen (kein Timeout).
   * Die Rotation pausiert; laeuft die Seite ueber, blaettert das
   * Auto-Paging zyklisch weiter (auf dem TV wird nie gescrollt).
   */
  pin(room) {
    const resolved = resolveRoom(collectRooms(this.store, this.baseOpts), room);
    if (!resolved) {
      // eslint-disable-next-line no-console
      console.warn(`FHEMVIZ: Seite "${room}" nicht in der Sicht - ignoriert`);
      return;
    }
    this.pinned = resolved;
    // Touch-Uebernahme aktiv: nur merken, gezeigt wird bei der Rueckkehr.
    if (!this.active) return;
    clearTimeout(this.timer);
    clearTimeout(this.eventTimer);
    document.body.classList.remove("viz-alert");
    this._showPinned();
  }

  /** set <viz> page auto: Pin aufheben, Rotation laeuft weiter. */
  unpin() {
    if (!this.pinned) return;
    this.pinned = null;
    if (!this.active) return;
    clearTimeout(this.timer);
    this._show(this.scenes[this.idx]);
  }

  _showPinned() {
    // Blaettertakt aus tvScenes uebernehmen, sonst 20 s pro Durchlauf.
    const sc = this.scenes.find((s) => s.room === this.pinned);
    const sec = sc ? sc.sec : 20;
    this._render(this.pinned);
    // Kein Fortschrittsbalken: die Seite laeuft nicht ab.
    el("viz-progress").classList.remove("run");
    this._cyclePinned(sec);
  }

  /** Blaetter-Schleife der gepinnten Seite - OHNE Re-Render (kein Flackern). */
  _cyclePinned(sec) {
    this._page(sec, sceneLabel(this.pinned) + " · \u{1F4CC}");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.pinned) this._cyclePinned(sec);
    }, sec * 1000);
  }
}

/* --------------------------------- Zoom -------------------------------------
 * Skalierung der Oberflaeche: attr zoom am FHEMVIZ-Geraet ist der Default,
 * ?zoom= in der URL geht vor (fuer abweichende Einzelgeraete). Werte 0.5-3,
 * auch als Prozent (130).
 *
 * Bewusst NUR transform:scale - fuer alle Browser gleich. CSS zoom wird
 * von WebViews teils ignoriert oder ohne Breiten-/Hoehen-Anpassung
 * gerendert (Kacheln rechts/unten abgeschnitten), und die Engines melden
 * das unterschiedlich zurueck. transform ist reines Rendering: der body
 * wird auf Viewport/zoom verkleinert und hochskaliert - deterministisch
 * in jeder Engine. Er scrollt selbst (CSS: html[data-vizzoom]), damit
 * fixe Elemente (Tab-Leiste) am sichtbaren Rand haengen.
 */
function applyZoom(urlValue, cfgValue) {
  const parse = (s) => {
    let z = parseFloat(String(s ?? "").replace(",", "."));
    if (isNaN(z) || z <= 0) return null;
    if (z > 5) z = z / 100; // 130 -> 1.3
    return Math.min(3, Math.max(0.5, z));
  };
  const zoom = parse(urlValue) ?? parse(cfgValue);
  if (!zoom || zoom === 1) return "";
  // Faktor fuer die TV-Flaechenmessung (_fit) merken; das data-Attribut
  // aktiviert zugleich die Scroll-Regeln in fhemviz.css.
  document.documentElement.dataset.vizzoom = String(zoom);
  const b = document.body.style;
  b.transform = `scale(${zoom})`;
  b.transformOrigin = "0 0";
  b.width = `calc(100% / ${zoom})`;
  b.height = `calc(100% / ${zoom})`;
  // Diagnose fuer die Statuszeile: kommt der Wert an UND rendert die
  // Engine die Skalierung? Nach dem Anwenden nachmessen: mit wirksamem
  // transform ist der body visuell wieder viewportbreit; hat die Engine
  // transform verworfen, bleibt er auf 100%/zoom stehen.
  const applied =
    getComputedStyle(document.body).transform !== "none" &&
    Math.abs(document.body.getBoundingClientRect().width - window.innerWidth) < 4;
  return ` · Zoom ${zoom} ${applied ? "✓" : "✗"}`;
}

/* ------------------------------ Show-Overlay -------------------------------
 * set <viz> show <url> [sek]: blendet eine Webseite oder ein Bild (Kamera-
 * Snapshot) als Vollbild-Overlay UEBER dem Dashboard ein - die SPA laeuft
 * darunter weiter (kein Reload, Live-Verbindung bleibt). Nach Ablauf oder
 * per Tipp verschwindet das Overlay. "set <viz> show off" schliesst sofort.
 * Hinweis: Fremdseiten koennen das Einbetten per X-Frame-Options verbieten;
 * Bilder und FHEM-eigene Seiten funktionieren immer.
 */

let overlayTimer = null;

function hideOverlay() {
  clearTimeout(overlayTimer);
  const o = el("viz-overlay");
  if (o) o.remove();
}

function showOverlay(url, sec) {
  hideOverlay();
  if (!/^https?:\/\/|^\//i.test(url)) {
    // eslint-disable-next-line no-console
    console.warn(`FHEMVIZ: show "${url}" ist keine URL - ignoriert`);
    return;
  }
  const o = document.createElement("div");
  o.id = "viz-overlay";
  const isImg = /\.(jpe?g|png|gif|webp|svg|bmp)([?#].*)?$/i.test(url);
  const child = document.createElement(isImg ? "img" : "iframe");
  child.src = url;
  o.appendChild(child);
  const hint = document.createElement("div");
  hint.className = "viz-overlay-hint";
  hint.textContent = "Tippen zum Schließen";
  o.appendChild(hint);
  // stopPropagation: der Schliess-Tipp darf nicht gleichzeitig die
  // tvTouch-Uebernahme ausloesen.
  o.addEventListener("click", (e) => {
    e.stopPropagation();
    hideOverlay();
  });
  document.body.appendChild(o);
  overlayTimer = setTimeout(hideOverlay, Math.max(3, sec) * 1000);
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

    // ?zoom= aus der URL merken; angewendet wird nach dem Config-Laden
    // (attr zoom am Geraet ist der Default, die URL geht vor).
    const urlZoom = String(params.get("zoom") || "");

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
    const zoomLabel = applyZoom(urlZoom, cfg.zoom);

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

    // ?room=Solar (alias ?scene=): Startseite. TV beginnt die Rotation mit
    // diesem Raum, Tablet oeffnet den Tab (statt des zuletzt gemerkten).
    // Kurzname reicht - FHEMVIZ-> wird automatisch probiert.
    const startRoom = params.get("room") || params.get("scene") || "";
    // Gepinnte Seite (Reading "page" via set <viz> page <raum>): gilt fuer
    // neu verbundene Browser als Startseite; die URL geht vor.
    const pagePin = /^(auto|off|none)?$/i.test(String(cfg.page || "").trim())
      ? ""
      : String(cfg.page).trim();

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
      if (startRoom) {
        const r = resolveRoom(roomsAvail, startRoom);
        if (!r) {
          configWarn = [configWarn, `Startraum "${startRoom}" nicht in der Sicht`]
            .filter(Boolean)
            .join(" · ");
        } else {
          const i = scenes.findIndex((s) => s.room === r);
          // Teil der Rotation -> dort einsteigen, sonst einmalig vorn einreihen.
          if (i >= 0) tvc.idx = i;
          else scenes.unshift({ room: r, sec: 20 });
        }
      }
      tvc.start();
      // Gepinnte Seite wiederherstellen (URL-?room= geht vor).
      if (!startRoom && pagePin) tvc.pin(pagePin);

      // Touch-Uebernahme (attr tvTouch, Default 30 s, 0 = aus): ein Tipp
      // auf den Schirm wechselt in die bedienbare Tablet-Ansicht, nach
      // tvTouch Sekunden ohne Aktion laeuft die Rotation weiter - damit
      // taugt der TV-Modus als "Bildschirmschoner" fuer Tablets.
      const touchSec = (() => {
        const n = parseInt(cfg.tvTouch, 10);
        return isNaN(n) ? 30 : Math.max(0, n);
      })();
      if (touchSec > 0) {
        const tabletOpts = { ...baseOpts, readonly: cfg.readonly === true, tv: false };
        let idleTimer = null;
        const armIdle = () => {
          clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            if (tvc.active) return;
            document.documentElement.dataset.vizmode = "tv";
            tvc.start();
          }, touchSec * 1000);
        };
        // "click" statt pointerdown: feuert nach abgeschlossenem Tipp,
        // damit derselbe Tipp nicht versehentlich einen Schalter der
        // frisch gerenderten Tablet-Ansicht trifft.
        window.addEventListener("click", () => {
          if (!tvc.active) return;
          tvc.stop();
          document.documentElement.dataset.vizmode = "tablet";
          renderLayout(root, store, client, tabletOpts);
          armIdle();
        });
        // Jede Interaktion in der Tablet-Ansicht verlaengert die Frist.
        for (const ev of ["pointerdown", "wheel", "keydown", "touchmove"]) {
          window.addEventListener(
            ev,
            () => {
              if (!tvc.active) armIdle();
            },
            { passive: true }
          );
        }
      }
    } else {
      let activeRoom = null;
      const want = startRoom || pagePin;
      if (want) {
        activeRoom = resolveRoom(collectRooms(store, baseOpts), want);
        if (!activeRoom && startRoom) {
          configWarn = `Startraum "${startRoom}" nicht in der Sicht`;
        }
      }
      renderLayout(
        root,
        store,
        client,
        activeRoom ? { ...baseOpts, activeRoom } : baseOpts
      );
    }
    setStatus(`${count} Gerät(e)${zoomLabel}`);

    // Live-Kanal: Geraete der Sicht + das FHEMVIZ-Geraet selbst
    // (dessen scene-Readings steuern die TV-Szenen).
    let sceneDuration = 30;
    let showDuration = 30;
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
        // set <viz> show <url> [sek]: Vollbild-Overlay (Kamera/Webseite).
        if (id === vizDevice + "-showDuration") {
          const n = parseInt(value, 10);
          if (!isNaN(n) && n > 0) showDuration = n;
          return;
        }
        if (id === vizDevice + "-show") {
          const v = String(value).trim();
          if (!v || /^(off|none|auto)$/i.test(v)) hideOverlay();
          else showOverlay(v, showDuration);
          return;
        }
        // set <viz> page <raum>|auto: dauerhafte Umschaltung. TV pinnt die
        // Seite (bzw. kehrt bei "auto" zur Rotation zurueck), das Tablet
        // wechselt den Tab.
        if (id === vizDevice + "-page") {
          const v = String(value).trim();
          const off = !v || /^(auto|off|none)$/i.test(v);
          if (tvc) {
            if (off) tvc.unpin();
            else tvc.pin(v);
          } else if (!off) {
            const r = resolveRoom(collectRooms(store, baseOpts), v);
            if (r) renderLayout(root, store, client, { ...baseOpts, activeRoom: r });
          }
          return;
        }
        if (id === vizDevice || id.startsWith(vizDevice + "-")) return;
        store.applyEvent(id, value);
      },
      onStatus: (s) => {
        if (s === "live") setStatus(`${count} Gerät(e) · live${zoomLabel}`, "live");
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
