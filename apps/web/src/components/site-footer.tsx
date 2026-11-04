import { Mail, MapPin } from "lucide-react";
import Link from "next/link";

import { site } from "@/lib/site";

import { Logo } from "./logo";
import { PlayButton } from "./play-button";

/** Footer columns. Home page anchors are checked by a test, like the header's. */
export const footerColumns: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Ride",
    links: [
      { href: "/#ride", label: "Bike, auto and cab" },
      { href: "/#ride", label: "Rentals and outstation" },
      { href: "/#safety", label: "Safety and Pink Taxi" },
    ],
  },
  {
    title: "Deliver",
    links: [
      { href: "/#deliver", label: "Parcels and goods" },
      { href: "/#deliver", label: "Packers & Movers" },
    ],
  },
  {
    title: "Drive",
    links: [
      { href: "/#drive", label: "Drive with Tamil Taxi" },
      { href: "/#faq", label: "How to sign up" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/#free", label: "Why it's free" },
      { href: "/#vision", label: "The Government's vision" },
      { href: site.github, label: "Source code on GitHub" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy/", label: "Privacy policy" },
      { href: "/terms/", label: "Terms of service" },
      { href: "/delete-account/", label: "Delete your account" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-navy-950 text-white">
      <div className="mx-auto max-w-6xl px-4 pt-16 pb-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-sm space-y-4">
            <span className="inline-block rounded-2xl bg-white p-3">
              <Logo className="h-16" />
            </span>
            <p className="text-sm text-white/60">Rides and parcels for {site.city}. 0% commission, no subscription.</p>
          </div>
          <a
            href={`mailto:${site.email}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-white/80 hover:text-white"
          >
            <Mail className="size-4" aria-hidden="true" />
            {site.email}
          </a>
        </div>

        <nav aria-label="Footer" className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          {footerColumns.map((col) => (
            <div key={col.title}>
              <h2 className="text-sm font-semibold">{col.title}</h2>
              <ul className="mt-4 space-y-3 text-sm">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-white/60 hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-14 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-6 gap-y-5">
            {(
              [
                { app: "rider", label: "For riders" },
                { app: "driver", label: "For drivers" },
              ] as const
            ).map((a) => (
              <div key={a.app} className="space-y-2">
                <p className="text-xs font-medium text-white/60">{a.label}</p>
                <PlayButton app={a.app} variant="outline" />
              </div>
            ))}
          </div>
          <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/10 px-3 py-1.5 text-sm">
            <MapPin className="size-4 text-coral-500" aria-hidden="true" />
            Now in {site.city}
          </p>
        </div>

        <div className="mt-10 space-y-2 border-t border-white/10 pt-6 text-xs text-white/50">
          <p>{site.independence}</p>
          <p>Google Play and the Google Play logo are trademarks of Google LLC.</p>
          <p>
            © {new Date().getFullYear()} {site.name} · Open source under AGPL-3.0
          </p>
        </div>
      </div>
    </footer>
  );
}
