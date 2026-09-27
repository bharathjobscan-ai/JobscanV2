import type { ReactNode } from "react";

import {
  DOMAIN_GATE,
  DOMAIN_TIERS,
  NEGATIVE_DOMAIN_TERMS,
  RESTRICTED_TERMS,
  SECTION_WEIGHTS,
  CONFIG_VERSION,
  ENGINE_REVISION,
} from "@/config/prequalification";
import { PAYMENTS_AFFINITY } from "@/config/companies/payments-core";
import { WATCHLIST, WATCHLIST_SKIP_SCORING_TIER } from "@/config/companies/watchlist";

export const dynamic = "force-dynamic";

/**
 * What the gate is actually running (JSV2S1163).
 *
 * READ-ONLY, DELIBERATELY. The keywords live in `config/prequalification/` as
 * code, and `CONFIG_VERSION` hashes them together with `ENGINE_REVISION`. That
 * hash is what makes a verdict reproducible and what tells `requalifyStale`
 * which jobs deserve another look. Moving the set into database rows breaks all
 * three unless the keyword set is itself versioned and stamped on every
 * verdict — so the editable version is a real feature with a real cost, not a
 * text box, and this screen is the half that is worth having today.
 *
 * The owner has asked for the editable version later. When it comes, it needs:
 * a versioned keyword set, `keywordSetVersion` on every verdict, and an
 * automatic re-qualification on change.
 */

/** A headline count of what the compiled configuration contains. */
function RuleStat({ value, label, note }: { value: number; label: string; note: string }) {
  return (
    <div className="border-t border-line pt-3">
      <div className="n-display text-[28px] leading-none font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[13px]">{label}</div>
      <div className="mt-0.5 text-xs text-subtle">{note}</div>
    </div>
  );
}

/**
 * One rule, collapsed to a line.
 *
 * The design puts every rule group behind a `<details>`: the page is a
 * reference, so what matters at rest is which rules exist and how big each
 * one is, not six hundred keywords at once.
 */
function RuleGroup({
  name,
  rule,
  count,
  blurb,
  open = false,
  children,
}: {
  name: string;
  rule: string;
  count: string;
  blurb: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="border-b border-line">
      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-[18px] sm:grid-cols-[minmax(0,1fr)_auto_auto] [&::-webkit-details-marker]:hidden">
        <span className="n-display text-xl font-semibold">{name}</span>
        <span className="hidden text-[12.5px] whitespace-nowrap text-muted sm:block">{rule}</span>
        <span className="n-mono text-[12.5px] whitespace-nowrap text-subtle">{count}</span>
      </summary>
      <div className="pb-[22px]">
        <p className="mb-3.5 max-w-[76ch] text-[13.5px] text-muted">{blurb}</p>
        {children}
      </div>
    </details>
  );
}

/** A set of terms inside a rule: a heading line, then the terms themselves. */
function Tier({
  name,
  meta,
  terms,
}: {
  name: string;
  meta: string;
  terms: readonly string[];
}) {
  return (
    <div className="mb-3.5">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-[13px]" style={{ color: "var(--platinum)" }}>
          {name}
        </span>
        <span className="n-mono text-[11.5px] text-subtle">{meta}</span>
      </div>
      {terms.length > 0 ? (
        <p className="n-mono mt-1.5 text-[13px] leading-[1.7] text-muted">{terms.join(" · ")}</p>
      ) : null}
    </div>
  );
}

