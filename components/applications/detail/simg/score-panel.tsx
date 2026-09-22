import { TARGET_DOCUMENT_SCORE } from "@/config/simg";
import type { SimgProjection } from "@/features/simg/apply";

/**
 * The SimG score panel: where the document stands, and where accepting the
 * rest of the worklist would put it (JSV2S1126).
 *
 * Two figures and the arrow between them, because the whole worklist is an
 * argument about that one gap. Every number is `SimgProjection`, computed
 * server-side — nothing here is derived from the model's own claims.
 */
export function SimgScorePanel({ projection }: { projection: SimgProjection }) {
  const delta = projection.potential - projection.current;
  const reached = projection.current >= TARGET_DOCUMENT_SCORE;
  const wouldReach = projection.potential >= TARGET_DOCUMENT_SCORE;

  return (
    <div className="rounded-md border border-line bg-surface px-5 py-4">
      <div className="flex items-end gap-5">
        <div>
          <p className="text-[10px] tracking-[0.13em] text-faint uppercase">
            Current score
          </p>
          <p
            className={`n-display mt-1 text-[38px] leading-none font-semibold tabular-nums ${
              reached ? "text-positive" : ""
            }`}
          >
            {projection.current}
          </p>
        </div>

        <div className="pb-2.5 text-center">
          <span aria-hidden className="block text-[16px] text-faint">
            →
          </span>
          {delta > 0 ? (
            <span className="mt-0.5 block text-[11.5px] text-positive tabular-nums">
              +{delta} point{delta === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <div>
          <p className="text-[10px] tracking-[0.13em] text-faint uppercase">
            Projected score
          </p>
          <p
            className={`n-display mt-1 text-[38px] leading-none font-semibold tabular-nums ${
              wouldReach ? "text-positive" : ""
            }`}
          >
            {projection.potential}
          </p>
        </div>
      </div>

      <p className="mt-3 max-w-[34ch] border-t border-line pt-2.5 text-[11.5px] text-faint italic">
        {delta > 0
          ? `Projected assumes every pending edit is accepted. Target ${TARGET_DOCUMENT_SCORE}; the master resume scored ${projection.baseline}.`
          : `Nothing pending. Target ${TARGET_DOCUMENT_SCORE}; the master resume scored ${projection.baseline}.`}
      </p>
    </div>
  );
}
