// These tests cover the map's route math: distance, visiting order, and the
// road-route and address-lookup readers. None of them touch Shopify.

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseDirectionsResponse,
  fetchRoadRoute,
  MAX_ROAD_WAYPOINTS,
} from "../app/lib/dispatch-directions";
import {
  buildGeocodeUrl,
  clearGeocodeCache,
  geocodeAddress,
  isPhilippineLngLat,
  mapWithConcurrency,
  parseGeocodeResponse,
} from "../app/lib/dispatch-geocode";
import {
  DISPATCH_HUB,
  distanceKm,
  optimizeStops,
  routeLengthKm,
  type LngLat,
} from "../app/lib/dispatch-route";

const stop = (id: string, lng: number, lat: number) => ({
  id,
  coordinates: [lng, lat] as LngLat,
});

describe("route math", () => {
  it("measures a known distance (Manila to Quezon City is about 10 km)", () => {
    const km = distanceKm([120.9842, 14.5995], [121.0437, 14.676]);
    expect(km).toBeGreaterThan(8);
    expect(km).toBeLessThan(12);
  });

  it("keeps every stop exactly once and never makes the trip longer", () => {
    const stops = [
      stop("a", 121.1, 14.7),
      stop("b", 120.95, 14.55),
      stop("c", 121.05, 14.62),
      stop("d", 120.99, 14.66),
      stop("e", 121.12, 14.5),
      stop("f", 120.97, 14.58),
    ];
    const ordered = optimizeStops(DISPATCH_HUB.lngLat, stops);

    expect(ordered.map((s) => s.id).sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    const trip = (list: typeof stops) =>
      routeLengthKm([DISPATCH_HUB.lngLat, ...list.map((s) => s.coordinates), DISPATCH_HUB.lngLat]);
    expect(trip(ordered)).toBeLessThanOrEqual(trip(stops) + 1e-9);
  });

  it("does not change the list it was given", () => {
    const stops = [stop("a", 121.1, 14.7), stop("b", 120.95, 14.55), stop("c", 121.05, 14.62)];
    const copy = [...stops];
    optimizeStops(DISPATCH_HUB.lngLat, stops);
    expect(stops).toEqual(copy);
  });

  it("handles no stops, one stop and two stops", () => {
    expect(optimizeStops(DISPATCH_HUB.lngLat, [])).toEqual([]);
    const one = [stop("a", 121, 14.6)];
    expect(optimizeStops(DISPATCH_HUB.lngLat, one)).toEqual(one);
    const two = [stop("a", 121, 14.6), stop("b", 121.1, 14.7)];
    expect(optimizeStops(DISPATCH_HUB.lngLat, two)).toHaveLength(2);
  });
});

describe("address lookup reader", () => {
  const feature = (confidence: string, coordinates: unknown = [121.0244, 14.5547]) => ({
    features: [{ geometry: { coordinates }, properties: { match_code: { confidence } } }],
  });

  it("marks exact and high matches as precise", () => {
    expect(parseGeocodeResponse(feature("exact"))).toEqual({
      lngLat: [121.0244, 14.5547],
      approximate: false,
    });
    expect(parseGeocodeResponse(feature("high"))?.approximate).toBe(false);
  });

  it("marks medium, low and unknown matches as approximate", () => {
    expect(parseGeocodeResponse(feature("medium"))?.approximate).toBe(true);
    expect(parseGeocodeResponse(feature("low"))?.approximate).toBe(true);
    expect(
      parseGeocodeResponse({ features: [{ geometry: { coordinates: [121, 14.6] } }] })
        ?.approximate,
    ).toBe(true);
  });

  it("rejects no match, bad shapes and places outside the Philippines", () => {
    expect(parseGeocodeResponse({ features: [] })).toBeNull();
    expect(parseGeocodeResponse(null)).toBeNull();
    expect(parseGeocodeResponse(feature("exact", ["x", "y"]))).toBeNull();
    expect(parseGeocodeResponse(feature("exact", [-0.1276, 51.5072]))).toBeNull();
    expect(isPhilippineLngLat(121, 14.6)).toBe(true);
    expect(isPhilippineLngLat(0, 0)).toBe(false);
  });

  it("asks Mapbox v6 for the Philippines near Metro Manila", () => {
    const url = new URL(buildGeocodeUrl("pk.test", "12 Kamias Road, Quezon City"));
    expect(url.pathname).toBe("/search/geocode/v6/forward");
    expect(url.searchParams.get("country")).toBe("ph");
    expect(url.searchParams.get("proximity")).toBe("121.0,14.6");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("q")).toBe("12 Kamias Road, Quezon City");
  });
});

