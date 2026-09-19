import { Card, CardHeader } from "@/components/ui/base";
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

function TermList({ terms }: { terms: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {terms.map((t) => (
        <span
          key={t}
          className="rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[11px]"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export default function RulesPage() {
  const byTier = [5, 4, 3, 2, 1].map((tier) => ({
    tier,
    entries: WATCHLIST.filter((w) => w.tier === tier),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Gate rules</h1>
        <p className="mt-1 text-xs text-muted">
          Exactly what pre-qualification is running, read from the compiled
          configuration — not a copy of it. Changes go through code, which is
          what keeps a verdict reproducible.
        </p>
        <p className="mt-1.5 text-[11px] text-faint">
          Engine revision {ENGINE_REVISION} · config{" "}
          <span className="font-mono">{CONFIG_VERSION}</span>
        </p>
      </div>

      <Card>
        <CardHeader
          title="Domain keywords"
          meta={`Pass at ${DOMAIN_GATE.pass}, review at ${DOMAIN_GATE.review}`}
        />
        <div className="space-y-4 px-4 py-3">
          {DOMAIN_TIERS.map((tier) => (
            <div key={tier.id}>
              <p className="mb-1.5 text-xs font-semibold">
                {tier.label}
                <span className="ml-2 font-normal text-faint">
                  tier {tier.priority} · ×{tier.multiplier} · {tier.keywords.length} terms
                </span>
              </p>
              <TermList terms={tier.keywords} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Where a term counts for more"
          meta="Section weights"
        />
        <div className="px-4 py-3">
          <dl className="grid grid-cols-[12rem_1fr] gap-y-1 text-xs">
            {Object.entries(SECTION_WEIGHTS).map(([section, weight]) => (
              <div key={section} className="contents">
                <dt className="text-subtle">{section}</dt>
                <dd className="tabular-nums">×{String(weight)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Restricted terms"
          meta="Counted only in the right company"
        />
        <div className="space-y-2 px-4 py-3 text-xs">
          <p className="text-muted">
            These score nothing on their own. “Visa” is the reason the rule
            exists: this product searches for visa <em>sponsorship</em>, so the
            bare word would have scored a core-payments signal on a large share
            of exactly the jobs we want.
          </p>
          {RESTRICTED_TERMS.map((r) => (
            <div key={r.term} className="border-l-2 border-line-strong pl-2.5">
              <p className="font-mono text-[11px]">{r.term}</p>
              <p className="text-subtle">
                counts as {r.tier} only near: {(r.requiresNear ?? []).join(", ")}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Never a domain signal" meta="Negative terms" />
        <div className="px-4 py-3">
          <TermList terms={NEGATIVE_DOMAIN_TERMS} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Sponsorship watchlist"
          meta={`${WATCHLIST.length} companies · tier ${WATCHLIST_SKIP_SCORING_TIER}+ skips scoring`}
        />
        <div className="space-y-3 px-4 py-3">
          <p className="text-xs text-muted">
            A signal, never a filter — it cannot reject a job. A hit at tier{" "}
            {WATCHLIST_SKIP_SCORING_TIER} or above marks the application as
            gate-qualified and skips the scoring call.
          </p>
          {byTier.map(({ tier, entries }) =>
            entries.length === 0 ? null : (
              <div key={tier}>
                <p className="mb-1.5 text-xs font-semibold">
                  Tier {tier}
                  <span className="ml-2 font-normal text-faint">
                    {entries.length} ·{" "}
                    {tier >= WATCHLIST_SKIP_SCORING_TIER ? "unscored" : "still scored"}
                  </span>
                </p>
                <TermList terms={entries.map((e) => e.name)} />
              </div>
            ),
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Payments affinity"
          meta={`${PAYMENTS_AFFINITY.length} companies`}
        />
        <div className="space-y-3 px-4 py-3">
          <p className="text-xs text-muted">
            Softens a domain rejection where the posting simply does not spell
            out what the company does. Scoped to the domain filter — it never
            bypasses the gate.
          </p>
          {(["core", "significant"] as const).map((t) => (
            <div key={t}>
              <p className="mb-1.5 text-xs font-semibold">
                {t === "core" ? "Payments is the business" : "Has a payments arm"}
                <span className="ml-2 font-normal text-faint">
                  domain fail → {t === "core" ? "admitted, marked" : "review"}
                </span>
              </p>
              <TermList
                terms={PAYMENTS_AFFINITY.filter((a) => a.tier === t).map((a) => a.name)}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
