import { TabSwitch } from "./tab-switch";

/**
 * The four figures, calm and evenly weighted (JSV2S1172).
 *
 * Deliberately not cards: hairlines between columns rather than boxes, so they
 * read as one row of facts underneath the verdict rather than four competing
 * claims beside it. Each figure that has somewhere to go is a button into the
 * tab that explains it — the design's arrow on the sub-label is the promise
 * that clicking shows the working.
 *
 * Every figure here is measured. Where the design showed a figure this system
 * does not hold, the figure is dropped rather than filled with a plausible
 * number: see `page.tsx`, which builds them.
 */

export type Figure = {
  label: string;
  value: string;
  /** The line under the figure. The arrow is added when `to` is set. */
  hint?: string;
  tone?: "positive" | "warning" | "negative" | "accent";
  hintTone?: "positive" | "warning" | "negative";
  /** Tab id this figure explains, e.g. "analysis". */
  to?: string;
};

const TONE: Record<NonNullable<Figure["tone"]>, string> = {
  positive: "text-positive",
  warning: "text-warning",
  negative: "text-negative",
  accent: "text-accent",
};

function Body({ figure }: { figure: Figure }) {
  return (
    <>
      <span className="block text-[10px] tracking-[0.14em] text-faint uppercase">
        {figure.label}
      </span>
      <span
        className={`n-display mt-1.5 block text-[21px] leading-tight font-semibold tabular-nums ${
          figure.tone ? TONE[figure.tone] : ""
        }`}
      >
        {figure.value}
      </span>
      {figure.hint ? (
        <span
          className={`mt-0.5 block text-[11.5px] tabular-nums ${
            figure.hintTone ? TONE[figure.hintTone] : "text-faint"
          }`}
        >
          {figure.hint}
          {figure.to ? " →" : ""}
        </span>
      ) : null}
    </>
  );
}

export function FigureRow({ figures }: { figures: Figure[] }) {
  return (
    <div
      className="grid border-y border-line"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
    >
      {figures.map((figure, i) => {
        const cell = `px-4 py-5 text-left ${i === 0 ? "pl-0" : "border-l border-line"}`;
        return figure.to ? (
          <TabSwitch
            key={figure.label}
            to={figure.to}
            title={`Open ${figure.to}`}
            className={`${cell} cursor-pointer transition-colors hover:bg-surface/60`}
          >
            <Body figure={figure} />
          </TabSwitch>
        ) : (
          <div key={figure.label} className={cell}>
            <Body figure={figure} />
          </div>
        );
      })}
    </div>
  );
}
