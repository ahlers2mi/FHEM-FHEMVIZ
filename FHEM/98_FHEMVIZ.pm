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
# Version:  v0.37.7
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
#
# ACHTUNG bei einem Versionswechsel: die Zahl steht an VIER Stellen und muss
# ueberall gleich sein.
#   1. der Kopfkommentar oben ("# Version:")
#   2. diese Zeile
#   3. die Ausgabe von "get config" (FHEMVIZ_jsonStr weiter unten)
#   4. SPA_VERSION in www/fhemviz/js/app.js
# Die SPA vergleicht 3 gegen 4 und meldet sonst bei JEDEM Laden
# "Versionskonflikt: Modul X / Oberflaeche Y". Der Hinweistext schlaegt
# Strg+F5 vor - das fuehrt in die Irre, wenn in Wahrheit nur der Bump
# unvollstaendig war (passiert in v0.34.50, siehe PR #126).
my $FHEMVIZ_VERSION = "98_FHEMVIZ.pm:v0.37.7";

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
# Ein Geraet mit gesetztem vizWidget-Attribut wird IMMER gezeigt; ein
# structure ebenfalls - es existiert nur, weil jemand es angelegt hat, und
# frisch angelegt ist sein eigener state leer (die Gruppen-Kachel holt ihren
# Inhalt aus den Mitgliedern).
my $FHEMVIZ_DEFAULT_HIDETYPES  =
    'SVG,FileLog,notify,at,DOIF,watchdog,weblink,readingsGroup';
my $FHEMVIZ_DEFAULT_HIDESTATES =
    '\?\?\?,unknown,initialized,defined,disabled,inactive';

