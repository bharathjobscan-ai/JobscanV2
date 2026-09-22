"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The city list's filter panel (JSV2S1172), transcribed from the design.
 *
 * Inline rather than floating: it opens between the tabs and the table and
 * pushes the table down. A popover this tall would cover the very rows you are
 * deciding which filters to set, and the design draws it as part of the page
 * for exactly that reason.
 *
 * Nothing applies until Apply is pressed — ticking five things should cost one
 * query, not five — and everything applied lives in the URL, so a filtered view
 * is linkable and the back button works. The component holds draft state only.
 *
 * `/review` still uses the generic `components/ui/filter-panel.tsx`; this is a
 * second implementation on purpose, because the two screens now want different
 * shapes and generalising over them would fossilise both.
 */

export type FacetValue = { value: string; label: string; count: number };

/** The parameter names this panel owns in the URL. */
export type CityFilterState = {
  q: string;
  uploaded: string;
  posted: string;
  fetch: string;
  location: string;
  visa: string;
  tier: string;
  minJob: string;
  minResume: string;
};

const EMPTY: CityFilterState = {
  q: "",
  uploaded: "",
  posted: "",
  fetch: "",
  location: "",
  visa: "",
  tier: "",
  minJob: "",
  minResume: "",
};

const DATE_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "3d", label: "Past 3 days" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
];

const TIER_OPTIONS = [
  { value: "", label: "Any company" },
  { value: "5", label: "★ Tier 5" },
  { value: "4", label: "★ Tier 4 and above" },
  { value: "3", label: "Tier 3 and above" },
  { value: "none", label: "Not on watchlist" },
];

const FIELD =
  "w-full rounded-md border border-line bg-transparent px-2.5 py-2 text-[13px] text-foreground outline-none focus:border-accent";

function Label({ children }: { children: string }) {
  return (
    <span
      className="mb-1.5 block text-[10px] font-medium tracking-[0.16em] uppercase"
      style={{ color: "var(--faint)" }}
    >
      {children}
    </span>
  );
}

function Count({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span
      className="rounded-full px-1.5 py-px text-[10px] leading-4 font-medium tabular-nums text-white"
      style={{ backgroundColor: "var(--blue)" }}
    >
      {n}
    </span>
  );
}

/** A facet value the current city cannot return is not offered at all. */
function options(any: string, facet: FacetValue[] | undefined) {
  return [
    { value: "", label: any },
    ...(facet ?? []).map((f) => ({
      value: f.value,
      label: `${f.label} (${f.count})`,
    })),
  ];
}

function Select({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={FIELD}
      >
        {items.map((o) => (
          <option key={o.value} value={o.value} style={{ color: "#111" }}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ScoreRange({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const n = Number(value) || 0;
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2.5">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={n}
          aria-label={label}
          onChange={(e) => onChange(e.target.value === "0" ? "" : e.target.value)}
          className="h-1 flex-1 cursor-pointer accent-[var(--gold)]"
        />
        <input
          type="number"
          min={0}
          max={100}
          value={n}
          aria-label={`${label} value`}
          onChange={(e) => onChange(e.target.value === "0" ? "" : e.target.value)}
          className="n-mono w-14 rounded-md border border-line bg-transparent px-2 py-1 text-center text-[13px] outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}

export function CityFilters({
  cityId,
  view,
  facets,
  initial,
}: {
  cityId: string;
  /** Kept across an Apply — losing the tab on every filter change reads as a bug. */
  view?: string;
  facets: Record<string, FacetValue[] | undefined>;
  initial: CityFilterState;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CityFilterState>(initial);

  const set = (key: keyof CityFilterState) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Counted from what is applied, not from the draft: the badge on a closed
  // pill has to describe the table underneath it.
  const activeCount = Object.values(initial).filter((v) => v !== "").length;

  function apply() {
    const params = new URLSearchParams({ city: cityId });
    if (view) params.set("view", view);
    for (const [key, value] of Object.entries(draft)) {
      if (value.trim()) params.set(key, value.trim());
    }
    router.push(`/applications?${params.toString()}`);
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-surface"
          style={{ borderColor: open ? "var(--blue)" : "var(--hair)" }}
        >
          <span style={{ color: "var(--slate)" }}>⛉</span>
          Filters
          <Count n={activeCount} />
          <span style={{ color: "var(--faint)" }}>{open ? "⌃" : "⌄"}</span>
        </button>
      </div>

      {open ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span style={{ color: "var(--slate)" }}>⛉</span>
                <span className="n-display text-lg leading-none">Filters</span>
                <Count n={activeCount} />
              </div>
              <p className="mt-1.5 text-[11px]" style={{ color: "var(--faint)" }}>
                Refine jobs to find the right opportunities
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDraft(EMPTY)}
              className="text-[11px] underline-offset-2 hover:underline"
              style={{ color: "var(--slate)" }}
            >
              Reset all
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <Label>SEARCH</Label>
              <input
                value={draft.q}
                onChange={(e) => set("q")(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && apply()}
                placeholder="Role or company"
                className={FIELD}
              />
            </label>
            <Select
              label="DATE UPLOADED"
              value={draft.uploaded}
              onChange={set("uploaded")}
              items={DATE_OPTIONS}
            />
            <Select
              label="DATE POSTED"
              value={draft.posted}
              onChange={set("posted")}
              items={DATE_OPTIONS}
            />
            <Select
              label="FETCH ID"
              value={draft.fetch}
              onChange={set("fetch")}
              items={options("Any fetch", facets.fetch)}
            />

            <Select
              label="LOCATION"
              value={draft.location}
              onChange={set("location")}
              items={options("Any location", facets.location)}
            />
            <Select
              label="VISA STATUS"
              value={draft.visa}
              onChange={set("visa")}
              items={options("Any", facets.visa)}
            />
            <Select
              label="WATCHLIST TIER"
              value={draft.tier}
              onChange={set("tier")}
              items={TIER_OPTIONS}
            />
            <div className="hidden lg:block" />

            <ScoreRange
              label="JOB SCORE, MIN"
              value={draft.minJob}
              onChange={set("minJob")}
            />
            <ScoreRange
              label="RESUME SCORE, MIN"
              value={draft.minResume}
              onChange={set("minResume")}
            />

            <div className="flex items-end justify-end gap-2 sm:col-span-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(initial);
                  setOpen(false);
                }}
                className="rounded-md px-3 py-2 text-xs font-medium text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                className="rounded-md px-4 py-2 text-xs font-medium"
                style={{ backgroundColor: "var(--gold)", color: "#1a1408" }}
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
