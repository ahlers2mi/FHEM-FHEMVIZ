##############################################################################
# 98_FHEMVIZ.pm
#
# Helfer-Modul der modernen FHEM-Visualisierung "FHEMVIZ".
#
# GRUNDGERUEST / SCAFFOLD (v0.1.0) - noch KEINE Funktionslogik.
# Diese Datei bildet nur die FHEM-uebliche Modulstruktur ab (Initialize/
# Define/Undef/Get/Attr + POD). Die eigentliche Konfigurations- und
# Manifest-Logik wird in einer spaeteren Bau-Session ergaenzt (siehe
# CONCEPT.md, Abschnitt 9 "Umsetzungs-Roadmap").
#
# Rolle des Moduls (bewusst schlank, rendert nichts):
#   (a) Deklariert die Zusatz-Attribute (viz*) als erstklassige FHEM-Buerger,
#       damit sie im FHEMWEB-Attribut-Dropdown auftauchen und validiert werden.
#   (b) Liefert spaeter einen "get manifest"/"get config"-Endpunkt, der die
#       aktive Sicht (Raeume, Reihenfolge, Theme) als JSON zurueckgibt.
#   Die gesamte Konfiguration bleibt damit im FHEM-Standard (Attribute am
#   Geraet) und ist per attr/Config-Datei sicher-/versionierbar.
#
# Die statische SPA wird von FHEMWEB aus www/fhemviz/ ausgeliefert
#   (http://<fhem>:<port>/fhem/fhemviz/index.html) - kein eigener Webserver.
#
# Autor:    ahlers2mi
# Version:  v0.15.13
# Lizenz:   GPL v2 oder hoeher (wie FHEM)
##############################################################################

package main;

use strict;
use warnings;

# FHEM stellt diese Globals zur Laufzeit im Paket "main" bereit. Die
# Deklaration hier macht das Modul auch standalone "perl -c"-pruefbar.
use vars qw($readingFnAttributes %defs %attr %modules %data $init_done);

# Zentrale Konstanten des Grundgeruests ----------------------------------------

# Version-String, wird in FHEMVIZ_Define an das Internal FVERSION gehaengt.
my $FHEMVIZ_VERSION = "98_FHEMVIZ.pm:v0.15.13";

# Standard fuer das Attribut hideRooms: technische/Integrations-Raeume, die
# im Dashboard nicht als eigene Raeume erscheinen sollen. Kommaseparierte
# Regex-Liste (jeder Eintrag wird in der SPA als ^(?:...)$ gematcht).
# Per "attr <name> hideRooms ..." anpassbar; leerer Wert zeigt alles.
my $FHEMVIZ_DEFAULT_HIDEROOMS = 'System->.*,Homebridge,Alexa,FileLog,hidden';

# Whitelist: ist showRooms gesetzt (kommaseparierte Regex-Liste), erscheinen
# NUR passende Raeume; Geraete ohne passenden Raum entfallen ganz.
# Beispiel: attr <name> showRooms FHEMVIZ->.*   -> nur die Dashboard-Raeume.

# Rausch-Filter: Geraete dieser TYPEs (Plots, Logs, Automatisierung) bzw.
# mit diesen bedeutungslosen states werden nicht als Kacheln gezeigt.
# Ein Geraet mit gesetztem vizWidget-Attribut wird IMMER gezeigt.
my $FHEMVIZ_DEFAULT_HIDETYPES  =
    'SVG,FileLog,notify,at,DOIF,watchdog,weblink,readingsGroup';
my $FHEMVIZ_DEFAULT_HIDESTATES =
    '\?\?\?,unknown,initialized,defined,disabled,inactive';

# Geraetebezogene viz*-Attribute (an den VISUALISIERTEN Geraeten, nicht am
# FHEMVIZ-Geraet). Werden in Initialize global registriert (addToAttrList),
# damit sie an jedem Geraet im FHEMWEB-Dropdown auftauchen.
#   vizWidget   - Widget-Typ erzwingen (uebersteuert GDT/Heuristik/Rauschfilter)
#   vizSize     - Kachelgroesse im Raster (1x1, 2x1, 1x2, 2x2)
#   vizHide     - Geraet aus der Sicht ausblenden
#   vizReadings - Kachelinhalt direkt aus Readings statt state-Parsing:
#                 "reading[:Label[:Einheit[:Farbe]]]" kommasepariert,
#                 erster Eintrag = Hauptwert. Farbe: ok|warn|bad|accent|blau
#                 (bzw. gruen/orange/rot). Beispiel:
#                 attr d_Wechselrichter_all vizReadings
#                   soc:Ladung:%:accent,pv_leistung:PV:W:ok,
#                   out_leistung:Haus:W:bad,netzleistung_all:Netz:W:ok,
#                   batterie_leistung:Batterie:W:warn
my @FHEMVIZ_DEV_ATTRS = (
    "vizWidget:switch,sensor,dimmer,shutter,actions,text,agenda,contact,vent,flow,forecast,weather",
    "vizSize:1x1,2x1,1x2,2x2",
    "vizHide:1,0",
    "vizIcon:lampe,steckdose,lautsprecher,luefter,pumpe,tv,heizung,power",
    "vizGroup",
    "vizReadings:textField-long",
    "vizStates:textField-long",
    "vizFlow:textField-long",
);

