import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CircleCheck,
  Code,
  HandCoins,
  House,
  KeyRound,
  Languages,
  Layers,
  Map as MapIcon,
  MapPin,
  Package,
  Plus,
  Quote,
  Route,
  Share2,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Smartphone,
  UserCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Phone } from "@/components/phone";
import { PlayButton } from "@/components/play-button";
import { faqs } from "@/lib/faq";
import { openGraphBase, site } from "@/lib/site";
import { vision } from "@/lib/vision";

// Title and description come from the layout.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...openGraphBase, url: "/" },
};

/** Organization, WebSite and FAQPage structured data (escaped as the Next.js JSON-LD guide says). */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${site.url}/#organization`,
      name: site.name,
      url: site.url,
      logo: `${site.url}/brand/rider-app.png`,
      email: site.email,
      sameAs: [site.github],
      areaServed: { "@type": "City", name: site.city },
    },
    {
      "@type": "WebSite",
      "@id": `${site.url}/#website`,
      name: site.name,
      url: site.url,
      inLanguage: "en-IN",
      publisher: { "@id": `${site.url}/#organization` },
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ],
};

const facts = [
  { value: "0%", label: "commission on every ride and parcel" },
  { value: "₹0", label: "subscription or weekly fee for drivers" },
  { value: "100%", label: "of the fare goes to the driver" },
  { value: "1.5x", label: "cap on peak pricing (off by default)" },
];

/** Vehicle art: docs/design/assets/vehicles (336 × 240, transparent WebP), copied to public/vehicles. */
const services = [
  { image: "bike", title: "Bike and scooty", body: "The quickest way through traffic. One seat, helmet on." },
  { image: "auto", title: "Auto", body: "Up to three seats, for everyday trips around town." },
  { image: "sedan", title: "Cab", body: "Mini or Sedan for four, SUV for six. For family or luggage." },
  { image: "way_rental", title: "Rentals and outstation", body: "A cab by the hour, or to another town, one way or return." },
  { image: "goods_bike", title: "Parcels", body: "Send a package across town on a scooty, goods bike or bigger." },
  { image: "truck", title: "Packers & Movers", body: "Move house with a truck and helpers, packing if you want it." },
];

/** "How it works": each tile shows the useful part of a design frame (public/screens) at `focus`. */
const steps: { icon: LucideIcon; title: string; body: string; screen: string; alt: string; focus: string }[] = [
  {
    icon: MapPin,
    title: "Choose where to go",
    body: "Enter your drop and pick a bike, auto or cab. Every fare is shown before you book, and it stays locked.",
    screen: "/screens/rider-choose-ride.webp",
    alt: "Choosing a ride: Bike ₹38, Auto ₹72 or Cab ₹145, each with how far away it is",
    focus: "50% 66%",
  },
  {
    icon: UserCheck,
    title: "Meet your driver",
    body: "A nearby driver accepts. Check the name and number plate, then give your ride code to start.",
    screen: "/screens/rider-on-trip.webp",
    alt: "On the trip: the driver's name, number plate TN 37 AB 4521 and the fare",
    focus: "50% 100%",
  },
  {
    icon: Wallet,
    title: "Pay the driver directly",
    body: "Cash or UPI at the end of the trip. Tamil Taxi takes nothing, so the driver keeps it all.",
    screen: "/screens/driver-fare-kept.webp",
    alt: "The driver's fare breakdown for a ₹38 bike ride: you kept ₹38, commission ₹0",
    focus: "50% 88%",
  },
];

const deliver: Feature[] = [
  {
    icon: Package,
    title: "Parcels in town",
    body: "A scooty or goods bike for packages, an auto for something bigger, a three-wheeler, mini truck or pickup for heavy loads.",
  },
  { icon: Route, title: "Goods to another town", body: "One way to another town, priced by the km and shown before you book." },
  {
    icon: House,
    title: "Packers & Movers",
    body: "Tell us the home size and what's moving, pick a day, and see the price before you book. Helpers come with the truck.",
  },
];

type Feature = { icon: LucideIcon; title: string; body: string };

