/**
 * Sponsorship watchlist (JSV2S1162).
 *
 * Companies known to have sponsored international candidates, graded by how
 * strong that evidence is. Curated by the owner from his own research file.
 *
 * WHAT THIS LIST IS NOT. It is not the sponsor register — that answers whether
 * a company holds a licence today and is refreshed from the UK government
 * source. It is not the payments-core list — that answers whether payments is
 * the company's business. Three lists, three questions, and keeping them apart
 * is what stops each from being quietly wrong: Booking.com is a five-star
 * sponsor and payments is not its core business, and conflating those would
 * hand it an affinity bonus it has not earned.
 *
 * APPEND-ONLY. A company is added when sponsorship is confirmed; nothing is
 * removed because evidence was not found this week. Because a watchlist miss
 * never blocks an application, off-list companies keep being applied to, so the
 * list can still learn rather than ossifying around what it already contains.
 *
 * THE SOURCE FILE WAS FIVE OVERLAPPING LISTS. Its §9 watchlist, its §11 tiers
 * and its country tables disagreed: Stripe, Uber and Bolt appear in the tier
 * lists with no evidence row anywhere, Checkout.com appears twice, and
 * "Perk / TravelPerk" is one entry for what is probably two companies. This
 * file resolves to §11, which is the only one that grades.
 */

/**
 * 5 strongest evidence … 1 deprioritised.
 *
 * Tiers 1 and 2 are kept rather than dropped. They carry the owner's own
 * judgement about companies he has looked at and decided against, which is
 * worth more written down than deleted — and keeping them means changing his
 * mind is a tier edit rather than re-research.
 */
export type WatchTier = 1 | 2 | 3 | 4 | 5;

export type WatchlistEntry = {
  name: string;
  tier: WatchTier;
  /** Spellings a posting might use. Matched after normalisation. */
  aliases?: readonly string[];
  note?: string;
};

/**
 * The tier at or above which a watchlist hit lets a job skip automatic scoring
 * (JSV2S1168).
 *
 * 4 and 5 are companies whose sponsorship is evidenced well enough that ScoreG's
 * visa pillar — half the score — would be re-deriving something already known.
 * Tier 3 still becomes an application and is still scored: the owner's point
 * about bunq is that three-star companies do sponsor, not that their evidence
 * is as strong.
 *
 * DECIDED IN THE OWNER'S ABSENCE, 2026-09-19. One number, one place, no logic
 * depends on its value — move it and the behaviour moves with it.
 */
export const WATCHLIST_SKIP_SCORING_TIER: WatchTier = 4;

