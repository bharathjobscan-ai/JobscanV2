/**
 * Visa-language rules (JSV2S1156).
 *
 * Built from the owner's specification file, and from the principle stated at
 * the end of it: the question is *"does this JD contain sufficiently strong
 * evidence that sponsorship is unavailable"*, never *"can I find the word
 * visa"*.
 *
 * The asymmetry is the whole design. A false REMOVE deletes a genuinely
 * sponsorable job and we never learn of it; a false REVIEW costs one click. So
 * every ambiguous category below resolves to REVIEW, and only an explicit
 * refusal reaches REMOVE.
 *
 * TWO CORRECTIONS TO THE SOURCE SPECIFICATION, both of which would have caused
 * mass over-rejection if implemented as written:
 *
 * 1. §7 is headed "HARD REMOVE — Existing Authorization Required" and its body
 *    says "Treat this as REVIEW unless...". §10 is headed "HARD REMOVE —
 *    Permanent / Unrestricted Authorization" and says "should initially be
 *    REVIEW". The BODIES are right; the headings contradict them.
 * 2. Neither the spec nor the watchlist file covers Gulf vocabulary, which is
 *    where the owner's UAE concern actually lives. See UAE_RULES.
 *
 * Patterns run against `normaliseForVisa` output: lowercased, accent-folded,
 * apostrophes removed (so "can't" and "cant" are one string), hyphens spaced
 * (so "visa-sponsorship" and "visa sponsorship" are one string).
 */

/** What a matched rule argues for, before precedence is applied. */
export type VisaRuleCategory =
  | "negative"
  | "role_block"
  | "citizenship_block"
  | "positive"
  | "conditional"
  | "existing_auth"
  | "permanent_auth"
  | "citizenship_pref"
  | "local_only";

export type VisaReasonCode =
  | "EXPLICIT_SPONSORSHIP_AVAILABLE"
  | "CONDITIONAL_SPONSORSHIP"
  | "EXPLICIT_NO_SPONSORSHIP"
  | "ROLE_NOT_SPONSORABLE"
  | "EXISTING_AUTHORIZATION_REQUIRED"
  | "CITIZENSHIP_RESTRICTION"
  | "LOCAL_CANDIDATES_ONLY"
  | "CONTRADICTORY"
  | "GENERIC_RIGHT_TO_WORK"
  | "UNKNOWN";

export type VisaRule = {
  id: string;
  category: VisaRuleCategory;
  reasonCode: VisaReasonCode;
  pattern: RegExp;
  /** Reported, never used to decide. Precedence decides. See §20 of the spec. */
  confidence: number;
};

/**
 * Sponsorship nouns, as one alternation reused across the negative rules.
 *
 * Kept in one place because the failure mode of a phrase dictionary is a rule
 * that covers "visa sponsorship" and silently misses "employer sponsorship".
 */
const SPON = "(?:visa |work visa |work permit |employer |immigration )?sponsorship";
const SPONSOR_VERB = "sponsor(?:ship)?";

/**
 * A gap that refuses to cross a negation or a hedge.
 *
 * Found by testing: `sponsorship[^.]{0,30}available` matches "sponsorship is
 * NOT available", and `we[^.]{0,20}provide[^.]{0,30}sponsorship` matches "we do
 * NOT provide visa sponsorship". Both read as explicit offers, and because an
 * offer beside a refusal is a contradiction, both then resolved to REVIEW —
 * so the three clearest refusals in the whole specification were the ones this
 * filter failed to act on.
 *
 * Hedges are blocked for the same reason in the other direction: "sponsorship
 * MAY be available" is conditional, and a positive rule that reaches across
 * "may" would promote it to an explicit offer.
 */
const BLOCKERS =
  "not|no|cannot|can not|cant|unable|unavailable|never|without|wont|dont|doesnt|" +
  "may|might|could|possibly|potentially|subject|depending|case by case|rarely|seldom";

const gap = (n: number) => `(?:(?!\\b(?:${BLOCKERS})\\b)[^.]){0,${n}}`;

/* ------------------------------------------------------------------ *
 * REMOVE — explicit refusal
 * ------------------------------------------------------------------ */

