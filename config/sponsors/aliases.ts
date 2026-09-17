/**
 * Trading name → registered legal name (JSV2S1127).
 *
 * TS-as-data, like `config/prequalification/`, because these are product
 * knowledge rather than logic. The register lists the legal entity that holds
 * the licence; a job posting names the brand. Normalisation closes most of that
 * gap deterministically — this file is only for the cases it cannot, where the
 * two names share no tokens at all.
 *
 * Keys are normalised with `normaliseName`, so write them as they appear on a
 * posting and the lookup will find them.
 *
 * Add an entry only when you have confirmed the mapping against the register.
 * A wrong alias is worse than no alias: it reports `confirmed` for a licence
 * the employer does not hold, which is exactly the false positive the visa
 * pillar must never produce.
 */
export const SPONSOR_ALIASES: Record<string, string> = {
  // Every entry below was verified against the register dated 2026-09-03 by
  // `npm run sponsors:audit`. Nine of the original guesses were WRONG and were
  // corrected or removed — which is why the audit script exists and must be run
  // after every refresh.
  VISA: "VISA EUROPE LIMITED",
  GOOGLE: "GOOGLE UK LIMITED",
  AMAZON: "AMAZON UK SERVICES LTD",
  MICROSOFT: "MICROSOFT LIMITED",
  STRIPE: "STRIPE PAYMENTS UK LTD",
  WISE: "WISE PAYMENTS LIMITED",
  TRANSFERWISE: "WISE PAYMENTS LIMITED",
  REVOLUT: "REVOLUT LTD",
  CHECKOUTCOM: "CHECKOUT LTD",
  CHECKOUT: "CHECKOUT LTD",
  MONZO: "MONZO BANK LIMITED",
  STARLING: "STARLING BANK LIMITED",
  AIRWALLEX: "AIRWALLEX UK LIMITED",
  WORLDPAY: "WORLDPAY UK LIMITED",
  PAYPAL: "PAYPAL UK LTD",

  // Corrected by the audit — the guessed legal names did not exist.
  META: "Facebook UK",
  FACEBOOK: "Facebook UK",
  ADYEN: "ADYEN N.V. LONDON BRANCH",
  KLARNA: "Klarna Bank AB UK Branch",
  MOLLIE: "Mollie B.V.",

  // REMOVED, not forgotten. None of these hold a licence under the name that
  // was guessed, and several attract dangerous partial matches:
  //   APPLE  — no "Apple UK Limited"; the register is full of unrelated
  //            "Apple ..." small firms.
  //   AWS    — Amazon Web Services is not separately listed; use AMAZON.
  //   NIUM   — nothing real. A substring search for "NIUM" matches
  //            "alumiNIUM", which is precisely why this lookup never does
  //            substring matching.
  //   THUNES — genuinely absent from the register.
  // Leaving them out makes these resolve to `none`, which is the honest answer.
} as const;

/**
 * Names too generic to resolve by token matching.
 *
 * "Visa" is the reason this list exists: the word is also the subject of the
 * search, so a partial match against the register returns visa-services
 * companies rather than the employer. Anything here MUST resolve through
 * `SPONSOR_ALIASES` or return no match — never through a prefix match.
 */
export const AMBIGUOUS_NAMES = new Set([
  "VISA",
  "SPONSOR",
  "SPONSORSHIP",
  "IMMIGRATION",
  "GLOBAL",
  "GROUP",
  "THE",
]);
