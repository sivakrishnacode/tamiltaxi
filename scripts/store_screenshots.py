#!/usr/bin/env python3
"""Google Play store graphics for both apps: framed phone and tablet screenshots, feature graphic, icon.

Inputs (docs/play-store/raw/<app>/, app = passenger or driver):
  <name>.png        phone captures, 1080 × 2392, of Design gallery frames (seed data) with real Google Maps; the
                      frame IDs are in APPS below. To retake them on an Android phone:
                      1. scripts/flutter.sh build apk --release --target-platform android-arm64 \
                           --dart-define=TT_LIVE_API=false --dart-define=TT_DESIGN_GALLERY=true; adb install -r …
                      2. adb shell pm revoke com.tamiltaxi.<app> android.permission.ACCESS_FINE_LOCATION
                         (and ..._COARSE_...): without location the map shows the seed place, not where the phone
                         is. Sign in (any number and code in mock mode); rider: "Enter location manually"; driver: the
                         prefilled sign-up (Continue, Save, Verify, Take photo, Use photo) is approved in seconds.
                      3. Clean status bar: adb shell settings put global sysui_demo_allowed 1, then
                         am broadcast -a com.android.systemui.demo -e command enter / clock / battery / network;
                         heads_up_notifications_enabled 0 so no banner lands on a shot.
                      4. Account › Design gallery › search the frame ID › open it, wait ~8 s for the map, then
                         adb exec-out screencap -p > docs/play-store/raw/<app>/<name>.png
                         D-14 (driver "online"): zoom the map out one step first (it is a Google map: double-tap and
                         drag up; with adb, `input tap` then `input motionevent DOWN/MOVE/UP`), so the busy areas show
                         as a honeycomb with streets around them.
                      5. Check the screen edges: some phones add an edge-lighting glow to captures.
                      Afterwards reinstall the normal build and undo steps 2 and 3. A retaken capture may move the
                      card a shot lifts out (`Pop` boxes in APPS): check the framed PNGs.
  feature-art.png   ChatGPT (Codex CLI) background art for the feature graphic: no text, empty on the left.

Art: docs/design/assets/pictures/ (each app's welcome picture and Home's line art) for the first shot's card.

Outputs (docs/play-store/<app>/):
  phone/NN-<name>.png        1440 × 2560 (9:16)
  tablet-7in/NN-<name>.png   1920 × 1080 (16:9)
  tablet-10in/NN-<name>.png  2560 × 1440 (16:9)
  feature-graphic.png        1024 × 500
  icon-512.png               copy of the app's Play Store icon in docs/design/assets/app-icon/

Run: python3 scripts/store_screenshots.py [passenger|driver]   (both when no app is given)
"""
from dataclasses import dataclass
from pathlib import Path
import shutil
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "packages/tamiltaxi_ui/assets/google_fonts"
# Anek Tamil ExtraBold (OFL, scripts/fonts/): the store headlines only, so it isn't bundled into the apps.
HEADLINE = ROOT / "scripts/fonts/AnekTamil.ttf"
ASSETS = ROOT / "docs/design/assets"

# A calm, CRED-like look (6 Nov 2026): warm grey, a black headline (Anek Tamil since 10 Nov), one line under it, the
# phone; from the second shot on, the key part of the screen lifted out of the phone (Ola's listing).
INK = (22, 22, 24)
GREY = (92, 92, 98)
CORAL = (216, 67, 21)
NAVY = (30, 41, 59)
BG = (241, 239, 236)
BG_GLOW = (250, 249, 247)
DARK_TOP = (17, 20, 27)
DARK_BOTTOM = (30, 22, 20)
FRAME = (15, 23, 42)


@dataclass(frozen=True)
class Pop:
    """The part of a capture lifted out of the phone, enlarged, with a shadow: its box in capture pixels, how much
    bigger than on the phone, and whether it is round."""
    box: tuple[int, int, int, int]
    grow: float = 1.4
    round: bool = False