const safety: Feature[] = [
  {
    icon: ShieldCheck,
    title: "Verified drivers",
    body: "Every driver passes an identity check with Aadhaar, driving licence and a selfie.",
  },
  { icon: KeyRound, title: "A ride code to start", body: "The trip starts only when you give the driver your ride code." },
  { icon: Share2, title: "Share your trip", body: "Send a live link so family can follow along until you arrive." },
  { icon: Siren, title: "SOS, one tap away", body: "Alert our team in an emergency. After night rides, we check you reached safely." },
  {
    icon: Route,
    title: "Route and stop checks",
    body: "If a ride leaves its route or stops for long, the app asks if everything is OK.",
  },
];

const driverFeatures: Feature[] = [
  { icon: Wallet, title: "Riders pay you directly", body: "Cash or UPI to you. No commission, no weekly fee, no payout wait." },
  { icon: Languages, title: "Requests read aloud", body: "Hear each request in Tamil or English, then swipe to accept." },
  { icon: MapIcon, title: "See where demand is", body: "A live map shows the busy areas near you." },
  { icon: SlidersHorizontal, title: "Choose your trips", body: "Going home, pickup distance, trip length: get requests that fit." },
  { icon: Layers, title: "Works over other apps", body: "A floating bubble keeps requests coming while you use other apps." },
];

const driveVehicles = [
  { image: "bike", label: "Bike" },
  { image: "scooty", label: "Scooty" },
  { image: "auto", label: "Auto" },
  { image: "mini", label: "Mini" },
  { image: "suv", label: "Sedan · SUV" },
  { image: "goods_bike", label: "Goods bike" },
  { image: "three_wheeler", label: "Three-wheeler" },
  { image: "mini_truck", label: "Mini truck" },
  { image: "pickup", label: "Pickup" },
  { image: "truck", label: "Truck" },
];

function Vehicle({ name, alt = "", className = "" }: { name: string; alt?: string; className?: string }) {
  return <Image src={`/vehicles/${name}.webp`} alt={alt} width={336} height={240} className={`h-auto ${className}`} />;
}

