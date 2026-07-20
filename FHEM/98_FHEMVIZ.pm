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
# Version:  v0.7.6
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
my $FHEMVIZ_VERSION = "98_FHEMVIZ.pm:v0.7.6";

# Standard fuer das Attribut hideRooms: technische/Integrations-Raeume, die
# im Dashboard nicht als eigene Raeume erscheinen sollen. Kommaseparierte
# Regex-Liste (jeder Eintrag wird in der SPA als ^(?:...)$ gematcht).
# Per "attr <name> hideRooms ..." anpassbar; leerer Wert zeigt alles.
my $FHEMVIZ_DEFAULT_HIDEROOMS = 'System->.*,Homebridge,Alexa,FileLog,hidden';

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
    "vizWidget:switch,sensor,dimmer,actions,text,agenda",
    "vizSize:1x1,2x1,1x2,2x2",
    "vizHide:1,0",
    "vizReadings:textField-long",
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
          "tvScenes " .
          "hideRooms " .
          "hideTypes " .
          "hideStates " .
          $readingFnAttributes;

    # viz*-Attribute global verfuegbar machen (erstklassige FHEM-Buerger:
    # Dropdown + Vervollstaendigung an jedem Geraet).
    foreach my $a (@FHEMVIZ_DEV_ATTRS) {
        addToAttrList($a);
    }
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

    # TODO (Bau-Session): devspec auswerten, Sicht-Modell aufbauen,
    # Attribut-Registrierung (viz*) und get-Endpunkte aktivieren.

    return undef;
}

