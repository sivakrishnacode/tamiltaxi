import Image from "next/image";

import { playStoreUrl, site, type AppKey } from "@/lib/site";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="currentColor" d="M5 3.5v17a1 1 0 0 0 1.5.86l14.2-8.5a1 1 0 0 0 0-1.72L6.5 2.64A1 1 0 0 0 5 3.5Z" />
    </svg>
  );
}

/** Only for the "Coming soon" pill: the official badge is always black. */
const styles = {
  primary: "bg-coral-600 text-white",
  secondary: "border border-navy-300 bg-white text-navy-900",
  /** On the dark bands (hero, footer). */
  light: "bg-white text-navy-950",
  outline: "border border-white/30 text-white",
};

/**
 * Google's official "Get it on Google Play" badge (public/badges/google-play.png, the English PNG from
 * play.google.com/intl/en_us/badges with its transparent margin trimmed, art unchanged) once the apps are published
 * ([site.onPlayStore]); a "Coming soon to Google Play" pill until then.
 */
export function PlayButton({ app, variant = "primary" }: { app: AppKey; variant?: keyof typeof styles }) {
  if (!site.onPlayStore) {
    return (
      <span
        className={`inline-flex items-center gap-3 rounded-full px-5 py-3 text-left opacity-90 ${styles[variant]}`}
        aria-disabled="true"
      >
        <PlayIcon />
        <span className="flex flex-col leading-tight">
          <span className="text-xs opacity-80">Coming soon to</span>
          <span className="text-base font-semibold">Google Play</span>
        </span>
      </span>
    );
  }
  return (
    <a href={playStoreUrl(app)} className="inline-block shrink-0" aria-label={`Get ${site.apps[app].name} on Google Play`}>
      <Image src="/badges/google-play.png" alt="" width={564} height={168} className="h-12 w-auto" />
    </a>
  );
}
