#!/usr/bin/env python3
"""Builds an app's launcher icons and splash pictures from its logo (apps/<app>/assets/brand/logo.png).

    python3 scripts/brand_icons.py passenger                  # icons + splash from the committed logo
    python3 scripts/brand_icons.py passenger --from art.png   # first make the logo from new art (trimmed, opaque)

The logo is the "Clean White" Tamil Taxi logo (13 Oct 2026): navy car and தமிழ், coral pin and TAXI, on a transparent
background, made with ChatGPT from the owner's brand board (the art stays local in docs/private/brand/). It writes,
under apps/<app>/android/app/src/main/res/:

- mipmap-*/ic_launcher_bg.png: plain white (adaptive icon background, 108 dp).
- mipmap-*/ic_launcher_foreground.png: the logo, 47 % of the 108 dp canvas wide, inside the area every launcher mask
  shows. mipmap-*/ic_launcher_monochrome.png: the same, one colour (Android 13 themed icons; the logo's white
  details stay open).
- mipmap-*/ic_launcher.png: the legacy icon (Android 7 and older): the logo on a white rounded square.
- drawable-xxxhdpi/splash_icon.png: Android 12+ system splash, 288 dp at 4x, the logo 136 dp wide (it has to fit
  the 192 dp circle). drawable-nodpi/splash_logo.png: the same logo for the older launch_background.xml (136 dp).

and a copy of the xxxhdpi ic_launcher.png in packages/tamiltaxi_ui/assets/brand/ for the design gallery.
"""
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
GALLERY = {'passenger': 'launcher_rider.png', 'driver': 'launcher_driver.png'}
SPLASH_DP = 136  # logo width on both native splashes and on P-01 / D-01


def make_logo(art, out):
    """Trim the art to its shapes, make its near-opaque pixels opaque, at most 1024 px, 256 colours."""
    im = Image.open(art).convert('RGBA')
    a = im.getchannel('A').point(lambda v: 255 if v >= 232 else v)
    im.putalpha(a)
    im = im.crop(a.point(lambda v: 255 if v > 8 else 0).getbbox())
    im.thumbnail((1024, 1024), Image.LANCZOS)
    # 256 colours keep this flat art identical at a tenth of the size (~55 KB).
    im.quantize(256, method=Image.Quantize.FASTOCTREE).save(out, optimize=True)
    print(f'logo: {im.width}x{im.height}, {os.path.getsize(out) // 1024} KB')


def fitted(logo, width):
    im = logo.copy()
    return im.resize((round(width), round(width * logo.height / logo.width)), Image.LANCZOS)


def centred(canvas, im):
    canvas.alpha_composite(im, ((canvas.width - im.width) // 2, (canvas.height - im.height) // 2))
    return canvas


def mono(im):
    """One colour where the logo is dark or coloured; its white details become holes."""
    r, g, b, a = im.split()
    lum = Image.merge('RGB', (r, g, b)).convert('L')
    keep = lum.point(lambda v: 255 if v < 215 else 0)
    alpha = Image.composite(a, Image.new('L', im.size, 0), keep)
    out = Image.new('RGBA', im.size, (255, 255, 255, 0))
    out.putalpha(alpha)
    return out


def main():
    app = sys.argv[1]
    logo_path = os.path.join(ROOT, 'apps', app, 'assets', 'brand', 'logo.png')
    if '--from' in sys.argv:
        make_logo(sys.argv[sys.argv.index('--from') + 1], logo_path)
    logo = Image.open(logo_path).convert('RGBA')
    res = os.path.join(ROOT, 'apps', app, 'android', 'app', 'src', 'main', 'res')
    for name, k in DENSITIES.items():
        d = os.path.join(res, f'mipmap-{name}')
        side = round(108 * k)
        Image.new('RGBA', (side, side), (255, 255, 255, 255)).save(os.path.join(d, 'ic_launcher_bg.png'))
        fg = centred(Image.new('RGBA', (side, side), (0, 0, 0, 0)), fitted(logo, side * 0.47))
        fg.save(os.path.join(d, 'ic_launcher_foreground.png'))
        mono(fg).save(os.path.join(d, 'ic_launcher_monochrome.png'))
        # Legacy: white rounded square (drawn at 4x for smooth corners) with the logo.
        s = round(48 * k) * 4
        sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        mask = Image.new('L', (s, s), 0)
        pad = round(s * 0.04)
        ImageDraw.Draw(mask).rounded_rectangle((pad, pad, s - 1 - pad, s - 1 - pad), radius=round(s * 0.2), fill=255)
        sq.paste(Image.new('RGBA', (s, s), (255, 255, 255, 255)), (0, 0), mask)
        centred(sq, fitted(logo, s * 0.66)).resize((s // 4, s // 4), Image.LANCZOS).save(
            os.path.join(d, 'ic_launcher.png'))
    splash = centred(Image.new('RGBA', (1152, 1152), (0, 0, 0, 0)), fitted(logo, SPLASH_DP * 4))
    splash.save(os.path.join(res, 'drawable-xxxhdpi', 'splash_icon.png'), optimize=True)
    fitted(logo, SPLASH_DP * 4).save(os.path.join(res, 'drawable-nodpi', 'splash_logo.png'), optimize=True)
    gallery = os.path.join(ROOT, 'packages', 'tamiltaxi_ui', 'assets', 'brand', GALLERY[app])
    Image.open(os.path.join(res, 'mipmap-xxxhdpi', 'ic_launcher.png')).save(gallery)
    h = round(SPLASH_DP * logo.height / logo.width)
    print(f'{app}: icons and splash written; splash logo {SPLASH_DP} x {h} dp')


if __name__ == '__main__':
    main()
