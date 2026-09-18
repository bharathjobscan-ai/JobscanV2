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
         * Tuned for BOTH themes, after the first attempt was invisible.
         *
         * It carried `mix-blend-luminosity` at 11% opacity, borrowed from the
         * dark Nocturnal design. Over this app's near-white background that
         * blend yields greyscale, 11% of which is nothing — and a 70-100%
         * background gradient then finished the job. The painting was loading
         * correctly the whole time and simply could not be seen.
         *
         * Light needs far more opacity because the image is competing with
         * white, and the sepia wash was costing it colour it could not spare —
         * so light now runs at 38% unsepiaed under a much lighter top gradient.
         * Dark needs less, and luminosity earns its place there by keeping the
         * painting from tinting the page.
         */
        className="h-full w-full object-cover opacity-[0.38] [filter:saturate(1.15)_contrast(1.04)] dark:opacity-[0.16] dark:mix-blend-luminosity dark:[filter:none]"
      />
      {/*
        Weighted to the bottom. The hero text sits in the upper third, so the
        wash is lightest where the painting is and heaviest where the reading
        happens — rather than uniformly erasing it as the first version did.
      */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/5 via-background/55 to-background dark:from-background/30 dark:via-background/65" />
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