# ----------------------------------------------------------------------------
# FHEMVIZ_Undef
#   Wird beim Loeschen des Geraets aufgerufen. Aktuell keine Ressourcen
#   zu bereinigen (Grundgeruest).
# ----------------------------------------------------------------------------
sub FHEMVIZ_Undef {
    my ($hash, $arg) = @_;
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
# ----------------------------------------------------------------------------
sub FHEMVIZ_Set {
    my ($hash, $name, $cmd, @args) = @_;
    return "Unknown argument, choose one of scene" if (!defined($cmd));

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

    return "Unknown argument $cmd, choose one of scene";
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
        my $hideRooms  = AttrVal($name, "hideRooms", $FHEMVIZ_DEFAULT_HIDEROOMS);
        my $hideTypes  = AttrVal($name, "hideTypes", $FHEMVIZ_DEFAULT_HIDETYPES);
        my $hideStates = AttrVal($name, "hideStates", $FHEMVIZ_DEFAULT_HIDESTATES);

        return sprintf(
            '{"name":%s,"version":%s,"devspec":%s,"theme":%s,"readonly":%s,'
              . '"mode":%s,"tvScenes":%s,'
              . '"hideRooms":%s,"hideTypes":%s,"hideStates":%s}',
            FHEMVIZ_jsonStr($name),
            FHEMVIZ_jsonStr("v0.7.6"),
            FHEMVIZ_jsonStr($devspec),
            FHEMVIZ_jsonStr($theme),
            $readonly,
            FHEMVIZ_jsonStr($mode),
            FHEMVIZ_jsonStr($tvScenes),
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
        # TODO (Bau-Session): Validierung der viz*-Attribute (Widget-Typen,
        # vizSize-Raster, vizChart-Reading-Referenzen).
    }

    return undef;
}


1;

=pod
=item helper
=item summary Moderne, responsive FHEM-Visualisierung (Konfiguration im FHEM-Standard)
=item summary_DE Moderne, responsive FHEM-Visualisierung (Konfiguration im FHEM-Standard)
=begin html

<a name="FHEMVIZ"></a>
<h3>FHEMVIZ</h3>
<ul>
  <p>
    <b>FHEMVIZ</b> ist das schlanke Helfer-Modul einer modernen, responsiven
    FHEM-Visualisierung. Die eigentliche Oberflaeche ist eine statische
    Single-Page-App, die FHEMWEB aus <code>www/fhemviz/</code> ausliefert
    (<code>http://&lt;fhem&gt;:&lt;port&gt;/fhem/fhemviz/index.html</code>) -
    es wird <b>kein</b> zusaetzlicher Webserver benoetigt.
  </p>
  <p>
    Das Modul rendert nichts. Seine Aufgabe ist es, die Zusatz-Attribute
    (<code>viz*</code>) als erstklassige FHEM-Buerger bereitzustellen und
    spaeter die aktive Sicht als JSON auszuliefern. Die gesamte Konfiguration
    bleibt damit im FHEM-Standard (Attribute am Geraet) - die "Single Source
    of Truth".
  </p>
  <p>
    <b>Hinweis:</b> PoC-Stand (v0.2.0). <code>get config</code> liefert die
    aktive Sicht (devspec/theme/readonly) als JSON; die SPA nutzt sie. Die
    Attribut-Registrierung/-Validierung der <code>viz*</code>-Attribute folgt
    noch - siehe <code>CONCEPT.md</code>.
  </p>

  <a name="FHEMVIZdefine"></a>
  <b>Define</b>
  <ul>
    <code>define &lt;name&gt; FHEMVIZ [&lt;devspec&gt;]</code>
    <br><br>
    <ul>
      <li><b>devspec</b> &ndash; (optional) FHEM-Geraeteauswahl fuer diese
          Sicht (z. B. <code>room=Dashboard.*</code>)</li>
    </ul>
  </ul>
  <br>

  <a name="FHEMVIZset"></a>
  <b>Set</b>
  <ul>
    <li><b>scene &lt;name&gt; [sekunden]</b> &ndash; erzwingt im TV-Modus die
        Szene <code>&lt;name&gt;</code> (= Raumname) fuer die angegebene Dauer
        (Default 30 s), danach kehrt die Szenen-Rotation zurueck. Die SPA
        empfaengt das live ueber den inform-Kanal &ndash; damit steuern ganz
        normale notify/DOIF den Fernseher:<br>
        <code>define n_tor_tv notify d_garage_neu:onoff:.* set myViz scene Garage 60</code></li>
  </ul>
  <br>

  <a name="FHEMVIZget"></a>
  <b>Get</b>
  <ul>
    <li><b>manifest</b> / <b>config</b> &ndash; aktive Sicht als JSON
        (devspec, theme, readonly, mode, tvScenes, hide*-Filter)</li>
  </ul>
  <br>

  <a name="FHEMVIZattr"></a>
  <b>Attributes</b>
  <ul>
    <li><b>disable</b> 1|0 &ndash; Deaktiviert das Geraet</li>
    <li><b>readonly</b> 1|0 &ndash; Nur-Lese-Sicht (keine Bedienelemente)</li>
    <li><b>devspec</b> &ndash; Geraeteauswahl fuer diese Sicht</li>
    <li><b>theme</b> auto|light|dark &ndash; Farbschema der Oberflaeche</li>
    <li><b>mode</b> tablet|tv &ndash; Betriebsart. <code>tablet</code>
        (Default): bedienbar, Raum-Tabs unten. <code>tv</code>: keine
        Bedienelemente, grosse Ziffern, automatische Szenen-Rotation.
        Per URL uebersteuerbar: <code>?mode=tv</code></li>
    <li><b>tvScenes</b> &ndash; Szenen-Rotation im TV-Modus als
        kommaseparierte Liste <code>Raum:Sekunden</code>, z. B.
        <code>Solar:30,Wohnzimmer:20,Garage:15</code>. Ohne Angabe rotieren
        alle sichtbaren Raeume mit je 20 s.</li>
    <li><b>hideRooms</b> &ndash; kommaseparierte Regex-Liste von Raeumen, die
        nicht als eigene Dashboard-Raeume erscheinen (Default:
        <code>System-&gt;.*,Homebridge,Alexa,FileLog,hidden</code>;
        leer = alle Raeume anzeigen)</li>
    <li><b>hideTypes</b> &ndash; kommaseparierte Liste von FHEM-TYPEs, die
        nicht als Kachel erscheinen (Default:
        <code>SVG,FileLog,notify,at,DOIF,watchdog,weblink,readingsGroup</code>)</li>
    <li><b>hideStates</b> &ndash; kommaseparierte Regex-Liste; Geraete, deren
        state komplett darauf matcht, werden ausgeblendet (Default:
        <code>\?\?\?,unknown,initialized,defined,disabled,inactive</code>).
        Ein Geraet mit gesetztem <code>vizWidget</code>-Attribut wird immer
        angezeigt.</li>
  </ul>
  <br>

  <a name="FHEMVIZdevattr"></a>
  <b>Geraete-Attribute (an den visualisierten Geraeten, global registriert)</b>
  <ul>
    <li><b>vizWidget</b> switch|sensor|dimmer|actions|text|agenda &ndash; Widget-Typ
        erzwingen; uebersteuert genericDeviceType/Heuristik und die
        Rausch-Filter (Geraet wird immer angezeigt). <code>text</code> zeigt
        mehrzeiligen Klartext (z. B. Kalender-/Terminlisten) mit erhaltenen
        Zeilenumbruechen.</li>
    <li><b>vizSize</b> 1x1|2x1|1x2|2x2 &ndash; Kachelgroesse im Raster;
        2x2 ergibt eine Hero-Kachel mit groesserer Schrift</li>
    <li><b>vizHide</b> 1|0 &ndash; Geraet aus der Sicht ausblenden</li>
    <li><b>vizReadings</b> &ndash; Kachelinhalt direkt aus Readings statt
        state-Parsing: <code>reading[:Label[:Einheit[:Farbe]]]</code>,
        kommasepariert; erster Eintrag = Hauptwert (gross). Farben sind
        semantische Namen: <code>ok</code>/<code>gruen</code>,
        <code>warn</code>/<code>orange</code>, <code>bad</code>/<code>rot</code>,
        <code>accent</code>, <code>blau</code>. Ist das Attribut gesetzt, wird
        state ignoriert und das Geraet immer angezeigt. Beispiel:<br>
        <code>attr d_Wechselrichter_all vizReadings
        soc:Ladung:%:accent,pv_leistung:PV:W:ok,out_leistung:Haus:W:bad,netzleistung_all:Netz:W:ok,batterie_leistung:Batterie:W:warn</code></li>
  </ul>
</ul>

=end html

=cut
