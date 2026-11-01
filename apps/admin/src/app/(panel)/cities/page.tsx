import { HexagonIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/common/page";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isOwner } from "@/lib/access";
import { getAccess } from "@/lib/access-server";
import { adminApi } from "@/lib/api";
import { formatCount, formatDate } from "@/lib/format";
import { cellsToKm2 } from "@/lib/validation";

import { AddCityButton, CityActiveSwitch } from "./city-controls";

export const metadata: Metadata = { title: "Cities & zones" };

export default async function CitiesPage() {
  const [all, me] = await Promise.all([adminApi.cities(), getAccess()]);
  // A city-limited role sees its own cities; only owners add cities or switch them on and off.
  const cities = me?.cityScoped ? all.filter((c) => (me.cityIds ?? []).includes(c.id)) : all;
  const canAdd = isOwner(me);
  return (
    <>
      <PageHeader
        title="Cities & zones"
        description="Service areas are sets of H3 hexagons. Bookings outside them are refused; zones add surge, demand hotspots and no-service areas."
        actions={canAdd ? <AddCityButton /> : undefined}
      />
      <Card className="gap-0 py-0">
        {cities.length === 0 ? (
          <EmptyState
            icon={HexagonIcon}
            title="No cities yet"
            description="Without cities every location is treated as serviceable. Add one to limit bookings to its hexagons."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">City</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Cells</TableHead>
                <TableHead className="text-right">Area</TableHead>
                <TableHead className="text-right">Zones</TableHead>
                <TableHead>H3</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="pr-4 text-center">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cities.map((c) => (
                <TableRow key={c.id} className="relative">
                  <TableCell className="pl-4">
                    <Link href={`/cities/${c.id}`} className="font-medium text-navy-900 after:absolute after:inset-0 hover:text-coral-600">
                      {c.name}
                    </Link>
                    <span className="block font-mono text-xs text-muted-foreground">{c.id}</span>
                  </TableCell>
                  <TableCell className="text-navy-700">{c.state}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCount(c.serviceCells.length)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(Math.round(cellsToKm2(c.serviceCells.length, c.h3Resolution)))} km²
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCount(c._count.zones)}</TableCell>
                  <TableCell className="text-navy-700">res {c.h3Resolution}</TableCell>
                  <TableCell className="text-navy-700">{formatDate(c.updatedAt)}</TableCell>
                  <TableCell className="pr-4 text-center">
                    {canAdd ? <CityActiveSwitch id={c.id} name={c.name} isActive={c.isActive} /> : c.isActive ? "Active" : "Off"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
