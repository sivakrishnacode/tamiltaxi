/**
 * Privacy policy, terms and account deletion text. The apps carry shorter versions of the same text
 * (apps/passenger/lib/features/onboarding/legal_screen.dart and the driver's copy): keep them in line, with the same
 * "Last updated" date (a test checks it). Every claim here must match what the code does (data model:
 * apps/api/prisma/schema.prisma; fares: apps/api/src/modules/fares and trips/extra-fare.ts, cancellation-dues.ts).
 */
import { site } from "./site";

export type LegalSection = {
  heading: string;
  paragraphs: readonly string[];
  list?: readonly string[];
  link?: { href: string; label: string };
};

export type LegalDoc = { title: string; updated: string; intro: string; sections: readonly LegalSection[] };

/** The date on both documents and on the apps' legal screens. */
export const legalUpdated = "6 October 2026";

export const privacy: LegalDoc = {
  title: "Privacy policy",
  updated: legalUpdated,
  intro:
    `This policy covers the ${site.apps.rider.name} rider app, the ${site.apps.driver.name} app and this website. ` +
    "We collect only what we need to run rides, deliveries and house moves. We do not show ads and we never sell " +
    "your data.",
  sections: [
    {
      heading: "What we collect from riders",
      paragraphs: [],
      list: [
        "Your mobile number, used to sign in with a one-time code.",
        "Your name and, if you add them, your email, gender, saved places and emergency contacts.",
        "Your trips, parcels and house moves: pickup, drop, route, fare, payment mode (cash or UPI), ratings and " +
          "cancellations, and the details you give for a parcel or a move.",
        "A photo of your parcel or a screenshot for a support ticket, if you add one.",
        "What you write to Help & support, and the messages you send in the trip chat.",
        "Your device location while you book or ride.",
      ],
    },
    {
      heading: "What we collect from drivers",
      paragraphs: [],
      list: [
        "Your name, mobile number, gender, vehicle details (type, model, colour and number plate) and the UPI ID " +
          "riders pay you on.",
        "Photos of your vehicle RC and insurance.",
        "Your identity check: your driving licence and Aadhaar, scanned by Didit, and a live selfie.",
        "Your profile photo.",
        "Your location while you are online or on a job, and the route of each trip.",
        "Your trips, ratings, cancellations, booking preferences and, if you add them, emergency contacts.",
      ],
    },
    {
      heading: "Identity checks",
      paragraphs: [
        "Identity checks are run by Didit (didit.me) inside the app: they scan your ID and take a live selfie. " +
          "Drivers scan their driving licence and Aadhaar and must pass the check before going online. For riders " +
          "it is optional, with any Indian ID, and adds a Verified badge.",
        "From the check we keep the result, your name and date of birth as read from the ID and the last 4 digits " +
          "of each document number, never the full number. For drivers we also keep the live selfie: your profile " +
          "photo, and the quick selfie we may ask for before you go online, are compared with it by Didit to " +
          "confirm that it is you.",
      ],
    },
    {
      heading: "How we use it",
      paragraphs: [
        "To sign you in, match riders with nearby drivers, show each side where the other is, work out fares, send " +
          "trip notifications, check that a trip is going as planned (long stops, route changes) and help when " +
          "something goes wrong.",
      ],
    },
    {
      heading: "What the other person on your trip sees",
      paragraphs: [
        "Your driver sees your name, phone number, pickup and drop, and whether you are verified. If you ask for a " +
          "woman driver (Pink Taxi), your driver sees that it is a Pink Taxi ride.",
        "Riders see their driver's name, photo, rating, phone number, vehicle, number plate and UPI ID, and the " +
          "driver's location during the trip. Phone numbers are shared so that you can call each other about the " +
          "current trip.",
      ],
    },
    {
      heading: "Location",
      paragraphs: [
        "The rider app uses your location only while the app is open or a trip is in progress. You can turn it off " +
          "in your phone settings and type your pickup instead.",
        "The driver app shares your location while you are online or on a job, including when the app is in the " +
          "background: a notification shows while it is on. Going offline stops it.",
      ],
    },
    {
      heading: "App permissions",
      paragraphs: [],
      list: [
        "Location (both apps): to find drivers, show pickups and track trips.",
        "Notifications (both apps): trip updates and, for drivers, new requests.",
        "Camera (both apps): the identity check; in the driver app also photos of your RC and insurance, your " +
          "profile photo and the selfie before you go online; in the rider app also a parcel photo or a screenshot " +
          "for a support ticket, if you add one.",
        "Display over other apps and full-screen alerts (driver app): the floating bubble and the incoming-request " +
          "screen, so that you see requests while you use other apps.",
      ],
    },
    {
      heading: "Who we share it with",
      paragraphs: [
        "Only with the other person on your trip; with your emergency contacts when you share a trip or use SOS; " +
          "with the police or emergency services when a safety incident needs it; with the service providers " +
          "below, for the work they do for us; and when the law requires it.",
      ],
      list: [
        "Amazon Web Services: our servers and file storage, in Mumbai, India.",
        "Google Maps Platform: maps, address search and routes.",
        "Firebase Cloud Messaging (Google): notifications.",
        "Didit: identity checks and selfie matching.",
        "An SMS provider: sign-in codes.",
      ],
    },
    {
      heading: "Security",
      paragraphs: [
        "The apps talk to our servers over HTTPS. Documents and photos are kept in private, encrypted storage that " +
          "only our servers can read.",
      ],
    },
    {
      heading: "Keeping and deleting data",
      paragraphs: [
        "We keep your account details while your account is open. Trip chat messages are deleted automatically a " +
          "day after the last message.",
        "Trip records (date, pickup, drop, route, fare and vehicle) are kept for safety, accounting and tax " +
          "reasons, for as long as we need them for those reasons or the law requires.",
        "You can delete your account at any time: in the rider app from Account › Delete account, in the driver " +
          "app from Account › Help & support › Delete my account, or by email. Your name, mobile number and email " +
          "are removed and your trip records are kept without them. A driver's account and records are kept for 6 " +
          "months after the request, for police enquiries, before they are deleted.",
      ],
      link: { href: "/delete-account/", label: "What is deleted and what is kept" },
    },
    {
      heading: "This website",
      paragraphs: ["This website sets no cookies and runs no analytics or trackers."],
    },
    {
      heading: "Changes and contact",
      paragraphs: [
        "If we change this policy we update the date at the top. Questions: use Help & support in the app, or " +
          `write to ${site.email}.`,
      ],
    },
  ],
};

