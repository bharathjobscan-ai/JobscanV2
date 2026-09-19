/**
 * Company payments affinity (JSV2S1167).
 *
 * Domain is the gate's one straight-reject filter and it reads keywords from
 * the JD. A generic "Senior Product Manager" posting at Adyen or Checkout.com
 * frequently carries no payments vocabulary at all, because there it goes
 * without saying — so domain-first rejects roles at the highest-priority
 * companies, silently, into the rejected pile.
 *
 * THE TWO TIERS EXIST BECAUSE A DOMAIN MISS MEANS DIFFERENT THINGS.
 *
 * At a company whose business IS payments, a miss is the rare exception and the
 * role is almost certainly payments-adjacent, so the job goes through as an
 * application carrying a mark. At a large marketplace with a real payments arm,
 * a miss is the NORMAL case — Booking.com posts far more "Product Manager, Trip
 * Planning" than payments roles — so a blanket pass would convert most of their
 * PM output into applications, and those go to review instead.
 *
 * The line is the one ScoreG already draws in its Company Domain Affinity
 * bonus: +10 for a company whose core business is payments, +5 for one with a
 * significant payments component.
 *
 * SCOPED TO THE DOMAIN FILTER. This never bypasses the gate — an Adyen posting
 * in Texas still rejects on location, and one asking for fifteen years still
 * routes to review on experience.
 */

export type AffinityTier = "core" | "significant";

export type AffinityEntry = {
  name: string;
  tier: AffinityTier;
  aliases?: readonly string[];
};

/** What a domain FAIL becomes at a company in each tier. */
export const AFFINITY_DOMAIN_OUTCOME: Record<AffinityTier, "pass" | "unknown"> = {
  /** Passes, marked. The owner's call, 2026-09-19. */
  core: "pass",
  /** Held for a human. A domain miss here is ordinary, not exceptional. */
  significant: "unknown",
};

export const PAYMENTS_AFFINITY: readonly AffinityEntry[] = [
  // ---- core: payments, money movement or banking IS the business ----
  { name: "Adyen", tier: "core" },
  { name: "Checkout.com", tier: "core", aliases: ["checkout com", "checkout"] },
  { name: "Stripe", tier: "core" },
  { name: "Marqeta", tier: "core" },
  { name: "Mollie", tier: "core" },
  { name: "SumUp", tier: "core" },
  { name: "Wise", tier: "core", aliases: ["transferwise"] },
  { name: "Revolut", tier: "core" },
  { name: "Klarna", tier: "core" },
  { name: "N26", tier: "core" },
  { name: "Monzo", tier: "core", aliases: ["monzo bank"] },
  { name: "Starling Bank", tier: "core", aliases: ["starling"] },
  { name: "bunq", tier: "core" },
  { name: "Qonto", tier: "core" },
  { name: "Lunar", tier: "core" },
  { name: "Pleo", tier: "core" },
  { name: "Spendesk", tier: "core" },
  { name: "Payhawk", tier: "core" },
  { name: "Pliant", tier: "core", aliases: ["getpliant"] },
  { name: "Mambu", tier: "core" },
  { name: "Network International", tier: "core" },
  { name: "Geidea", tier: "core" },
  { name: "PayTabs", tier: "core" },
  { name: "Paymob", tier: "core" },
  { name: "HyperPay", tier: "core" },
  { name: "myFatoorah", tier: "core" },
  { name: "Pay10", tier: "core" },
  { name: "Lean Technologies", tier: "core" },
  { name: "Tabby", tier: "core" },
  { name: "Tamara", tier: "core" },
  { name: "Wio Bank", tier: "core", aliases: ["wio"] },
  { name: "Mashreq", tier: "core", aliases: ["mashreq bank", "mashreqbank"] },
  { name: "Emirates NBD", tier: "core" },
  { name: "Amazon Payment Services", tier: "core", aliases: ["payfort"] },
  { name: "Optasia", tier: "core" },
  { name: "QiCard", tier: "core" },

  // ---- significant: a real payments organisation inside a bigger business ----
  { name: "Booking.com", tier: "significant", aliases: ["booking com"] },
  { name: "Delivery Hero", tier: "significant" },
  { name: "Zalando", tier: "significant", aliases: ["zalando payments"] },
  { name: "noon", tier: "significant", aliases: ["noon com"] },
  { name: "Careem", tier: "significant", aliases: ["careem pay"] },
  { name: "Just Eat Takeaway", tier: "significant", aliases: ["just eat"] },
  { name: "Wolt", tier: "significant" },
  { name: "Bolt", tier: "significant" },
  { name: "Talabat", tier: "significant" },
  { name: "Vinted", tier: "significant", aliases: ["vinted pay"] },
  { name: "Trainline", tier: "significant", aliases: ["trainline group"] },
  { name: "Depop", tier: "significant" },
  { name: "HomeToGo", tier: "significant" },
  { name: "FREE NOW", tier: "significant", aliases: ["freenow"] },
  { name: "Distribusion Technologies", tier: "significant", aliases: ["distribusion"] },
  { name: "TravelPerk", tier: "significant" },
  { name: "GetYourGuide", tier: "significant" },
  { name: "Trade Republic", tier: "significant" },
  { name: "Scalable Capital", tier: "significant" },
  { name: "Raisin", tier: "significant" },
  { name: "Cleo", tier: "significant", aliases: ["cleo ai"] },
  { name: "Bitpanda", tier: "significant" },
  { name: "Ledger", tier: "significant" },
  { name: "Optiver", tier: "significant" },
  { name: "Foodics", tier: "significant" },
  { name: "Genesis Global", tier: "significant", aliases: ["genesis global technology"] },
] as const;
