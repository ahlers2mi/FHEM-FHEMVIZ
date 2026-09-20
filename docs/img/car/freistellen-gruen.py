# Gruenscreen-Freistellung mit Entmischung, Fassung fuer das Rendering mit
# gruenem Ladekabel und gruener Ladegrafik (20.09.2026).
#
# Unterschied zur Fassung vom 29.08.: das Kabel ist diesmal selbst gruen
# (weiss-gruener Kern, gruener Leuchthof), also KEIN Farbfilter auf Tuerkis.
# Stattdessen zwei Dinge:
#  1. Hintergrund nur, was ueber die Gruenstichigkeit passt UND mit dem
#     Bildrand zusammenhaengt (Zusammenhangskomponente). Der gruene Ring am
#     Ladeport und die Ladegrafik liegen im Wagen und bleiben so stehen.
#  2. Entmischen statt nur maskieren: px = a*fg + (1-a)*bg  ->  fg = (px-(1-a)bg)/a.
#     Der Leuchthof des Kabels bekommt so seine eigene Farbe zurueck statt
#     einen Saum in Hintergrundgruen.
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1]
OUT = sys.argv[2]
# RELATIVE Gruenstichigkeit (g - max(r,b)) / g: der Bodenschatten hat dieselbe
# Farbe wie der Hintergrund, nur dunkler - absolut gemessen (203 gegen 135)
# blieb er als gruener Fleck unter dem Wagen stehen. Relativ sind beide 0,90.
BG_HART = 0.84    # ab hier sicher Hintergrund (BG und Schatten ~0,90)
BG_WEICH = 0.55   # darunter sicher Vordergrund (Kabelkern 0,25, Leuchthof 0,5-0,75)

im = np.asarray(Image.open(SRC).convert("RGB")).astype(float)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
gr = (g - np.maximum(r, b)) / np.maximum(g, 1)

# Hintergrundfarbe aus den Raendern
rand = np.concatenate([im[:40].reshape(-1, 3), im[-40:].reshape(-1, 3), im[:, :40].reshape(-1, 3), im[:, -40:].reshape(-1, 3)])
bg = np.median(rand, axis=0)
print("Hintergrundfarbe", bg.round(1), file=sys.stderr)

# Sehr dunkle Pixel (Reifen, Radkasten) haben r=b=0 und g=3 - relativ ist das
# 1,0. Zweite Bedingung deshalb ein absoluter Mindestabstand von 12: der
# Bodenschatten (g ~40-150, r,b ~0) erfuellt ihn, ein schwarzer Reifen nicht.
hart = (gr >= BG_HART) & (g - np.maximum(r, b) >= 12)
lab, n = ndimage.label(hart)
randlabels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bgmask = np.isin(lab, list(randlabels))
print(f"harte BG-Komponenten {n}, davon am Rand {len(randlabels)}; abgeschnittene gruene Inseln im Wagen: {int((hart & ~bgmask).sum())} px", file=sys.stderr)

# Weiche Zone: nur in der Nachbarschaft des echten Hintergrunds
nah = ndimage.binary_dilation(bgmask, iterations=8)
a = np.ones_like(gr)
a[bgmask] = 0.0
weich = nah & ~bgmask & (gr > BG_WEICH) & (g - np.maximum(r, b) >= 6)
a[weich] = np.clip((BG_HART - gr[weich]) / (BG_HART - BG_WEICH), 0, 1)
print(f"weiche Pixel {int(weich.sum())}, davon alpha<0.5: {int((a[weich] < 0.5).sum())}", file=sys.stderr)

# Entmischen
fg = im.copy()
m = (a > 0) & (a < 1)
aa = a[m][:, None]
fg[m] = np.clip((im[m] - (1 - aa) * bg) / aa, 0, 255)

out = np.dstack([fg, a * 255]).astype(np.uint8)
img = Image.fromarray(out, "RGBA")

# Beschneiden auf den Inhalt (alpha > 8) mit 12 px Rand
ys, xs = np.where(a > 0.03)
y0, y1, x0, x1 = max(ys.min() - 12, 0), min(ys.max() + 12, a.shape[0]), max(xs.min() - 12, 0), min(xs.max() + 12, a.shape[1])
img = img.crop((x0, y0, x1, y1))
print(f"Zuschnitt {img.size}, Inhalt x {xs.min()}-{xs.max()}, y {ys.min()}-{ys.max()}", file=sys.stderr)
img.save(OUT)
