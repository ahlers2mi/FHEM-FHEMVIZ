// Lage-Seite als Meldungsliste (Skin signal, v0.40.0).
//
// Was schiefgehen kann: der Block zeigt nicht das Wichtigste (Stufe schlaegt
// Reihenfolge), ein Platzhalter bleibt als "[reading]" stehen, die Liste
// laeuft unten aus dem Schirm, "seit" zeigt den Zeitstempel einer Leistung,
// die Kopfzeile wiederholt Uhr und Kennzahlen - und der Skin laedt die
// Bento-Regeln nicht mit (dann fehlt in der Tablet-Ansicht die Raum-Schiene).

const z = (n) => String(n).padStart(2, "0");
function vor(minuten) {
  const d = new Date(Date.now() - minuten * 60000);
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}
function datum(tage) {
  const d = new Date(); d.setDate(d.getDate() + tage);
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function dazu(liste, name, state, attr = {}, readings = {}, minuten = 30) {
  const R = { state: { Value: state, Time: vor(minuten) } };
  for (const [k, v] of Object.entries(readings)) R[k] = { Value: v, Time: vor(minuten) };
  liste.push({
    Name: name, PossibleSets: "", Internals: { STATE: state, TYPE: "dummy", NAME: name },
    Attributes: { room: "FHEMVIZ->Stuff", ...attr }, Readings: R,
  });
}
function setze(liste, name, readings, minuten = 5) {
  const d = liste.find((g) => g.Name === name);
  for (const [k, v] of Object.entries(readings)) d.Readings[k] = { Value: v, Time: vor(minuten) };
}

/** Das Haus an einem Novemberabend: Tor offen, Tesla kommt, drei Hinweise. */
function haus(liste, { tor = "up" } = {}) {
  dazu(liste, "d_garage_neu", tor === "down" ? "Zu" : "Auf",
       { alias: "Segmenttor", vizIcon: "tor", vizStates: "up:offen:warn,down:zu:ok" }, { icon: tor }, 21);
  // Ein Schalter: bewusst OHNE vizIcon (das machte seine Kachel auf den anderen
  // Seiten zur Symbol-Kachel) - das Symbol kommt aus showIf ("blau:alarm").
  dazu(liste, "myalarm", "on", { alias: "Alarm Anlage" }, {}, 600);
  dazu(liste, "rp_d_Wechselrichter_all_modus", "winter",
       { alias: "Wechselrichter Modus", vizIcon: "frost", vizStates: "winter:Wintermodus aktiv:warn" }, {}, 5 * 1440);
  dazu(liste, "d_blumen_giessen", "on", { alias: "Blumen gießen", vizIcon: "wasser" }, {}, 3 * 1440);
  dazu(liste, "MQTT2_BlitzWolf3", "on", { alias: "Pumpe Keller", vizIcon: "pumpe" }, { ENERGY_Power: "0" }, 1);
  dazu(liste, "d_lage_kalender", `${datum(1)} 19:30 Jan Ahlers\n${datum(3)} 00:00 Laternenumzug`,
       { alias: "Termine", vizWidget: "agenda" });
  // Der Kalender fuehrt die Terminliste im Reading STATE (darauf prueft showIf).
  const muell = `${datum(1)} 06:00 Gelbe Tonne Appel/Darup/Schap.\n${datum(9)} 06:00 Restmüll`;
  dazu(liste, "rem_d_cal_muell", muell, { alias: "Müllabfuhr", vizIcon: "tonne" }, { STATE: muell });
  liste.find((g) => g.Name === "MQTT2_Tesla_Model3").Attributes.vizIcon = "auto";
  setze(liste, "MQTT2_Tesla_Model3", {
    heimkehr: "on", active_route_minutes_to_arrival: "11.6", battery_level: "80", battery_range_km: "423.4",
  });
}

const SHOWIF = [
  "MQTT2_BlitzWolf3:ENERGY_Power>10 => rot | Die Pumpe im Keller läuft",
  "myalarm:state=on => blau:alarm | Alarmanlage ist scharf | -",
  "d_garage_neu:icon!=down => rot | Das Segmenttor steht offen",
  "MQTT2_Tesla_Model3:heimkehr!=off => blau | Der Tesla kommt in [active_route_minutes_to_arrival:0] Minuten | Akku [battery_level] %, [battery_range_km:0] km Reichweite",
  "rp_d_Wechselrichter_all_modus:state=winter => blau | Wechselrichter läuft im Wintermodus",
  "rem_d_cal_muell:STATE~{morgen} => gelb | Morgen: [morgen] | -",
  "d_blumen_giessen:state=on => gelb | Blumen gießen",
  "st_fenster:state!=closed",
  "d_lage_kalender=2x1",
].join("\n");

const CFG = { tvScenes: "#lage:600", skin: "signal", showIf: SHOWIF, maxTiles: "" };

const lese = (page) =>
  page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const erste = q(".lg-erste");
    const seite = q(".viz-lg");
    const app = document.getElementById("fhemviz-app");
    const sichtbar = (id) => { const e = document.getElementById(id); return !!e && e.offsetParent !== null && !e.hidden; };
    const liste = q(".lg-liste");
    const zeilen = [...document.querySelectorAll(".lg-liste li")];
    return {
      da: !!seite,
      skin: document.documentElement.dataset.vizskin,
      block: erste ? { klasse: erste.className, text: (erste.querySelector("p") || {}).textContent,
                       sub: (erste.querySelector("small") || {}).textContent || "", bild: !!erste.querySelector("img"),
                       geraet: erste.getAttribute("data-geraet") } : null,
      zeilen: zeilen.map((li) => ({ klasse: li.className, text: li.querySelector("p").textContent,
                                    sub: (li.querySelector("time") || {}).textContent || "",
                                    geraet: li.getAttribute("data-geraet"), symbol: li.getAttribute("data-symbol") })),
      // Ueberlauf: Seite gegen die App-Flaeche, Liste gegen sich selbst, und
      // die letzte Zeile muss ganz in der Liste liegen.
      ueberSeite: app.scrollHeight - app.clientHeight,
      ueberListe: liste ? liste.scrollHeight - liste.clientHeight : -1,
      letzteDrin: zeilen.length
        ? zeilen[zeilen.length - 1].getBoundingClientRect().bottom <= liste.getBoundingClientRect().bottom + 1 : true,
      quer: seite ? seite.scrollWidth - seite.clientWidth : -1,
      uhr: (q(".lg-uhr") || {}).textContent, datum: (q(".lg-datum") || {}).textContent,
      fuss: [...document.querySelectorAll(".lg-fuss span")].map((s) => s.textContent),
      fest: [...document.querySelectorAll(".lg-fest .viz-grid > *")].map((w) => ({
        name: (w.device || {}).name, lage: w.getAttribute("data-lage"),
        zeilen: w.shadowRoot ? w.shadowRoot.querySelectorAll(".agrow").length : 0,
        rahmen: w.shadowRoot && w.shadowRoot.querySelector(".card")
          ? getComputedStyle(w.shadowRoot.querySelector(".card")).borderTopWidth : "",
      })),
      kopfUhr: sichtbar("viz-clock"), kopfInfo: sichtbar("viz-headinfo"), kopfStatus: sichtbar("viz-statusbar"),
      schrift: getComputedStyle(q(".lg-uhr") || document.body).fontFamily,
      schriftGeladen: document.fonts.check('600 20px "Barlow Semi Condensed"'),
    };
  });