@dataclass(frozen=True)
class App:
    logo: Path
    icon: Path
    # The first shot's art card: the app's welcome picture (docs/design/assets/pictures/).
    welcome: Path
    # Raw capture (with its Design gallery frame), caption, subline, the part lifted out. In listing order. The first
    # one carries the logo, the art card and the manifesto line, and lifts nothing out.
    shots: list[tuple[str, str, str, Pop | None]]
    feature_caption: str
    feature_sub: str
    # The one shot on a dark background (with a coral glow), as a change of pace in the row.
    dark: str = ""
    # How big the art sits on the feature graphic: small enough that its subject clears the text on the left.
    feature_scale: float = 0.56


APPS = {
    "passenger": App(
        logo=ASSETS / "logo/tamil-taxi.png",
        icon=ASSETS / "app-icon/tamil-taxi-512.png",
        welcome=ASSETS / "pictures/welcome-rider.webp",
        shots=[
            ("home", "Zero commission.\nMade in Tamil Nadu.", "The zero-commission promise, on the road in Coimbatore.",
             None),  # P-07
            ("choose-ride", "See the fare\nbefore you book.", "Locked when you book. No surprises.",
             Pop((36, 1712, 1044, 1890))),  # P-10
            ("driver-on-the-way", "Watch your driver\narrive live.", "Call or chat, and start with your ride code.",
             Pop((36, 1585, 1044, 1800))),  # P-13
            ("ride-safety", "Ride safe,\nevery time.", "SOS to 112 and live trip sharing with family.",
             Pop((839, 1591, 1029, 1781), 2.2, round=True)),  # P-16: the SOS button
            ("pay-driver", "Your driver keeps\nevery rupee.", "Pay directly by cash or UPI. 0% commission.",
             Pop((36, 1600, 1044, 1770))),  # P-19
            ("parcel", "Send anything\nacross town.", "Parcels by bike to truck, plus packers & movers.",
             Pop((36, 1088, 1044, 1395), 1.32)),  # PP-01
        ],
        dark="pay-driver",
        feature_caption="Rides & parcels\nwith *0% commission*",
        feature_sub="Bike · Auto · Cab · Parcel · Coimbatore",
    ),
    "driver": App(
        logo=ASSETS / "logo/tamil-taxi-driver.png",
        icon=ASSETS / "app-icon/tamil-taxi-driver-512.png",
        welcome=ASSETS / "pictures/welcome-driver.webp",
        shots=[
            ("online", "Zero commission.\nZero subscription.", "The zero-commission promise, ready for every driver.",
             None),  # D-14
            ("ride-request", "See the fare\nbefore you accept.", "Pickup, drop and distance up front.",
             Pop((36, 309, 1044, 1256), 1.18)),  # D-15
            ("to-pickup", "Head straight\nto your rider.", "Navigate, call or chat in one tap.",
             Pop((36, 1690, 1044, 1860))),  # D-16
            ("collect", "Keep every rupee\nof every fare.", "Riders pay you directly. 0% commission.",
             Pop((196, 1222, 884, 1310), 1.9)),  # D-19
            ("earnings", "Know what\nyou earned.", "Every trip, day and week.",
             Pop((0, 480, 1080, 735), 1.3)),  # D-23
            ("meter-running", "A meter for\noff-app passengers.", "The government auto fare, worked out by GPS.",
             Pop((42, 795, 1038, 995), 1.42)),  # D-42b
            ("delivery", "Parcels and\nhouse moves too.", "More work between rides.",
             Pop((36, 1540, 1044, 1675))),  # D-21
        ],
        dark="collect",
        feature_caption="Drive and keep\n*100% of every fare*",
        feature_sub="0% commission · No subscription",
        feature_scale=0.5,
    ),
}

# Notification icons right of the clock on the capture phone (its demo mode doesn't hide them), in 1080-wide
# capture pixels: covered with the empty status-bar strip just right of them.
ICONS_BOX = (178, 28, 305, 98)

# Blurred on these captures, in capture pixels: the driver's UPI QR would pay a seed UPI ID that may be someone's real
# one if scanned off the store listing. Blur a retaken raw capture the same way before committing it (the repo is public).
BLUR = {("driver", "collect"): (271, 558, 809, 1096)}


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def headline(size: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(HEADLINE), size)
    f.set_variation_by_name("ExtraBold")
    return f