export default function RulesPage() {
  const byTier = [5, 4, 3, 2, 1].map((tier) => ({
    tier,
    entries: WATCHLIST.filter((w) => w.tier === tier),
  }));

  const domainTerms = DOMAIN_TIERS.reduce((n, t) => n + t.keywords.length, 0);

  return (
    <div className="mx-auto max-w-[1060px]">
      <h1 className="n-display text-[38px] leading-tight font-normal tracking-[-0.02em]">
        Gate rules
      </h1>
      <p className="mt-1.5 max-w-[66ch] text-sm text-muted">
        Exactly what pre-qualification is running, read from the compiled
        configuration — not a copy of it. Changes go through code, which is what
        keeps a verdict reproducible.
      </p>
      <p className="n-mono mt-2 text-xs text-subtle">
        Engine revision {ENGINE_REVISION} · config {CONFIG_VERSION}
      </p>

      <div className="mt-8 grid gap-x-6 gap-y-5 sm:grid-cols-3">
        <RuleStat
          value={domainTerms}
          label="Domain keywords"
          note={`${DOMAIN_TIERS.length} tiers · pass at ${DOMAIN_GATE.pass}`}
        />
        <RuleStat
          value={WATCHLIST.length}
          label="Watchlisted companies"
          note={`tier ${WATCHLIST_SKIP_SCORING_TIER}+ skips scoring`}
        />
        <RuleStat
          value={PAYMENTS_AFFINITY.length}
          label="Payments affinity"
          note="softens a domain rejection"
        />
      </div>

      <div className="mt-10 border-t border-line">
        <RuleGroup
          name="Domain keywords"
          rule={`Pass at ${DOMAIN_GATE.pass}, review at ${DOMAIN_GATE.review}`}
          count={`${domainTerms} terms`}
          blurb="Each tier carries a multiplier. A posting's domain score is the weighted sum of what it matches, and the two thresholds decide pass, review or reject."
          open
        >
          {DOMAIN_TIERS.map((tier) => (
            <Tier
              key={tier.id}
              name={tier.label}
              meta={`tier ${tier.priority} · ×${tier.multiplier} · ${tier.keywords.length} terms`}
              terms={tier.keywords}
            />
          ))}
        </RuleGroup>

        <RuleGroup
          name="Where a term counts for more"
          rule="Section weights"
          count={`${Object.keys(SECTION_WEIGHTS).length} sections`}
          blurb="The same word is worth more in a title than in a benefits list, so a match is multiplied by the section it was found in."
        >
          <dl className="grid max-w-md grid-cols-[12rem_1fr] gap-y-1 text-[13px]">
            {Object.entries(SECTION_WEIGHTS).map(([section, weight]) => (
              <div key={section} className="contents">
                <dt className="text-muted">{section}</dt>
                <dd className="n-mono tabular-nums">×{String(weight)}</dd>
              </div>
            ))}
          </dl>
        </RuleGroup>

        <RuleGroup
          name="Restricted terms"
          rule="Counted only in the right company"
          count={`${RESTRICTED_TERMS.length} terms`}
          blurb="These score nothing on their own. “Visa” is the reason the rule exists: this product searches for visa sponsorship, so the bare word would have scored a core-payments signal on a large share of exactly the jobs we want."
        >
          {RESTRICTED_TERMS.map((r) => (
            <Tier
              key={r.term}
              name={r.term}
              meta={`counts as ${r.tier} only near`}
              terms={r.requiresNear ?? []}
            />
          ))}
        </RuleGroup>

        <RuleGroup
          name="Never a domain signal"
          rule="Negative terms"
          count={`${NEGATIVE_DOMAIN_TERMS.length} terms`}
          blurb="Matched and then discarded — these words appear in payments postings often enough to look like signal, and are not."
        >
          <Tier name="Excluded outright" meta="no score, any section" terms={NEGATIVE_DOMAIN_TERMS} />
        </RuleGroup>

        <RuleGroup
          name="Sponsorship watchlist"
          rule={`Tier ${WATCHLIST_SKIP_SCORING_TIER}+ skips scoring`}
          count={`${WATCHLIST.length} companies`}
          blurb="A signal, never a filter — it cannot reject a job. A hit at the skip tier or above marks the application gate-qualified and saves the scoring call."
        >
          {byTier.map(({ tier, entries }) =>
            entries.length === 0 ? null : (
              <Tier
                key={tier}
                name={`Tier ${tier}`}
                meta={`${entries.length} · ${
                  tier >= WATCHLIST_SKIP_SCORING_TIER ? "unscored" : "still scored"
                }`}
                terms={entries.map((e) => e.name)}
              />
            ),
          )}
        </RuleGroup>

        <RuleGroup
          name="Payments affinity"
          rule="Scoped to the domain filter"
          count={`${PAYMENTS_AFFINITY.length} companies`}
          blurb="Softens a domain rejection where the posting simply does not spell out what the company does. It never bypasses the gate."
        >
          {(["core", "significant"] as const).map((t) => (
            <Tier
              key={t}
              name={t === "core" ? "Payments is the business" : "Has a payments arm"}
              meta={`domain fail → ${t === "core" ? "admitted, marked" : "review"}`}
              terms={PAYMENTS_AFFINITY.filter((a) => a.tier === t).map((a) => a.name)}
            />
          ))}
        </RuleGroup>
      </div>
    </div>
  );
}
