# Welcome screen pictures

The pictures on the driver D-02 and rider P-02 welcome screens (8 Oct 2026). They were made with ChatGPT image generation through the
Codex CLI that ships with the ChatGPT desktop app, one picture per run, so that every picture comes out in the same
style. The pictures contain no text; the screens set all text in the app.

| File | Screen |
|---|---|
| `apps/driver/assets/onboarding/keep_fare.webp` | D-02 "Drive and keep 100% of every fare" |
| `apps/passenger/assets/onboarding/choose_ride.webp` | P-02 "Rides and parcels at fair prices" |

Four more pictures in the same series were made for a three-slide version that was dropped for one screen (a
woman bike-taxi captain, a driver loading a mini truck, a rider paying an auto driver, a tiffin handed to a
delivery rider). Their prompts are kept below for later use.

## How to make one

1. Write the prompt: the style block below, then the scene.
2. Attach reference pictures: the vehicle miniatures it shows (`packages/tamiltaxi_ui/assets/vehicles/*.webp`,
   converted to PNG) and, for every picture after the first, the auto driver picture as the style reference.

   ```sh
   codex exec --skip-git-repo-check -s read-only -C <dir> --image=style_d1.png --image=bike.png "$(cat prompt.txt)" < /dev/null
   ```

   Use `--image=<file>`, not `-i <file>`: `-i` takes several values and swallows the prompt. The picture lands in
   `~/.codex/generated_images/<session id>/`, and the session id is printed at the top of the run.
3. Check it at full size. Things AI gets wrong: open boots and doors (one try had a car with its boot open, seen
   from the front three-quarter angle, and the tailgate did not look real), text on phones and number
   plates, and hands.
4. Trim and save as WebP (alpha below 8 → 0, crop to the content plus 12 px, longest side 960 px, quality 84):
   about 80–180 KB each.

## Style block (same for every picture)

```text
Generate exactly ONE image with your image generation tool. Do not write files or run commands.

STYLE (keep identical across a series): premium 3D miniature illustration, soft matte clay-like materials, gently rounded friendly proportions (realistic adult proportions, NOT chibi, NOT big heads), soft studio light from the top-left, one soft contact shadow on the ground, crisp clean edges. Palette: white, coral #F4511E, deep navy #1E293B, warm natural Indian skin tones, khaki, tiny touches of green #16A34A. The vehicles must match the attached reference renders exactly in style and colour: white bodywork with coral accents (coral canopy on the auto rickshaw, coral stripe on the car and motorbike). Every vehicle faces the viewer's RIGHT (its front points right), seen from a three-quarter front view.
Setting: Tamil Nadu, South India. People look like real Tamil people, friendly and dignified, not caricatures.
OUTPUT: square 1024x1024 PNG with a FULLY TRANSPARENT background (alpha channel), no ground plane, no backdrop, no circle, no scenery, only the subject and its soft contact shadow. Subject centred, filling about 85% of the width. ABSOLUTELY NO text, letters, numbers, logos, signs, number plates with characters, or UI on phone screens (phone screens are plain glowing green or coral).

SCENE:
```

## Scenes

**D-02 keep_fare, used (reference: auto)**

```text
A smiling Tamil auto rickshaw driver in his late 30s with a neat moustache, wearing a light khaki uniform shirt and dark trousers, standing proudly beside his white auto rickshaw with a coral canopy (front of the auto pointing right). He holds up a smartphone whose screen is a plain glowing green with a large white tick, celebrating a payment received. Three small golden coins float just above the phone. Warm, confident, happy mood.
```

**Bike-taxi captain, not used (references: style_d1, bike)**

```text
A confident young Tamil woman bike-taxi captain in her mid 20s, wearing a coral riding jacket over a navy kurta, white open-face helmet, seated on a white scooter with coral accents (front pointing right), giving a cheerful thumbs-up to the viewer with her left hand. Same rendering style and lighting as the attached driver illustration. Free, light, optimistic mood.
```

**Mini truck driver, not used (references: style_d1, mini_truck)**

```text
A friendly Tamil goods-vehicle driver in his 40s with a short beard, wearing a crisp white uniform shirt and navy trousers, smiling as he lifts a coral cardboard parcel box onto the open, flat cargo bed of a small white mini truck with a coral stripe (like the attached mini truck reference; cab at the right, cargo bed at the left, front pointing right). Two more coral parcel boxes already sit neatly on the cargo bed. The cargo bed is an open-top bed with low fixed side walls and no cover, physically correct and realistic. He stands at the left beside the bed. Same rendering style and lighting as the attached driver illustration. Busy, capable, cheerful mood.
```

**P-02 choose_ride, used (references: style_d1, bike, mini)**

```text
A young Tamil woman office-goer in her 20s wearing a navy kurta with a small coral tote bag, standing in the foreground at the left looking at her phone (screen plain glowing coral) and smiling. Behind her to the right, three Tamil Taxi vehicles stand in a gentle diagonal row: a white motorbike with a coral stripe, a white auto rickshaw with a coral canopy, and a white hatchback with a coral stripe, all fronts pointing right, all empty and parked. Same rendering style and lighting as the attached driver illustration, matching the attached vehicle references. Easy-choice, affordable mood.
```

**Rider pays the auto driver, not used (reference: style_d1)**

```text
A happy moment between a rider and driver: the smiling Tamil auto driver from the attached illustration (same face, moustache, light khaki uniform shirt) sits in the driver seat of the white auto rickshaw with a coral canopy (front pointing right). An elderly Tamil man passenger with grey hair, wearing a white shirt and white veshti, stands beside the auto on the left and holds his phone (plain glowing green screen) out towards the driver to pay; the driver holds up his own phone (plain glowing green screen with a white tick). Both are smiling warmly. Same rendering style and lighting as the attached driver illustration. Trust and fairness mood.
```

**Tiffin to a delivery rider, not used (references: style_d1, bike)**

```text
A cheerful Tamil woman in her 30s wearing a teal saree stands on the left and hands a shiny stainless-steel stacked tiffin carrier (a traditional South Indian three-tier lunch box with a handle) to a smiling young Tamil delivery rider on the right. The rider wears a coral jacket and white helmet and sits on a white motorbike with a coral stripe and a coral delivery box on its rear carrier (bike front pointing right). Same rendering style and lighting as the attached driver illustration, matching the attached motorbike reference. Helpful, everyday mood.
```
