#!/usr/bin/perl
# Prueft, dass FHEMVIZ_Initialize die viz*-Attribute GENAU EINMAL in der
# globalen userattr hinterlaesst - mit der aktuellen Werteliste.
#
# Hintergrund: addToDevAttrList vergleicht ganze Zeichenketten. Aendert sich
# die Werteliste, bleibt die alte Fassung daneben stehen, und FHEMWEB zeigt
# im Dropdown den ERSTEN Treffer. In einer gewachsenen Installation hatten
# sich so 21 Fassungen von "vizWidget" angesammelt.
#
# Die beiden FHEM-Funktionen sind hier 1:1 aus fhem.pl nachgebaut.
use strict;
use warnings;

our (%attr, %attrSource, $AttrList);
$AttrList = "room alias group icon comment";

sub addToDevAttrList($$;$$) {
    my ($dev, $arg, $module) = @_;
    my $ua = $attr{$dev}{userattr};
    $ua = "" if(!$ua);
    my %hash = map { ($_ => 1) }
               grep { " $AttrList " !~ m/ $_ / }
               split(" ", "$ua $arg");
    $attr{$dev}{userattr} = join(" ", sort keys %hash);
    map { s/:.*//; $attrSource{$_}{m} = $module } split(" ", $arg) if($module);
}
sub delFromDevAttrList($$) {
    my ($dev, $arg) = @_;
    my $ua = $attr{$dev}{userattr};
    $ua = "" if(!$ua);
    my %hash = map { ($_ => 1) }
               grep { $_ !~ m/^$arg(:.+)?$/ }
               split(" ", $ua);
    $attr{$dev}{userattr} = join(" ", sort keys %hash);
    delete $attr{$dev}{userattr} if(!keys %hash && defined($attr{$dev}{userattr}));
    map { delete $attr{$dev}{$_} } split(" ", (split(":", $arg))[0]);
}
# Achtung, 1:1 wie in fhem.pl: die Argumente EINZELN weiterreichen. Ein
# "addToDevAttrList(\"global\", @_)" waere falsch - der Prototyp ($$;$$)
# wertet @_ im Skalarkontext aus, angekommen waere die ANZAHL.
sub addToAttrList($;$) { my ($arg, $modul) = @_; addToDevAttrList("global", $arg, $modul) }
sub delFromAttrList($) { delFromDevAttrList("global", shift) }

# Das MODUL laden und seine Initialize wirklich laufen lassen - nur so kann
# der Test rot werden, wenn die Aufraeum-Schleife dort verschwindet.
our ($readingFnAttributes, %defs, %modules, %data, $init_done);
$readingFnAttributes = "event-on-change-reading";
$init_done = 1;

# Ausgangslage: eine gewachsene Installation mit Altfassungen.
$attr{global}{userattr} = join(" ",
    "vizWidget:switch,sensor,dimmer,actions",
    "vizWidget:switch,sensor,dimmer,actions,text,agenda",
    "vizHero:1,0",
    "vizSize:1x1,2x1",
    "structexclude",              # fremdes Attribut, muss bleiben
);

require FindBin;
require "$FindBin::Bin/../FHEM/98_FHEMVIZ.pm";
my %h;
FHEMVIZ_Initialize(\%h);

# Die erwarteten Eintraege aus dem Quelltext lesen, damit der Test nicht
# veraltet, sobald ein Attribut dazukommt.
my $quelle = do {
    open(my $fh, "<", "$FindBin::Bin/../FHEM/98_FHEMVIZ.pm") or die $!;
    local $/; <$fh>;
};
my ($block) = $quelle =~ /my \@FHEMVIZ_DEV_ATTRS = \(\n(.*?)\n\);/s;
die "Attributliste nicht gefunden" if(!$block);
my @ATTRS = ($block =~ /"([^"]+)"/g);
die "Attributliste leer" if(!@ATTRS);

my $tests = 0; my $bad = 0;
sub ok { my ($n, $w, $i) = @_; $tests++;
    if($w) { print "ok   $n\n"; return }
    $bad++; print "FEHL $n" . (defined $i ? "  ($i)" : "") . "\n"; }

my @jetzt = split(" ", $attr{global}{userattr});
my %anzahl; $anzahl{(split(":", $_))[0]}++ for @jetzt;

foreach my $a (@ATTRS) {
    my ($name) = split(":", $a);
    ok("$name genau einmal", ($anzahl{$name} || 0) == 1, "kommt " . ($anzahl{$name} || 0) . "x vor");
    ok("$name mit aktueller Werteliste", (grep { $_ eq $a } @jetzt) == 1);
}
ok("fremdes Attribut bleibt", (grep { $_ eq "structexclude" } @jetzt) == 1);
ok("keine Altfassung mehr da",
   (grep { /^vizWidget:switch,sensor,dimmer,actions$/ || /^vizHero:1,0$/ } @jetzt) == 0);
ok("global bekommt kein viz-Attribut angehaengt",
   !grep { /^viz/ } grep { $_ ne "userattr" } keys %{$attr{global}});

print "\n$tests Tests, $bad Fehler\n";
exit($bad ? 1 : 0);
