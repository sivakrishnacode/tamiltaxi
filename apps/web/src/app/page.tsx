import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bike,
  CarTaxiFront,
  Code,
  HandCoins,
  Heart,
  House,
  Languages,
  Layers,
  Lock,
  Map as MapIcon,
  Package,
  Route,
  Share2,
  Siren,
  SlidersHorizontal,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Phone } from "@/components/phone";
import { PlayButton } from "@/components/play-button";
import { openGraphBase, site } from "@/lib/site";

// Title and description come from the layout.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...openGraphBase, url: "/" },
};

/** Lucide has no auto-rickshaw, so this one is drawn in the same 24px, 2px-stroke style. */
function AutoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 17H4a1 1 0 0 1-1-1v-5a6 6 0 0 1 6-6h5l4 5h1.5a1.5 1.5 0 0 1 1.5 1.5V16a1 1 0 0 1-1 1h-1" />
      <path d="M9 17h6" />
      <path d="M13 5v5h5" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}

const facts = [
  { value: "0%", label: "commission on every ride and parcel" },
  { value: "₹0", label: "subscription or fees for drivers" },
  { value: "100%", label: "of the fare goes to the driver" },
  { value: "1.5x", label: "cap on peak pricing, paid to the driver" },
];

const services: { icon: LucideIcon | typeof AutoIcon; title: string; body: string }[] = [
  { icon: Bike, title: "Bike taxi", body: "Bike or scooty: the quickest way through traffic. One seat, helmet on." },
  { icon: AutoIcon, title: "Auto", body: "Up to three seats, for everyday trips around town." },
  { icon: CarTaxiFront, title: "Cab", body: "Mini or Sedan for up to four, SUV for up to six, for family or luggage." },
  { icon: Route, title: "Rentals and outstation", body: "A cab by the hour, or to another town one way or return." },
  {
    icon: Package,
    title: "Parcels and goods",
    body: "A goods bike for packages, or a three-wheeler up to a truck for bigger loads.",
  },
  { icon: House, title: "Packers & Movers", body: "Move house with a truck and helpers, and packing if you want it." },
];

type Feature = { icon: LucideIcon; title: string; body: string; tone?: "butterfly" };

const riderFeatures: Feature[] = [
  {
    icon: Lock,
    title: "Fare locked at booking",
    body: "See the price and its breakdown before you book. Traffic won't change it, and any waiting charge shows on its own line.",
  },
  { icon: Wallet, title: "Pay your driver directly", body: "Cash or UPI, straight to the driver. We never hold your money." },
  { icon: Share2, title: "Share your trip", body: "Send a live link so family can follow along until you arrive." },
  { icon: Siren, title: "SOS and safety checks", body: "One-tap SOS, and a \"Did you reach safely?\" check after night rides." },
  { icon: Heart, title: "Pink Taxi", body: "Women riders can ask for a woman driver when they book.", tone: "butterfly" },
];

const driverFeatures: Feature[] = [
  { icon: Wallet, title: "Riders pay you directly", body: "Cash or UPI to you. No commission, no weekly fee, no payout wait." },
  { icon: Languages, title: "Requests read aloud", body: "Hear each request in Tamil or English, then swipe to accept." },
  { icon: MapIcon, title: "See where demand is", body: "A live map shows the busy areas near you." },
  { icon: SlidersHorizontal, title: "Choose your trips", body: "Going home, pickup distance, trip length: get requests that fit." },
  { icon: Layers, title: "Works over other apps", body: "A floating bubble keeps requests coming while you use other apps." },
];