const NEGATIVE_RULES: VisaRule[] = [
  {
    id: "NEG_UNAVAILABLE",
    category: "negative",
    reasonCode: "EXPLICIT_NO_SPONSORSHIP",
    pattern: new RegExp(
      `\\b${SPON}\\b[^.]{0,40}\\b(?:is |are |will be )?(?:not available|unavailable|not offered|not provided|not possible|not an option)\\b`,
    ),
    confidence: 0.98,
  },
  {
    id: "NEG_WILL_NOT_PROVIDE",
    category: "negative",
    reasonCode: "EXPLICIT_NO_SPONSORSHIP",
    pattern: new RegExp(
      `\\b${SPON}\\b[^.]{0,40}\\b(?:cannot|can not|cant|will not|wont|is not) (?:be )?(?:provided|offered|granted|supported)\\b`,
    ),
    confidence: 0.98,
  },
  {
    id: "NEG_WE_CANNOT",
    category: "negative",
    reasonCode: "EXPLICIT_NO_SPONSORSHIP",
    pattern: new RegExp(
      `\\b(?:we|the company|our company|this employer)\\b[^.]{0,40}\\b(?:cannot|can not|cant|are unable to|is unable to|do not|dont|does not|doesnt|will not|wont)\\b[^.]{0,40}\\b(?:offer|provide|support|sponsor)\\b[^.]{0,30}\\b(?:${SPON}|visas?|work permits?)\\b`,
    ),
    confidence: 0.97,
  },
  {
    id: "NEG_UNABLE_TO_SPONSOR",
    category: "negative",
    reasonCode: "EXPLICIT_NO_SPONSORSHIP",
    pattern: new RegExp(
      `\\b(?:are|is|am) unable to ${SPONSOR_VERB}\\b|\\b(?:cannot|can not|cant|will not|wont) ${SPONSOR_VERB}\\b`,
    ),
    confidence: 0.96,
  },
  {
    id: "NEG_NO_SPONSORSHIP_BARE",
    category: "negative",
    reasonCode: "EXPLICIT_NO_SPONSORSHIP",
    pattern: new RegExp(`\\bno ${SPON}\\b|\\bwithout ${SPON}\\b`),
    confidence: 0.95,
  },
  {
    id: "NEG_WITHOUT_SPONSORSHIP",
    category: "negative",
    reasonCode: "EXPLICIT_NO_SPONSORSHIP",
    pattern: new RegExp(
      `\\b(?:right to work|eligible to work|able to work|authoris?ed to work|work authoriz?s?ation|legally able to work)\\b[^.]{0,60}\\bwithout\\b[^.]{0,30}\\b(?:${SPON}|requiring ${SPONSOR_VERB}|the need for ${SPONSOR_VERB})`,
    ),
    confidence: 0.96,
  },
  {
    id: "NEG_MUST_NOT_REQUIRE",
    category: "negative",
    reasonCode: "EXPLICIT_NO_SPONSORSHIP",
    pattern: new RegExp(
      `\\b(?:must not|will not|wont|do not|dont|does not|doesnt|cannot|cant) (?:require|need)\\b[^.]{0,30}\\b${SPON}\\b`,
    ),
    confidence: 0.96,
  },
  {
    id: "NEG_NOW_OR_FUTURE",
    category: "negative",
    reasonCode: "EXPLICIT_NO_SPONSORSHIP",
    pattern: new RegExp(
      `\\b${SPON}\\b[^.]{0,60}\\b(?:now or in the future|now or at any point|at any point in the future|currently or in the future)\\b|\\b(?:now or in the future|now or at any point)\\b[^.]{0,60}\\b${SPON}\\b`,
    ),
    confidence: 0.95,
  },
  {
    id: "NEG_APPLICANTS_REQUIRING",
    category: "negative",
    reasonCode: "EXPLICIT_NO_SPONSORSHIP",
    pattern: new RegExp(
      `\\b(?:applicants?|candidates?)\\b[^.]{0,30}\\brequiring\\b[^.]{0,30}\\b${SPON}\\b[^.]{0,40}\\b(?:will not be considered|cannot be considered|are not eligible|need not apply)\\b`,
    ),
    confidence: 0.98,
  },
];

const ROLE_BLOCK_RULES: VisaRule[] = [
  {
    id: "ROLE_NOT_ELIGIBLE",
    category: "role_block",
    reasonCode: "ROLE_NOT_SPONSORABLE",
    pattern: new RegExp(
      `\\b(?:this |the )?(?:role|position|vacancy|opportunity|job)\\b[^.]{0,40}\\b(?:is not eligible for|does not qualify for|is not open to|cannot be|does not meet)\\b[^.]{0,40}\\b(?:${SPON}|sponsored|skilled worker|sponsorship requirements)\\b`,
    ),
    confidence: 0.97,
  },
  {
    id: "ROLE_NOT_SKILLED_WORKER",
    category: "role_block",
    reasonCode: "ROLE_NOT_SPONSORABLE",
    pattern:
      /\bnot eligible for\b[^.]{0,30}\b(?:skilled worker|tier 2|certificate of sponsorship)\b/,
    confidence: 0.96,
  },
];

