"""Builds the apps' vehicle miniatures from two ChatGPT sprite sheets in docs/design/vechile/.

    python3 scripts/vehicle_icons/build.py            # writes packages/tamiltaxi_ui/assets/vehicles/<kind>.webp
    python3 scripts/vehicle_icons/build.py --preview  # also build/vehicle_icons/preview.png (light + dark rows)

Pink Taxi (rides for women riders with women drivers) uses `<kind>_pink.webp`: the same vehicles with the coral
accent turned pink (only coral-orange hues move, so the yellow plates and white bodies stay).

The sheets are transparent 1536 x 1024 PNGs, two rows of vehicles, made with the ChatGPT image model from the brief
in prompt.md (soft 3D, front three-quarter view, white with one coral accent, no logos or text). The folder is kept
local (git-ignored) like the earlier renders. ChatGPT draws the fronts pointing left; every app in the market shows
them pointing right, so each vehicle is mirrored (the set has no text, so that is safe).

Each vehicle is found by the empty columns around it (they can spill across the grid cells), trimmed, mirrored and
placed on one 336 x 240 canvas (the 56 x 40 dp list box at 6x, sharp up to the 96 dp driver cards) with one wheel
baseline, a size per class (two-wheelers smaller than cars) and the same soft ground shadow.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'docs', 'design', 'vechile')
OUT = os.path.join(ROOT, 'packages', 'tamiltaxi_ui', 'assets', 'vehicles')

# Sheet → asset names in reading order (row by row, left to right as ChatGPT drew them).
SHEETS = {
    'Tamil Taxi passenger vehicles (ChatGPT).png': ['bike', 'scooty', 'auto', 'mini', 'sedan', 'suv'],
    'Tamil Taxi goods vehicles (ChatGPT).png': ['goods_bike', 'three_wheeler', 'mini_truck', 'pickup', 'truck'],
}
ROWS = 2

# Pink Taxi copies of the vehicles a rider can book.
PINK = ['bike', 'scooty', 'auto', 'auto_priority', 'mini', 'sedan', 'suv']
PINK_HUE = 241  # #E91E63 on PIL's 0-255 hue scale (340°)

CW, CH, BASE = 336, 240, 220  # canvas and the line the wheels stand on, px
# Largest box (w, h) each vehicle may fill on the canvas, so the list reads at a real-world-ish scale.
FIT = {
    'bike': (264, 188), 'scooty': (240, 188), 'auto': (244, 204), 'mini': (300, 180), 'sedan': (324, 176),
    'suv': (320, 192), 'goods_bike': (268, 192), 'three_wheeler': (284, 204), 'mini_truck': (312, 196),
    'pickup': (324, 188), 'truck': (324, 208),
}


def vehicles_in(sheet):
    """The vehicles of a sheet as trimmed RGBA images, row by row, split at empty columns."""
    alpha = sheet.getchannel('A').point(lambda a: 255 if a > 24 else 0)
    band_h = sheet.height // ROWS
    found = []
    for r in range(ROWS):
        band = alpha.crop((0, r * band_h, sheet.width, (r + 1) * band_h))
        filled = [band.crop((x, 0, x + 1, band_h)).getbbox() is not None for x in range(sheet.width)]
        x = 0
        while x < sheet.width:
            if filled[x]:
                start = x
                while x < sheet.width and any(filled[x:x + 12]):  # a gap under 12 px is inside one vehicle
                    x += 1
                if x - start > 60:
                    box = (start, r * band_h, x, (r + 1) * band_h)
                    v = sheet.crop(box)
                    found.append(v.crop(v.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()))
            x += 1
    return found


def place(v, max_w, max_h):
    """Mirrored vehicle on the canvas: scaled into its class box, centred, wheels on BASE, soft shadow under it."""
    v = ImageOps.mirror(v)
    s = min(max_w / v.width, max_h / v.height)
    v = v.resize((round(v.width * s), round(v.height * s)), Image.LANCZOS)
    canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    shade = Image.new('L', (CW, CH), 0)
    w = v.width * 0.84
    ImageDraw.Draw(shade).ellipse(((CW - w) / 2, BASE - 10, (CW + w) / 2, BASE + 12), fill=64)
    shadow = Image.new('RGBA', (CW, CH), (30, 41, 59, 0))  # navy900
    shadow.putalpha(shade.filter(ImageFilter.GaussianBlur(8)))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(v, ((CW - v.width) // 2, BASE - v.height + 6))
    return canvas


def with_bolt(auto):
    """Auto Priority: the auto with a small navy bolt badge at its top left."""
    im = auto.copy()
    k = 4  # drawn large and scaled down for smooth edges
    badge = Image.new('RGBA', (32 * k, 32 * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(badge)
    d.ellipse((0, 0, 32 * k - 1, 32 * k - 1), fill=(30, 41, 59, 255))
    bolt = [(18, 5), (8, 18), (15, 18), (13, 27), (24, 13), (17, 13), (19, 5)]
    d.polygon([(x * k, y * k) for x, y in bolt], fill=(255, 255, 255, 255))
    badge = badge.resize((32 * 2, 32 * 2), Image.LANCZOS)
    im.alpha_composite(badge, (28, 12))
    return im


def pink(im):
    """The coral accent (hue up to ~34°, saturated) turned pink; everything else unchanged."""
    r, g, b, a = im.split()
    hsv = Image.merge('RGB', (r, g, b)).convert('HSV')
    h, s, v = hsv.split()
    hp, sp, vp = h.load(), s.load(), v.load()
    for y in range(im.height):
        for x in range(im.width):
            if hp[x, y] <= 24 and sp[x, y] > 90 and vp[x, y] > 60:
                hp[x, y] = PINK_HUE
    out = Image.merge('HSV', (h, s, v)).convert('RGB')
    return Image.merge('RGBA', (*out.split(), a))


def save(name, im):
    path = os.path.join(OUT, f'{name}.webp')
    im.save(path, 'WEBP', quality=90, method=6)
    print(f'{name}: {im.width}x{im.height}, {os.path.getsize(path) // 1024} KB')


def main():
    os.makedirs(OUT, exist_ok=True)
    built = {}
    for file, names in SHEETS.items():
        sheet = Image.open(os.path.join(SRC, file)).convert('RGBA')
        found = vehicles_in(sheet)
        if len(found) != len(names):
            sys.exit(f'{file}: found {len(found)} vehicles, expected {len(names)}')
        for name, v in zip(names, found):
            built[name] = place(v, *FIT[name])
    built['auto_priority'] = with_bolt(built['auto'])
    for name in PINK:
        built[f'{name}_pink'] = pink(built[name])
    for name, im in built.items():
        save(name, im)
    if '--preview' in sys.argv:
        out = os.path.join(ROOT, 'build', 'vehicle_icons')
        os.makedirs(out, exist_ok=True)
        sheet = Image.new('RGBA', (CW * len(built), CH * 2), (255, 255, 255, 255))
        sheet.paste(Image.new('RGBA', (CW * len(built), CH), (22, 29, 39, 255)), (0, CH))
        for i, im in enumerate(built.values()):
            sheet.alpha_composite(im, (i * CW, 0))
            sheet.alpha_composite(im, (i * CW, CH))
        sheet.save(os.path.join(out, 'preview.png'))


if __name__ == '__main__':
    main()