function FeatureList({ items }: { items: Feature[] }) {
  return (
    <ul className="space-y-5">
      {items.map(({ icon: Icon, title, body, tone }) => (
        <li key={title} className="flex gap-4">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
              tone === "butterfly" ? "bg-butterfly-50 text-butterfly-600" : "bg-coral-50 text-coral-600"
            }`}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-0.5 text-navy-500">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold tracking-wide text-coral-600 uppercase">{eyebrow}</p>
      <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {body ? <p className="mt-4 text-lg text-navy-500">{body}</p> : null}
    </div>
  );
}

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20 lg:pb-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-coral-50 px-3 py-1 text-sm font-medium text-coral-700">
              <span className="size-1.5 rounded-full bg-coral-600" aria-hidden="true" />
              {site.city} · 0% commission
            </p>
            <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
              Rides and parcels across {site.city}. Drivers keep every rupee.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-navy-500">
              Book a bike, auto or cab, rent a cab by the hour, go outstation, send a parcel or move house. You pay
              your driver directly by cash or UPI, and Tamil Taxi takes nothing from the fare.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <PlayButton app="rider" />
              <Link
                href="#drive"
                className="inline-flex items-center gap-1.5 px-2 py-3 font-semibold text-navy-900 hover:text-coral-600"
              >
                I want to drive <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="relative mx-auto flex w-full max-w-md justify-center lg:max-w-none">
            <div className="absolute inset-x-8 top-10 bottom-0 -z-10 rounded-[3rem] bg-coral-50" aria-hidden="true" />
            <Phone
              src="/screens/rider-choose-ride.webp"
              alt="Tamil Taxi rider app: choosing between bike, auto and cab, each with its fare"
              className="relative z-10 w-60 sm:w-64"
              eager
            />
            <Phone
              src="/screens/driver-request.webp"
              alt="Tamil Taxi Driver app: a new ride request showing the fare, 100% to the driver"
              className="mt-16 -ml-12 hidden w-56 sm:block"
              eager
            />
          </div>
        </div>
      </section>

      {/* Facts */}
      <section aria-label="Tamil Taxi in numbers" className="border-y border-divider bg-page">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 sm:px-6 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.value}>
              <dt className="sr-only">{f.label}</dt>
              <dd className="font-heading text-3xl font-semibold text-coral-600">{f.value}</dd>
              <dd className="mt-1 text-sm text-navy-500">{f.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Services + riders */}
      <section id="ride" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="For riders"
          title="Rides, parcels and house moves"
          body="One app for getting around the city, getting things across it and moving house."
        />
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {services.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-2xl border border-divider p-4 sm:p-5">
              <Icon className="size-7 text-coral-600" aria-hidden="true" />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-navy-500">{body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-20 grid items-center gap-12 lg:grid-cols-2">
          <Phone
            src="/screens/rider-on-trip.webp"
            alt="Tamil Taxi rider app during a ride: the driver on the map with share and SOS buttons"
            className="order-last mx-auto w-60 sm:w-64 lg:order-first"
          />
          <div>
            <h2 className="font-heading text-3xl font-semibold tracking-tight">Simple, fair and safe</h2>
            <p className="mt-4 mb-8 text-lg text-navy-500">
              No surprise prices, no middleman holding your money, and help one tap away.
            </p>
            <FeatureList items={riderFeatures} />
          </div>
        </div>
      </section>

      {/* Drivers */}
      <section id="drive" className="bg-page">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="For drivers"
              title="Drive and keep the whole fare"
              body="No commission, no subscription and no weekly fee, on every vehicle type."
            />
            <div className="mt-8">
              <FeatureList items={driverFeatures} />
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <PlayButton app="driver" />
              <p className="max-w-xs text-sm text-navy-500">
                Sign up in the app: an identity check with your Aadhaar, driving licence and a selfie, then photos of
                your RC and insurance.
              </p>
            </div>
          </div>
          <Phone
            src="/screens/driver-fare-kept.webp"
            alt="Tamil Taxi Driver app: a ₹38 bike ride's fare breakdown, with the driver keeping ₹38 and ₹0 commission"
            className="mx-auto w-60 sm:w-64"
          />
        </div>
      </section>

      {/* Why it's free */}
      <section id="free" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Why it's free" title="No commission, and nobody in the middle" />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-divider p-6 sm:p-8">
            <HandCoins className="size-7 text-coral-600" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold">Who pays for it?</h3>
            <p className="mt-2 text-navy-500">
              Tamil Taxi runs on one small server, and the project pays the running costs so drivers and riders
              don&apos;t have to.
            </p>
          </div>
          <div className="rounded-2xl border border-divider p-6 sm:p-8">
            <Code className="size-7 text-coral-600" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold">Open source</h3>
            <p className="mt-2 text-navy-500">
              All of the code is public under AGPL-3.0, so anyone can check how fares and dispatch work, suggest a
              fix, or run it in their own city.
            </p>
            <a
              href={site.github}
              className="mt-4 inline-flex items-center gap-1.5 font-semibold text-coral-600 hover:text-coral-700"
            >
              See the code on GitHub <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      {/* Download */}
      <section id="download" className="border-t border-divider bg-page">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-center font-heading text-3xl font-semibold tracking-tight">Get the app</h2>
          <p className="mt-3 text-center text-lg text-navy-500">Android, free, for {site.city}.</p>
          <div className="mx-auto mt-10 grid max-w-3xl gap-6 sm:grid-cols-2">
            {(
              [
                { app: "rider", icon: "/brand/rider-app.png", body: "Book rides, send parcels and move house." },
                { app: "driver", icon: "/brand/driver-app.png", body: "Get ride and delivery requests." },
              ] as const
            ).map((a) => (
              <div key={a.app} className="flex flex-col items-center rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-divider">
                <Image src={a.icon} alt="" width={72} height={72} className="rounded-2xl" />
                <h3 className="mt-4 text-lg font-semibold">{site.apps[a.app].name}</h3>
                <p className="mt-1 mb-6 text-navy-500">{a.body}</p>
                <PlayButton app={a.app} variant={a.app === "rider" ? "primary" : "secondary"} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