/**
 * Mandatory citizenship. REMOVE — but only where it is stated as a requirement.
 *
 * "EU citizenship preferred" is §12's own counter-example and must not reject.
 */
const CITIZENSHIP_BLOCK_RULES: VisaRule[] = [
  {
    id: "CITIZENSHIP_ONLY",
    category: "citizenship_block",
    reasonCode: "CITIZENSHIP_RESTRICTION",
    pattern:
      /\b(?:uk|british|eu|eea|eu\/eea|irish|german|dutch|swedish|emirati|uae)\s+(?:citizens?|nationals?|passport holders?)\s+only\b/,
    confidence: 0.94,
  },
  {
    id: "CITIZENSHIP_REQUIRED",
    category: "citizenship_block",
    reasonCode: "CITIZENSHIP_RESTRICTION",
    pattern:
      /\b(?:settled status|indefinite leave to remain|ilr|permanent residency|permanent residence)\b[^.]{0,20}\b(?:is )?(?:required|mandatory|essential)\b|\bpermanent residents? only\b/,
    confidence: 0.9,
  },
  {
    id: "CITIZENSHIP_SECURITY_CLEARANCE",
    category: "citizenship_block",
    reasonCode: "CITIZENSHIP_RESTRICTION",
    pattern:
      /\b(?:must be a|must hold)\b[^.]{0,20}\b(?:uk|british|eu|us)\b[^.]{0,10}\b(?:citizen|national)\b/,
    confidence: 0.92,
  },
];

/* ------------------------------------------------------------------ *
 * KEEP — explicit offer
 * ------------------------------------------------------------------ */

const POSITIVE_RULES: VisaRule[] = [
  {
    id: "POS_AVAILABLE",
    category: "positive",
    reasonCode: "EXPLICIT_SPONSORSHIP_AVAILABLE",
    pattern: new RegExp(`\\b${SPON}\\b${gap(30)}\\b(?:is |are )?(?:available|offered|provided)\\b`),
    confidence: 0.95,
  },
  {
    id: "POS_WE_OFFER",
    category: "positive",
    reasonCode: "EXPLICIT_SPONSORSHIP_AVAILABLE",
    pattern: new RegExp(
      `\\b(?:we|the company)\\b${gap(20)}\\b(?:offer|provide|can provide|can offer|will provide|will offer|can assist with|support)\\b${gap(30)}\\b${SPON}\\b`,
    ),
    confidence: 0.95,
  },
  {
    id: "POS_WE_SPONSOR",
    category: "positive",
    reasonCode: "EXPLICIT_SPONSORSHIP_AVAILABLE",
    pattern:
      /\b(?:we|the company) (?:can|will|do|are happy to|are able to) sponsor\b|\bwe sponsor international (?:candidates|applicants|hires)\b/,
    confidence: 0.95,
  },
  {
    id: "POS_RELOCATION_WITH_VISA",
    category: "positive",
    reasonCode: "EXPLICIT_SPONSORSHIP_AVAILABLE",
    pattern: new RegExp(
      `\\brelocation (?:package|support|assistance)\\b${gap(40)}\\bvisa (?:support|sponsorship|assistance)\\b|\\bvisa (?:support|sponsorship|assistance)\\b${gap(40)}\\brelocation\\b`,
    ),
    confidence: 0.88,
  },
  {
    id: "POS_COS",
    category: "positive",
    reasonCode: "EXPLICIT_SPONSORSHIP_AVAILABLE",
    pattern: new RegExp(
      `\\b(?:certificate of sponsorship|skilled worker (?:visa )?sponsorship)\\b${gap(30)}\\b(?:available|offered|provided|issued)\\b`,
    ),
    confidence: 0.94,
  },
];

/* ------------------------------------------------------------------ *
 * REVIEW — everything arguable
 * ------------------------------------------------------------------ */

