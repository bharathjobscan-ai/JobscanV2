"use client";

import { useState } from "react";

/**
 * A single date-range calendar (JSV2S1153).
 *
 * One control, two clicks: the first sets the start, the second sets the end —
 * the pattern every flight booking uses, and the one the owner asked for. Two
 * separate date inputs make a range feel like two unrelated facts and let you
 * submit an end before its start.
 *
 * Written rather than pulled in: a dependency for one calendar is weight on
 * every page, and the interaction is a month grid and two pieces of state.
 */

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Local YYYY-MM-DD. `toISOString()` is UTC and shifts the day for most of the world. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function parse(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Days to render, padded so the first of the month lands on the right weekday. */
function monthGrid(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  // getDay() is Sunday-first; this grid is Monday-first.
  const lead = (first.getDay() + 6) % 7;
  const days: (Date | null)[] = Array.from({ length: lead }, () => null);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let i = 1; i <= last; i++) {
    days.push(new Date(month.getFullYear(), month.getMonth(), i));
  }
  return days;
}

const MONTH_FMT = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const SHORT_FMT = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

export function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
}) {
  const start = parse(from);
  const end = parse(to);
  const [month, setMonth] = useState(() => startOfMonth(start ?? new Date()));
  /** Previewed end while the pointer moves between the two clicks. */
  const [hover, setHover] = useState<Date | null>(null);

  const selecting = start !== null && end === null;
  const previewEnd = selecting ? hover : null;

  function pick(day: Date) {
    // Third click starts a fresh range rather than extending the old one.
    if (!start || end) {
      onChange(iso(day), null);
      return;
    }
    // Clicking before the start reinterprets it as the new start, which is
    // kinder than rejecting the click.
    if (day < start) {
      onChange(iso(day), null);
      return;
    }
    onChange(iso(start), iso(day));
  }

  const inRange = (day: Date) => {
    const finish = end ?? previewEnd;
    if (!start || !finish) return false;
    return day > start && day < finish;
  };

  const isEdge = (day: Date) =>
    (start !== null && iso(day) === iso(start)) || (end !== null && iso(day) === iso(end));

  const label =
    start && end
      ? `${SHORT_FMT.format(start)} – ${SHORT_FMT.format(end)}`
      : start
        ? `${SHORT_FMT.format(start)} – select end`
        : "Any date";

  return (
    <div className="w-[17rem]">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        {start ? (
          <button
            type="button"
            onClick={() => {
              onChange(null, null);
              setHover(null);
            }}
            className="text-[11px] text-muted hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="rounded-md border border-line p-2">
        <div className="mb-1.5 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="rounded px-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            ‹
          </button>
          <span className="text-xs font-medium">{MONTH_FMT.format(month)}</span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="rounded px-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-center">
          {DAY_LABELS.map((d) => (
            <span key={d} className="py-0.5 text-[10px] text-faint">
              {d}
            </span>
          ))}

          {monthGrid(month).map((day, i) =>
            day === null ? (
              <span key={`pad-${i}`} />
            ) : (
              <button
                key={iso(day)}
                type="button"
                onClick={() => pick(day)}
                onMouseEnter={() => selecting && setHover(day)}
                className={[
                  "rounded py-1 text-[11px] tabular-nums",
                  isEdge(day)
                    ? "bg-foreground font-medium text-background"
                    : inRange(day)
                      ? "bg-surface-muted"
                      : "hover:bg-surface-muted",
                ].join(" ")}
              >
                {day.getDate()}
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
