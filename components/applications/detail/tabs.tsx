"use client";

import { useState, type ReactNode } from "react";

export type DetailTab = {
  id: string;
  label: string;
  /** A count or a figure, so the strip says what is behind each tab. */
  meta?: string;
  content: ReactNode;
};

/**
 * The detail screen's tab strip (JSV2S1172).
 *
 * The screen carries six distinct readings of one application, and the design
 * separates them rather than stacking them: the score, the material, SimG, the
 * arithmetic, the reference detail and the audit trail.
 *
 * Every panel is RENDERED and hidden with `hidden`, never unmounted. Two
 * reasons: an in-flight server action inside a panel (accepting a SimG edit,
 * saving a referral) must not be thrown away by switching tab, and the page's
 * whole content stays in the HTML where a text search can still find it.
 */
export function DetailTabs({ tabs, initial }: { tabs: DetailTab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);

  return (
    <>
      <div
        role="tablist"
        aria-label="Application detail"
        className="sticky top-[62px] z-20 flex gap-1 overflow-x-auto border-b border-line bg-background/85 backdrop-blur"
      >
        {tabs.map((tab) => {
          const on = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={`flex items-baseline gap-2 border-b-2 px-3 py-3 text-[13px] whitespace-nowrap transition-colors ${
                on
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.meta ? (
                <span className="n-mono text-[11px] text-faint">{tab.meta}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          hidden={tab.id !== active}
          className="pt-7 pb-16"
        >
          {tab.content}
        </div>
      ))}
    </>
  );
}
