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
                      Afterwards reinstall the normal build and undo steps 2 and 3.
  feature-art.png   ChatGPT (Codex CLI) background art for the feature graphic: no text, empty on the left.

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
# Playfair Display (OFL, scripts/fonts/): the serif for the store captions only, so it isn't bundled into the apps.
SERIF = ROOT / "scripts/fonts/PlayfairDisplay.ttf"
ASSETS = ROOT / "docs/design/assets"

# A calm, CRED-like look (6 Nov 2026): warm grey, a black serif headline in lower case, one line under it, the phone.
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
class App:
    logo: Path
    icon: Path
    # Raw capture (with its Design gallery frame), caption, subline. In listing order. The first one carries the logo.
    shots: list[tuple[str, str, str]]
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
        shots=[
            ("home", "zero commission.\nmade in tamil nadu.", "bike, auto and cab rides across Coimbatore"),  # P-07
            ("choose-ride", "see the fare\nbefore you book.", "locked when you book. no surprises."),  # P-10
            ("driver-on-the-way", "watch your driver\narrive live.", "call or chat, and start with your ride code."),  # P-13
            ("ride-safety", "ride safe,\nevery time.", "SOS to 112 and live trip sharing with family."),  # P-16
            ("pay-driver", "your driver keeps\nevery rupee.", "pay directly by cash or UPI. 0% commission."),  # P-19
            ("parcel", "send anything\nacross town.", "parcels by bike to truck, plus packers & movers."),  # PP-01
        ],
        dark="pay-driver",
        feature_caption="Rides & parcels\nwith *0% commission*",
        feature_sub="Bike · Auto · Cab · Parcel · Coimbatore",
    ),
    "driver": App(
        logo=ASSETS / "logo/tamil-taxi-driver.png",
        icon=ASSETS / "app-icon/tamil-taxi-driver-512.png",
        shots=[
            ("online", "zero commission.\nzero subscription.", "drive with Tamil Taxi and keep every fare."),  # D-14
            ("ride-request", "see the fare\nbefore you accept.", "pickup, drop and distance up front."),  # D-15
            ("to-pickup", "head straight\nto your rider.", "navigate, call or chat in one tap."),  # D-16
            ("collect", "keep every rupee\nof every fare.", "riders pay you directly. 0% commission."),  # D-19
            ("earnings", "know what\nyou earned.", "every trip, day and week."),  # D-23
            ("delivery", "parcels and\nhouse moves too.", "more work between rides."),  # D-21
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


def serif(size: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(SERIF), size)
    f.set_variation_by_name("Bold")
    return f


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
    f = serif(size) if face == "serif" else font(face, size)
    line_h = round(size * (1.12 if face == "serif" else 1.22))
    for line in text.split("\n"):
        parts = [(p, i % 2 == 1) for i, p in enumerate(line.split("*")) if p]
        # Centred on the ink (the glyphs' visible box), not the advance widths, so serif side bearings don't shift it.
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


def phone_shot(app: App, shot: Image.Image, caption: str, sub: str, first: bool, dark: bool) -> Image.Image:
    """Headline and line on top, centred; the phone below, cut by the bottom edge when it runs past it."""
    W, H = 1440, 2560
    img = backdrop(W, H, (0.5, 0.66), dark)
    ink, grey = text_inks(dark)
    y = 190
    if first and not dark:
        logo = logo_image(app, 190)
        img.paste(logo, ((W - logo.width) // 2, 150), logo)
        y = 150 + logo.height + 70
    y = draw_caption(img, caption, 130, y, 112, "center", W - 260, ink=ink, face="serif")
    y = draw_sub(img, sub, 100, y + 44, 44, "center", W - 200, ink=grey, face="Inter-Regular.ttf")
    p = phone(shot, 800)
    img.paste(p, ((W - p.width) // 2, y + 80 - round(p.width * 0.1)), p)
    return img


def tablet_shot(app: App, shot: Image.Image, caption: str, sub: str, W: int, H: int, dark: bool) -> Image.Image:
    s = H / 1440
    img = backdrop(W, H, (0.73, 0.55), dark)
    ink, grey = text_inks(dark)
    left = round(170 * s)
    text_w = round(W * 0.5) - left
    top = round(430 * s)
    if not dark:
        logo = logo_image(app, round(150 * s))
        img.paste(logo, (left, top), logo)
        top += logo.height + round(60 * s)
    y = draw_caption(img, caption, left, top, round(108 * s), "left", text_w, ink=ink, face="serif")
    draw_sub(img, sub, left, y + round(26 * s), round(46 * s), "left", text_w, ink=grey, face="Inter-Regular.ttf")
    p = phone(shot, round(565 * s))
    img.paste(p, (round(W * 0.73) - p.width // 2, (H - p.height) // 2 + round(30 * s)), p)
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
    for i, (shot_name, caption, sub) in enumerate(app.shots, 1):
        shot = clean_status_bar(Image.open(raw / f"{shot_name}.png"))
        if box := BLUR.get((name, shot_name)):
            shot.paste(shot.crop(box).filter(ImageFilter.GaussianBlur(12)), box[:2])
        stem = f"{i:02d}-{shot_name}.png"
        dark = shot_name == app.dark
        phone_shot(app, shot, caption, sub, i == 1, dark).save(out / "phone" / stem, optimize=True)
        tablet_shot(app, shot, caption, sub, 1920, 1080, dark).save(out / "tablet-7in" / stem, optimize=True)
        tablet_shot(app, shot, caption, sub, 2560, 1440, dark).save(out / "tablet-10in" / stem, optimize=True)
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
