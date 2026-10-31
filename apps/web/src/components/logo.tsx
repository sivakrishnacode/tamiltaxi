import Image from "next/image";

/**
 * The "Clean White" Tamil Taxi logo, as in the apps: navy car and தமிழ், coral pin and TAXI. public/brand/logo.png is
 * docs/design/assets/logo/tamil-taxi.png at 250 × 240 (256 colours). It is made for white or very light backgrounds
 * (there is no white-on-dark version), so on the dark footer it sits on a white plate. Size it by height.
 */
export function Logo({ alt = "Tamil Taxi", className = "", preload }: { alt?: string; className?: string; preload?: boolean }) {
  return <Image src="/brand/logo.png" alt={alt} width={250} height={240} preload={preload} className={`w-auto ${className}`} />;
}
