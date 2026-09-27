"use client";

import { useOptimistic, useTransition } from "react";

import { toggleStarAction } from "@/features/applications/actions";

/**
 * Star an application to come back to (JSV2S1173).
 *
 * Optimistic, because a bookmark that takes a server round trip to appear
 * stops feeling like a bookmark. The server is still the authority — if the
 * write fails the next render corrects it — but the star fills on click.
 *
 * Its own form per row rather than one shared with the table's other controls:
 * the row already carries an Apply link and a posting link, and a click target
 * this small sitting inside a larger form is how the wrong thing gets
 * submitted.
 */
export function StarButton({
  applicationId,
  starred,
  title,
}: {
  applicationId: string;
  starred: boolean;
  title: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(starred);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? `Unstar ${title}` : `Star ${title}`}
      title={optimistic ? "Starred — click to remove" : "Star to revisit later"}
      onClick={() => {
        const data = new FormData();
        data.set("applicationId", applicationId);
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleStarAction(data);
        });
      }}
      className="px-1 text-[15px] leading-none transition-colors"
      style={{ color: optimistic ? "var(--gold)" : "var(--faint)" }}
    >
      {optimistic ? "★" : "☆"}
    </button>
  );
}
