import type { ResolvedArtwork } from "@/features/artwork/resolve";

/**
 * The location's painting, behind the workspace (JSV2S1143).
 *
 * Fixed, low-opacity and `pointer-events: none` — it must never intercept a
 * click or compete with the text. The gradient over it keeps contrast constant
 * regardless of how light or busy the painting is, which matters because these
 * range from Hammershøi's greys to Klimt's gold.
 *
 * Served from `/public`, fetched once by `scripts/fetch-artwork.mts`. No
 * third-party request at render time, so a Wikimedia outage cannot affect the
 * page and no viewer's browser calls out anywhere.
 */
export function ArtworkBackdrop({ artwork }: { artwork: ResolvedArtwork }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element -- a decorative
          local asset; next/image would add a loader for no benefit here. */}
      <img
        src={artwork.src}
        alt=""
        /**
         * Tuned per theme, by eye, after two attempts that could not be seen.
         *
         * The original borrowed `mix-blend-luminosity` at 11% from the dark
         * Nocturnal design. That blend takes the painting's luminance and the
         * page's colour, so on ANY background it returns greyscale — and 11% of
         * greyscale over a near-black page is black. Raising the opacity under
         * the blend did not help, because the blend was the problem: it is gone
         * from both themes now.
         *
         * Dark also needs the painting lifted, not dimmed. Compositing at 50%
         * over #0c0a09 halves every value, and most of these canvases are dark
         * to begin with, so brightness is pushed back up rather than the
         * opacity being driven toward opaque.
         */
        className="h-full w-full object-cover opacity-[0.52] [filter:saturate(1.15)_contrast(1.04)] dark:opacity-[0.55] dark:mix-blend-normal dark:[filter:saturate(1.1)_brightness(1.35)]"
      />
      {/*
        Weighted to the bottom. The hero text sits in the upper third, so the
        wash is lightest where the painting is and heaviest where the reading
        happens — rather than uniformly erasing it as the first version did.
      */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background dark:via-background/45" />
    </div>
  );
}

/** The credit line. Small, factual, and honest about a fallback. */
export function ArtworkCredit({ artwork }: { artwork: ResolvedArtwork }) {
  return (
    <p className="text-[11px] text-subtle">
      <span className="text-muted">{artwork.title}</span>
      {" · "}
      {artwork.artist}, {artwork.year}
      {artwork.via !== "city" ? (
        <span className="text-faint">
          {" · "}
          {artwork.via === "country" ? "chosen by country" : "no location given"}
        </span>
      ) : null}
      <span className="block text-faint">{artwork.note}</span>
    </p>
  );
}
