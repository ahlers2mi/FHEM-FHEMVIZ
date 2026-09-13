#!/usr/bin/env python3
"""Geräte aus einer echten FHEM-Konfiguration als Fixture ziehen.

    python3 t/seite/extrakt.py --cfg <fhem.cfg> --save <fhem.save> \
        --out t/seite/fixtures/solar.json  mySolvis MQTT2_Tesla_Model3 ...

Attribute kommen aus der fhem.cfg, Readings (mit Zeitstempel) aus der
fhem.save - kein Abtippen, keine Fantasiewerte. Das Ergebnis hat die Form
der jsonlist2-Antwort: [{Name, Internals, Attributes, PossibleSets, Readings}].

Bereinigt wird, was nicht in ein öffentliches Repo gehört (siehe RAUS und
DEF_BEHALTEN): Koordinaten, Adressen im Netz, WLAN-Kennungen, Schlüssel,
Rohtelegramme, Zugangsdaten in der DEF. Wer die Fixture erneuert, muss diese
Liste nicht kennen - aber danach einmal hineinschauen.
"""
import argparse
import json
import re
import sys

# Readings, die nicht ins Repo gehören (Regex auf den Reading-Namen)
RAUS = re.compile(
    r"^(latitude|longitude|lat|lon|PASSKEY|Wifi_.*|IPAddress|Hostname|ip|up_ip|"
    r"MACAddress|json2nameValue.*|cid|vehicle_name|.*[Tt]oken.*|.*[Pp]assw.*|"
    r"active_route_.*|remote\..*)$"
)
# Attribute, die die Oberfläche nicht braucht und die nur Platz kosten
# (readingList enthält obendrein Perl-Code aus der Installation)
ATTR_RAUS = {"userattr", "readingList", "comment"}
# Nur diese Typen behalten ihre DEF - die Oberfläche liest sie (Mitglieder,
# Bildpfad). Alles andere kann Host:Port oder Zugangsdaten enthalten.
DEF_BEHALTEN = {"structure", "weblink"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cfg", required=True)
    ap.add_argument("--save", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("geraete", nargs="+")
    a = ap.parse_args()

    cfg = open(a.cfg, encoding="utf-8", errors="replace").read()
    cfg = re.sub(r"\\\n", "\n", cfg)  # Fortsetzungszeilen zusammenführen
    g = {
        n: {"Name": n, "Internals": {"NAME": n, "TYPE": "dummy", "DEF": ""},
            "Attributes": {}, "PossibleSets": "", "Readings": {}}
        for n in a.geraete
    }
    for zeile in cfg.split("\n"):
        m = re.match(r"^define (\S+) (\S+)(?: (.*))?$", zeile)
        if m and m.group(1) in g:
            g[m.group(1)]["Internals"]["TYPE"] = m.group(2)
            g[m.group(1)]["Internals"]["DEF"] = m.group(3) or ""
        m = re.match(r"^attr (\S+) (\S+) ?(.*)$", zeile, re.S)
        if m and m.group(1) in g and m.group(2) not in ATTR_RAUS:
            g[m.group(1)]["Attributes"][m.group(2)] = m.group(3)

    save = open(a.save, encoding="utf-8", errors="replace").read()
    for zeile in save.split("\n"):
        m = re.match(r"^setstate (\S+) (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) (\S+) (.*)$", zeile)
        if m and m.group(1) in g:
            if not RAUS.match(m.group(3)):
                g[m.group(1)]["Readings"][m.group(3)] = {"Value": m.group(4), "Time": m.group(2)}
            continue
        m = re.match(r"^setstate (\S+) (.+)$", zeile)
        if m and m.group(1) in g:
            g[m.group(1)]["Internals"]["STATE"] = m.group(2)

    for n, d in g.items():
        d["PossibleSets"] = " ".join(d["Attributes"].get("setList", "").split())
        st = d["Readings"].get("state")
        if st:
            d["Internals"]["STATE"] = st["Value"]
        if d["Internals"]["TYPE"] not in DEF_BEHALTEN:
            d["Internals"]["DEF"] = ""
        print(f"{n:26s} TYPE={d['Internals']['TYPE']:16s} Attribute {len(d['Attributes']):2d}  "
              f"Readings {len(d['Readings']):3d}", file=sys.stderr)

    fehlen = [n for n, d in g.items() if not d["Attributes"] and not d["Readings"]]
    if fehlen:
        print("NICHT gefunden: " + ", ".join(fehlen), file=sys.stderr)

    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(list(g.values()), f, ensure_ascii=False, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()
