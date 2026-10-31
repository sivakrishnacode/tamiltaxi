import { site } from "./site";

/**
 * The home page FAQ, also published as FAQPage structured data. Every answer must match what the apps do (see the
 * privacy policy and terms in legal.ts, and using.tech.md).
 */
export const faqs: readonly { q: string; a: string }[] = [
  {
    q: "Is Tamil Taxi really free for drivers?",
    a:
      "Yes. There is no commission on any ride or parcel, and no subscription or weekly fee. Riders pay " +
      "the driver directly by cash or UPI, so the driver keeps the whole fare.",
  },
  {
    q: "How is my fare worked out?",
    a:
      "From the distance and time of your route, with a minimum fare for each vehicle. You see the price and its " +
      "breakdown before you book, and it stays locked: traffic won't change it. A waiting charge, if any, shows on " +
      "its own line. Peak pricing is off by default and can never go above 1.5x.",
  },
  {
    q: "How do I pay?",
    a: "By cash or UPI, straight to your driver at the end of the trip. Tamil Taxi never holds your money.",
  },
  {
    q: "Where does Tamil Taxi work?",
    a: `Tamil Taxi starts in ${site.city}. More cities in Tamil Nadu will follow, one at a time.`,
  },
  {
    q: "Is Tamil Taxi the Government's app?",
    a:
      `No. ${site.independence} It was built around the same idea the Government has promised, a taxi app with no ` +
      "commission from drivers, and all of its code is public so anyone can check how it works.",
  },
  {
    q: "Can women ask for a woman driver?",
    a: "Yes. With Pink Taxi, women riders can ask for a woman driver when they book.",
  },
  {
    q: "How do I become a driver?",
    a:
      `Install ${site.apps.driver.name} and sign up with your phone number. You'll do an identity check with your ` +
      "Aadhaar, driving licence and a selfie, then add photos of your vehicle's RC and insurance. Once you're " +
      "approved, go online to get requests.",
  },
  {
    q: "Which vehicles can I drive with?",
    a:
      "A bike or scooty, an auto, a cab (Mini, Sedan or SUV), a goods bike, or a goods vehicle from a three-wheeler " +
      "to a truck. Goods vehicles can also take moves to another town and Packers & Movers jobs.",
  },
  {
    q: "How do I delete my account?",
    a:
      "Riders: Account › Delete account in the app. Drivers: Account › Help & support › Delete my account. You can " +
      `also email ${site.email}.`,
  },
];