module.exports = [
  {
    name: "Tor offen + Tesla kommt: rot wird der Block, der Rest Zeilen in Stufen-Reihenfolge",
    geraet: "tv",
    config: CFG,
    geraete(liste) { haus(liste); },
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      const r = await lese(page);
      ok(r.da && r.skin === "signal", `Listen-Seite steht, Skin signal (ist: ${r.skin})`);
      ok(r.block && r.block.geraet === "d_garage_neu" && /rot/.test(r.block.klasse),
         `Block = Segmenttor in Rot, obwohl die Alarmanlage in showIf davor steht (ist: ${r.block && r.block.geraet})`);
      ok(r.block && r.block.text === "Das Segmenttor steht offen", `Satz aus showIf (ist: "${r.block && r.block.text}")`);
      ok(r.block && /^seit \d\d:\d\d Uhr$/.test(r.block.sub), `Unterzeile "seit HH:MM Uhr" (ist: "${r.block && r.block.sub}")`);
      ok(r.zeilen.map((x) => x.geraet).join(",") ===
         "rem_d_cal_muell,d_blumen_giessen,myalarm,MQTT2_Tesla_Model3,rp_d_Wechselrichter_all_modus",
         `gelb vor blau, innerhalb der Stufe wie in showIf (ist: ${r.zeilen.map((x) => x.geraet).join(",")})`);
      const tesla = r.zeilen.find((x) => x.geraet === "MQTT2_Tesla_Model3");
      ok(tesla && tesla.text === "Der Tesla kommt in 12 Minuten", `Platzhalter mit Rundung (ist: "${tesla && tesla.text}")`);
      ok(tesla && tesla.sub === "Akku 80 %, 423 km Reichweite", `Unterzeile mit Platzhaltern (ist: "${tesla && tesla.sub}")`);
      const muell = r.zeilen.find((x) => x.geraet === "rem_d_cal_muell");
      ok(muell && muell.text === "Morgen: Gelbe Tonne Appel/Darup/Schap" && muell.sub === "",
         `[morgen] liefert nur den Termin von morgen, "-" unterdrueckt die Unterzeile (ist: "${muell && muell.text}" / "${muell && muell.sub}")`);
      const blumen = r.zeilen.find((x) => x.geraet === "d_blumen_giessen");
      ok(blumen && /^seit (Mo|Di|Mi|Do|Fr|Sa|So)\.$/.test(blumen.sub), `drei Tage alt -> Wochentag (ist: "${blumen && blumen.sub}")`);
      ok(![r.block.text, ...r.zeilen.map((x) => x.text + x.sub)].some((t) => /\[|\]/.test(t)), "kein Platzhalter bleibt stehen");
      const sym = Object.fromEntries(r.zeilen.map((x) => [x.geraet, x.symbol]));
      ok(sym.myalarm === "alarm", `Symbol aus showIf ("blau:alarm"), ohne vizIcon am Geraet (ist: "${sym.myalarm}")`);
      ok(sym.d_blumen_giessen === "wasser" && sym.MQTT2_Tesla_Model3 === "auto", `sonst vizIcon des Geraets (ist: ${sym.d_blumen_giessen}, ${sym.MQTT2_Tesla_Model3})`);
      ok(!r.zeilen.some((x) => x.geraet === "MQTT2_BlitzWolf3" || x.geraet === "st_fenster"), "was nicht zutrifft, steht nicht da");
      ok(r.ueberSeite <= 0 && r.ueberListe <= 1 && r.letzteDrin && r.quer <= 0,
         `nichts laeuft aus dem Schirm (Seite ${r.ueberSeite}, Liste ${r.ueberListe}, quer ${r.quer})`);
      ok(/^\d\d:\d\d$/.test(r.uhr) && /, \d+\. \S+$/.test(r.datum), `Uhr und Datum (ist: ${r.uhr} / ${r.datum})`);
      ok(r.fest.length === 1 && r.fest[0].name === "d_lage_kalender" && r.fest[0].lage === "seite" && r.fest[0].zeilen === 2,
         `fester Eintrag als Kachel in der Seitenspalte (ist: ${JSON.stringify(r.fest)})`);
      ok(r.fest[0] && r.fest[0].rahmen === "0px", `Kachel dort ohne Kasten (Rahmen: ${r.fest[0] && r.fest[0].rahmen})`);
      ok(r.fuss.length >= 2 && /Außen/.test(r.fuss[0]), `Fusszeile aus headerInfo (ist: ${r.fuss.join(" | ")})`);
      ok(!r.kopfUhr && !r.kopfInfo && !r.kopfStatus, "Kopfzeile wiederholt Uhr, Kennzahlen und Status nicht");
      ok(/Barlow/.test(r.schrift) && r.schriftGeladen, `Schrift geladen (ist: ${r.schrift})`);
    },
  },
  {
    name: "Tor zu: der Tesla ist das Wichtigste und bekommt den Block mit Bild",
    geraet: "tv",
    config: { ...CFG, showIf: SHOWIF.split("\n").filter((x) => !/muell|blumen/.test(x)).join("\n") },
    geraete(liste) { haus(liste, { tor: "down" }); },
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      const r = await lese(page);
      // Alarmanlage steht in showIf VOR dem Tesla und ist ebenfalls blau.
      ok(r.block && r.block.geraet === "myalarm", `gleiche Stufe: Reihenfolge aus showIf entscheidet (ist: ${r.block && r.block.geraet})`);
      ok(r.zeilen[0] && r.zeilen[0].geraet === "MQTT2_Tesla_Model3", "Tesla als erste Zeile");
    },
  },
  {
    name: "nur der Tesla: Block in Blau mit Fahrzeugbild aus vizCar",
    geraet: "tv",
    config: { ...CFG, showIf: SHOWIF.split("\n").filter((x) => /Tesla|kalender/.test(x)).join("\n") },
    geraete(liste) { haus(liste, { tor: "down" }); },
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      const r = await lese(page);
      ok(r.block && /blau/.test(r.block.klasse) && r.block.bild, `Block blau mit Bild (ist: ${r.block && r.block.klasse})`);
      ok(r.block && r.block.sub === "Akku 80 %, 423 km Reichweite", `Unterzeile (ist: "${r.block && r.block.sub}")`);
      const b = await page.evaluate(() => {
        const i = document.querySelector(".lg-erste img");
        const t = document.querySelector(".lg-erste p").getBoundingClientRect();
        const r = i.getBoundingClientRect();
        return { geladen: i.naturalWidth > 0, frei: /tesla-frei/.test(i.src), ueberlappt: t.right > r.left + r.width * 0.25 };
      });
      ok(b.geladen && b.frei, "Bild 'frei' aus vizCar geladen");
      ok(!b.ueberlappt, "Text laeuft nicht ins Auto");
      ok(r.zeilen.length === 0, "keine Zeilen darunter");
    },
  },
  {
    name: "nichts trifft zu: ruhiger Block 'Alles in Ordnung'",
    geraet: "tv",
    config: { ...CFG, showIf: "st_fenster:state!=closed => rot | Ein Fenster ist offen\nd_lage_kalender" },
    geraete(liste) { haus(liste, { tor: "down" }); },
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      const r = await lese(page);
      ok(r.block && /ruhig/.test(r.block.klasse) && r.block.text === "Alles in Ordnung", `ruhiger Block (ist: ${r.block && r.block.text})`);
      ok(r.zeilen.length === 0, "keine Zeilen");
    },
  },
  {
    name: "ohne Meldungsteil (showIf von vorher): Satz aus Alias + Zustand, Stufe aus vizStates",
    geraet: "tv",
    config: { ...CFG, showIf: "d_garage_neu:icon!=down\nmyalarm:state=on\nd_lage_kalender" },
    geraete(liste) {
      haus(liste);
      const d = liste.find((g) => g.Name === "d_garage_neu");
      d.Attributes.vizStates = "up:offen:warn,down:zu:ok";
      d.Readings.icon.Value = "up";
    },
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      const r = await lese(page);
      const alle = [r.block, ...r.zeilen];
      const alarm = alle.find((x) => x.geraet === "myalarm");
      const tor = alle.find((x) => x.geraet === "d_garage_neu");
      ok(alarm && alarm.text === "Alarm Anlage: on", `Rueckfall-Satz (ist: "${alarm && alarm.text}")`);
      ok(tor && tor.text === "Segmenttor: up", `Bedingung auf anderem Reading: dessen Wert (ist: "${tor && tor.text}")`);
    },
  },
  {
    name: "zwanzig Meldungen: Liste wird gekuerzt, letzte Zeile nennt den Rest",
    geraet: "tv",
    config: { ...CFG, showIf: Array.from({ length: 20 }, (_, i) => `d_test${i}:state=on => gelb | Meldung Nummer ${i + 1}`).join("\n") },
    geraete(liste) { for (let i = 0; i < 20; i++) dazu(liste, `d_test${i}`, "on", { alias: `Test ${i}` }); },
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      const r = await lese(page);
      const letzte = r.zeilen[r.zeilen.length - 1];
      const gezeigt = r.zeilen.length - 1;
      ok(letzte && /lg-mehr/.test(letzte.klasse), "letzte Zeile ist der Hinweis");
      ok(letzte && letzte.text === `und ${19 - gezeigt} weitere Meldungen`, `Zahl stimmt: 1 Block + ${gezeigt} Zeilen + Rest = 20 (ist: "${letzte && letzte.text}")`);
      ok(gezeigt >= 3, `es bleiben genug Zeilen sichtbar (sind: ${gezeigt})`);
      ok(r.ueberSeite <= 0 && r.ueberListe <= 1 && r.letzteDrin, `nichts laeuft aus dem Schirm (Seite ${r.ueberSeite}, Liste ${r.ueberListe})`);
    },
  },
  {
    name: "maxTiles deckelt auch die Liste (Block zaehlt mit)",
    geraet: "tv",
    config: { ...CFG, maxTiles: "3" },
    geraete(liste) { haus(liste); },
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      const r = await lese(page);
      const echte = r.zeilen.filter((x) => !/lg-mehr/.test(x.klasse));
      ok(echte.length === 2, `1 Block + 2 Zeilen (sind: ${echte.length})`);
      ok(r.zeilen.some((x) => x.text === "und 3 weitere Meldungen"), `Rest wird genannt (ist: ${r.zeilen.map((x) => x.text).join(" | ")})`);
    },
  },
  {
    name: "Zahlenvergleich, der beim Laden schon zutrifft: kein 'seit' (Zeitstempel = letzte Meldung, nicht Beginn)",
    geraet: "tv",
    config: { ...CFG, showIf: "MQTT2_BlitzWolf3:ENERGY_Power>10 => rot | Die Pumpe im Keller läuft" },
    geraete(liste) { haus(liste); setze(liste, "MQTT2_BlitzWolf3", { ENERGY_Power: "350" }, 0); },
    async pruefe({ page, ok, h }) {
      await h.timerStoppen();
      const r = await lese(page);
      ok(r.block && r.block.geraet === "MQTT2_BlitzWolf3" && r.block.sub === "", `Block ohne Unterzeile (ist: "${r.block && r.block.sub}")`);
    },
  },
  {
    name: "Meldung kommt WAEHREND der Anzeige: Block wechselt, 'seit' = jetzt",
    geraet: "tv",
    config: { ...CFG, showIf: "MQTT2_BlitzWolf3:ENERGY_Power>10 => rot | Die Pumpe im Keller läuft\nmyalarm:state=on => blau | Alarmanlage ist scharf | -\nd_lage_kalender" },
    geraete(liste) { haus(liste); },
    async pruefe({ page, ok }) {
      const vorher = await lese(page);
      ok(vorher.block && vorher.block.geraet === "myalarm", "vorher: Alarmanlage im Block");
      await page.evaluate(() => {
        const w = document.querySelector(".lg-fest .viz-grid > *");
        // wie eine inform-Zeile vom Longpoll: Wert UND Zeitstempel (Store.applyEvent
        // setzt die Zeit auf "jetzt"; die Kachel sieht nur den Seiten-Store).
        const d = w.store.get("MQTT2_BlitzWolf3");
        const n = new Date(), p = (x) => String(x).padStart(2, "0");
        d.readings.ENERGY_Power = "420";
        d.times.ENERGY_Power = `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())} ${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`;
      });
      await page.waitForTimeout(5600);
      const r = await lese(page);
      const p = (n) => String(n).padStart(2, "0");
      const d = new Date();
      const jetzt = [0, 1].map((m) => { const x = new Date(d.getTime() - m * 60000); return `seit ${p(x.getHours())}:${p(x.getMinutes())} Uhr`; });
      ok(r.block && r.block.geraet === "MQTT2_BlitzWolf3", `Pumpe uebernimmt den Block (ist: ${r.block && r.block.geraet})`);
      ok(r.block && jetzt.includes(r.block.sub), `'seit' ist der Moment des Wechsels (ist: "${r.block && r.block.sub}")`);
      ok(r.zeilen[0] && r.zeilen[0].geraet === "myalarm", "Alarmanlage rutscht in die Liste");
    },
  },
  {
    name: "Skin signal im Tablet-Modus: Bento-Regeln sind mitgeladen (Raum-Schiene links)",
    geraet: "tablet",
    url: "?device=myViz&skin=signal",
    async pruefe({ page, ok }) {
      const r = await page.evaluate(() => {
        const t = document.querySelector(".viz-tabs");
        const w = document.querySelector("#fhemviz-app .viz-grid > *");
        const c = w && w.shadowRoot.querySelector(".card");
        return { skin: document.documentElement.dataset.vizskin,
                 schiene: t ? getComputedStyle(t).flexDirection : "", breite: t ? Math.round(t.getBoundingClientRect().width) : 0,
                 bg: getComputedStyle(document.documentElement).getPropertyValue("--viz-bg").trim(),
                 schrift: getComputedStyle(document.body).fontFamily,
                 glas: c ? getComputedStyle(c).backgroundColor : "" };
      });
      ok(r.skin === "signal", `Skin aktiv (ist: ${r.skin})`);
      ok(r.schiene === "column" && r.breite === 116, `Raum-Schiene wie bei bento (ist: ${r.schiene}, ${r.breite} px)`);
      ok(r.bg === "#14181e" && /Barlow/.test(r.schrift), `Palette und Schrift von signal (ist: ${r.bg}, ${r.schrift})`);
      ok(/rgba|color\(/.test(r.glas), `Kacheln halbtransparent wie bei bento (ist: ${r.glas})`);
    },
  },
];