# ----------------------------------------------------------------------------
# FHEMVIZ_Initialize
#   Wird von FHEM beim Laden des Moduls aufgerufen.
#   Registriert die Callback-Funktionen, die Attributliste des FHEMVIZ-
#   Geraets (Sicht-/Theme-/TV-Konfiguration) und die globalen viz*-Attribute.
# ----------------------------------------------------------------------------
sub FHEMVIZ_Initialize {
    my ($hash) = @_;

    $hash->{DefFn}   = \&FHEMVIZ_Define;
    $hash->{UndefFn} = \&FHEMVIZ_Undef;
    $hash->{SetFn}   = \&FHEMVIZ_Set;
    $hash->{GetFn}   = \&FHEMVIZ_Get;
    $hash->{AttrFn}  = \&FHEMVIZ_Attr;

    # Attribute des FHEMVIZ-Geraets (die aktive Sicht).
    $hash->{AttrList} =
          "disable:1,0 " .
          "readonly:1,0 " .
          "devspec " .
          "theme:auto,light,dark " .
          "mode:tablet,tv " .
          "zoom " .
          "tvScenes " .
          "tvTouch " .
          "statusBar:textField-long " .
          "showRooms " .
          "hideRooms " .
          "hideTypes " .
          "hideStates " .
          $readingFnAttributes;

    # viz*-Attribute global verfuegbar machen (erstklassige FHEM-Buerger:
    # Dropdown + Vervollstaendigung an jedem Geraet).
    # Zweiter Parameter ordnet die Attribute dem Modul zu (sauberes
    # Aufraeumen, Zuordnung in FHEMWEB) - wie im FHEM-Gemini-Modul.
    foreach my $a (@FHEMVIZ_DEV_ATTRS) {
        addToAttrList($a, "FHEMVIZ");
    }

    # FHEMWEB-Menueeintrag schon beim Modul-Laden registrieren, damit er
    # nach "reload 98_FHEMVIZ" sofort da ist (Define laeuft dabei nicht neu).
    $data{FWEXT}{"/fhemviz/index.html"}{LINK} = "fhemviz/index.html";
    $data{FWEXT}{"/fhemviz/index.html"}{NAME} = "FHEMVIZ";
}

# ----------------------------------------------------------------------------
# FHEMVIZ_Define
#   Wird bei "define <name> FHEMVIZ [<devspec>]" aufgerufen.
#   GRUNDGERUEST: setzt nur Version/STATE, noch keine Sicht-Logik.
# ----------------------------------------------------------------------------
sub FHEMVIZ_Define {
    my ($hash, $def) = @_;
    my @param = split('[ \t]+', $def);

    $hash->{FVERSION} = $FHEMVIZ_VERSION;

    if (int(@param) < 2) {
        return "Usage: define <name> FHEMVIZ [<devspec>]";
    }

    $hash->{name}  = $param[0];
    $hash->{STATE} = "Initialized";

    # FHEMWEB-Menueeintrag (wie "Floorplans"): Link auf die SPA im linken
    # Menue aller FHEMWEB-Instanzen. LINK ist relativ zu $FW_ME (/fhem).
    $data{FWEXT}{"/fhemviz/index.html"}{LINK} = "fhemviz/index.html";
    $data{FWEXT}{"/fhemviz/index.html"}{NAME} = "FHEMVIZ";

    return undef;
}

# ----------------------------------------------------------------------------
# FHEMVIZ_Undef
#   Wird beim Loeschen des Geraets aufgerufen. Entfernt den FHEMWEB-
#   Menueeintrag, wenn das letzte FHEMVIZ-Geraet geloescht wird.
# ----------------------------------------------------------------------------
sub FHEMVIZ_Undef {
    my ($hash, $arg) = @_;
    my @rest = grep {
        defined($defs{$_}{TYPE})
          && $defs{$_}{TYPE} eq "FHEMVIZ"
          && $_ ne $hash->{NAME}
    } keys %defs;
    delete $data{FWEXT}{"/fhemviz/index.html"} if (!@rest);
    return undef;
}

