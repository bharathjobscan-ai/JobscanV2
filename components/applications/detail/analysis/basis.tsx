/**
 * What carries the application, and what holds it back.
 *
 * Two columns rather than one list, because "strong domain match" and "no visa
 * evidence" are not the same kind of fact and reading them interleaved makes
 * neither land.
 *
 * The design bolds a short head and sets the explanation under it. ScoreG
 * writes each item as one sentence, so the head is taken from the sentence's
 * own first clause where it has one — split on a dash or a colon, never on a
 * full stop, which would leave a head that is already a whole claim. Where
 * there is no such break the whole line is the head and there is no body: the
 * alternative is inventing a summary of a sentence we were given.
 */

function split(item: string): { head: string; body?: string } {
  const match = item.match(/^([\s\S]{4,72}?)\s*(?:—|–|:)\s+([\s\S]+)$/);
  if (!match) return { head: item };
  return { head: match[1], body: match[2] };
}

function Column({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "positive" | "negative";
}) {
  const colour = tone === "positive" ? "var(--emerald)" : "var(--negative)";
  return (
    <div>
      <p
        className="border-b border-line pb-2 text-[10px] tracking-[0.14em] uppercase"
        style={{ color: colour }}
      >
        {title}
      </p>
      {items.map((item, i) => {
        const { head, body } = split(item);
        return (
          <div
            key={i}
            className="grid grid-cols-[8px_minmax(0,1fr)] gap-3 border-b py-3"
            style={{ borderColor: "var(--hair)" }}
          >
            <span
              aria-hidden
              className="mt-[7px] size-[5px] rounded-full"
              style={{ background: colour }}
            />
            <span className="min-w-0">
              <span className="block text-[14px]">{head}</span>
              {body ? (
                <span className="mt-1 block text-[13px] text-muted">{body}</span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Basis({
  holding,
  failing,
}: {
  holding: string[];
  failing: string[];
}) {
  if (holding.length === 0 && failing.length === 0) return null;

  return (
    <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
      {holding.length > 0 ? (
        <Column title="What carries this application" items={holding} tone="positive" />
      ) : null}
      {failing.length > 0 ? (
        <Column title="What holds it back" items={failing} tone="negative" />
      ) : null}
    </div>
  );
}
