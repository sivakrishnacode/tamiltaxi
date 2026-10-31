import { playStoreUrl, site, type AppKey } from "@/lib/site";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="currentColor" d="M5 3.5v17a1 1 0 0 0 1.5.86l14.2-8.5a1 1 0 0 0 0-1.72L6.5 2.64A1 1 0 0 0 5 3.5Z" />
    </svg>
  );
}

const styles = {
  primary: "bg-coral-600 text-white hover:bg-coral-700",
  secondary: "border border-navy-300 bg-white text-navy-900 hover:border-navy-500",
  /** On the dark bands (hero, footer). */
  light: "bg-white text-navy-950 hover:bg-navy-100",
  outline: "border border-white/30 text-white hover:border-white/60",
};

/** "Get it on Google Play" once the apps are published ([site.onPlayStore]); "Coming soon" until then. */
export function PlayButton({ app, variant = "primary" }: { app: AppKey; variant?: keyof typeof styles }) {
  const base = "inline-flex items-center gap-3 rounded-full px-5 py-3 text-left";
  const label = (
    <span className="flex flex-col leading-tight">
      <span className="text-xs opacity-80">{site.onPlayStore ? "Get it on" : "Coming soon to"}</span>
      <span className="text-base font-semibold">Google Play</span>
    </span>
  );
  if (!site.onPlayStore) {
    return (
      <span className={`${base} ${styles[variant]} pointer-events-none opacity-90`} aria-disabled="true">
        <PlayIcon />
        {label}
      </span>
    );
  }
  return (
    <a href={playStoreUrl(app)} className={`${base} ${styles[variant]}`} aria-label={`Get ${site.apps[app].name} on Google Play`}>
      <PlayIcon />
      {label}
    </a>
  );
}
