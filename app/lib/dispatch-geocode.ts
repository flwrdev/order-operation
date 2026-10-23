// Address lookup for the Orders-page map, using Mapbox Geocoding v6 from the
// browser with the public token. Results live in memory only; nothing is saved
// to Shopify or the database, which is what Mapbox's temporary geocoding allows.

import type { LngLat } from "./dispatch-route";

export interface GeocodeResult {
  lngLat: LngLat;
  /** True when Mapbox only matched part of the address, so the pin is a best guess. */
  approximate: boolean;
}

// The delivery area is the Philippines; a position outside it is a wrong match.
const PHILIPPINES_BOUNDS = { minLng: 116, maxLng: 127, minLat: 4, maxLat: 21.5 };
// Mapbox is asked to prefer matches near Metro Manila.
const METRO_MANILA_PROXIMITY = "121.0,14.6";
// How many address lookups may run at the same time.
export const GEOCODE_CONCURRENCY = 4;

/** True when both values are numbers that fall inside the Philippines. */
export function isPhilippineLngLat(lng: unknown, lat: unknown): boolean {
  return (
    typeof lng === "number" &&
    typeof lat === "number" &&
    lng >= PHILIPPINES_BOUNDS.minLng &&
    lng <= PHILIPPINES_BOUNDS.maxLng &&
    lat >= PHILIPPINES_BOUNDS.minLat &&
    lat <= PHILIPPINES_BOUNDS.maxLat
  );
}

/**
 * Reads the first match from a Mapbox v6 forward-geocoding answer. Returns null
 * when there is no match or the match is outside the Philippines. Only an
 * "exact" or "high" confidence counts as a precise pin.
 */
export function parseGeocodeResponse(body: unknown): GeocodeResult | null {
  const feature = (body as { features?: unknown[] } | null)?.features?.[0] as
    | {
        geometry?: { coordinates?: unknown };
        properties?: { match_code?: { confidence?: unknown } };
      }
    | undefined;
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || !isPhilippineLngLat(coordinates[0], coordinates[1])) {
    return null;
  }
  const confidence = feature?.properties?.match_code?.confidence;
  return {
    lngLat: [coordinates[0] as number, coordinates[1] as number],
    approximate: confidence !== "exact" && confidence !== "high",
  };
}

/** Builds the Mapbox v6 request address for one delivery address. */
export function buildGeocodeUrl(accessToken: string, address: string): string {
  const query = new URLSearchParams({
    q: address,
    country: "ph",
    proximity: METRO_MANILA_PROXIMITY,
    limit: "1",
    access_token: accessToken,
  });
  return `https://api.mapbox.com/search/geocode/v6/forward?${query.toString()}`;
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * One lookup. A network error or a busy Mapbox (429 / 5xx) is tried once more,
 * then reported as `transient` so the caller does not remember it as "not found".
 */
async function lookup(
  url: string,
  fetchImpl: typeof fetch,
  attempt = 0,
): Promise<{ result: GeocodeResult | null; transient: boolean }> {
  try {
    const response = await fetchImpl(url);
    if (response.status === 429 || response.status >= 500) {
      throw new Error(`Mapbox answered ${response.status}`);
    }
    if (!response.ok) return { result: null, transient: false };
    return { result: parseGeocodeResponse(await response.json()), transient: false };
  } catch {
    if (attempt < 1) {
      await wait(500);
      return lookup(url, fetchImpl, attempt + 1);
    }
    return { result: null, transient: true };
  }
}

// One answer per address for as long as the page stays open.
const geocodeCache = new Map<string, Promise<GeocodeResult | null>>();

/** Finds one address. The same address is only looked up once per page visit. */
export function geocodeAddress(
  accessToken: string,
  address: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeocodeResult | null> {
  const key = address.trim().toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached) return cached;

  const request = lookup(buildGeocodeUrl(accessToken, address), fetchImpl).then(
    ({ result, transient }) => {
      // A failed connection is not an answer, so a later try may ask again.
      if (transient) geocodeCache.delete(key);
      return result;
    },
  );
  geocodeCache.set(key, request);
  return request;
}

/** Empties the in-memory address cache (used by tests). */
export function clearGeocodeCache(): void {
  geocodeCache.clear();
}

/** Runs `task` on every item, never more than `limit` at the same time; results keep the input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}