def fit(text: str, size: int, max_w: int) -> int:
    """The headline size, from [size] down, at which every line of [text] fits in [max_w]."""
    d = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    while any(d.textlength(line.replace("*", ""), font=headline(size)) > max_w - 8 for line in text.split("\n")):
        size -= 2
    return size


def backdrop(w: int, h: int, glow_at: tuple[float, float], dark: bool) -> Image.Image:
    """Warm grey with a soft light behind the phone; or near-black with a coral glow there (the dark shot)."""
    if dark:
        img = Image.new("RGB", (w, h))
        d = ImageDraw.Draw(img)
        for y in range(h):
            t = y / max(h - 1, 1)
            d.line([(0, y), (w, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(DARK_TOP, DARK_BOTTOM)))
        glow, colour, strength = Image.new("L", (w, h), 0), CORAL, 150
    else:
        img, glow, colour, strength = Image.new("RGB", (w, h), BG), Image.new("L", (w, h), 0), BG_GLOW, 255
    r = round(min(w, h) * 0.42)
    cx, cy = round(w * glow_at[0]), round(h * glow_at[1])
    ImageDraw.Draw(glow).ellipse([cx - r, cy - r, cx + r, cy + r], fill=strength)
    glow = glow.filter(ImageFilter.GaussianBlur(r * 0.55))
    img.paste(Image.new("RGB", (w, h), colour), (0, 0), glow)
    return img


def clean_status_bar(shot: Image.Image) -> Image.Image:
    """Covers [ICONS_BOX] with the strip to its right, blended in over a few pixels on the left."""
    shot = shot.convert("RGB")
    x1, y1, x2, y2 = ICONS_BOX
    w = x2 - x1
    patch = shot.crop((x2, y1, x2 + w, y2))
    mask = Image.new("L", patch.size, 255)
    for x in range(12):
        ImageDraw.Draw(mask).line([(x, 0), (x, patch.height)], fill=round(255 * x / 12))
    shot.paste(patch, (x1, y1), mask)
    return shot


def phone(shot: Image.Image, screen_w: int) -> Image.Image:
    """The capture in a dark phone frame with rounded corners and a soft shadow (RGBA, shadow included)."""
    screen_h = round(screen_w * shot.height / shot.width)
    bezel = round(screen_w * 0.028)
    r_screen = round(screen_w * 0.075)
    fw, fh = screen_w + 2 * bezel, screen_h + 2 * bezel
    pad = round(screen_w * 0.12)  # room for the shadow
    out = Image.new("RGBA", (fw + 2 * pad, fh + 2 * pad), (0, 0, 0, 0))

    shadow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [pad, pad + bezel * 2, pad + fw, pad + fh + bezel * 2], r_screen + bezel, fill=(0, 0, 0, 60))
    out = Image.alpha_composite(out, shadow.filter(ImageFilter.GaussianBlur(pad * 0.4)))

    d = ImageDraw.Draw(out)
    d.rounded_rectangle([pad, pad, pad + fw, pad + fh], r_screen + bezel, fill=FRAME)
    screen = shot.convert("RGB").resize((screen_w, screen_h), Image.LANCZOS)
    mask = Image.new("L", (screen_w, screen_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, screen_w - 1, screen_h - 1], r_screen, fill=255)
    out.paste(screen, (pad + bezel, pad + bezel), mask)
    return out


def draw_caption(
    img: Image.Image, text: str, box_x: int, y: int, size: int, align: str, max_w: int,
    ink: tuple[int, int, int] = NAVY, face: str = "Poppins-Bold.ttf",
) -> int:
    """Draws [text] (lines split on \\n, *word* in coral) and returns the y below it."""
    d = ImageDraw.Draw(img)
    f = headline(size) if face == "headline" else font(face, size)
    line_h = round(size * (1.12 if face == "headline" else 1.22))
    for line in text.split("\n"):
        parts = [(p, i % 2 == 1) for i, p in enumerate(line.split("*")) if p]
        # Centred on the ink (the glyphs' visible box), not the advance widths, so side bearings don't shift it.
        left, _, right, _ = d.textbbox((0, 0), "".join(p for p, _ in parts), font=f)
        width = right - left
        assert width <= max_w, f"caption too wide: {line!r}"
        x = (box_x + (max_w - width) / 2 if align == "center" else box_x) - left
        for p, coral in parts:
            d.text((x, y), p, font=f, fill=CORAL if coral else ink)
            x += d.textlength(p, font=f)
        y += line_h
    return y


