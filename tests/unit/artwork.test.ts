import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { allArtwork, CITY_ARTWORK, COUNTRY_ARTWORK, DEFAULT_ARTWORK_KEY } from "@/config/artwork";
import { resolveArtwork } from "@/features/artwork/resolve";

/** JSV2S1143 — city, then country, then default. Deterministic, offline. */
describe("resolveArtwork", () => {
  it("matches the city first", () => {
    const art = resolveArtwork({ location: "London, England, United Kingdom" });
    expect(art.via).toBe("city");
    expect(art.title).toBe("The Fighting Temeraire");
  });

  it("uses the alias list shared with pre-qualification", () => {
    // "Lisboa" is how the location config spells it; a posting may say Lisbon.
    expect(resolveArtwork({ location: "Lisbon, Portugal" }).id).toBe(
      resolveArtwork({ location: "Lisboa, Portugal" }).id,
    );
    expect(resolveArtwork({ location: "München, Deutschland" }).id).toBe(
      "munich-blue-horse",
    );
  });

  it("falls back to the country when the city is unknown", () => {
    const art = resolveArtwork({ location: "Nowheresville", country: "Germany" });
    expect(art.via).toBe("country");
    expect(art.id).toBe("berlin-wanderer");
  });

  it("reads the country from the tail of the location when none is given", () => {
    const art = resolveArtwork({ location: "Some Town, Netherlands" });
    expect(art.via).toBe("country");
    expect(art.id).toBe("amsterdam-nightwatch");
  });

  it("falls back to the default rather than guessing", () => {
    const art = resolveArtwork({ location: "Remote", country: null });
    expect(art.via).toBe("default");
    expect(art.id).toBe(CITY_ARTWORK[DEFAULT_ARTWORK_KEY].id);
  });

  it("defaults to a non-European work, so a placeless job is not disguised", () => {
    // A remote job with no geography must not silently look like a London one.
    expect(resolveArtwork({}).artist).toBe("Katsushika Hokusai");
  });

  it("respects word boundaries — Cambridge is not Cambridgeshire", () => {
    // The location config lists Cambridge; a substring match would fire here
    // and quietly attach the wrong city's painting.
    const art = resolveArtwork({ location: "Cambridgeshire, United Kingdom" });
    expect(art.via).toBe("country");
  });

  it("is stable — the same job always gets the same painting", () => {
    const input = { location: "Paris, Île-de-France, France" };
    expect(resolveArtwork(input).id).toBe(resolveArtwork(input).id);
    expect(resolveArtwork(input).id).toBe("paris-coronation");
  });
});

describe("the artwork set", () => {
  it("has a downloaded file for every entry", () => {
    // The resolver builds src from the id; a missing file is a broken backdrop.
    for (const art of allArtwork()) {
      const file = path.join(process.cwd(), "public", "artwork", `${art.id}.jpg`);
      expect(existsSync(file), `missing ${art.id}.jpg`).toBe(true);
    }
  });

  it("points every country fallback at a city that exists", () => {
    for (const [country, cityKey] of Object.entries(COUNTRY_ARTWORK)) {
      expect(CITY_ARTWORK[cityKey], `${country} -> ${cityKey}`).toBeTruthy();
    }
  });

  it("gives every artwork an artist, a year and a credit note", () => {
    for (const art of allArtwork()) {
      expect(art.artist.length).toBeGreaterThan(2);
      expect(art.year.length).toBeGreaterThan(3);
      expect(art.note.length).toBeGreaterThan(10);
    }
  });

  it("has a default that resolves", () => {
    expect(CITY_ARTWORK[DEFAULT_ARTWORK_KEY]).toBeTruthy();
  });
});