function FeatureList({ items, tone = "coral" }: { items: Feature[]; tone?: "coral" | "dark" }) {
  return (
    <ul className="space-y-6">
      {items.map(({ icon: Icon, title, body }) => (
        <li key={title} className="flex gap-4">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
              tone === "dark" ? "bg-navy-950 text-white" : "bg-coral-50 text-coral-600"
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

function SectionHeading({ eyebrow, title, body, center }: { eyebrow?: string; title: string; body?: string; center?: boolean }) {
  return (
    <div className={`max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow ? <p className="text-sm font-semibold tracking-wide text-coral-600 uppercase">{eyebrow}</p> : null}
      <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {body ? <p className="mt-4 text-lg text-pretty text-navy-500">{body}</p> : null}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {/* Hero: dark like Uber's, with app pictures where Uber has its booking form's photos. */}
      <section className="relative overflow-hidden bg-navy-950 text-white">
        <div
          className="pointer-events-none absolute -top-40 right-0 size-[36rem] rounded-full bg-coral-600/25 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16 lg:pb-24">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium">
              <MapPin className="size-4 text-coral-500" aria-hidden="true" />
              {site.city}
            </p>
            <h1 className="mt-6 font-heading text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl">
              Go anywhere.
              <span className="block text-coral-500">Drivers keep every rupee.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-pretty text-white/75">
              Book a bike, auto or cab, send a parcel or move house across {site.city}. You pay your driver directly by
              cash or UPI, and Tamil Taxi takes 0% commission.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <PlayButton app="rider" variant="light" />
              <Link href="#drive" className="inline-flex items-center gap-1.5 py-3 font-semibold hover:text-coral-300">
                Drive with us <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/75">
              {["Fare locked at booking", "Pay by cash or UPI", "SOS and live trip sharing"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CircleCheck className="size-4 text-coral-500" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative grid grid-cols-2 gap-3 sm:gap-4">
            <div className="relative row-span-2 overflow-hidden rounded-3xl bg-linear-to-b from-coral-500 to-coral-700">
              <Phone
                src="/screens/rider-choose-ride.webp"
                alt="Tamil Taxi rider app: choosing between bike, auto and cab, each with its fare"
                className="absolute top-8 left-1/2 w-[78%] -translate-x-1/2"
                eager
              />
              <p className="absolute right-2 bottom-2 left-2 flex items-center gap-1.5 rounded-xl bg-white/95 px-2 py-2 text-xs font-semibold whitespace-nowrap text-navy-900 shadow-lg sm:right-3 sm:bottom-3 sm:left-3 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2.5 sm:text-sm">
                <BadgeCheck className="size-4 shrink-0 text-coral-600 sm:size-5" aria-hidden="true" />
                100% to the driver
              </p>
            </div>
            <div className="flex aspect-[4/3] items-end justify-center overflow-hidden rounded-3xl bg-sun-50">
              <Image
                src="/pictures/welcome-rider.webp"
                alt="A rider on her phone beside a bike, an auto and a cab"
                width={960}
                height={811}
                preload
                className="h-[92%] w-auto"
              />
            </div>
            <div className="flex aspect-[4/3] items-end justify-center overflow-hidden rounded-3xl bg-navy-100">
              <Image
                src="/pictures/welcome-driver.webp"
                alt="An auto driver smiling, showing a payment received on his phone"
                width={960}
                height={865}
                preload
                className="h-[92%] w-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Facts */}
      <section aria-label="Tamil Taxi in numbers" className="border-b border-divider">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 sm:px-6 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.value} className="flex flex-col-reverse justify-end">
              <dt className="mt-1 text-sm text-navy-500">{f.label}</dt>
              <dd className="font-heading text-4xl font-semibold text-coral-600">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Explore: Uber's service cards, with our vehicle art */}
      <section id="ride" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading
          title="Explore what you can do with Tamil Taxi"
          body="One app to get around the city, get things across it, and move house."
        />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <li key={s.title} className="flex items-center justify-between gap-3 rounded-2xl bg-navy-100 p-5 sm:min-h-36">
              <div>
                <h3 className="font-heading text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-navy-500">{s.body}</p>
              </div>
              <Vehicle name={s.image} className="w-28 shrink-0 sm:w-32" />
            </li>
          ))}
        </ul>
      </section>

      {/* How it works: Uber's "How to request a ride" */}
      <section aria-labelledby="how-title" className="bg-page">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 id="how-title" className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              How to ride with Tamil Taxi
            </h2>
          </div>
          <ol className="mt-12 grid gap-12 md:grid-cols-3 md:gap-8">
            {steps.map(({ icon: Icon, title, body, screen, alt, focus }, i) => (
              <li key={title}>
                <div className="relative">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-coral-50">
                    <div className="absolute inset-x-6 top-6 bottom-0 overflow-hidden rounded-t-2xl shadow-xl ring-1 shadow-navy-900/10 ring-navy-900/5">
                      <Image
                        src={screen}
                        alt={alt}
                        fill
                        sizes="(min-width: 768px) 30vw, 90vw"
                        className="bg-white object-cover"
                        style={{ objectPosition: focus }}
                      />
                    </div>
                  </div>
                  <span className="absolute -bottom-6 left-5 flex size-14 items-center justify-center rounded-xl bg-navy-950 text-white shadow-lg">
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-10 text-sm font-semibold text-coral-600">Step {i + 1}</p>
                <h3 className="mt-1 font-heading text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-navy-500">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Deliver */}
      <section id="deliver" className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <SectionHeading
            eyebrow="Deliver"
            title="Send a parcel or move house"
            body="From a small package to a whole home, with the price shown before you book."
          />
          <div className="mt-10">
            <FeatureList items={deliver} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-3xl bg-navy-100 p-4 sm:gap-4 sm:p-6">
          {[
            { image: "goods_bike", label: "Goods bike" },
            { image: "three_wheeler", label: "Three-wheeler" },
            { image: "mini_truck", label: "Mini truck" },
            { image: "truck", label: "Truck with helpers" },
          ].map((v) => (
            <div key={v.image} className="rounded-2xl bg-white p-3 text-center shadow-sm sm:p-4">
              <Vehicle name={v.image} className="mx-auto w-full max-w-44" />
              <p className="mt-1 text-sm font-medium text-navy-700">{v.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Safety */}
      <section id="safety" className="bg-page">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <Phone
            src="/screens/rider-on-trip.webp"
            alt="Tamil Taxi rider app during a ride: the driver on the map with Share trip and SOS buttons"
            className="order-last mx-auto w-60 sm:w-64 lg:order-first"
          />
          <div>
            <SectionHeading
              eyebrow="Safety"
              title="Safe at every step"
              body="Checks before the ride, during it and after it, and help one tap away."
            />
            <div className="mt-10">
              <FeatureList items={safety} tone="dark" />
            </div>
            <div className="mt-10 flex items-center gap-4 rounded-2xl bg-butterfly-50 p-5">
              <div className="min-w-0 flex-1">
                <h3 className="font-heading text-lg font-semibold text-butterfly-600">Pink Taxi</h3>
                <p className="mt-1 text-navy-700">Women riders can ask for a woman driver when they book.</p>
              </div>
              <Vehicle name="mini_pink" className="w-28 shrink-0" />
            </div>
          </div>
        </div>
      </section>

      {/* The Government's vision: cumta.tn.gov.in's Vision banner */}
      <section id="vision" aria-labelledby="vision-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-navy-950 px-6 py-12 text-white sm:px-12 sm:py-16">
          <div
            className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-coral-600/20 blur-3xl"
            aria-hidden="true"
          />
          <div
            className={`relative grid items-center gap-10 ${vision.photo ? "lg:grid-cols-[minmax(0,17rem)_1fr] lg:gap-14" : ""}`}
          >
            {vision.photo ? (
              <figure className="mx-auto w-full max-w-64 lg:max-w-none">
                <Image
                  src={vision.photo.src}
                  alt={vision.photoCaption}
                  width={vision.photo.width}
                  height={vision.photo.height}
                  className="aspect-[4/5] w-full rounded-2xl object-cover object-top ring-4 ring-white/10"
                />
                <figcaption className="mt-3 text-center text-sm text-white/60">{vision.photoCaption}</figcaption>
              </figure>
            ) : null}
            <div className={vision.photo ? "" : "mx-auto max-w-3xl text-center"}>
              <p id="vision-title" className="text-sm font-semibold tracking-wide text-coral-300 uppercase">
                The Government&apos;s vision
              </p>
              <blockquote cite={vision.sourceUrl} className="mt-5">
                <Quote
                  className={`size-10 text-coral-500 ${vision.photo ? "" : "mx-auto"}`}
                  aria-hidden="true"
                  fill="currentColor"
                />
                <p lang="ta" className="mt-4 font-tamil text-xl leading-relaxed font-bold text-balance sm:text-2xl lg:text-[1.75rem]">
                  {vision.ta}
                </p>
                <p className="mt-4 text-lg text-pretty text-white/80">{vision.en}</p>
              </blockquote>
              <p className="mt-4 text-sm text-white/50">
                {vision.source} ·{" "}
                <a href={vision.sourceUrl} className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-white">
                  Read the manifesto <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
              </p>
              <div
                className={`mt-8 flex gap-3 rounded-2xl bg-white/5 p-4 text-left ring-1 ring-white/10 ${vision.photo ? "" : "mx-auto max-w-2xl"}`}
              >
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-coral-500" aria-hidden="true" />
                <p>
                  <span className="font-semibold">Tamil Taxi is ready to deliver it.</span>{" "}
                  <span className="text-white/75">
                    Built, tested and open source: 0% commission and no subscription for drivers, starting in{" "}
                    {site.city}.
                  </span>
                </p>
              </div>
              <p className="mt-4 text-xs text-white/50">{site.independence}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Drive: Uber's "Earn with Uber" */}
      <section id="drive" className="bg-page">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="relative mx-auto w-full max-w-lg">
              <div className="flex aspect-square items-end justify-center overflow-hidden rounded-3xl bg-sun-50">
                <Image
                  src="/pictures/welcome-driver.webp"
                  alt="An auto driver smiling, showing a payment received on his phone"
                  width={960}
                  height={865}
                  className="h-[88%] w-auto"
                />
              </div>
              <Phone
                src="/screens/driver-request.webp"
                alt="Tamil Taxi Driver app: a new ride request showing the fare, cash or UPI to the driver, 100% theirs"
                className="absolute -right-2 -bottom-8 hidden w-40 sm:block lg:-right-8 lg:w-44"
              />
            </div>
            <div>
              <SectionHeading
                eyebrow="For drivers"
                title="Drive and keep the whole fare"
                body="No commission, no subscription and no weekly fee, on every vehicle type."
              />
              <div className="mt-10">
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
          </div>

          <h3 className="mt-20 text-center font-heading text-xl font-semibold">Drive any of these, all at 0% commission</h3>
          <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {driveVehicles.map((v) => (
              <li key={v.image} className="rounded-2xl bg-white p-2 text-center ring-1 ring-divider sm:p-3">
                <Vehicle name={v.image} className="mx-auto w-full max-w-32" />
                <p className="text-xs font-medium text-navy-700 sm:text-sm">{v.label}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Why it's free */}
      <section id="free" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Why it's free" title="No commission, and nobody in the middle" />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-navy-100 p-6 sm:p-8">
            <HandCoins className="size-8 text-coral-600" aria-hidden="true" />
            <h3 className="mt-4 font-heading text-lg font-semibold">Who pays for it?</h3>
            <p className="mt-2 text-navy-500">
              Tamil Taxi runs on one small server, and the project pays the running costs so drivers and riders
              don&apos;t have to.
            </p>
          </div>
          <div className="rounded-2xl bg-navy-100 p-6 sm:p-8">
            <Code className="size-8 text-coral-600" aria-hidden="true" />
            <h3 className="mt-4 font-heading text-lg font-semibold">Open source</h3>
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

      {/* FAQ */}
      <section id="faq" className="bg-page">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
          <SectionHeading
            eyebrow="FAQ"
            title="Questions, answered"
            body={`Anything else? Write to ${site.email}.`}
          />
          <div className="divide-y divide-divider rounded-2xl bg-white ring-1 ring-divider">
            {faqs.map((f) => (
              <details key={f.q} className="group px-5 sm:px-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-semibold">
                  {f.q}
                  <Plus
                    className="size-5 shrink-0 text-coral-600 transition-transform group-open:rotate-45"
                    aria-hidden="true"
                  />
                </summary>
                <p className="-mt-1 pb-5 text-navy-500">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Get the app: Uber's "It's easier in the apps" */}
      <section id="download" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="rounded-[2rem] bg-navy-950 px-6 py-12 text-white sm:px-12 sm:py-14">
          <div className="flex items-center gap-3">
            <Smartphone className="hidden size-7 text-coral-500 sm:block" aria-hidden="true" />
            <h2 className="font-heading text-3xl font-semibold tracking-tight">It&apos;s easier in the apps</h2>
          </div>
          <p className="mt-3 text-lg text-white/70">Free on Android, for {site.city}.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {(
              [
                { app: "rider", icon: "/brand/rider-app.png", body: "Book rides, send parcels and move house." },
                { app: "driver", icon: "/brand/driver-app.png", body: "Get ride and delivery requests, keep every rupee." },
              ] as const
            ).map((a) => (
              <div key={a.app} className="flex flex-col gap-5 rounded-2xl bg-white p-5 text-navy-900 sm:flex-row sm:items-center sm:p-6">
                <Image src={a.icon} alt="" width={64} height={64} className="rounded-2xl ring-1 ring-divider" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-heading text-lg font-semibold">{site.apps[a.app].name}</h3>
                  <p className="mt-0.5 text-sm text-navy-500">{a.body}</p>
                </div>
                <PlayButton app={a.app} variant={a.app === "rider" ? "primary" : "secondary"} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
