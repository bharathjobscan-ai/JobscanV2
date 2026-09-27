import type { ReactNode } from "react";

/**
 * The rounded icon tile the Nocturnal detail design puts at the top left of
 * every Material card (JSV2S1172).
 *
 * A glyph, not an icon set: the app has no icon dependency and is not adding
 * one for six marks. `aria-hidden` throughout — the tile is decoration, and
 * every card states its own subject in text beside it.
 */
export function IconTile({
  glyph,
  tone = "gold",
  size = "md",
}: {
  glyph: ReactNode;
  /** Gold for material the app produces, slate for tools acting on it. */
  tone?: "gold" | "slate";
  size?: "md" | "sm";
}) {
  const colour = tone === "gold" ? "var(--gold)" : "var(--slate)";
  const box = size === "sm" ? "size-8 text-[14px]" : "size-9 text-[16px]";
  return (
    <span
      aria-hidden
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded-lg leading-none`}
      style={{
        color: colour,
        background: `color-mix(in srgb, ${colour} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${colour} 28%, transparent)`,
      }}
    >
      {glyph}
    </span>
  );
}
