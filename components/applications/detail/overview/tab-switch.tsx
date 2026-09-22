"use client";

import type { ReactNode } from "react";

/**
 * A control that moves the reader to another tab of this screen.
 *
 * The design's Overview is a set of doors: "View the arithmetic →" opens
 * Analysis, a figure opens the tab that explains it. The tab state lives inside
 * `detail/tabs.tsx`, which is deliberately untouched here, so the door is
 * opened the same way a reader would open it — by clicking the tab itself,
 * found through the `aria-controls` contract the tab strip already publishes.
 *
 * That is why this is a button and not a link: there is no URL for a tab, and
 * inventing one would mean rebuilding the tab strip around routing.
 */
export function TabSwitch({
  to,
  children,
  className = "",
  title,
}: {
  /** The tab's id, e.g. "analysis" — matches `panel-<id>` on the tab panel. */
  to: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={className}
      onClick={() => {
        const tab = document.querySelector<HTMLButtonElement>(
          `[role="tab"][aria-controls="panel-${to}"]`,
        );
        tab?.click();
        tab?.scrollIntoView({ block: "nearest" });
      }}
    >
      {children}
    </button>
  );
}
