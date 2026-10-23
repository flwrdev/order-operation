// This map is only a picture of the orders the Orders table already shows. It
// reads them, finds where each one is, and draws pins and a round-trip route.
// It never changes an order, tag, metafield, or attribute in Shopify.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapboxMap, Marker } from "mapbox-gl";

import { fetchRoadRoute, type RoadRoute } from "../../lib/dispatch-directions";
import {
  GEOCODE_CONCURRENCY,
  geocodeAddress,
  mapWithConcurrency,
  type GeocodeResult,
} from "../../lib/dispatch-geocode";
import type { DispatchMapOrder } from "../../lib/dispatch-map";
import {
  DISPATCH_HUB,
  optimizeStops,
  routeLengthKm,
  type LngLat,
} from "../../lib/dispatch-route";

// mapbox-gl is loaded only in the browser, after the page shows (see the effect
// that starts the map), so it is not part of the server build or the first load.
type MapboxGL = typeof import("mapbox-gl").default;

/** An order that has a position on the map. `approximate` means the address only partly matched. */
type PlacedOrder = DispatchMapOrder & { coordinates: LngLat; approximate: boolean };

interface DispatchMapProps {
  accessToken: string;
  orders: DispatchMapOrder[];
}

interface PinEntry {
  marker: Marker;
  element: HTMLButtonElement;
  /** What the popup was last built from, so it is rebuilt only when that changes. */
  signature: string;
}

const ROUTE_SOURCE_ID = "dispatch-route";
const ROUTE_CASING_LAYER_ID = "dispatch-route-casing";
const ROUTE_LAYER_ID = "dispatch-route-line";
// What the route layer is given to draw (the same type Mapbox's setData accepts).
type LineData = Parameters<GeoJSONSource["setData"]>[0];
const EMPTY_LINE: LineData = { type: "FeatureCollection", features: [] };

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Draws a small trash can icon. It is built from fixed shapes, never from order text. */
function createTrashIcon(): SVGSVGElement {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNamespace, "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("width", "16");
  icon.setAttribute("height", "16");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.3");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(svgNamespace, "path");
  shape.setAttribute("d", "M3 4h10M6 4V2.5h4V4M4.5 4l.6 9.5h5.8L11.5 4");
  icon.append(shape);
  return icon;
}

/**
 * Builds the pin popup: the small delivery summary, a short note only when the
 * pin is a best guess, and at the very bottom a trash button that calls
 * onRemove. Order text is set as plain text, so it can never become HTML.
 */
function createPopupContent(order: PlacedOrder, onRemove: () => void): HTMLDivElement {
  const content = document.createElement("div");

  const summary = document.createElement("p");
  summary.className = "dispatch-map__popup";
  summary.textContent = order.popupText;
  content.append(summary);

  if (order.approximate) {
    const note = document.createElement("p");
    note.className = "dispatch-map__popup dispatch-map__popup--note";
    note.textContent = "Approximate location (partial address match)";
    content.append(note);
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "dispatch-map__remove";
  remove.title = "Remove from map";
  remove.setAttribute("aria-label", `Remove ${order.orderNumber} from the map`);
  remove.append(createTrashIcon());
  remove.addEventListener("click", onRemove);
  content.append(remove);
  return content;
}

/** The line to draw: a real line when there are two or more points, otherwise nothing. */
function toLineData(points: LngLat[]): LineData {
  return points.length > 1
    ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points } }
    : EMPTY_LINE;
}