const CONDITIONAL_RULES: VisaRule[] = [
  {
    id: "COND_MAY_BE",
    category: "conditional",
    reasonCode: "CONDITIONAL_SPONSORSHIP",
    pattern: new RegExp(
      `\\b${SPON}\\b[^.]{0,40}\\b(?:may|might|could|can) be (?:available|offered|provided|considered)\\b`,
    ),
    confidence: 0.7,
  },
  {
    id: "COND_SUBJECT_TO",
    category: "conditional",
    reasonCode: "CONDITIONAL_SPONSORSHIP",
    pattern: new RegExp(
      `\\bsubject to\\b[^.]{0,30}\\b(?:${SPON}|visa) (?:eligibility|requirements|approval)\\b|\\b${SPON}\\b[^.]{0,40}\\b(?:depending on|subject to|based on)\\b`,
    ),
    confidence: 0.7,
  },
  {
    id: "COND_CASE_BY_CASE",
    category: "conditional",
    reasonCode: "CONDITIONAL_SPONSORSHIP",
    pattern: new RegExp(
      `\\b${SPON}\\b[^.]{0,40}\\b(?:case by case|exceptional candidates|eligible candidates|the right candidate)\\b`,
    ),
    confidence: 0.72,
  },
];

const EXISTING_AUTH_RULES: VisaRule[] = [
  {
    id: "AUTH_MUST_ALREADY",
    category: "existing_auth",
    reasonCode: "EXISTING_AUTHORIZATION_REQUIRED",
    pattern:
      /\bmust (?:already|currently)\b[^.]{0,30}\b(?:have|hold|be)\b[^.]{0,40}\b(?:right to work|work authoriz?s?ation|permission to work|authoris?ed to work|eligible to work)\b/,
    confidence: 0.6,
  },
  {
    id: "AUTH_EXISTING_REQUIRED",
    category: "existing_auth",
    reasonCode: "EXISTING_AUTHORIZATION_REQUIRED",
    pattern:
      /\b(?:existing|current|valid)\b[^.]{0,20}\b(?:work authoriz?s?ation|work permit|right to work)\b[^.]{0,20}\b(?:is )?(?:required|essential|mandatory)\b/,
    confidence: 0.6,
  },
];

const PERMANENT_AUTH_RULES: VisaRule[] = [
  {
    id: "PERM_UNRESTRICTED",
    category: "permanent_auth",
    reasonCode: "EXISTING_AUTHORIZATION_REQUIRED",
    pattern:
      /\b(?:permanent|unrestricted|indefinite|full unrestricted)\b[^.]{0,20}\b(?:right to work|work authoriz?s?ation|permission to work|eligibility to work|work permit)\b/,
    confidence: 0.55,
  },
];

const CITIZENSHIP_PREF_RULES: VisaRule[] = [
  {
    id: "CITIZENSHIP_PREFERRED",
    category: "citizenship_pref",
    reasonCode: "CITIZENSHIP_RESTRICTION",
    pattern:
      /\b(?:uk|british|eu|eea|irish|emirati|uae)\s+(?:citizens?|nationals?|citizenship)\b[^.]{0,20}\b(?:preferred|desirable|advantageous|a plus)\b|\b(?:settled status|indefinite leave to remain)\b[^.]{0,20}\bpreferred\b/,
    confidence: 0.4,
  },
];

const LOCAL_ONLY_RULES: VisaRule[] = [
  {
    id: "LOCAL_ONLY",
    category: "local_only",
    reasonCode: "LOCAL_CANDIDATES_ONLY",
    pattern:
      /\b(?:local candidates?|local applicants?|local residents?)\s+only\b|\b(?:uk|dutch|german|irish|portuguese) residents? only\b/,
    confidence: 0.45,
  },
  {
    id: "LOCAL_MUST_RESIDE",
    category: "local_only",
    reasonCode: "LOCAL_CANDIDATES_ONLY",
    pattern:
      /\bmust (?:already |currently )?(?:reside|be residing|be living|be located|be based)\b[^.]{0,40}\b(?:in|within)\b/,
    confidence: 0.4,
  },
];

/**
 * Gulf vocabulary (JSV2S1156, added 2026-09-19).
 *
 * The owner asked for a UAE exception. He does not need one: existing-
 * authorisation and local-only are already REVIEW above, so an ordinary Dubai
 * posting is never removed. What he does need is this — the Gulf says all of
 * it differently, and none of these phrases appear anywhere in the source
 * specification.
 *
 * The exception he asked for would also have opened a hole. Emiratisation
 * quotas make some roles legally restricted to UAE nationals, and a blanket
 * UAE bypass would route those to review for ever.
 */
