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
# Version:  v0.2.0
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
my $FHEMVIZ_VERSION = "98_FHEMVIZ.pm:v0.2.0";

# Minimaler Satz eigener Attribute (Namespace-Praefix "viz"), gedacht fuer die
# visualisierten Geraete - NICHT fuer das FHEMVIZ-Geraet selbst. Sie werden in
# einer spaeteren Bau-Session global registriert (addToDevAttrList) und hier
# validiert. Siehe CONCEPT.md, Abschnitt 3b.
#   vizWidget - Widget-Typ explizit erzwingen/ueberschreiben
#   vizSize   - Kachelgroesse im responsiven Raster (z. B. 1x1, 2x1, 2x2)
#   vizChart  - Readings, die als Graph/Sparkline angezeigt werden
#   vizHide   - Geraet/Reading aus der Sicht ausblenden
#   vizPage   - optionale Zuordnung zu einer Sicht abweichend von room
my @FHEMVIZ_DEV_ATTRS = qw(vizWidget vizSize vizChart vizHide vizPage);

# ----------------------------------------------------------------------------
# FHEMVIZ_Initialize
#   Wird von FHEM beim Laden des Moduls aufgerufen.
#   Registriert die Callback-Funktionen und die Attributliste des
#   FHEMVIZ-Geraets selbst (Sicht-/Theme-Konfiguration).
# ----------------------------------------------------------------------------
sub FHEMVIZ_Initialize {
    my ($hash) = @_;

    $hash->{DefFn}   = \&FHEMVIZ_Define;
    $hash->{UndefFn} = \&FHEMVIZ_Undef;
    $hash->{GetFn}   = \&FHEMVIZ_Get;
    $hash->{AttrFn}  = \&FHEMVIZ_Attr;

    # Attribute des FHEMVIZ-Geraets (die aktive Sicht). Die geraetebezogenen
    # viz*-Attribute (@FHEMVIZ_DEV_ATTRS) werden separat registriert - TODO
    # in spaeterer Bau-Session (addToDevAttrList).
    $hash->{AttrList} =
          "disable:1,0 " .
          "readonly:1,0 " .
          "devspec " .
          "theme:auto,light,dark " .
          $readingFnAttributes;
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
        my $devspec  = AttrVal($name, "devspec", "");
        my $theme    = AttrVal($name, "theme", "auto");
        my $readonly = AttrVal($name, "readonly", 0) ? "true" : "false";

        return sprintf(
            '{"name":%s,"version":%s,"devspec":%s,"theme":%s,"readonly":%s}',
            FHEMVIZ_jsonStr($name),
            FHEMVIZ_jsonStr("v0.2.0"),
            FHEMVIZ_jsonStr($devspec),
            FHEMVIZ_jsonStr($theme),
            $readonly
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

  <a name="FHEMVIZget"></a>
  <b>Get</b>
  <ul>
    <li><b>manifest</b> &ndash; (geplant) aktive Sicht als JSON</li>
    <li><b>config</b> &ndash; (geplant) aufbereitete Konfiguration als JSON</li>
  </ul>
  <br>

  <a name="FHEMVIZattr"></a>
  <b>Attributes</b>
  <ul>
    <li><b>disable</b> 1|0 &ndash; Deaktiviert das Geraet</li>
    <li><b>readonly</b> 1|0 &ndash; Nur-Lese-Sicht (keine Set-Buttons)</li>
    <li><b>devspec</b> &ndash; Geraeteauswahl fuer diese Sicht</li>
    <li><b>theme</b> auto|light|dark &ndash; Farbschema der Oberflaeche</li>
  </ul>
  <br>

  <a name="FHEMVIZdevattr"></a>
  <b>Geraete-Attribute (geplant, an den visualisierten Geraeten)</b>
  <ul>
    <li><b>vizWidget</b> &ndash; Widget-Typ erzwingen/ueberschreiben</li>
    <li><b>vizSize</b> &ndash; Kachelgroesse im Raster (z. B. 1x1, 2x1, 2x2)</li>
    <li><b>vizChart</b> &ndash; Readings als Graph/Sparkline</li>
    <li><b>vizHide</b> &ndash; Geraet/Reading ausblenden</li>
    <li><b>vizPage</b> &ndash; Sicht abweichend von <code>room</code></li>
  </ul>
</ul>

=end html

=cut