# ----------------------------------------------------------------------------
# FHEMVIZ_Set
#   set <name> scene <szene> [dauer]
#     Erzwingt im TV-Modus die Szene <szene> (= Raumname) fuer [dauer]
#     Sekunden (Default 30), danach kehrt die Rotation zurueck. Die SPA
#     empfaengt die Readings live ueber den inform-Kanal - damit koennen
#     ganz normale notify/DOIF den Fernseher steuern, z. B.:
#       define n_tor_tv notify d_garage_neu:onoff:.* set myViz scene Garage 60
#   set <name> page <raum>|auto
#     Schaltet die Anzeige DAUERHAFT auf <raum> um (kein Timeout): der TV
#     pinnt die Seite (Rotation pausiert, Auto-Blaettern laeuft weiter),
#     das Tablet wechselt den Tab. "auto" hebt das Pinnen auf, der TV
#     kehrt zur Szenen-Rotation zurueck. Das Reading bleibt erhalten und
#     dient neu verbundenen Browsern als Startseite.
# ----------------------------------------------------------------------------
sub FHEMVIZ_Set {
    my ($hash, $name, $cmd, @args) = @_;
    return "Unknown argument, choose one of scene page show" if (!defined($cmd));

    if ($cmd eq "scene") {
        my $scene = $args[0];
        return "usage: set $name scene <name> [seconds]" if (!defined($scene));
        my $dur = defined($args[1]) && $args[1] =~ /^\d+$/ ? $args[1] : 30;

        # Reihenfolge wichtig: Dauer zuerst, damit sie beim Eintreffen des
        # scene-Events in der SPA bereits bekannt ist.
        readingsBeginUpdate($hash);
        readingsBulkUpdate($hash, "sceneDuration", $dur);
        readingsBulkUpdate($hash, "scene", $scene);
        readingsEndUpdate($hash, 1);
        return undef;
    }

    if ($cmd eq "page") {
        my $page = $args[0];
        return "usage: set $name page <raum>|auto" if (!defined($page));
        readingsSingleUpdate($hash, "page", $page, 1);
        return undef;
    }

    if ($cmd eq "show") {
        my $url = $args[0];
        return "usage: set $name show <url>|off [seconds]" if (!defined($url));
        my $dur = defined($args[1]) && $args[1] =~ /^\d+$/ ? $args[1] : 30;

        # Reihenfolge wichtig: Dauer zuerst (wie bei scene).
        readingsBeginUpdate($hash);
        readingsBulkUpdate($hash, "showDuration", $dur);
        readingsBulkUpdate($hash, "show", $url);
        readingsEndUpdate($hash, 1);
        return undef;
    }

    return "Unknown argument $cmd, choose one of scene page show";
}

