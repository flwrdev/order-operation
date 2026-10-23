// Route math for the Orders-page map. Everything here is plain calculation: it
// reads no order data and writes nothing to Shopify.

/** A map position as [longitude, latitude], the order Mapbox uses. */
export type LngLat = [number, number];

/** Where every delivery round trip starts and ends. */
export const DISPATCH_HUB = {
  name: "Flowercart Hub",
  lngLat: [120.9715, 14.6205] as LngLat,
};

/** Straight-line distance in kilometres between two positions (haversine formula). */
export function distanceKm(a: LngLat, b: LngLat): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latDistance = radians(b[1] - a[1]);
  const lngDistance = radians(b[0] - a[0]);
  const value =
    Math.sin(latDistance / 2) ** 2 +
    Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(lngDistance / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/** Total straight-line length of a path that visits the points in the given order. */
export function routeLengthKm(points: LngLat[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceKm(points[index - 1], points[index]);
  }
  return total;
}

// A safety stop so the improvement loop can never run forever.
const MAX_IMPROVEMENT_PASSES = 50;

/**
 * Puts the stops in a short visiting order for a round trip that starts and
 * ends at `origin`. It first always drives to the nearest unvisited stop, then
 * keeps flipping parts of the route while that makes the trip shorter (2-opt).
 * The result is a new array; the input is not changed.
 */
export function optimizeStops<T extends { coordinates: LngLat }>(
  origin: LngLat,
  stops: T[],
): T[] {
  // With 0-2 stops every order is the same length, so there is nothing to improve.
  if (stops.length < 3) return [...stops];

  const remaining = [...stops];
  const path: T[] = [];
  let current = origin;
  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const distance = distanceKm(current, remaining[index].coordinates);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    }
    const [next] = remaining.splice(nearestIndex, 1);
    path.push(next);
    current = next.coordinates;
  }

  let improved = true;
  for (let pass = 0; improved && pass < MAX_IMPROVEMENT_PASSES; pass += 1) {
    improved = false;
    for (let start = 0; start < path.length - 1; start += 1) {
      for (let end = start + 1; end < path.length; end += 1) {
        const before = start === 0 ? origin : path[start - 1].coordinates;
        const after = end === path.length - 1 ? origin : path[end + 1].coordinates;
        const first = path[start].coordinates;
        const last = path[end].coordinates;
        const currentLength = distanceKm(before, first) + distanceKm(last, after);
        const flippedLength = distanceKm(before, last) + distanceKm(first, after);
        if (flippedLength + 1e-9 < currentLength) {
          const flipped = path.slice(start, end + 1).reverse();
          path.splice(start, flipped.length, ...flipped);
          improved = true;
        }
      }
    }
  }
  return path;
}
