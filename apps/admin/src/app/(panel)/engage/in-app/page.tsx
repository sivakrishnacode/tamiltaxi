import { GalleryHorizontalIcon, ImagesIcon, MegaphoneIcon, SmartphoneIcon, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { adminApi } from "@/lib/api";
import { announcementStatus } from "@/lib/engage";
import { formatDateTime } from "@/lib/format";
import { placementSize, promoStatus, type PromoStatus } from "@/lib/promos";
import type { Promo } from "@/lib/types";
import { cn } from "@/lib/utils";

import { AnnouncementToggle, DeleteAnnouncementButton, NewAnnouncementButton } from "./announcement-controls";
import { BannerOrderInput, DeletePromoButton, NewPromoButton, PromoToggle } from "./promo-controls";

export const metadata: Metadata = { title: "In-app" };

const AUDIENCE = { ALL: "Riders and drivers", PASSENGER: "Riders", DRIVER: "Drivers" } as const;

const STATUS_CLASS: Record<PromoStatus, string> = {
  Live: "bg-success-tint text-success-text",
  Scheduled: "bg-coral-50 text-coral-700",
  Hidden: "",
  Ended: "",
};

function Section({
  id,
  icon: Icon,
  title,
  where,
  size,
  description,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  where: string;
  /** The picture size to make, e.g. "1200 × 600 px (2 : 1)". */
  size?: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-coral-50 text-coral-600">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id={id} className="flex flex-wrap items-center gap-2 font-heading text-lg font-semibold text-navy-900">
            {title}
            <Badge variant="outline" className="font-sans font-normal">
              {where}
            </Badge>
            {size && (
              <Badge variant="secondary" className="font-sans font-normal">
                Picture {size}
              </Badge>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function OnScreen({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <Card className="flex-row items-center gap-3 px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-navy-700">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-heading text-lg leading-tight font-semibold text-navy-900">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </Card>
  );
}

export default async function InAppPage() {
  const [announcements, cities, promos] = await Promise.all([adminApi.announcements(), adminApi.cities(), adminApi.promos()]);
  const cityName = new Map(cities.map((c) => [c.id, c.name]));
  const splashes = promos.filter((p) => p.placement === "SPLASH");
  const banners = promos.filter((p) => p.placement === "BANNER");
  const nextOrder = banners.length ? Math.min(999, Math.max(...banners.map((b) => b.sortOrder)) + 1) : 0;
  const liveAnnouncements = announcements.filter((a) => announcementStatus(a) === "Live");
  const liveSplash = splashes.find((p) => promoStatus(p) === "Live");
  const nextSplash = splashes.find((p) => promoStatus(p) === "Scheduled");
  const liveBanners = banners.filter((p) => promoStatus(p) === "Live");

  return (
    <>
      <PageHeader
        title="In-app"
        description="What riders and drivers see inside the apps: announcements, the rider app's splash screen and its Home banners."
        actions={
          <>
            <NewAnnouncementButton cities={cities.map((c) => ({ id: c.id, name: c.name }))} />
            <NewPromoButton nextOrder={nextOrder} />
          </>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <OnScreen
          icon={MegaphoneIcon}
          label="Announcements on now"
          value={String(liveAnnouncements.length)}
          detail={liveAnnouncements[0]?.title ?? "None showing"}
        />
        <OnScreen
          icon={SmartphoneIcon}
          label="Splash screen"
          value={liveSplash ? "Live" : nextSplash ? "Scheduled" : "Logo only"}
          detail={liveSplash?.title ?? (nextSplash ? `${nextSplash.title}, from ${formatDateTime(nextSplash.startsAt)}` : "The app opens with the logo")}
        />
        <OnScreen
          icon={GalleryHorizontalIcon}
          label="Home banners on now"
          value={String(liveBanners.length)}
          detail={liveBanners.length ? liveBanners.map((b) => b.title).join(", ") : "No banner row"}
        />
      </div>

      <div className="grid gap-10">
        <Section
          id="announcements-heading"
          icon={MegaphoneIcon}
          title="Announcements"
          where="Both apps"
          description="A banner in the apps while it's on, also pushed to its audience when published: service updates, weather, festivals, new features."
        >
          {announcements.length === 0 ? (
            <Card>
              <EmptyState icon={MegaphoneIcon} title="No announcements" description="Create one to show a banner in the apps." />
            </Card>
          ) : (
            <div className="grid gap-3">
              {announcements.map((a) => {
                const status = announcementStatus(a);
                return (
                  <Card key={a.id} className={cn("flex-col gap-3 px-4 sm:flex-row sm:items-start", status !== "Live" && "bg-muted/30")}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-heading font-semibold text-navy-900">
                        {a.title}
                        <Badge variant="secondary" className={status === "Live" ? "bg-success-tint text-success-text" : ""}>
                          {status}
                        </Badge>
                      </p>
                      <p className="mt-1 text-sm whitespace-pre-line text-navy-700">{a.body}</p>
                      <p className="mt-1.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span>{AUDIENCE[a.audience]}</span>·<span>{a.cityId ? (cityName.get(a.cityId) ?? a.cityId) : "All cities"}</span>·
                        <span>
                          From {formatDateTime(a.startsAt)}
                          {a.endsAt ? ` until ${formatDateTime(a.endsAt)}` : ", no end date"}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                      <AnnouncementToggle id={a.id} isActive={a.isActive} title={a.title} />
                      <DeleteAnnouncementButton id={a.id} title={a.title} />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Section>

        <Section
          id="splash-heading"
          icon={SmartphoneIcon}
          title="Splash screen"
          where="Rider app"
          size={placementSize("SPLASH")}
          description="Full screen for 2 seconds as the app opens, for festivals and offers. The newest live one shows. Phones download it in the background, so it appears from the next launch; one starting within 3 days is fetched early."
        >
          {splashes.length === 0 ? (
            <Card>
              <EmptyState icon={ImagesIcon} title="No splash" description="The app opens with the Tamil Taxi logo." />
            </Card>
          ) : (
            splashes.map((p) => <PromoCard key={p.id} promo={p} />)
          )}
        </Section>

        <Section
          id="banners-heading"
          icon={GalleryHorizontalIcon}
          title="Home banners"
          where="Rider app"
          size={placementSize("BANNER")}
          description="Riders swipe through the live ones on Home, under “More ways to travel”, lowest order first; with several, the next one peeks in at the edge. Its small × (top right) hides one until the app restarts; a tap opens its link."
        >
          {banners.length === 0 ? (
            <Card>
              <EmptyState icon={ImagesIcon} title="No banners" description="Home shows no banner row." />
            </Card>
          ) : (
            banners.map((p) => <PromoCard key={p.id} promo={p} />)
          )}
        </Section>
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
        className={cn("shrink-0 rounded-lg border bg-muted object-cover", isBanner ? "aspect-[2/1] w-full sm:w-56" : "aspect-[9/20] w-24")}
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
