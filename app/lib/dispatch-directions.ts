// Road route for the Orders-page map, from the Mapbox Directions API (browser,
// public token). If it cannot be used the map keeps its straight-line route, so
// this is a nice-to-have and never blocks the page.

import type { LngLat } from "./dispatch-route";

export interface RoadRoute {
  /** The road line to draw, as [longitude, latitude] points. */
  coordinates: LngLat[];
  distanceKm: number;
  durationMin: number;
}

/** Mapbox Directions accepts at most 25 points in one request. */
export const MAX_ROAD_WAYPOINTS = 25;

/** Reads the first route from a Mapbox Directions answer; null if it has no usable line. */
export function parseDirectionsResponse(body: unknown): RoadRoute | null {
  const route = (body as { routes?: unknown[] } | null)?.routes?.[0] as
    | {
        distance?: unknown;
        duration?: unknown;
        geometry?: { coordinates?: unknown };
      }
    | undefined;
  const coordinates = route?.geometry?.coordinates;
  if (
    !route ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    typeof route.distance !== "number" ||
    typeof route.duration !== "number"
  ) {
    return null;
  }
  return {
    coordinates: coordinates as LngLat[],
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
  };
}

/**
 * Asks Mapbox for the driving route through the points, in order. Returns null
 * when there are too few or too many points, or when Mapbox cannot answer.
 */
export async function fetchRoadRoute(
  accessToken: string,
  waypoints: LngLat[],
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<RoadRoute | null> {
  if (waypoints.length < 2 || waypoints.length > MAX_ROAD_WAYPOINTS) return null;
  const path = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${path}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(accessToken)}`;
  try {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) return null;
    return parseDirectionsResponse(await response.json());
  } catch {
    return null;
  }
}
