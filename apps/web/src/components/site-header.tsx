import { MapPin } from "lucide-react";
import Link from "next/link";

import { site } from "@/lib/site";

import { Wordmark } from "./logo";
import { MobileMenu } from "./mobile-menu";
import { TextSize } from "./text-size";

/** Sections of the home page (a test checks each one exists). */
export const nav = [
  { href: "/#ride", label: "Ride" },
  { href: "/#deliver", label: "Deliver" },
  { href: "/#drive", label: "Drive" },
  { href: "/#safety", label: "Safety" },
  { href: "/#faq", label: "FAQ" },
] as const;

export function SiteHeader() {
  return (
    <>
      {/* Top bar, after Tamil Nadu Government sites: where we run, and text size. Scrolls away; the header stays. */}
      <div className="bg-navy-950 text-xs text-white/70">
        <div className="mx-auto flex h-9 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <p className="flex items-center gap-1.5">
            <MapPin className="size-3.5 text-coral-500" aria-hidden="true" />
            {site.city}
            <span className="hidden sm:inline">· 0% commission rides and parcels</span>
          </p>
          <TextSize />
        </div>
      </div>
      <header className="sticky top-0 z-40 border-y border-white/10 bg-navy-950/95 backdrop-blur">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Tamil Taxi home">
            <Wordmark className="text-[26px]" light />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/#download"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-navy-950 hover:bg-navy-100"
            >
              Get the app
            </Link>
            <MobileMenu items={nav} />
          </div>
        </div>
      </header>
    </>
  );
}