# ----------------------------------------------------------------------------
# FHEMVIZ_Get
#   get <name> manifest  -> spaeter: aktive Sicht als JSON (Raeume/Theme/...)
#   get <name> config    -> spaeter: aufbereitete Konfiguration als JSON
#   Liefert die aktive Sicht als JSON (devspec, theme, readonly). Die SPA
#   ruft diesen Endpunkt beim Start auf, um zu wissen, welche Geraete sie
#   laden soll. Die Konfiguration bleibt damit im FHEM-Standard.
# ----------------------------------------------------------------------------
sub FHEMVIZ_Get {
    my ($hash, $name, $opt, @args) = @_;

    if (!defined($opt)) {
        return "Unknown argument, choose one of manifest:noArg config:noArg";
    }

    if ($opt eq "manifest" || $opt eq "config") {
        my $devspec    = AttrVal($name, "devspec", "");
        my $theme      = AttrVal($name, "theme", "auto");
        my $readonly   = AttrVal($name, "readonly", 0) ? "true" : "false";
        my $mode       = AttrVal($name, "mode", "tablet");
        my $tvScenes   = AttrVal($name, "tvScenes", "");
        my $tvTouch    = AttrVal($name, "tvTouch", "");
        my $zoomAttr   = AttrVal($name, "zoom", "");
        my $statusBar  = AttrVal($name, "statusBar", "");
        my $showRooms  = AttrVal($name, "showRooms", "");
        my $hideRooms  = AttrVal($name, "hideRooms", $FHEMVIZ_DEFAULT_HIDEROOMS);
        my $hideTypes  = AttrVal($name, "hideTypes", $FHEMVIZ_DEFAULT_HIDETYPES);
        my $hideStates = AttrVal($name, "hideStates", $FHEMVIZ_DEFAULT_HIDESTATES);
        # Gepinnte Seite (set <name> page ...) - Startseite fuer neu
        # verbundene Browser; live kommt sie ueber den inform-Kanal.
        my $page       = ReadingsVal($name, "page", "");

        return sprintf(
            '{"name":%s,"version":%s,"devspec":%s,"theme":%s,"readonly":%s,'
              . '"mode":%s,"zoom":%s,"tvScenes":%s,"tvTouch":%s,"statusBar":%s,"page":%s,'
              . '"showRooms":%s,"hideRooms":%s,"hideTypes":%s,"hideStates":%s}',
            FHEMVIZ_jsonStr($name),
            FHEMVIZ_jsonStr("v0.15.13"),
            FHEMVIZ_jsonStr($devspec),
            FHEMVIZ_jsonStr($theme),
            $readonly,
            FHEMVIZ_jsonStr($mode),
            FHEMVIZ_jsonStr($zoomAttr),
            FHEMVIZ_jsonStr($tvScenes),
            FHEMVIZ_jsonStr($tvTouch),
            FHEMVIZ_jsonStr($statusBar),
            FHEMVIZ_jsonStr($page),
            FHEMVIZ_jsonStr($showRooms),
            FHEMVIZ_jsonStr($hideRooms),
            FHEMVIZ_jsonStr($hideTypes),
            FHEMVIZ_jsonStr($hideStates)
        );
    }

    return "Unknown argument $opt, choose one of manifest:noArg config:noArg";
}