def draw_sub(
    img: Image.Image, text: str, box_x: int, y: int, size: int, align: str, max_w: int,
    ink: tuple[int, int, int] = (71, 85, 105), face: str = "Inter-Medium.ttf",
) -> int:
    d = ImageDraw.Draw(img)
    f = font(face, size)
    left, _, right, _ = d.textbbox((0, 0), text, font=f)
    w = right - left
    assert w <= max_w, f"subline too wide: {text!r}"
    d.text(((box_x + (max_w - w) / 2 if align == "center" else box_x) - left, y), text, font=f, fill=ink)
    return y + round(size * 1.4)


def text_inks(dark: bool) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    return ((255, 255, 255), (205, 208, 214)) if dark else (INK, GREY)


def logo_image(app: App, height: int) -> Image.Image:
    logo = Image.open(app.logo).convert("RGBA")
    return logo.resize((round(logo.width * height / logo.height), height), Image.LANCZOS)


def screen_capture(name: str, shot_name: str, raw: Path) -> Image.Image:
    shot = clean_status_bar(Image.open(raw / f"{shot_name}.png"))
    if box := BLUR.get((name, shot_name)):
        shot.paste(shot.crop(box).filter(ImageFilter.GaussianBlur(12)), box[:2])
    return shot


def pop_card(shot: Image.Image, pop: Pop, scale: float, dark: bool) -> tuple[Image.Image, int]:
    """[pop]'s part of [shot] at [scale], with rounded corners (or round), a shadow and a hairline; and its padding."""
    x1, y1, x2, y2 = pop.box
    w, h = round((x2 - x1) * scale), round((y2 - y1) * scale)
    card = shot.crop(pop.box).resize((w, h), Image.LANCZOS)
    pad = 70
    r = min(w, h) // 2 if pop.round else 30

    def shape(draw: ImageDraw.ImageDraw, xy: list[int], **kw) -> None:
        draw.ellipse(xy, **kw) if pop.round else draw.rounded_rectangle(xy, r, **kw)

    out = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    shadow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    shape(ImageDraw.Draw(shadow), [pad, pad + 26, pad + w, pad + h + 26], fill=(0, 0, 0, 170 if dark else 75))
    out = Image.alpha_composite(out, shadow.filter(ImageFilter.GaussianBlur(30)))
    mask = Image.new("L", (w, h), 0)
    shape(ImageDraw.Draw(mask), [0, 0, w - 1, h - 1], fill=255)
    out.paste(card, (pad, pad), mask)
    if not pop.round:  # a hairline, so the card reads against a screen of the same colour
        light = card.convert("L").resize((1, 1)).getpixel((0, 0)) >= 110
        line = (0, 0, 0, 22) if light else (255, 255, 255, 70)
        ImageDraw.Draw(out).rounded_rectangle([pad, pad, pad + w - 1, pad + h - 1], r, outline=line, width=3)
    return out, pad


def paste_phone_and_pop(
    img: Image.Image, shot: Image.Image, pop: Pop | None, screen_w: int, at: tuple[int, int], dark: bool,
    left_min: int, top_min: int,
) -> None:
    """The phone with its top-left at [at]; then [pop] lifted out over the same place on its screen, kept right of
    [left_min], below [top_min] and inside the image."""
    p = phone(shot, screen_w)
    img.paste(p, at, p)
    if pop is None:
        return
    k = screen_w / shot.width
    card, pad = pop_card(shot, pop, k * pop.grow, dark)
    inset = round(screen_w * 0.12) + round(screen_w * 0.028)  # phone(): shadow room + bezel
    x1, y1, x2, y2 = pop.box
    cx, cy = at[0] + inset + (x1 + x2) / 2 * k, at[1] + inset + (y1 + y2) / 2 * k
    w, h = card.width - 2 * pad, card.height - 2 * pad
    left = min(max(cx - w / 2, left_min), img.width - 50 - w)
    top = min(max(cy - h / 2, top_min), img.height - 40 - h)
    img.paste(card, (round(left) - pad, round(top) - pad), card)