/** The embedded delivery map mirrors the exact Orders table filter result. */
export function DispatchMap({ accessToken, orders }: DispatchMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapboxRef = useRef<MapboxGL | null>(null);
  const pinsRef = useRef(new Map<string, PinEntry>());
  const lastFitKeyRef = useRef("");
  const fitRef = useRef<() => void>(() => {});

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  // Address lookups already answered this visit, by address. null = Mapbox found nothing.
  const [lookups, setLookups] = useState<Record<string, GeocodeResult | null>>({});
  // Pins the merchant took off the map. This only hides the pin here.
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [routeOn, setRouteOn] = useState(false);
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);
  const [isThreeDimensional, setIsThreeDimensional] = useState(false);

  // Orders Shopify has not placed yet, one per address, that still need a lookup.
  const ordersToLookUp = useMemo(() => {
    const seen = new Set<string>();
    return orders.filter((order) => {
      if (order.coordinates || order.addressKey in lookups || seen.has(order.addressKey)) {
        return false;
      }
      seen.add(order.addressKey);
      return true;
    });
  }, [orders, lookups]);
  const isLookingUp = ordersToLookUp.length > 0;

  useEffect(() => {
    if (!accessToken || ordersToLookUp.length === 0) return;
    let active = true;
    mapWithConcurrency(ordersToLookUp, GEOCODE_CONCURRENCY, async (order) => {
      const found = await geocodeAddress(accessToken, order.address);
      return [order.addressKey, found] as const;
    }).then((answers) => {
      if (active) setLookups((previous) => ({ ...previous, ...Object.fromEntries(answers) }));
    });
    return () => {
      active = false;
    };
  }, [accessToken, ordersToLookUp]);

  // Every order that has a position: Shopify's own, or the one just looked up.
  const placedOrders = useMemo(
    () =>
      orders.flatMap((order): PlacedOrder[] => {
        if (order.coordinates) {
          return [{ ...order, coordinates: order.coordinates, approximate: false }];
        }
        const found = lookups[order.addressKey];
        return found
          ? [{ ...order, coordinates: found.lngLat, approximate: found.approximate }]
          : [];
      }),
    [orders, lookups],
  );
  const unmappedOrderCount = orders.filter(
    (order) => !order.coordinates && order.addressKey in lookups && lookups[order.addressKey] === null,
  ).length;

  const visibleOrders = useMemo(
    () => placedOrders.filter((order) => !removedIds.has(order.id)),
    [placedOrders, removedIds],
  );
  // Pins are numbered in this order: the table order, or the short round trip.
  const stops = useMemo(
    () => (routeOn ? optimizeStops(DISPATCH_HUB.lngLat, visibleOrders) : visibleOrders),
    [routeOn, visibleOrders],
  );

  // The straight route, used until (or unless) the road route arrives.
  const straightLine = useMemo<LngLat[]>(
    () =>
      routeOn && stops.length > 0
        ? [DISPATCH_HUB.lngLat, ...stops.map((order) => order.coordinates), DISPATCH_HUB.lngLat]
        : [],
    [routeOn, stops],
  );
  const straightLineKey = straightLine.map((point) => point.join(",")).join(";");

  useEffect(() => {
    setRoadRoute(null);
    if (!accessToken || straightLine.length === 0) return;
    const controller = new AbortController();
    fetchRoadRoute(accessToken, straightLine, controller.signal).then((route) => {
      if (!controller.signal.aborted) setRoadRoute(route);
    });
    return () => controller.abort();
    // straightLineKey changes exactly when the points change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, straightLineKey]);

  const lineCoordinates = roadRoute?.coordinates ?? straightLine;

  // Start the map in the browser. It is rebuilt only if the token changes.
  useEffect(() => {
    if (!accessToken || !containerRef.current) return;
    let cancelled = false;
    let map: MapboxMap | null = null;
    const pins = pinsRef.current;

    (async () => {
      const { default: mapboxgl } = await import("mapbox-gl");
      if (cancelled || !containerRef.current) return;
      mapboxRef.current = mapboxgl;

      map = new mapboxgl.Map({
        accessToken,
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: DISPATCH_HUB.lngLat,
        zoom: 10,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      map.addControl(new mapboxgl.FullscreenControl(), "top-right");
      map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");
      map.on("error", (event) => {
        const status = (event.error as { status?: number } | undefined)?.status;
        if (status === 401 || status === 403) {
          setMapError("Mapbox rejected the token. Check MAPBOX_PUBLIC_TOKEN and its URL restrictions.");
        }
      });
      const readyMap = map;
      readyMap.on("load", () => {
        readyMap.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: EMPTY_LINE });
        readyMap.addLayer({
          id: ROUTE_CASING_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 },
        });
        readyMap.addLayer({
          id: ROUTE_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#2563eb", "line-width": 4 },
        });

        const hub = document.createElement("div");
        hub.className = "dispatch-map__hub";
        hub.textContent = "★";
        hub.title = DISPATCH_HUB.name;
        new mapboxgl.Marker({ element: hub })
          .setLngLat(DISPATCH_HUB.lngLat)
          .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(DISPATCH_HUB.name))
          .addTo(readyMap);

        setMapReady(true);
      });
      mapRef.current = map;
    })().catch(() => {
      if (!cancelled) setMapError("The map could not be loaded.");
    });

    return () => {
      cancelled = true;
      pins.forEach(({ marker }) => marker.remove());
      pins.clear();
      lastFitKeyRef.current = "";
      map?.remove();
      mapRef.current = null;
      mapboxRef.current = null;
      setMapReady(false);
    };
  }, [accessToken]);

  // Keep one pin per order: add new ones, move or renumber the rest, drop the gone.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl || !mapReady) return;
    const pins = pinsRef.current;

    const wanted = new Set(stops.map((order) => order.id));
    for (const [id, pin] of pins) {
      if (!wanted.has(id)) {
        pin.marker.remove();
        pins.delete(id);
      }
    }

    stops.forEach((order, index) => {
      const label = String(index + 1);
      const ariaLabel = `Show delivery details for ${order.orderNumber}, stop ${label}`;
      const signature = `${order.orderNumber}|${order.popupText}|${order.approximate}`;
      const buildPopup = () =>
        createPopupContent(order, () =>
          setRemovedIds((previous) => new Set(previous).add(order.id)),
        );

      const existing = pins.get(order.id);
      if (existing) {
        existing.marker.setLngLat(order.coordinates);
        existing.element.textContent = label;
        existing.element.setAttribute("aria-label", ariaLabel);
        existing.element.classList.toggle("dispatch-map__marker--approximate", order.approximate);
        if (existing.signature !== signature) {
          existing.marker.getPopup()?.setDOMContent(buildPopup());
          existing.signature = signature;
        }
        return;
      }

      const element = document.createElement("button");
      element.type = "button";
      element.className = "dispatch-map__marker";
      element.classList.toggle("dispatch-map__marker--approximate", order.approximate);
      element.textContent = label;
      element.setAttribute("aria-label", ariaLabel);
      const popup = new mapboxgl.Popup({ offset: 22, maxWidth: "260px" }).setDOMContent(
        buildPopup(),
      );
      const marker = new mapboxgl.Marker({ element })
        .setLngLat(order.coordinates)
        .setPopup(popup)
        .addTo(map);
      pins.set(order.id, { marker, element, signature });
    });
  }, [mapReady, stops]);

  // Draw the route line.
  useEffect(() => {
    const source = mapRef.current?.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
    if (mapReady) source?.setData(toLineData(lineCoordinates));
  }, [mapReady, lineCoordinates]);

  // Zoom to the pins (and the hub). Used by the Fit button and the automatic fit below.
  fitRef.current = () => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl) return;
    const bounds = new mapboxgl.LngLatBounds(DISPATCH_HUB.lngLat, DISPATCH_HUB.lngLat);
    for (const order of visibleOrders) bounds.extend(order.coordinates);
    map.fitBounds(bounds, {
      padding: 60,
      maxZoom: 14,
      duration: prefersReducedMotion() ? 0 : 500,
    });
  };
  const fitToStops = useCallback(() => fitRef.current(), []);

  // Zoom automatically only when the set of orders changes (first load, a new
  // tab or filter). A refresh, a removed pin or a new route order never moves the map.
  const fitKey = useMemo(
    () => placedOrders.map((order) => order.id).sort().join("|"),
    [placedOrders],
  );
  useEffect(() => {
    if (!mapReady || !fitKey || lastFitKeyRef.current === fitKey) return;
    lastFitKeyRef.current = fitKey;
    fitRef.current();
  }, [mapReady, fitKey]);

  useEffect(() => {
    mapRef.current?.easeTo({
      pitch: isThreeDimensional ? 55 : 0,
      bearing: isThreeDimensional ? -20 : 0,
      duration: prefersReducedMotion() ? 0 : 350,
    });
  }, [isThreeDimensional]);

  if (!accessToken) {
    return (
      <s-section>
        <s-stack gap="small-200">
          <s-heading>Delivery map</s-heading>
          <s-paragraph>
            Set <code>MAPBOX_PUBLIC_TOKEN</code> to show the delivery map.
          </s-paragraph>
        </s-stack>
      </s-section>
    );
  }

  const summary = routeOn
    ? roadRoute
      ? `${stops.length} stop${stops.length === 1 ? "" : "s"} · ${roadRoute.distanceKm.toFixed(1)} km · ${Math.round(roadRoute.durationMin)} min round trip`
      : `${stops.length} stop${stops.length === 1 ? "" : "s"} · about ${routeLengthKm(straightLine).toFixed(1)} km in a straight line`
    : `${visibleOrders.length} order${visibleOrders.length === 1 ? "" : "s"} on the map`;

  return (
    <s-section>
      <s-stack gap="small-200">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-stack gap="small-100">
            <s-heading>Delivery map</s-heading>
            <s-text color="subdued">{summary}</s-text>
          </s-stack>
          <div className="dispatch-map__controls">
            <button type="button" className="dispatch-map__button" onClick={fitToStops}>
              Fit
            </button>
            <button
              type="button"
              className="dispatch-map__button"
              onClick={() => setRouteOn((value) => !value)}
              aria-pressed={routeOn}
              disabled={!routeOn && visibleOrders.length === 0}
            >
              {routeOn ? "Clear route" : "Optimize route"}
            </button>
            <button
              type="button"
              className="dispatch-map__button"
              onClick={() => setIsThreeDimensional((value) => !value)}
              aria-pressed={isThreeDimensional}
            >
              {isThreeDimensional ? "2D" : "3D"}
            </button>
          </div>
        </s-stack>

        {mapError && <s-text tone="critical">{mapError}</s-text>}
        {isLookingUp && <s-text color="subdued">Finding delivery addresses…</s-text>}
        {unmappedOrderCount > 0 && (
          <s-text tone="critical">
            {unmappedOrderCount} order{unmappedOrderCount === 1 ? "" : "s"} could not be placed on the map. Check the shipping address.
          </s-text>
        )}
        {removedIds.size > 0 && (
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-text color="subdued">{removedIds.size} removed from the map</s-text>
            <button
              type="button"
              className="dispatch-map__button"
              onClick={() => setRemovedIds(new Set())}
            >
              Restore
            </button>
          </s-stack>
        )}
        <div ref={containerRef} className="dispatch-map__canvas" aria-label="Delivery map" />
      </s-stack>
    </s-section>
  );
}
