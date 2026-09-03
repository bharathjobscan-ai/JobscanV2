/**
 * Domain taxonomy (JSV2S1054).
 *
 * Three changes from the source PRD, each made because the original would have
 * produced false PASSes on a real LinkedIn feed:
 *
 * 1. **`Visa` is restricted, not a plain keyword.** The PRD listed it under
 *    core payments, meaning the card network. This product exists to find visa
 *    *sponsorship*, so "we offer visa sponsorship" — a phrase on a large share
 *    of the jobs we deliberately search for — would have scored a Tier-1
 *    payments signal on every one of them. See RESTRICTED_TERMS.
 *
 * 2. **Ordinary English words dropped to Tier 2.** `risk management`,
 *    `subscriptions`, `checkout`, `cards`, `reconciliation`, `disputes` and
 *    `FX` all appear routinely outside payments. `mandates` was removed
 *    entirely — it is far more often a verb ("the role mandates travel") than
 *    the direct-debit noun.
 *
 * 3. **`fraud` and `risk` added as standalone terms.** The PRD's own test case
 *    "Senior PM - Fraud & Risk → PASS" could not pass: every fraud keyword was
 *    a two-word phrase (`fraud management`, `fraud prevention`, `risk
 *    management`) and the title contains none of them.
 */

export type TierId = "payments" | "payments_adjacent" | "broader_fintech";

export type DomainTier = {
  id: TierId;
  label: string;
  priority: 1 | 2 | 3;
  /**
   * Applied to a section's weight when this is the best tier matched there.
   * A crypto-only role scoring the same as a core payments role is what makes
   * the PRD's `priority` field decorative; this is what makes it bite.
   */
  multiplier: number;
  keywords: readonly string[];
};

export const DOMAIN_TIERS: readonly DomainTier[] = [
  {
    id: "payments",
    label: "Core payments",
    priority: 1,
    multiplier: 1,
    keywords: [
      "payments",
      "payment processing",
      "payment orchestration",
      "payment gateway",
      "payment service provider",
      "psp",
      "payfac",
      "payment facilitator",
      "acquiring",
      "merchant acquiring",
      "card acquiring",
      "acquiring infrastructure",
      "transaction processing",
      "payment checkout",
      "payment routing",
      "smart routing",
      "settlement",
      "payout",
      "payouts",
      "dispute management",
      "chargebacks",
      "fraud management",
      "fraud prevention",
      // Tier 1 so "Senior PM - Fraud & Risk" qualifies on its title, which the
      // source taxonomy could not do: every fraud term there was a two-word
      // phrase the title does not contain.
      "fraud",
      "merchant onboarding",
      "merchant management",
      "kyc",
      "aml",
      "tokenization",
      "tokenisation",
      "3ds",
      "3ds2",
      "sca",
      "strong customer authentication",
      "card networks",
      "mastercard",
      "amex",
      "american express",
      "upi",
      "payment methods",
      "card issuance",
      "issuing",
      "recurring payments",
      "direct debit",
      "cross-border payments",
      "cross border payments",
      "payment integrations",
      "acquirer integrations",
      "gateway integrations",
      "scheme management",
      "interchange",
      "pci-dss",
      "pci dss",
    ],
  },
  {
    id: "payments_adjacent",
    label: "Payments adjacent",
    priority: 2,
    multiplier: 0.6,
    keywords: [
      "fintech",
      "embedded payments",
      "embedded finance",
      "marketplace payouts",
      "platform payments",
      "virtual cards",
      "sepa",
      "sepa instant",
      "open banking",
      "psd2",
      "psd3",
      "swift",
      "payment messaging",
      "interchange optimization",
      "interchange optimisation",
      // Demoted from Tier 1 — real signals, but common outside payments.
      // Consumer-of-payments signals, demoted from Tier 1 on 2026-09-04.
      // "Senior Product Manager - Consumer Mobile (iOS)" at a grocery delivery
      // app passed on "apple pay" alone: every consumer app accepts Apple Pay.
      // Accepting payments is not building them.
      "apple pay",
      "google pay",
      "wallets",
      "checkout",
      "reconciliation",
      "disputes",
      "risk management",
      // Bare "risk" was removed 2026-09-04. It let "Senior Product Manager
      // (IT/Cyber Risk)" through as a payments match on a 100-job sample —
      // exactly the over-broad matching the review of the source PRD warned
      // about. "fraud" carries the Fraud & Risk case on its own.
      "subscriptions",
      "billing",
      "cards",
      "issuance",
      "passkeys",
      "fx",
      "foreign exchange",
      "multi-currency",
      "multi currency",
    ],
  },
  {
    id: "broader_fintech",
    label: "Broader fintech",
    priority: 3,
    multiplier: 0.3,
    keywords: [
      "digital banking",
      "banking technology",
      "core banking",
      "lending",
      "bnpl",
      "buy now pay later",
      "treasury",
      "crypto",
      "digital assets",
      "stablecoin",
      "wealth management",
      "insurtech",
      "regtech",
    ],
  },
];

/**
 * Terms that only count in the right company.
 *
 * `requiresNear` — the term is ignored unless a corroborating term appears
 * within `windowChars` characters. `blockedNear` — the term never counts when
 * one of these is nearby, whatever else is true.
 *
 * "Visa" is the whole reason this mechanism exists. "Visa and Mastercard
 * scheme rules" is a real payments signal; "visa sponsorship available" is the
 * opposite of one, and on this job feed the second is far more common.
 */
export type RestrictedTerm = {
  term: string;
  tier: TierId;
  requiresNear?: readonly string[];
  blockedNear?: readonly string[];
  windowChars: number;
};

export const RESTRICTED_TERMS: readonly RestrictedTerm[] = [
  {
    term: "visa",
    tier: "payments",
    requiresNear: [
      "mastercard",
      "amex",
      "american express",
      "scheme",
      "card",
      "network",
      "interchange",
      "acquiring",
      "issuing",
      "visa direct",
      "payment",
    ],
    blockedNear: [
      "sponsor",
      "sponsorship",
      "work permit",
      "right to work",
      "work authorisation",
      "work authorization",
      "immigration",
      "relocation",
      "eligible to work",
      "tier 2",
      "skilled worker",
    ],
    windowChars: 60,
  },
];

/**
 * Terms that argue against the domain even when payment words appear.
 *
 * Not a veto — a strong payments signal still wins. They exist so an HR or
 * adtech platform that happens to mention payouts does not drift into PASS on
 * one incidental match.
 */
export const NEGATIVE_DOMAIN_TERMS: readonly string[] = [
  "hr platform",
  "human resources",
  "applicant tracking",
  "recruitment platform",
  "adtech",
  "advertising platform",
  "martech",
  "gaming studio",
  "healthcare platform",
  "ehr",
  "logistics platform",
  "supply chain platform",
];
