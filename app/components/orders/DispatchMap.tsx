// This map draws only the orders the merchant added from the Orders table with the
// "Add to map" button. It reads them, finds where each one is, and draws pins and a
// round-trip route. It never changes an order, tag, metafield, or attribute in Shopify.

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
// The shape of a popup's `offset` option (Mapbox does not export a name for it).
type PopupOffset = NonNullable<ConstructorParameters<MapboxGL["Popup"]>[0]>["offset"];

// The Polaris button does not list `title` in its types, but the browser still shows it as a tooltip.
const tooltip = (text: string) => ({ title: text });

/** An order that has a position on the map. `approximate` means the address only partly matched. */
type PlacedOrder = DispatchMapOrder & { coordinates: LngLat; approximate: boolean };

interface DispatchMapProps {
  accessToken: string;
  /** The orders on the map: the ones the merchant added from the table. */
  orders: DispatchMapOrder[];
  /** Called with an order id when the trash button in its popup is pressed. */
  onRemoveOrder: (orderId: string) => void;
  /** Called when the "clear all" button is pressed. */
  onClearAll: () => void;
  /** Called with the order id when a pin's popup opens, so the table can colour that order's row. */
  onPinFocus?: (orderId: string) => void;
  /** Called with the order id when that pin's popup closes. */
  onPinBlur?: (orderId: string) => void;
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
// The colourful streets map, with the shop, transit and airport labels hidden once it
// loads, so the pins and the route are what the eye sees first.
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";
const HIDDEN_LABEL_LAYERS = /^(poi|transit|airport|natural-point)/;
// The pin is a teardrop 34px tall, so its popup opens above the tip.
const PIN_POPUP_OFFSET: PopupOffset = {
  bottom: [0, -38],
  "bottom-left": [0, -38],
  "bottom-right": [0, -38],
  top: [0, 8],
  "top-left": [0, 8],
  "top-right": [0, 8],
  left: [16, -19],
  right: [-16, -19],
};

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

/** Draws a small warning triangle for the "approximate location" note. Built from fixed shapes. */
function createWarningIcon(): SVGSVGElement {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNamespace, "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("width", "14");
  icon.setAttribute("height", "14");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.4");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(svgNamespace, "path");
  shape.setAttribute("d", "M8 2 15 14H1zM8 6.5v3.5M8 12v.3");
  icon.append(shape);
  return icon;
}

/**
 * Builds the pin popup, one field per line: the order number (bold), the name, the
 * street and area lines, an amber note only when the pin is a best guess, then the
 * delivery, items and price. At the very bottom is a trash button that calls
 * onRemove. A field with no value gets no line. Order text is set as plain text, so
 * it can never become HTML.
 */
function createPopupContent(order: PlacedOrder, onRemove: () => void): HTMLDivElement {
  const content = document.createElement("div");
  content.className = "dispatch-map__popup";

  const addLine = (parent: HTMLElement, text: string, className = "dispatch-map__popup-line") => {
    const line = document.createElement("p");
    line.className = className;
    line.textContent = text;
    parent.append(line);
  };
  // A block of lines kept together, with a little space above it. Empty blocks are left out.
  const addGroup = (lines: string[]) => {
    if (lines.length === 0) return;
    const group = document.createElement("div");
    group.className = "dispatch-map__popup-group";
    for (const text of lines) addLine(group, text);
    content.append(group);
  };

  const details = order.popup;
  addLine(content, order.orderNumber, "dispatch-map__popup-title");
  addGroup([details.name, ...details.streetLines, details.area].filter(Boolean));

  if (order.approximate) {
    const note = document.createElement("p");
    note.className = "dispatch-map__popup-note";
    note.append(createWarningIcon(), "Approximate location (partial address match)");
    content.append(note);
  }

  addGroup(
    [
      details.delivery && `Delivery: ${details.delivery}`,
      details.items.length > 0 && `Items: ${details.items.join(", ")}`,
      details.price && `Price: ${details.price}`,
    ].filter((line): line is string => typeof line === "string" && line !== ""),
  );

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

/** The embedded delivery map. It shows the orders added from the Orders table. */
export function DispatchMap({
  accessToken,
  orders,
  onRemoveOrder,
  onClearAll,
  onPinFocus,
  onPinBlur,
}: DispatchMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapboxRef = useRef<MapboxGL | null>(null);
  const pinsRef = useRef(new Map<string, PinEntry>());
  // The order ids the map has already zoomed for, so it zooms only when a new order appears.
  const zoomedIdsRef = useRef<Set<string>>(new Set());
  const fitRef = useRef<() => void>(() => {});
  // The popup's trash button reads the latest callback through this, so a new
  // callback from the parent never makes the pins rebuild.
  const removeRef = useRef(onRemoveOrder);
  removeRef.current = onRemoveOrder;
  // The same idea for the popup open and close notes sent to the table.
  const focusRef = useRef(onPinFocus);
  focusRef.current = onPinFocus;
  const blurRef = useRef(onPinBlur);
  blurRef.current = onPinBlur;

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  // Address lookups already answered this visit, by address. null = Mapbox found nothing.
  const [lookups, setLookups] = useState<Record<string, GeocodeResult | null>>({});
  const [routeOn, setRouteOn] = useState(false);
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);
  const [isThreeDimensional, setIsThreeDimensional] = useState(false);
  // The merchant's choice of map size: a short strip, or a tall full-size map.
  const [isFullSize, setIsFullSize] = useState(false);

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

  // Pins are numbered in this order: the order they were added, or the short round trip.
  const stops = useMemo(
    () => (routeOn ? optimizeStops(DISPATCH_HUB.lngLat, placedOrders) : placedOrders),
    [routeOn, placedOrders],
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
        style: MAP_STYLE,
        center: DISPATCH_HUB.lngLat,
        zoom: 10,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");
      map.on("error", (event) => {
        const status = (event.error as { status?: number } | undefined)?.status;
        if (status === 401 || status === 403) {
          setMapError("Mapbox rejected the token. Check MAPBOX_PUBLIC_TOKEN and its URL restrictions.");
        }
      });
      const readyMap = map;
      readyMap.on("load", () => {
        for (const layer of readyMap.getStyle()?.layers ?? []) {
          if (HIDDEN_LABEL_LAYERS.test(layer.id)) {
            readyMap.setLayoutProperty(layer.id, "visibility", "none");
          }
        }
        readyMap.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: EMPTY_LINE });
        readyMap.addLayer({
          id: ROUTE_CASING_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.95 },
        });
        readyMap.addLayer({
          id: ROUTE_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#2563eb", "line-width": 4 },
        });

        const hub = document.createElement("div");
        hub.className = "dispatch-map__marker dispatch-map__marker--hub";
        hub.textContent = "★";
        hub.title = DISPATCH_HUB.name;
        new mapboxgl.Marker({ element: hub, anchor: "bottom" })
          .setLngLat(DISPATCH_HUB.lngLat)
          .setPopup(new mapboxgl.Popup({ offset: PIN_POPUP_OFFSET }).setText(DISPATCH_HUB.name))
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
      zoomedIdsRef.current = new Set();
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
      const signature = `${order.orderNumber}|${JSON.stringify(order.popup)}|${order.approximate}`;
      const buildPopup = () =>
        createPopupContent(order, () => removeRef.current(order.id));

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
      const popup = new mapboxgl.Popup({ offset: PIN_POPUP_OFFSET, maxWidth: "300px" }).setDOMContent(
        buildPopup(),
      );
      popup.on("open", () => focusRef.current?.(order.id));
      popup.on("close", () => blurRef.current?.(order.id));
      const marker = new mapboxgl.Marker({ element, anchor: "bottom" })
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

  // Zoom to the pins (and the hub). With no orders it goes back to the starting view.
  // Used by the Fit button and the automatic zoom below.
  fitRef.current = () => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl) return;
    const duration = prefersReducedMotion() ? 0 : 500;
    if (placedOrders.length === 0) {
      map.easeTo({ center: DISPATCH_HUB.lngLat, zoom: 10, duration });
      return;
    }
    const bounds = new mapboxgl.LngLatBounds(DISPATCH_HUB.lngLat, DISPATCH_HUB.lngLat);
    for (const order of placedOrders) bounds.extend(order.coordinates);
    map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration });
  };
  const fitToStops = useCallback(() => fitRef.current(), []);

  // Zoom automatically only when an order appears that the map has not zoomed for
  // yet (just added). A refresh, a removed pin or a new route order never moves the map.
  useEffect(() => {
    if (!mapReady) return;
    const known = zoomedIdsRef.current;
    const hasNew = placedOrders.some((order) => !known.has(order.id));
    zoomedIdsRef.current = new Set(placedOrders.map((order) => order.id));
    if (hasNew) fitRef.current();
  }, [mapReady, placedOrders]);

  useEffect(() => {
    mapRef.current?.easeTo({
      pitch: isThreeDimensional ? 55 : 0,
      bearing: isThreeDimensional ? -20 : 0,
      duration: prefersReducedMotion() ? 0 : 350,
    });
  }, [isThreeDimensional]);

  // When the map changes between short and full size, tell Mapbox to redraw to the new size.
  useEffect(() => {
    const frame = requestAnimationFrame(() => mapRef.current?.resize());
    return () => cancelAnimationFrame(frame);
  }, [isFullSize]);

  if (!accessToken) {
    return (
      <s-section>
        <s-paragraph>
          Set <code>MAPBOX_PUBLIC_TOKEN</code> to show the delivery map.
        </s-paragraph>
      </s-section>
    );
  }

  // A short line about the route, shown inside the map only when there is something to say.
  const routeSummary = routeOn
    ? roadRoute
      ? `${stops.length} stop${stops.length === 1 ? "" : "s"} · ${roadRoute.distanceKm.toFixed(1)} km · ${Math.round(roadRoute.durationMin)} min round trip`
      : `${stops.length} stop${stops.length === 1 ? "" : "s"} · about ${routeLengthKm(straightLine).toFixed(1)} km straight line`
    : orders.length > 0
      ? `${placedOrders.length} on the map`
      : "";

  return (
    <s-section padding="none">
      <div className={`dispatch-map__stage${isFullSize ? " dispatch-map__stage--full" : ""}`}>
        <div ref={containerRef} className="dispatch-map__canvas" aria-label="Delivery map" />

        <div className="dispatch-map__overlay">
          <div className="dispatch-map__toolbar">
            <s-button
              variant="secondary"
              icon={isFullSize ? "minimize" : "maximize"}
              accessibilityLabel={isFullSize ? "Make the map smaller" : "Make the map full size"}
              {...tooltip(isFullSize ? "Smaller map" : "Full-size map")}
              onClick={() => setIsFullSize((value) => !value)}
            />
            <s-button
              variant="secondary"
              icon="location"
              accessibilityLabel="Fit the map to the orders"
              {...tooltip("Fit to orders")}
              onClick={fitToStops}
            />
            <s-button
              variant={routeOn ? "primary" : "secondary"}
              icon="delivery"
              accessibilityLabel={routeOn ? "Clear the route" : "Optimize the route"}
              {...tooltip(routeOn ? "Clear route" : "Optimize route")}
              aria-pressed={routeOn}
              disabled={!routeOn && placedOrders.length === 0 ? true : undefined}
              onClick={() => setRouteOn((value) => !value)}
            />
            <s-button
              variant={isThreeDimensional ? "primary" : "secondary"}
              icon="three-d-environment"
              accessibilityLabel={isThreeDimensional ? "Switch to the flat map" : "Switch to the 3D map"}
              {...tooltip(isThreeDimensional ? "Flat map" : "3D map")}
              aria-pressed={isThreeDimensional}
              onClick={() => setIsThreeDimensional((value) => !value)}
            />
            <s-button
              variant="secondary"
              icon="delete"
              accessibilityLabel="Remove all orders from the map"
              {...tooltip("Clear the map")}
              disabled={orders.length === 0 ? true : undefined}
              onClick={onClearAll}
            />
          </div>

          {routeSummary && <div className="dispatch-map__chip">{routeSummary}</div>}
          {isLookingUp && <div className="dispatch-map__chip">Finding addresses…</div>}
          {unmappedOrderCount > 0 && (
            <div className="dispatch-map__chip dispatch-map__chip--critical">
              {unmappedOrderCount} could not be placed. Check the address.
            </div>
          )}
          {mapError && <div className="dispatch-map__chip dispatch-map__chip--critical">{mapError}</div>}
        </div>
      </div>
    </s-section>
  );
}
