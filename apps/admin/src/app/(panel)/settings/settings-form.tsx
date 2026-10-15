"use client";

import {
  BadgeIndianRupeeIcon,
  HourglassIcon,
  LifeBuoyIcon,
  ListOrderedIcon,
  PuzzleIcon,
  RadarIcon,
  ReceiptIndianRupeeIcon,
  SearchIcon,
  ShieldCheckIcon,
  TimerIcon,
  TrendingUpIcon,
  UserCheckIcon,
  UserXIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { SaveBar, SettingField, useSettingsDraft, type FieldDef } from "@/components/settings/settings-kit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isReminderKey } from "@/lib/automations";
import { humanize } from "@/lib/format";
import type { SettingsRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { surgeExample, type SettingValue } from "@/lib/validation";

import { saveSettings } from "../actions";

interface Group {
  readonly group: string;
  readonly description: string;
  readonly fields: readonly FieldDef[];
}

const GROUPS: readonly Group[] = [
  {
    group: "Pricing & surge",
    description:
      "Live surge per res-7 hexagon: ratio = bookings ÷ free drivers over the demand window; multiplier = 1 + sensitivity × (ratio − 1), smoothed across neighbouring hexes, rounded down to 0.05 and capped by the maximum.",
    fields: [
      { key: "dynamicSurgeEnabled", label: "Dynamic surge", hint: "Off = only the current multiplier and surge zones apply" },
      { key: "surgeSensitivity", label: "Sensitivity", hint: "How fast prices rise with demand (0.1 = +0.1× per extra booking per driver)", step: "0.01" },
      { key: "demandWindowMin", label: "Demand window", hint: "Minutes of bookings counted as current demand", step: "1", suffix: "min" },
      { key: "surgeMinRequests", label: "Minimum bookings", hint: "No surge in a hexagon below this many bookings", step: "1" },
      { key: "maxMultiplier", label: "Maximum multiplier", hint: "Hard cap, surge zones included", step: "0.05", suffix: "×" },
      { key: "currentMultiplier", label: "Current multiplier", hint: "Platform-wide base multiplier (\"Peak time\")", step: "0.05", suffix: "×" },
    ],
  },
  {
    group: "Dispatch & ETA",
    description: "How bookings are matched: H3 rings around the pickup, drivers ranked by ETA, bookings assigned in batches.",
    fields: [
      { key: "batchWindowMs", label: "Batch window", hint: "Bookings collected, then assigned together", step: "100", suffix: "ms" },
      { key: "useRoadEta", label: "Road ETA", hint: "Rank drivers by Google Routes ETA (cached per hex pair); off = estimate" },
      { key: "historicalEtaMinTrips", label: "Learned ETA after", hint: "Use learned hex-to-hex speeds once a pair has this many trips (0 = off)", step: "1", suffix: "trips" },
      { key: "searchRadiusKm", label: "Search radius", hint: "Around the pickup when the search starts", step: "0.5", suffix: "km" },
      { key: "maxSearchRadiusKm", label: "Maximum search radius", hint: "Widens up to this while nobody accepts", step: "0.5", suffix: "km" },
      { key: "searchExpandSeconds", label: "Widen over", hint: "Seconds from the start radius to the maximum (0 = at once)", step: "5", suffix: "s" },
      { key: "offerSeconds", label: "Offer time", hint: "Seconds each driver has to accept", step: "1", suffix: "s" },
      { key: "offerFanOut", label: "Drivers asked at once", hint: "Each request goes to this many drivers together; the first to accept gets it (1 = one at a time)", step: "1" },
      { key: "maxOpenOffers", label: "Open requests per driver", hint: "Stacked on the driver's request screen; taking one releases the rest (1 = one at a time)", step: "1" },
      { key: "maxCandidates", label: "Drivers per booking", hint: "Offered in order of ETA before \"No drivers\"", step: "1" },
      { key: "maxReassigns", label: "Reassigns per trip", hint: "A driver cancel before pickup finds another driver this many times, then cancels the trip", step: "1" },
      { key: "arrivalRadiusM", label: "Arrived within", hint: "Farther from the pickup, the driver must give a reason to mark Arrived", step: "10", suffix: "m" },
      { key: "dropRadiusM", label: "End trip within", hint: "Farther from the drop, the driver must give a reason to end the trip", step: "10", suffix: "m" },
    ],
  },
  {
    group: "Trip timeouts",
    description:
      "Durable timers per trip. Not moving: first check after max(minimum, factor × pickup ETA); a driver who hasn't got closer is nudged, and on the second failed check the ride goes to another driver. Started trips running far too long are flagged for review, never ended automatically.",
    fields: [
      { key: "notMovingMinMin", label: "Not moving: first check after", hint: "At least this many minutes after accept", step: "1", suffix: "min" },
      { key: "notMovingEtaFactor", label: "Not moving: × pickup ETA", hint: "First check at this × the pickup ETA, if later", step: "0.1", suffix: "×" },
      { key: "notMovingMinProgressM", label: "Not moving: must get closer by", hint: "Straight-line metres towards the pickup since accepting", step: "10", suffix: "m" },
      { key: "notMovingRecheckMin", label: "Not moving: check again after", hint: "After the nudge; the second failed check reassigns", step: "1", suffix: "min" },
      { key: "noShowWaitMin", label: "No-show wait", hint: "Minutes at the pickup before the driver may cancel as \"Passenger didn't come\" (no fault)", step: "1", suffix: "min" },
      { key: "stuckTripMinMin", label: "Stuck trip after", hint: "Started trips running at least this long are flagged…", step: "10", suffix: "min" },
      { key: "stuckDurationFactor", label: "Stuck: × estimate", hint: "…or this × the estimated minutes, if longer", step: "0.5", suffix: "×" },
      { key: "pickupHardCapMin", label: "Not started: cancel after", hint: "Safety net: accepted trips not started by then are cancelled", step: "5", suffix: "min" },
    ],
  },
  {
    group: "Waiting charge",
    description:
      "After the driver marks Arrived, the first minutes are free; then every started minute until the ride starts costs the vehicle's waiting rate (Cities › Fares), up to the cap. Charged at start as its own fare line, never surged. Rides and parcels.",
    fields: [
      { key: "freeWaitMin", label: "Free waiting", hint: "Minutes after Arrived with no charge", step: "1", suffix: "min" },
      { key: "waitMaxCharge", label: "Waiting cap", hint: "Most a trip can be charged for waiting (0 = no waiting charge)", step: "5", suffix: "₹" },
    ],
  },
  {
    group: "Cancellation fee",
    description:
      "Off by default (policy not decided). On: a passenger who cancels after the driver arrived and waited the free minutes owes this fee to that driver; it is added to their next completed ride as \"Previous cancellation fee\" and that ride's driver collects it in cash. No settlement between drivers: Finance › Cancellation fees shows who it was owed to.",
    fields: [
      { key: "cancellationFeeEnabled", label: "Cancellation fee", hint: "Off = nobody is charged for cancelling" },
      { key: "cancellationFee", label: "Fee", hint: "Per late cancellation", step: "5", suffix: "₹" },
    ],
  },
  {
    group: "Driver approval",
    description:
      "Every driver uploads RC + insurance (verified in Drivers › Approvals or KYC) and passes the Didit identity check. On: they are approved the moment the last check passes. Off: they wait in Approvals › Ready to approve until an admin approves them (one by one or in bulk). The daily selfie check makes sure the verified driver is the one driving: once a day (IST) before going online, a live selfie must match the face from their identity check (5 tries a day). Drivers without a verified face are never asked.",
    fields: [
      { key: "driverAutoApprove", label: "Auto-approve drivers", hint: "Off = you approve each ready driver yourself" },
      { key: "dailySelfieCheckEnabled", label: "Daily selfie check", hint: "Off = drivers go online without a selfie" },
    ],
  },
  {
    group: "Driver cancellations",
    description:
      "Driver-fault cancellations ÷ assigned trips over 7 days (counting restarts after a pause). Judged from the minimum trips; from Warn at the driver gets a push and a Home banner, from Pause at they can't go online for the pause length (the repeat length if they were paused in the last 7 days). Admins can lift a pause on the driver page. Passengers are never paused.",
    fields: [
      { key: "cancelRateMinTrips", label: "Judge after", hint: "Assigned trips in the window before a rate counts", step: "1", suffix: "trips" },
      { key: "cancelRateNudge", label: "Warn at", hint: "Share cancelled (0.3 = 30 %)", step: "0.05", suffix: "×" },
      { key: "cancelRateBlock", label: "Pause at", hint: "Share cancelled (0.5 = 50 %)", step: "0.05", suffix: "×" },
      { key: "cancelBlockHours", label: "Pause length", hint: "First pause", step: "1", suffix: "h" },
      { key: "cancelBlockRepeatHours", label: "Repeat pause length", hint: "When paused in the last 7 days", step: "1", suffix: "h" },
    ],
  },
  {
    group: "Driver ranking",
    description:
      "Who is offered a trip first (still one driver at a time): road ETA × (1 + ignored weight × share of offers not accepted + cancel weight × share of accepted rides cancelled by the driver's fault), minus an idle bonus for drivers waiting long since their last trip or going online. Offers over the last 7 days; drivers with fewer offers than Judge after are neutral. The record adds at most Most penalty (0.5 = ETA × 1.5), so riders never wait much longer for a nearer bad driver to be skipped. The idle bonus is a share of the driver's own ETA, so nearer drivers still come first. Off = plain ETA.",
    fields: [
      { key: "rankEnabled", label: "Rank by record", hint: "Off = nearest driver (ETA) first" },
      { key: "rankWeightAccept", label: "Ignored-offer weight", hint: "0.5: never accepting = ETA × 1.5", step: "0.1", suffix: "×" },
      { key: "rankWeightCancel", label: "Cancel weight", hint: "1.0: cancelling every ride = ETA × 2", step: "0.1", suffix: "×" },
      { key: "rankMaxPenalty", label: "Most penalty", hint: "Cap on both weights: 0.5 = at most ETA × 1.5", step: "0.1", suffix: "×" },
      { key: "rankIdleMaxBoost", label: "Idle bonus", hint: "Most taken off the ETA (0.15 = 15 %)", step: "0.05", suffix: "×" },
      { key: "rankIdleFullMin", label: "Full idle bonus after", hint: "Minutes waiting", step: "1", suffix: "min" },
      { key: "rankMinOffers", label: "Judge after", hint: "Offers in 7 days before the record counts", step: "1", suffix: "offers" },
    ],
  },
  {
    group: "Safety",
    description:
      "SOS from either app is recorded and listed on the SOS page (it refreshes every 10 s). Phones signed in with an admin number also get an urgent push. During a ride, a driver who stays put away from the pickup and drop gets the passenger an \"Is everything OK?\" push (\"Get help\" raises an SOS). At night a route change of more than 1 km does the same, the ride start offers sharing the trip and the end asks \"Did you reach safely?\".",
    fields: [
      { key: "sosAdminAlert", label: "SOS push to admins", hint: "Off = the SOS page only" },
      { key: "stopRadiusM", label: "Stopped within", hint: "Moving less than this counts as standing still", step: "5", suffix: "m" },
      { key: "stopMinutes", label: "Stopped for", hint: "Standing still this long (300 m or more from pickup and drop) asks the passenger", step: "1", suffix: "min" },
      { key: "stopDedupeMin", label: "Ask again after", hint: "At most one stop check per trip in this time", step: "1", suffix: "min" },
      { key: "deviationM", label: "Off route after", hint: "3 GPS fixes in a row this far from the quoted route are recorded", step: "10", suffix: "m" },
      { key: "nightStartHour", label: "Night starts", hint: "Hour in IST (22 = 10 pm): route changes over 1 km ask the passenger; start and end checks", step: "1", suffix: "h" },
      { key: "nightEndHour", label: "Night ends", hint: "Hour in IST (5 = 5 am); same as start = never night", step: "1", suffix: "h" },
    ],
  },
  {
    group: "Driver plans",
    description: "Off = Tamil Taxi is free: drivers see no plans and can always go online. Trial and grace apply to new subscriptions when plans are on.",
    fields: [
      { key: "driverPlansEnabled", label: "Paid driver plans", hint: "Off = free app, no subscription" },
      { key: "trialDays", label: "Free trial", hint: "Days for new drivers", step: "1", suffix: "days" },
      { key: "graceDays", label: "Grace period", hint: "Days a lapsed plan can still go online", step: "1", suffix: "days" },
    ],
  },
  {
    group: "Support",
    description: "Shown on the Help screens in both apps.",
    fields: [{ key: "supportPhone", label: "Support phone", hint: "Include the country code" }],
  },
];

const KNOWN = new Set(GROUPS.flatMap((g) => g.fields.map((f) => f.key)));

const ICONS: Record<string, LucideIcon> = {
  "Pricing & surge": TrendingUpIcon,
  "Dispatch & ETA": RadarIcon,
  "Trip timeouts": TimerIcon,
  "Waiting charge": HourglassIcon,
  "Cancellation fee": ReceiptIndianRupeeIcon,
  "Driver approval": UserCheckIcon,
  "Driver cancellations": UserXIcon,
  "Driver ranking": ListOrderedIcon,
  Safety: ShieldCheckIcon,
  "Driver plans": BadgeIndianRupeeIcon,
  Support: LifeBuoyIcon,
  Other: PuzzleIcon,
};

/** URL slug of a section ("Pricing & surge" → "pricing-surge"), kept in ?section=. */
function sectionSlug(group: string): string {
  return group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Fields whose label, hint or key contain every word of [query] (whole group when its name matches). */
function matchFields(g: Group, query: string): readonly FieldDef[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return g.fields;
  const has = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  if (has(g.group)) return g.fields;
  return g.fields.filter((f) => has(`${f.label} ${f.hint} ${f.key}`));
}

/**
 * Form over GET/PUT /admin/settings, one section at a time (?section=). Every key the API returns is rendered: known
 * ones in their sections, anything newer in "Other", so new settings never go missing; reminder keys are edited on
 * Engage › Automations instead. One draft for all sections, so switching never loses an edit; only changed keys are sent.
 */
export function SettingsForm({ initial, section: initialSection }: { initial: SettingsRecord; section?: string }) {
  const [types] = useState(() => Object.fromEntries(Object.entries(initial).filter(([k]) => !isReminderKey(k))) as Record<string, SettingValue>);
  const form = useSettingsDraft(types, saveSettings);
  const [find, setFind] = useState("");

  const other: Group | null = (() => {
    const keys = Object.keys(types).filter((k) => !KNOWN.has(k));
    return keys.length
      ? { group: "Other", description: "Settings added in newer API versions.", fields: keys.map((k) => ({ key: k, label: humanize(k.replace(/([a-z])([A-Z])/g, "$1_$2")), hint: k })) }
      : null;
  })();
  const allGroups = [...GROUPS.map((g) => ({ ...g, fields: g.fields.filter((f) => f.key in types) })), ...(other ? [other] : [])].filter((g) => g.fields.length);
  const [section, setSection] = useState(() => allGroups.find((g) => sectionSlug(g.group) === initialSection)?.group ?? allGroups[0]?.group);
  const current = allGroups.find((g) => g.group === section) ?? allGroups[0];
  const isSearching = find.trim().length > 0;
  const found = isSearching ? allGroups.map((g) => ({ ...g, fields: matchFields(g, find) })).filter((g) => g.fields.length) : [];
  const shown = isSearching ? found : current ? [current] : [];
  // Unsaved changes per section, so an edit in a hidden section is never forgotten.
  const changedIn = (g: Group) => g.fields.filter((f) => form.changed.includes(f.key)).length;
  const editedSections = allGroups.filter((g) => changedIn(g) > 0).map((g) => g.group);

  function open(group: string) {
    setSection(group);
    setFind("");
    // Native history keeps the section in the URL (links and reloads open it) without a server round trip.
    window.history.replaceState(null, "", `?section=${sectionSlug(group)}`);
  }

  const sens = Number(form.draft.surgeSensitivity);
  const cap = Number(form.draft.maxMultiplier);
  const example = Number.isFinite(sens) && Number.isFinite(cap) ? surgeExample(3, sens, cap) : null;

  return (
    <form noValidate onSubmit={form.submit} className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className="grid gap-3 lg:sticky lg:top-24">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Find a setting"
            aria-label="Find a setting, e.g. radius, surge, pause"
            className="h-9 bg-card pl-9"
          />
        </div>

        {/* Phones: one select. */}
        <div className="lg:hidden">
          <Select value={isSearching ? "" : current?.group} onValueChange={open}>
            <SelectTrigger className="w-full bg-card" aria-label="Settings section">
              <SelectValue placeholder={`Matches in ${found.length} section${found.length === 1 ? "" : "s"}`} />
            </SelectTrigger>
            <SelectContent>
              {allGroups.map((g) => {
                const edits = changedIn(g);
                return (
                  <SelectItem key={g.group} value={g.group}>
                    {g.group}
                    {edits > 0 ? ` · ${edits} unsaved` : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop: the section list. */}
        <nav aria-label="Settings sections" className="hidden flex-col gap-0.5 lg:flex">
          {allGroups.map((g) => {
            const Icon = ICONS[g.group] ?? PuzzleIcon;
            const edits = changedIn(g);
            const matches = isSearching ? (found.find((x) => x.group === g.group)?.fields.length ?? 0) : null;
            const isActive = !isSearching && g.group === current?.group;
            return (
              <button
                key={g.group}
                type="button"
                onClick={() => open(g.group)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm font-medium text-navy-700 transition-colors hover:bg-muted hover:text-navy-900",
                  isActive && "bg-coral-50 text-coral-600 hover:bg-coral-50 hover:text-coral-600",
                  matches === 0 && "text-muted-foreground/60",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{g.group}</span>
                {matches !== null && matches > 0 && <span className="text-xs text-muted-foreground tabular-nums">{matches}</span>}
                {edits > 0 && (
                  <span className="rounded-full bg-coral-600 px-1.5 text-[10px] font-semibold text-white tabular-nums" aria-label={`${edits} unsaved`}>
                    {edits}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="grid min-w-0 gap-4">
        {isSearching && (
          <p className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {found.length
                ? `${found.reduce((n, g) => n + g.fields.length, 0)} setting${found.reduce((n, g) => n + g.fields.length, 0) === 1 ? "" : "s"} match “${find.trim()}”`
                : `No setting matches “${find.trim()}”.`}
            </span>
            <button type="button" onClick={() => setFind("")} className="inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:text-coral-600">
              <XIcon className="size-3.5" aria-hidden /> Clear
            </button>
          </p>
        )}
        {shown.map((g) => {
          const Icon = ICONS[g.group] ?? PuzzleIcon;
          return (
            <Card key={g.group}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2.5 text-lg font-semibold text-navy-900">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-coral-50 text-coral-600">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  {g.group}
                </CardTitle>
                <CardDescription className="max-w-3xl leading-relaxed">{g.description}</CardDescription>
                {g.group === "Pricing & surge" && example !== null && (
                  <p className="mt-1 w-fit rounded-md bg-coral-50 px-2.5 py-1.5 text-xs text-coral-700">
                    Example: 6 bookings, 2 free drivers → ratio 3 → 1 + {Number.isFinite(sens) ? sens : "?"} × 2 = <b>{example.toFixed(2)}×</b>
                    {form.draft.dynamicSurgeEnabled === false ? " (dynamic surge is off)" : ""}
                  </p>
                )}
              </CardHeader>
              <CardContent className="grid gap-x-6 gap-y-5 border-t pt-5 sm:grid-cols-2">
                {g.fields.map((f) => (
                  <SettingField key={f.key} field={f} form={form} />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <SaveBar form={form} where={editedSections.join(", ")} className="lg:col-span-2" />
    </form>
  );
}
