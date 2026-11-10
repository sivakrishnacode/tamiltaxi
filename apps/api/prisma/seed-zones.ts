// A city's starting zones from public data (prisma/zones/<city>.ts). Only creates zones the city doesn't have by name,
// so admins' edits are never overwritten; re-running adds nothing new.
//   npm run seed:zones -w @tamiltaxi/api -- chennai            # create the missing ones
//   npm run seed:zones -w @tamiltaxi/api -- chennai --dry-run  # list what it would create
// Each zone is the hexes around its points, cut to the city's service area; a hex an earlier zone of the same kind
// already has goes to that one only. Colours as in the admin: pickup points teal, demand purple.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { cellToChildren, cellToParent, gridDisk, latLngToCell } from 'h3-js';

import { PrismaClient } from '../src/generated/prisma/client.js';

export interface ZoneSeed {
  readonly name: string;
  readonly kind: 'PICKUP_POINT' | 'DEMAND';
  /** The zone's hexagon resolution: the city's or finer, up to 10. */
  readonly res: number;
  /** Rings of hexes around each point (0: only the point's hex). */
  readonly rings: number;
  /** Its points, [lat, lng]; the zone covers the rings around each. */
  readonly at: readonly (readonly [number, number])[];
}

const COLORS = { PICKUP_POINT: '#0891B2', DEMAND: '#7C3AED' } as const;
/** Hexes compared at this resolution when zones of one kind overlap (the finest a zone may use). */
const FINEST = 10;

/**
 * [seed]'s hexes inside the service area ([service] at [cityRes]) and not yet [taken] by an earlier zone of its kind
 * (res-10 hexes, updated).
 */
function seedCells(seed: ZoneSeed, service: ReadonlySet<string>, cityRes: number, taken: Set<string>): string[] {
  const around = new Set(seed.at.flatMap(([lat, lng]) => gridDisk(latLngToCell(lat, lng, seed.res), seed.rings)));
  const fine = (c: string) => (seed.res === FINEST ? [c] : cellToChildren(c, FINEST));
  const cells = [...around].filter((c) => service.has(cellToParent(c, cityRes)) && !fine(c).every((f) => taken.has(f)));
  for (const c of cells) for (const f of fine(c)) taken.add(f);
  return cells.sort();
}

async function main(): Promise<void> {
  const [cityId, ...flags] = process.argv.slice(2);
  if (!cityId || !/^[a-z0-9-]+$/.test(cityId)) throw new Error('Usage: seed-zones.ts <city id> [--dry-run]');
  const dryRun = flags.includes('--dry-run');
  const { ZONES } = (await import(`./zones/${cityId}.js`)) as { ZONES: readonly ZoneSeed[] };
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
  try {
    const city = await prisma.city.findUniqueOrThrow({ where: { id: cityId }, include: { zones: { select: { name: true, kind: true, cells: true } } } });
    const service = new Set(city.serviceCells);
    const have = new Set(city.zones.map((z) => z.name.toLowerCase()));
    // The city's own zones claim their hexes first.
    const taken = { PICKUP_POINT: new Set<string>(), DEMAND: new Set<string>() };
    for (const z of city.zones) {
      if (z.kind !== 'PICKUP_POINT' && z.kind !== 'DEMAND') continue;
      for (const c of z.cells) for (const f of cellToChildren(c, FINEST)) taken[z.kind].add(f);
    }
    let created = 0;
    for (const seed of ZONES) {
      if (seed.res < city.h3Resolution || seed.res > FINEST) throw new Error(`${seed.name}: resolution ${seed.res} must be ${city.h3Resolution}–${FINEST}`);
      if (have.has(seed.name.toLowerCase())) {
        console.log(`  kept     ${seed.name} (already there)`);
        continue;
      }
      const cells = seedCells(seed, service, city.h3Resolution, taken[seed.kind]);
      if (cells.length === 0) {
        console.log(`  skipped  ${seed.name} (outside the service area or covered)`);
        continue;
      }
      console.log(`  ${dryRun ? 'would add' : 'added   '} ${seed.kind === 'DEMAND' ? 'demand ' : 'pickup '} ${seed.name}: ${cells.length} hexes (res ${seed.res})`);
      if (!dryRun) await prisma.zone.create({ data: { cityId, name: seed.name, kind: seed.kind, cells, color: COLORS[seed.kind] } });
      created++;
    }
    console.log(`${city.name}: ${created} zone(s) ${dryRun ? 'to add' : 'added'}, ${ZONES.length - created} kept or skipped.`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
