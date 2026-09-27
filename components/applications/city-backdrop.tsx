import type { City } from "@/config/cities";

/**
 * The city's photograph behind the whole table (JSV2S1172).
 *
 * Asked for over the top-band version: the banner only occupied the first
 * screenful, so scrolling a long table left it behind and the city stopped
 * being present. Fixed, so it stays.
 *
 * Built like `ArtworkBackdrop` on the detail screen, for the same reason and
 * with the same lesson learned: `pointer-events: none` so it can never
 * intercept a click, and a gradient over it heavy enough that contrast does
 * not depend on how bright the photograph is. The first artwork backdrop was
 * tuned at 11% under a 70% wash and was invisible; this one starts from a
 * value that can actually be seen and is dimmed by the gradient instead.
 */
export function CityBackdrop({ city }: { city: City }) {
  if (!city.hero && !city.card) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element -- built to size by
          scripts/build-city-images.mts and served locally; next/image would
          re-encode what sharp already encoded. */}
      <img
        src={city.hero || city.card}
        alt=""
        className="h-full w-full object-cover opacity-[0.55]"
      />
      {/*
        ONE wash, not two. The first attempt stacked a 70-100% gradient AND a
        flat 45% scrim over an image already at 30% opacity, which left roughly
        2% of the photograph visible — the third time in this project I have
        dimmed a backdrop out of existence by layering. The gradient alone
        carries the contrast; anything further is how it disappears.
      */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/35 via-background/72 to-background/88" />
    </div>
  );
}