describe("geocodeAddress", () => {
  beforeEach(() => clearGeocodeCache());

  const okResponse = () =>
    new Response(
      JSON.stringify({
        features: [
          {
            geometry: { coordinates: [121.05, 14.62] },
            properties: { match_code: { confidence: "exact" } },
          },
        ],
      }),
    );

  it("looks an address up once and remembers the answer", async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const first = await geocodeAddress("pk.test", "Same Street", fetchImpl);
    const second = await geocodeAddress("pk.test", "  same street ", fetchImpl);
    expect(first?.lngLat).toEqual([121.05, 14.62]);
    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not remember a failed connection, so a later try can ask again", async () => {
    vi.useFakeTimers();
    try {
      const failing = vi.fn(async () => {
        throw new Error("offline");
      });
      const attempt = geocodeAddress("pk.test", "Flaky Street", failing);
      await vi.advanceTimersByTimeAsync(600);
      expect(await attempt).toBeNull();
      expect(failing).toHaveBeenCalledTimes(2);

      const working = vi.fn(async () => okResponse());
      expect((await geocodeAddress("pk.test", "Flaky Street", working))?.lngLat).toEqual([
        121.05, 14.62,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("remembers a real 'not found' answer", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ features: [] })));
    expect(await geocodeAddress("pk.test", "Nowhere", fetchImpl)).toBeNull();
    expect(await geocodeAddress("pk.test", "Nowhere", fetchImpl)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("mapWithConcurrency", () => {
  it("never runs more than the limit at once and keeps the input order", async () => {
    let running = 0;
    let highest = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
      running += 1;
      highest = Math.max(highest, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return n * 10;
    });
    expect(results).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(highest).toBeLessThanOrEqual(3);
  });

  it("returns an empty list for no items", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});

describe("road route reader", () => {
  const answer = {
    routes: [
      {
        distance: 12345,
        duration: 1800,
        geometry: {
          coordinates: [
            [121, 14.6],
            [121.1, 14.7],
          ],
        },
      },
    ],
  };

  it("reads the line, kilometres and minutes", () => {
    expect(parseDirectionsResponse(answer)).toEqual({
      coordinates: [
        [121, 14.6],
        [121.1, 14.7],
      ],
      distanceKm: 12.345,
      durationMin: 30,
    });
  });

  it("returns null for an answer with no usable route", () => {
    expect(parseDirectionsResponse({ routes: [] })).toBeNull();
    expect(parseDirectionsResponse({ routes: [{ distance: 1 }] })).toBeNull();
    expect(parseDirectionsResponse(null)).toBeNull();
  });

  it("does not call Mapbox for too few or too many points", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(answer)));
    expect(await fetchRoadRoute("pk.test", [[121, 14.6]], undefined, fetchImpl)).toBeNull();
    const tooMany = Array.from({ length: MAX_ROAD_WAYPOINTS + 1 }, (): LngLat => [121, 14.6]);
    expect(await fetchRoadRoute("pk.test", tooMany, undefined, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null instead of throwing when Mapbox fails", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    const points: LngLat[] = [
      [121, 14.6],
      [121.1, 14.7],
    ];
    expect(await fetchRoadRoute("pk.test", points, undefined, failing)).toBeNull();
    const notOk = vi.fn(async () => new Response("nope", { status: 401 }));
    expect(await fetchRoadRoute("pk.test", points, undefined, notOk)).toBeNull();
  });
});
