/**
 * The home page's "Government's vision" band (after cumta.tn.gov.in's Vision banner): the 2026 manifesto promise of a
 * zero-commission "Tamil Taxi app", quoted word for word, and that Tamil Taxi is ready to deliver it.
 *
 * Tamil Taxi is an independent project: never word this, or anything on the site, as if it were the Government's app
 * or endorsed by it, and never show the State emblem (a private site may not use it).
 */
export const vision = {
  ta:
    "தமிழகத்தின் முக்கிய நகரங்களில் ‘தமிழ் டாக்ஸி செயலி’ அறிமுகப்படுத்தப்படும். இதற்கு பிளாட்பார்ம் கமிஷன் " +
    "உள்ளிட்ட எந்தவிதக் கட்டணங்களும் ஓட்டுனர்களிடம் இருந்து வசூலிக்கப்படமாட்டாது.",
  en:
    "A ‘Tamil Taxi app’ will be introduced in the major cities of Tamil Nadu. No fees, including platform " +
    "commission, will be collected from drivers.",
  source: "Tamilaga Vettri Kazhagam election manifesto 2026, Drivers’ welfare, item 3, page 30",
  sourceUrl: "https://tvkvijay.com/en/manifesto",
  /**
   * An official photo of the Chief Minister, in public/ (portrait, about 4:5), that the owner has the right to use;
   * null shows the band without a photo. A test checks the file exists at the size given here.
   */
  photo: null as { src: string; width: number; height: number } | null,
  photoCaption: "Thiru C. Joseph Vijay, Hon’ble Chief Minister of Tamil Nadu",
} as const;