def art_card(app: App, w: int, h: int, r: int) -> tuple[Image.Image, int]:
    """The first shot's card: Home's line art of the city behind the app's welcome picture, on a warm gradient, with
    a shadow; and its padding. Our own art: no real person's photo or likeness goes on the listing."""
    top, bottom = (255, 244, 234), (253, 196, 158)
    art = Image.linear_gradient("L").resize((w, h))
    art = Image.composite(Image.new("RGB", (w, h), bottom), Image.new("RGB", (w, h), top), art).convert("RGBA")
    line = Image.open(ASSETS / "pictures/home-footer.png").convert("RGBA")
    lw = round(w * 1.7)  # big enough that the temples and the clock tower fill the sky
    line = line.resize((lw, round(line.height * lw / line.width)), Image.LANCZOS)
    line.putalpha(line.getchannel("A").point(lambda a: a * 0.5))
    art.alpha_composite(line, ((w - lw) // 2, round(-0.2 * line.height)))  # its top 40% is empty sky
    pic = Image.open(app.welcome).convert("RGBA")
    pw = round(w * 1.12)
    pic = pic.resize((pw, round(pic.height * pw / pic.width)), Image.LANCZOS)
    art.alpha_composite(pic, (round(w * -0.02), h - pic.height + 30))
    pad = 60
    out = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    shadow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([pad, pad + 18, pad + w, pad + h + 18], r, fill=(60, 30, 10, 70))
    out = Image.alpha_composite(out, shadow.filter(ImageFilter.GaussianBlur(28)))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255)
    out.paste(art.convert("RGB"), (pad, pad), mask)
    return out, pad


def first_shot(app: App, shot: Image.Image, caption: str, sub: str) -> Image.Image:
    """Logo, headline and line on top; the art card on the left with the phone over its right edge; under the card,
    the manifesto's promise quoted with its source, and that the app is independent."""
    W, H = 1440, 2560
    img = backdrop(W, H, (0.5, 0.7), False)
    logo = logo_image(app, 170)
    img.paste(logo, ((W - logo.width) // 2, 120), logo)
    y = draw_caption(img, caption, 130, 120 + 170 + 60, fit(caption, 112, W - 260), "center", W - 260, ink=INK,
                     face="headline")
    draw_sub(img, sub, 100, y + 40, 44, "center", W - 200, ink=GREY, face="Inter-Regular.ttf")
    card, pad = art_card(app, 740, 1130, 56)
    img.paste(card, (80 - pad, 840 - pad), card)
    p = phone(shot, 620)
    ppad = round(620 * 0.12)
    img.paste(p, (W - 70 - (p.width - 2 * ppad) - ppad, 1080 - ppad), p)
    quote = "“A Tamil Taxi app,\nno commission\nfrom drivers.”"
    y = draw_caption(img, quote, 90, 2030, fit(quote, 58, 560), "left", 560, ink=INK, face="headline")
    y = draw_sub(img, "TVK manifesto, 2026", 92, y + 14, 32, "left", 560, ink=CORAL, face="Inter-Medium.ttf")
    y = draw_sub(img, "Tamil Taxi is an independent app,", 92, y + 30, 27, "left", 560, ink=GREY, face="Inter-Regular.ttf")
    draw_sub(img, "not run by the Government.", 92, y - 6, 27, "left", 560, ink=GREY, face="Inter-Regular.ttf")
    return img


def phone_shot(shot: Image.Image, caption: str, sub: str, pop: Pop | None, dark: bool) -> Image.Image:
    """Headline and line on top, centred; the phone below, cut by the bottom edge; [pop] lifted out of it."""
    W, H = 1440, 2560
    img = backdrop(W, H, (0.5, 0.62), dark)
    ink, grey = text_inks(dark)
    y = draw_caption(img, caption, 130, 170, fit(caption, 112, W - 260), "center", W - 260, ink=ink, face="headline")
    y = draw_sub(img, sub, 100, y + 40, 44, "center", W - 200, ink=grey, face="Inter-Regular.ttf")
    sw = 740
    pw = phone(shot, sw).width
    paste_phone_and_pop(img, shot, pop, sw, ((W - pw) // 2, y + 70 - round(sw * 0.12)), dark, 50, y + 30)
    return img


def tablet_shot(app: App, shot: Image.Image, caption: str, sub: str, pop: Pop | None, W: int, H: int, first: bool,
                dark: bool) -> Image.Image:
    """Logo (first shot), headline and line on the left; the phone on the right, [pop] lifted out of it."""
    s = H / 1440
    img = backdrop(W, H, (0.73, 0.55), dark)
    ink, grey = text_inks(dark)
    left = round(170 * s)
    text_w = round(W * 0.5) - left
    top = round(430 * s)
    if first:
        logo = logo_image(app, round(150 * s))
        img.paste(logo, (left, top), logo)
        top += logo.height + round(60 * s)
    y = draw_caption(img, caption, left, top, fit(caption, round(108 * s), text_w), "left", text_w, ink=ink,
                     face="headline")
    # The line, wrapped to the text column (the first shots' lines are long).
    size, f = round(46 * s), font("Inter-Regular.ttf", round(46 * s))
    lines = [""]
    for word in sub.split():
        joined = f"{lines[-1]} {word}".strip()
        if f.getlength(joined) <= text_w:
            lines[-1] = joined
        else:
            lines.append(word)
    y += round(26 * s)
    for line in lines:
        y = draw_sub(img, line, left, y, size, "left", text_w, ink=grey, face="Inter-Regular.ttf")
    sw = round(565 * s)
    p = phone(shot, sw)
    at = (round(W * 0.73) - p.width // 2, (H - p.height) // 2 + round(30 * s))
    paste_phone_and_pop(img, shot, pop, sw, at, dark, round(W * 0.52), round(40 * s))
    return img


def feature_graphic(app: App, raw: Path) -> Image.Image:
    W, H = 1024, 500
    art = Image.open(raw / "feature-art.png").convert("RGB")
    # The art against the right edge at app.feature_scale (its subject clear of the text), its cream left edge
    # stretched over the rest.
    scale = app.feature_scale
    band_h = round(H / scale)
    top = (art.height - band_h) // 2
    art = art.crop((0, top, art.width, top + band_h)).resize((round(art.width * scale), H), Image.LANCZOS)
    img = Image.new("RGB", (W, H))
    img.paste(art.crop((0, 0, 1, H)).resize((W - art.width, H)), (0, 0))
    img.paste(art, (W - art.width, 0))
    logo = Image.open(app.logo).convert("RGBA")
    logo = logo.resize((round(logo.width * 160 / logo.height), 160), Image.LANCZOS)
    img.paste(logo, (64, 64), logo)
    y = draw_caption(img, app.feature_caption, 64, 262, 36, "left", 420)
    draw_sub(img, app.feature_sub, 64, y + 8, 19, "left", 420)
    return img


def build(name: str) -> None:
    app = APPS[name]
    raw = ROOT / "docs/play-store/raw" / name
    out = ROOT / "docs/play-store" / name
    for d in ("phone", "tablet-7in", "tablet-10in"):
        (out / d).mkdir(parents=True, exist_ok=True)
    for d in ("phone", "tablet-7in", "tablet-10in"):  # a shot dropped from APPS mustn't linger
        for old in (out / d).glob("*.png"):
            old.unlink()
    for i, (shot_name, caption, sub, pop) in enumerate(app.shots, 1):
        shot = screen_capture(name, shot_name, raw)
        stem = f"{i:02d}-{shot_name}.png"
        dark = shot_name == app.dark
        first = i == 1
        img = first_shot(app, shot, caption, sub) if first else phone_shot(shot, caption, sub, pop, dark)
        img.save(out / "phone" / stem, optimize=True)
        for d, (w, h) in (("tablet-7in", (1920, 1080)), ("tablet-10in", (2560, 1440))):
            tablet_shot(app, shot, caption, sub, pop, w, h, first, dark).save(out / d / stem, optimize=True)
        print(name, "framed", stem)
    if (raw / "feature-art.png").exists():
        feature_graphic(app, raw).save(out / "feature-graphic.png", optimize=True)
        print(name, "feature-graphic.png")
    shutil.copyfile(app.icon, out / "icon-512.png")


def main() -> None:
    for name in sys.argv[1:] or list(APPS):
        build(name)


if __name__ == "__main__":
    main()
