// The map reads this small, stable shape from the Orders loader. It never
// creates a second order record or guesses delivery values outside that loader.

import {
  getDeliveryDateValue,
  getDeliveryTimeValue,
  type Order,
} from "./order-utils";
import { isPhilippineLngLat } from "./dispatch-geocode";
import type { LngLat } from "./dispatch-route";
import { parseSlotValueToTimes, type SlotTimePart } from "./slot-times";

export interface DispatchMapOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  address: string;
  addressKey: string;
  /** Shopify's own position for the address, or null when the map must look the address up. */
  coordinates: LngLat | null;
  deliveryDate: string | null;
  deliveryTimeSlot: string | null;
  fulfillmentStatus: string;
  /** What the popup shows when a pin is clicked, one field per line. */
  popup: PopupDetails;
}

/**
 * The fields shown in a pin popup, one per line. A field with no value is empty
 * (or an empty list), and the popup leaves its line out, so it never shows a placeholder.
 */
export interface PopupDetails {
  name: string;
  /** Street lines: address1, then address2 when it has text. */
  streetLines: string[];
  /** "City, Province". */
  area: string;
  /** "10-24-2026, 9:00 AM - 12:00 PM". */
  delivery: string;
  /** One entry per item, like "1x Bouquet of flowers". */
  items: string[];
  /** "₱1,099". */
  price: string;
}

/** Turns "2026-10-23" into "10-23-2026". Anything else gives "" so it is left out. */
function formatPopupDate(iso: string | null): string {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}-${match[3]}-${match[1]}` : "";
}

/** Turns "9AM-12PM" into "9:00 AM - 12:00 PM". A slot we cannot read is shown as it was saved. */
function formatPopupTime(slot: string | null): string {
  if (!slot) return "";
  const times = parseSlotValueToTimes(slot);
  if (!times) return slot;
  const clock = (part: SlotTimePart) =>
    `${part.hour}:${String(part.minute).padStart(2, "0")} ${part.meridiem}`;
  return `${clock(times.start)} - ${clock(times.end)}`;
}

/** Writes the order total like "₱1,099". Cents only show when the amount has cents. */
function formatPopupPrice(order: Order): string {
  const money = order.currentTotalPriceSet?.shopMoney;
  const amount = Number(money?.amount);
  if (!money || !Number.isFinite(amount)) return "";
  const digits = Number.isInteger(amount) ? 0 : 2;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: money.currencyCode,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Collects the fields for the pin popup, one value per line: the recipient's name, the
 * street lines, "City, Province", the delivery date and time, the items, and the price.
 * The order number is added at the top by the map itself.
 */
export function buildPopupDetails(order: Order): PopupDetails {
  const address = order.shippingAddress;
  const clean = (value: string | null | undefined) =>
    value?.trim().replace(/\s+/g, " ") ?? "";
  const joinParts = (parts: Array<string | null | undefined>, separator: string) =>
    parts.map(clean).filter(Boolean).join(separator);

  const date = getDeliveryDateValue(order);
  const slot = getDeliveryTimeValue(order);

  return {
    name:
      joinParts([address?.firstName, address?.lastName], " ") ||
      joinParts([order.customer?.firstName, order.customer?.lastName], " "),
    streetLines: [clean(address?.address1), clean(address?.address2)].filter(Boolean),
    area: joinParts([address?.city, address?.province], ", "),
    delivery: joinParts(
      [
        formatPopupDate(date === "—" ? null : date),
        formatPopupTime(slot === "—" ? null : slot),
      ],
      ", ",
    ),
    items: (order.lineItems?.edges ?? []).map(
      ({ node }) => `${node.quantity}x ${clean(node.name)}`,
    ),
    price: formatPopupPrice(order),
  };
}

/**
 * Adds the ticked orders to the orders already on the map. New ones are added in
 * table order after the ones already there; an order that is already on the map
 * keeps its place. Nothing is added from outside the table's current list.
 */
export function addSelectedToMap(
  onMap: Order[],
  displayed: Order[],
  selectedIds: readonly string[],
): Order[] {
  const present = new Set(onMap.map((order) => order.id));
  const selected = new Set(selectedIds);
  const added = displayed.filter(
    (order) => selected.has(order.id) && !present.has(order.id),
  );
  return added.length > 0 ? [...onMap, ...added] : onMap;
}

/** Takes one order off the map. */
export function removeFromMap(onMap: Order[], orderId: string): Order[] {
  return onMap.filter((order) => order.id !== orderId);
}

/**
 * Turns the orders on the map into map input. If the loaded page has a newer copy
 * of an order (after a refresh or an edit), that copy is used; otherwise the copy
 * saved when it was added, so an order stays on the map when the table filter changes.
 */
export function resolveMapOrders(onMap: Order[], loaded: Order[]): DispatchMapOrder[] {
  const latest = new Map(loaded.map((order) => [order.id, order]));
  return onMap.flatMap((order) => {
    const mapOrder = toDispatchMapOrder(latest.get(order.id) ?? order);
    return mapOrder ? [mapOrder] : [];
  });
}

/** Normalizes address text so one address gets one geocoding cache key. */
export function normalizeDispatchAddress(order: Order): string {
  const address = order.shippingAddress;
  if (!address) return "";

  return [
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.zip,
    address.country,
  ]
    .map((value) => value?.trim().replace(/\s+/g, " ") ?? "")
    .filter(Boolean)
    .join(", ");
}

/** Adapts an Orders-page order into map input without changing Shopify data. */
export function toDispatchMapOrder(order: Order): DispatchMapOrder | null {
  const address = normalizeDispatchAddress(order);
  if (!address) return null;

  const date = getDeliveryDateValue(order);
  const timeSlot = getDeliveryTimeValue(order);
  const { latitude, longitude } = order.shippingAddress ?? {};
  const customerName =
    [order.customer?.firstName, order.customer?.lastName]
      .filter(Boolean)
      .join(" ") || order.name;

  return {
    id: order.id,
    orderNumber: order.name,
    customerName,
    address,
    addressKey: address.toLowerCase(),
    coordinates: isPhilippineLngLat(longitude, latitude)
      ? [longitude as number, latitude as number]
      : null,
    deliveryDate: date === "—" ? null : date,
    deliveryTimeSlot: timeSlot === "—" ? null : timeSlot,
    fulfillmentStatus: order.displayFulfillmentStatus,
    popup: buildPopupDetails(order),
  };
}