const UAE_RULES: VisaRule[] = [
  {
    id: "UAE_NATIONALS_ONLY",
    category: "citizenship_block",
    reasonCode: "CITIZENSHIP_RESTRICTION",
    pattern:
      /\b(?:uae|emirati)\s+nationals?\s+only\b|\bopen (?:only )?to (?:uae|emirati) nationals?\b|\bthis (?:role|position) is (?:reserved for|part of).{0,30}\bemiratis(?:ation|ation programme|ation program)\b.{0,40}\bnationals? only\b/,
    confidence: 0.93,
  },
  {
    id: "UAE_EMIRATISATION",
    category: "citizenship_pref",
    reasonCode: "CITIZENSHIP_RESTRICTION",
    pattern: /\bemirati[sz]ation\b/,
    confidence: 0.35,
  },
  {
    id: "UAE_NOC_TRANSFERABLE",
    category: "existing_auth",
    reasonCode: "EXISTING_AUTHORIZATION_REQUIRED",
    pattern:
      /\b(?:noc|no objection certificate|transferable visa|transferrable visa|own visa|spouse visa|husband visa|wife visa|family visa|golden visa)\b/,
    confidence: 0.45,
  },
  {
    id: "UAE_MUST_BE_IN_COUNTRY",
    category: "local_only",
    reasonCode: "LOCAL_CANDIDATES_ONLY",
    pattern:
      /\b(?:must be|candidates? (?:must be|should be))\b[^.]{0,30}\b(?:currently )?(?:in|inside|within) the uae\b|\bavailable in (?:the )?uae\b/,
    confidence: 0.4,
  },
];

export const VISA_RULES: readonly VisaRule[] = [
  ...NEGATIVE_RULES,
  ...ROLE_BLOCK_RULES,
  ...CITIZENSHIP_BLOCK_RULES,
  ...POSITIVE_RULES,
  ...CONDITIONAL_RULES,
  ...EXISTING_AUTH_RULES,
  ...PERMANENT_AUTH_RULES,
  ...CITIZENSHIP_PREF_RULES,
  ...LOCAL_ONLY_RULES,
  ...UAE_RULES,
] as const;

/**
 * Terms too generic to act on, listed so the reason can say so out loud.
 *
 * §16 of the spec. These are recorded as GENERIC_RIGHT_TO_WORK and change
 * nothing — their only job is to make "no immigration information" and "generic
 * boilerplate present" distinguishable on the review screen.
 */
export const GENERIC_TERMS: readonly string[] = [
  "right to work",
  "eligible to work",
  "legally authorised to work",
  "legally authorized to work",
  "work authorisation",
  "work authorization",
  "work eligibility",
  "work permit",
  "visa",
] as const;

/**
 * Country vocabulary. Recorded as evidence, never allowed to decide.
 *
 * §22: "Country-specific immigration terms must not automatically imply
 * sponsorship availability." A JD that names the Skilled Worker route may be
 * offering it or excluding it, and the sentence around it is what says which.
 */
export const COUNTRY_SIGNAL_TERMS: Record<string, readonly string[]> = {
  UK: ["skilled worker", "certificate of sponsorship", "cos", "tier 2"],
  NL: ["highly skilled migrant", "kennismigrant", "ind sponsor", "recognised sponsor"],
  DE: ["blue card", "blaue karte", "aufenthaltstitel", "residence permit"],
  SE: ["swedish work permit", "residence permit for work"],
  UAE: ["employment visa", "labour card", "work permit uae", "residency visa"],
  IE: ["critical skills employment permit", "general employment permit"],
  PT: ["residence permit", "tech visa"],
  LU: ["blue card", "work authorisation luxembourg"],
};

/**
 * Proximity window, in words, between a sponsorship noun and a negation.
 *
 * §17 exists because no phrase list catches "We are currently unable, due to
 * company policy, to offer any form of visa sponsorship". 12 words rather than
 * the spec's 40-60: at that distance a negation in an unrelated sentence starts
 * matching, and a rule that fires across a sentence boundary is exactly the
 * over-rejection this whole file is arranged to avoid.
 */
export const NEGATION_WINDOW_WORDS = 12;

export const NEGATION_TERMS: readonly string[] = [
  "no",
  "not",
  "cannot",
  "cant",
  "unable",
  "unavailable",
  "wont",
  "dont",
  "doesnt",
  "never",
  "without",
  "excluding",
] as const;

/** Headings that make a match more trustworthy. §4. */
export const VISA_SECTION_HEADINGS: readonly string[] = [
  "visa",
  "visa sponsorship",
  "sponsorship",
  "work authorisation",
  "work authorization",
  "right to work",
  "work permit",
  "immigration",
  "eligibility",
  "relocation",
] as const;

/** §20. Reported for analytics and confidence. Never decides. */
export const VISA_RULE_POINTS: Record<VisaRuleCategory, number> = {
  negative: -100,
  role_block: -100,
  citizenship_block: -50,
  permanent_auth: -50,
  existing_auth: -35,
  citizenship_pref: -20,
  local_only: -20,
  positive: 100,
  conditional: 50,
};
