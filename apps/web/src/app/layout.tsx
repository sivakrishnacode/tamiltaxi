import type { Metadata, Viewport } from "next";
import { Anek_Tamil, Inter, Poppins } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { textSizeScript } from "@/components/text-size";
import { openGraphBase, site } from "@/lib/site";

import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// Headings are all semibold: load only that weight.
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: "600" });
// Tamil lines (the vision quote, bold). Not preloaded: browsers fetch it only on pages that show Tamil text.
const anekTamil = Anek_Tamil({ variable: "--font-anek-tamil", subsets: ["tamil"], weight: "700", preload: false });

const description =
  `Bike, auto and cab rides, cab rentals, outstation trips, parcels and house moves in ${site.city}. ` +
  "0% commission and no subscription: drivers keep the whole fare.";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: "Tamil Taxi: 0% commission rides and parcels in Coimbatore", template: "%s · Tamil Taxi" },
  description,
  applicationName: site.name,
  // No url / description here: pages would inherit the home page's. Next fills og:title from each title; each page
  // sets its own og:url (openGraphBase).
  openGraph: openGraphBase,
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

// The header and hero are dark navy: match the browser bar to them.
export const viewport: Viewport = { themeColor: "#0f172a" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: textSizeScript may set data-text-size on <html> before React hydrates.
    <html
      lang="en-IN"
      className={`${inter.variable} ${poppins.variable} ${anekTamil.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: textSizeScript }} />
      </head>
      <body className="flex min-h-screen flex-col font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
