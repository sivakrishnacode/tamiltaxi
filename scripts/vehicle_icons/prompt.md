# Vehicle miniatures: ChatGPT brief

The vehicle pictures in `packages/tamiltaxi_ui/assets/vehicles/` come from two sprite sheets made with the ChatGPT
image model (5 Oct 2026). To add a vehicle, generate a sheet with the same brief, save it in `docs/design/vechile/`,
add it to `SHEETS` in `build.py` and run the script. ChatGPT draws the fronts pointing left; `build.py` mirrors them
so they point right like every other ride app.

## Shared style (keep identical)

- Soft, friendly 3D "toy miniature" render, slightly rounded and simplified forms, smooth matte surfaces, minimal
  panel lines, clean and premium. Not photographic, no outlines.
- Camera: three-quarter FRONT view, every vehicle facing toward the lower-left, camera slightly above (about 20
  degrees), long lens with little perspective distortion. Whole vehicle visible, centred in its grid cell, filling
  about 85% of the cell width.
- Light: bright soft studio light from the top-left, gentle ambient occlusion. NO ground shadow, NO reflection, NO
  floor (`build.py` adds one shadow for all).
- Colours: body pearl white (#F7F8FA); ONE accent colour, warm coral orange (#F4511E): a single side stripe on cars
  and trucks, the canopy on auto-rickshaws, a small side panel on two-wheelers; windows dark navy glass (#1E293B)
  with a subtle reflection; tyres and trim soft charcoal (#2F3A4A), never pure black; small yellow number plates
  with NO characters.
- Absolutely no logos, badges, emblems, brand marks, text, letters or numbers anywhere.
- Background: fully transparent PNG.
- Landscape 1536 x 1024, 3 columns x 2 rows grid, lots of empty space between vehicles, no grid lines.

## Sheets

1. Passenger: commuter motorcycle (Indian 125cc, upright, no rider); step-through scooter (no rider); Indian
   auto-rickshaw (three-wheeler with canopy) / small hatchback (short rear, no boot); compact sedan with a clearly
   separate boot; compact SUV (taller, roof rails).
2. Goods: commuter motorcycle with a square coral delivery box on the rear carrier (no rider); Indian cargo
   three-wheeler with an open flat cargo bed; small Indian mini truck (1-tonne light commercial vehicle) with an open
   cargo bed / pickup truck with an open bed; medium closed box truck with a white box body and a coral stripe;
   last cell empty.

With the Codex CLI that ships in the ChatGPT desktop app: `codex exec --skip-git-repo-check -s read-only "<brief>"
< /dev/null`; the images land in `~/.codex/generated_images/`.
