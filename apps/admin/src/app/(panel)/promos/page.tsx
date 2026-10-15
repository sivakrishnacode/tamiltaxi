import { ImagesIcon } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { adminApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { promoStatus, type PromoStatus } from "@/lib/promos";
import type { Promo } from "@/lib/types";
import { cn } from "@/lib/utils";

import { BannerOrderInput, DeletePromoButton, NewPromoButton, PromoToggle } from "./promo-controls";

export const metadata: Metadata = { title: "Splash & banners" };

const STATUS_CLASS: Record<PromoStatus, string> = {
  Live: "bg-success-tint text-success-text",
  Scheduled: "bg-coral-50 text-coral-700",
  Hidden: "",
  Ended: "",
};

export default async function PromosPage() {
  const promos = await adminApi.promos();
  const splashes = promos.filter((p) => p.placement === "SPLASH");
  const banners = promos.filter((p) => p.placement === "BANNER");
  const nextOrder = banners.length ? Math.min(999, Math.max(...banners.map((b) => b.sortOrder)) + 1) : 0;

  return (
    <>
      <PageHeader
        title="Splash & banners"
        description="Pictures in the passenger app: a full-screen splash while it opens, and banners on Home."
        actions={<NewPromoButton nextOrder={nextOrder} />}
      />
      <div className="grid gap-8">
        <section aria-labelledby="splash-heading" className="grid gap-3">
          <div>
            <h2 id="splash-heading" className="font-heading text-lg font-semibold text-navy-900">
              Splash screen
            </h2>
            <p className="text-sm text-muted-foreground">
              Full screen for 2 seconds as the app opens, for festivals and offers. The newest live one shows. Phones
              download it in the background, so it appears from the next launch; one starting within 3 days is fetched
              early.
            </p>
          </div>
          {splashes.length === 0 ? (
            <Card>
              <EmptyState icon={ImagesIcon} title="No splash" description="The app opens with the Tamil Taxi logo." />
            </Card>
          ) : (
            splashes.map((p) => <PromoCard key={p.id} promo={p} />)
          )}
        </section>

        <section aria-labelledby="banners-heading" className="grid gap-3">
          <div>
            <h2 id="banners-heading" className="font-heading text-lg font-semibold text-navy-900">
              Home banners
            </h2>
            <p className="text-sm text-muted-foreground">
              Riders swipe through the live ones on Home, under “More ways to travel”, lowest order first. Its × hides
              one until the app restarts; a tap opens its link.
            </p>
          </div>
          {banners.length === 0 ? (
            <Card>
              <EmptyState icon={ImagesIcon} title="No banners" description="Home shows no banner row." />
            </Card>
          ) : (
            banners.map((p) => <PromoCard key={p.id} promo={p} />)
          )}
        </section>
      </div>
    </>
  );
}

function PromoCard({ promo: p }: { promo: Promo }) {
  const status = promoStatus(p);
  const isBanner = p.placement === "BANNER";
  return (
    <Card className="flex-col gap-4 px-4 sm:flex-row sm:items-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- served through /promo-images; next/image can't optimise it */}
      <img
        src={`/promo-images/${encodeURIComponent(p.id)}`}
        alt={p.title}
        className={cn(
          "shrink-0 rounded-lg border bg-muted object-cover",
          isBanner ? "aspect-[2/1] w-full sm:w-56" : "aspect-[9/20] w-24",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-heading font-semibold text-navy-900">
          {p.title}
          <Badge variant="secondary" className={STATUS_CLASS[status]}>
            {status}
          </Badge>
        </p>
        {isBanner && (
          <p className="mt-1 truncate text-sm text-navy-700">
            {p.linkUrl ? (
              <a href={p.linkUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {p.linkUrl}
              </a>
            ) : (
              "No link: picture only"
            )}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          From {formatDateTime(p.startsAt)}
          {p.endsAt ? ` until ${formatDateTime(p.endsAt)}` : " · no end date"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {isBanner && <BannerOrderInput id={p.id} sortOrder={p.sortOrder} title={p.title} />}
        <PromoToggle id={p.id} isActive={p.isActive} title={p.title} />
        <DeletePromoButton id={p.id} title={p.title} />
      </div>
    </Card>
  );
}