export const WATCHLIST: readonly WatchlistEntry[] = [
  // ---- Tier 5 — strongest evidence, including India → Europe/UAE movement ----
  { name: "Checkout.com", tier: 5, aliases: ["checkout com", "checkout"] },
  { name: "Stripe", tier: 5 },
  { name: "Adyen", tier: 5 },
  { name: "Wise", tier: 5, aliases: ["transferwise"] },
  { name: "Revolut", tier: 5 },
  { name: "N26", tier: 5 },
  { name: "Booking.com", tier: 5, aliases: ["booking com", "booking holdings"] },
  { name: "Delivery Hero", tier: 5 },
  { name: "Zalando", tier: 5, aliases: ["zalando payments"] },
  { name: "Network International", tier: 5 },
  { name: "Tabby", tier: 5 },
  { name: "Tamara", tier: 5 },
  { name: "Careem", tier: 5, aliases: ["careem pay"] },
  { name: "noon", tier: 5, aliases: ["noon com", "noon.com"] },

  // ---- Tier 4 — strong target ----
  { name: "Monzo", tier: 4, aliases: ["monzo bank"] },
  { name: "SumUp", tier: 4 },
  { name: "Qonto", tier: 4 },
  { name: "Trade Republic", tier: 4 },
  { name: "Scalable Capital", tier: 4 },
  { name: "Raisin", tier: 4 },
  { name: "Cleo", tier: 4, aliases: ["cleo ai"] },
  { name: "Genesis Global", tier: 4, aliases: ["genesis global technology"] },
  { name: "Bolt", tier: 4, note: "Listed in the source tiers with no evidence row; tier taken on trust." },
  { name: "Wolt", tier: 4 },
  { name: "Just Eat Takeaway", tier: 4, aliases: ["just eat", "takeaway com", "jet"] },
  { name: "Vinted", tier: 4, aliases: ["vinted pay"] },
  { name: "HomeToGo", tier: 4 },
  { name: "Distribusion Technologies", tier: 4, aliases: ["distribusion"] },
  { name: "FREE NOW", tier: 4, aliases: ["freenow"] },
  { name: "Depop", tier: 4 },
  { name: "Trainline", tier: 4, aliases: ["trainline group"] },
  { name: "Klarna", tier: 4 },
  { name: "Marqeta", tier: 4 },
  { name: "Optiver", tier: 4 },
  { name: "Lean Technologies", tier: 4 },
  { name: "Geidea", tier: 4 },
  { name: "Wio Bank", tier: 4, aliases: ["wio"] },
  { name: "Pay10", tier: 4 },
  { name: "Mashreq", tier: 4, aliases: ["mashreq bank", "mashreqbank"] },
  { name: "Amazon Payment Services", tier: 4, aliases: ["payfort"] },

  /*
   * Visa and Mastercard are DELIBERATELY ABSENT (2026-09-19, owner's call).
   * Both hire into Dubai largely by internal lateral movement, which is not a
   * path open from outside — and Mastercard's entire evidence in the source
   * file was a single LinkedIn profile.
   */

  // ---- Tier 3 — worth monitoring. Still becomes an application; still scored. ----
  { name: "Mollie", tier: 3 },
  { name: "Starling Bank", tier: 3, aliases: ["starling"] },
  { name: "bunq", tier: 3, note: "Owner interviewed here; sponsorship route confirmed in practice." },
  { name: "Pennylane", tier: 3 },
  { name: "Bitpanda", tier: 3 },
  { name: "Pleo", tier: 3, note: "Source file records a payments PM vacancy explicitly refusing sponsorship." },
  { name: "TravelPerk", tier: 3, note: 'Source listed "Perk / TravelPerk"; resolved to TravelPerk.' },
  { name: "Emidat", tier: 3 },
  { name: "Langfuse", tier: 3 },
  { name: "Langdock", tier: 3 },
  { name: "Rover", tier: 3, aliases: ["rover com"] },
  { name: "voize", tier: 3 },
  { name: "NetBird", tier: 3 },
  { name: "PayTabs", tier: 3 },
  { name: "myFatoorah", tier: 3 },
  { name: "Foodics", tier: 3 },
  { name: "Talabat", tier: 3 },
  { name: "Paymob", tier: 3 },
  { name: "HyperPay", tier: 3 },
  { name: "Optasia", tier: 3 },
  { name: "QiCard", tier: 3 },
  { name: "Mambu", tier: 3 },
  { name: "Pliant", tier: 3, aliases: ["getpliant"] },
  { name: "Ledger", tier: 3 },
  { name: "GetYourGuide", tier: 3 },
  { name: "HelloFresh", tier: 3 },
  { name: "Emirates NBD", tier: 3 },

  /*
   * "Hive", "Rally" and "STARK" from the source file are omitted on purpose.
   * All three are ordinary English words that would collide with unrelated
   * employers, and all three sit in the tiers that earn no benefit anyway. If
   * they are ever wanted, they need an unambiguous legal name first.
   */

  // ---- Tier 2 — discovery only, insufficient evidence ----
  { name: "Nelly", tier: 2 },
  { name: "Cariqa", tier: 2 },
  { name: "Bounti", tier: 2 },
  { name: "Reflex Aerospace", tier: 2 },
  { name: "Lunar", tier: 2 },
  { name: "Alan", tier: 2 },
  { name: "Spendesk", tier: 2 },

  // ---- Tier 1 — deprioritised by the owner ----
  { name: "Payhawk", tier: 1 },
  { name: "Kombo", tier: 1 },
  { name: "Quantum-Systems", tier: 1 },
  { name: "Tabula", tier: 1 },
] as const;