# Geraetebezogene viz*-Attribute (an den VISUALISIERTEN Geraeten, nicht am
# FHEMVIZ-Geraet). Werden in Initialize global registriert (addToAttrList),
# damit sie an jedem Geraet im FHEMWEB-Dropdown auftauchen.
#   vizWidget   - Widget-Typ erzwingen (uebersteuert GDT/Heuristik/Rauschfilter)
#   vizSize     - Kachelgroesse im Raster (1x1, 2x1, 1x2, 2x2)
#   vizHero     - Geraet als breiter Blickfang ganz oben im Raum (full = ganze Flaeche)
#   vizHide     - Geraet aus der Sicht ausblenden
#   vizFlash    - Aufleuchten dieser Kachel bei Wertaenderung (0 = ruhig,
#                 1 = auch bei globalem "attr flash 0"); Default: global
#   vizReadings - Kachelinhalt direkt aus Readings statt state-Parsing:
#                 "reading[:Label[:Einheit[:Farbe]]]" kommasepariert,
#                 erster Eintrag = Hauptwert. Farbe: ok|warn|bad|accent|blau
#                 (bzw. gruen/orange/rot). Beispiel:
#                 attr d_Wechselrichter_all vizReadings
#                   soc:Ladung:%:accent,pv_leistung:PV:W:ok,
#                   out_leistung:Haus:W:bad,netzleistung_all:Netz:W:ok,
#                   batterie_leistung:Batterie:W:warn
my @FHEMVIZ_DEV_ATTRS = (
    "vizWidget:switch,sensor,dimmer,shutter,shuttergroup,switchgroup,sensorgroup,actions,text,agenda,contact,vent,ventgroup,flow,forecast,weather,chart,watering,watertank,image,solvis,mediagroup,car,cameragroup,mealplan",
    "vizSize:1x1,2x1,1x2,2x2",
    "vizHero:0,1,full",
    "vizHide:1,0",
    "vizIcon:lampe,steckdose,lautsprecher,luefter,pumpe,tv,heizung,power",
    "vizGroup",
    "vizReadings:textField-long",
    "vizState",
    "vizStates:textField-long",
    "vizFlow:textField-long",
    "vizChart:textField-long",
    "vizWatering:textField-long",
    "vizCar:textField-long",
    "vizCameras:textField-long",
    "vizAgenda",
    "vizWateringButtons:textField-long",
    "vizText:textField-long",
    "vizImage",
    "vizAlert",
    "vizFlash:1,0",
    "vizVolumeMax",
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
          "width " .
          "tvScenes " .
          "tvTouch " .
          "tvHeroSec " .
          "statusBar:textField-long " .
          "headerInfo:textField-long " .
          "background " .
          "backgroundDim " .
          "skin " .
          "skinBlur:1,0 " .
          "snap:kachel,gruppe,off " .
          "pwa:1,0 " .
          "sound " .
          "flash:1,0,values " .
          "roomPrefix " .
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
    return "Unknown argument, choose one of scene page show msg" if (!defined($cmd));

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

    if ($cmd eq "msg") {
        return "usage: set $name msg <[level|][ueberschrift|]text>|off [seconds]"
            if (!@args);

        # Letztes Argument ist die Anzeigedauer, wenn es eine reine Zahl ist
        # (so bleiben Leerzeichen im Nachrichtentext erhalten). Default 20 s.
        # Der Rest wird unveraendert als "level|ueberschrift|text" gespeichert;
        # die SPA zerlegt ihn (Trennzeichen |, alle Felder ausser text optional).
        my $dur = 20;
        if (@args > 1 && $args[-1] =~ /^\d+$/) {
            $dur = pop @args;
        }
        my $text = join(" ", @args);

        # Reihenfolge wichtig: Dauer zuerst (wie bei scene/show).
        readingsBeginUpdate($hash);
        readingsBulkUpdate($hash, "msgDuration", $dur);
        readingsBulkUpdate($hash, "msg", $text);
        readingsEndUpdate($hash, 1);
        return undef;
    }

    return "Unknown argument $cmd, choose one of scene page show msg";
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
        my $tvHeroSec  = AttrVal($name, "tvHeroSec", "");
        my $zoomAttr   = AttrVal($name, "zoom", "");
        my $widthAttr  = AttrVal($name, "width", "");
        my $statusBar  = AttrVal($name, "statusBar", "");
        my $headerInfo = AttrVal($name, "headerInfo", "");
        my $background    = AttrVal($name, "background", "");
        my $backgroundDim = AttrVal($name, "backgroundDim", "");
        my $skin          = AttrVal($name, "skin", "");
        my $skinBlur      = AttrVal($name, "skinBlur", "");
        # Rastendes Scrollen auf Tablet/Handy (kachel|gruppe|off).
        my $snap          = AttrVal($name, "snap", "");
        my $flash         = AttrVal($name, "flash", "");
        # Ton bei "set show"/"set msg" (leer = stumm, "beep" = eingebauter
        # Zweiklang, sonst URL einer Tondatei).
        my $sound         = AttrVal($name, "sound", "");
        # Manifest zur Laufzeit (Symbole eingebettet, start_url mit Parametern).
        my $pwa           = AttrVal($name, "pwa", "1");
        # Raum-Praefix dieser Sicht: wird in Tabs/Ueberschriften abgeschnitten.
        # Eine zweite Sicht (z. B. eine Gaeste-Seite) nutzt eigene Raeume wie
        # "Opa->Wohnzimmer" und zeigt sie trotzdem als "Wohnzimmer".
        my $roomPrefix = AttrVal($name, "roomPrefix", "FHEMVIZ->");
        my $showRooms  = AttrVal($name, "showRooms", "");
        my $hideRooms  = AttrVal($name, "hideRooms", $FHEMVIZ_DEFAULT_HIDEROOMS);
        my $hideTypes  = AttrVal($name, "hideTypes", $FHEMVIZ_DEFAULT_HIDETYPES);
        my $hideStates = AttrVal($name, "hideStates", $FHEMVIZ_DEFAULT_HIDESTATES);
        # Gepinnte Seite (set <name> page ...) - Startseite fuer neu
        # verbundene Browser; live kommt sie ueber den inform-Kanal.
        my $page       = ReadingsVal($name, "page", "");

        return sprintf(
            '{"name":%s,"version":%s,"devspec":%s,"theme":%s,"readonly":%s,'
              . '"mode":%s,"zoom":%s,"width":%s,"tvScenes":%s,"tvTouch":%s,"tvHeroSec":%s,"statusBar":%s,"headerInfo":%s,'
              . '"background":%s,"backgroundDim":%s,"skin":%s,"skinBlur":%s,"snap":%s,"flash":%s,"sound":%s,"pwa":%s,"page":%s,'
              . '"roomPrefix":%s,"showRooms":%s,"hideRooms":%s,"hideTypes":%s,"hideStates":%s}',
            FHEMVIZ_jsonStr($name),
            FHEMVIZ_jsonStr("v0.37.7"),
            FHEMVIZ_jsonStr($devspec),
            FHEMVIZ_jsonStr($theme),
            $readonly,
            FHEMVIZ_jsonStr($mode),
            FHEMVIZ_jsonStr($zoomAttr),
            FHEMVIZ_jsonStr($widthAttr),
            FHEMVIZ_jsonStr($tvScenes),
            FHEMVIZ_jsonStr($tvTouch),
            FHEMVIZ_jsonStr($tvHeroSec),
            FHEMVIZ_jsonStr($statusBar),
            FHEMVIZ_jsonStr($headerInfo),
            FHEMVIZ_jsonStr($background),
            FHEMVIZ_jsonStr($backgroundDim),
            FHEMVIZ_jsonStr($skin),
            FHEMVIZ_jsonStr($skinBlur),
            FHEMVIZ_jsonStr($snap),
            FHEMVIZ_jsonStr($flash),
            FHEMVIZ_jsonStr($sound),
            FHEMVIZ_jsonStr($pwa),
            FHEMVIZ_jsonStr($page),
            FHEMVIZ_jsonStr($roomPrefix),
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
    <li><a id="FHEMVIZ-set-msg"></a><b>msg</b>
        &lt;[level|][überschrift|]text&gt;|off [sekunden] &ndash;
        blendet eine kurze Textnachricht als Banner oben mittig über dem
        Dashboard ein (im TV-Modus größer). Ideal, um aus einer eigenen
        <code>send_to_all</code>-Methode eine Meldung auf den Fernseher zu
        legen. Das Dashboard läuft darunter unverändert weiter; nach Ablauf
        (Default 20 s) oder per Tipp verschwindet das Banner,
        <code>off</code> schließt sofort. Ist das letzte Argument eine
        reine Zahl, gilt es als Anzeigedauer.<br>
        Der Text kann mit <code>|</code> in bis zu drei Felder geteilt werden:
        <b>level|überschrift|text</b> (nur <i>text</i> ist Pflicht). Das
        <i>level</i> steuert die Farbe/Betonung und ist so gewählt, dass das
        erste <code>send_to_all</code>-Argument direkt passt:
        <code>X</code>/<code>wichtig</code> = rot mit kurzem Puls,
        <code>S</code>/<code>leise</code> = gedämpft/grau, alles andere
        (z. B. Leerzeichen) = normal (amber). Beispiele:<br>
        <code>set myViz msg X|Blumen|Verlangen nach Wasser 30</code><br>
        <code>set myViz msg Waschmaschine fertig</code><br>
        <code>set myViz msg off</code></li>
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
        Statuszeile angezeigt.<br>
        Im <b>Tablet-Modus</b> wird der Zoom wie <b>width</b> über den
        Viewport skaliert (kein CSS-transform), damit die untere Raum-Tab-
        Leiste zuverlässig am Bildschirm klebt; reine Desktop-Browser ohne
        Viewport-Meta ignorieren das dann (dort statt Zoom die Browser-
        Vergrößerung nutzen). Im <b>TV-Modus</b> per transform (feste
        Szenenfläche). <b>width</b> und <b>zoom</b> sind damit im Tablet
        gleichwertig.</li>
    <li><a id="FHEMVIZ-attr-width"></a><b>width</b><br>
        Typ: textField. Feste Layout-Breite in CSS-Pixeln (320&ndash;3840,
        z. B. <code>900</code>): die Seite wird in dieser Breite gerendert
        und bildschirmfüllend skaliert. Kleinere Breite = größere
        Darstellung. Im <b>TV-Modus</b> intern über den transform-Pfad, mit
        aus der tatsächlich sichtbaren Breite abgeleitetem Faktor
        (<code>sichtbareBreite / width</code>) &ndash; so sitzen
        Vollbild-Elemente (Alarm-Rahmen) bündig am Rand. Im
        <b>Tablet-Modus</b> skaliert das Gerät/der WebView selbst per
        Viewport-Meta (kein transform), damit die unten verankerte
        Raum-Tab-Leiste unberührt bleibt. Hat Vorrang vor <b>zoom</b>; der
        URL-Parameter <code>?width=</code> geht vor. Die aktive Breite wird
        in der Statuszeile angezeigt.</li>
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
        und in der Statuszeile gemeldet.<br>
        <b>Sonderziel <code>#uhr</code></b> (auch <code>#uebersicht</code>):
        keine Raumseite, sondern eine <b>Uhr-Seite</b> als Teil der Rotation
        &ndash; große Uhrzeit und Datum, darunter die Kennzahlen aus
        <code>headerInfo</code> und je <code>statusBar</code>-Eintrag eine
        Zeile. Braucht keine eigene Konfiguration: gezeigt wird, was für
        Kopfzeile und Statusleiste schon eingerichtet ist. Auf dieser Seite
        entfällt dafür die <b>Kopfleiste</b> (Kennzahlen, Plaketten und die
        kleine Kopf-Uhr) &ndash; sonst stünde alles doppelt auf dem Schirm;
        Titel und Statuszeile bleiben. Beispiel:<br>
        <code>attr myViz tvScenes #uhr:20,Solar:30,Wohnzimmer:20</code></li>
    <li><a id="FHEMVIZ-attr-tvTouch"></a><b>tvTouch</b><br>
        Typ: textField (Sekunden). Touch-Übernahme im TV-Modus: ein Tipp auf
        den Schirm wechselt in die bedienbare Tablet-Ansicht; nach
        <code>tvTouch</code> Sekunden ohne Aktion läuft die Szenen-Rotation
        weiter (Default 30, <code>0</code> = aus). Damit taugt der TV-Modus
        als Bildschirmschoner für Wand-Tablets.</li>
    <li><a id="FHEMVIZ-attr-tvHeroSec"></a><b>tvHeroSec</b><br>
        Typ: textField (Sekunden, ab v0.36.0). Eine Vollbild-Kachel
        (<code>vizHero full</code>) belegt die <b>erste Seite</b> einer Szene
        allein, die übrigen Kacheln des Raums stehen darunter und werden vom
        Auto-Paging nachgeblättert. Ohne dieses Attribut teilt sich die
        Szenenzeit gleichmäßig auf alle Seiten auf.<br>
        <code>tvHeroSec</code> gibt der Vollbild-Kachel eine <b>eigene
        Standzeit</b>; was von der Szenenzeit übrig bleibt, teilen sich die
        Kachelseiten. Beispiel: <code>tvScenes Draußen:40</code> plus
        <code>tvHeroSec 25</code> &rarr; 25 s die große Kachel, 15 s für die
        Seiten danach. Je Seite bleibt mindestens eine Sekunde; ein zu großer
        Wert wird entsprechend gekappt. Ohne Vollbild-Kachel im Raum wirkt
        das Attribut nicht.</li>
    <li><a id="FHEMVIZ-attr-statusBar"></a><b>statusBar</b><br>
        Typ: textField-long. Immer sichtbare Status-Chips im Kopf:
        kommaseparierte Liste <code>gerät[:reading[:einheit[:farbe]]]</code>.
        structure-Geräte werden zu "Alias: n offen · m gekippt" (Warnfarbe),
        Readings zu Wert-Chips, sonst Zustands-Chip. Ein Zustands-Chip
        berücksichtigt <code>vizStates</code> am Gerät, „Abregelung on" lässt
        sich damit als „Abregelung aktiv" in Rot zeigen. Das optionale 4. Feld
        <b>farbe</b> färbt einen Reading-Chip &ndash; fester Name
        (<code>ok</code>/<code>warn</code>/<code>bad</code>/…) oder
        <b>Schwellwerte</b> wie bei vizReadings
        (<code>bad@&lt;=15|warn@&lt;=30|ok@&gt;=80</code>). Auf dem Tablet
        springt ein Tipp auf den Chip zum FHEMVIZ-Raum des Geräts. Beispiel:<br>
        <code>attr myViz statusBar st_fenster,st_tuer,d_Wechselrichter_all:soc:%:bad@&lt;=15|warn@&lt;=30|ok@&gt;=80,weather_dummy</code></li>
    <li><a id="FHEMVIZ-attr-headerInfo"></a><b>headerInfo</b><br>
        Typ: textField-long. Kompakte Live-Info rechts neben dem Datum (der
        „Glance-Header") &ndash; belebt die sonst leere Kopfzeile auf jeder
        Seite. Kommaseparierte Items:
        <code>gerät:reading[:einheit[:label[:farbe]]]</code>
        zeigt einen großen Wert, <code>icon=gerät[:größe]</code> ein Icon aus
        einem <code>weblink image …</code> (Größe optional, z. B.
        <code>icon=dev:16rem</code>). Das Icon ist rechts verankert und darf
        aus der Kopfzeile in die Seite ragen, ohne rechts aus dem Bild zu
        laufen. Live über den inform-Kanal.<br>
        <b>farbe</b> (5. Feld) färbt den Wert &ndash; fester Name
        (<code>ok</code>/<code>warn</code>/<code>bad</code>/<code>accent</code>/…)
        oder <b>Schwellwerte</b> wie bei <code>vizReadings</code>
        (<code>bad@&lt;=20|warn@&lt;=40|ok@&gt;=80</code>). Die Wert-Items
        erscheinen außerdem als große Kennzahlen auf der Uhr-Seite
        (<code>tvScenes #uhr</code>), dort wirkt die Farbe genauso. Beispiel:<br>
        <code>attr myViz headerInfo MQTT2_B0CBD8D5566F:temp_C:°C:Außen,rem_MQTT2_SMART_SHUNT1:data_state_of_charge_shunt_state:%:Batterie:bad@&lt;=20|warn@&lt;=40|ok@&gt;=80,icon=www_weather_icon_today:14rem</code></li>

    <li><a id="FHEMVIZ-attr-background"></a><b>background</b><br>
        URL oder Pfad eines Hintergrundbildes fuer das Dashboard (z. B. ein
        von FHEMWEB aus <code>www/fhemviz/</code> ausgeliefertes Bild oder
        eine externe URL). Das Bild liegt als fixe Ebene hinter dem Inhalt,
        darueber ein abdunkelndes Overlay, damit Kacheln/Text lesbar bleiben.
        Leer = kein Bild (Standard). Beispiele:<br>
        <code>attr myViz background /fhem/fhemviz/backgrounds/cubes.png</code><br>
        <code>attr myViz background https://example.org/wallpaper.jpg</code></li>
    <li><a id="FHEMVIZ-attr-skin"></a><b>skin</b><br>
        Alternative Optik, ohne das bestehende Layout zu verlieren. Ohne
        Angabe gilt <code>classic</code> &ndash; das gewohnte Kachel-Layout,
        es wird dann auch nichts zusaetzlich geladen. Mitgelieferte Skins:<br>
        <code>zeilen</code> &ndash; Handy-Ansicht: keine Kachelkaesten, sondern
        Abschnitte aus Zeilen (Name links, Wert und Bedienelement rechts).
        Eine Spalte, deutlich mehr Inhalt pro Blick. Grafische Kacheln
        (Fluss, Heizung, Prognose, Wetter, Diagramm, Bild) behalten ihren
        Kasten.<br>
        <code>bento</code> &ndash; Wandtablet: dichteres Raster, halbtransparente
        Glaskacheln (sinnvoll mit <code>background</code>), und im
        <b>Querformat</b> wandert die Raum-Umschaltung als Schiene an die linke
        Kante; im Hochformat bleibt die Leiste unten.<br>
        Je Geraet uebersteuerbar per URL: <code>?skin=zeilen</code> &ndash; so
        koennen Handy und Wandtablet dasselbe FHEMVIZ-Geraet nutzen und
        trotzdem anders aussehen. Beispiel:<br>
        <code>attr myViz skin bento</code></li>
    <li><a id="FHEMVIZ-attr-skinBlur"></a><b>skinBlur</b> 1|0<br>
        Glas-/Weichzeichnen-Effekte des Skins (backdrop-filter). Default 1.
        <code>0</code> schaltet sie ab &ndash; die Kacheln bleiben
        halbtransparent, kosten aber keine Compositing-Ebene. Fuer schwache
        Panels (z. B. Yicty T510) empfohlen, wenn das Scrollen ruckelt.</li>
    <li><a id="FHEMVIZ-attr-snap"></a><b>snap</b> kachel|gruppe|off<br>
        <b>Rastendes Scrollen</b> auf Tablet/Handy (ab v0.37.7). Ohne das endet
        ein Wisch irgendwo, und oben steckt eine halbe Kachel unter der
        klebenden Kopfzeile.<br>
        <code>kachel</code> (Default) &ndash; ein Wisch endet auf einer
        <b>Kachelzeile</b>. Gemessen in einem langen Raum bei 1280x800 (vier
        Wische): vorher 6 oben angeschnittene Kacheln, danach 0; im Hochformat
        16 statt 4.<br>
        <code>gruppe</code> &ndash; ein Wisch endet auf einer
        <b>Gruppen&uuml;berschrift</b>. Ruhiger, wirkt aber nur an
        Gruppenanf&auml;ngen: in einer Gruppe, die h&ouml;her als der Schirm
        ist, gibt es keinen Rastpunkt.<br>
        <code>off</code> &ndash; frei scrollen wie vorher.<br>
        Gerastet wird weich (<code>proximity</code>): ein langer Wisch bleibt
        lang, es rastet nur beim Ausrollen ein. Im <b>TV-Modus wirkungslos</b>
        &ndash; der scrollt nicht, er bl&auml;ttert. Je Ger&auml;t
        uebersteuerbar per URL: <code>?snap=gruppe</code>. Beispiel:<br>
        <code>attr myViz snap kachel</code></li>
    <li><a id="FHEMVIZ-attr-flash"></a><b>flash</b> 1|0|values<br>
        Kurzes Aufleuchten einer Kachel, wenn sich ihr Inhalt aendert.
        Default <code>1</code>: das Wertfeld blinkt, Kacheln ohne Wertfeld
        (Gruppen- und Grafik-Kacheln wie <code>sensorgroup</code>,
        <code>mediagroup</code>, <code>flow</code>) pulsen im Rahmen.<br>
        <code>values</code> = nur die Wertfelder blinken, die Gruppen-/
        Grafik-Kacheln bleiben ganz ruhig. <code>0</code> = nichts blinkt.<br>
        Je Geraet uebersteuerbar per URL: <code>?flash=0</code> &ndash; und je
        Kachel mit <code>vizFlash</code> am visualisierten Geraet. Beispiel:<br>
        <code>attr myViz flash values</code></li>
    <li><a id="FHEMVIZ-attr-backgroundDim"></a><b>backgroundDim</b><br>
        Staerke des Abdunkel-Overlays ueber dem Hintergrundbild, 0..100
        (Prozent). Default 45. Hoehere Werte = dunkler/ruhiger, 0 = Bild
        unveraendert. Nur wirksam mit gesetztem <code>background</code>.</li>

    <p><b>Raum-Filter</b></p>
    <li><a id="FHEMVIZ-attr-roomPrefix"></a><b>roomPrefix</b><br>
        Typ: textField. Raum-Präfix dieser Sicht; es wird in Tab-Leiste,
        Abschnitts-Überschriften und TV-Szenennamen abgeschnitten (Default
        <code>FHEMVIZ-&gt;</code>). Damit kann eine <b>zweite Sicht</b> eigene
        Räume benutzen und trotzdem saubere Namen zeigen: eine Gäste-Seite mit
        <code>roomPrefix Opa-&gt;</code> beschriftet den Raum
        <code>Opa-&gt;Wohnzimmer</code> einfach als <i>Wohnzimmer</i> &ndash;
        und die Räume tauchen im Haupt-Dashboard nicht auf, weil sie nicht
        unter <code>FHEMVIZ-&gt;</code> liegen. Beispiel:<br>
        <code>attr vizOpa roomPrefix Opa-&gt;</code></li>
    <li><a id="FHEMVIZ-attr-sound"></a><b>sound</b><br>
        Typ: textField. Kurzer <b>Ton</b>, wenn ein Bild (<code>set show</code>)
        oder eine Nachricht (<code>set msg</code>) hereinkommt &ndash; am
        Wandtablet fällt ein eingeblendeter Kamera-Schnappschuss sonst nur
        auf, wenn man gerade hinsieht. Werte:
        <ul>
          <li>leer bzw. <code>off</code> &ndash; stumm (Default)</li>
          <li><code>beep</code> &ndash; eingebauter Zweiklang (880/660&nbsp;Hz,
              weich ein- und ausgeblendet), keine Tondatei nötig</li>
          <li>eine <b>URL</b> &ndash; wird als Tondatei abgespielt, z. B.
              <code>/fhem/images/klingel.mp3</code></li>
        </ul>
        <b>Wichtig zur Autoplay-Sperre:</b> Browser lassen Ton erst nach einer
        Nutzergeste zu. Nach einem Neuladen der Seite bleibt der erste Ton
        also stumm, bis das Tablet einmal berührt wurde &ndash; danach
        klingelt es auch bei Ereignissen, die von FHEM kommen. In einem
        Kiosk-Browser wie Fully die Medienwiedergabe erlauben, dann geht es
        sofort. Beispiel Türklingel:<br>
        <code>attr myViz sound beep</code><br>
        <code>define n_klingel notify MQTT2_DOORBELL:motion:.* set myViz show http://kamera/snapshot.jpg 20</code></li>
    <li><a id="FHEMVIZ-attr-pwa"></a><b>pwa</b> 1|0<br>
        Default 1. Betrifft <b>&bdquo;Zum Startbildschirm hinzufügen&ldquo;</b>.
        Die Seite baut ihr Manifest zur Laufzeit selbst und hängt es als
        <code>data:</code>-Adresse ein &ndash; mit zwei Effekten:
        <ul>
          <li><b>Die Parameter bleiben erhalten.</b> <code>start_url</code> ist
              die Adresse, aus der heraus installiert wurde, samt
              <code>?room=</code>, <code>?zoom=</code>, <code>?skin=</code>.
              Vorher startete eine installierte App immer im
              Standard-Dashboard (Android wie iOS). Der Name führt den Raum
              mit (&bdquo;FHEMVIZ Media&ldquo;), so lassen sich mehrere
              Ansichten nebeneinander ablegen.</li>
          <li><b>Die Symbole stecken mit im Manifest</b> (als
              <code>data:</code>-URI, vom Browser über die laufende Sitzung
              geholt). Steht FHEM hinter <code>basicAuth</code>, kommt der
              Dienst, der auf Android das App-Symbol baut, sonst nicht an
              <code>icons/icon-192.png</code> &ndash; die App bleibt dann ohne
              Symbol. Eingebettet gibt es nichts mehr abzurufen.</li>
        </ul>
        Lassen sich die Symbole nicht laden, bleibt das statische
        <code>manifest.webmanifest</code> unverändert stehen. Mit
        <code>attr &lt;viz&gt; pwa 0</code> schaltet man den Umbau ganz ab.</li>
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
        <code>vizReadings</code> wird immer angezeigt. Ein <code>structure</code> ist davon ausgenommen, solange kein Muster ausdruecklich passt: sein eigener state ist frisch angelegt leer, die Gruppen-Kachel lebt aber von den Mitgliedern.</li>
  </ul><br>

  <a id="FHEMVIZ-devattr"></a>
  <b>Geräte-Attribute</b> (an den <i>visualisierten</i> Geräten; global
  registriert, erscheinen im Attribut-Dropdown jedes Geräts)
  <ul>
    <li><a id="FHEMVIZ-attr-vizWidget"></a><b>vizWidget</b>
        switch|sensor|dimmer|shutter|shuttergroup|actions|text|agenda|contact|vent|flow|forecast|weather|chart|watering|watertank|car|cameragroup|mealplan<br>
        Widget-Typ erzwingen; übersteuert genericDeviceType/webCmd/Heuristik
        und die Rausch-Filter (Gerät wird immer angezeigt). Automatisch
        erkannt werden u. a. <code>genericDeviceType</code>
        (blind/shutter/light/window/door), <code>TYPE=SolarForecast</code>
        (&rarr; forecast), <code>TYPE=Gartenbewaesserung</code>
        (&rarr; watering), <code>TYPE=structure</code> (Rollladen &rarr;
        <code>shuttergroup</code>, sonst Kontakt-Gruppen-Kachel)
        und Kontakt-Zustände (open/closed/tilted); ein gesetztes
        <code>vizChart</code> bzw. <code>vizWatering</code> wählt ebenfalls
        automatisch das passende Widget. Besondere Widgets:
        <code>text</code> = mehrzeiliger Klartext,
        <code>agenda</code> = Terminliste (<code>DD.MM.YYYY HH:MM Text</code>-Zeilen)
        mit Wochentag; <i>Heute</i> und <i>Morgen</i> werden ausgeschrieben und
        bernsteinfarben hervorgehoben (heute kräftiger als morgen), abgelaufene
        Termine verschwinden nach 8 Stunden &ndash; siehe
        <code>vizAgenda</code>,
        <code>contact</code> = Fenster/Tür (offen = Bernstein; structure =
        Gruppen-Kachel "2 offen · 1 gekippt" mit Mini-Symbolen),
        <code>shutter</code> = einzelner Rollladen: Behang-Grafik, Prozentwert,
        Schieberegler und darunter die Knopfreihe <i>Auf &middot; Stop &middot;
        Zu</i>. Der Stop-Knopf erscheint nur, wenn das Gerät den Befehl
        <code>stop</code> kennt (ab v0.34.50) &ndash; bei einem Garagentor auf
        einem HomeMatic-Rollladenaktor also automatisch. Auf/Zu fahren die
        Endlagen über <code>pct</code>, nicht über die bei CUL_HM
        <b>relativen</b> <code>up</code>/<code>down</code>,
        <code>shuttergroup</code> = Rollladen-Gruppe: EINE Kachel für ein
        <code>structure</code>-Gerät aus Rollladen mit Master-Zeile (steuert
        alle) und je Rollade einer Zeile mit Position + Auf/Stop/Zu.
        Automatisch bei <code>structure</code> mit Rollladen-Mitgliedern
        (DEF beginnt mit <code>blind</code> bzw. <code>genericDeviceType
        blind</code>); die Mitglieder müssen im devspec liegen (dürfen per
        <code>vizHide</code> aus dem Raster raus). Auf/Zu fahren die
        <b>Endlagen</b> an: bevorzugt <code>pct &lt;max&gt;</code> /
        <code>pct &lt;min&gt;</code> aus <code>PossibleSets</code>, sonst
        <code>open</code>/<code>close</code> bzw. <code>closed</code> (ROLLO)
        &ndash; <code>up</code>/<code>down</code> nur als Rückfall, weil sie
        z. B. bei CUL_HM <b>relativ</b> sind (ein Schritt, Standard 10 %).
        Empfehlung <code>vizSize 2x1/2x2</code>. Beispiel:<br>
        <code>define st_rolladen structure blind HM_x HM_y HM_z</code><br>
        <code>attr st_rolladen genericDeviceType blind</code>,<br>
        <b>Reihenfolge der Zeilen</b> (gilt für alle Gruppen-Kacheln:
        shuttergroup, switchgroup, sensorgroup, ventgroup, mediagroup,
        contact): normalerweise die Reihenfolge aus der <code>structure</code>-DEF.
        Sobald <b>mindestens ein</b> Mitglied ein <code>sortby</code> hat, wird
        danach sortiert (Rückfall Alias, dann Name; Geräte ohne
        <code>sortby</code> landen dahinter). Es ist dasselbe FHEM-Attribut,
        mit dem auch das Kachel-Raster sortiert &ndash; „10" wird numerisch
        nach „2" einsortiert, führende Nullen sind unnötig:<br>
        <code>attr HM_x sortby 1</code>, <code>attr HM_y sortby 2</code>,
        <code>switchgroup</code> = Schalter-/Licht-Gruppe: EINE Kachel für ein
        <code>structure</code>-Gerät aus on/off-Schaltern mit Master-Zeile
        (alle an/aus) und je Schalter einer Zeile mit eigenem Toggle.
        Automatisch bei <code>structure</code> mit clientstate
        <code>switch</code>/<code>light</code>. Beispiel:<br>
        <code>define st_garage structure switch rp_x rp_y rp_z</code>,
        <code>sensorgroup</code> = Thermometer-/Sensor-Gruppe: EINE kompakte,
        read-only Kachel für ein <code>structure</code>-Gerät aus Temperatur-/
        Klima-Sensoren, je Sensor eine Zeile mit Temperatur (Reading
        <code>temperature</code>) und - falls vorhanden - Feuchte
        (<code>humidity</code>). Automatisch bei <code>structure</code> mit
        clientstate <code>sensor</code>/<code>temp</code>/<code>thermo</code>/
        <code>klima</code>. Beispiel:<br>
        <code>define st_temp structure temp LaCrosse_04 LaCrosse_18 …</code>,
        <code>vent</code> = Lüftungsempfehlung: sieben Stufen
        (&minus;3, &minus;2, &minus;1, 0, +1, +2, +3 und höher), jeweils
        zusätzlich kombinierbar mit dem Reading <code>cooling on</code>
        („kühlt", dann blau statt grün). Unterschieden wird über Farbe,
        Wortlaut, Zahl der Wellen im Symbol (1&ndash;3) und Schriftstärke.
        Die Palette folgt dem <code>devStateIcon</code> der üblichen
        Lüften-Dummys (Sättigung 40/70/100&nbsp;%), Blau liegt aber auf einem
        helleren Grundton &ndash; ein reines <code>#0000ff</code> käme auf
        dunklem Grund nur auf Kontrast 2,3 und der dringendste Zustand wäre
        der unsichtbarste. Überschreibbar per CSS-Variablen
        <code>--vg-go-1..3</code>, <code>--vg-cool-1..3</code>,
        <code>--vg-neg-1..3</code>,
        <code>solvis</code> = Solvis-Heizung/Solarthermie als Anlagenschema
        (Solar links, Schichtspeicher als Zylinder mittig, Warmwasser/
        Heizkreise rechts, Außen/Brenner in der Fußzeile) &ndash; automatisch
        für <code>TYPE=SolvisClient</code>; Readings über die festen Präfixe
        (<code>S01</code>..<code>S18</code>, <code>SL</code>, <code>SE</code>,
        <code>A01</code>, <code>A12</code>), Wert 250 = „nicht verbunden".
        Der Zylinder zeigt die Schichtung von <b>oben nach unten</b> in der
        Reihenfolge des Solvis-Anlagenschemas: <code>S01</code>
        (Warmwasserpuffer), <code>S04</code> (Heizungspuffer oben),
        <code>S09</code> (Heizungspuffer unten), <code>S03</code>
        (Speicherreferenz); nicht angeschlossene Fühler fallen heraus, die
        Segmentzahl passt sich an. Der Farbverlauf kommt aus den <b>echten
        Temperaturen</b> (stufenlos: 25 °C blau, 55 °C orange, 95 °C rot), ein
        durchgeheizter Speicher ist also auf einen Blick zu sehen.
        Empfehlung <code>vizSize 2x2</code>,
        <code>mediagroup</code> = Media-Gruppe: EINE Kachel für ein
        <code>structure</code>-Gerät aus AV-Receivern/Playern (Denon, HEOS …),
        je Gerät eine Zeile mit Power/Lautstärke/Mute und – falls vom Gerät
        unterstützt – Eingangs-Auswahl (<code>input</code>) und Transport
        (Play/Pause/Stop/…). Automatisch für <code>structure</code> mit
        clientstate <code>media</code>/<code>audio</code> (erzwingbar per
        <code>vizWidget mediagroup</code>); Mitglieder im devspec, Empfehlung
        <code>vizSize 2x2</code>. Bei einem <code>DENON_AVR</code>-Hauptgerät
        zeigt und schaltet die Zeile die <b>Hauptzone</b>
        (<code>zoneMain</code>) &ndash; ein blankes <code>off</code> würde den
        ganzen Receiver samt Zone 2/3 abschalten,
        <code>ventgroup</code> = Lüften-Gruppe: EINE Kachel für ein
        <code>structure</code>-Gerät aus Lüftungs-Dummies, je Raum eine Zeile
        mit Empfehlung/Farbe (rein anzeigend, per
        <code>vizWidget ventgroup</code>; Mitglieder im devspec, Empfehlung
        <code>vizSize 2x1</code>),
        <code>cameragroup</code> = Kamera-Gruppe: EINE Kachel für ein
        <code>structure</code>-Gerät aus Kameras, je Kamera eine Zeile mit
        Name, letztem Ereignis (Person/Bewegung samt Uhrzeit), Akkustand und
        einem Schalter für die Bewegungserkennung. Der Kopf nennt, was gerade
        los ist, und <b>warnt</b>, wenn bei einer Kamera die Erkennung aus ist
        („2 ohne Erkennung") &ndash; eine Kamera, die nicht mehr hinsieht,
        fällt sonst nicht auf. Automatisch bei einem <code>structure</code> mit
        clientstate <code>camera</code>/<code>kamera</code>:<br>
        <code>define st_kamera structure camera MQTT2_CAM1 MQTT2_CAM2 …</code><br>
        Readings werden nach Namen gesucht (getestet mit eufy über
        ioBroker/MQTT): <code>name</code>, <code>motion_detected</code>,
        <code>person_detected</code>/<code>identity_person_detected</code>/
        <code>stranger_person_detected</code> mit
        <code>person_name</code>/<code>last_person</code>,
        <code>motion_detection</code> (Schalter, wenn in
        <code>PossibleSets</code>), <code>battery</code>. Vorschaubilder siehe
        <code>vizCameras</code>. Mitglieder im devspec, Empfehlung
        <code>vizSize 2x1/2x2</code>,
        <code>flow</code> = Energiefluss mit Laufpunkt-Animation,
        <code>forecast</code> = PV-Prognose mit Stunden-Balkenchart
        (IST vor Prognose), Sonnenzeiten, Peak und Morgen-Wert,
        <code>weather</code> = Wetterstation (Ecowitt &amp; Co., automatisch
        erkannt an temp_C/winddir/rainrate_mm): gro&szlig;e Temperatur,
        Windrose mit Richtungspfeil, Glance-Zeilen mit Symbolen f&uuml;r
        Regen (heute + Rate), UV/Sonne (farbig nach UV-Index), Luftdruck
        und Innenklima,
        <code>chart</code> = SVG-Verlaufsdiagramm aus FileLog-/DbLog-Daten
        (Konfiguration über <code>vizChart</code>),
        <code>watering</code> = Gartenbewässerung mit Status, Fass-Füllstand,
        Bodenfeuchte und Bedien-Buttons (siehe <code>vizWatering</code> /
        <code>vizWateringButtons</code>),
        <code>watertank</code> = Regenwasseranlage als lebendiges Schema: Dach,
        Fallrohr, Fass mit Schwimmerhöhe, gestapelte IBC und die Wege dazwischen
        (siehe <code>vizTank</code>),
        <code>car</code> = Fahrzeug/E-Auto: gro&szlig;er Ladestand, Reichweite
        und ein Akkubalken, in dem der wei&szlig;e Strich das
        <b>Wunschlimit</b> markiert und die blasse Fl&auml;che davor zeigt, was
        noch geladen werden soll; der Regler darunter setzt das Wunschlimit
        (Antippen der Schiene sendet nichts, nur Ziehen &ndash; ein Fehlgriff
        soll das Ladeziel nicht verstellen). Automatisch gew&auml;hlt, wenn es
        Readings f&uuml;r Ladestand UND Reichweite gibt. Readings/Befehle
        werden nach Namen gesucht, das Widget h&auml;ngt also nicht an einem
        Modul: Ladestand <code>battery_level|soc|stateOfCharge|chargeLevel</code>,
        Reichweite <code>battery_range_km|range_km|est_battery_range_km|range</code>,
        Wunschlimit <code>wish_charge_limit|chargeLimit|charge_limit_soc|set_charge_limit</code>
        (gleiche Namen als <code>set</code>-Befehl &ndash; ohne passenden
        Befehl in <code>PossibleSets</code> gibt es nur die Anzeige),
        Ladeleistung <code>charge_power|charger_power|charging_power</code>.
        Als weitere Zeilen zeigt die Kachel <code>virtual_charge_limit</code>
        als "Automatik" (Arbeitswert einer Lade-Automatik <b>in FHEM</b> &ndash;
        nicht das Limit im Fahrzeug) und
        <code>charge_limit_soc</code>/<code>set_charge_limit</code> als "Limit
        im Fahrzeug" (bis dahin l&auml;dt das Auto selbst). Sie entfallen nur,
        wenn sie aus <b>demselben Reading</b> kommen wie das Wunschlimit &ndash;
        dann w&auml;re es dieselbe Angabe zweimal. Die Spanne des
        Reglers kommt aus dem setList-Widget, sonst 10&ndash;100 in
        5er-Schritten &ndash; also z. B.<br>
        <code>attr MQTT2_Tesla_Model3 setList wish_charge_limit:slider,20,5,100 …</code><br>
        Statusleiste: gr&uuml;n = Wunschlimit erreicht, bernstein = es fehlt
        noch etwas, rot unter 10 %,
        <code>mealplan</code> = Wochenplan/Essensplan: heute gro&szlig; mit Foto,
        darunter die restlichen Tage als Streifen mit Vorschaubild, Sternen und
        Status. Gedacht f&uuml;r ein HTTPMOD-Ger&auml;t am
        <a href="https://github.com/ahlers2mi/BRING-Interface">BRING-Interface</a>;
        gelesen werden die Readings <code>mo</code>&hellip;<code>so</code>
        (Gericht), <code>&lt;tag&gt;_sterne</code>, <code>&lt;tag&gt;_bild</code>
        (absolute Bild-Adresse) und <code>morgen_vorbereitung</code> (Vorlauf
        wie „auftauen", wird auff&auml;llig gezeigt). Fehlt ein Reading,
        entf&auml;llt genau dieser Teil. Bedient wird direkt in der Kachel:
        W&uuml;rfeln, Bewerten, Wocheneinkauf &ndash; jeder Knopf erscheint nur,
        wenn das Ger&auml;t den passenden <code>set</code>-Befehl in
        <code>PossibleSets</code> anbietet. Empfehlung
        <code>vizSize 2x2</code>. Der Unterschied zur Bild-Kachel mit
        <code>/plan.svg</code>: die zeigt nur, diese l&auml;sst sich bedienen,
        <code>image</code> = Bild/Icon-Kachel (z. B. Wettervorhersage-Icon
        aus einem <code>weblink image …</code>; Quelle sonst über
        <code>vizImage</code>). Das <code>actions</code>-Widget (aus
        <code>webCmd</code>) rendert Buttons/Slider/Dropdown und beschriftet
        sie mit dem FHEM-Attribut <code>webCmdLabel</code> (":"-getrennt, je
        webCmd-Eintrag), falls gesetzt. Ein aufgeklapptes <b>Dropdown</b>
        bleibt offen, auch wenn in dem Moment neue Werte hereinkommen: solange
        ein Bedienelement den Fokus hat (Liste offen, Regler am Finger), wird
        der Neuaufbau der Kachel aufgeschoben und danach nachgeholt &ndash;
        sonst klappte eine lange Senderliste mitten im Scrollen zu.
        Transport-Befehle (play, pause, stop,
        prev/previous, next, mute &ndash; auch <code>resume</code>,
        <code>skipToNext</code>, <code>skipToPrevious</code>) bekommen
        einfarbige Symbole; ein Wort-Label aus <code>webCmdLabel</code> bleibt
        Text. Heißt der webCmd-Eintrag <code>state</code> (Dummy/readingsProxy
        mit <code>setList state:Aus,Kiepenkerl,…</code> bzw.
        <code>setList state:slider,0,2,100</code>), wird &ndash; wie in FHEMWEB
        &ndash; nur der Wert gesendet: <code>set &lt;dev&gt; Kiepenkerl</code>,
        nicht <code>set &lt;dev&gt; state Kiepenkerl</code>. Das FHEM-Attribut
        <code>eventMap</code> wird in <b>Anzeigerichtung</b> ausgewertet
        (Gerätewert &rarr; Klartext, wie <code>ReplaceEventMap(…,1)</code>):
        ein <code>readingsProxy</code> auf einen Kanalzähler mit
        <code>eventMap /1:RADIO_BOB/…/27:WDR4/</code> zeigt also „WDR4" statt
        „27". Beim Senden ist nichts zu tun &ndash; die Rückrichtung macht FHEM
        selbst in <code>DoSet</code>. Nicht ausgewertet wird die
        <b>Perl-Notation</b> (<code>eventMap {…}</code>), dort bleibt der
        Rohwert stehen.</li>
    <li><a id="FHEMVIZ-attr-vizSize"></a><b>vizSize</b> 1x1|2x1|1x2|2x2<br>
        Kachelgröße im Raster; 2x2 vergrößert Fläche und Schrift der
        Kachel (bleibt aber im Raster). Für einen echten, seitenbreiten
        Blickfang siehe <code>vizHero</code>.</li>
    <li><a id="FHEMVIZ-attr-vizHero"></a><b>vizHero</b> 1|0|full<br>
        Hebt das Gerät als <b>breiten Blickfang ganz oben im Raum</b> heraus
        (bzw. in der TV-Szene): eine volle Zeile über dem normalen Raster,
        große Schrift, dezenter Akzentrahmen. Aus dem Raster herausgelöst,
        also nicht doppelt. Das Gerät behält sein normales Widget
        (sensor/flow/forecast …) — <code>vizHero</code> ist nur die
        Platzierung/Betonung, unabhängig von <code>vizWidget</code>. Mehrere
        Hero-Geräte eines Raums teilen sich die Zeile. Beispiel:<br>
        <code>attr d_Wechselrichter_all vizHero 1</code><br>
        <b><code>full</code></b> (ab v0.35.3): der
        Blickfang nimmt die <b>ganze sichtbare Fläche</b> ein statt nur eine
        Zeile — größte Schrift (wie <code>vizSize 2x2</code>), Kachel auf
        volle Höhe gestreckt. Die übrigen Kacheln des Raums bleiben erhalten:
        auf dem Fernseher belegt die Vollbild-Kachel die <b>erste Seite</b>
        der Szene, danach blättert das Auto-Paging zu den anderen weiter
        (eigene Standzeit über <code>tvHeroSec</code> am FHEMVIZ-Gerät). Auf
        Tablet/Handy füllt sie den ersten Schirm, der Rest steht darunter.
        Mehrere <code>full</code>-Geräte eines Raums bekommen je eine Seite.<br>
        Die Größe folgt <b>Breite und Höhe</b>, es gilt das Kleinere von
        beidem (ab v0.37.2). Kacheln mit festem Seitenverhältnis
        (<code>watertank</code> leitet die Höhe der Zeichnung aus der Breite
        ab) wuchsen in einem breiten <b>Browserfenster</b> sonst über den
        Schirm hinaus; jetzt wird die Zeichnung kleiner und mittig gestellt
        statt die Seite zu verlängern.
        Beispiel:<br>
        <code>attr bewaesserung vizHero full</code></li>
    <li><a id="FHEMVIZ-attr-vizHide"></a><b>vizHide</b> 1|0<br>
        Gerät aus der Sicht ausblenden.</li>
    <li><a id="FHEMVIZ-attr-vizIcon"></a><b>vizIcon</b>
        lampe|steckdose|lautsprecher|luefter|pumpe|tv|heizung|power<br>
        Symbol-Modus für Schalter-Kacheln: großes Symbol mittig, Name
        darunter, Bernstein = an — aus der Ferne lesbar wie ein klassisches
        Schalter-Panel. Tippen auf die Kachel schaltet. Im Skin
        <code>zeilen</code> wird daraus eine <b>Listenzeile</b>: Name links,
        kleines Symbol, An/Aus und ein Schiebeschalter rechts &ndash; eine
        mittige 200-px-Kachel passt dort nicht zwischen die übrigen Zeilen.
        Geschaltet wird durch Antippen der <b>ganzen Zeile</b>; der Schalter
        zeigt nur den Zustand, damit die Zeile nicht wie eine reine Anzeige
        aussieht (in der großen Symbol-Kachel bleibt er weg, dort trägt die
        Farbe den Zustand). Beispiel:<br>
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
        <code>accent</code>, <code>blau</code>. Im Flags-Feld (durch
        Leerzeichen getrennt): <code>bar</code> ergänzt einen
        Fortschrittsbalken in der Eintragsfarbe (Skala 0&ndash;100, z. B.
        Autarkie- oder Akku-Prozent); eine <b>Zahl</b> legt die
        Nachkommastellen fest (<code>0</code> = ganzzahlig, <code>1</code> =
        eine Stelle). Ohne Angabe werden reine Zahlen automatisch auf max.
        2 Stellen gerundet (Roh-Floats wie <code>10.4575382701608</code>
        &rarr; <code>10.46</code>). Bei Widgets mit eigener
        Darstellung erscheinen die Einträge als Info-Zeilen. Beispiel:<br>
        <code>attr d_autark vizReadings percent:Autark heute:%:accent:bar</code><br>
        <b>Wertabhängige Farbe (Schwellwerte):</b> statt eines festen
        Farbnamens kann das Farbfeld Schwellwerte enthalten:
        <code>farbe@[vergleich]zahl</code>, mehrere mit <code>|</code>
        getrennt. Der <b>erste</b> Treffer gewinnt (höchste Schwelle zuerst
        notieren, wie if/elsif). Vergleich optional (Default
        <code>&gt;=</code>), erlaubt <code>&gt;= &gt; &lt;= &lt; ==</code>.
        Ersetzt die früher per Notify gesetzten <code>_colour</code>-Readings.
        Beispiele:<br>
        <code>attr Mobil5data vizReadings temperature:Temperatur:C,humidity:Feuchtigkeit:%:bad@75|warn@65,moisturecontent:Wasser:g/m3:bad@14|warn@13</code><br>
        <code>...:blau@&lt;=5|bad@&gt;=30|warn@&gt;=25</code> (kalt blau, heiß rot)<br>
        <b>Vergleich mit einem anderen Reading (ab v0.34.49):</b> statt einer
        Zahl darf als Schwelle der <b>Name eines anderen Readings desselben
        Geräts</b> stehen, wahlweise mit Versatz
        (<code>reading</code>, <code>reading+2</code>, <code>reading-0.5</code>).
        Damit lässt sich ein Wert relativ zu einem zweiten einfärben, etwa der
        Pool-Zulauf gegen die Beckentemperatur:<br>
        <code>attr poolControl vizReadings poolTemp:Wasser:°C:bad@&gt;=34|ok@&gt;=26|blau@&lt;24,inflowTemp:Zulauf:°C:warn@&gt;=poolTemp+3|ok@&gt;poolTemp|blau@&lt;poolTemp</code><br>
        Der Zulauf ist damit grün, solange er das Becken aufheizt, blau wenn er
        kühler ist, und orange ab 3&nbsp;Grad darüber. Die Farbe wird bei jeder
        Änderung <b>beider</b> Readings neu bestimmt. Lässt sich ein Reading
        nicht auflösen (fehlt oder ist nicht numerisch), wird nur diese eine
        Regel übersprungen.</li>
    <li><a id="FHEMVIZ-attr-vizState"></a><b>vizState</b><br>
        Reading, aus dem die <b>Zustandszeile</b> der Kachel kommt (statt
        <code>state</code>). Nützlich bei Modulen und Proxys
        (<code>DoRemoteDevice</code>), die in <code>state</code> den letzten
        Set-Befehl oder den Namen des letzten Readings ablegen &ndash; im
        Dashboard steht dann „<code>resume</code>" oder
        „<code>currentImageUrl</code>" als Überschrift. Ist das Reading leer
        oder fehlt es, bleibt es bei <code>state</code>. Wirkt auch als
        Eingabe für <code>vizStates</code>. Beispiel:<br>
        <code>attr rem_HEOSPlayer1579933734 vizState playStatus</code></li>
    <li><a id="FHEMVIZ-attr-vizStates"></a><b>vizStates</b><br>
        Typ: textField-long. Übersetzt technische Status-Codes in Klartext +
        Farbe: <code>pattern:Label[:Farbe]</code> kommasepariert, pattern =
        Regex (Volltreffer, case-insensitiv). Beispiel:<br>
        <code>attr rem_SILENO vizStates ok_cutting:Mäht:ok,ok_charging:Lädt:accent,parked.*:Geparkt</code></li>
    <li><a id="FHEMVIZ-attr-vizFlow"></a><b>vizFlow</b><br>
        Typ: textField-long. Readings-Zuordnung des flow-Widgets als
        <code>rolle=reading</code>-Liste. Jeder Wert ist ein Reading
        <b>dieses</b> Geräts oder &ndash; mit Doppelpunkt &ndash; eines
        <b>fremden</b> Geräts (<code>rolle=gerät:reading</code>); fremde
        Geräte werden automatisch live mitverfolgt. So kann z. B. der
        Ladestand von einem Victron SmartShunt kommen, während die
        Leistungen vom Wechselrichter stammen.<br>
        Rollen: <code>pv</code>, <code>haus</code>, <code>netz</code>,
        <code>batterie</code> (Leistungen in W), <code>soc</code>
        (Ladestand %), <code>volt</code> (Batteriespannung, optional).<br>
        Zusätzlich für den Inselbetrieb:<br>
        <code>reserve</code> &ndash; Gerät/Reading, dessen <code>on</code>
        den Sicherheitsbestand meldet (Batterie wird nicht leer gefahren,
        Autarkie-Reserve). Ohne Doppelpunkt genügt der Gerätename, dann
        zählt sein <code>state</code>.<br>
        <code>reserveSoc</code> &ndash; Grenze der Reserve in %, als Zahl
        (z. B. <code>reserveSoc=25</code>) oder Reading; wird im
        Batteriesymbol als gestrichelte Marke gezeigt. Gilt <b>nur bei
        eingeschaltetem <code>reserve</code></b> &ndash; ist der
        Sicherheitsbestand aus, wird bis 0 % gefahren und es erscheint
        keine Marke.<br>
        <code>full</code> &ndash; Gerät/Reading, dessen <code>on</code>
        meldet: Anlage am Anschlag, es kann nicht eingespeist werden
        &rarr; die Kachel fordert mit einer roten Plakette
        (🐢 „Strom verbrauchen") zum Verbrauch auf.<br>
        <code>status</code> &ndash; Reading der Datenquelle; Werte wie
        <code>offline</code> erzeugen den Hinweis „Ladestand veraltet",
        damit ein eingefrorener Wert nicht still falsch angezeigt wird.<br>
        Vorzeichen: Netz &gt; 0 = Bezug, &lt; 0 = Einspeisung;
        Batterie &gt; 0 = laden, &lt; 0 = entladen. Default:<br>
        <code>pv=pv_leistung,haus=out_leistung,netz=netzleistung_all,batterie=batterie_leistung,soc=soc</code></li>
    <li><a id="FHEMVIZ-attr-vizChart"></a><b>vizChart</b><br>
        Typ: textField-long. Aktiviert das Diagramm-Widget (setzt implizit
        <code>vizWidget chart</code>). Zeichnet den Verlauf aus einem FileLog
        als SVG-Flächendiagramm im Dashboard-Look &ndash; die Daten kommen
        über <code>get &lt;FileLog&gt; …</code> (wie bei den FHEM-SVGs).
        Format: <code>&lt;logdev&gt;:&lt;reading&gt;[:Label[:Farbe]]</code>
        kommasepariert (mehrere Serien möglich), plus optionale Tokens
        <code>hours=&lt;n&gt;</code> (Zeitraum in Stunden, Default 24) und
        <code>unit=&lt;text&gt;</code> (Einheit am Kopfwert). Farben wie bei
        vizReadings (<code>accent</code>, <code>ok</code>, …). Der Log-Typ
        (FileLog/DbLog) wird automatisch erkannt. Bei <b>DbLog</b> hält ein
        Log viele Geräte &ndash; darum das Quellgerät im Reading angeben:
        <code>&lt;reading&gt;</code> &rarr; <code>&lt;quellgeraet&gt;#&lt;reading&gt;</code>.
        Beispiele:<br>
        <code>attr MQTT2_Sonoff_POW_01 vizWidget chart</code><br>
        FileLog: <code>attr MQTT2_Sonoff_POW_01 vizChart FileLog_Sonoff_POW_01:ENERGY_Power:Leistung:accent unit=W hours=24</code><br>
        DbLog: <code>attr MQTT2_Sonoff_POW_01 vizChart LogDB:MQTT2_Sonoff_POW_01#ENERGY_Power:Leistung:accent unit=W hours=168</code><br>
        Größere Kachel (<code>vizSize 2x2</code> o. ä.) empfohlen. Der
        Verlauf wird beim Öffnen und danach alle 5&nbsp;min aktualisiert.</li>
    <li><a id="FHEMVIZ-attr-vizWatering"></a><b>vizWatering</b><br>
        Typ: textField-long. Feinzuordnung der Readings des
        Bewässerungs-Widgets als <code>rolle=reading</code>-Liste
        (kommasepariert). Für Geräte vom Typ <code>Gartenbewaesserung</code>
        wird das Widget automatisch gewählt; für andere per
        <code>vizWidget watering</code>. Rollen (Default in Klammern):
        <code>status</code> (state), <code>valve</code> (currentValveName),
        <code>barrel</code> (barrelLevel), <code>soil</code> (soilMoisture),
        <code>remaining</code> (remainingTime), <code>rain</code> (raining),
        <code>progress</code> (cycleProgress). Die Kachel zeigt Status +
        aktives Ventil, den Fass-Füllstand als Balken, Bodenfeuchte
        (schwellwert-gefärbt), Restzeit, Zyklus und einen Regen-Hinweis.
        Meist genügt der Default (kein Attribut nötig).</li>
    <li><a id="FHEMVIZ-attr-vizTank"></a><b>vizTank</b><br>
        Typ: textField-long. Feinzuordnung der Wasservorrat-Kachel
        (<code>vizWidget watertank</code>) als <code>rolle=reading</code>-Liste,
        kommasepariert. Sinnvoll mit <code>vizSize 2x2</code>.<br>
        Die Kachel zeichnet die Anlage als Schema und füllt Fass und IBC in
        <b>Litern</b>. Rollen (Default in Klammern): <code>barrel</code>
        (barrelLevel_l), <code>ibc</code> (ibcLevel_l), <code>rainTotal</code>
        (pumpedRain_total_l), <code>mainsTotal</code> (mains_total_l),
        <code>harvestToday</code> (harvest_today_l), <code>rainAmount</code>
        (rainAmount_mm), <code>raining</code> (raining), <code>alert</code>
        (rainCollectionAlert), <code>sinceFill</code> (rainSinceFill_mm),
        <code>filling</code> (ibcFilling), <code>returning</code>
        (ibcToBarrelActive), <code>mains</code> (mainsSupply),
        <code>fillRate</code> (ibcFillFlow_lpm), <code>valve</code>
        (currentValveName).<br>
        Die Größen kommen aus den <b>Attributen des Geräts</b>:
        <code>barrelUsableVolume</code>, <code>barrelFloatLevel</code> (die
        gestrichelte Linie im Fass) und <code>ibcUsableVolume</code>. Ohne sie
        bleiben die Behälter leer – geraten wird nichts.<br>
        <b>Zwei Wasserfarben:</b> Regenwasser cyan, Leitungswasser stumpfes
        Graublau. Der Anteil im IBC stammt aus dem Verhältnis
        <code>mains_total_l</code> zu <code>pumpedRain_total_l</code>; im Fass
        gilt alles unterhalb der Schwimmerhöhe als Leitungswasser, solange
        <code>mainsSupply</code> offen ist. Fehlen die Summen, bleibt alles cyan.<br>
        Je angefangene 1000&nbsp;l <code>ibcUsableVolume</code> wird ein
        Behälter gezeichnet (2000&nbsp;l = zwei gestapelte);
        <code>vizTankBoxes</code> überschreibt das.<br>
        Bedien-Buttons übernimmt die Kachel aus <code>vizWateringButtons</code>,
        eigene gehen über <code>vizTankButtons</code> (gleiche Schreibweise);
        ein einzelner Bindestrich schaltet sie hier ab.</li>
    <li><a id="FHEMVIZ-attr-vizCar"></a><b>vizCar</b><br>
        Typ: textField-long. Feinzuordnung der Fahrzeug-Kachel als
        <code>rolle=wert</code>-Liste (kommasepariert). Rollen
        <code>soc</code>, <code>range</code>, <code>limit</code>,
        <code>auto</code>, <code>carlimit</code>, <code>power</code>
        &uuml;berschreiben die gesuchten <b>Reading-Namen</b> (siehe
        <code>vizWidget car</code>); <code>wallbox=&lt;ger&auml;t&gt;</code>
        h&auml;ngt die <b>Wallbox</b> an die Kachel,
        <code>image=&lt;url&gt;</code> zeigt ein <b>Fahrzeugbild</b> oben in der
        Kachel (H&ouml;he begrenzt, damit ein grosses Bild die Kachel nicht
        aufzieht &ndash; Datei z. B. unter <code>www/</code> ablegen).<br>
        <b>Ein Bild je Ladezustand</b> geht auch:<br>
        <code>image=laedt:&lt;url&gt;|steckt:&lt;url&gt;|frei:&lt;url&gt;</code><br>
        <i>laedt</i> = es l&auml;uft Leistung, <i>steckt</i> = Kabel dran ohne
        Leistung, <i>frei</i> = nichts angesteckt. Fehlt einer der drei, wird
        der erste angegebene genommen &ndash; zwei Bilder reichen also auch.
        Drei <b>freigestellte Beispielbilder</b> (Model 3, blau) liegen unter
        <code>www/fhemviz/img/car/tesla-{frei,steckt,laedt}.png</code> und
        kommen mit dem <code>update</code> mit &ndash; sie haben keinen
        Hintergrund, das Fahrzeug steht also direkt auf der Kachel.<br>
        Den Zustand ermittelt die Kachel aus der Leistung (Fahrzeug oder
        Wallbox), dem Zustandstext der Wallbox und
        <code>charge_port_door_open</code>; ein besseres eigenes Reading
        f&uuml;r &bdquo;angesteckt&ldquo; geht per
        <code>plug=&lt;reading&gt;</code>.<br>
        Der Ladestand wird als <b>Balken</b> gezeigt, dessen <b>Griff das
        Wunschlimit ist</b> und direkt gezogen wird. Der Balken rechnet
        durchgehend von <b>0 bis 100</b> (ab v0.37.5); die Spanne aus dem
        <code>setList</code> (z. B. <code>slider,20,5,100</code>) begrenzt nur,
        wie weit sich der Griff ziehen l&auml;sst und welcher Wert gesendet
        wird. Vorher bestimmte sie auch die Position &ndash; ein Limit von
        25&nbsp;% sass dann bei 6&nbsp;% der Schiene, w&auml;hrend die
        Farbfl&auml;che daneben bei 25&nbsp;% endete.<br>
        <b>Was das Wunschlimit bedeutet:</b> es ist das <b>Minimum, das immer
        geladen wird</b> &ndash; unabh&auml;ngig davon, wie die
        Solar&uuml;berschuss-Regelung gerade entscheidet. Die blasse Strecke
        zwischen Ladestand und Griff ist also nicht &bdquo;vielleicht&ldquo;,
        sondern was auf jeden Fall noch kommt. Ist der Stand darüber, ist die
        Zusage erf&uuml;llt und der Balken wird gr&uuml;n. Nicht zu verwechseln
        mit &bdquo;Limit im Fahrzeug&ldquo;: das ist die Obergrenze, bis zu der
        das Auto selbst l&auml;dt.<br>
        <b>Navigation</b> (ab v0.37.0): liefert das Fahrzeug ein Fahrtziel und
        die Restzeit (Tesla/ioBroker: <code>active_route_destination</code> und
        <code>active_route_minutes_to_arrival</code>; eigene Namen &uuml;ber
        <code>dest=</code> / <code>eta=</code>), zeigt die Kachel eine Zeile
        <i>Ziel &middot; Ankunftszeit &middot; Restminuten</i>. Mit
        <code>home=&lt;text&gt;</code> hei&szlig;t sie
        &bdquo;&#127968; Zuhause&ldquo; in Akzentfarbe, sobald das Ziel diesen
        Text enth&auml;lt &ndash; man sieht also auf einen Blick, dass das Auto
        heimkommt und wann. <b>Mehrere Schreibweisen mit <code>|</code>
        trennen</b> (<code>home=Im Nott|Zuhause|Home</code>): das Auto meldet
        je nach Eingabe die Adresse, einen POI-Namen oder den Namen eines
        gespeicherten Ortes.<br>
        <b>Wichtig, die Frische:</b> die Route-Readings bleiben nach der Fahrt
        stehen (im Bestand lagen &bdquo;7 Minuten&ldquo; zwei Tage im Ger&auml;t).
        Die Zeile erscheint deshalb nur, wenn der Zeitstempel der Restzeit
        j&uuml;nger als 15 Minuten ist. Anders einstellen mit
        <code>routeAge=&lt;minuten&gt;</code>, <code>routeAge=0</code> schaltet
        die Pr&uuml;fung ab (dann kann eine alte Ankunftszeit stehen bleiben).
        Ohne Zeitstempel wird nichts gezeigt.<br>
        Hintergrund: das Wunschlimit l&auml;dt nicht selbst &ndash; es ist die
        Schwelle, unter der geladen werden soll. Geladen wird &uuml;ber die
        Wallbox, und genau die zeigt und bedient die Kachel dann mit: Zustand
        (<code>charger_state</code>, sonst <code>state</code>; ein
        <code>vizStates</code> an der Wallbox wird angewendet), Leistung
        (<code>charge_power</code>/<code>energy_all_w</code>/<code>power</code>,
        sonst go-e-Rohwert <code>nrg_12</code> &times; 10),
        Freigabe-Schalter (<code>Activation 0|1</code>, sonst
        <code>on</code>/<code>off</code>) und Strom-Regler
        (<code>Ampere</code>/<code>amp</code>/<code>current</code>) mit der
        Spanne aus <code>PossibleSets</code> (<code>slider,…</code> oder
        <code>selectnumbers,…</code>). Beide Regler senden nur beim
        <b>Ziehen</b>, nicht beim Antippen der Schiene.<br>
        Die Wallbox muss im <code>devspec</code> liegen &ndash; wie bei den
        Gruppen-Kacheln reicht ein versteckter Raum
        (<code>FHEMVIZ-&gt;Stuff</code> in <code>hideRooms</code>); sonst steht
        ein Hinweis in der Kachel. Beispiel:<br>
        <code>attr MQTT2_Tesla_Model3 vizCar wallbox=MQTT2_GOE</code><br>
        <code>attr MQTT2_GOE room Garage,Solar,System-&gt;MQTT,FHEMVIZ-&gt;Stuff</code></li>
    <li><a id="FHEMVIZ-attr-vizCameras"></a><b>vizCameras</b><br>
        Typ: textField-long. Feinzuordnung der Kamera-Gruppe
        (<code>vizWidget cameragroup</code>) als
        <code>rolle=wert</code>-Liste. <code>base=&lt;url&gt;</code> schaltet
        die <b>Vorschaubilder</b> ein: die Kameras liefern im Reading nur einen
        PFAD (z. B. <code>/files/eusec.0/…/last_event/T816….jpg</code>), der
        Browser braucht den Host davor. <code>reading=&lt;name&gt;</code>
        überschreibt das Bild-Reading (Default
        <code>picture_url</code>, <code>snapshot_url</code>,
        <code>last_event_url</code>). Ohne <code>base=</code> bleibt es beim
        Kamera-Symbol &ndash; ein halb geladenes Bild wäre schlimmer als
        keines. Die Reading-Zeit hängt als Cache-Buster an der URL, weil das
        Bild bei jedem Ereignis unter demselben Pfad liegt. Beispiel:<br>
        <code>attr st_kamera vizCameras base=http://192.168.69.20:8082</code></li>
    <li><a id="FHEMVIZ-attr-vizAgenda"></a><b>vizAgenda</b><br>
        Einstellungen der Terminliste (Widget <code>agenda</code>).
        <code>hide=&lt;Stunden&gt;</code>: so lange bleibt ein <b>abgelaufener</b>
        Termin noch in der Liste, danach verschwindet er (Default
        <code>8</code>, <code>0</code> = nie ausblenden). Der Müll wird
        morgens um 06:00 geholt &ndash; mittags hilft die Zeile keinem mehr.
        Gemessen wird ab der Terminzeit; bei <code>00:00</code>
        (Ganztagstermin) erst ab Tagesende, damit ein Geburtstag nicht schon
        um 08:00 verschwindet. Die Liste prüft das im Fünf-Minuten-Takt, also
        auch ohne neues Kalender-Ereignis. Beispiel:<br>
        <code>attr rem_d_cal_muell vizAgenda hide=12</code></li>
    <li><a id="FHEMVIZ-attr-vizWateringButtons"></a><b>vizWateringButtons</b><br>
        Typ: textField-long. Bedien-Buttons des Bewässerungs-Widgets als
        <code>Label=befehl</code>-Liste, mit <code>|</code> getrennt. Der
        Befehl wird als <code>set &lt;gerät&gt; &lt;befehl&gt;</code>
        abgesetzt und darf Leerzeichen enthalten (z. B.
        <code>startCircuit 8</code>). Buttons erscheinen nur im bedienbaren
        Modus (nicht TV/readonly); <code>start</code>/<code>stop</code>
        werden grün bzw. rot eingefärbt. Default:
        <code>Start=start|Stop=stop</code>. Beispiel:<br>
        <code>attr bewaesserung vizWateringButtons Start=start|Stop=stop|Gewächshaus=startCircuit 8|IBC füllen=startIBCFill</code></li>
    <li><a id="FHEMVIZ-attr-vizText"></a><b>vizText</b><br>
        Typ: textField-long. Freier Text für das <code>text</code>-Widget mit
        Platzhaltern <code>{reading[:stellen][|farbe]}</code>; der eingesetzte
        Wert wird groß und farbig hervorgehoben, der Rest bleibt normaler
        Fließtext. <code>stellen</code> = Nachkommastellen (Default max. 2,
        Nullen weg), <code>farbe</code> = <code>ok|warn|bad|accent|blau</code>
        (Default accent). Die Farbe darf auch <b>Schwellwerte</b> enthalten
        (wie bei vizReadings): <code>{reading|bad@&gt;=25|warn@&gt;=22|blau@&lt;=5}</code>
        &ndash; erster Treffer gewinnt, ohne Treffer neutrale Textfarbe.
        <code>{state}</code> für den Gerätestatus. Auch
        <b>ohne Variable</b>: <code>{=Text|farbe}</code> hebt literalen Text
        groß/farbig hervor, <code>**Text**</code> macht ihn fett. Wichtig:
        der Doppelpunkt trennt die Nachkommastellen, die Farbe steht nach
        dem <code>|</code>. Setzt implizit <code>vizWidget text</code>.
        Beispiele:<br>
        <code>attr weather_dummy vizText Es wird heute {temp_min|blau@&lt;=5|warn@&gt;=22} bis {temp_max|bad@&gt;=30|warn@&gt;=25} Grad</code><br>
        <code>attr d_xy vizText **Achtung:** {=Wartung fällig|warn}</code></li>
    <li><a id="FHEMVIZ-attr-vizImage"></a><b>vizImage</b><br>
        Typ: textField. Bildquelle für das <code>image</code>-Widget: eine
        literale URL (<code>/fhem/icons/…</code> oder <code>http…</code>)
        oder ein <b>Reading-Name</b>, dessen Wert die URL enthält. Ohne
        Angabe wird bei einem <code>weblink</code>-Gerät automatisch die URL
        aus dessen DEF (<code>image &lt;url&gt;</code>) genommen; setzt dann
        implizit <code>vizWidget image</code>. Bildunterschrift = <code>htmlattr
        title="…"</code>, sonst der state. Beispiel:<br>
        <code>attr www_weather_icon_today vizWidget image</code></li>
    <li><a id="FHEMVIZ-attr-vizAlert"></a><b>vizAlert</b><br>
        Typ: textField. Bedingung für eine <b>Störung</b>. Ist sie wahr,
        bekommt die Kachel einen pulsierenden roten Rahmen <b>und</b> das
        Gerät erscheint in der Hinweis-Leiste im Kopf (siehe unten) &ndash;
        live, in Tablet- und TV-Modus.<br>
        Formen je Bedingung:
        <ul>
          <li><code>reading OP wert</code> mit OP aus
              <code>&gt; &lt; &gt;= &lt;= = == != ~ !~</code>.
              <code>~</code>/<code>!~</code> vergleichen mit einem
              <b>regulären Ausdruck</b> (ohne Rücksicht auf
              Groß-/Kleinschreibung), alles andere numerisch oder als Text.
              Der Wert darf <b>leer</b> bleiben: <code>last_error!=</code>
              heißt „Reading nicht leer".</li>
          <li>nur <code>reading</code> &ndash; wahr bei
              on/an/1/true/open/alarm/error/fehler …</li>
        </ul>
        Mehrere Bedingungen mit <b>Komma</b> sind ODER-verknüpft; in der
        Hinweis-Leiste steht der Wert der Bedingung, die zuerst greift.
        <code>state</code> ist als Reading erlaubt. Beispiele:<br>
        <code>attr MQTT2_PUMPE_BLITZ01 vizAlert power&gt;500</code><br>
        <code>attr rauchmelder vizAlert state=alarm</code><br>
        <code>attr rem_SILENO vizAlert mower-error!~^(no_message|)$</code><br>
        <code>attr Yuka vizAlert device_1_status!=online,last_error!=</code><br>
        <code>attr AHL2 vizAlert state!~^(connected|opened|initialized)$</code><br>
        Für den zusätzlichen Vollbild-Alarm im TV-Modus siehe
        <code>set scene</code> (Event-Übernahme).</li>
    <li><a id="FHEMVIZ-attr-vizFlash"></a><b>vizFlash</b> 1|0<br>
        Aufleuchten <b>dieser</b> Kachel bei Wertänderung. Ohne das Attribut
        gilt <code>attr &lt;viz&gt; flash</code> für alle Kacheln.
        <code>0</code> beruhigt eine einzelne zappelige Kachel (z. B. eine
        Leistung, die im Sekundentakt neue Werte liefert), <code>1</code> lässt
        eine wichtige Kachel auch dann blinken, wenn global
        <code>flash 0</code> gesetzt ist. Beispiel:<br>
        <code>attr d_Wechselrichter_all vizFlash 0</code></li>
    <li><a id="FHEMVIZ-attr-vizVolumeMax"></a><b>vizVolumeMax</b><br>
        Obergrenze des Lautstärke-Reglers in der <code>mediagroup</code>-Kachel
        (am AV-Receiver/Player, nicht am <code>structure</code>). Die Schiene
        endet dann dort, ein Griff ans rechte Ende kann also nicht lauter
        werden als der Deckel. Ohne das Attribut gilt der Bereich aus
        <code>PossibleSets</code> (<code>volume:slider,min,step,max</code>,
        bei DENON_AVR 0..98). Beispiel:<br>
        <code>attr Denon vizVolumeMax 55</code></li>
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
    <li><b>msg</b> / <b>msgDuration</b> &ndash; letzte per
        <code>set msg</code> eingeblendete Textnachricht und ihre Dauer.</li>
  </ul><br>

  <a id="FHEMVIZ-hinweise"></a>
  <b>Hinweis-Leiste (Störungen)</b>
  <ul>
    Jedes Gerät der Sicht mit einem zutreffenden <code>vizAlert</code>
    erscheint als roter Chip unter der Kopfzeile: <i>Name: Wert</i>, davor ein
    rotes Ausrufezeichen. Ist nichts gestört, ist die Leiste <b>gar nicht
    da</b> &ndash; sie kostet also keinen Platz und fällt auf, wenn sie
    auftaucht. Ein Tippen springt in den Raum des Geräts (im TV-Modus nur
    Anzeige, dort wird nicht bedient).<br><br>
    Es gibt <b>keine zweite Liste</b> zu pflegen: die Leiste sammelt die
    <code>vizAlert</code>-Attribute der geladenen Geräte ein. Ein Gerät, das
    nur <b>überwacht</b> und nicht als Kachel gezeigt werden soll, kommt in
    einen per <code>hideRooms</code> ausgeblendeten Raum &ndash; es wird
    geladen (das <code>devspec</code> greift), bekommt aber keine Kachel.
    Damit lässt sich eine <code>readingsGroup</code>-Statusseite (Bridges,
    Gateways, Bots) direkt nachbauen:<br>
    <code>attr myViz hideRooms FHEMVIZ-&gt;Stuff,FHEMVIZ-&gt;Status</code><br>
    <code>attr AHL2 room System-&gt;CUL_HM,FHEMVIZ-&gt;Status</code><br>
    <code>attr AHL2 vizAlert state!~^(connected|opened|initialized)$</code><br><br>
    Beim <code>state</code> wird <code>vizStates</code> angewendet, der Chip
    zeigt also denselben Klartext wie die Kachel („Störung" statt „error").
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
    <li><code>?width=1280</code> &ndash; feste Layout-Breite in CSS-Pixeln
        (320&ndash;3840): die Seite wird in dieser Breite gerendert und
        bildschirmfüllend skaliert (siehe Attribut <b>width</b>: TV per
        transform, Tablet per Viewport-Meta). Setzt <code>?zoom=</code>
        außer Kraft. Kleinere Breite = größere Darstellung.</li>
    <li><code>?room=Solar</code> &ndash; Startseite: TV beginnt die Rotation
        mit diesem Raum, Tablet öffnet den Tab; geht vor dem Reading
        <code>page</code></li>
    <li><code>?edit=1</code> &ndash; Editiermodus (siehe unten): Reihenfolge,
        Größe, Blickfang und Ausblenden direkt in der Oberfläche</li>
  </ul><br>

  <a id="FHEMVIZ-edit"></a>
  <b>Editiermodus (<code>?edit=1</code>)</b>
  <ul>
    Mit <code>?edit=1</code> in der URL bekommt jede Kachel einen Rahmen mit
    kleiner Werkzeugleiste, oben erscheint eine Leiste mit
    <i>Speichern</i>/<i>Fertig</i>. Der Modus hat <b>keinen eigenen
    Speicher</b>: er schreibt genau die Attribute, aus denen das Layout
    ohnehin gebaut wird &ndash; das Ergebnis ist also identisch zu
    <code>attr</code> auf der Kommandozeile und lässt sich dort auch
    nachlesen oder korrigieren.
    <li><b>⠿ ziehen</b> &ndash; Reihenfolge innerhalb der Gruppe. Beim
        Loslassen wird <code>sortby</code> als <code>10, 20, 30 …</code>
        neu geschrieben (Lücken, damit sich später einzelne Geräte per
        <code>attr</code> dazwischen setzen lassen). Am oberen/unteren Bildrand
        scrollt die Seite mit, damit sich eine Kachel auch über den sichtbaren
        Ausschnitt hinaus einsortieren lässt.</li>
    <li><b>1x1 / 2x1 / 1x2 / 2x2</b> &ndash; schaltet <code>vizSize</code>
        weiter (<code>1x1</code> löscht das Attribut). Im Streifen-Layout
        (<code>skin zeilen</code>) ist der Knopf gesperrt, weil es dort nur
        eine Spalte gibt.</li>
    <li><b>Hero</b> &ndash; <code>vizHero</code> an/aus. Auch die Kacheln im
        Blickfang-Band oben haben ihre Werkzeugleiste, lassen sich also von
        dort wieder zurücknehmen.</li>
    <li><b>Ausblenden / Einblenden</b> &ndash; <code>vizHide</code> an/aus.
        Ausgeblendete Geräte bleiben im Editiermodus sichtbar (blass
        dargestellt), damit man sie wieder findet.</li>
    <li><b>Raum</b> &ndash; Kachel in einen anderen Tab verschieben. Angeboten
        werden alle vorhandenen <code>FHEMVIZ-&gt;</code>-Räume (per
        <code>hideRooms</code> ausgeblendete mit <code>·</code> markiert) plus
        ein Feld für einen neuen Raum. Geschrieben wird <code>room</code>, und
        zwar <b>nur der eine <code>FHEMVIZ-&gt;</code>-Eintrag</b> dieses
        Vorkommens: die übrigen Räume in der Kommaliste (FHEMWEB-Räume,
        <code>Homebridge</code>, <code>System-&gt;…</code>) bleiben unberührt.
        Liegt ein Gerät in mehreren <code>FHEMVIZ-&gt;</code>-Räumen, wandert
        nur das Vorkommen, dessen Kachel man bedient. Ein Gerät verliert so
        nie seinen letzten Dashboard-Raum &ndash; es wird immer getauscht, nie
        entfernt (dafür ist <code>vizHide</code> da).</li>
    <li><b>Gruppe</b> &ndash; Kachel in einen anderen Abschnitt des Raums
        verschieben, ebenfalls mit Feld für einen neuen Namen.
        <code>ohne Abschnitt</code> setzt <code>vizGroup -</code> (die Kachel
        landet unter <i>Allgemein</i>), <code>Standard (group)</code> löscht
        <code>vizGroup</code> wieder. Geschrieben wird immer
        <code>vizGroup</code>, <b>nie <code>group</code></b>: das benutzen in
        FHEM auch andere (Homebridge, eigene Listen), das Dashboard stellt es
        nicht um.</li>
    <li>Nach einem Umzug ist die Kachel nicht mehr im Bild &ndash; sie steht
        jetzt in einem anderen Tab. Die Leiste sagt, was wohin gewandert ist,
        und bietet <b>Rückgängig</b> an (schreibt den alten Attributwert
        zurück).</li>
    <li><b>↺</b> &ndash; löscht <code>vizSize</code>, <code>vizHero</code>,
        <code>vizHide</code> und <code>sortby</code> dieses Geräts.</li>
    <li><b>Speichern</b> &ndash; ruft <code>save</code>. FHEM hält Attribute
        zunächst nur im Speicher; ohne <code>save</code> sind die Änderungen
        nach einem Neustart weg. Die Leiste zeigt an, ob noch ungespeicherte
        Änderungen offen sind.</li>
    <li><b>Fertig</b> &ndash; verlässt den Modus und entfernt
        <code>edit=1</code> aus der URL (ohne Neuladen).</li>
  </ul>
  Zwei Einschränkungen: der Modus ist im TV-Betrieb und bei
  <code>readonly 1</code> abgeschaltet (dort soll nichts verrutschen), und
  solange er läuft, ist das automatische Vergrößern von Kacheln ausgesetzt
  &ndash; man sieht die Spannweite, die <code>vizSize</code> wirklich
  vorgibt.<br>
  Die Werkzeugleiste sitzt im Rahmen und braucht je nach Kachelbreite eine
  oder zwei Zeilen. Damit deswegen nicht die schmale Kachel neben der breiten
  kleiner aussieht, wird je Abschnitt die höchste Leiste ermittelt, alle
  Leisten darauf angeglichen und die Rasterzeile um diesen Betrag angehoben:
  jede Karte ist im Editiermodus genauso hoch wie ohne ihn.<br><br>

  Ausführliche Beispiele (Installation per <code>update add</code>,
  TV-Einrichtung, Plugin-API für eigene Widgets) stehen im README des
  Projekts: <a href="https://github.com/ahlers2mi/FHEM-FHEMVIZ">github.com/ahlers2mi/FHEM-FHEMVIZ</a>
</ul>

=end html

=cut