# ----------------------------------------------------------------------------
# FHEMVIZ_jsonStr
#   Minimaler JSON-String-Encoder (escaped ", \\ und Steuerzeichen).
#   Bewusst dependency-frei, damit das Modul ohne JSON-Modul auskommt.
# ----------------------------------------------------------------------------
sub FHEMVIZ_jsonStr {
    my ($s) = @_;
    $s = "" if (!defined($s));
    $s =~ s/([\\"])/\\$1/g;
    $s =~ s/\n/\\n/g;
    $s =~ s/\r/\\r/g;
    $s =~ s/\t/\\t/g;
    return '"' . $s . '"';
}

# ----------------------------------------------------------------------------
# FHEMVIZ_Attr
#   Validiert Attributwerte beim Setzen.
#   GRUNDGERUEST: nur "disable"/"readonly"-Grundpruefung, Rest folgt.
# ----------------------------------------------------------------------------
sub FHEMVIZ_Attr {
    my ($cmd, $name, $attr_name, $attr_value) = @_;

    if ($cmd eq "set") {
        if ($attr_name eq "disable" || $attr_name eq "readonly") {
            if (!defined($attr_value) || $attr_value !~ /^(0|1)$/) {
                my $err = "Invalid argument for $attr_name. Must be 0 or 1.";
                Log3($name, 3, "$name: $err");
                return $err;
            }
        }
        if ($attr_name eq "zoom") {
            # 0.5-3 (auch Komma), oder Prozent 50-300.
            my $v = defined($attr_value) ? $attr_value : "";
            $v =~ s/,/./;
            if ($v !~ /^\d+(\.\d+)?$/ || $v <= 0) {
                my $err = "Invalid argument for zoom. Use 0.5-3 (e.g. 1.3) or percent (130).";
                Log3($name, 3, "$name: $err");
                return $err;
            }
        }
        # TODO (Bau-Session): Validierung der viz*-Attribute (Widget-Typen,
        # vizSize-Raster, vizChart-Reading-Referenzen).
    }

    return undef;
}


1;

=pod
=item helper
=item summary Modern responsive FHEM visualization (tablet + TV/kiosk mode)
=item summary_DE Moderne, responsive FHEM-Visualisierung (Tablet + TV-/Kiosk-Modus)
=begin html

<a id="FHEMVIZ"></a>
<h3>FHEMVIZ</h3>
<ul>
  <b>FHEMVIZ</b> ist eine moderne, responsive FHEM-Visualisierung für Tablet
  und Fernseher. Die Oberfläche ist eine buildfreie Single-Page-App, die
  FHEMWEB direkt aus <code>www/fhemviz/</code> ausliefert
  (<code>http://&lt;fhem&gt;:&lt;port&gt;/fhem/fhemviz/index.html</code>,
  auch über den Menüeintrag <b>FHEMVIZ</b> im linken FHEMWEB-Menü erreichbar) &ndash;
  es wird <b>kein</b> zusätzlicher Webserver benötigt. Live-Updates kommen
  über den FHEMWEB-longpoll (inform), Bedienung läuft CSRF-geschützt über
  <code>set</code>-Befehle.
  <br><br>
  Das Modul selbst rendert nichts: es registriert die
  <code>viz*</code>-Geräte-Attribute, liefert der SPA die aktive Sicht als
  JSON (<code>get config</code>) und nimmt Szenen-/Seitenbefehle entgegen.
  Die gesamte Konfiguration bleibt im FHEM-Standard (Attribute am Gerät).
  <br><br>
  <b>Betriebsarten:</b> <code>tablet</code> (bedienbar, Raum-Tabs unten) und
  <code>tv</code> (keine Bedienelemente, große Ziffern, automatische
  Szenen-Rotation mit Auto-Blättern &ndash; es wird nie gescrollt; Geräte-Events
  können per <code>set scene</code> den Schirm übernehmen).
  <br><br>
  <b>Raum-Konvention:</b> Reine Dashboard-Räume werden als Unterräume
  <code>FHEMVIZ-&gt;&lt;Name&gt;</code> angelegt; im Dashboard erscheint nur
  der Kurzname, und in <code>tvScenes</code>, <code>set scene/page</code> und
  <code>?room=</code> genügt der Kurzname.
  <br><br>

  <a id="FHEMVIZ-define"></a>
  <b>Define</b>
  <ul>
    <code>define &lt;name&gt; FHEMVIZ [&lt;devspec&gt;]</code><br>
    Die Geräteauswahl wird über das Attribut <code>devspec</code> gepflegt;
    der Define-Parameter ist optional.
  </ul><br>

  <a id="FHEMVIZ-set"></a>
  <b>Set</b>
  <ul>
    <li><a id="FHEMVIZ-set-scene"></a><b>scene</b> &lt;raum&gt; [sekunden] &ndash;
        erzwingt im TV-Modus die Szene <code>&lt;raum&gt;</code> für die
        angegebene Dauer (Default 30 s, roter Rahmen), danach kehrt die
        Rotation (bzw. eine gepinnte Seite) zurück. Die SPA empfängt das live
        über den inform-Kanal &ndash; damit steuern ganz normale notify/DOIF den
        Fernseher:<br>
        <code>define n_tor_tv notify d_garage_neu:onoff:.* set myViz scene Garage 60</code></li>
    <li><a id="FHEMVIZ-set-page"></a><b>page</b> &lt;raum&gt;|auto &ndash;
        schaltet die Anzeige <i>dauerhaft</i> auf den Raum um (kein Timeout):
        der TV pinnt die Seite (Rotation pausiert, Auto-Blättern läuft
        zyklisch weiter), das Tablet wechselt den Tab. <code>auto</code> hebt
        das Pinnen auf. Das Reading <code>page</code> bleibt erhalten und
        dient neu verbundenen Browsern als Startseite (URL-Parameter
        <code>?room=</code> geht vor). Kurzname genügt:<br>
        <code>set myViz page Solar</code></li>
    <li><a id="FHEMVIZ-set-show"></a><b>show</b> &lt;url&gt;|off [sekunden] &ndash;
        blendet eine Webseite oder ein Bild (z. B. Kamera-Snapshot) als
        Vollbild-Overlay ÜBER dem Dashboard ein &ndash; ohne Reload, die
        Live-Verbindung läuft darunter weiter. Nach Ablauf (Default 30 s)
        oder per Tipp verschwindet das Overlay; <code>off</code> schließt
        sofort. Bild-URLs (.jpg/.png/…) werden als Bild gerendert, alles
        andere als iframe (Fremdseiten können das Einbetten per
        X-Frame-Options verbieten; FHEM-eigene Seiten und Bilder gehen
        immer). Beispiel Türklingel:<br>
        <code>define n_klingel_tv notify MQTT2_DOORBELL:motion:.* set myViz show http://kamera/snapshot.jpg 20</code></li>
  </ul><br>

  <a id="FHEMVIZ-get"></a>
  <b>Get</b>
  <ul>
    <li><a id="FHEMVIZ-get-config"></a><b>config</b> (Alias <b>manifest</b>) &ndash;
        aktive Sicht als JSON: Name, Modul-Version, devspec, theme, readonly,
        mode, tvScenes, statusBar, page, showRooms/hide*-Filter. Wird von der
        SPA beim Start abgerufen; die Version dient als Cache-Wächter
        (Versionskonflikt-Hinweis in der Statuszeile).</li>
  </ul><br>

  <a id="FHEMVIZ-attr"></a>
  <b>Attribute</b>
  <ul>
    <p><b>Sicht / Verhalten</b></p>
    <li><a id="FHEMVIZ-attr-devspec"></a><b>devspec</b><br>
        Typ: textField. <b>Pflicht.</b> FHEM-Geräteauswahl der Sicht, z. B.
        <code>room=FHEMVIZ-&gt;.*</code> oder <code>d_garage_neu,mySolar.*</code>.
        Nur diese Geräte werden geladen und live aktualisiert.</li>
    <li><a id="FHEMVIZ-attr-mode"></a><b>mode</b> tablet|tv<br>
        Betriebsart (Default <code>tablet</code>). Per URL übersteuerbar:
        <code>?mode=tv</code> bzw. <code>?mode=tablet</code>.</li>
    <li><a id="FHEMVIZ-attr-theme"></a><b>theme</b> auto|light|dark<br>
        Farbschema (Default <code>auto</code> = Systemvorgabe des Geräts).</li>
    <li><a id="FHEMVIZ-attr-zoom"></a><b>zoom</b><br>
        Typ: textField. Standard-Skalierung der Oberfläche für alle Browser
        dieses Geräts: 0.5&ndash;3 (z. B. <code>1.3</code>) oder Prozent
        (<code>130</code>). Der URL-Parameter <code>?zoom=</code> geht vor
        (für abweichende Einzelgeräte). Praktisch für Kiosk-Browser wie
        Fully, die URL-Parameter verschlucken. Der aktive Zoom wird in der
        Statuszeile angezeigt.</li>
    <li><a id="FHEMVIZ-attr-readonly"></a><b>readonly</b> 0|1<br>
        Nur-Lese-Sicht ohne Bedienelemente (Gäste-/Wandmodus). Im TV-Modus
        immer aktiv.</li>
    <li><a id="FHEMVIZ-attr-disable"></a><b>disable</b> 0|1<br>
        Gerät deaktivieren.</li>

    <p><b>TV-Modus</b></p>
    <li><a id="FHEMVIZ-attr-tvScenes"></a><b>tvScenes</b><br>
        Typ: textField. Szenen-Rotation als kommaseparierte Liste
        <code>Raum:Sekunden</code>, z. B.
        <code>Solar:30,Wohnzimmer:20,Termine:15</code> (Kurznamen erlaubt).
        Läuft eine Szene über, wird die Szenenzeit auf Seiten verteilt und an
        Kachelzeilen ausgerichtet weitergeblättert. Ohne Angabe rotieren alle
        sichtbaren Räume mit je 20 s. Unbekannte Räume werden übersprungen
        und in der Statuszeile gemeldet.</li>
    <li><a id="FHEMVIZ-attr-tvTouch"></a><b>tvTouch</b><br>
        Typ: textField (Sekunden). Touch-Übernahme im TV-Modus: ein Tipp auf
        den Schirm wechselt in die bedienbare Tablet-Ansicht; nach
        <code>tvTouch</code> Sekunden ohne Aktion läuft die Szenen-Rotation
        weiter (Default 30, <code>0</code> = aus). Damit taugt der TV-Modus
        als Bildschirmschoner für Wand-Tablets.</li>
    <li><a id="FHEMVIZ-attr-statusBar"></a><b>statusBar</b><br>
        Typ: textField-long. Immer sichtbare Status-Chips im Kopf:
        kommaseparierte Liste <code>gerät[:reading[:einheit]]</code>.
        structure-Geräte werden zu "Alias: n offen · m gekippt" (Warnfarbe),
        Readings zu Wert-Chips, sonst Zustands-Chip. Auf dem Tablet springt
        ein Tipp auf den Chip zum FHEMVIZ-Raum des Geräts. Beispiel:<br>
        <code>attr myViz statusBar st_fenster,st_tuer,d_Wechselrichter_all:pv_leistung:W</code></li>

    <p><b>Raum-Filter</b></p>
    <li><a id="FHEMVIZ-attr-showRooms"></a><b>showRooms</b><br>
        Typ: textField. <b>Whitelist</b> (kommaseparierte Regex-Liste): ist
        sie gesetzt, erscheinen NUR passende Räume; Geräte ohne passenden
        Raum entfallen ganz. Für ein rein kuratiertes Dashboard:
        <code>FHEMVIZ-&gt;.*</code>. Leer = aus.</li>
    <li><a id="FHEMVIZ-attr-hideRooms"></a><b>hideRooms</b><br>
        Typ: textField. Kommaseparierte Regex-Liste von Räumen ohne eigenen
        Tab/Abschnitt (Default
        <code>System-&gt;.*,Homebridge,Alexa,FileLog,hidden</code>).</li>
    <li><a id="FHEMVIZ-attr-hideTypes"></a><b>hideTypes</b><br>
        Typ: textField. FHEM-TYPEs ohne Kachel (Default
        <code>SVG,FileLog,notify,at,DOIF,watchdog,weblink,readingsGroup</code>).</li>
    <li><a id="FHEMVIZ-attr-hideStates"></a><b>hideStates</b><br>
        Typ: textField. Kommaseparierte Regex-Liste; Geräte, deren state
        komplett darauf matcht, werden ausgeblendet (Default
        <code>\?\?\?,unknown,initialized,defined,disabled,inactive</code>).
        Ein Gerät mit gesetztem <code>vizWidget</code> oder
        <code>vizReadings</code> wird immer angezeigt.</li>
  </ul><br>

  <a id="FHEMVIZ-devattr"></a>
  <b>Geräte-Attribute</b> (an den <i>visualisierten</i> Geräten; global
  registriert, erscheinen im Attribut-Dropdown jedes Geräts)
  <ul>
    <li><a id="FHEMVIZ-attr-vizWidget"></a><b>vizWidget</b>
        switch|sensor|dimmer|shutter|actions|text|agenda|contact|vent|flow|forecast|weather<br>
        Widget-Typ erzwingen; übersteuert genericDeviceType/webCmd/Heuristik
        und die Rausch-Filter (Gerät wird immer angezeigt). Automatisch
        erkannt werden u. a. <code>genericDeviceType</code>
        (blind/shutter/light/window/door), <code>TYPE=SolarForecast</code>
        (&rarr; forecast), <code>TYPE=structure</code> (&rarr; Gruppen-Kachel)
        und Kontakt-Zustände (open/closed/tilted). Besondere Widgets:
        <code>text</code> = mehrzeiliger Klartext,
        <code>agenda</code> = Terminliste (<code>DD.MM.YYYY HH:MM Text</code>-Zeilen)
        mit Wochentag und hervorgehobenem nächstem Termin,
        <code>contact</code> = Fenster/Tür (offen = Bernstein; structure =
        Gruppen-Kachel "2 offen · 1 gekippt" mit Mini-Symbolen),
        <code>vent</code> = Lüftungsempfehlung (Skala &minus;3..+4),
        <code>flow</code> = Energiefluss mit Laufpunkt-Animation,
        <code>forecast</code> = PV-Prognose mit Stunden-Balkenchart
        (IST vor Prognose), Sonnenzeiten, Peak und Morgen-Wert,
        <code>weather</code> = Wetterstation (Ecowitt &amp; Co., automatisch
        erkannt an temp_C/winddir/rainrate_mm): gro&szlig;e Temperatur,
        Windrose mit Richtungspfeil, Glance-Zeilen mit Symbolen f&uuml;r
        Regen (heute + Rate), UV/Sonne (farbig nach UV-Index), Luftdruck
        und Innenklima.</li>
    <li><a id="FHEMVIZ-attr-vizSize"></a><b>vizSize</b> 1x1|2x1|1x2|2x2<br>
        Kachelgröße im Raster; 2x2 ergibt eine Hero-Kachel mit größerer
        Schrift.</li>
    <li><a id="FHEMVIZ-attr-vizHide"></a><b>vizHide</b> 1|0<br>
        Gerät aus der Sicht ausblenden.</li>
    <li><a id="FHEMVIZ-attr-vizIcon"></a><b>vizIcon</b>
        lampe|steckdose|lautsprecher|luefter|pumpe|tv|heizung|power<br>
        Symbol-Modus für Schalter-Kacheln: großes Symbol mittig, Name
        darunter, Bernstein = an — aus der Ferne lesbar wie ein klassisches
        Schalter-Panel. Tippen auf die Kachel schaltet. Beispiel:<br>
        <code>attr d_deckenlampe vizIcon lampe</code></li>
    <li><a id="FHEMVIZ-attr-vizGroup"></a><b>vizGroup</b><br>
        Typ: textField. Übersteuert das <code>group</code>-Attribut NUR im
        Dashboard (FHEMWEB bleibt unberührt) — steuert, welche Kacheln in
        einer Karte zusammenstehen. Kommaseparierte Liste wie bei
        <code>group</code>; <code>-</code> (oder <code>keine</code>) löst
        die Gruppierung auf, die Kachel wandert nach „Allgemein".
        Beispiel:<br>
        <code>attr MQTT2_Sonoff_POW_01 vizGroup Solar</code></li>
    <li><a id="FHEMVIZ-attr-vizReadings"></a><b>vizReadings</b><br>
        Typ: textField-long. Kachelinhalt direkt aus Readings statt
        state-Parsing: <code>reading[:Label[:Einheit[:Farbe[:bar]]]]</code>
        kommasepariert; erster Eintrag = Hauptwert (groß). Die Einheit wird
        nicht verdoppelt, wenn der Wert sie schon trägt. Farben sind
        semantische Namen: <code>ok</code>/<code>gruen</code>,
        <code>warn</code>/<code>orange</code>, <code>bad</code>/<code>rot</code>,
        <code>accent</code>, <code>blau</code>. Das Flag <code>bar</code>
        ergänzt einen Fortschrittsbalken in der Eintragsfarbe (Skala 0&ndash;100,
        z. B. Autarkie- oder Akku-Prozent). Bei Widgets mit eigener
        Darstellung erscheinen die Einträge als Info-Zeilen. Beispiel:<br>
        <code>attr d_autark vizReadings percent:Autark heute:%:accent:bar</code></li>
    <li><a id="FHEMVIZ-attr-vizStates"></a><b>vizStates</b><br>
        Typ: textField-long. Übersetzt technische Status-Codes in Klartext +
        Farbe: <code>pattern:Label[:Farbe]</code> kommasepariert, pattern =
        Regex (Volltreffer, case-insensitiv). Beispiel:<br>
        <code>attr rem_SILENO vizStates ok_cutting:Mäht:ok,ok_charging:Lädt:accent,parked.*:Geparkt</code></li>
    <li><a id="FHEMVIZ-attr-vizFlow"></a><b>vizFlow</b><br>
        Typ: textField-long. Readings-Zuordnung des flow-Widgets als
        <code>rolle=reading</code>-Liste; Rollen: <code>pv</code>,
        <code>haus</code>, <code>netz</code>, <code>batterie</code>,
        <code>soc</code>. Vorzeichen: Netz &gt; 0 = Bezug, &lt; 0 =
        Einspeisung; Batterie &gt; 0 = laden, &lt; 0 = entladen. Default:<br>
        <code>pv=pv_leistung,haus=out_leistung,netz=netzleistung_all,batterie=batterie_leistung,soc=soc</code></li>
  </ul><br>

  <a id="FHEMVIZ-readings"></a>
  <b>Readings</b>
  <ul>
    <li><b>scene</b> / <b>sceneDuration</b> &ndash; letzte per
        <code>set scene</code> erzwungene Szene und ihre Dauer (werden von
        der SPA live ausgewertet).</li>
    <li><b>page</b> &ndash; aktuell gepinnte Seite (<code>set page</code>);
        dient neu verbundenen Browsern als Startseite, <code>auto</code> =
        keine.</li>
    <li><b>show</b> / <b>showDuration</b> &ndash; letzte per
        <code>set show</code> eingeblendete URL und ihre Dauer.</li>
  </ul><br>

  <a id="FHEMVIZ-url"></a>
  <b>URL-Parameter der Oberfläche</b>
  <ul>
    <li><code>?device=&lt;name&gt;</code> &ndash; bestimmtes FHEMVIZ-Gerät
        (sonst: erstes <code>TYPE=FHEMVIZ</code>)</li>
    <li><code>?mode=tv|tablet</code> &ndash; Betriebsart übersteuern (für
        Kiosk-Start-URLs)</li>
    <li><code>?zoom=1.3</code> &ndash; Oberfläche skalieren (0.5&ndash;3,
        auch <code>130</code> als Prozent), pro Gerät in der Start-URL</li>
    <li><code>?room=Solar</code> &ndash; Startseite: TV beginnt die Rotation
        mit diesem Raum, Tablet öffnet den Tab; geht vor dem Reading
        <code>page</code></li>
  </ul><br>

  Ausführliche Beispiele (Installation per <code>update add</code>,
  TV-Einrichtung, Plugin-API für eigene Widgets) stehen im README des
  Projekts: <a href="https://github.com/ahlers2mi/FHEM-FHEMVIZ">github.com/ahlers2mi/FHEM-FHEMVIZ</a>
</ul>

=end html

=cut