export const terms: LegalDoc = {
  title: "Terms of service",
  updated: legalUpdated,
  intro: `These terms cover the ${site.apps.rider.name} and ${site.apps.driver.name} apps.`,
  sections: [
    {
      heading: "About Tamil Taxi",
      paragraphs: [
        "Tamil Taxi is a technology platform that connects riders and senders with independent drivers of bikes, " +
          "autos, cabs and goods vehicles, including movers who do house shifting (Packers & Movers). Tamil Taxi " +
          "does not own vehicles or employ drivers.",
      ],
    },
    {
      heading: "Free to use",
      paragraphs: [
        "Tamil Taxi takes 0% commission on rides and deliveries and charges no subscription, for any vehicle type.",
      ],
    },
    {
      heading: "Fares and payment",
      paragraphs: [
        "You see the fare and its breakdown before you book, and it is locked when you book. Peak-time pricing is " +
          "capped at 1.5x and goes to your driver. Traffic does not change the fare. Only these are added to it, " +
          "each as its own line:",
      ],
      list: [
        "Waiting at the pickup, on city rides and parcels: after the free minutes, each started minute is " +
          "charged, up to ₹30 a trip.",
        "Rentals and outstation round trips: the km (and, for rentals, the time) past what the package includes, " +
          "at the rates shown when you book.",
        "An extra amount, if you choose to add one while we look for a driver.",
        "A cancellation fee from an earlier ride, if one applies (see Cancellations).",
      ],
    },
    {
      heading: "Paying your driver",
      paragraphs: [
        "You pay the driver directly by cash or UPI; Tamil Taxi does not collect fares. Drivers keep 100% of the " +
          "fare, including any waiting charge and any extra you add. Tolls, parking and state permits on the way " +
          "are paid by you.",
      ],
    },
    {
      heading: "Cancellations",
      paragraphs: [
        "You can cancel a request at any time before the ride starts. Tamil Taxi may switch on a small cancellation " +
          "fee: if you cancel after your driver has arrived and waited past the free minutes, the fee is added to " +
          "your next ride as its own line.",
      ],
    },
    {
      heading: "Safety and conduct",
      paragraphs: [
        "Treat each other with respect, follow traffic rules, wear a helmet on bike rides and never carry " +
          "prohibited items. In an emergency, use SOS in the app or call 112. Repeated complaints or late " +
          "cancellations may put an account on hold while we review them.",
      ],
    },
    {
      heading: "Parcels and house moves",
      paragraphs: [
        "You are responsible for what you send or move. Tamil Taxi connects you with drivers and movers and is not " +
          "liable for lost or damaged goods. For parcels and goods, loading and unloading is done by the sender " +
          "and receiver; for a house move, the price you see before you book covers the helpers and packing you " +
          "choose.",
      ],
    },
    {
      heading: "Drivers",
      paragraphs: [
        "Every driver is an independent service provider. To drive you must pass an identity check (your driving " +
          "licence, Aadhaar and a live selfie, checked by Didit) and keep a valid vehicle RC and insurance. Before " +
          "you go online we may ask for a quick selfie, compared with your identity-check selfie, to confirm it is " +
          "you.",
      ],
    },
    {
      heading: "Service area",
      paragraphs: [
        `Tamil Taxi runs in the cities shown in the app, starting with ${site.city}. Bookings with a pickup outside ` +
          "the service area cannot be made.",
      ],
    },
    {
      heading: "Contact and law",
      paragraphs: [
        "Questions about these terms? Use Help & support in the app or write to " +
          `${site.email}. These terms are governed by the laws of India, with courts in Coimbatore, Tamil Nadu.`,
      ],
    },
  ],
};

/** Google Play asks for a web page where anyone can request deletion, without the app installed. */
export const deletion = {
  deleted: [
    "Your name, mobile number and email are removed from the account.",
    "Your saved places and emergency contacts.",
    "Your devices and their notification tokens.",
    "Drivers: the photos of your documents, your profile photo and your identity-check selfie.",
  ],
  kept: [
    "Drivers: everything on the account is kept for 6 months after the request, for police enquiries, and " +
      "deleted as above after that.",
    "Trip records (date, pickup, drop, route, fare, vehicle), without your name, number or email, for safety, " +
      "accounting and tax reasons, for as long as we need them for those reasons or the law requires.",
  ],
} as const;
