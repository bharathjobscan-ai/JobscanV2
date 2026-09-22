import Link from "next/link";

import type { CitySummary } from "@/features/applications/cities";

/**
 * The city landing grid (JSV2S1172).
 *
 * The workspace's front door: eight photographs, each carrying the one number
 * that decides whether you open it. Everything else on the card is context for
 * that number rather than competing with it.
 *
 * Ordered by what is actionable — see `getCitySummaries`. An alphabetical grid
 * would bury London behind Amsterdam on every single visit.
 */

function relative(at: Date | null): string {
  if (!at) return "never scanned";
  const hours = Math.round((Date.now() - at.getTime()) / 3_600_000);
  if (hours < 1) return "scanned just now";
  if (hours < 24) return `scanned ${hours}h ago`;
  return `scanned ${Math.round(hours / 24)}d ago`;
}

function CityCard({ summary, priority }: { summary: CitySummary; priority: boolean }) {
  const { city } = summary;
  const empty = summary.total === 0;

  return (
    <Link
      href={`/applications?city=${city.id}`}
      className="group relative block overflow-hidden rounded-xl border transition-colors"
      style={{ borderColor: "var(--n-border)", background: "var(--n-card)" }}
    >
      <div className="relative aspect-[3/2] w-full overflow-hidden">
        {/* The blur is inlined in the config, so the card has its colour before
            the photograph arrives rather than flashing a grey box. */}
        {city.blur ? (
          /* eslint-disable-next-line @next/next/no-img-element -- a 20px inline
             data URI; next/image cannot optimise it and would only add a loader. */
          <img
            src={city.blur}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl"
          />
        ) : null}

        {city.card ? (
          /* eslint-disable-next-line @next/next/no-img-element -- already built
             to exactly the size it renders at by scripts/build-city-images.mts,
             and served locally. next/image would re-encode what sharp already
             encoded and add a request per card. */
          <img
            src={city.card}
            alt=""
            loading={priority ? "eager" : "lazy"}
            className={`absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04] ${
              empty ? "opacity-45 saturate-50" : "opacity-95"
            }`}
          />
        ) : null}

        {/* Weighted to the foot, where the name and the number sit. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />

        {priority && !empty ? (
          <span
            className="absolute top-3 left-3 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] uppercase"
            style={{
              borderColor: "var(--n-gold)",
              color: "var(--n-gold)",
              background: "rgba(11,11,15,0.6)",
            }}
          >
            #1 Priority
          </span>
        ) : null}

        <span
          className="absolute top-3 right-3 grid size-8 place-items-center rounded-full border text-sm transition-transform group-hover:translate-x-0.5"
          style={{
            borderColor: "rgba(229,228,226,0.35)",
            color: "var(--n-text)",
            background: "rgba(11,11,15,0.45)",
          }}
          aria-hidden
        >
          →
        </span>

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
          <div>
            <h2 className="n-display text-3xl leading-none" style={{ color: "var(--n-text)" }}>
              {city.name}
            </h2>
            <p
              className="mt-1.5 text-[10px] font-medium tracking-[0.18em] uppercase"
              style={{ color: "var(--n-text-dim)" }}
            >
              {city.country}
            </p>
            <p className="mt-3 flex items-baseline gap-2">
              <span
                className="n-display text-4xl leading-none"
                style={{ color: empty ? "var(--n-text-dim)" : "var(--n-text)" }}
              >
                {summary.readyToday}
              </span>
              <span
                className="text-[10px] font-medium tracking-[0.16em] uppercase"
                style={{ color: "var(--n-text-dim)" }}
              >
                ready today
              </span>
            </p>
          </div>

          {summary.bestScore !== null ? (
            <div className="flex flex-col items-center gap-1">
              <span
                className="n-display grid size-12 place-items-center rounded-full border text-lg"
                style={{
                  borderColor: "var(--n-gold)",
                  color: "var(--n-gold)",
                  background: "rgba(11,11,15,0.55)",
                }}
              >
                {summary.bestScore}
              </span>
              <span
                className="text-[9px] font-medium tracking-[0.16em] uppercase"
                style={{ color: "var(--n-text-dim)" }}
              >
                best
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="flex items-center gap-3 px-4 py-2.5 text-[11px]"
        style={{ color: "var(--n-text-dim)", borderTop: "1px solid var(--n-border)" }}
      >
        <span>{summary.inPlay} in play</span>
        <span style={{ color: "var(--n-border)" }}>|</span>
        <span>{summary.fresh} new</span>
        <span style={{ color: "var(--n-border)" }}>|</span>
        <span className="n-mono">{relative(summary.lastSeenAt)}</span>
      </div>
    </Link>
  );
}

export function CityGrid({ summaries }: { summaries: CitySummary[] }) {
  const tracked = summaries.reduce((n, s) => n + s.total, 0);

  return (
    <div
      data-surface="nocturne"
      className="n-bleed -my-6 min-h-screen px-8 py-10 xl:px-14"
    >
      <header className="mb-8">
        <h1 className="n-display text-5xl leading-none" style={{ color: "var(--n-text)" }}>
          Applications
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--n-text-dim)" }}>
          {tracked} tracked across {summaries.length} target cities. Open a city to
          work its table.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {summaries.map((s, i) => (
          <CityCard key={s.city.id} summary={s} priority={i === 0} />
        ))}
      </div>

      <footer
        className="mt-10 border-t pt-4 text-[11px]"
        style={{ borderColor: "var(--n-border)", color: "var(--n-text-dim)" }}
      >
        Cities follow the nightly fetch plan — add a location and its card appears.
      </footer>
    </div>
  );
}
